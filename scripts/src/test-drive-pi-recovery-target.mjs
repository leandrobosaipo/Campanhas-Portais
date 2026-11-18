import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { hydrateRecoveryTarget } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const target = { piCodigo: "PI 3218", siteSigla: "ROO", localFormato: "MEGABANNER TOPO", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" };
const row = (overrides = {}) => ({
  piCodigo: "PI 3218", siteSigla: "ROO", format: { normalized: "MEGABANNER TOPO", resolution: { safeToApply: true } },
  period: { start: "2026-09-15", end: "2026-09-16", original: "15/09 a 16/09" }, sourceIdentity: { decision: "confirmed" }, canonicalSelection: { compatibleInsertionIds: [] }, adops: { operationalMatchCount: 0 }, ...overrides,
});
const base = { piCodigo: "PI 3218", pdfPiCodigo: "PI 3218", raw: { insertions: [{ localFormato: "MEGABANNER TOPO", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" }] }, pdfInsertions: [{ localFormato: "MEGABANNER TOPO", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" }] };
const sites = new Map([["ROO", 32]]);
base.pdfInsertions[0].siteId = 32;
const hydrated = hydrateRecoveryTarget(base, target, { items: [row()] }, sites);
assert.equal(hydrated.insertions.length, 1);
assert.equal(hydrated.insertions[0].siteId, 32);
for (const siteId of [undefined, 35]) {
  assert.throws(() => hydrateRecoveryTarget({ ...base, pdfInsertions: [{ ...base.pdfInsertions[0], siteId }] }, target, { items: [row()] }, sites), /PDF não confirma/);
}
assert.equal(hydrateRecoveryTarget(base, target, { items: [row({ canonicalSelection: { compatibleInsertionIds: [3018] }, adops: { operationalMatchCount: 1 } })] }, sites).recoveryTarget.insertionId, 3018);
assert.throws(() => hydrateRecoveryTarget(base, target, { items: [row({ canonicalSelection: { compatibleInsertionIds: [1, 2] }, adops: { operationalMatchCount: 2 } })] }, sites), /recovery_duplicate/);
assert.throws(() => hydrateRecoveryTarget(base, { ...target, insertionId: 3 }, { items: [row({ canonicalSelection: { compatibleInsertionIds: [1] }, adops: { operationalMatchCount: 1 } })] }, sites), /recovery_duplicate/);
const callerSpoof = hydrateRecoveryTarget({
  ...base,
  raw: { insertions: [{ localFormato: "HOME 1", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" }] },
}, target, { items: [row()] }, sites);
assert.equal(callerSpoof.insertions[0].localFormato, "MEGABANNER TOPO", "caller parsedPi cannot replace PDF scope");
for (const invalid of [
  { items: [] },
  { items: [row(), row()] },
  { items: [row({ format: { normalized: "HOME 1", resolution: { safeToApply: true } } })] },
]) assert.throws(() => hydrateRecoveryTarget(base, target, invalid, sites));
assert.throws(() => hydrateRecoveryTarget({ ...base, pdfPiCodigo: "PI 9999" }, target, { items: [row()] }, sites));
for (const insertions of [[], [base.pdfInsertions[0], base.pdfInsertions[0]], [{ ...base.pdfInsertions[0], periodoFim: "2026-09-30" }]]) {
  assert.throws(() => hydrateRecoveryTarget({ ...base, pdfInsertions: insertions }, target, { items: [row()] }, sites), /PDF não confirma/);
}
const [publicApi, privateApi, runner] = await Promise.all([
  readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8"),
  readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8"),
]);
for (const source of [publicApi, privateApi]) {
  assert.match(source, /recoveryTarget exige drive-pi-publish, strictInsertionScope=true e allowPdfInsertions=false/);
  assert.match(source, /recoveryTarget/);
}
assert.match(runner, /executeRecoveryEvidenceBackfill/);
assert.match(runner, /reconstructionReason: "late_publication_recovery"/);
assert.match(runner, /pdfInsertions: Array\.isArray\(parsedFromPdf\.insertions\)/);
const recoveryGuard = runner.indexOf('// Existing published media is immutable in recovery');
const mediaResolution = runner.indexOf('const shouldResolveMedia =', recoveryGuard);
const preservedReturn = runner.indexOf('preservedPublishedMedia: true', recoveryGuard);
assert(recoveryGuard > 0 && preservedReturn > recoveryGuard && preservedReturn < mediaResolution);
assert.match(runner, /id: parentJobId \|\| `drive-pi-recovery:/);
assert.match(runner, /Checksum autoritativo da mídia Drive ausente ou divergente/);
// Exercise the production package projection, not the simulation shortcut.
const contextStart = runner.indexOf("async function buildDrivePiPackageContext(");
const contextEnd = runner.indexOf("function classifyDrivePiPackage(", contextStart);
assert(contextStart > 0 && contextEnd > contextStart);
const buildContext = new Function("resolveDrivePiPackageFolder", "listDrivePiPackageItems", "readDriveTextObservations", "extractTextFromArchivedPdf", `${runner.slice(contextStart, contextEnd)}; return buildDrivePiPackageContext;`);
for (const md5Checksum of ["8e1dc04a21a3976795f076c08a674e06", undefined]) {
  const item = { driveFileId: "confirmed-gif", name: "banner.gif", mimeType: "image/gif", size: "61188", md5Checksum };
  const context = await buildContext(async () => ({ folderId: "confirmed-folder" }), async () => [item], async () => [], async () => null)({}, null);
  assert.equal(context.items[0].md5Checksum, md5Checksum);
  assert.equal(context.media[0].md5Checksum, md5Checksum, "Drive checksum must reach the recovery validator without being invented");
}
console.log("ok: recovery target requires one fresh monthly row and matching PDF");
