import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildDailyReconciliationJobs,
  classifyDailyPrintOutcome,
} from "../../ops/shared/daily-operations-policy.mjs";

test("rotina das 17h30 sincroniza a planilha antes de reconciliar publicações", () => {
  const result = buildDailyReconciliationJobs("2026-08-17", "sync-job-d1-id");

  assert.equal(result.sync.kind, "sync-planilha");
  assert.equal(result.reconcile.kind, "campaign-publication-reconcile");
  assert.equal(result.reconcile.payload.dependsOnJobId, "sync-job-d1-id");
  assert.equal(result.sync.payload.idempotencyKey, "daily-sheet-sync:2026-08-17");
});

test("resposta perdida com auditoria completa é recuperada sem abrir incidente", () => {
  const result = classifyDailyPrintOutcome({
    jobId: "daily-2026-08-16",
    childJobId: "print-runner-1",
    audit: { date: "2026-08-16", totalEligible: 21, ok: 21, missing: 0, invalid: 0 },
    transportError: "fetch failed",
  });

  assert.equal(result.status, "recovered");
  assert.equal(result.incident, null);
});

test("audited_best_effort aprovado entra no total ok do contrato agregado", async () => {
  const source = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
  assert.match(source, /item\.status === "ok" \|\| item\.status === "ok_best_effort"/);
  assert.match(source, /bestEffort:/);
});

test("auditoria incompleta abre incidente rastreável com datas e camada", () => {
  const result = classifyDailyPrintOutcome({
    jobId: "daily-2026-08-15",
    childJobId: "print-runner-2",
    audit: {
      date: "2026-08-15",
      totalEligible: 25,
      ok: 22,
      missing: 3,
      invalid: 0,
      missingDates: ["2026-08-15"],
    },
    transportError: "fetch failed",
  });

  assert.equal(result.status, "incident_required");
  assert.equal(result.incident?.layer, "api_or_runner_transport");
  assert.deepEqual(result.incident?.affectedDates, ["2026-08-15"]);
  assert.match(result.incident?.fingerprint ?? "", /daily-2026-08-15/);
});

test("auditoria não pode omitir uma inserção do lote", () => {
  const result = classifyDailyPrintOutcome({
    jobId: "daily-2026-08-17",
    expectedTotal: 2,
    audit: { date: "2026-08-17", totalEligible: 1, ok: 1, missing: 0, invalid: 0 },
    transportError: null,
  });

  assert.equal(result.status, "incident_required");
  assert.equal(result.incident?.layer, "audit");
});

test("falha do checklist é classificada como contrato e não transporte", () => {
  const result = classifyDailyPrintOutcome({
    jobId: "daily-checklist",
    expectedTotal: 1,
    audit: { date: "2026-08-25", totalEligible: 1, ok: 0, missing: 1, invalid: 0 },
    transportError: "capture_audit_failed: checklist_pre_upload_failed: []",
  });
  assert.equal(result.incident?.layer, "api_checklist_contract");
});
