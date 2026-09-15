import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { hydrateRecoveryTarget } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const target = { piCodigo: "PI 3218", siteSigla: "ROO", localFormato: "MEGABANNER TOPO", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" };
const row = (overrides = {}) => ({
  piCodigo: "PI 3218", siteSigla: "ROO", format: { normalized: "MEGABANNER TOPO", resolution: { safeToApply: true } },
  period: { start: "2026-09-15", end: "2026-09-16", original: "15/09 a 16/09" }, sourceIdentity: { decision: "confirmed" }, ...overrides,
});
const base = { piCodigo: "PI 3218", pdfPiCodigo: "PI 3218", raw: { insertions: [{ localFormato: "MEGABANNER TOPO", periodoInicio: "2026-09-15", periodoFim: "2026-09-16" }] } };
const sites = new Map([["ROO", 32]]);
const hydrated = hydrateRecoveryTarget(base, target, { items: [row()] }, sites);
assert.equal(hydrated.insertions.length, 1);
assert.equal(hydrated.insertions[0].siteId, 32);
for (const invalid of [
  { items: [] },
  { items: [row(), row()] },
  { items: [row({ format: { normalized: "HOME 1", resolution: { safeToApply: true } } })] },
]) assert.throws(() => hydrateRecoveryTarget(base, target, invalid, sites));
assert.throws(() => hydrateRecoveryTarget({ ...base, pdfPiCodigo: "PI 9999" }, target, { items: [row()] }, sites));
const [publicApi, privateApi, runner] = await Promise.all([
  readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8"),
  readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8"),
]);
for (const source of [publicApi, privateApi]) {
  assert.match(source, /recoveryTarget exige drive-pi-publish, strictInsertionScope=true e allowPdfInsertions=false/);
  assert.match(source, /recoveryTarget/);
}
assert.match(runner, /reconstruction_provenance_required/);
assert.match(runner, /Checksum autoritativo da mídia Drive ausente ou divergente/);
console.log("ok: recovery target requires one fresh monthly row and matching PDF");
