import {Router} from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {pool} from '@workspace/db';
import {ensurePiWaiverSchema,scopeHash,waiverScope} from '../lib/pi-waivers.mjs';
const router=Router();
router.use('/monitoring/decisions',(req,res,next)=>{const token=req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!process.env.OPS_API_TOKEN||token!==process.env.OPS_API_TOKEN){res.status(401).json({error:'unauthorized'});return;}next();});
const eventValid=(v:unknown)=>typeof v==='string'&&/^codex:[A-Za-z0-9._:-]{8,240}$/.test(v);
router.get('/monitoring/decisions/pi-waivers',async(req,res)=>{
 const id=Number(req.query.insertionId);if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:'insertion_id_required'});return;}
 if(!(await pool.query("SELECT to_regclass('adops_pi_waivers') AS name")).rows[0]?.name){res.json({items:[],commercialMutation:false});return;}
 const items=(await pool.query('SELECT * FROM adops_pi_waivers WHERE insertion_id=$1 ORDER BY created_at,id',[id])).rows;res.json({items,commercialMutation:false});
});
router.post('/monitoring/decisions/pi-waivers',async(req,res)=>{
 const {insertionId,expectedRevision,reason,sourceEventKey,includeActiveFolder=false}=req.body??{},key=req.header('idempotency-key')||'';
 if(!Number.isSafeInteger(insertionId)||insertionId<=0||typeof expectedRevision!=='string'||!expectedRevision||typeof reason!=='string'||reason.trim().length<8||reason.length>2000||!eventValid(sourceEventKey)||typeof includeActiveFolder!=='boolean'||!/^[A-Za-z0-9._:-]{8,160}$/.test(key)){res.status(400).json({error:'exact_decision_scope_revision_reason_codex_source_and_key_required'});return;}
 const requestHash=createHash('sha256').update(JSON.stringify({insertionId,expectedRevision,reason,sourceEventKey,includeActiveFolder})).digest('hex'),client=await pool.connect();
 try{await client.query('BEGIN');await ensurePiWaiverSchema(client);await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['pi-waiver:'+insertionId]);
  const existing=(await client.query('SELECT * FROM adops_pi_waivers WHERE idempotency_key=$1',[key])).rows[0];
  if(existing){await client.query('ROLLBACK');if(existing.request_hash!==requestHash){res.status(409).json({error:'idempotency_payload_conflict'});return;}res.json({decision:existing,duplicate:true,commercialMutation:false});return;}
  const i=(await client.query(`SELECT i.id,i.campanha_id AS "campaignId",s.sigla AS "siteSigla",i.local_formato AS "localFormato",i.local_formato_normalizado AS "localFormatoNormalizado",i.periodo_inicio AS "periodoInicio",i.periodo_fim AS "periodoFim",c.nome AS "campaignName",i.observacoes,i.archived_at,i.superseded_by_insertion_id FROM insertions i JOIN campaigns c ON c.id=i.campanha_id JOIN sites s ON s.id=i.site_id WHERE i.id=$1`,[insertionId])).rows[0];
  if(!i||i.archived_at||i.superseded_by_insertion_id){await client.query('ROLLBACK');res.status(409).json({error:'active_insertion_required'});return;}
  const rows=(await client.query(`SELECT identity,revision FROM adops_monitor_checklists WHERE active=true AND EXISTS(SELECT 1 FROM jsonb_array_elements(checklist->'positions') p WHERE p->'insertionIds' @> jsonb_build_array($1::int)) FOR UPDATE`,[insertionId])).rows;
  if(rows.length!==1||rows[0].revision!==expectedRevision){await client.query('ROLLBACK');res.status(409).json({error:'checklist_revision_changed_or_ambiguous'});return;}
  const folders=[...new Set([...String(i.observacoes??'').matchAll(/(?:\/drive\/|drive\.google\.com\/drive\/folders\/)([A-Za-z0-9_-]{10,})/g)].map(m=>m[1]))];
  if(includeActiveFolder&&folders.length!==1){await client.query('ROLLBACK');res.status(409).json({error:'exact_existing_active_folder_required'});return;}
  const scope=waiverScope(i),hash=scopeHash(i);
  const previous=(await client.query("SELECT * FROM adops_pi_waivers WHERE insertion_id=$1 AND scope_hash=$2 AND status='active'",[insertionId,hash])).rows[0];
  if(previous){await client.query('ROLLBACK');res.status(409).json({error:'active_decision_already_exists',decisionId:previous.id});return;}
  const saved=(await client.query(`INSERT INTO adops_pi_waivers(id,insertion_id,identity,approved_revision,scope_hash,scope,reason,source_event_key,idempotency_key,request_hash,active_folder_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[randomUUID(),insertionId,rows[0].identity,expectedRevision,hash,JSON.stringify(scope),reason.trim(),sourceEventKey,key,requestHash,includeActiveFolder?folders[0]:null])).rows[0];
  await client.query('COMMIT');res.status(201).json({decision:saved,commercialMutation:false,publicationEnabled:false,nextStep:'next_successful_monitor_scan'});
 }catch{await client.query('ROLLBACK');res.status(503).json({error:'pi_waiver_unavailable'});}finally{client.release();}
});
router.post('/monitoring/decisions/pi-waivers/:id/revoke',async(req,res)=>{
 const {reason,sourceEventKey}=req.body??{};if(!/^[0-9a-f-]{36}$/i.test(req.params.id)||typeof reason!=='string'||reason.trim().length<8||!eventValid(sourceEventKey)){res.status(400).json({error:'decision_reason_and_codex_source_required'});return;}
 await ensurePiWaiverSchema(pool);const row=(await pool.query("UPDATE adops_pi_waivers SET status='revoked',revoked_at=now(),revoke_reason=$2,revoke_source_event_key=$3 WHERE id=$1 AND status='active' RETURNING *",[req.params.id,reason.trim(),sourceEventKey])).rows[0];
 if(!row){res.status(409).json({error:'active_decision_not_found'});return;}res.json({decision:row,commercialMutation:false,publicationEnabled:false});
});
export default router;
