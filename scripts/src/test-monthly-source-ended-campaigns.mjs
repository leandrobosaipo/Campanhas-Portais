import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCampaignFilterMetadata } from "./monthly-evidence-contract.mjs";
import { toPublicDriveInventoryStatus } from "../../artifacts/api-server/src/lib/drive-inventory-public.ts";

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
assert.match(
  routeSource,
  /campaign-operations\/evidence-monthly-source[\s\S]*getDriveInventoryStatus\(\)[\s\S]*toPublicDriveInventoryStatus\(inventory\)/,
  "fonte mensal deve informar o snapshot real do Drive usado pelo relatório",
);
const publicInventory = toPublicDriveInventoryStatus({
  snapshotStatus: "fresh",
  snapshotAt: "2026-08-18T09:00:00.000Z",
  snapshotAgeSeconds: 120,
  stale: false,
  itemCount: 470,
  scanId: "internal-scan-id",
  rootFolderId: "internal-folder-id",
  error: "internal database error",
});
assert.deepEqual(publicInventory, {
  snapshotStatus: "fresh",
  snapshotAt: "2026-08-18T09:00:00.000Z",
  snapshotAgeSeconds: 120,
  stale: false,
  itemCount: 470,
});
assert.equal("scanId" in publicInventory, false);
assert.equal("rootFolderId" in publicInventory, false);
assert.equal("error" in publicInventory, false);
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

console.log("monthly source ended campaigns: 18/18 checks passed");
