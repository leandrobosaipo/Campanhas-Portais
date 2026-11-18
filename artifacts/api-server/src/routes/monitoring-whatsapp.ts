import {Router} from 'express';
import {existsSync,copyFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acknowledgement} from '../lib/whatsapp-feedback.mjs';
import {menuCommand} from '../lib/whatsapp-menu.mjs';
import {campaignNotificationState,campaignProgress,loadCampaignActionProgress} from '../lib/campaign-notification-policy.mjs';
import {enrichWhatsAppChecklist} from '../lib/whatsapp-operational-context';
import {formatWhatsAppContext} from '../lib/whatsapp-message-context.mjs';
import {pool} from '@workspace/db';
import {ADOPS_GROUP,ADOPS_INSTANCE,buildWhatsAppChecklist,digest,decryptVote,optionNames,unwrapMessage,eventParts,receiptSummary,readWhatsAppConfig,answerEventKey} from '../lib/whatsapp-checklist.mjs';
const router=Router();
router.use('/monitoring/whatsapp',(req,res,next)=>{const token=req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();if(!process.env.OPS_API_TOKEN||token!==process.env.OPS_API_TOKEN){res.status(401).json({error:'unauthorized'});return;}next();});
const config=readWhatsAppConfig;
let schemaPromise:Promise<unknown>|null=null;
function schema(){if(!schemaPromise)schemaPromise=pool.query(`
 CREATE TABLE IF NOT EXISTS adops_wa_deliveries(message_key TEXT PRIMARY KEY,identity TEXT NOT NULL,revision TEXT NOT NULL,package_key TEXT NOT NULL,part TEXT NOT NULL CHECK(part IN ('text','poll')),group_jid TEXT NOT NULL,request JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'delivery_unknown',provider_id TEXT UNIQUE,receipt JSONB,attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS adops_wa_answers(event_key TEXT PRIMARY KEY,provider_id TEXT,reply_to TEXT,identity TEXT,revision TEXT,group_jid TEXT NOT NULL,participant TEXT,kind TEXT NOT NULL,text_value TEXT,selected_options JSONB,status TEXT NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX IF NOT EXISTS adops_wa_answers_provider_once ON adops_wa_answers(kind,provider_id,(COALESCE(reply_to,''))) WHERE provider_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS adops_wa_events(event_key TEXT PRIMARY KEY,event_name TEXT NOT NULL,data JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'received',received_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS adops_wa_feedback(message_key TEXT PRIMARY KEY,answer_event_key TEXT NOT NULL UNIQUE REFERENCES adops_wa_answers(event_key),identity TEXT,phase TEXT NOT NULL CHECK(phase='received'),request JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',provider_id TEXT UNIQUE,attempted_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 `).catch(e=>{schemaPromise=null;throw e;});return schemaPromise;}
router.post('/monitoring/whatsapp/claim',async(_req,res)=>{
 const cfg=config();if(cfg.enabled!==true){res.json({items:[],enabled:false,publicationEnabled:false});return;}
 await schema();const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('adops-whatsapp-claim-v1'))");
  const rows=(await client.query(`SELECT c.identity,c.revision,c.checklist,c.updated_at FROM adops_monitor_checklists c WHERE c.active=true AND
   (c.identity=$1 OR ($2=false AND EXISTS(SELECT 1 FROM adops_monitor_outbox o WHERE o.identity=c.identity AND o.revision=c.revision AND o.created_at>=$3::timestamptz)))
   ORDER BY CASE WHEN c.identity=$1 THEN 0 ELSE 1 END,c.updated_at,c.identity`,[cfg.pilotIdentity||'OMT:9784',cfg.pilotOnly!==false,cfg.enabledAt||new Date().toISOString()])).rows;
  for(const row of rows){let pack=buildWhatsAppChecklist(row);if(!pack)continue;
   if(await loadCampaignActionProgress(client,row.identity,row.checklist))continue;
   const history=(await client.query('SELECT revision,checklist,created_at FROM adops_monitor_checklist_versions WHERE identity=$1 ORDER BY created_at DESC LIMIT 100',[row.identity])).rows;
   const deliveries=(await client.query(`SELECT d.package_key,d.status,d.attempted_at,v.checklist FROM adops_wa_deliveries d LEFT JOIN adops_monitor_checklist_versions v ON v.identity=d.identity AND v.revision=d.revision WHERE d.identity=$1`,[row.identity])).rows;
   const legacyReserved=deliveries.some(d=>d.package_key===pack.key);
   const notice=campaignNotificationState(row,history,deliveries,{packageKey:pack.key});
   const packageKey=legacyReserved?pack.key:'campaign-notice-v1:'+notice.fingerprint;
   if(!campaignNotificationState(row,history,deliveries,{packageKey}).eligible)continue;
   row.checklist=await enrichWhatsAppChecklist(row.checklist,{client});pack=buildWhatsAppChecklist(row);if(!pack)continue;
   // Preserve already reserved legacy text/poll pairs; new notices use one part.
   pack.key=packageKey;
   if(!legacyReserved)pack.text+='\n\n*Próximo passo:* confira a prévia e responda “Solicitar prévia” se quiser que a equipe AdOps analise o pedido. A resposta não cadastra nem publica automaticamente.';
   for(const part of legacyReserved?['text','poll']:['text']){
    const key=pack.key+':'+part;const old=(await client.query('SELECT status FROM adops_wa_deliveries WHERE message_key=$1',[key])).rows[0];if(old)continue;
    const previous=(await client.query("SELECT message_key FROM adops_wa_deliveries WHERE identity=$1 AND revision=$2 AND part=$3 AND message_key<>$4 AND status IN ('pending','delivery_unknown','accepted','delivered','read') LIMIT 1",[row.identity,row.revision,part,key])).rows[0];if(previous)continue;
    if(part==='poll'){const text=(await client.query('SELECT status FROM adops_wa_deliveries WHERE message_key=$1',[pack.key+':text'])).rows[0];if(!text||!['accepted','delivered','read'].includes(text.status))break;}
    const request=part==='text'?{number:ADOPS_GROUP,text:pack.text,linkPreview:false}:{number:ADOPS_GROUP,...pack.poll};
    await client.query('INSERT INTO adops_wa_deliveries(message_key,identity,revision,package_key,part,group_jid,request) VALUES($1,$2,$3,$4,$5,$6,$7)',[key,row.identity,row.revision,pack.key,part,ADOPS_GROUP,JSON.stringify(request)]);
    await client.query('COMMIT');res.json({items:[{messageKey:key,identity:row.identity,part,instance:ADOPS_INSTANCE,request}],enabled:true,publicationEnabled:false});return;
   }
  }
  await client.query('COMMIT');res.json({items:[],enabled:true,publicationEnabled:false});
 }catch(e){await client.query('ROLLBACK');res.status(503).json({error:'whatsapp_claim_unavailable'});}finally{client.release();}
});
router.get('/monitoring/whatsapp/preview',async(req,res)=>{
 const identity=typeof req.query.identity==='string'?req.query.identity:'';
 const row=(await pool.query('SELECT identity,revision,checklist,updated_at FROM adops_monitor_checklists WHERE identity=$1 AND active=true',[identity])).rows[0];
 if(!row){res.status(404).json({error:'active_checklist_not_found'});return;}
 try{const answer=(await pool.query("SELECT a.revision,a.selected_options,a.text_value,v.checklist FROM adops_wa_answers a LEFT JOIN adops_monitor_checklist_versions v ON v.identity=a.identity AND v.revision=a.revision WHERE a.identity=$1 AND a.status='linked_for_review' ORDER BY a.received_at DESC LIMIT 1",[identity])).rows[0];const history=(await pool.query('SELECT revision,checklist,created_at FROM adops_monitor_checklist_versions WHERE identity=$1 ORDER BY created_at DESC LIMIT 100',[identity])).rows;const deliveries=(await pool.query('SELECT d.package_key,d.status,d.attempted_at,v.checklist FROM adops_wa_deliveries d LEFT JOIN adops_monitor_checklist_versions v ON v.identity=d.identity AND v.revision=d.revision WHERE d.identity=$1',[identity])).rows;const action=await loadCampaignActionProgress(pool,identity,row.checklist);const notification=action?{state:'confirmed_action_tracked',eligible:false,actionId:action.actionId}:campaignNotificationState(row,history,deliveries,{});const progress=notification.state==='period_ended'?{phase:'period_ended',publicationEnabled:false,commercialMutation:false,nextStep:notification.reason}:campaignProgress(row.checklist,answer,answer?.checklist,action);row.checklist=await enrichWhatsAppChecklist(row.checklist);res.json({identity,revision:row.revision,progress,notification,checklist:row.checklist,decision:action?null:buildWhatsAppChecklist(row),context:formatWhatsAppContext(row.checklist),readOnly:true});}
 catch{res.status(503).json({error:'whatsapp_context_unavailable',readOnly:true});}
});
router.post('/monitoring/whatsapp/receipts',async(req,res)=>{
 await schema();const {messageKey,receipt}=req.body??{};const summary=receiptSummary(receipt);
 if(typeof messageKey!=='string'||!summary.id||summary.remoteJid!==ADOPS_GROUP){res.status(400).json({error:'exact_message_receipt_required'});return;}
 const before=(await pool.query('SELECT provider_id FROM adops_wa_deliveries WHERE message_key=$1',[messageKey])).rows[0];if(!before){res.status(404).json({error:'claim_not_found'});return;}if(before.provider_id&&before.provider_id!==summary.id){res.status(409).json({error:'provider_message_id_conflict'});return;}
 const saved=await pool.query("UPDATE adops_wa_deliveries SET provider_id=$2,receipt=$3,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,updated_at=now() WHERE message_key=$1 AND (provider_id IS NULL OR provider_id=$2) RETURNING provider_id,identity,revision,package_key",[messageKey,summary.id,JSON.stringify({key:receipt.key,message:receipt.message,status:receipt.status})]);
 if(!saved.rowCount){res.status(409).json({error:'provider_message_id_conflict'});return;}
 const item=saved.rows[0];
 await pool.query("UPDATE adops_monitor_outbox SET status='accepted_whatsapp' WHERE identity=$1 AND revision=$2 AND status='pending_channel' AND (SELECT count(*) FROM adops_wa_deliveries WHERE package_key=$3 AND status IN ('accepted','delivered','read'))=CASE WHEN $3 LIKE 'campaign-notice-v1:%' THEN 1 ELSE 2 END",[item.identity,item.revision,item.package_key]);
 await processPending();res.json({ok:true,messageKey,providerId:summary.id,status:'accepted',deliveryConfirmed:false,publicationEnabled:false});
});
async function pollContext(id:string){return (await pool.query("SELECT * FROM adops_wa_deliveries WHERE provider_id=$1 AND part='poll' AND group_jid=$2",[id,ADOPS_GROUP])).rows[0];}
async function saveAnswer(a:any){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const found=a.replyTo?(await client.query(`SELECT identity,revision FROM (
   SELECT d.identity,d.revision,0 AS priority FROM adops_wa_deliveries d WHERE d.provider_id=$1 AND d.group_jid=$2
   UNION ALL
   SELECT f.identity,origin.revision,1 AS priority FROM adops_wa_feedback f JOIN adops_wa_answers origin ON origin.event_key=f.answer_event_key
    WHERE f.provider_id=$1 AND origin.group_jid=$2 AND f.identity IS NOT NULL
  ) linked ORDER BY priority LIMIT 1`,[a.replyTo,ADOPS_GROUP])).rows[0]:null;
  const inserted=await client.query(`INSERT INTO adops_wa_answers(event_key,provider_id,reply_to,identity,revision,group_jid,participant,kind,text_value,selected_options,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING event_key,identity,kind,status`,[answerEventKey(a),a.id||null,a.replyTo||null,found?.identity||null,found?.revision||null,ADOPS_GROUP,a.participant||null,a.kind,a.text||null,JSON.stringify(a.options??null),found?'linked_for_review':'unlinked_for_review']);
  // Historical answers and duplicate provider events never enqueue a new acknowledgement.
  const answer=inserted.rows[0], isMenu=menuCommand({group_jid:ADOPS_GROUP,participant:a.participant,identity:found?.identity,kind:a.kind,text_value:a.text,selected_options:a.options},{group:ADOPS_GROUP,senderAliases:config().senderAliases??[]});
  const context=found?.identity?(await client.query('SELECT checklist FROM adops_monitor_checklists WHERE identity=$1 AND active=true',[found.identity])).rows[0]?.checklist:null;
  const ack=isMenu?null:acknowledgement(answer?{...answer,text_value:a.text,selected_options:a.options}:null,context);
  if(ack)await client.query(`INSERT INTO adops_wa_feedback(message_key,answer_event_key,identity,phase,request) VALUES($1,$2,$3,'received',$4) ON CONFLICT DO NOTHING`,[ack.key,answer.event_key,answer.identity,JSON.stringify({number:ADOPS_GROUP,text:ack.text,linkPreview:false})]);
  await client.query('COMMIT');return inserted;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
router.get('/monitoring/whatsapp/feedback/status',async(_req,res)=>{
 await schema();const items=(await pool.query('SELECT message_key,answer_event_key,identity,phase,status,provider_id,created_at,attempted_at,updated_at FROM adops_wa_feedback ORDER BY created_at DESC LIMIT 100')).rows;
 res.json({items,publicationEnabled:false});
});
router.post('/monitoring/whatsapp/feedback/claim',async(_req,res)=>{
 if(config().enabled!==true){res.json({items:[],enabled:false});return;}
 await schema();
 const row=(await pool.query(`WITH next AS (SELECT message_key FROM adops_wa_feedback WHERE status='pending' AND provider_id IS NULL AND attempted_at IS NULL ORDER BY created_at,message_key FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE adops_wa_feedback f SET status='delivery_unknown',attempted_at=now(),updated_at=now() FROM next WHERE f.message_key=next.message_key RETURNING f.message_key,f.identity,f.phase,f.request`)).rows[0];
 res.json({items:row?[{messageKey:row.message_key,identity:row.identity,phase:row.phase,instance:ADOPS_INSTANCE,request:row.request}]:[],publicationEnabled:false});
});
router.post('/monitoring/whatsapp/feedback/receipts',async(req,res)=>{
 await schema();const {messageKey,receipt}=req.body??{},summary=receiptSummary(receipt);
 if(typeof messageKey!=='string'||!summary.id||summary.remoteJid!==ADOPS_GROUP){res.status(400).json({error:'exact_message_receipt_required'});return;}
 const saved=await pool.query(`UPDATE adops_wa_feedback SET provider_id=$2,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,updated_at=now() WHERE message_key=$1 AND attempted_at IS NOT NULL AND (provider_id IS NULL OR provider_id=$2) RETURNING message_key`,[messageKey,summary.id]);
 if(!saved.rowCount){res.status(409).json({error:'feedback_claim_or_provider_conflict'});return;}
 res.json({ok:true,messageKey,providerId:summary.id,status:'accepted',deliveryConfirmed:false,publicationEnabled:false});
});
async function processEvent(event:any,data:any){
 const key=data.key??{};const message=unwrapMessage(data.message);const id=key.id??data.id;const participant=key.participant??data.participant;
 const update=data.update??data;const status=update.status??data.status;
 if(id&&['3','4','5','DELIVERY_ACK','READ','PLAYED'].includes(String(status)))await pool.query("UPDATE adops_wa_deliveries SET status=CASE WHEN $2 IN ('4','5','READ','PLAYED') THEN 'read' WHEN status='read' THEN status ELSE 'delivered' END,updated_at=now() WHERE provider_id=$1 AND group_jid=$3",[id,String(status),ADOPS_GROUP]);
 if(id&&['3','4','5','DELIVERY_ACK','READ','PLAYED'].includes(String(status)))await pool.query("UPDATE adops_wa_feedback SET status=CASE WHEN $2 IN ('4','5','READ','PLAYED') THEN 'read' WHEN status='read' THEN status ELSE 'delivered' END,updated_at=now() WHERE provider_id=$1",[id,String(status)]);
 const updates=update.pollUpdates??data.pollUpdates;
 if(Array.isArray(updates)){const ctx=await pollContext(id);if(!ctx)return false;for(const vote of updates){if(vote.pollUpdateMessageKey?.fromMe===true)continue;if(vote.vote?.selectedOptions){try{await saveAnswer({kind:'poll',id:vote.pollUpdateMessageKey?.id||digest(vote),replyTo:id,participant:vote.pollUpdateMessageKey?.participant,options:optionNames(vote.vote.selectedOptions,ctx.request.values)});}catch{return false;}}}return true;}
 if(key.fromMe===true)return true;
 const text=message.conversation??message.extendedTextMessage?.text;
 if(typeof text==='string'&&id){await saveAnswer({kind:'text',id,replyTo:message.extendedTextMessage?.contextInfo?.stanzaId??message.contextInfo?.stanzaId,participant,text:text.slice(0,12000)});return true;}
 const poll=message.pollUpdateMessage;
 if(poll){const pollId=poll.pollCreationMessageKey?.id;const ctx=await pollContext(pollId);if(!ctx?.receipt)return false;const original=unwrapMessage(ctx.receipt.message);const secret=original.messageContextInfo?.messageSecret;if(!secret)return false;
  try{const hashes=decryptVote(poll.vote,{pollId,secret,creators:[poll.pollCreationMessageKey?.participant,ctx.receipt.key?.participant,...(config().senderAliases??[])],voters:[participant,key.participantAlt,data.participantAlt]});const options=optionNames(hashes,ctx.request.values);await saveAnswer({kind:'poll',id,replyTo:pollId,participant,options});return true;}catch{return false;}
 }
 return true;
}
async function processPending(){const rows=(await pool.query("SELECT event_key,event_name,data FROM adops_wa_events WHERE status IN ('received','pending_decode') ORDER BY received_at LIMIT 100")).rows;for(const row of rows){const done=await processEvent(row.event_name,row.data);await pool.query('UPDATE adops_wa_events SET status=$2 WHERE event_key=$1',[row.event_key,done?'processed':'pending_decode']);}}
async function validationReady(){const cfg=config();const row=(await pool.query(`SELECT count(DISTINCT a.kind)::int count FROM adops_wa_answers a JOIN adops_wa_deliveries d ON d.provider_id=a.reply_to WHERE a.identity=$1 AND a.status='linked_for_review' AND a.participant IS NOT NULL AND a.participant<>'' AND ((a.kind='text' AND d.part='text' AND length(trim(a.text_value))>0) OR (a.kind='poll' AND d.part='poll' AND CASE WHEN jsonb_typeof(a.selected_options)='array' THEN jsonb_array_length(a.selected_options) ELSE 0 END>0))`,[cfg.pilotIdentity||'OMT:9784'])).rows[0];return row.count===2;}
router.post('/monitoring/whatsapp/activate',async(_req,res)=>{
 await schema();const before=config();if(before.enabled!==true){res.status(409).json({error:'channel_disabled'});return;}
 if(!await validationReady()){res.status(409).json({error:'real_vote_and_quoted_text_required',publicationEnabled:false});return;}
 if(before.pilotOnly===false){res.json({ok:true,alreadyActive:true,pilotOnly:false,publicationEnabled:false});return;}
 const current=config();if(current.enabled!==true||current.enabledAt!==before.enabledAt){res.status(409).json({error:'channel_configuration_changed'});return;}
 const file=join(process.env.ADOPS_PROJECT_ROOT||process.cwd(),'config/adops-whatsapp.json'),backup=file+'.pilot-backup.json';if(!existsSync(backup))copyFileSync(file,backup);
 const next=file+'.'+randomUUID()+'.next';writeFileSync(next,JSON.stringify({...current,pilotOnly:false,validatedAt:new Date().toISOString()},null,2),{mode:0o600});renameSync(next,file);
 res.json({ok:true,enabled:true,pilotOnly:false,publicationEnabled:false});
});
router.post('/monitoring/whatsapp/events',async(req,res)=>{
 await schema();const parts=eventParts(req.body??{});if(!parts.length){res.json({ok:true,ignored:true,publicationEnabled:false});return;}
 for(const part of parts){const data=part.data;const safe={key:data.key,id:data.id,remoteJid:data.remoteJid,message:data.message,update:data.update,status:data.status,pollUpdates:data.pollUpdates,participant:data.participant,participantAlt:data.participantAlt};await pool.query('INSERT INTO adops_wa_events(event_key,event_name,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[digest([part.event,safe]),part.event,JSON.stringify(safe)]);}
 await processPending();res.json({ok:true,accepted:parts.length,publicationEnabled:false});
});
router.get('/monitoring/whatsapp/status',async(_req,res)=>{await schema();const cfg=config();const deliveries=(await pool.query('SELECT message_key,identity,revision,part,status,provider_id,attempted_at,updated_at FROM adops_wa_deliveries ORDER BY attempted_at DESC LIMIT 100')).rows;const answers=(await pool.query('SELECT event_key,provider_id,reply_to,identity,revision,kind,text_value,selected_options,status,received_at FROM adops_wa_answers ORDER BY received_at DESC LIMIT 100')).rows;const pending=(await pool.query("SELECT count(*)::int count FROM adops_wa_events WHERE status<>'processed'")).rows[0].count;res.json({enabled:cfg.enabled===true,pilotOnly:cfg.pilotOnly!==false,validationReady:await validationReady(),group:'ADOPS',publicationEnabled:false,deliveries,answers,pendingDecode:pending});});
export default router;
