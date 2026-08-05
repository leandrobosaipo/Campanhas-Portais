import assert from "node:assert/strict";
import test from "node:test";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const {
  fulfillmentPlacementKey,
  selectFulfillmentOperations,
  fulfillmentSourceProofs,
} = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

test("normaliza posição comercial antes de selecionar a operação", () => {
  assert.equal(fulfillmentPlacementKey("Megabanner Home 1"), "home_1");
  assert.equal(fulfillmentPlacementKey("Banner Capa 01"), "home_1");
  assert.equal(fulfillmentPlacementKey("Mega Banner Topo"), "top");
});

test("seleciona somente PI, portal e posição pedidos sem duplicar", () => {
  const payload = {
    items: [
      { piCodigo: null, siteSigla: "ROO", format: { normalized: "MEGABANNER HOME 1" } },
      { piCodigo: "090729", siteSigla: "ROO", format: { normalized: "MEGABANNER HOME 1" } },
      { piCodigo: "90729", siteSigla: "ROO", format: { normalized: "MEGABANNER TOPO" } },
      { piCodigo: "90729", siteSigla: "AFL", format: { normalized: "MEGABANNER HOME 1" } },
    ],
  };
  const selected = selectFulfillmentOperations(payload, "90729", "ROO", "HOME 1");
  assert.equal(selected.length, 1);
  assert.equal(selected[0].siteSigla, "ROO");
});

test("dossiê preserva fonte da planilha e PDF da agência", () => {
  const proofs = fulfillmentSourceProofs([{
    piCodigo: "90729",
    siteSigla: "ROO",
    sheetSource: { sheetName: "JULHO", blockSite: "ROO", rowNumber: 27 },
    period: { start: "2026-07-01", end: "2026-07-31" },
    format: { normalized: "MEGABANNER TOPO" },
    drive: { pdfFiles: [{ id: "pdf-1", name: "PI 90729.pdf", webViewLink: "https://drive.google.com/file/d/pdf-1/view" }] },
  }]);
  assert.equal(proofs.agencyOrderPdfs.length, 1);
  assert.equal(proofs.sheetRows[0].rowNumber, 27);
});
