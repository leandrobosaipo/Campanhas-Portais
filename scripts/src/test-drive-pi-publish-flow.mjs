import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const canonicalPerrengueInsertion = {
  siteId: 33,
  siteSigla: "PERRENGUE",
  localFormato: "MEGABANNER TOPO — HEADER — 825x120",
  localFormatoNormalizado: "Megabanner Topo — Header — 825x120",
  periodoInicio: "2026-08-07",
  periodoFim: "2026-08-31",
};
const parsedWithoutSiteId = {
  campaignName: "QUEIMADAS CUIABA",
  insertions: [{
    localFormato: "MEGABANNER TOPO — HEADER — 825x120",
    periodoInicio: "2026-08-07",
    periodoFim: "2026-08-31",
    clickUrl: "https://cliente.example/queimadas",
  }],
};
const hydratedExpectedSite = runner.mergeExpectedDrivePiContext(parsedWithoutSiteId, {
  insertion: canonicalPerrengueInsertion,
  campaign: { nome: "QUEIMADAS CUIABA", competencia: "AGOSTO/2026" },
  sourceText: "/PERRENGUE/AGOSTO/PI 14879 - Site Perrengue MT.pdf",
});
assert.equal(hydratedExpectedSite.insertions[0].siteId, 33, "portal canônico único deve preencher siteId ausente");
assert.equal(
  runner.buildDrivePiFolderIdentityText(
    { path: "/CUIABA/PI 14879/PERRENGUE-banner.gif", mimeType: "image/gif", parentFolderId: "folder-1" },
    {
      folder: { name: "PI 14879", path: "/CUIABA/PI 14879" },
      media: [{ name: "PERRENGUE-banner.gif", path: "/CUIABA/PI 14879/PERRENGUE-banner.gif" }],
    },
  ),
  "/CUIABA/PI 14879",
  "identidade do portal deve usar somente nome e caminho da pasta",
);
const labelledPiFolder = runner.mergeExpectedDrivePiContext(parsedWithoutSiteId, {
  insertion: canonicalPerrengueInsertion,
  campaign: { nome: "QUEIMADAS CUIABA", competencia: "AGOSTO/2026" },
  sourceText: "/PERRENGUE/AGOSTO/PI 009750 PREF ROO AFL",
});
assert.equal(labelledPiFolder.insertions[0].siteId, 33, "rótulos da PI não podem virar aliases de portal");
const clientNameIsNotPortal = runner.mergeExpectedDrivePiContext(parsedWithoutSiteId, {
  insertion: { ...canonicalPerrengueInsertion, siteId: 35, siteSigla: "ROO" },
  campaign: { nome: "QUEIMADAS CUIABA", competencia: "AGOSTO/2026" },
  sourceText: "/CLIENTE ROO/PI 14879",
});
assert.equal(clientNameIsNotPortal.insertions[0].siteId, undefined, "nome do cliente não prova a pasta do portal");
for (const unsafe of [
  { sourceText: "/CUIABA/PI 14879.pdf" },
  { sourceText: "/PERRENGUE/PI 14879.pdf", insertion: { ...canonicalPerrengueInsertion, periodoFim: "2026-08-30" } },
  { sourceText: "/PERRENGUE/PI 14879.pdf", fields: { ...parsedWithoutSiteId, insertions: [{ ...parsedWithoutSiteId.insertions[0], localFormato: "HOME 1" }] } },
  { sourceText: "/PERRENGUE/PI 14879.pdf", fields: { ...parsedWithoutSiteId, insertions: [...parsedWithoutSiteId.insertions, ...parsedWithoutSiteId.insertions] } },
  { sourceText: "/PERRENGUE/PI 14879/OMT", fields: parsedWithoutSiteId },
]) {
  const result = runner.mergeExpectedDrivePiContext(unsafe.fields || parsedWithoutSiteId, {
    insertion: unsafe.insertion || canonicalPerrengueInsertion,
    campaign: { nome: "QUEIMADAS CUIABA", competencia: "AGOSTO/2026" },
    sourceText: unsafe.sourceText,
  });
  assert.equal(result.insertions.some((item) => Number(item.siteId) === 33), false, "contexto ambíguo ou divergente não pode preencher portal");
}

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
assert.equal(
  runner.selectDriveImageForInsertion(
    { media: [{ driveFileId: "top", mimeType: "image/gif", name: "PI-14609-TOPO.gif" }, { driveFileId: "home", mimeType: "image/gif", name: "HOME.gif" }] },
    { localFormato: "TOPO" },
    { piCodigo: "PI 14609" },
  ).ambiguous,
  true,
);
const clickResolved = runner.resolveDrivePiClickUrl(
  { insertions: [{ siteId: 33, localFormato: "TOPO" }], raw: {} },
  { textObservations: [{ links: [{ url: "https://cdn.example.com/banner.gif", kind: "image" }, { url: "https://cliente.example.com/landing", kind: "unknown" }] }] },
);
assert.equal(clickResolved.clickUrl, "https://cliente.example.com/landing");
assert.equal(clickResolved.fields.insertions[0].clickUrl, "https://cliente.example.com/landing");

const readiness = runner.validateDrivePiPackageReadiness(
  { hasPdf: true, hasMedia: true },
  { insertions: [{ siteId: 33, localFormato: "TOPO" }] },
  { issues: [] },
  { requireResolvedMedia: true },
);
assert.equal(readiness.ok, false);
assert(readiness.issues.includes("insertion_media_url_missing_after_processing"));

assert.deepEqual(
  runner.extractSameOriginArticleCandidates(
    "https://perrenguematogrosso.com/",
    '<a href="/categoria/noticias/">Categoria</a><a href="/noticia-recente/">Notícia</a><a href="https://externo.example/post/">Externo</a><a href="/noticia-recente/">Duplicado</a>',
  ),
  ["https://perrenguematogrosso.com/noticia-recente/"],
);

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
assert(
  sheetSync.includes('"LATERAL 02 — SIDEBAR — 300X250": "LATERAL 02"'),
  "sync da planilha deve reconciliar o alias detalhado de LATERAL 02 sem recriar inserções",
);
for (const source of [publicApi, privateApi]) {
  assert(source.includes("/api/ops/jobs/drive-pi-publish") || source.includes("/ops/jobs/drive-pi-publish"));
  assert(source.includes("strictInsertionScope"));
  assert(source.includes("allowPdfInsertions"));
}
assert(!adrotatePlugin.includes('WHERE `user` = 0 AND `group` = %d AND `ad` <> %d'), "publicação não pode remover outros anúncios do grupo");
assert(adrotatePlugin.indexOf('SELECT `schedule` FROM') < adrotatePlugin.indexOf('$wpdb->delete($link_table'), "agenda existente deve ser lida antes de substituir links do anúncio");
assert(adrotatePlugin.includes("function adrotate_adops_safe_maintenance_call"), "manutenção deve isolar falhas transitórias de cache");
assert(adrotatePlugin.includes("catch (\\Throwable $error)"), "RedisException não pode invalidar uma publicação AdRotate já gravada");
const maintenanceHarness = String.raw`
class WP_CLI { public static $warnings = array(); public static function add_command($name, $callable) {} public static function warning($message) { self::$warnings[] = $message; } }
class RedisException extends Exception {}
function esc_url_raw($value) { return preg_match('/^https:\/\//', (string) $value) ? (string) $value : ''; }
function esc_attr($value) { return htmlspecialchars((string) $value, ENT_QUOTES); }
function wp_cache_flush() { throw new RedisException('redis unavailable'); }
$GLOBALS['evaluated'] = false; $GLOBALS['scheduled'] = false;
function adrotate_evaluate_ads() { $GLOBALS['evaluated'] = true; }
function adrotate_check_schedules() { $GLOBALS['scheduled'] = true; }
require $argv[1];
$result = adrotate_adops_run_maintenance();
$fields = adrotate_adops_maintenance_fields(true, $result);
$no_link = adrotate_adops_build_bannercode(array('media_url' => 'https://cdn.example/banner.gif', 'link_url' => null, 'title' => 'Campanha'));
$with_link = adrotate_adops_build_bannercode(array('media_url' => 'https://cdn.example/banner.mp4', 'link_url' => 'https://destino.example/', 'title' => 'Campanha'));
echo json_encode(array('result' => $result, 'fields' => $fields, 'evaluated' => $GLOBALS['evaluated'], 'scheduled' => $GLOBALS['scheduled'], 'warnings' => WP_CLI::$warnings, 'no_link' => $no_link, 'with_link' => $with_link));
`;
const maintenanceResult = JSON.parse(execFileSync("php", ["-r", maintenanceHarness, path.join(root, "ops/wordpress/adrotate-adops.php")], { encoding: "utf8" }));
assert.equal(maintenanceResult.result.ok, false);
assert.equal(maintenanceResult.result.warnings.length, 1);
assert.equal(maintenanceResult.fields.cache_maintenance_requested, true);
assert.equal(maintenanceResult.fields.cache_maintenance_ok, false);
assert.equal(maintenanceResult.fields.cache_maintenance_warnings.length, 1);
assert.equal(maintenanceResult.evaluated, true);
assert.equal(maintenanceResult.scheduled, true);
assert.equal(maintenanceResult.warnings.length, 1);
assert.match(maintenanceResult.no_link, /<img /);
assert.doesNotMatch(maintenanceResult.no_link, /<a\b/i, "banner sem redirect não pode ficar clicável");
assert.match(maintenanceResult.with_link, /<a href="https:\/\/destino\.example\/"/);
assert.match(maintenanceResult.with_link, /<video /);
assert.equal(runner.isCacheMaintenanceDegraded({ apply: true, purgeCache: true, wpCliResult: { cache_maintenance_requested: true } }), true);
assert.equal(runner.isCacheMaintenanceDegraded({ apply: true, purgeCache: true, wpCliResult: { cache_maintenance_requested: true, cache_maintenance_ok: false } }), true);
assert.equal(runner.isCacheMaintenanceDegraded({ apply: true, purgeCache: true, wpCliResult: { cache_maintenance_requested: true, cache_maintenance_ok: true } }), false);
assert.equal(runner.isCacheMaintenanceDegraded({ apply: true, purgeCache: false, wpCliResult: {} }), false);
assert(perrenguePluginDeploy.includes("echo WP_CONTENT_DIR;"), "deploy PMT deve resolver o diretório de conteúdo ativo do Bedrock");
assert(perrenguePluginDeploy.includes("legacy_target"), "deploy PMT deve remover a cópia-sombra no wp/wp-content");
for (const marker of ["g-placeholder", "data-cod5-ad-placeholder", "/assets/perrengue-sublogo.png", "data:image/svg+xml"]) {
  assert(capture.includes(marker), `auditoria sem marcador ${marker}`);
}
const runnerSource = await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8");
assert.match(runnerSource, /validateDrivePiDedupeSafety\(fields, expectedTarget = null\)/,
  "retomada canônica deve limitar deduplicação aos IDs já aprovados");
assert.match(runnerSource, /ignoredDraftCampaignIds/,
  "rascunho concorrente deve ser registrado sem impedir a inserção canônica exata");
const safeDraft = { origem: "google-drive-monitor", insertions: [{ id: 2407, statusNormalizado: "aguardando_publicacao", observacoes: "Criado a partir do Drive: /AFL/AGOSTO", bannerPublicadoNoSite: false, mediaUrl: null, totalEvidencias: 0, printGerado: false }] };
assert.equal(runner.isDiscardableDraftCampaign(safeDraft, new Map([[2407, { plannedSelf: null, exactLiveMatches: [], historicalAdminMatches: [] }]])), true,
  "rascunho sem mídia, publicação ou evidência pode ser ignorado diante do alvo canônico");
for (const unsafe of [
  { ...safeDraft, insertions: [{ ...safeDraft.insertions[0], bannerPublicadoNoSite: true }] },
  { ...safeDraft, insertions: [{ ...safeDraft.insertions[0], mediaUrl: "https://cdn.example/banner.gif" }] },
  { ...safeDraft, insertions: [{ ...safeDraft.insertions[0], totalEvidencias: 1 }] },
  { ...safeDraft, insertions: [{ ...safeDraft.insertions[0], observacoes: "Origem desconhecida" }] },
  { ...safeDraft, origem: "manual" },
]) assert.equal(runner.isDiscardableDraftCampaign(unsafe, new Map([[2407, { plannedSelf: null, exactLiveMatches: [], historicalAdminMatches: [] }]])), false);
assert.equal(runner.isDiscardableDraftCampaign(safeDraft, new Map([[2407, { plannedSelf: { adId: 10 }, exactLiveMatches: [], historicalAdminMatches: [] }]])), false,
  "histórico AdRotate impede ignorar a concorrente");
for (const marker of ["targetInPeriod", "checklistDate", "validatePerrengueHeadlessRebuildReadiness", "future_date", "buildPerrengueRebuildTriggerReason", "operationId: crypto.randomUUID()", "return `adops_adrotate_${cod5_operation}_${cod5_insertion_id}_${cod5_operation_id}`;", "cod5_adops_verify", "strictExplicitPublishFlow", "help adops-adrotate-publish", "adrotate-adops.XXXXXX.php", "cmp -s", "install -m 0644", "restrictedKvm8Gateway", "payload?.generateEvidence === true", "extractSameOriginArticleCandidates"]) {
  assert(runnerSource.includes(marker), `runner sem marcador ${marker}`);
}
assert(runnerSource.includes("monitor Drive PI falhou; tentará novamente sem bloquear a fila"), "falha de monitor Drive nao pode bloquear a fila de jobs");
assert(runnerSource.includes("cacheMaintenanceDegraded && publicHtmlValidation?.ok !== true"), "cache degradado deve exigir readback positivo do HTML público");
assert(runnerSource.includes("publicationFailureDiagnostic"), "falha de publicação deve registrar diagnóstico de cache, rebuild e HTML público");
assert(runnerSource.includes('const explicitPublishFlow = /api-publish$/.test'), "drive-pi-publish com publish=false deve permitir atualização somente no AdOps");
assert(!runnerSource.includes('const explicitPublishFlow = payload?.publish === true && /api-publish$/.test'), "mutação explícita não pode depender de publicar no AdRotate");
assert(runnerSource.includes("explicitPublishFlow\n    || (ADOPS_DRIVE_PI_ALLOW_MUTATION && ADOPS_PI_AGENT_AUTO_APPLY)"), "endpoint protegido explícito deve ser independente das flags de automação");
assert(runnerSource.includes("if (hasAdOpsChanges && payload?.publish === true)"), "AdRotate deve continuar condicionado a publish=true");
assert(runnerSource.includes("if (hasAdOpsChanges && payload?.publish !== true && !strictExplicitPublishFlow)"), "modo AdOps-only estrito não deve executar reconciliação SSH geral");
assert(runnerSource.includes("echo WP_CONTENT_DIR;"));
assert(runnerSource.includes("staleMuPluginTargets"));
for (const marker of ["application/vnd.google-apps.document", "/export?mimeType="]) {
  assert((await readFile(path.join(root, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8")).includes(marker), `runner sem suporte a observação Google Docs: ${marker}`);
}

console.log("ok: drive-pi-publish contracts and deterministic scope/media rules");
