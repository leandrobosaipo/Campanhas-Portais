import assert from "node:assert/strict";
import test from "node:test";
import { decideAuditChecklistApproval } from "../../artifacts/api-server/src/lib/audit-checklist.ts";

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
