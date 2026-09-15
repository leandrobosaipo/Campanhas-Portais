import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { canonicalCommercialPi } from "./monthly-evidence-contract.mjs";
import {
  completeCampaignExportGroupKey,
  completeExportGroupKeys,
  portalExportGroupKey,
  hasCompleteEvidenceGroup,
  isPartialCampaignExportBatch,
  completeCampaignExportBlocker,
  validateCompleteCampaignExportLinks,
} from "./monthly-report-export-eligibility.mjs";

const item = (id, { piCodigo = "PI 3218", siteSigla = "ROO", competencia = "SETEMBRO/2026", requiredDays = ["2026-09-12"], evidenceDays = requiredDays.map((date) => ({ date, status: "audited", url: `https://proof.example/${id}/${date}.jpg` })) } = {}) => ({ id, piCodigo, siteSigla, competencia, requiredDays, evidenceDays });
const completeVideo = item(3017);
const incompleteMega = item(3018, {
  requiredDays: ["2026-09-12", "2026-09-13"],
  evidenceDays: [{ date: "2026-09-12", status: "audited", url: "https://proof.example/3018/12.jpg" }],
});

assert.equal(portalExportGroupKey(completeVideo), portalExportGroupKey(incompleteMega));
assert.equal(completeExportGroupKeys([completeVideo, incompleteMega], portalExportGroupKey).size, 0);
assert.equal(completeExportGroupKeys([completeVideo, incompleteMega], completeCampaignExportGroupKey).size, 0);

const completeMega = item(3018, { requiredDays: ["2026-09-12", "2026-09-13"] });
assert.deepEqual([...completeExportGroupKeys([completeVideo, completeMega], portalExportGroupKey)], [portalExportGroupKey(completeVideo)]);
assert.deepEqual([...completeExportGroupKeys([completeVideo, completeMega], completeCampaignExportGroupKey)], [completeCampaignExportGroupKey(completeVideo)]);
console.log("ok: monthly ZIP eligibility is complete only at its export scope");

const blocked = { piCodigo: "3217", competencia: "2026-09", httpStatus: 409, error: "campaign_evidence_incomplete",
  readiness: { ready: false, operationalBlockers: [{ insertionId: 3021, reason: "not_published" }, { insertionId: 3021, reason: "missing_media" }] } };
const accepted = [{ piCodigo: "41985", httpStatus: 200, jobId: "cached", status: "completed" },
  { piCodigo: "42061", httpStatus: 202, jobId: "queued", status: "ready_for_runner" }];
const batch = { items: [blocked, ...accepted] };
const batchPath = "/api/campaign-evidence-exports/jobs/batch";
assert.equal(isPartialCampaignExportBatch(batchPath, 409, batch), true);
for (const status of [401, 403, 500]) assert.equal(isPartialCampaignExportBatch(batchPath, status, batch), false);
assert.equal(isPartialCampaignExportBatch("/api/other", 409, batch), false);
for (const payload of [{}, { items: [] }, { items: [{}] }, { items: [blocked, blocked] }]) assert.equal(isPartialCampaignExportBatch(batchPath, 409, payload), false);
const group = { piCodigo: "3217", competencia: "SETEMBRO/2026" };
const reason = completeCampaignExportBlocker(blocked, group);
assert.match(reason, /3021 sem publicação.*3021 sem mídia/);
assert.equal(completeCampaignExportBlocker(blocked, { ...group, piCodigo: "999" }), "");
assert.equal(completeCampaignExportBlocker(blocked, { ...group, competencia: "AGOSTO/2026" }), "");
assert.equal(completeCampaignExportBlocker({ ...blocked, readiness: { ready: false } }, group), "");
assert.equal(completeCampaignExportBlocker({ ...blocked, httpStatus: 500 }, group), "");

// Execute the actual materializer without starting main() or contacting production.
const source = await readFile(new URL("./build-current-month-evidence-report.mjs", import.meta.url), "utf8");
const functionSource = source.slice(source.indexOf("async function materializeCompleteCampaignExports("), source.indexOf("async function validateDeliveryUrl("));
const waited = [];
const materialize = vm.runInNewContext(`(${functionSource})`, {
  Map, Promise, String, Number, console, canonicalCommercialPi, completeCampaignExportGroupKey,
  hasCompleteEvidenceGroup, completeCampaignExportBlocker, materializeOptionalExports: true,
  publicJobDownloadUrl: (url) => url, competencia: "SETEMBRO/2026", apiBase: "https://api.example",
  MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS: 1000,
  api: async (pathname) => { assert.equal(pathname, batchPath); return batch; },
  waitForCompactJob: async (jobId) => { waited.push(jobId); return { status: "completed" }; },
  buildCampaignEvidenceExportDownloadUrl: (base, id) => `${base}/${id}.zip`,
});
const future = item(3021, { piCodigo: "3217", requiredDays: [], evidenceDays: [] });
const rows = [item(3020, { piCodigo: "3217" }), future, item(3005, { piCodigo: "41985" }), item(2979, { piCodigo: "42061" })];
const result = await materialize(rows, "2026-09-12");
assert.equal(result.urls.size, 2);
assert.equal(result.blockers.size, 1);
assert.deepEqual(waited, ["queued"]);
for (const row of rows) {
  const key = completeCampaignExportGroupKey(row);
  row.completeCampaignDownloadUrl = result.urls.get(key) || "";
  row.commercialExportBlocker = result.blockers.get(key) || "";
  row.completeCampaignExportStatus = row.commercialExportBlocker ? "blocked" : "ready";
}
assert.doesNotThrow(() => validateCompleteCampaignExportLinks(rows));
assert.throws(() => validateCompleteCampaignExportLinks([{ ...rows[2], completeCampaignDownloadUrl: "" }]), /sem ZIP completo/);
assert.throws(() => validateCompleteCampaignExportLinks([{ ...rows[0], completeCampaignDownloadUrl: "https://old.example/stale.zip" }]), /inconsistente/);
assert.throws(() => validateCompleteCampaignExportLinks([{ ...rows[0], commercialExportBlocker: "" }]), /inconsistente/);
console.log("ok: partial batch preserves accepted jobs and exposes only scoped API blockers");
