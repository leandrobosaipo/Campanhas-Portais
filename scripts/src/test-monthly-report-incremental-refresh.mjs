import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

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
assert.match(report, /await writeFile\(outputPath, renderDynamicEvidenceReport\(\), "utf8"\)/);
assert.match(report, /await writeFile\(snapshotPath, html, "utf8"\)/);
assert.match(report, /group\.items\.every\(\(item\) => item\.batchDownloadUrl === reusableUrl\)/);
assert.match(report, /group\.items\.every\(\(item\) => item\.completeCampaignDownloadUrl === reusableUrl\)/);
assert.match(report, /buildPiSiteExportDownloadUrl\(apiBase, created\.jobId\)/);
assert.match(report, /buildCampaignEvidenceExportDownloadUrl\(apiBase, created\.jobId\)/);
assert.doesNotMatch(report, /buildPiSiteExportDownloadUrl\(deliveryApiBase, created\.jobId\)/);
assert.match(report, /results\.set\(group\.key, publicJobDownloadUrl\(reusableUrl\)\)/);
assert.match(report, /data\.json\?v=\$\{Date\.now\(\)\}/);
const previousSnapshotIndex = report.indexOf("const previousPublicData = await readPreviousPublicData();");
const reuseDownloadsIndex = report.indexOf("enriched = refreshMode === \"incremental\" ? reuseMonthlyDownloadUrls(enriched, previousPublicData) : enriched;");
const materializeExportsIndex = report.indexOf("const exportLinks = await materializeCampaignExports(commercialItems, monthEndForEvidence);");
assert.ok(previousSnapshotIndex >= 0 && previousSnapshotIndex < reuseDownloadsIndex);
assert.ok(reuseDownloadsIndex >= 0 && reuseDownloadsIndex < materializeExportsIndex);

function loadAgeFunction(source, names) {
  const sourceFile = ts.createSourceFile("ops-source.ts", source, ts.ScriptTarget.Latest, true);
  const wanted = new Set(names);
  const declarations = sourceFile.statements.filter((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name && wanted.has(statement.name.text),
  );
  assert.equal(declarations.length, names.length, `expected ${names.join(", ")} declarations`);
  const javascript = ts.transpileModule(declarations.map((node) => node.getText(sourceFile)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = vm.createContext({ Date });
  new vm.Script(javascript).runInContext(context);
  return context.getJobAgeMs;
}

const watchdogSources = [
  ["API", await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8"), ["parseDateMs", "parseJson", "getJobAgeMs"]],
  ["Worker", worker, ["parseDateMs", "parseJsonSafe", "getJobAgeMs"]],
];
const testNow = Date.parse("2026-10-07T12:15:00.000Z");
const job = (overrides = {}) => ({
  status: "queued",
  created_at: "2026-10-07T11:58:00.000Z",
  updated_at: "2026-10-07T11:58:00.000Z",
  payload_json: JSON.stringify({ notBefore: "2026-10-07T12:13:00.000Z" }),
  ...overrides,
});

for (const [label, source, helpers] of watchdogSources) {
  const getJobAgeMs = loadAgeFunction(source, helpers);
  assert.equal(getJobAgeMs(job(), testNow), 2 * 60_000, `${label}: queued age starts at notBefore`);
  assert.equal(getJobAgeMs(job({ status: "ready_for_runner" }), testNow), 2 * 60_000, `${label}: ready age starts at notBefore`);
  assert.equal(getJobAgeMs(job({ payload_json: JSON.stringify({ notBefore: "2026-10-07T12:30:00.000Z" }) }), testNow), 0, `${label}: future notBefore is not stale`);
  assert.equal(getJobAgeMs(job({ status: "running" }), testNow), 17 * 60_000, `${label}: running age remains based on updated_at`);
  assert.equal(getJobAgeMs(job({ payload_json: "{" }), testNow), 17 * 60_000, `${label}: malformed payload preserves old age`);
  assert.equal(getJobAgeMs(job({ payload_json: JSON.stringify({ notBefore: "not-a-date" }) }), testNow), 17 * 60_000, `${label}: malformed notBefore preserves old age`);
  assert.equal(getJobAgeMs(job({ payload_json: "{}" }), testNow), 17 * 60_000, `${label}: absent notBefore preserves old age`);
  assert.equal(getJobAgeMs(job({ updated_at: "2026-10-07T12:14:00.000Z" }), testNow), 60_000, `${label}: newer update wins over notBefore`);
  assert.equal(getJobAgeMs(job({ payload_json: JSON.stringify({ notBefore: "2026-10-07T12:00:00.000Z" }) }), Date.parse("2026-10-07T12:16:01.000Z")), 16 * 60_000 + 1_000, `${label}: elapsed due time accrues age`);
  assert.equal(getJobAgeMs(job({ updated_at: null, created_at: null, payload_json: "{}" }), testNow), 0, `${label}: absent timestamps remain safe`);
}

console.log("monthly report incremental refresh: 26 source checks + 20 watchdog-age cases passed");
