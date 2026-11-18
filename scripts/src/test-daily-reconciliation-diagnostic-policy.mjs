import assert from "node:assert/strict";
import test from "node:test";
import { classifyDailyReconciliationOperation } from "../../ops/shared/daily-operations-policy.mjs";

test("diagnóstico diário separa campanha ausente, rascunho, pronta, ativa e bloqueada", () => {
  const common = { piCodigo: "9750", siteSigla: "AFL", campaignName: "Teste" };
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "needs_create_in_adops" }).status, "missing_in_adops");
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "needs_publication", adops: { insertionId: 1, mediaUrl: null } }).status, "draft");
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "needs_publication", adops: { insertionId: 1, mediaUrl: "https://cdn.example/banner.gif" } }).status, "ready_for_publication");
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "needs_evidence", adops: { insertionId: 1, bannerPublicadoNoSite: true, publicConfirmation: "reported_only", mediaUrl: "https://cdn.example/banner.gif" } }).status, "reported_published");
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "needs_evidence", adops: { insertionId: 1, bannerPublicadoNoSite: true, publicConfirmation: "confirmed", mediaUrl: "https://cdn.example/banner.gif" } }).status, "public_confirmed");
  assert.equal(classifyDailyReconciliationOperation({ ...common, status: "source_conflict", blockingIssues: ["PDF diverge"] }).status, "blocked");
});
