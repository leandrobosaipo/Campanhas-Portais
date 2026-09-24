import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  indexToColumnLabel,
  resolveCurrentSheetCampaignRowMetadata,
  extractPiDigits,
  loadCurrentSheetCampaigns,
} from "../../artifacts/api-server/src/lib/current-sheet-campaigns.ts";

assert.equal(extractPiDigits("PI 0000 - AGUAS CBA"), "0000", "PI 0000 deve preservar os zeros");
assert.equal(extractPiDigits("PI 91493 - OBRAS"), "91493", "PI numérica deve permanecer estável");

const baseHeaders = ["AGENCIA", "PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS"];
const metadata = resolveCurrentSheetCampaignRowMetadata({
  rowNumber: 10,
  headerRowNumber: 2,
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
  headerRowNumber: 2,
  blockStart: 25,
  headers: ["X", "PECA", "CAMPANHA", "PERIODO", "LOCAL"],
});
assert.equal(wideMetadata.piCodigo.a1, "AA4", "A1 deve suportar colunas além de Z");

assert.throws(
  () =>
    resolveCurrentSheetCampaignRowMetadata({
      rowNumber: 4,
      headerRowNumber: 2,
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
      headerRowNumber: 2,
      blockStart: 0,
      headers: ["PECA", "CAMPANHA", "PERIODO"],
    }),
  /Campo obrigatório não encontrado/,
  "deve falhar em caso de cabeçalho ausente",
);

const worksheet = XLSX.utils.aoa_to_sheet([]);
XLSX.utils.sheet_add_aoa(worksheet, [["OMT", "", "", "", "", "", "AFL"]], { origin: "C3" });
XLSX.utils.sheet_add_aoa(worksheet, [["PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS", "", "PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS"]], { origin: "C4" });
XLSX.utils.sheet_add_aoa(worksheet, [["ativo", "DENGUE", "01/09-15/09", "MEGABANNER TOPO", "ativo", "", "PI 3219 - SANEAR", "INAUGURACAO", "13/09-15/09", "MEGABANNER TOPO", "ativo"]], { origin: "C7" });
worksheet["!ref"] = "C3:M7";
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "SETEMBRO 2026");
const exportUrl = `data:application/octet-stream;base64,${XLSX.write(workbook, { type: "base64", bookType: "xlsx" })}`;
const parsed = await loadCurrentSheetCampaigns({ date: "2026-09-14", exportUrl });
assert.equal(parsed.rows.length, 2);
assert.deepEqual(parsed.rows.map(row => [row.blockSite, row.rowNumber, row.cellMetadata?.piCodigo.a1]), [["OMT", 7, "C7"], ["AFL", 7, "I7"]]);
assert.equal(parsed.rows[0]?.cellMetadata?.piCodigo.headerA1, "C4");
console.log("ok: physical rows, block identity, headers and non-A1 worksheet range");
