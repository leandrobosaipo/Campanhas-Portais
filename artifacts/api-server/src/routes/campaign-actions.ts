import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool} from '@workspace/db';
import {createDrivePiEventJob,validateDrivePiEvent} from './ops';
import {ADOPS_GROUP} from '../lib/whatsapp-checklist.mjs';
import {campaignActionPhase} from '../lib/campaign-notification-policy.mjs';
import {getAdRotateGroupId,getSiteIntegration} from '../lib/adrotate-sites';
import {appliedPublicationIds,evaluatePublicationReadback,publicMediaHead,safeCampaignFailure} from '../lib/campaign-publication-verification.mjs';
import {recoverActionIntakeEvidence} from '../lib/campaign-action-intake-recovery.mjs';
import {campaignActionMessage} from '../lib/campaign-action-messages.mjs';
import {processCampaignPreparations} from '../lib/campaign-preparation-store.mjs';
import {processDocumentaryPending} from '../lib/campaign-documentary-pending.mjs';
import {allowedCampaignActor,readCampaignAuthorizationConfig,authorizationSourceFingerprint} from '../lib/campaign-authorization.mjs';
import {ActionError,requireAction,actionHash,parseActionJson,validateActionPreview,assertActionPreviewCurrent,explicitPreviewConfirmation,actionPreviewText} from '../lib/campaign-action-policy.mjs';
const router=Router(),base='/monitoring/campaign-actions';
router.use(base,(req,res,next)=>{
 const token=req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 const internal=req.header('x-adops-api-token')?.trim();
 const guardRead=req.method==='GET'&&/^\/actions\/[0-9a-f-]{36}\/execution-guard$/.test(req.path);
 if(guardRead&&process.env.ADOPS_INTERNAL_API_TOKEN&&internal===process.env.ADOPS_INTERNAL_API_TOKEN.trim()){next();return;}
 if(!process.env.OPS_API_TOKEN||token!==process.env.OPS_API_TOKEN){res.status(401).json({error:'unauthorized'});return;}next();
});
async function schema(c:any){await c.query(`CREATE TABLE IF NOT EXISTS adops_campaign_previews(id UUID PRIMARY KEY,identity TEXT NOT NULL,revision TEXT NOT NULL,source_fingerprint TEXT NOT NULL,plan JSONB NOT NULL,request_hash TEXT NOT NULL,idempotency_key TEXT UNIQUE NOT NULL,participant TEXT,group_jid TEXT NOT NULL,source_answer_event_key TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL);
 CREATE TABLE IF NOT EXISTS adops_campaign_actions(id UUID PRIMARY KEY,preview_id UUID NOT NULL UNIQUE REFERENCES adops_campaign_previews(id),identity TEXT NOT NULL,revision TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',source TEXT NOT NULL,source_event_key TEXT UNIQUE NOT NULL,confirmation_key TEXT UNIQUE NOT NULL,job_id TEXT,apply_key TEXT UNIQUE,error_code TEXT,last_notified_phase TEXT,claimed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS adops_campaign_confirmation_events(event_key TEXT PRIMARY KEY,preview_id UUID,outcome TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX IF NOT EXISTS adops_campaign_previews_answer_once ON adops_campaign_previews(source_answer_event_key) WHERE source_answer_event_key IS NOT NULL;
 `);
 // Existing columns need no ALTER: its exclusive lock can deadlock read-only audits.
 const column=(await c.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='adops_campaign_actions'::regclass AND attname='verification_json' AND attnum>0 AND NOT attisdropped) AS present")).rows[0];
 if(!column?.present)await c.query('ALTER TABLE adops_campaign_actions ADD COLUMN IF NOT EXISTS verification_json JSONB');
 const cancelled=(await c.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='adops_campaign_previews'::regclass AND attname='cancelled_at' AND attnum>0 AND NOT attisdropped) AS present")).rows[0];
 if(!cancelled?.present)await c.query('ALTER TABLE adops_campaign_previews ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ');
}
const readKey=(req:any)=>{const key=req.header('Idempotency-Key');requireAction(typeof key==='string'&&/^[A-Za-z0-9._:-]{8,160}$/.test(key),'idempotency_key_required_8_160',400);return key;};
async function active(c:any,identity:string){const row=(await c.query('SELECT identity,revision,checklist,updated_at FROM adops_monitor_checklists WHERE identity=$1 AND active=true',[identity])).rows[0];requireAction(row,'active_checklist_required',404);return row;}
const registrationKey=(i:any)=>[Number(i.siteId),String(i.localFormato??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''),i.start,i.end].join(':');
async function registrationState(c:any,plan:any){
 const pi=plan.parsedPi,ids=[...new Set(pi.insertions.map(i=>Number(i.siteId)))];
 const rows=(await c.query(`SELECT i.id,i.xmin::text AS "rowVersion",i.site_id AS "siteId",COALESCE(i.local_formato_normalizado,i.local_formato) AS "localFormato",i.periodo_inicio AS start,i.periodo_fim AS "end"
  FROM insertions i JOIN campaigns campaign ON campaign.id=i.campanha_id
  WHERE regexp_replace(campaign.pi_codigo,'[^0-9]','','g')=$1 AND campaign.cliente_id=$2 AND campaign.agencia_id=$3
  AND i.site_id=ANY($4::int[]) AND i.archived_at IS NULL AND i.superseded_by_insertion_id IS NULL
  AND COALESCE(i.status_normalizado,'') NOT IN ('cancelado','arquivado') ORDER BY i.id`,[String(pi.piCodigo).replace(/\D/g,''),pi.clienteId,pi.agenciaId,ids])).rows;
 const expected=pi.insertions.map(i=>registrationKey({siteId:i.siteId,localFormato:i.localFormatoNormalizado??i.localFormato,start:i.periodoInicio,end:i.periodoFim}));
 const matched=rows.filter(i=>expected.includes(registrationKey(i)));
 requireAction(expected.every(key=>matched.filter(i=>registrationKey(i)===key).length<=1),'ambiguous_registration_scope');return matched;
}
async function assertExecutionState(c:any,p:any){
 const current=await active(c,p.identity);assertActionPreviewCurrent(p,current.checklist);
 const targets=p.plan.parsedPi.insertions.map(raw=>({siteId:Number(raw.siteId),localFormato:raw.localFormatoNormalizado??raw.localFormato,groupId:getAdRotateGroupId(current.checklist.site,raw.localFormatoNormalizado??raw.localFormato)}));
 requireAction(p.plan.targets&&actionHash(p.plan.targets.map(({siteId,localFormato,groupId})=>({siteId,localFormato,groupId})))===actionHash(targets),'preview_group_mapping_changed');
 requireAction(actionHash(await registrationState(c,p.plan))===actionHash(p.plan.registrations),'authorized_registration_changed');
 return current;
}
function fail(res:any,e:any){res.status(e instanceof ActionError?e.status:503).json({error:e instanceof ActionError?e.message:'campaign_action_unavailable',publicationEnabled:false});}
async function transaction(res:any,fn:(c:any)=>Promise<any>){const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');res.status(value.httpStatus??200).json(value);}catch(e){await c.query('ROLLBACK');fail(res,e);}finally{c.release();}}
router.get(base+'/status',async(_req,res)=>{const row=(await pool.query("SELECT to_regclass('adops_campaign_actions') name")).rows[0],cfg=readCampaignAuthorizationConfig();res.json({available:true,initialized:!!row?.name,confirmationRequired:true,authorizationVersion:2,authorizationEnabled:cfg.enabled===true,approvedParticipantCount:cfg.approvers?.length??0,identityCount:cfg.identities?.length??0,cutover:cfg.cutover??null,automaticCapture:false,telegramEnabled:false});});
router.get(base+'/preparations',async(req,res)=>{
 if(!(await pool.query("SELECT to_regclass('adops_campaign_preparations') name")).rows[0]?.name){res.json({items:[]});return;}
 const identity=typeof req.query.identity==='string'?req.query.identity:null;
 const items=(await pool.query('SELECT id,identity,status,job_id AS "jobId",preview_id AS "previewId",error_code AS "errorCode",created_at AS "createdAt",updated_at AS "updatedAt" FROM adops_campaign_preparations WHERE ($1::text IS NULL OR identity=$1) ORDER BY created_at DESC LIMIT 100',[identity])).rows;
 res.json({items,commercialMutation:false});
});
async function queueText(c:any,{key,event,identity,revision,text}:any){requireAction((await c.query("SELECT to_regclass('adops_wa_menu_deliveries') name")).rows[0]?.name,'whatsapp_outbox_required',503);await c.query("INSERT INTO adops_wa_menu_deliveries(message_key,event_key,identity,revision,part,request) VALUES($1,$2,$3,$4,'text',$5) ON CONFLICT DO NOTHING",[key,event,identity,revision,JSON.stringify({number:ADOPS_GROUP,text,linkPreview:false})]);}
async function confirm(c:any,p:any,{source,event,key}:any){
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['campaign-authorization:'+p.identity]);
 const current=await active(c,p.identity);assertActionPreviewCurrent(p,current.checklist);
 const existing=(await c.query('SELECT * FROM adops_campaign_actions WHERE preview_id=$1 OR confirmation_key=$2 OR source_event_key=$3 FOR UPDATE',[p.id,key,event])).rows[0];
 if(existing){requireAction(existing.preview_id===p.id,'confirmation_idempotency_conflict');return {...existing,duplicate:true};}
 const equivalent=(await c.query(`SELECT a.* FROM adops_campaign_actions a JOIN adops_campaign_previews prior ON prior.id=a.preview_id
  WHERE a.identity=$1 AND prior.source_fingerprint=$2 AND prior.plan->'parsedPi'=$3::jsonb
  AND prior.plan->>'authorizationSourceFingerprint'=$4 AND prior.plan->'targets'=$5::jsonb AND (a.job_id IS NOT NULL OR a.status IN ('confirmed','claimed'))
  ORDER BY a.created_at LIMIT 1 FOR UPDATE OF a`,[p.identity,p.source_fingerprint,JSON.stringify(p.plan.parsedPi),p.plan.authorizationSourceFingerprint,JSON.stringify(p.plan.targets)])).rows[0];
 if(equivalent)return {...equivalent,duplicate:true};
 const ongoing=(await c.query("SELECT a.id FROM adops_campaign_actions a JOIN ops_jobs j ON j.id=a.job_id WHERE a.identity=$1 AND j.status IN ('queued','ready_for_runner','running') LIMIT 1",[p.identity])).rows[0];requireAction(!ongoing,'campaign_operation_in_progress');
 const id=randomUUID();return (await c.query("INSERT INTO adops_campaign_actions(id,preview_id,identity,revision,source,source_event_key,confirmation_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[id,p.id,p.identity,p.revision,source,event,key])).rows[0];
}
async function describe(c:any,a:any){const job=a.job_id?(await c.query('SELECT id,status,result_json,error_text,runner_id FROM ops_jobs WHERE id=$1',[a.job_id])).rows[0]:null;const result=job?.result_json?parseActionJson(job.result_json):null;const preview=(await c.query('SELECT plan FROM adops_campaign_previews WHERE id=$1',[a.preview_id])).rows[0];const phase=campaignActionPhase(a,job,preview?.plan);return {actionId:a.id,previewId:a.preview_id,identity:a.identity,revision:a.revision,phase,status:a.status,jobId:a.job_id??null,jobStatus:job?.status??null,runnerId:job?.runner_id??null,errorCode:a.error_code??null,result,hasError:!!job?.error_text,commercialMutationRequested:!!a.job_id,publicationVerified:a.verification_json?.verified===true,verification:a.verification_json??null,failureSummary:job?.error_text||result?.execution?.reviewReasons?.length?safeCampaignFailure(job?.error_text||result.execution.reviewReasons.join(';')):null};}
async function persistPreview(c:any,body:any,key:string){
 await schema(c);await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['campaign-preview:'+key]);
 const {identity,expectedRevision,preflightJobId,parsedPi,validation,answerEventKey}=body??{};requireAction(typeof identity==='string'&&identity.length<200,'identity_required',400);
 const hash=actionHash({identity,expectedRevision,preflightJobId,parsedPi,validation,answerEventKey:answerEventKey??null});const previous=(await c.query('SELECT * FROM adops_campaign_previews WHERE idempotency_key=$1 OR source_answer_event_key=$2',[key,answerEventKey??null])).rows[0];if(previous){requireAction(previous.request_hash===hash,'idempotency_or_answer_conflict');return {previewId:previous.id,revision:previous.revision,expiresAt:previous.expires_at,duplicate:true,plan:previous.plan};}
 const current=await active(c,identity);requireAction(current.revision===expectedRevision,'checklist_revision_changed');const job=(await c.query('SELECT * FROM ops_jobs WHERE id=$1',[preflightJobId])).rows[0];requireAction(job,'preflight_job_required');
 const site=(await c.query('SELECT id,nome,sigla FROM sites WHERE sigla=$1',[current.checklist.site])).rows[0];requireAction(site,'site_not_found');const checked=validateActionPreview({checklist:current.checklist,parsedPi,preflight:job,validation,siteId:site.id});
 const answer=answerEventKey?(await c.query("SELECT * FROM adops_wa_answers WHERE event_key=$1 AND identity=$2 AND status='linked_for_review' AND group_jid=$3",[answerEventKey,identity,ADOPS_GROUP])).rows[0]:null;
 if(answerEventKey)requireAction(answer?.participant&&allowedCampaignActor(answer,identity)&&(answer.selected_options?.includes('Solicitar prévia')||String(answer.text_value??'').trim().toLocaleLowerCase('pt-BR')==='solicitar prévia'),'real_preview_request_required');
 const client=(await c.query('SELECT nome FROM clients WHERE id=$1',[parsedPi.clienteId])).rows[0],agency=(await c.query('SELECT nome FROM agencies WHERE id=$1',[parsedPi.agenciaId])).rows[0];requireAction(client&&agency,'master_identity_required');
 const id=randomUUID(),expires=new Date(Date.now()+60*60000).toISOString(),plan={authorizationVersion:2,parsedPi,validation,preflightJobId,sourcePdfSha:checked.sourcePdfSha,media:checked.media.map(m=>({...m,sourceName:m.sourceName||current.checklist.files.find(f=>f.id===m.sourceDriveFileId)?.name})),labels:{client:client.nome,agency:agency.nome,site:site.nome},runnerSourceSha:checked.runnerSourceSha,runnerMediaSourceSha:checked.runnerMediaSourceSha,folderId:checked.payload.driveFileId,targets:parsedPi.insertions.map(raw=>({siteId:Number(raw.siteId),localFormato:raw.localFormatoNormalizado??raw.localFormato,groupId:getAdRotateGroupId(site.sigla,raw.localFormatoNormalizado??raw.localFormato),source:"preview_configuration_pin"}))};requireAction(plan.targets.every(t=>Number(t.groupId)>0),"preview_group_mapping_required");
 Object.assign(plan,{authorizationSourceFingerprint:authorizationSourceFingerprint(current.checklist),operations:current.checklist.positions.map(position=>({position:position.name,insertionIds:position.insertionIds??[],action:position.insertionIds?.length?'reutilizar cadastro e conferir anúncio correspondente':'criar cadastro canônico se inexistente e conferir anúncio correspondente'}))});
 const registrations=await registrationState(c,plan);Object.assign(plan,{registrations});
 Object.assign(plan,{operations:parsedPi.insertions.map(i=>{const key=registrationKey({siteId:i.siteId,localFormato:i.localFormatoNormalizado??i.localFormato,start:i.periodoInicio,end:i.periodoFim}),existing=registrations.filter(r=>registrationKey(r)===key);return {position:i.localFormato,insertionIds:existing.map(r=>r.id),action:existing.length?'reutilizar cadastro e conferir anúncio correspondente':'criar cadastro canônico se inexistente e conferir anúncio correspondente'};})});
 const revision=actionHash({identity,source:checked.sourceFingerprint,plan});const p=(await c.query('INSERT INTO adops_campaign_previews(id,identity,revision,source_fingerprint,plan,request_hash,idempotency_key,participant,group_jid,source_answer_event_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[id,identity,revision,checked.sourceFingerprint,JSON.stringify(plan),hash,key,answer?.participant??null,ADOPS_GROUP,answerEventKey??null,expires])).rows[0];
 if(answer)await queueText(c,{key:'campaign-preview:'+id,event:answerEventKey,identity:'campaign-preview:'+id,revision,text:actionPreviewText(p)});
 return {httpStatus:201,previewId:id,revision,expiresAt:expires,plan,participantBound:!!answer,whatsappQueued:!!answer,applyEnabled:false};
}
router.post(base+'/previews',async(req,res)=>transaction(res,async c=>persistPreview(c,req.body,readKey(req))));
async function previewReadback(p:any){const a=(await pool.query('SELECT * FROM adops_campaign_actions WHERE preview_id=$1',[p.id])).rows[0];return {previewId:p.id,identity:p.identity,revision:p.revision,expiresAt:p.expires_at,plan:p.plan,text:actionPreviewText(p),participantBound:!!p.participant,action:a?await describe(pool,a):null,actionId:a?.id??null,status:a?.status??'preview',jobId:a?.job_id??null};}
router.get(base+'/previews',async(req,res)=>{try{const identity=req.query.identity,key=req.query.idempotencyKey;requireAction(typeof identity==='string'&&identity.length>0&&identity.length<200&&typeof key==='string'&&/^[A-Za-z0-9._:-]{8,160}$/.test(key),'exact_identity_and_idempotency_key_required',400);requireAction((await pool.query("SELECT to_regclass('adops_campaign_previews') name")).rows[0]?.name,'preview_not_found',404);const p=(await pool.query('SELECT * FROM adops_campaign_previews WHERE identity=$1 AND idempotency_key=$2',[identity,key])).rows[0];requireAction(p,'preview_not_found',404);res.json(await previewReadback(p));}catch(e){fail(res,e);}});
router.get(base+'/previews/:id',async(req,res)=>{try{requireAction((await pool.query("SELECT to_regclass('adops_campaign_previews') name")).rows[0]?.name,'preview_not_found',404);const p=(await pool.query('SELECT * FROM adops_campaign_previews WHERE id=$1',[req.params.id])).rows[0];requireAction(p,'preview_not_found',404);res.json(await previewReadback(p));}catch(e){fail(res,e);}});
router.post(base+'/previews/:id/confirm',async(req,res)=>transaction(res,async c=>{
 const key=readKey(req);await schema(c);const p=(await c.query('SELECT * FROM adops_campaign_previews WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];requireAction(p,'preview_not_found',404);
 requireAction(!p.participant&&!p.source_answer_event_key,'whatsapp_preview_requires_quoted_authorization');
 requireAction(req.body?.expectedRevision===p.revision,'preview_revision_required');requireAction(req.body?.source==='codex_user_confirmation'&&/^codex:[A-Za-z0-9._:-]{8,220}$/.test(req.body?.sourceEventKey??''),'explicit_codex_user_confirmation_required',400);
 const a=await confirm(c,p,{source:'codex_user_confirmation',event:req.body.sourceEventKey,key});return {...await describe(c,a),confirmed:true};
}));
router.post(base+'/actions/:id/apply',async(req,res)=>transaction(res,async c=>{
 const key=readKey(req);await schema(c);const a=(await c.query('SELECT * FROM adops_campaign_actions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];requireAction(a,'action_not_found',404);requireAction(req.body?.expectedRevision===a.revision,'confirmed_revision_required');if(a.job_id)return {...await describe(c,a),duplicate:true};
 if(a.status==='blocked')return {httpStatus:409,...await describe(c,a),error:a.error_code,definitiveRejection:true};
 requireAction(!(await c.query('SELECT id FROM adops_campaign_actions WHERE apply_key=$1 AND id<>$2',[key,a.id])).rows[0],'apply_idempotency_conflict');
 await c.query('SAVEPOINT apply_attempt');try{
 const p=(await c.query('SELECT * FROM adops_campaign_previews WHERE id=$1',[a.preview_id])).rows[0],current=await active(c,a.identity);assertActionPreviewCurrent(p,current.checklist);const preflight=(await c.query('SELECT * FROM ops_jobs WHERE id=$1',[p.plan.preflightJobId])).rows[0];const site=(await c.query('SELECT id FROM sites WHERE sigla=$1',[current.checklist.site])).rows[0];validateActionPreview({checklist:current.checklist,parsedPi:p.plan.parsedPi,preflight,validation:p.plan.validation,siteId:site.id});
 requireAction(['confirmed','claimed'].includes(a.status),'action_not_confirmed');
 if(a.source==='whatsapp_quoted_preview')requireAction(allowedCampaignActor({participant:p.participant,received_at:p.created_at},p.identity),'approver_or_scope_revoked');
 const targets=p.plan.parsedPi.insertions.map(raw=>({siteId:Number(raw.siteId),localFormato:raw.localFormatoNormalizado??raw.localFormato,groupId:getAdRotateGroupId(current.checklist.site,raw.localFormatoNormalizado??raw.localFormato)}));
 requireAction(p.plan.targets&&actionHash(p.plan.targets.map(({siteId,localFormato,groupId})=>({siteId,localFormato,groupId})))===actionHash(targets),'preview_group_mapping_changed');
 await assertExecutionState(c,p);
 // The mode is pinned to a reviewed preview; it never waives identity/media/period checks.
 const operational=p.plan.validation?.documentaryPending===true?{operationMode:'operational_minimum'}:{};
 const event=validateDrivePiEvent({...operational,eventId:'drive:'+p.plan.folderId+':confirmed-action:'+a.id,driveFileId:p.plan.folderId,name:'Campanha confirmada '+a.identity,mimeType:'application/vnd.google-apps.folder',path:'/drive/'+p.plan.folderId,parentFolderId:null,modifiedTime:new Date(p.created_at).toISOString(),webViewLink:'https://drive.google.com/drive/folders/'+p.plan.folderId,eventType:'folder_updated',source:'macmini-api-publish',parsedPi:p.plan.parsedPi,campaignActionId:a.id,sendTelegram:false,preserveOtherInsertions:true,preflightOnly:false,explicitFolder:true,resolveMedia:true,strictInsertionScope:true,allowPdfInsertions:false,publish:true,generateEvidence:true,purgeCache:true});requireAction(event,'confirmed_event_invalid');
 const created=await createDrivePiEventJob(event,'confirmed-campaign-action',c);requireAction(created.jobId,'job_identity_required');await c.query("UPDATE adops_campaign_actions SET job_id=$2,apply_key=$3,status='enqueued',updated_at=now() WHERE id=$1",[a.id,created.jobId,key]);return {httpStatus:202,...await describe(c,{...a,job_id:created.jobId,status:'enqueued'}),captureRequested:true,telegramRequested:false};
 }catch(e){if(!(e instanceof ActionError))throw e;await c.query('ROLLBACK TO SAVEPOINT apply_attempt');await c.query("UPDATE adops_campaign_actions SET status='blocked',error_code=$2,updated_at=now() WHERE id=$1",[a.id,e.message]);return {httpStatus:e.status,...await describe(c,{...a,status:'blocked',error_code:e.message}),error:e.message,definitiveRejection:true};}
}));
router.get(base+'/actions/:id',async(req,res)=>{try{requireAction((await pool.query("SELECT to_regclass('adops_campaign_actions') name")).rows[0]?.name,'action_not_found',404);const a=(await pool.query('SELECT * FROM adops_campaign_actions WHERE id=$1',[req.params.id])).rows[0];requireAction(a,'action_not_found',404);res.json(await describe(pool,a));}catch(e){fail(res,e);}});
router.get(base+'/actions/:id/execution-guard',async(req,res)=>{try{
 const a=(await pool.query('SELECT * FROM adops_campaign_actions WHERE id=$1',[req.params.id])).rows[0];requireAction(a&&a.job_id&&a.job_id===req.query.jobId,'exact_authorized_job_required');
 const p=(await pool.query('SELECT * FROM adops_campaign_previews WHERE id=$1',[a.preview_id])).rows[0];requireAction(p?.plan.authorizationVersion===2,'guarded_preview_required');
 if(a.source==='whatsapp_quoted_preview')requireAction(allowedCampaignActor({participant:p.participant,received_at:p.created_at},p.identity),'approver_or_scope_revoked');
 await assertExecutionState(pool,p);
 res.json({allowed:true,actionId:a.id,folderId:p.plan.folderId,sourcePdfSha:p.plan.sourcePdfSha,documentaryPending:p.plan.validation?.documentaryPending===true,parsedPi:p.plan.parsedPi,registrations:p.plan.registrations,targets:p.plan.targets});
 }catch(e){fail(res,e);}});
router.post(base+'/actions/claim',async(_req,res)=>transaction(res,async c=>{await schema(c);const a=(await c.query("SELECT * FROM adops_campaign_actions WHERE (status='confirmed' AND claimed_at IS NULL) OR (status='claimed' AND job_id IS NULL AND claimed_at<now()-interval '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!a)return {items:[]};await c.query("UPDATE adops_campaign_actions SET status='claimed',claimed_at=now(),updated_at=now() WHERE id=$1",[a.id]);return {items:[{actionId:a.id,previewId:a.preview_id,identity:a.identity,revision:a.revision}],applyExecuted:false};}));
router.post(base+'/actions/process',async(_req,res)=>transaction(res,async c=>{
 await schema(c);await c.query("SELECT pg_advisory_xact_lock(hashtext('campaign-confirmation-process-v1'))");
 const preparations=await processCampaignPreparations({c,active,createJob:createDrivePiEventJob,validateEvent:validateDrivePiEvent,persistPreview,queueText,group:ADOPS_GROUP,groupFor:getAdRotateGroupId});
 const documentary=await processDocumentaryPending({c,queueText});
 const cfg=readCampaignAuthorizationConfig();
 const rows=(await c.query(`SELECT a.* FROM adops_wa_answers a JOIN adops_campaign_previews p ON a.identity='campaign-preview:'||p.id::text
  WHERE $1::timestamptz IS NOT NULL AND a.received_at>=$1::timestamptz AND p.created_at>=$1::timestamptz
  AND (($4::boolean AND a.received_at>=$5::timestamptz) OR p.identity=ANY($2::text[])) AND a.participant=ANY($3::text[]) AND a.status='linked_for_review'
  AND NOT EXISTS(SELECT 1 FROM adops_campaign_confirmation_events e WHERE e.event_key=a.event_key) ORDER BY a.received_at,a.event_key LIMIT 30`,[cfg.enabled===true?cfg.cutover:null,cfg.identities??[],cfg.approvers??[],cfg.allowAllActiveCampaigns===true,cfg.allActiveCampaignsCutover??null])).rows;let confirmed=0;
 for(const answer of rows){
  const id=answer.identity.slice('campaign-preview:'.length);if(!/^[a-f0-9-]{36}$/.test(id))continue;
  const p=(await c.query('SELECT * FROM adops_campaign_previews WHERE id=$1 FOR UPDATE',[id])).rows[0];let outcome='not_explicit_confirmation';
  const text=String(answer.text_value??'').trim().toLocaleLowerCase('pt-BR');
  const linked=p&&answer.reply_to&&answer.kind==='text'&&answer.revision===p.revision&&answer.participant===p.participant&&answer.group_jid===p.group_jid&&allowedCampaignActor(answer,p.identity);
  if(linked&&['revisar dados','cancelar solicitação'].includes(text)){
   const action=(await c.query('SELECT * FROM adops_campaign_actions WHERE preview_id=$1 FOR UPDATE',[p.id])).rows[0];
   outcome=action?.job_id?'execution_already_started':text==='revisar dados'?'revision_requested':'cancelled';
   if(!action?.job_id){await c.query('UPDATE adops_campaign_previews SET cancelled_at=now() WHERE id=$1',[p.id]);await c.query("UPDATE adops_campaign_actions SET status='blocked',error_code='preview_cancelled',updated_at=now() WHERE preview_id=$1 AND job_id IS NULL",[p.id]);}
   await queueText(c,{key:'campaign-decision:'+answer.event_key,event:answer.event_key,identity:'campaign-decision:'+p.id,revision:p.revision,text:action?.job_id?'A execução já começou. Vou preservar e consultar o mesmo trabalho; cancelar esta mensagem não desfaz publicação.':text==='revisar dados'?'Prévia invalidada para revisão. Corrija os dados na fonte e solicite nova prévia no aviso da campanha.':'Solicitação cancelada antes da execução. Esta prévia não pode autorizar cadastro/publicação.'});
  }else if(p&&explicitPreviewConfirmation(answer,p)){
   try{const current=await active(c,p.identity);assertActionPreviewCurrent(p,current.checklist);await confirm(c,p,{source:'whatsapp_quoted_preview',event:answer.event_key,key:'wa-confirm:'+actionHash(answer.event_key)});outcome='confirmed';confirmed++;}
   catch(e){if(e instanceof ActionError)outcome=e.message;else throw e;}
  }else if(linked&&text==='autorizar cadastro e publicação')outcome=p.cancelled_at?'preview_cancelled':Date.parse(p.expires_at)<=Date.now()?'preview_expired':'authorization_rejected';
  if(['preview_cancelled','preview_expired','commercial_material_revision_changed','authorization_source_changed','authorized_registration_changed','campaign_operation_in_progress'].includes(outcome))await queueText(c,{key:'campaign-rejection:'+answer.event_key,event:answer.event_key,identity:'campaign-decision:'+p.id,revision:p.revision,text:outcome==='campaign_operation_in_progress'?'Já existe trabalho em andamento para esta campanha. Vou preservar a tentativa e aguardar o resultado antes de admitir outra publicação.':'Esta prévia foi cancelada, expirou ou os dados mudaram. Solicite e confira uma nova prévia. Nenhuma publicação foi autorizada por esta resposta.'});
  await c.query('INSERT INTO adops_campaign_confirmation_events(event_key,preview_id,outcome) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[answer.event_key,p?.id??null,outcome]);
 }
 const actions=(await c.query("SELECT * FROM adops_campaign_actions WHERE job_id IS NOT NULL OR status IN ('claimed','blocked') ORDER BY updated_at DESC LIMIT 100 FOR UPDATE")).rows;let statusesQueued=0;
 for(const a of actions){const status=await describe(c,a);if(status.phase===a.last_notified_phase){
  if(a.job_id&&['queued','executing','completed_needs_public_readback'].includes(status.phase)){
   const age=Date.now()-new Date(a.created_at).getTime(),threshold=age>=30*60000?30:age>=5*60000?5:0;
   if(threshold)await queueText(c,{key:'campaign-action:'+a.id+':waiting:'+threshold,event:a.source_event_key,identity:'campaign-action:'+a.id,revision:a.revision,text:`*Acompanhamento — ${a.identity}*\nEtapa: ${status.phase==='queued'?'fila de publicação':status.phase==='executing'?'publicação e verificação':'conferência do portal'}. ${threshold===30?'O prazo de 30 minutos foi excedido. A operação precisa de revisão técnica; continuarei consultando o mesmo trabalho, sem disparar outra publicação.':'O trabalho ainda não terminou. Próxima consulta em até 1 minuto; enviarei o resultado ou um alerta de prazo aos 30 minutos.'}\nReferência: ${a.job_id}`});
  }
  continue;
 }await c.query("UPDATE adops_wa_menu_deliveries SET status='superseded',updated_at=now() WHERE identity=$1 AND status='pending'",['campaign-action:'+a.id]);const preview=(await c.query('SELECT plan FROM adops_campaign_previews WHERE id=$1',[a.preview_id])).rows[0];await queueText(c,{key:'campaign-action:'+a.id+':'+status.phase,event:a.source_event_key,identity:'campaign-action:'+a.id,revision:a.revision,text:campaignActionMessage({preview,action:a,status})});await c.query('UPDATE adops_campaign_actions SET last_notified_phase=$2,updated_at=now() WHERE id=$1',[a.id,status.phase]);statusesQueued++;}
 return {answersProcessed:rows.length,confirmed,statusesQueued,preparations,documentary,applyExecuted:false};
}));
async function verificationGet(path:string){const response=await fetch(`http://127.0.0.1:${process.env.PORT}${path}`,{headers:{authorization:'Bearer '+process.env.OPS_API_TOKEN},signal:AbortSignal.timeout(30000)});requireAction(response.ok,'public_readback_resource_unavailable',503);return response.json();}
async function verifyActionPublication(c:any,id:string){
 const a=(await c.query('SELECT * FROM adops_campaign_actions WHERE id=$1 FOR UPDATE',[id])).rows[0];requireAction(a,'action_not_found',404);if(a.verification_json?.verified)return {actionId:id,...a.verification_json,duplicate:true};
 const p=(await c.query('SELECT * FROM adops_campaign_previews WHERE id=$1',[a.preview_id])).rows[0],job=(await c.query('SELECT * FROM ops_jobs WHERE id=$1',[a.job_id])).rows[0];requireAction(job&&['completed','failed'].includes(job.status),'terminal_execution_required');
 const result=parseActionJson(job.result_json??'{}'),execution=result.execution,ids=appliedPublicationIds(execution),today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'});let intakeRecovery:any=null,receipt:any;
 try{
  if(job.status==='failed'&&ids.length===0){
   const latest=(await c.query('SELECT id FROM adops_campaign_actions WHERE identity=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[a.identity])).rows[0];
   if(latest?.id===a.id){
    const eventId='drive:'+p.plan.folderId+':confirmed-action:'+a.id;
    const eventRow=(await c.query('SELECT event_id,job_id,drive_file_id,status,payload_json FROM cod5_drive_events WHERE event_id=$1 AND job_id=$2 AND drive_file_id=$3',[eventId,job.id,p.plan.folderId])).rows[0];
    const documents=(await c.query('SELECT id,event_id,drive_file_id,status,content_sha256 FROM cod5_inbound_documents WHERE event_id=$1 AND drive_file_id=$2 ORDER BY created_at DESC LIMIT 2',[eventId,p.plan.folderId])).rows;
    if(documents.length===1){
     const documentRow=documents[0];
     const parseRuns=(await c.query('SELECT id,status,fields_json,created_at FROM cod5_document_parse_runs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 100',[documentRow.id])).rows;
     const parsed=p.plan.parsedPi,campaigns=(await c.query('SELECT id,pi_codigo,cliente_id,agencia_id FROM campaigns WHERE pi_codigo=$1 AND cliente_id=$2 AND agencia_id=$3',[parsed.piCodigo,parsed.clienteId,parsed.agenciaId])).rows;
     let insertions:any[]=[];
     if(campaigns.length===1){insertions=(await c.query(`SELECT id,campanha_id,site_id,local_formato,local_formato_normalizado,periodo_inicio,periodo_fim,media_url,archived_at,superseded_by_insertion_id
       FROM insertions WHERE campanha_id=$1 AND archived_at IS NULL AND superseded_by_insertion_id IS NULL
       AND COALESCE(status_normalizado,'') NOT IN ('cancelado','arquivado')`,[campaigns[0].id])).rows;}
     intakeRecovery=recoverActionIntakeEvidence({actionId:a.id,job,plan:p.plan,eventRow,documentRow,parseRuns,campaigns,insertions});
    }
   }
  }
  const siteIds=[...new Set(p.plan.parsedPi.insertions.map(raw=>Number(raw.siteId)))],sites=(await c.query('SELECT id,sigla FROM sites WHERE id=ANY($1::int[])',[siteIds])).rows;
  const currentTargets=p.plan.parsedPi.insertions.map(raw=>({siteId:Number(raw.siteId),localFormato:raw.localFormatoNormalizado??raw.localFormato,groupId:getAdRotateGroupId(sites.find(s=>s.id===Number(raw.siteId))?.sigla,raw.localFormatoNormalizado??raw.localFormato),source:p.plan.targets?'preview_configuration_pin':'legacy_preview_mapping_checked_after_confirmation'}));
  requireAction(!p.plan.targets||actionHash(p.plan.targets.map(t=>({siteId:t.siteId,localFormato:t.localFormato,groupId:t.groupId})))===actionHash(currentTargets.map(t=>({siteId:t.siteId,localFormato:t.localFormato,groupId:t.groupId}))),'preview_group_mapping_changed');
  const readbackIds=ids.length?ids:(intakeRecovery?.insertionIds??[]);
  const items=await Promise.all(readbackIds.map(async insertionId=>{const insertion=await verificationGet('/api/insertions/'+insertionId);
   const relation=insertion.periodoInicio>today?null:await verificationGet('/api/integrations/adrotate/insertions/'+insertionId+'/relation');
   const campaign=(await c.query('SELECT id,pi_codigo,cliente_id,agencia_id FROM campaigns WHERE id=$1',[insertion.campanhaId])).rows[0];return {insertion,relation,campaign,mediaHead:await publicMediaHead(insertion.mediaUrl,{allowedHosts:(()=>{try{const host=new URL(getSiteIntegration(insertion.siteSigla)?.homeUrl).hostname.replace(/^www\./,'');return [host,'cdn.'+host];}catch{return [];}})()})};}));
  receipt=evaluatePublicationReadback({plan:p.plan,execution,jobStatus:job.status,items,targets:currentTargets,today,intakeRecovery});
 }catch(error){receipt={verified:false,state:'pending',issues:[error instanceof ActionError?error.message:'public_readback_unavailable'],checkedAt:new Date().toISOString(),executionStatus:job.status,executionWarning:job.status==='failed'};receipt.proofHash=actionHash({state:receipt.state,issues:receipt.issues,executionStatus:job.status});}
 await c.query('UPDATE adops_campaign_actions SET verification_json=$2,updated_at=now() WHERE id=$1',[id,JSON.stringify(receipt)]);
 return {actionId:id,jobId:a.job_id,...receipt,publicationMutated:false,captureCreated:false};
}
router.post(base+'/actions/:id/verify-publication',async(req,res)=>transaction(res,async c=>{await schema(c);return verifyActionPublication(c,req.params.id);}));
router.post(base+'/actions/verify-publications',async(_req,res)=>transaction(res,async c=>{await schema(c);const rows=(await c.query("SELECT a.id FROM adops_campaign_actions a JOIN ops_jobs j ON j.id=a.job_id WHERE j.status IN ('completed','failed') AND COALESCE(a.verification_json->>'verified','false')<>'true' AND COALESCE(a.verification_json->>'state','')<>'error' ORDER BY (j.status='completed') DESC,a.updated_at FOR UPDATE OF a SKIP LOCKED LIMIT 2")).rows,items=[];for(const row of rows)items.push(await verifyActionPublication(c,row.id));return {items,verified:items.filter(x=>x.verified).length,pending:items.filter(x=>x.state==='pending').length,error:items.filter(x=>x.state==='error').length,publicationMutated:false,captureCreated:false};}));
export default router;
