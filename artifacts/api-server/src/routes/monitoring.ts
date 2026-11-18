import { Router, type IRouter } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '@workspace/db';
import { buildMonitorChecklist, driveObservations, fingerprint, sheetObservations } from '../lib/campaign-monitor-checklist.mjs';
import { validateEvidenceRequest } from '../lib/n8n-evidence-request.mjs';
import { schedulingOwnedByN8n } from '../../../../ops/shared/scheduling-owner.mjs';
import { whatsappChannelState, ADOPS_GROUP } from '../lib/whatsapp-checklist.mjs';
import { queueReviewFeedback } from '../lib/whatsapp-feedback.mjs';
import { enrichWhatsAppChecklist } from '../lib/whatsapp-operational-context';
import {activePiWaivers,activeWaiverFolders} from '../lib/pi-waivers.mjs';
import {withCompleteDecision} from '../lib/campaign-decision-policy.mjs';
import {auditDriveCoverage} from '../lib/drive-coverage-audit.mjs';

const router: IRouter = Router();
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
let schemaPromise: Promise<unknown> | null = null;
function ensureSchema() {
  if (!schemaPromise) schemaPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS adops_monitor_sources (
      source TEXT PRIMARY KEY, revision TEXT NOT NULL, checked_at TIMESTAMPTZ NOT NULL,
      item_count INTEGER NOT NULL, receipt JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS adops_monitor_observations (
      source TEXT NOT NULL, entity_key TEXT NOT NULL, identity TEXT NOT NULL,
      data JSONB NOT NULL, present BOOLEAN NOT NULL DEFAULT true, observed_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(source, entity_key));
    CREATE TABLE IF NOT EXISTS adops_monitor_checklists (
      identity TEXT PRIMARY KEY, revision TEXT NOT NULL, checklist JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL, active BOOLEAN NOT NULL DEFAULT true);
    CREATE TABLE IF NOT EXISTS adops_monitor_checklist_versions (
      identity TEXT NOT NULL, revision TEXT NOT NULL, checklist JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(identity, revision));
    CREATE TABLE IF NOT EXISTS adops_monitor_outbox (
      identity TEXT NOT NULL, revision TEXT NOT NULL, kind TEXT NOT NULL,
      payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending_channel', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(identity, revision, kind));
    CREATE TABLE IF NOT EXISTS adops_monitor_requests (
      request_key TEXT PRIMARY KEY, job_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS adops_monitor_decision_cutovers (
      policy_key TEXT PRIMARY KEY, activated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  `).catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

// Business data and PDFs are private even though many older GET endpoints are public.
router.use('/monitoring', (req, res, next) => {
  const expected = process.env.OPS_API_TOKEN?.trim();
  const provided = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!expected || provided !== expected) { res.status(401).json({ error: 'unauthorized' }); return; }
  next();
});

async function commercialSnapshot() {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || '4011'}/api/sync/planilha/preview?scope=commercial&asOf=${today()}`, {
    headers: { Authorization: `Bearer ${process.env.OPS_API_TOKEN}` }, signal: AbortSignal.timeout(100_000),
  });
  if (!response.ok) throw new Error('commercial_snapshot_unavailable');
  const snapshot = await response.json();
  if (!snapshot.complete || !snapshot.inventoryComplete) throw new Error('commercial_snapshot_incomplete');
  return snapshot;
}

async function reconcile(source: string, observations: any[], inventory: any[], receipt: Record<string, unknown>, startedAt: string) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('adops-monitor-checklists-v1'))");
    const previous = (await client.query('SELECT * FROM adops_monitor_sources WHERE source=$1', [source])).rows[0];
    if (previous && new Date(previous.checked_at).getTime() > Date.parse(startedAt)) {
      await client.query('ROLLBACK'); return { stale: true, changed: 0, reason: 'newer_scan_already_committed' };
    }
    const revision = fingerprint(observations);
    const changedSource = previous?.revision !== revision;
    // A baseline creates current checklists without emitting historical notifications.
    const baseline = !previous;
    if (changedSource) {
      await client.query('UPDATE adops_monitor_observations SET present=false WHERE source=$1', [source]);
      for (const observation of observations) await client.query(`
        INSERT INTO adops_monitor_observations(source,entity_key,identity,data,present,observed_at)
        VALUES($1,$2,$3,$4,true,$5) ON CONFLICT(source,entity_key) DO UPDATE
        SET identity=EXCLUDED.identity,data=EXCLUDED.data,present=true,observed_at=EXCLUDED.observed_at`,
      [source, observation.entityKey, observation.identity, JSON.stringify(observation), startedAt]);
    }
    await client.query(`INSERT INTO adops_monitor_sources(source,revision,checked_at,item_count,receipt)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(source) DO UPDATE SET revision=EXCLUDED.revision,
      checked_at=EXCLUDED.checked_at,item_count=EXCLUDED.item_count,receipt=EXCLUDED.receipt`,
    [source, revision, startedAt, observations.length, JSON.stringify(receipt)]);
    const all = (await client.query('SELECT data FROM adops_monitor_observations WHERE present=true ORDER BY source,entity_key')).rows.map(row => row.data);
    const groups = new Map<string, any[]>();
    const decisions=await activePiWaivers(client);
    // First successful scan establishes a durable cutover without notifying old checklists.
    const cutoverKey='complete_campaign_review:v1:'+source;
    const cutoverCreated=(await client.query('INSERT INTO adops_monitor_decision_cutovers(policy_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING activated_at',[cutoverKey])).rowCount>0;
    const cutover=(await client.query('SELECT activated_at FROM adops_monitor_decision_cutovers WHERE policy_key=$1',[cutoverKey])).rows[0];
    const commercialObservedAt=source==='drive'?String(receipt.scannedAt||startedAt):startedAt;
    for (const observation of all) groups.set(observation.identity, [...(groups.get(observation.identity) || []), observation]);
    let changed = 0;
    await client.query('UPDATE adops_monitor_checklists SET active=false');
    for (const [identity, entries] of groups) {
      let checklist = buildMonitorChecklist(identity, entries, inventory, today(),decisions);
      // Daily scope: known expired campaigns remain preserved but stop generating alerts.
      if (checklist.positions.length && checklist.positions.every((p: any) => p.end && p.end < today())) continue;
      const old = (await client.query('SELECT revision,checklist FROM adops_monitor_checklists WHERE identity=$1', [identity])).rows[0];
      checklist=withCompleteDecision(checklist,old?.checklist,{eligible:!cutoverCreated&&!baseline&&changedSource&&Date.parse(commercialObservedAt)>=new Date(cutover.activated_at).getTime()&&process.env.ADOPS_MONITOR_SHADOW_MODE!=='true',observedAt:commercialObservedAt,source});
      const checklistRevision = fingerprint(checklist);
      await client.query(`INSERT INTO adops_monitor_checklists(identity,revision,checklist,updated_at,active)
        VALUES($1,$2,$3,now(),true) ON CONFLICT(identity) DO UPDATE SET revision=EXCLUDED.revision,
        checklist=EXCLUDED.checklist,updated_at=EXCLUDED.updated_at,active=true`, [identity, checklistRevision, JSON.stringify(checklist)]);
      if (!baseline && process.env.ADOPS_MONITOR_SHADOW_MODE !== 'true' && whatsappChannelState().enabled)
        await queueReviewFeedback(client,{checklist,revision:checklistRevision,source,observedAt:source==='drive'?receipt.scannedAt:startedAt,group:ADOPS_GROUP,enrichChecklist:(c:any)=>enrichWhatsAppChecklist(c,{client})});
      if (old?.revision === checklistRevision) continue;
      changed++;
      await client.query('INSERT INTO adops_monitor_checklist_versions(identity,revision,checklist) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [identity, checklistRevision, JSON.stringify(checklist)]);
      if (!baseline && process.env.ADOPS_MONITOR_SHADOW_MODE !== 'true') await client.query(`INSERT INTO adops_monitor_outbox(identity,revision,kind,payload)
        VALUES($1,$2,'checklist_changed',$3) ON CONFLICT DO NOTHING`, [identity, checklistRevision, JSON.stringify({ message: checklist.message, checklist })]);
    }
    await client.query(`UPDATE adops_monitor_outbox SET status='superseded' WHERE status='pending_channel'
      AND identity NOT IN (SELECT identity FROM adops_monitor_checklists WHERE active=true)`);
    await client.query('COMMIT');
    return { baseline, source, revision, changed, checklists: groups.size, publicationEnabled: false, notificationDelivery: whatsappChannelState().delivery };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

router.post('/monitoring/planilha/scans', async (_req, res) => {
  const startedAt = new Date().toISOString();
  try {
    const snapshot = await commercialSnapshot();
    const observations = sheetObservations(snapshot, today());
    res.json({ ok: true, ...(await reconcile('planilha', observations, snapshot.insertions, { sourceSha256: snapshot.sourceSha256, coverage: snapshot.coverage }, startedAt)) });
  } catch { res.status(503).json({ error: 'source_unavailable_or_incomplete', source: 'planilha', cursorAdvanced: false }); }
});

// Private readback only: never advances a source cursor or queues a notification.
router.get('/monitoring/drive/audit', async (_req, res) => {
 try {
  const job=(await pool.query("SELECT id,status,result_json FROM ops_jobs WHERE kind='drive-inventory-refresh' AND status='completed' AND payload_json::jsonb->>'monitorOnly'='true' ORDER BY updated_at DESC LIMIT 1")).rows[0];
  const result=typeof job?.result_json==='string'?JSON.parse(job.result_json):job?.result_json,execution=result?.execution;
  if(execution?.complete!==true||!execution.snapshot?.scanId){res.status(409).json({error:'completed_inventory_required',mutations:0});return;}
  const scannedAt=Date.parse(execution.snapshot.scannedAt);
  if(!Number.isFinite(scannedAt)||Date.now()-scannedAt>10*60_000){res.status(409).json({error:'inventory_snapshot_stale',jobId:job.id,scannedAt:execution.snapshot.scannedAt,mutations:0});return;}
  const items=(await pool.query(`SELECT drive_file_id AS "driveFileId",name,mime_type AS "mimeType",path,
   parent_folder_id AS "parentFolderId",modified_time AS "modifiedTime",checksum,size_bytes AS size
   FROM cod5_drive_inventory_items WHERE scan_id=$1 AND is_current=true ORDER BY drive_file_id`,[execution.snapshot.scanId])).rows;
  if(items.length!==execution.scanned){res.status(409).json({error:'inventory_count_mismatch',mutations:0});return;}
  const snapshot=await commercialSnapshot(),decisions=await activePiWaivers(pool);
  const audit=auditDriveCoverage({items,packages:execution.packages||[],snapshot,asOf:today(),decisions});
  res.status(audit.complete?200:409).json({...audit,jobId:job.id,scanId:execution.snapshot.scanId,scannedAt:execution.snapshot.scannedAt,sheetCheckedAt:snapshot.checkedAt,sheetSha256:snapshot.sourceSha256});
 }catch{res.status(503).json({error:'coverage_audit_unavailable',mutations:0});}
});

router.post('/monitoring/drive/scans', async (req, res) => {
  const startedAt = new Date().toISOString();
  try {
    const jobId = req.body?.jobId;
    if (typeof jobId !== 'string') { res.status(400).json({ error: 'completed_inventory_job_required' }); return; }
    const job = (await pool.query('SELECT kind,status,result_json FROM ops_jobs WHERE id=$1', [jobId])).rows[0];
    if (!job || job.kind !== 'drive-inventory-refresh') { res.status(400).json({ error: 'invalid_inventory_job' }); return; }
    if (job.status !== 'completed') { res.status(409).json({ error: 'inventory_job_not_completed', jobId, status: job.status }); return; }
    const result = typeof job.result_json === 'string' ? JSON.parse(job.result_json) : job.result_json;
    const execution = result?.execution;
    if (execution?.complete !== true || !execution?.snapshot?.scanId) { res.status(409).json({ error: 'inventory_coverage_not_confirmed', jobId }); return; }
    const scannedAt = Date.parse(execution.snapshot.scannedAt);
    if (!Number.isFinite(scannedAt) || Date.now()-scannedAt > 10*60_000) { res.status(409).json({ error: 'inventory_snapshot_stale' }); return; }
    const items = (await pool.query(`SELECT drive_file_id AS "driveFileId",name,mime_type AS "mimeType",path,
      parent_folder_id AS "parentFolderId",modified_time AS "modifiedTime",checksum,size_bytes AS size
      FROM cod5_drive_inventory_items WHERE scan_id=$1 AND is_current=true ORDER BY drive_file_id`, [execution.snapshot.scanId])).rows;
    if (items.length !== execution.scanned) throw new Error('inventory_count_mismatch');
    const snapshot = await commercialSnapshot();
    const expired = new Set(snapshot.rows.filter((row: any) => row.fim && row.fim < today())
      .map((row: any) => `${row.siteSigla}:${String(row.piCodigo || row.peca).match(/\d{3,}/)?.[0]?.replace(/^0+/, '')}`));
    const current = new Set(sheetObservations(snapshot, today()).map((row: any) => row.identity));
    const decisions=await activePiWaivers(pool);
    const observations = driveObservations(items, today(), execution.packages || [],activeWaiverFolders(snapshot.insertions,decisions,today())).filter((row: any) => !expired.has(row.identity) || current.has(row.identity));
    res.json({ ok: true, ...(await reconcile('drive', observations, snapshot.insertions, { jobId, scanId: execution.snapshot.scanId, scannedAt: execution.snapshot.scannedAt }, startedAt)) });
  } catch { res.status(503).json({ error: 'source_unavailable_or_incomplete', source: 'drive', cursorAdvanced: false }); }
});

// A completed inventory may finish between n8n schedule ticks. Hand it back
// until the existing source receipt confirms consumption, before starting
// another scan. This is durable resource selection, not an API scheduler.
function pendingCompletedInventory(jobs: any[], consumedJobId: string | null, now: number) {
  return jobs.find(job => {
    if (job.id === consumedJobId || job.status !== 'completed') return false;
    let result;
    try { result = typeof job.result_json === 'string' ? JSON.parse(job.result_json) : job.result_json; }
    catch { return false; }
    const execution = result?.execution;
    const age = now - Date.parse(execution?.snapshot?.scannedAt || '');
    return execution?.complete === true && Boolean(execution?.snapshot?.scanId)
      && Number.isFinite(age) && age >= 0 && age <= 10 * 60_000;
  }) || null;
}

router.post('/monitoring/drive/refresh', async (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key || key.length > 200) { res.status(400).json({ error: 'stable_idempotency_key_required' }); return; }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('adops-monitor-drive-job'))");
    const prior = (await client.query('SELECT job_id FROM adops_monitor_requests WHERE request_key=$1', [key])).rows[0];
    if (prior) { await client.query('COMMIT'); res.json({ jobId: prior.job_id, duplicate: true }); return; }
    const consumed = (await client.query("SELECT receipt->>'jobId' AS job_id FROM adops_monitor_sources WHERE source='drive'")).rows[0];
    const completedJobs = (await client.query(`SELECT id,status,result_json FROM ops_jobs
      WHERE kind='drive-inventory-refresh' AND status='completed'
      AND payload_json::jsonb->>'monitorOnly'='true' ORDER BY updated_at DESC LIMIT 5`)).rows;
    const completed = pendingCompletedInventory(completedJobs, consumed?.job_id || null, Date.now());
    const active = (await client.query(`SELECT id,status FROM ops_jobs WHERE kind='drive-inventory-refresh'
      AND status IN ('queued','ready_for_runner','running') AND payload_json::jsonb->>'monitorOnly'='true' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    const jobId = completed?.id || active?.id || randomUUID();
    if (!completed && !active) await client.query(`INSERT INTO ops_jobs
      (id,kind,status,payload_json,result_json,error_text,requested_by,runner_id,created_at,updated_at)
      VALUES($1,'drive-inventory-refresh','ready_for_runner',$2,NULL,NULL,'n8n-monitor-drive',NULL,$3,$3)`,
    [jobId, JSON.stringify({ scanId: randomUUID(), source: 'n8n-monitor-drive', monitorOnly: true, includePackages: true }), new Date().toISOString()]);
    await client.query('INSERT INTO adops_monitor_requests(request_key,job_id) VALUES($1,$2)', [key, jobId]);
    await client.query('COMMIT'); res.status(completed || active ? 200 : 202).json({
      jobId, duplicate: Boolean(completed || active), reusedCompleted: Boolean(completed),
      status: completed?.status || active?.status || 'ready_for_runner',
    });
  } catch { await client.query('ROLLBACK'); res.status(503).json({ error: 'inventory_refresh_unavailable' }); }
  finally { client.release(); }
});

router.get('/monitoring/status', async (_req, res) => {
  await ensureSchema();
  const sources = (await pool.query('SELECT * FROM adops_monitor_sources ORDER BY source')).rows;
  res.json({ schedulerOwner: schedulingOwnedByN8n('calendar') ? 'n8n' : 'legacy', driveMonitorOwner: schedulingOwnedByN8n('drive') ? 'n8n' : 'legacy', publicationEnabled: false, sources, notificationDelivery: whatsappChannelState().delivery });
});

router.post('/monitoring/evidence/dispatch', async (req, res) => {
  let request;
  try { request = validateEvidenceRequest(req.body); }
  catch(error) { res.status(400).json({ error: error instanceof Error ? error.message : 'invalid_request' }); return; }
  if (req.body?.dryRun === true) { res.json({ ok: true, dryRun: true, ...request }); return; }
  if (!schedulingOwnedByN8n('calendar')) { res.status(409).json({ error: 'n8n_calendar_not_owner' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ops-job:${request.jobKind}:${request.idempotencyKey}`]);
    const existing=(await client.query(`SELECT id,status FROM ops_jobs WHERE kind=$1 AND payload_json::jsonb->>'idempotencyKey'=$2 ORDER BY created_at DESC LIMIT 1`,[request.jobKind,request.idempotencyKey])).rows[0];
    if(existing){await client.query('COMMIT');res.json({jobId:existing.id,status:existing.status,duplicate:true});return;}
    if(request.jobKind==='print-batch'){
      const active=(await client.query(`SELECT id,status FROM ops_jobs WHERE kind='print-batch' AND status IN ('queued','ready_for_runner','running')
        AND COALESCE(payload_json::jsonb->>'targetDate',payload_json::jsonb->>'date')=$1 LIMIT 1`,[request.targetDate])).rows[0];
      if(active){await client.query('COMMIT');res.json({jobId:active.id,status:active.status,duplicate:true,reason:'same_date_batch_in_progress'});return;}
    }
    const jobId=randomUUID(),createdAt=new Date().toISOString();
    const competencia=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(request.targetDate+'T12:00:00Z')).replace(' de ','/').toUpperCase();
    const payload={...request,date:request.targetDate,competencia,source:'macmini-canonical-scheduler',orchestrator:'n8n',maxAttempts:1,
      ...(request.routineKind==='daily-print-morning-recovery'?{recoveryMode:'late_publication_recovery'}:{})};
    await client.query(`INSERT INTO ops_jobs(id,kind,status,payload_json,result_json,error_text,requested_by,runner_id,created_at,updated_at)
      VALUES($1,$2,'ready_for_runner',$3,NULL,NULL,'n8n',NULL,$4,$4)`,[jobId,request.jobKind,JSON.stringify(payload),createdAt]);
    await client.query('COMMIT');res.status(202).json({jobId,status:'ready_for_runner',duplicate:false});
  } catch { await client.query('ROLLBACK');res.status(503).json({error:'evidence_dispatch_unavailable'}); }
  finally { client.release(); }
});
router.get('/monitoring/checklists', async (_req, res) => {
  await ensureSchema();
  const items = (await pool.query('SELECT identity,revision,checklist,updated_at FROM adops_monitor_checklists WHERE active=true ORDER BY identity')).rows;
  res.json({ items, count: items.length, publicationEnabled: false });
});
router.get('/monitoring/notifications', async (_req, res) => {
  await ensureSchema();
  const items = (await pool.query("SELECT identity,revision,kind,payload,status,created_at FROM adops_monitor_outbox WHERE status='pending_channel' ORDER BY created_at LIMIT 100")).rows;
  const channel=whatsappChannelState();
  res.json({ items, count: items.length, deliveryEnabled: channel.enabled&&!channel.pilotOnly, pilotEnabled:channel.enabled&&channel.pilotOnly, reason:channel.enabled?(channel.pilotOnly?'pilot_receipt_validation_pending':null):'operational_whatsapp_channel_not_configured' });
});
router.get('/monitoring/openapi.json', (_req, res) => {
  const operations = [
    ['post','/api/monitoring/planilha/scans','Ler planilha e conciliar checklist sem publicar'],
    ['post','/api/monitoring/drive/refresh','Solicitar inventário e leitura de PDFs; exige Idempotency-Key'],
    ['get','/api/monitoring/drive/audit','Conferir cobertura e exclusões por pasta, sem mutação nem envio'],
    ['post','/api/monitoring/drive/scans','Conciliar inventário concluído no mesmo jobId'],
    ['post','/api/monitoring/evidence/dispatch','Executar recurso de evidências no horário solicitado pelo n8n'],
    ['get','/api/monitoring/status','Consultar leituras e proprietário dos agendamentos'],
    ['get','/api/monitoring/checklists','Consultar checklists e mensagens preparadas'],
    ['get','/api/monitoring/notifications','Consultar mensagens sem envio automático'],
    ['get','/api/monitoring/campaign-actions/status','Consultar habilitação e escopo de autorização sem expor participantes'],
    ['get','/api/monitoring/campaign-actions/preparations','Consultar preparo da prévia e o mesmo preflight por identity'],
    ['post','/api/monitoring/campaign-actions/previews','Persistir prévia após preflight e revisão operacional'],
    ['get','/api/monitoring/campaign-actions/previews/{id}','Consultar prévia exata'],
    ['post','/api/monitoring/campaign-actions/previews/{id}/confirm','Registrar confirmação explícita do usuário no Codex'],
    ['post','/api/monitoring/campaign-actions/actions/process','Preparar prévias e processar respostas citadas sem aplicar campanha'],
    ['post','/api/monitoring/campaign-actions/actions/claim','Reservar uma ação confirmada; retomar reserva abandonada sem job'],
    ['post','/api/monitoring/campaign-actions/actions/{id}/apply','Aplicar apenas a revisão explicitamente confirmada'],
    ['get','/api/monitoring/campaign-actions/actions/{id}','Consultar o mesmo trabalho sem reenvio'],
    ['post','/api/monitoring/campaign-actions/actions/verify-publications','Conferir relação e mídia pública sem republicar'],
    ['post','/api/monitoring/evidence-reviews','Conferir evidências sem solicitar captura ou publicação'],
    ['get','/api/monitoring/evidence-reviews/{id}','Consultar snapshot persistido da conferência'],
    ['get','/api/monitoring/evidence-deliveries','Consultar recibos da conferência diária'],
    ['post','/api/monitoring/evidence-deliveries/claim','Reservar um envio sem repetir entrega incerta'],
    ['post','/api/monitoring/evidence-deliveries/receipts','Associar recibo ao mesmo envio reservado'],
    ['get','/api/monitoring/decisions/pi-waivers','Consultar decisões documentais por inserção'],
    ['post','/api/monitoring/decisions/pi-waivers','Registrar dispensa de PI confirmada pelo responsável'],
    ['post','/api/monitoring/decisions/pi-waivers/{id}/revoke','Revogar decisão sem apagar histórico'],
  ];
  const paths: Record<string, any> = {};
  for(const [method,path,summary]of operations){paths[path]??={};paths[path][method]={
    summary, tags: ['AdOps — monitoramento'], security: [{ bearerAuth: [] }],
    responses: Object.fromEntries(['200','201','202','400','401','409','503'].map(status => [status, { description: status === '401' ? 'Acesso negado' : 'Consultar contrato no runbook AdOps n8n' }])),
  };}
  for(const path of Object.keys(paths).filter(path=>path.includes('{id}')))paths[path].parameters=[{in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}}];
  for(const path of ['/api/monitoring/campaign-actions/previews','/api/monitoring/campaign-actions/previews/{id}/confirm','/api/monitoring/campaign-actions/actions/{id}/apply'])paths[path].post.parameters=[{in:'header',name:'Idempotency-Key',required:true,schema:{type:'string',minLength:8,maxLength:160}}];
  paths['/api/monitoring/campaign-actions/previews'].post.requestBody={required:true,content:{'application/json':{schema:{type:'object',required:['identity','expectedRevision','preflightJobId','parsedPi','validation'],properties:{identity:{type:'string'},expectedRevision:{type:'string'},preflightJobId:{type:'string'},parsedPi:{type:'object'},validation:{type:'object'},answerEventKey:{type:'string'}}}}}};
  paths['/api/monitoring/campaign-actions/previews/{id}/confirm'].post.requestBody={required:true,content:{'application/json':{schema:{type:'object',required:['expectedRevision','source','sourceEventKey'],properties:{expectedRevision:{type:'string'},source:{const:'codex_user_confirmation'},sourceEventKey:{type:'string',pattern:'^codex:'}}}}}};
  paths['/api/monitoring/campaign-actions/actions/{id}/apply'].post.requestBody={required:true,content:{'application/json':{schema:{type:'object',required:['expectedRevision'],properties:{expectedRevision:{type:'string'}}}}}};
  paths['/api/monitoring/campaign-actions/preparations'].get.parameters=[{in:'query',name:'identity',schema:{type:'string'}}];
  paths['/api/monitoring/decisions/pi-waivers'].get.parameters=[{in:'query',name:'insertionId',required:true,schema:{type:'integer',minimum:1}}];
  paths['/api/monitoring/decisions/pi-waivers'].post.parameters=[{in:'header',name:'Idempotency-Key',required:true,schema:{type:'string',minLength:8,maxLength:160}}];
  paths['/api/monitoring/decisions/pi-waivers'].post.requestBody={required:true,content:{'application/json':{schema:{type:'object',required:['insertionId','expectedRevision','reason','sourceEventKey'],properties:{insertionId:{type:'integer',minimum:1},expectedRevision:{type:'string'},reason:{type:'string',minLength:8,maxLength:2000},sourceEventKey:{type:'string',pattern:'^codex:'},includeActiveFolder:{type:'boolean',default:false}}}}}};
  paths['/api/monitoring/evidence-reviews'].post.requestBody={required:true,content:{'application/json':{schema:{type:'object',required:['date'],properties:{date:{type:'string',format:'date'},dryRun:{type:'boolean'},final:{type:'boolean'},summaryOnly:{type:'boolean'}}}}}};
  paths['/api/monitoring/drive/refresh'].post.parameters = [{ in: 'header', name: 'Idempotency-Key', required: true, schema: { type: 'string', maxLength: 200 } }];
  paths['/api/monitoring/drive/scans'].post.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', required: ['jobId'], properties: { jobId: { type: 'string', format: 'uuid' } } } } } };
  paths['/api/monitoring/evidence/dispatch'].post.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', required: ['routine','targetDate','dispatchWindow'], properties: {
    routine: { type: 'string', enum: ['daily-print','daily-print-recovery','daily-print-morning-recovery','evidence-monthly-report'] },
    targetDate: { type: 'string', format: 'date' }, dispatchWindow: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }, dryRun: { type: 'boolean', default: false },
  } } } } };
  res.json({ openapi: '3.1.0', info: { title: 'AdOps — recursos para n8n', version: '1.0.0' }, servers: [{ url: 'https://adops-api.codigo5.com.br' }], paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } });
});
export default router;
