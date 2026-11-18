import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  decideAuditChecklistApproval,
  resolveChecklistCaptureWindowAt,
  resolveChecklistEditorialCaptureClass,
  requiresHistoricalEditorialChecklist,
  validatePerrengueRetroEditorialChecklistGate,
} from "../../artifacts/api-server/src/lib/audit-checklist.ts";

test("caso de produção #2713 aprova o pré-upload mecânico enquanto aguarda proveniência", () => {
  const result = decideAuditChecklistApproval({
    phase: "pre_upload",
    contractOk: true,
    metadataPresent: true,
    auditOk: false,
    blockingIssues: [],
  });

  assert.equal(result.approved, true);
  assert.deepEqual(result.blockingIssues, []);
});

test("auditoria final continua fechada quando a proveniência ainda não está aprovada", () => {
  const result = decideAuditChecklistApproval({
    phase: "final",
    contractOk: true,
    metadataPresent: true,
    auditOk: false,
    blockingIssues: [],
  });

  assert.equal(result.approved, false);
  assert.equal(result.blockingIssues[0]?.code, "audit_not_approved");
});

test("resultado reprovado nunca fica sem motivo estruturado", () => {
  const result = decideAuditChecklistApproval({
    phase: "pre_upload",
    contractOk: false,
    metadataPresent: true,
    auditOk: false,
    blockingIssues: [],
  });

  assert.equal(result.approved, false);
  assert.equal(result.blockingIssues.length, 1);
  assert.equal(result.blockingIssues[0]?.code, "checklist_decision_inconsistent");
});

test("captura do dia usa capturedAt correlacionado, não o requestedCaptureAt vazio", () => {
  const now = new Date("2026-10-10T23:00:00.000Z");
  const audit = {
    captureClass: "same_day_retry",
    targetDate: "2026-10-10",
    capturedAt: "2026-10-10T22:39:00.000Z",
    requestedCaptureAt: null,
  } as const;
  assert.equal(resolveChecklistCaptureWindowAt(audit, "2026-10-10", now), audit.capturedAt);
  assert.equal(resolveChecklistCaptureWindowAt(audit, "2026-10-09", now), null);
  assert.equal(resolveChecklistCaptureWindowAt({ ...audit, capturedAt: "2026-10-11T22:39:00.000Z" }, "2026-10-10", now), null);
  assert.equal(resolveChecklistCaptureWindowAt({ ...audit, capturedAt: "2026-10-10T22:39:00.000Z" }, "2026-10-10", new Date("2026-10-10T22:38:00.000Z")), null);
});

test("recuperação histórica continua usando horário solicitado e mantém o gate retroativo", () => {
  const audit = {
    captureClass: "historical_recovery",
    targetDate: "2026-10-09",
    capturedAt: "2026-10-10T22:39:00.000Z",
    requestedCaptureAt: "2026-10-09T19:00:00-04:00",
  } as const;
  assert.equal(resolveChecklistCaptureWindowAt(audit, "2026-10-09"), audit.requestedCaptureAt);
  assert.equal(resolveChecklistCaptureWindowAt({ ...audit, requestedCaptureAt: null }, "2026-10-09"), null);
});

test("checklist exige auditoria editorial de home só para recuperação histórica", () => {
  for (const captureClass of ["scheduled", "same_day_retry"]) {
    assert.deepEqual(validatePerrengueRetroEditorialChecklistGate({
      captureClass, siteSigla: "PERRENGUE", page: "home", retroGate: null,
    }), []);
  }
  assert.deepEqual(validatePerrengueRetroEditorialChecklistGate({
    captureClass: "historical_recovery", siteSigla: "PERRENGUE", page: "home", retroGate: null,
  }).map(({ code }) => code), ["retro_editorial_audit_missing"]);
  assert.deepEqual(validatePerrengueRetroEditorialChecklistGate({
    captureClass: "historical_recovery", siteSigla: "PERRENGUE", page: "home",
    retroGate: { editorialContentMatches: true, editorialMemeLeaks: [] },
  }), []);
});

test("gates de datas editoriais só são históricos com classe confiável ou recebimento anterior", () => {
  const now = new Date("2026-10-10T23:00:00.000Z");
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: "scheduled", phase: "final", targetDate: "2026-10-10", now,
  }), false);
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: "same_day_retry", phase: "final", targetDate: "2026-10-10", now,
  }), false);
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: "historical_recovery", phase: "final", targetDate: "2026-10-10", now,
  }), true);
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: null, phase: "pre_upload", targetDate: "2026-10-09",
    preUploadReceivedAt: new Date("2026-10-10T22:39:00.000Z"), now,
  }), true);
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: null, phase: "pre_upload", targetDate: "2026-10-10",
    preUploadReceivedAt: new Date("2026-10-10T22:39:00.000Z"), now,
  }), false);
  assert.equal(requiresHistoricalEditorialChecklist({
    trustedCaptureClass: null, phase: "final", targetDate: "2026-10-09", now,
  }), true);
});

test("pre_upload usa apenas o recebimento do servidor para a janela e mantém provenance do cliente removida", async () => {
  const receivedAt = new Date("2026-10-10T22:39:00.000Z");
  const now = new Date("2026-10-10T22:40:00.000Z");
  assert.equal(resolveChecklistCaptureWindowAt(null, "2026-10-10", now, receivedAt), receivedAt.toISOString());
  assert.equal(resolveChecklistCaptureWindowAt(null, "2026-10-09", now, receivedAt), null);
  assert.equal(resolveChecklistCaptureWindowAt(null, "2026-10-10", new Date("2026-10-10T22:38:00.000Z"), receivedAt), null);
  assert.equal(resolveChecklistEditorialCaptureClass({
    trustedCaptureClass: null, phase: "pre_upload", targetDate: "2026-10-09", preUploadReceivedAt: receivedAt,
  }), "historical_recovery");
  assert.equal(resolveChecklistEditorialCaptureClass({
    trustedCaptureClass: null, phase: "pre_upload", targetDate: "2026-10-10", preUploadReceivedAt: receivedAt,
  }), null);
  assert.equal(resolveChecklistEditorialCaptureClass({
    trustedCaptureClass: null, phase: "final", targetDate: "2026-10-09", preUploadReceivedAt: receivedAt,
  }), null);

  const route = await readFile(new URL("../../artifacts/api-server/src/routes/audit-checklists.ts", import.meta.url), "utf8");
  assert.match(route, /preUploadReceivedAt:\s*req\.body\?\.phase === "pre_upload" \? receivedAt : undefined/);
  const sanitize = route.slice(route.indexOf('if (req.body?.phase === "pre_upload"'), route.indexOf("let validation = await validateAuditChecklist"));
  assert.match(sanitize, /delete item\[key\]/);
  for (const field of ["captureClass", "targetDate", "sourceJobId", "capturedAt", "auditPolicyVersion", "evidenceUrl", "reconstruction"]) {
    assert.match(sanitize, new RegExp(`\\"${field}\\"`));
  }
});
