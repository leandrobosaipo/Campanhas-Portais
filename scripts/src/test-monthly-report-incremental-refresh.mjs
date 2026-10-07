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

function loadReportApi(source, requests, options = {}) {
  const sourceFile = ts.createSourceFile("monthly-report.mjs", source, ts.ScriptTarget.Latest, true);
  const functionDeclaration = (name) => sourceFile.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  const apiDeclaration = functionDeclaration("api");
  const waitDeclaration = functionDeclaration("waitForCompactJob");
  const materializeDeclaration = functionDeclaration("materializeCompleteCampaignExports");
  assert.ok(apiDeclaration, "real monthly report api() declaration exists");
  assert.ok(waitDeclaration, "real monthly report waitForCompactJob() declaration exists");
  assert.ok(materializeDeclaration, "real materializeCompleteCampaignExports() caller exists");

  let monthlySourceCall;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "operationsRaw" &&
      node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression)) {
      monthlySourceCall = node.initializer.expression.getText(sourceFile);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(monthlySourceCall, "real evidence-monthly-source call site exists");

  const context = vm.createContext({
    apiBase: options.operationsBase || "https://operations.invalid",
    deliveryApiBase: options.deliveryBase || "https://delivery.invalid",
    process: { env: options.env || {} },
    MONTHLY_REPORT_SOURCE_TIMEOUT_MS: 120_000,
    MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS: 360_000,
    materializeOptionalExports: true,
    competencia: "AGOSTO/2026",
    apiRequestCount: 0,
    apiResponseBytes: 0,
    Buffer,
    Date,
    Math,
    Promise,
    Map,
    console: { warn() {} },
    apiHeaders: () => ({ authorization: "Bearer unit-test-only" }),
    isPartialCampaignExportBatch: () => false,
    fetchWithTimeout: async (url, options, timeoutMs) => {
      requests.push({ url, options, timeoutMs });
      const pathname = new URL(url).pathname;
      let payload = {};
      if (pathname === "/api/campaign-evidence-exports/jobs/batch") {
        const body = JSON.parse(options.body);
        payload = { items: body.campaigns.map(({ piCodigo }) => ({
          piCodigo,
          jobId: `job-${piCodigo}`,
          httpStatus: 202,
          status: "ready_for_runner",
        })) };
        requests.at(-1).parsedBody = body;
      } else if (/^\/api\/campaign-evidence-exports\/jobs\/job-/.test(pathname)) {
        payload = { status: "completed" };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
    },
    hasCompleteEvidenceGroup: (groupItems) => groupItems.length > 0,
    canonicalCommercialPi: (value) => String(value || ""),
    completeCampaignExportGroupKey: (item) => `${item.piCodigo}:${item.competencia}`,
    completeCampaignExportBlocker: () => "",
    buildCampaignEvidenceExportDownloadUrl: (baseUrl, jobId) => `${baseUrl}/api/campaign-evidence-exports/jobs/${jobId}/download`,
    publicJobDownloadUrl: (url) => url,
    targetDate: "2026-08-24",
  });
  new vm.Script([
    apiDeclaration.getText(sourceFile),
    waitDeclaration.getText(sourceFile),
    materializeDeclaration.getText(sourceFile),
    "this.api = api;",
    "this.materializeCompleteCampaignExports = materializeCompleteCampaignExports;",
  ].join("\n")).runInContext(context);
  return { context, monthlySourceCall };
}

const apiRequests = [];
const { context: reportApiContext, monthlySourceCall } = loadReportApi(report, apiRequests);
await new vm.Script(`Promise.resolve(${monthlySourceCall})`).runInContext(reportApiContext);
assert.equal(apiRequests[0].url, "https://delivery.invalid/api/campaign-operations/evidence-monthly-source?date=2026-08-24&competencia=AGOSTO%2F2026");
assert.equal(apiRequests[0].timeoutMs, 120_000, "monthly source uses the long source timeout");
assert.equal(apiRequests[0].options.headers.authorization, "Bearer unit-test-only", "public source request preserves bearer auth");
await reportApiContext.api("/api/ops/daily-print-status", { timeoutMs: 30_000, attempts: 1 });
assert.equal(apiRequests[1].url, "https://delivery.invalid/api/ops/daily-print-status", "default RPCs bypass the legacy bridge");
assert.equal(apiRequests[1].timeoutMs, 30_000);
assert.equal(apiRequests[1].options.headers.authorization, "Bearer unit-test-only");

const batchRequests = [];
const { context: batchContext } = loadReportApi(report, batchRequests);
const campaignItems = ["98101", "98102", "98103"].map((piCodigo, index) => ({
  id: index + 1,
  piCodigo,
  competencia: "AGOSTO/2026",
  requiredDays: ["2026-08-24"],
  evidenceDays: [{ date: "2026-08-24", status: "audited", url: `https://evidence.invalid/${piCodigo}.jpg` }],
}));
const batchResult = await batchContext.materializeCompleteCampaignExports(campaignItems, "2026-08-31");
const batchRequest = batchRequests.find((request) => new URL(request.url).pathname === "/api/campaign-evidence-exports/jobs/batch");
assert.ok(batchRequest, "the real batch caller issues the campaign export request");
assert.equal(batchRequest.url, "https://delivery.invalid/api/campaign-evidence-exports/jobs/batch");
assert.equal(batchRequest.options.method, "POST");
assert.equal(batchRequest.timeoutMs, 360_000);
assert.equal(batchRequest.options.headers.authorization, "Bearer unit-test-only");
assert.deepEqual(batchRequest.parsedBody.campaigns, campaignItems.map(({ piCodigo }) => ({ piCodigo })));
assert.equal(batchRequest.parsedBody.asOfDate, "2026-08-31");
assert.equal(batchRequest.parsedBody.competencia, "AGOSTO/2026");
assert.equal(batchRequest.parsedBody.mode, "prints-only");
assert.equal(batchRequest.parsedBody.variant, "web");
assert.equal(batchRequest.parsedBody.imageMaxWidth, 1600);
assert.equal(batchRequest.parsedBody.imageQuality, 72);
assert.equal(batchResult.urls.size, 3);
for (const item of campaignItems) {
  assert.equal(batchResult.urls.get(`${item.piCodigo}:${item.competencia}`),
    `https://operations.invalid/api/campaign-evidence-exports/jobs/job-${item.piCodigo}/download`,
    "download URLs continue using the operations/public base");
}
const pollRequests = batchRequests.filter((request) => /\/api\/campaign-evidence-exports\/jobs\/job-/.test(new URL(request.url).pathname));
assert.equal(pollRequests.length, 3, "the caller polls every returned child job ID");
assert.ok(pollRequests.every((request) => request.url.startsWith("https://delivery.invalid/")),
  "every child status poll uses the direct RPC base");

const overrideRequests = [];
const { context: envOverrideContext } = loadReportApi(report, overrideRequests, {
  operationsBase: "https://configured-operations.invalid",
  env: { ADOPS_PUBLIC_API_BASE_URL: "https://configured-operations.invalid" },
});
await envOverrideContext.api("/api/ops/daily-print-status", { attempts: 1 });
assert.equal(overrideRequests[0].url, "https://configured-operations.invalid/api/ops/daily-print-status",
  "an explicit ADOPS_PUBLIC_API_BASE_URL remains the default RPC base");
await envOverrideContext.api("/api/ops/daily-print-status", { baseUrl: "https://per-call.invalid", attempts: 1 });
assert.equal(overrideRequests[1].url, "https://per-call.invalid/api/ops/daily-print-status",
  "an explicit per-call baseUrl takes precedence");

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

console.log("monthly report incremental refresh: monthly source/batch/poll routing, explicit overrides, 26 source checks and 20 watchdog-age cases passed");
