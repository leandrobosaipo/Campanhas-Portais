import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

assert.equal(runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "PERRENGUE",
}), true);
assert.throws(() => runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "ROO",
}), /portal ainda não suportado/i);

assert.equal(runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  campaignPiCodigo: "PI 057652- PREF ROO",
  insertionPiCodigo: "57652",
}), true);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  campaignPiCodigo: "PI 99999- CORRIGIDA",
  insertionPiCodigo: "57652",
}), /PI atual da campanha diverge/i);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  campaignPiCodigo: "57652",
  insertionPiCodigo: "PI 99999- CORRIGIDA",
}), /PI atual da inserção diverge/i);

const destination = runner.resolveOperationalDestination([
  { text: "Destino: https://www.tce.mt.gov.br/" },
]);
assert.equal(destination, "https://www.tce.mt.gov.br/");
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: http://example.com/" }]), /HTTPS/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "https://a.example/ https://b.example/" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://localhost/admin" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://127.0.0.1/private" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://user:pass@example.com/" }]), /exatamente um/);

const contract = runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI - TCE" },
  site: { id: 33, sigla: "PERRENGUE" },
});
assert.equal(contract.ok, true);
assert.equal(contract.preserveCommercialPi, "PI - TCE");
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "17190" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, piCodigo: "PI 009750- PREF ROO", siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI - TCE" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI 009750- PREF ROO" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);

const adrotatePayload = runner.buildAdrotatePublishPayload({
  insertion: { id: 1944, campanhaId: 989, siteSigla: "PERRENGUE", mediaUrl: "https://cdn.example/radar.gif", localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25", observacoes: "Link destino informado: https://www.tce.mt.gov.br/" },
  campaign: { id: 989, piCodigo: "PI - TCE", nome: "RADAR" },
  site: { sigla: "PERRENGUE" },
  checklist: { expectedSelectors: { groupId: 2, slotSelector: ".g.g-2", contextSelector: ".g.g-2" }, expectedMedia: { mediaUrl: "https://cdn.example/radar.gif" }, resolvedRule: { page: "home" } },
  targetDate: "2026-08-13",
  replaceExisting: true,
  purgeCache: true,
  generateEvidence: false,
  identityMode: "operational_identity",
});
assert.equal(adrotatePayload.pi_code, null);
assert.equal(adrotatePayload.external_key, "ADOPS-PERRENGUE-1944");
assert.equal(adrotatePayload.group_id, 2);
assert.equal(runner.validateOperationalDriveItem(
  { id: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:34:08.000Z", size: "65191", md5Checksum: "abc" },
  { driveFileId: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:34:08.000Z", size: "65191", md5Checksum: "abc" },
  "Mídia",
), true);
assert.throws(() => runner.validateOperationalDriveItem(
  { id: "gif-radar", modifiedTime: "2026-08-12T00:34:08.000Z" },
  { driveFileId: "gif-radar", modifiedTime: "2026-08-13T00:00:00.000Z" },
  "Mídia",
), /mudou/);
assert.deepEqual(runner.normalizePerrengueAdrotateSnapshot({ ads: [], links: [], schedules: [] }), { ads: [], links: [], schedules: [] });
assert.throws(() => runner.normalizePerrengueAdrotateSnapshot(null), /inválido/);
assert.throws(() => runner.normalizePerrengueAdrotateSnapshot({ ads: [], links: [] }), /schedules/);
assert.equal(runner.selectCanonicalSnapshotAd({ ads: [{ id: "12" }, { id: "41" }] }).id, "41");
assert.equal(runner.evaluateRestoredAdHtml(
  "ADOPS-PERRENGUE-1944 rejected.gif",
  { previousAdId: 12, previousMediaBasename: "old.gif", rejectedMediaBasename: "rejected.gif" },
).ok, false);
assert.equal(runner.evaluateRestoredAdHtml(
  "a-12 old.gif",
  { previousAdId: 12, previousMediaBasename: "old.gif", rejectedMediaBasename: "rejected.gif" },
).ok, true);

const publishReason = runner.buildPerrengueRebuildTriggerReason({
  insertionId: 1944,
  operation: "publish",
  operationId: "job-f521",
});
const rollbackReason = runner.buildPerrengueRebuildTriggerReason({
  insertionId: 1944,
  operation: "rollback",
  operationId: "job-f521",
});
assert.equal(publishReason, "adops_adrotate_publish_1944_job-f521");
assert.equal(rollbackReason, "adops_adrotate_rollback_1944_job-f521");
assert.notEqual(publishReason, rollbackReason);
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "ok", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: true, failed: false, status: "ok" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "ok", trigger: { reason: publishReason } },
}, rollbackReason), { matched: false, completed: false, failed: false, status: null });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "failed", trigger: { reason: rollbackReason } },
}, rollbackReason), { matched: true, completed: false, failed: true, status: "failed" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: true,
  queued: false,
  last: { status: "running", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: false, failed: false, status: "running" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: true,
  last: { status: "queued", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: false, failed: false, status: "queued" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: true,
  queued: true,
  last: { status: "running", trigger: { reason: "editorial-next" } },
  recentRuns: [{ status: "ok", trigger: { reason: publishReason } }],
}, publishReason), { matched: true, completed: true, failed: false, status: "ok" });

const dir = await mkdtemp(path.join(tmpdir(), "adops-operational-gif-"));
try {
  const file = path.join(dir, "670x90.gif");
  await execFileAsync("convert", ["-size", "670x90", "gradient:#0057b8-#ffffff", file]);
  const metadata = await runner.inspectOperationalImage(file, { width: 670, height: 90, format: "GIF" });
  assert.equal(metadata.width, 670);
  assert.equal(metadata.height, 90);
  assert.equal(metadata.format, "GIF");
  await assert.rejects(() => runner.inspectOperationalImage(file, { width: 825, height: 120, format: "GIF" }), /Dimens/);
  for (const [name, source] of [
    ["snapshot.php", runner.buildPerrengueAdrotateSnapshotPhp()],
    ["restore.php", runner.buildPerrengueAdrotateRestorePhp()],
  ]) {
    const phpFile = path.join(dir, name);
    await writeFile(phpFile, source);
    const lint = await execFileAsync("php", ["-l", phpFile]);
    assert.match(lint.stdout, /No syntax errors detected/);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("ok: operational publication preflight contracts");
