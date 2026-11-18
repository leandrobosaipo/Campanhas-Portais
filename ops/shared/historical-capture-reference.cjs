const crypto = require('node:crypto');

const SOURCE_KIND = 'registered_adrotate_schedule';
function fail(code) { throw new Error(code); }
function day(value) { return String(value || '').slice(0, 10); }
function today(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function failureSourceFromRows(job, log, insertion, targetDate) {
  const targets = job?.payload?.targets;
  const target = Array.isArray(targets) && targets.length === 1 ? targets[0] : null;
  const assets = Array.isArray(log?.stages) ? log.stages.find(stage => stage.stage === 'critical_assets' && stage.status === 'ok' && stage.summary?.approved === true) : null;
  const at = Date.parse(assets?.finishedAt), started = new Date(job?.startedAt).getTime(), finished = new Date(job?.finishedAt).getTime();
  if ((!/^[A-Za-z0-9._:-]{1,160}$/.test(String(job?.id || '')) || String(job?.id).includes('..')) || job.kind !== 'capture-proof-single' || job.status !== 'failed' || job.totalTargets !== 1 || job.failedTargets !== 1
    || !target || Number(target.insertionId) !== Number(insertion.id) || target.targetDate !== targetDate || target.candidateOnly === true || target.captureAt
    || log?.status !== 'failed' || !/^[a-f0-9-]{36}$/.test(log.id || '') || log.runnerJobId !== job.id || Number(log.insertionId) !== Number(insertion.id) || log.targetDate !== targetDate
    || log.summary?.errorDetail !== 'capture_audit_failed: final_identity_media_clipped' || log.summary?.matchedMediaUrl !== insertion.mediaUrl
    || !Number.isFinite(at) || !Number.isFinite(started) || !Number.isFinite(finished) || at < started || at > finished || today(new Date(at)) !== targetDate
    || !/^[a-f0-9]{64}$/.test(log.artifacts?.viewport?.sha256 || '') || !/^[a-f0-9]{64}$/.test(log.artifacts?.slot?.sha256 || '')
    || log.artifacts?.final?.exists !== false || log.uploadedUrl) fail('historical_reference_failed_capture_source_invalid');
  const captureAt = new Date(at - 4 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-04:00';
  if (!/^1[89]:|^2[01]:/.test(captureAt.slice(11, 17))) fail('historical_reference_failed_capture_outside_window');
  const source = { sourceCaptureJobId: job.id, sourceCaptureLogId: log.id, insertionId: Number(insertion.id), date: targetDate,
    errorCode: 'final_identity_media_clipped', originalCaptureAt: captureAt, sourceStartedAt: new Date(started).toISOString(), sourceFinishedAt: new Date(finished).toISOString(),
    mediaUrl: insertion.mediaUrl, viewportSha256: log.artifacts.viewport.sha256, slotSha256: log.artifacts.slot.sha256 };
  return { ...source, sourceHash: hashReference(source) };
}
function validateFailureSource(source, insertion, target, captureAt) {
  const { sourceHash, ...fields } = source || {};
  if (!source || sourceHash !== hashReference(fields) || source.insertionId !== Number(insertion.id) || source.date !== target
    || source.mediaUrl !== insertion.mediaUrl || source.originalCaptureAt !== captureAt || source.errorCode !== 'final_identity_media_clipped'
    || (!/^[A-Za-z0-9._:-]{1,160}$/.test(source.sourceCaptureJobId || '') || source.sourceCaptureJobId.includes('..')) || !/^[a-f0-9-]{36}$/.test(source.sourceCaptureLogId || '') || !/^[a-f0-9]{64}$/.test(source.viewportSha256 || '')
    || !/^[a-f0-9]{64}$/.test(source.slotSha256 || '')) fail('historical_reference_failed_capture_source_invalid');
  return source;
}
function scopeFor(insertion, date, captureAt, mapping, now = new Date()) {
  const target = day(date), start = day(insertion.periodoInicio), end = day(insertion.periodoFim);
  const instant = Date.parse(captureAt);
  if (![target, start, end].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d)) fail('historical_reference_invalid_period');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || target !== day(captureAt) || !Number.isFinite(instant)
    || new Date(target + 'T12:00:00Z').toISOString().slice(0, 10) !== target
    || !/T\d{2}:\d{2}:\d{2}-04:00$/.test(captureAt) || !/^1[89]:|^2[01]:/.test(captureAt.slice(11, 17))) fail('historical_reference_invalid_instant');
  const failureSource = mapping.failureSource ? validateFailureSource(mapping.failureSource, insertion, target, captureAt) : null;
  const failedActiveHome = failureSource && insertion.siteSigla === 'PERRENGUE' && Number(mapping.groupId) === 3
    && mapping.slotSelector === '.g.g-3' && mapping.contextSelector === '.g.g-3' && mapping.page === 'home' && end >= today(now);
  if (target >= today(now) || (!failedActiveHome && end >= today(now)) || start > target || target > end) fail('historical_reference_not_expired_in_period');
  if (!failedActiveHome && (failureSource || insertion.siteSigla !== 'PERRENGUE' || Number(mapping.groupId) !== 11 || mapping.slotSelector !== '.g.g-11'
    || mapping.page !== 'article' || mapping.contextSelector !== '.g.g-11')) fail('historical_reference_scope_not_supported');
  if (!Number.isInteger(Number(insertion.id)) || Number(insertion.id) <= 0 || !Number(insertion.campanhaId)
    || !insertion.rowVersion || insertion.archivedAt || insertion.supersededByInsertionId || insertion.statusNormalizado !== 'publicado' || !insertion.mediaUrl
    || insertion.bannerPublicadoNoSite !== true) fail('historical_reference_insertion_not_qualified');
  const url = new URL(insertion.mediaUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !['cod5.nyc3.digitaloceanspaces.com', 'cdn.perrenguematogrosso.com', 'perrenguematogrosso.com'].includes(url.hostname)
    || !/\.gif$/i.test(url.pathname) || !/^[A-Za-z0-9/_.%~-]+$/.test(url.pathname)) fail('historical_reference_media_not_supported');
  return { insertionId: Number(insertion.id), campaignId: Number(insertion.campanhaId), siteSigla: 'PERRENGUE', groupId: failedActiveHome ? 3 : 11,
    rowVersion: String(insertion.rowVersion), piCodigo: String(insertion.piCodigo || ''), date: target, captureAt,
    periodStart: start, periodEnd: end, mediaUrl: url.href, externalKey: `ADOPS-PERRENGUE-${Number(insertion.id)}`,
    slotSelector: mapping.slotSelector, contextSelector: mapping.contextSelector, page: failedActiveHome ? 'home' : 'article',
    ...(failureSource ? { failureSource } : {}) };
}
function hashReference(value) {
  const { referenceHash, ...rest } = value;
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return crypto.createHash('sha256').update(JSON.stringify(stable(rest))).digest('hex');
}
function referenceFromRows(scope, rows, mediaSha256, jobId, now = new Date()) {
  if (!Array.isArray(rows) || rows.length !== 1) fail('historical_reference_ad_or_schedule_not_unique');
  const row = rows[0], at = Date.parse(scope.captureAt) / 1000;
  if (Number(row.insertionId) !== scope.insertionId || Number(row.campaignId) !== scope.campaignId
    || row.externalKey !== scope.externalKey || Number(row.groupId) !== scope.groupId || (row.piCodigo && String(row.piCodigo) !== scope.piCodigo)
    || row.mediaUrl !== scope.mediaUrl || !Number.isInteger(Number(row.adId)) || Number(row.adId) <= 0
    || !Number.isInteger(Number(row.scheduleId)) || Number(row.scheduleId) <= 0
    || !Number.isFinite(Number(row.start)) || !Number.isFinite(Number(row.stop))
    || at < Number(row.start) || at > Number(row.stop)) fail('historical_reference_admin_identity_or_schedule_mismatch');
  const rules = row.rules;
  if (!rules || !['active', 'expired'].includes(row.adType) || (scope.failureSource && row.adType !== 'active') || row.timezone !== 'America/Cuiaba'
    || rules.desktop !== 'Y' || rules.show_everyone !== 'Y' || !Number.isFinite(Number(rules.weight)) || Number(rules.weight) <= 0
    || rules.state_req !== 'N' || rules.cities || rules.states || rules.countries
    || Number(rules.maxclicks) !== 0 || Number(rules.maximpressions) !== 0 || rules.spread !== 'N' || rules.spread_all !== 'N'
    || rules.daystarttime !== '0000' || rules.daystoptime !== '0000'
    || ['mon','tue','wed','thu','fri','sat','sun'].some(d => rules['day_' + d] !== 'Y')) fail('historical_reference_schedule_rules_not_supported');
  if (!/^[a-f0-9]{64}$/.test(mediaSha256) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(jobId)) fail('historical_reference_provenance_invalid');
  const receipt = { version: 1, sourceKind: SOURCE_KIND, historicalDisplayConfirmed: false, ...scope,
    presentationLabel: scope.failureSource ? 'Reconstrução após falha de captura — não comprova exibição original.' : 'Reconstrução administrativa — não comprova exibição original.',
    sourceJobId: jobId, adId: Number(row.adId), scheduleId: Number(row.scheduleId), scheduleStart: Number(row.start),
    scheduleStop: Number(row.stop), wordpressTimezone: String(row.timezone || ''), adType: row.adType,
    scheduleStartUtc: new Date(Number(row.start) * 1000).toISOString(), scheduleStopUtc: new Date(Number(row.stop) * 1000).toISOString(),
    adminPiCodigo: row.piCodigo || null, scheduleRules: rules, mediaSha256,
    checkedAt: now.toISOString(), actualFetchedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 3600000).toISOString() };
  return { ...receipt, referenceHash: hashReference(receipt) };
}
function validateReference(receipt, scope, { candidateOnly, saveEvidence, captureClass, now = new Date() } = {}) {
  if (!candidateOnly || saveEvidence !== false || captureClass !== 'historical_recovery') fail('historical_reference_candidate_only');
  if (!receipt || receipt.sourceKind !== SOURCE_KIND || receipt.version !== 1 || receipt.historicalDisplayConfirmed !== false
    || receipt.referenceHash !== hashReference(receipt) || !Number.isFinite(Date.parse(receipt.expiresAt))
    || Date.parse(receipt.expiresAt) <= now.getTime()) fail('historical_reference_invalid_or_expired');
  for (const [key, value] of Object.entries(scope)) if (typeof value === 'object' ? hashReference(receipt[key] || {}) !== hashReference(value) : receipt[key] !== value) fail('historical_reference_stale_scope');
  referenceFromRows(scope, [{ adId: receipt.adId, scheduleId: receipt.scheduleId, insertionId: receipt.insertionId,
    campaignId: receipt.campaignId, externalKey: receipt.externalKey, groupId: receipt.groupId, piCodigo: receipt.piCodigo,
    mediaUrl: receipt.mediaUrl, start: receipt.scheduleStart, stop: receipt.scheduleStop, timezone: receipt.wordpressTimezone,
    adType: receipt.adType, rules: receipt.scheduleRules }],
    receipt.mediaSha256, receipt.sourceJobId, new Date(receipt.checkedAt));
  return receipt;
}
// Values are passed through $wpdb->prepare; no request SQL or table identifiers are accepted.
function adminReadPhp(scope) {
  return `define('DISABLE_WP_CRON', true); define('SHORTINIT', true); require ${JSON.stringify('/app/web/wp/wp-load.php')}; global $wpdb;
$rows=$wpdb->get_results($wpdb->prepare("SELECT DISTINCT a.id AS adId,a.adops_insertion_id AS insertionId,a.adops_campaign_id AS campaignId,a.adops_external_key AS externalKey,a.adops_pi_code AS piCodigo,a.type AS adType,l.\u0060group\u0060 AS groupId,s.id AS scheduleId,s.starttime AS start,s.stoptime AS stop,a.bannercode,a.image AS asset,a.desktop,a.show_everyone,a.weight,a.state_req,a.cities,a.states,a.countries,s.maxclicks,s.maximpressions,s.spread,s.spread_all,s.daystarttime,s.daystoptime,s.day_mon,s.day_tue,s.day_wed,s.day_thu,s.day_fri,s.day_sat,s.day_sun FROM {$wpdb->prefix}adrotate a JOIN {$wpdb->prefix}adrotate_linkmeta l ON l.ad=a.id JOIN {$wpdb->prefix}adrotate_schedule s ON s.id=l.schedule WHERE a.adops_insertion_id=%d AND a.adops_campaign_id=%d AND a.adops_external_key=%s AND l.\u0060group\u0060=%d",${scope.insertionId},${scope.campaignId},${JSON.stringify(scope.externalKey)},${scope.groupId}),ARRAY_A);
foreach($rows as &$row){$row['timezone']=$wpdb->get_var("SELECT option_value FROM {$wpdb->prefix}options WHERE option_name='timezone_string'");$row['rules']=array();foreach(['desktop','show_everyone','weight','state_req','cities','states','countries','maxclicks','maximpressions','spread','spread_all','daystarttime','daystoptime','day_mon','day_tue','day_wed','day_thu','day_fri','day_sat','day_sun'] as $key){$row['rules'][$key]=$row[$key];unset($row[$key]);}$row['mediaUrl']=null;if(preg_match_all('/<(?:img|source|video)[^>]+(?:src|data-src)=["\\\']([^"\\\']+)["\\\']/i',$row['bannercode'],$matches)){foreach($matches[1] as $url){$url=html_entity_decode($url,ENT_QUOTES);if($url==='%asset%')$url=$row['asset'];if($url===${JSON.stringify(scope.mediaUrl)})$row['mediaUrl']=$url;}}unset($row['bannercode'],$row['asset']);}unset($row);echo 'ADOPS_REFERENCE_JSON:'.json_encode($rows);`;
}
const INSERTION_SQL = `SELECT i.id,i.campanha_id AS "campanhaId",i.xmin::text AS "rowVersion",s.sigla AS "siteSigla",
 i.local_formato_normalizado AS "localFormatoNormalizado",i.local_formato AS "localFormato",i.media_url AS "mediaUrl",
 i.periodo_inicio AS "periodoInicio",i.periodo_fim AS "periodoFim",i.banner_publicado_no_site AS "bannerPublicadoNoSite",
 i.status_normalizado AS "statusNormalizado",to_jsonb(i)->>'archived_at' AS "archivedAt",to_jsonb(i)->>'superseded_by_insertion_id' AS "supersededByInsertionId",c.pi_codigo AS "piCodigo"
 FROM insertions i JOIN campaigns c ON c.id=i.campanha_id JOIN sites s ON s.id=i.site_id WHERE i.id=$1`;
function assertEditorialProof(reference, proof) {
  if (reference && (proof?.status !== 'approved' || proof?.futureCount !== 0 || !/^[a-f0-9]{64}$/i.test(proof?.manifestHash || ''))) fail('historical_reference_editorial_proof_not_approved');
}
module.exports = { failureSourceFromRows, validateFailureSource, SOURCE_KIND, INSERTION_SQL, scopeFor, hashReference, referenceFromRows, validateReference, adminReadPhp, assertEditorialProof };
