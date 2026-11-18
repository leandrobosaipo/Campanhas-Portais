import {Router,type IRouter} from 'express';
import {pool} from '@workspace/db';
import {randomUUID} from 'node:crypto';
import {getEvidenceDateKey} from '../lib/capture-audit';
import {isInstagramEvidenceExcluded} from '../../../../ops/shared/evidence-monitoring-policy.mjs';
import {ADOPS_GROUP,ADOPS_INSTANCE,readWhatsAppConfig} from '../lib/whatsapp-checklist.mjs';
import {reviewDate,reviewHash,classifyReviewProof,legacyDailySelectionDiagnostic} from '../lib/evidence-review-messages.mjs';
import {evidenceReviewMessages} from '../lib/evidence-review-summary.mjs';
import {auditedPrintSelection} from '../lib/audited-print-delivery';

const router:IRouter=Router();
router.use('/monitoring',(req,res,next)=>{const token=process.env.OPS_API_TOKEN?.trim();if(!token||req.header('authorization')!==`Bearer ${token}`){res.status(401).json({error:'unauthorized'});return;}next();});
let initialized:Promise<any>|null=null;
function schema(){return initialized??=pool.query(`CREATE TABLE IF NOT EXISTS adops_evidence_review_snapshots(id TEXT PRIMARY KEY,target_date TEXT NOT NULL,revision TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(target_date,revision));
 CREATE TABLE IF NOT EXISTS adops_evidence_review_deliveries(message_key TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES adops_evidence_review_snapshots(id),identity TEXT NOT NULL,revision TEXT NOT NULL,part TEXT NOT NULL,kind TEXT NOT NULL,request JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',provider_id TEXT UNIQUE,attempted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`).catch(e=>{initialized=null;throw e;});}
const nowParts=()=>{const n=new Date();return {date:n.toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'}),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Cuiaba',hour:'2-digit',hourCycle:'h23'}).format(n))};};
async function internal(path:string){const r=await fetch(`http://127.0.0.1:${process.env.PORT||4011}/api${path}`,{headers:{Authorization:`Bearer ${process.env.OPS_API_TOKEN}`},signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('audit_unavailable');return r.json();}
router.post('/monitoring/evidence-reviews',async(req,res)=>{
 try{
  const date=reviewDate(req.body?.date),now=nowParts();
  const summaryOnly=req.body?.summaryOnly===true;
  if(date>now.date||date<now.date&&req.body?.dryRun!==true&&!summaryOnly){res.status(409).json({error:'historical_review_requires_read_only_or_summary_only',publicationEnabled:false});return;}
  if(req.body?.dryRun!==true&&date===now.date&&now.hour<18){res.status(409).json({error:'before_official_evidence_window',publicationEnabled:false});return;}
  const rows=(await pool.query(`SELECT i.id,i.campanha_id AS "campaignId",c.nome AS "campaignName",c.competencia AS competencia,s.sigla AS site,s.nome AS "portalName",c.pi_codigo AS pi,i.local_formato AS format,i.periodo_inicio AS "periodStart",i.periodo_fim AS "periodEnd",i.local_formato_normalizado AS "localFormatoNormalizado",i.local_formato AS "localFormato",i.media_url AS "mediaUrl",i.banner_publicado_no_site AS published
    FROM insertions i JOIN campaigns c ON c.id=i.campanha_id JOIN sites s ON s.id=i.site_id WHERE i.periodo_inicio<=$1 AND i.periodo_fim>=$1 AND i.archived_at IS NULL AND i.superseded_by_insertion_id IS NULL AND COALESCE(i.status_normalizado,'') NOT IN ('cancelado','arquivado')
    AND (i.banner_publicado_no_site=true OR EXISTS(SELECT 1 FROM adops_monitor_checklists mc CROSS JOIN LATERAL jsonb_array_elements(COALESCE(mc.checklist->'positions','[]'::jsonb)) p WHERE mc.active=true AND p->'insertionIds' @> jsonb_build_array(i.id)))
    ORDER BY i.id`,[date])).rows.filter((r:any)=>!isInstagramEvidenceExcluded(r));
  if(!rows.length){res.status(409).json({error:'no_targets_requires_review',publicationEnabled:false});return;}
  let audit:any;
  try{audit=await internal('/insertions/capture-proof/audit?date='+date);}catch{audit={date,items:[],unavailable:true};}
  if(audit.date!==date||!Array.isArray(audit.items))throw Error('audit_contract_mismatch');
  const ids=rows.map((r:any)=>r.id);
  const evidences=(await pool.query('SELECT insercao_id,titulo FROM evidences WHERE insercao_id=ANY($1::int[])',[ids])).rows;
  const captureLogs=(await pool.query('SELECT insertion_id,count(*)::int AS attempts FROM capture_proof_logs WHERE target_date=$1 AND insertion_id=ANY($2::int[]) GROUP BY insertion_id',[date,ids])).rows;
  const latestDailyBatch=(await pool.query(`SELECT id,kind,status,payload_json,result_json FROM ops_jobs WHERE kind='print-batch' AND status='completed' AND COALESCE(payload_json::jsonb->>'targetDate',payload_json::jsonb->>'date')=$1 AND payload_json::jsonb->>'routineKind'='daily-print' ORDER BY created_at DESC LIMIT 1`,[date])).rows[0]??null;
  const jobs=(await pool.query(`SELECT id,status,payload_json FROM ops_jobs WHERE kind IN ('print-single','print-batch') AND status IN ('queued','ready_for_runner','running') AND COALESCE(payload_json::jsonb->>'targetDate',payload_json::jsonb->>'date')=$1`,[date])).rows;
  const items=[];
  for(const row of rows){
   let proof=audit.items.find((a:any)=>a.insertionId===row.id);
   if(!proof&&!audit.unavailable){try{const p=await internal(`/insertions/${row.id}/capture-proof/status?date=${date}`);proof={...p,status:p.status==='audited'?'ok':p.status};}catch{proof=null;}}
   const activeJobs=jobs.filter((j:any)=>{try{const p=typeof j.payload_json==='string'?JSON.parse(j.payload_json):j.payload_json;return Number(p.insertionId)===row.id||(Array.isArray(p.insertionIds)&&p.insertionIds.includes(row.id))||!p.insertionId&&!p.insertionIds;}catch{return false;}}).map((j:any)=>({id:j.id,status:j.status}));
   const captureAttempts=Number(captureLogs.find((log:any)=>log.insertion_id===row.id)?.attempts??0);
   const selectionDiagnostic=legacyDailySelectionDiagnostic(row,latestDailyBatch,{date,captureAttempts});
   items.push(classifyReviewProof({...row,evidenceCount:evidences.filter((e:any)=>e.insercao_id===row.id&&getEvidenceDateKey(e.titulo)===date).length},proof,{date,due:date<now.date||now.hour>=18,activeJobs,captureAttempts,selectionDiagnostic}));
  }
  for(const item of items){const row=rows.find((r:any)=>r.id===item.insertionId);Object.assign(item,{periodStart:row?.periodStart,periodEnd:row?.periodEnd,portalName:row?.portalName});}
  const final=req.body?.final===true&&now.hour>=22;
  const review={date,final,items,manual:date<now.date},pack=evidenceReviewMessages(review),revision=reviewHash([review,pack.counts,summaryOnly]);
  if(req.body?.dryRun===true){res.json({...review,counts:pack.counts,revision,messages:pack.messages,dryRun:true,publicationEnabled:false});return;}
  const images:any[]=[],imageBlocked:number[]=[];
  if(!summaryOnly||req.body?.includeImages===true){
   for(const item of items.filter((i:any)=>i.state==='approved')){
    const selection=await auditedPrintSelection(`${date} #${item.insertionId}`,now.date);
    if(!selection.print){imageBlocked.push(item.insertionId);continue;}
    const customer=(await pool.query('SELECT cl.nome FROM clients cl JOIN campaigns c ON c.cliente_id=cl.id WHERE c.id=$1',[item.campaignId])).rows[0];
    if(!customer?.nome){imageBlocked.push(item.insertionId);continue;}
    const text=[`Campanha: ${item.campaignName}`,`Cliente: ${customer.nome}`,`Portal: ${item.portalName||item.site}`,`Posição: ${item.format}`,`Data da evidência: ${date.split('-').reverse().join('/')}`,`PI: ${item.pi}`,item.reconstructed?'Reconstrução retroativa auditada; não comprova a exibição original naquele dia.':'Print aprovado na auditoria desta posição e data.',`Relatório: ${item.reportUrl}`].join('\n');
    images.push({item,print:selection.print,text,event:`adops:daily-proof:${date}:${item.insertionId}`});
   }
  }
  await schema();const client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['adops-evidence-review:'+date]);
   const id=randomUUID();const saved=(await client.query(`INSERT INTO adops_evidence_review_snapshots(id,target_date,revision,payload) VALUES($1,$2,$3,$4) ON CONFLICT(target_date,revision) DO UPDATE SET revision=EXCLUDED.revision RETURNING id`,[id,date,revision,JSON.stringify({...review,counts:pack.counts})])).rows[0];
   for(const item of items.filter((i:any)=>i.state==='approved'))await client.query("UPDATE adops_evidence_review_deliveries SET status='superseded',updated_at=now() WHERE identity=$1 AND status='pending'",[`evidence:${item.insertionId}:${date}`]);
   for(const m of pack.messages.filter((m:any)=>!summaryOnly||m.kind==='summary')){const request={number:ADOPS_GROUP,...(m.part==='poll'?m.poll:{text:m.text,linkPreview:false})};await client.query("UPDATE adops_evidence_review_deliveries SET status='superseded',updated_at=now() WHERE identity=$1 AND revision<>$2 AND status='pending'",[m.identity,m.revision]);await client.query('INSERT INTO adops_evidence_review_deliveries(message_key,review_id,identity,revision,part,kind,request) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[m.key,saved.id,m.identity,m.revision,m.part,m.kind,JSON.stringify(request)]);}
   let imagesQueued=0;
   for(const image of images){
    const previous=await client.query("SELECT 1 FROM adops_wa_menu_deliveries WHERE event_key=$1 OR (request->'_auditedPrint'->>'insertionId'=$2 AND request->'_auditedPrint'->>'date'=$3 AND request->>'number'=$4) LIMIT 1",[image.event,String(image.item.insertionId),date,ADOPS_GROUP]);
    if(previous.rowCount)continue;
    const queued=await client.query("INSERT INTO adops_wa_menu_deliveries(message_key,event_key,identity,revision,part,request) VALUES($1,$2,$3,$4,'text',$5) ON CONFLICT DO NOTHING",[image.event+':image',image.event,`evidence:${image.item.insertionId}:${date}`,image.print.sha256,JSON.stringify({number:ADOPS_GROUP,text:image.text,linkPreview:false,_auditedPrint:image.print})]);
    imagesQueued+=queued.rowCount??0;
   }
   await client.query('COMMIT');res.json({reviewId:saved.id,date,counts:pack.counts,revision,imagesQueued,imageBlocked,publicationEnabled:false});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }catch(e){res.status(e instanceof RangeError||String((e as Error).message)==='invalid_date'?400:503).json({error:(e as Error).message==='invalid_date'?'invalid_date':'evidence_review_unavailable',publicationEnabled:false});}
});
router.get('/monitoring/evidence-reviews/:id',async(req,res)=>{try{await schema();const r=(await pool.query('SELECT id,target_date,payload,created_at FROM adops_evidence_review_snapshots WHERE id=$1',[req.params.id])).rows[0];if(!r){res.status(404).json({error:'review_not_found'});return;}res.json(r);}catch{res.status(503).json({error:'review_unavailable'});}});
router.get('/monitoring/evidence-deliveries',async(_req,res)=>{try{await schema();res.json({items:(await pool.query('SELECT message_key,identity,kind,part,status,provider_id,attempted_at FROM adops_evidence_review_deliveries ORDER BY updated_at DESC LIMIT 100')).rows,publicationEnabled:false});}catch{res.status(503).json({error:'delivery_status_unavailable'});}});
router.post('/monitoring/evidence-deliveries/claim',async(_req,res)=>{
 const cfg=readWhatsAppConfig();if(cfg.enabled!==true||cfg.pilotOnly!==false){res.json({items:[],enabled:false});return;}
 await schema();const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('adops-evidence-delivery-throttle-v2'))");
  if((await client.query("SELECT 1 FROM adops_evidence_review_deliveries WHERE attempted_at>now()-interval '60 seconds' LIMIT 1")).rowCount){await client.query('COMMIT');res.json({items:[],throttled:true});return;}
  const row=(await client.query(`SELECT d.* FROM adops_evidence_review_deliveries d JOIN adops_evidence_review_snapshots s ON s.id=d.review_id WHERE d.status='pending' AND d.kind<>'proof' AND (d.kind<>'summary' OR s.payload->>'final'='true' OR s.payload->>'manual'='true') AND (d.part='text' OR EXISTS(SELECT 1 FROM adops_evidence_review_deliveries t WHERE t.identity=d.identity AND t.revision=d.revision AND t.part='text' AND t.status IN ('accepted','delivered','read'))) ORDER BY CASE d.kind WHEN 'summary' THEN 0 ELSE 1 END,d.updated_at,d.message_key FOR UPDATE OF d SKIP LOCKED LIMIT 1`)).rows[0];
  if(!row){await client.query('COMMIT');res.json({items:[]});return;}
  // Store linkage in the established inbound registry before the external send.
  await client.query(`INSERT INTO adops_wa_deliveries(message_key,identity,revision,package_key,part,group_jid,request) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[row.message_key,row.identity,row.revision,'evidence:'+row.identity+':'+row.revision,row.part,ADOPS_GROUP,JSON.stringify(row.request)]);
  await client.query("UPDATE adops_evidence_review_deliveries SET status='delivery_unknown',attempted_at=now(),updated_at=now() WHERE message_key=$1",[row.message_key]);
  await client.query('COMMIT');res.json({items:[{messageKey:row.message_key,identity:row.identity,part:row.part,instance:ADOPS_INSTANCE,request:row.request}],publicationEnabled:false});
 }catch{await client.query('ROLLBACK');res.status(503).json({error:'evidence_delivery_claim_unavailable'});}finally{client.release();}
});
router.post('/monitoring/evidence-deliveries/receipts',async(req,res)=>{
 const {messageKey,receipt}=req.body??{},id=receipt?.key?.id;
 if(typeof messageKey!=='string'||typeof id!=='string'||receipt?.key?.remoteJid!==ADOPS_GROUP){res.status(400).json({error:'exact_group_receipt_required'});return;}
 await schema();const client=await pool.connect();try{await client.query('BEGIN');const row=(await client.query('SELECT * FROM adops_evidence_review_deliveries WHERE message_key=$1 FOR UPDATE',[messageKey])).rows[0];
  if(!row){await client.query('ROLLBACK');res.status(404).json({error:'claim_not_found'});return;}
  if(row.provider_id&&row.provider_id!==id||row.status==='pending'){await client.query('ROLLBACK');res.status(409).json({error:'receipt_conflict'});return;}
  const saved=await client.query("UPDATE adops_evidence_review_deliveries SET status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,provider_id=$2,updated_at=now() WHERE message_key=$1 RETURNING status",[messageKey,id]);
  const linked=await client.query("UPDATE adops_wa_deliveries SET provider_id=$2,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,receipt=$3,updated_at=now() WHERE message_key=$1 AND (provider_id IS NULL OR provider_id=$2)",[messageKey,id,JSON.stringify({key:receipt.key,message:receipt.message,status:receipt.status})]);
  // Poll cryptographic context stays only in the private ledger, as in the established receiver.
  if(linked.rowCount!==1)throw Error('inbound_registry_receipt_conflict');
  await client.query('COMMIT');res.json({ok:true,messageKey,providerId:id,status:saved.rows[0].status,deliveryConfirmed:['delivered','read'].includes(saved.rows[0].status)});
 }catch{await client.query('ROLLBACK');res.status(503).json({error:'evidence_receipt_unavailable'});}finally{client.release();}
});
export default router;
