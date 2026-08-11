import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"));

const scoped = runner.filterSiteInsertions([
  { siteId: 33, localFormato: "MEGABANNER TOPO", periodoInicio: "2026-07-09", periodoFim: "2026-07-29" },
  { siteId: 33, localFormato: "INSTAGRAM STORIES", periodoInicio: "2026-07-09", periodoFim: "2026-07-14" },
  { siteId: 33, localFormato: "REELS BONIFICACAO", periodoInicio: "2026-07-09", periodoFim: "2026-07-14" },
]);
assert.equal(scoped.accepted.length, 1);
assert.equal(scoped.excluded.length, 2);

const pdfInsertion = { siteId: 33, localFormato: "TOPO", periodoInicio: "2026-07-09", periodoFim: "2026-07-29" };
const strictMerge = runner.mergeDrivePiFields(
  { piCodigo: "PI 14608", campaignName: "FEMINICIDIO", competencia: "07/2026", clienteId: 151, agenciaId: 82, insertions: [], raw: {} },
  { insertions: [pdfInsertion] },
  { allowPdfInsertions: false },
);
assert.deepEqual(strictMerge.insertions, []);
const permissiveMerge = runner.mergeDrivePiFields(
  { piCodigo: "PI 14608", campaignName: "FEMINICIDIO", competencia: "07/2026", clienteId: 151, agenciaId: 82, insertions: [], raw: {} },
  { insertions: [pdfInsertion] },
  { allowPdfInsertions: true },
);
assert.equal(permissiveMerge.insertions.length, 1);

const links = runner.extractUrlsFromText(`Banner: https://cdn.example.com/banner.gif\nDownload do video: https://files.example.com/vt.mp4.`);
assert.deepEqual(links, ["https://cdn.example.com/banner.gif", "https://files.example.com/vt.mp4"]);
assert.equal(runner.mediaKindFromUrl(links[0]), "image");
assert.equal(runner.mediaKindFromUrl(links[1]), "video");
assert.equal(runner.mediaKindFromUrl("https://refis.example.com/", "Favor direcionar o banner para este link"), "unknown");
assert.equal(runner.mediaKindFromUrl("https://cdn.example.com/banner.gif", "Link de direcionamento"), "image");
assert.deepEqual(
  runner.extractMediaLinksFromText(`Banner: https://cdn.example.com/download\nDestino: https://cliente.example.com/landing\nVideo: https://files.example.com/download`),
  [
    { url: "https://cdn.example.com/download", kind: "image", driveFileId: null },
    { url: "https://cliente.example.com/landing", kind: "unknown", driveFileId: null },
    { url: "https://files.example.com/download", kind: "video", driveFileId: null },
  ],
);
assert.equal(runner.selectObservedMediaLink({ textObservations: [{ name: "LINK.txt", links: [{ url: links[0], kind: "image" }] }] }, "image").link.url, links[0]);
assert.equal(runner.selectObservedMediaLink({ textObservations: [{ name: "LINK.txt", links: [{ url: "https://a/banner.gif", kind: "image" }, { url: "https://b/banner.gif", kind: "image" }] }] }, "image").ambiguous, true);
assert.equal(
  runner.selectDriveImageForInsertion(
    { media: [{ driveFileId: "top", mimeType: "image/gif", name: "825x120.gif" }, { driveFileId: "home", mimeType: "image/gif", name: "670x90.gif" }] },
    { mediaDriveFileId: "home", localFormato: "HOME 1" },
    {},
  ).mediaItem.driveFileId,
  "home",
);
const clickResolved = runner.resolveDrivePiClickUrl(
  { insertions: [{ siteId: 33, localFormato: "TOPO" }, { siteId: 33, localFormato: "VIDEO", mediaType: "video" }], raw: {} },
  { textObservations: [{ links: [{ url: "https://cdn.example.com/banner.gif", kind: "image" }, { url: "https://cliente.example.com/landing", kind: "unknown" }] }] },
);
assert.equal(clickResolved.clickUrl, "https://cliente.example.com/landing");
assert.equal(clickResolved.fields.insertions[0].clickUrl, "https://cliente.example.com/landing");
assert.equal(clickResolved.fields.insertions[1].clickUrl, undefined, "link de banner não pode ser herdado pelo vídeo");
assert.equal(
  runner.resolveInsertionClickUrl({ localFormato: "VIDEO", mediaType: "video" }, { clickUrl: "https://cliente.example.com/landing" }),
  null,
  "aplicação da PI não pode reintroduzir no vídeo o link global destinado aos banners",
);
assert.equal(
  runner.resolveInsertionClickUrl({ localFormato: "LATERAL 02", mediaType: "image" }, { clickUrl: "https://cliente.example.com/landing" }),
  "https://cliente.example.com/landing",
);

const pi90892Text = await readFile(path.join(root, "scripts/fixtures/pi-90892-extracted.txt"), "utf8");
const pi90892Lines = runner.parsePiMediaLinesFromText(pi90892Text, "PERRENGUE");
assert.equal(pi90892Lines.length, 3);
assert.deepEqual(pi90892Lines.map((item) => item.adrotateGroupId), [1, 7, 6]);
assert.deepEqual(pi90892Lines.map((item) => item.localFormatoNormalizado), ["MEGABANNER TOPO", "LATERAL 02", "VIDEO"]);
assert.deepEqual(pi90892Lines.map((item) => item.dimensions), ["825x120", "300x250", "300x250"]);

const pi90892MediaPlan = runner.planDrivePiMediaAssignments(
  { insertions: pi90892Lines, campaignName: "ACELERA VG", piCodigo: "PI 90892" },
  { media: [
    { driveFileId: "top", mimeType: "image/gif", name: "aceleravg_825x120 (3).gif" },
    { driveFileId: "lateral", mimeType: "image/gif", name: "aceleravg_300x250.gif" },
    { driveFileId: "video", mimeType: "video/mp4", name: "PREF DE VG - VT ACELERA VG 60s.mp4" },
  ] },
);
assert.deepEqual(pi90892MediaPlan.fields.insertions.map((item) => item.mediaDriveFileId), ["top", "lateral", "video"]);
assert.deepEqual(pi90892MediaPlan.issues, []);

const ambiguousPlan = runner.planDrivePiMediaAssignments(
  { insertions: [pi90892Lines[0]], campaignName: "ACELERA VG", piCodigo: "PI 90892" },
  { media: [
    { driveFileId: "top-a", mimeType: "image/gif", name: "aceleravg_825x120-a.gif" },
    { driveFileId: "top-b", mimeType: "image/gif", name: "aceleravg_825x120-b.gif" },
  ] },
);
assert(ambiguousPlan.issues.some((item) => item.startsWith("media_ambiguous:")));

const mismatchPlan = runner.planDrivePiMediaAssignments(
  { insertions: [pi90892Lines[0]], campaignName: "ACELERA VG", piCodigo: "PI 90892" },
  { media: [{ driveFileId: "wrong", mimeType: "image/gif", name: "aceleravg_300x250.gif" }] },
);
assert(mismatchPlan.issues.some((item) => item.startsWith("media_dimension_mismatch:")));

const perrengueConfig = JSON.parse(await readFile(path.join(root, "config/adrotate-sites.json"), "utf8")).PERRENGUE;
assert.deepEqual(perrengueConfig.formatMappings.map((item) => item.groupId).sort((a, b) => a - b), Array.from({ length: 14 }, (_, index) => index + 1));
assert.equal(runner.resolveCanonicalPortalPosition({ siteSigla: "PERRENGUE", contractedPosition: "TOPO LATERAL", mediaType: "image" }).groupId, 10);
assert.equal(runner.resolveCanonicalPortalPosition({ siteSigla: "PERRENGUE", contractedPosition: "BANNER LATERAL SEGUNDA DOBRA", dimensions: "300x250", mediaType: "image" }).groupId, 7);
assert.equal(runner.resolveCanonicalPortalPosition({ siteSigla: "PERRENGUE", contractedPosition: "MEGABANNER HOME 1", dimensions: "670x90", mediaType: "image" }).groupId, 2);
assert.equal(runner.resolveCanonicalPortalPosition({ siteSigla: "PPMT", contractedPosition: "MEGABANNER HOME 1", dimensions: "670x90", mediaType: "image" }).groupId, 2);
assert.equal(runner.resolveCanonicalPortalPosition({ siteSigla: "PPMT", contractedPosition: "MEGABANNER HOME 1", dimensions: "300x250", mediaType: "image" }).ok, false);
assert.equal(runner.sameCanonicalInsertionSlot(
  { siteSigla: "PPMT", localFormato: "TOPO", localFormatoNormalizado: "MEGABANNER TOPO", adrotateGroupId: 1 },
  { localFormato: "TOPO", localFormatoNormalizado: "MEGABANNER TOPO" },
), true);

const activeCampaignFixtures = await Promise.all([
  ["pi-009746-extracted.txt", "PERRENGUE"],
  ["pi-17111-extracted.txt", "PERRENGUE"],
  ["pi-17048-extracted.txt", "PPMT"],
].map(async ([filename, siteSigla]) => runner.parsePiMediaLinesFromText(
  await readFile(path.join(root, "scripts/fixtures", filename), "utf8"),
  siteSigla,
)));
assert.deepEqual(activeCampaignFixtures.map((items) => items.length), [1, 1, 2]);
assert.deepEqual(activeCampaignFixtures.flat().map((item) => item.adrotateGroupId), [2, 7, 2, 1]);
assert.deepEqual(activeCampaignFixtures.flat().map((item) => item.dimensions), ["670x90", "300x250", "670x90", "825x120"]);

const readiness = runner.validateDrivePiPackageReadiness(
  { hasPdf: true, hasMedia: true },
  { insertions: [{ siteId: 33, localFormato: "TOPO" }] },
  { issues: [] },
  { requireResolvedMedia: true },
);
assert.equal(readiness.ok, false);
assert(readiness.issues.includes("insertion_media_url_missing_after_processing"));

const [publicApi, privateApi, capture, adrotatePlugin, perrenguePluginDeploy] = await Promise.all([
  readFile(path.join(root, "ops/cloudflare-public-api/src/index.ts"), "utf8"),
  readFile(path.join(root, "artifacts/api-server/src/routes/ops.ts"), "utf8"),
  readFile(path.join(root, "scripts/src/capture-insertion-proof.cjs"), "utf8"),
  readFile(path.join(root, "ops/wordpress/adrotate-adops.php"), "utf8"),
  readFile(path.join(root, "ops/portainer/adops-stack/scripts/deploy-perrengue-adrotate-plugin.sh"), "utf8"),
]);
const [sheetSync, currentSheetCampaigns] = await Promise.all([
  readFile(path.join(root, "scripts/src/sync-planilha-latest.ts"), "utf8"),
  readFile(path.join(root, "artifacts/api-server/src/lib/current-sheet-campaigns.ts"), "utf8"),
]);
for (const source of [sheetSync, currentSheetCampaigns]) {
  assert(source.includes("isSocialOnlyFormato"));
  assert(source.includes("INSTAGRAM|STORIES?|REELS?|SOCIAL|BONIFICACAO"));
}
for (const source of [publicApi, privateApi]) {
  assert(source.includes("/api/ops/jobs/drive-pi-publish") || source.includes("/ops/jobs/drive-pi-publish"));
  assert(source.includes("strictInsertionScope"));
  assert(source.includes("allowPdfInsertions"));
}
assert(privateApi.includes("reuseExternalKey"), "API privada sem recuperação explícita de chave AdRotate");
assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes("reuseExternalKey"));
assert(!adrotatePlugin.includes('WHERE `user` = 0 AND `group` = %d AND `ad` <> %d'), "publicação não pode remover outros anúncios do grupo");
assert(adrotatePlugin.indexOf('SELECT `schedule` FROM') < adrotatePlugin.indexOf('$wpdb->delete($link_table'), "agenda existente deve ser lida antes de substituir links do anúncio");
assert(perrenguePluginDeploy.includes("echo WP_CONTENT_DIR;"), "deploy PMT deve resolver o diretório de conteúdo ativo do Bedrock");
assert(perrenguePluginDeploy.includes("legacy_target"), "deploy PMT deve remover a cópia-sombra no wp/wp-content");
for (const marker of ["g-placeholder", "data-cod5-ad-placeholder", "/assets/perrengue-sublogo.png", "data:image/svg+xml"]) {
  assert(capture.includes(marker), `auditoria sem marcador ${marker}`);
}
for (const marker of ["targetInPeriod", "checklistDate", "validatePerrengueHeadlessRebuildReadiness", "future_date", "adops_adrotate_publish_' . $insertion_id", "cod5_adops_verify", "strictExplicitPublishFlow", "help adops-adrotate-publish", "adrotate-adops.XXXXXX.php", "cmp -s", "install -m 0644"]) {
  assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes(marker), `runner sem marcador ${marker}`);
}
assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes("echo WP_CONTENT_DIR;"));
assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes("staleMuPluginTargets"));
for (const marker of ["application/vnd.google-apps.document", "/export?mimeType="]) {
  assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes(marker), `runner sem suporte a observação Google Docs: ${marker}`);
}

console.log("ok: drive-pi-publish contracts and deterministic scope/media rules");
