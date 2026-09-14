import assert from "node:assert/strict";
import {
  indexToColumnLabel,
  resolveCurrentSheetCampaignRowMetadata,
} from "../../artifacts/api-server/src/lib/current-sheet-campaigns.ts";

const baseHeaders = ["AGENCIA", "PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS"];
const metadata = resolveCurrentSheetCampaignRowMetadata({
  rowNumber: 10,
  blockStart: 0,
  headers: baseHeaders,
});

assert.equal(metadata.piCodigo.a1, "B10", "A1 da PI deve vir de PECA");
assert.equal(metadata.campaignName.a1, "C10", "A1 do nome da campanha deve vir de CAMPANHA");
assert.equal(metadata.periodoOriginal.a1, "D10", "A1 do período original deve vir de PERIODO");
assert.equal(metadata.localFormato.a1, "E10", "A1 do formato deve vir de LOCAL");

assert.equal(indexToColumnLabel(0), "A", "coluna 0 deve ser A");
assert.equal(indexToColumnLabel(25), "Z", "coluna 25 deve ser Z");
assert.equal(indexToColumnLabel(26), "AA", "coluna 26 deve ser AA");
assert.equal(indexToColumnLabel(27), "AB", "coluna 27 deve ser AB");

const wideMetadata = resolveCurrentSheetCampaignRowMetadata({
  rowNumber: 4,
  blockStart: 25,
  headers: ["X", "PECA", "CAMPANHA", "PERIODO", "LOCAL"],
});
assert.equal(wideMetadata.piCodigo.a1, "AA4", "A1 deve suportar colunas além de Z");

assert.throws(
  () =>
    resolveCurrentSheetCampaignRowMetadata({
      rowNumber: 4,
      blockStart: 0,
      headers: ["PECA", "PECA DUPL", "CAMPANHA", "PERIODO", "LOCAL"],
    }),
  /Campo ambíguo no cabeçalho/,
  "deve falhar em caso de cabeçalho ambíguo",
);

assert.throws(
  () =>
    resolveCurrentSheetCampaignRowMetadata({
      rowNumber: 4,
      blockStart: 0,
      headers: ["PECA", "CAMPANHA", "PERIODO"],
    }),
  /Campo obrigatório não encontrado/,
  "deve falhar em caso de cabeçalho ausente",
);

console.log("ok");
