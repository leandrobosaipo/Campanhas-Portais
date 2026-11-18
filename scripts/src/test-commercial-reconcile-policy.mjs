import assert from "node:assert/strict";
import test from "node:test";
import { planCommercialReconciliation } from "../../ops/cloudflare-remote-runner/src/commercial-reconcile-policy.mjs";

const row = {
  sourceSheet: "OUTUBRO26", siteSigla: "AFL", inicio: "2026-10-09", fim: "2026-10-31",
  localFormatoNormalizado: "INTERNO DE NOTICIAS", campanha: "ENTREGAS", piCodigo: "91703",
  competenciaResolved: "OUTUBRO/2026", agencyNameHint: "DMD", valorLiquidoHint: "7200.00",
};
const insertion = {
  insertionId: 3082, campaignId: 1066, siteSigla: "AFL", periodoInicio: "2026-10-09", periodoFim: "2026-10-31",
  localFormatoNormalizado: "INTERNO DE NOTICIAS", campaignName: "ENTREGAS", piCodigo: "91703",
  mediaUrl: "https://example.test/banner.gif", competencia: null, agenciaId: null, clienteId: null, valorLiquido: null,
  planilhaRef: null, updatedAt: "2026-10-09T22:00:00.000Z",
};
const source = { complete: true, inventoryComplete: true, sourceSha256: "a".repeat(64), rows: [row], insertions: [insertion], agencies: [{ id: 76, nome: "DMD" }] };

test("fonte única com PI, posição, datas e mídia gera só preenchimentos vazios", () => {
  const plan = planCommercialReconciliation(source);
  assert.equal(plan.complete, true);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].fields.agenciaId, 76);
  assert.equal(plan.actions[0].fields.competencia, "OUTUBRO/2026");
  assert.equal(plan.actions[0].fields.valorLiquido, 7200);
  assert.equal(plan.actions[0].fields.piCodigo, undefined);
  assert.ok(plan.pendingReview.some((item) => item.reason === "client_source_is_inferred"));
});

test("PI ausente, fonte ambígua, mídia ausente ou fonte incompleta não aplicam", () => {
  const noPi = planCommercialReconciliation({ ...source, insertions: [{ ...insertion, piCodigo: null }] });
  assert.equal(noPi.actions.length, 0);
  assert.equal(noPi.pendingReview[0].candidates[0].piCodigo, "91703");
  assert.equal(planCommercialReconciliation({ ...source, rows: [row, row] }).actions.length, 0);
  assert.equal(planCommercialReconciliation({ ...source, insertions: [{ ...insertion, mediaUrl: null }] }).actions.length, 0);
  const missing = planCommercialReconciliation({ ...source, complete: false });
  assert.equal(missing.complete, false);
  assert.equal(missing.status, "source_unavailable");
});

test("hash novo da planilha preserva referência antiga e permite preencher agência vazia", () => {
  const next = planCommercialReconciliation({
    ...source, sourceSha256: "b".repeat(64),
    insertions: [{ ...insertion, planilhaRef: "OUTUBRO/2026", competencia: "OUTUBRO/2026" }],
  });
  assert.equal(next.actions.length, 1);
  assert.equal(next.actions[0].fields.agenciaId, 76);
  assert.equal(next.actions[0].fields.planilhaRef, undefined);
  assert.match(next.actions[0].sourceRef, /b{64}/);
});
