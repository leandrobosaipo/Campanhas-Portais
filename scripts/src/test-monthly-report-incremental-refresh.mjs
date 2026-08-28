import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
const report = await readFile(new URL("./build-current-month-evidence-report.mjs", import.meta.url), "utf8");

assert.match(worker, /monthly_report_refreshes/);
assert.match(worker, /debounceSeconds: 60/);
assert.match(worker, /dirty_revision = monthly_report_refreshes\.dirty_revision \+ 1/);
assert.match(worker, /active_job_id/);
assert.match(worker, /json_extract\(ops_jobs\.payload_json, '\$\.notBefore'\)/);
assert.match(worker, /settleMonthlyReportRefresh/);
assert.match(runner, /markMonthlyReportRefreshAfterApproval/);
assert.match(runner, /ADOPS_REPORT_SKIP_EXPORTS: "0"/);
assert.match(runner, /ADOPS_REPORT_REFRESH_REVISION/);
assert.doesNotMatch(runner, /ADOPS_PUBLIC_API_BASE_URL: OPS_API_BASE_URL/);
assert.match(report, /ADOPS_REPORT_REFRESH_MODE/);
assert.match(report, /sincronização automática/);
assert.match(report, /refreshRevision/);
assert.match(report, /readPreviousPublicData/);
assert.match(report, /reuseMonthlyDownloadUrls/);
assert.match(report, /group\.items\.every\(\(item\) => item\.batchDownloadUrl === reusableUrl\)/);
assert.match(report, /group\.items\.every\(\(item\) => item\.completeCampaignDownloadUrl === reusableUrl\)/);
assert.match(report, /data\.json\?v=\$\{Date\.now\(\)\}/);
const previousSnapshotIndex = report.indexOf("const previousPublicData = refreshMode === \"incremental\" ? await readPreviousPublicData() : null;");
const reuseDownloadsIndex = report.indexOf("enriched = refreshMode === \"incremental\" ? reuseMonthlyDownloadUrls(enriched, previousPublicData) : enriched;");
const materializeExportsIndex = report.indexOf("const exportLinks = await materializeCampaignExports(enriched, monthEndForEvidence);");
assert.ok(previousSnapshotIndex >= 0 && previousSnapshotIndex < reuseDownloadsIndex);
assert.ok(reuseDownloadsIndex >= 0 && reuseDownloadsIndex < materializeExportsIndex);

console.log("monthly report incremental refresh: 20/20 checks passed");
