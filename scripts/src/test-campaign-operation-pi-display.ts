import assert from "node:assert/strict";
import { resolveDisplayPi } from "../../artifacts/api-server/src/lib/pi-display.ts";

assert.deepEqual(resolveDisplayPi("PI 42059 - GOV", "PI 99999 - GOV"), {
  piCodigo: "PI 42059 - GOV",
  rawPiCodigo: "PI 42059 - GOV",
  canonicalPiCodigo: "PI 42059 - GOV",
  decision: "sheet",
});
assert.deepEqual(resolveDisplayPi("ativo", "PI 42059 - GOV"), {
  piCodigo: "PI 42059 - GOV",
  rawPiCodigo: "ativo",
  canonicalPiCodigo: "PI 42059 - GOV",
  decision: "adops_fallback",
});
assert.equal(resolveDisplayPi("ativo", null).piCodigo, "PI pendente");
console.log("ok");
