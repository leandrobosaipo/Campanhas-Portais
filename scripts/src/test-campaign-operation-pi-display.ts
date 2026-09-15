import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
for (const value of ["ativo", "publicado", "", " "]) {
  assert.equal(resolveDisplayPi(value, null).canonicalPiCodigo, null);
  assert.equal(resolveDisplayPi(value, "PI 42059 - GOV").piCodigo, "PI 42059 - GOV");
}
const operations = readFileSync(new URL("../../artifacts/api-server/src/lib/campaign-operations.ts", import.meta.url), "utf8");
const suggested = operations.slice(operations.indexOf("function suggestedJobs("), operations.indexOf("export async function getActiveCampaignOperations"));
assert.match(suggested, /piCodigo: pi\.canonicalPiCodigo/);
assert.doesNotMatch(suggested, /piCodigo: row\.piCodigo/);
const sync = readFileSync(new URL("./sync-planilha-latest.ts", import.meta.url), "utf8");
assert.ok(sync.indexOf('type: "blocked_invalid_pi"') < sync.indexOf('const siteId = await ensureSite(row.siteSigla)'));
console.log("ok");
