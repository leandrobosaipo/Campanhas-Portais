import assert from "node:assert/strict";
import { executeSheetCorrection, validateSheetCorrectionPayload } from "../../ops/cloudflare-remote-runner/src/sheet-correction.mjs";

const valid = validateSheetCorrectionPayload({
  sheetName: "SETEMBRO 2026",
  rowNumber: 42,
  changes: [{ field: "piCodigo", cell: "B42", expectedValue: "ativo", value: "PI 42059 - GOV" }],
});
assert.equal(valid.changes[0].range, "'SETEMBRO 2026'!B42");

assert.throws(() => validateSheetCorrectionPayload({
  sheetName: "SETEMBRO 2026",
  rowNumber: 42,
  changes: [{ field: "piCodigo", cell: "B41", expectedValue: "ativo", value: "PI 42059 - GOV" }],
}), /não pertence/);

await assert.rejects(
  () => executeSheetCorrection({
    sheetName: "SETEMBRO 2026",
    rowNumber: 42,
    changes: [{ field: "piCodigo", cell: "B42", expectedValue: "ativo", value: "PI 42059 - GOV" }],
  }, { env: {} }),
  /GOOGLE_SHEETS_CREDENTIALS_MISSING/,
);

console.log("ok");
