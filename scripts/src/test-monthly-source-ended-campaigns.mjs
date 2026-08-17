import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCampaignFilterMetadata } from "./monthly-evidence-contract.mjs";

const sheetSource = await readFile(new URL("../../artifacts/api-server/src/lib/current-sheet-campaigns.ts", import.meta.url), "utf8");
const operationsSource = await readFile(new URL("../../artifacts/api-server/src/lib/campaign-operations.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
const reportSource = await readFile(new URL("./build-current-month-evidence-report.mjs", import.meta.url), "utf8");

assert.match(sheetSource, /scope\?: "daily" \| "monthly"/);
assert.match(sheetSource, /parsedPeriod\.inicio <= targetMonthEnd && parsedPeriod\.fim >= targetMonthStart/);
assert.match(sheetSource, /sourceSha256/);
assert.match(operationsSource, /sheetScope\?: "daily" \| "monthly"/);
assert.match(routeSource, /sheetScope: "monthly"/);
assert.equal((routeSource.match(/sheetScope: "monthly"/g) || []).length, 2, "fonte mensal e ZIP completo devem preservar campanhas encerradas");
assert.match(routeSource, /competencia_divergente/);
assert.doesNotMatch(reportSource, /item\.periodoFim >= targetDate \|\| activeStatuses/);

const metadata = buildCampaignFilterMetadata({ items: [{
  periodoInicio: "2026-08-01",
  periodoFim: "2026-08-15",
  bannerPublicadoNoSite: true,
  requiredDays: ["2026-08-15"],
  auditedDays: 1,
  missingDates: [],
  invalidDates: [],
}] }, "2026-08-17");
assert.match(metadata.publicationStates, /\bended\b/);
assert.match(metadata.evidenceStates, /\bcomplete\b/);
assert.match(reportSource, /campaign\.id/);
assert.match(reportSource, /item\.campanhaId, item\.id/);

console.log("monthly source ended campaigns: 13/13 checks passed");
