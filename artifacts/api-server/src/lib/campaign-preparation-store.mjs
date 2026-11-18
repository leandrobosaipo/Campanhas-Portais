import {randomUUID} from 'node:crypto';
import {readCampaignAuthorizationConfig,allowedCampaignActor,authorizationSourceFingerprint} from './campaign-authorization.mjs';
import {preparationRequest,preparationFolder,preparationEvent,buildPreparationPlan,preparationFailureText} from './campaign-preparation.mjs';

const parsed=v=>typeof v==='string'?JSON.parse(v):v;
export async function preparationSchema(c){
 await c.query(`CREATE TABLE IF NOT EXISTS adops_campaign_preparations(
  id UUID PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,identity TEXT NOT NULL,source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,job_id TEXT,plan_json JSONB,preview_id UUID,error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 const columns=(await c.query("SELECT attname FROM pg_attribute WHERE attrelid='adops_campaign_preparations'::regclass AND attname IN ('retry_count','next_attempt_at') AND NOT attisdropped")).rows;
 if(columns.length!==2)await c.query('ALTER TABLE adops_campaign_preparations ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ');
}
// Called by the existing n8n action processor; never starts its own timer.
export async function processCampaignPreparations({c,active,createJob,validateEvent,persistPreview,queueText,group,groupFor}){
 const cfg=readCampaignAuthorizationConfig();if(cfg.enabled!==true)return {processed:0,enabled:false};
 await preparationSchema(c);
 const answers=(await c.query(`SELECT a.* FROM adops_wa_answers a JOIN adops_monitor_checklists m ON m.identity=a.identity AND m.active=true WHERE a.received_at>=$1::timestamptz
  AND (($5::boolean AND a.received_at>=$6::timestamptz) OR a.identity=ANY($2::text[])) AND a.participant=ANY($3::text[]) AND a.group_jid=$4 AND a.status='linked_for_review'
  AND ((a.kind='text' AND lower(trim(a.text_value))='solicitar prévia') OR (a.kind='poll' AND a.selected_options='["Solicitar prévia"]'::jsonb))
  AND NOT EXISTS(SELECT 1 FROM adops_wa_events e WHERE e.received_at<$1::timestamptz AND e.data->'key'->>'id'=a.provider_id)
  AND NOT EXISTS(SELECT 1 FROM adops_campaign_preparations p WHERE p.event_key=a.event_key)
  AND NOT EXISTS(SELECT 1 FROM adops_campaign_previews v WHERE v.source_answer_event_key=a.event_key)
  ORDER BY a.received_at,a.event_key LIMIT 30`,[cfg.cutover,cfg.identities,cfg.approvers,group,cfg.allowAllActiveCampaigns===true,cfg.allActiveCampaignsCutover??null])).rows;
 for(const a of answers){if(!preparationRequest(a,cfg))continue;
  let row;try{row=await active(c,a.identity);}catch(error){if(error.code||error.message!=='active_checklist_required')throw error;continue;}
  const source=authorizationSourceFingerprint(row.checklist),id=randomUUID();
  // One in-flight preparation per material state, including repeated user replies.
  const prior=(await c.query(`SELECT p.id FROM adops_campaign_preparations p LEFT JOIN adops_campaign_previews v ON v.id=p.preview_id
   JOIN adops_wa_answers a ON a.event_key=p.event_key WHERE p.identity=$1 AND p.source_fingerprint=$2 AND a.participant=$3 AND (p.status IN ('requested','discovery','strict')
   OR p.status='ready' AND v.expires_at>now() AND v.cancelled_at IS NULL) LIMIT 1`,[a.identity,source,a.participant])).rows[0];
  await c.query(`INSERT INTO adops_campaign_preparations(id,event_key,identity,source_fingerprint,status,error_code)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[id,a.event_key,a.identity,source,prior?'duplicate':'requested',prior?'existing_preparation':null]);
 }
 const rows=(await c.query("SELECT * FROM adops_campaign_preparations WHERE status IN ('requested','discovery','strict') AND (created_at<=now()-interval '30 minutes' OR next_attempt_at IS NULL OR next_attempt_at<=now()) ORDER BY updated_at,created_at FOR UPDATE SKIP LOCKED LIMIT 2")).rows;
 for(const p of rows){
  await c.query('SAVEPOINT preparation_item');
  try{
   const age=Date.now()-new Date(p.created_at).getTime();
   if(age>=30*60000)throw Error('preparation_deadline_exceeded');
   const answer=(await c.query('SELECT * FROM adops_wa_answers WHERE event_key=$1',[p.event_key])).rows[0];
   if(!answer||!allowedCampaignActor(answer,p.identity,cfg))throw Error('approver_or_scope_revoked');
   const current=await active(c,p.identity);
   if(authorizationSourceFingerprint(current.checklist)!==p.source_fingerprint)throw Error('commercial_material_revision_changed');
   const folderId=preparationFolder(current.checklist);const request={...p,folderId,documentaryPending:cfg.allowPendingPi===true&&!current.checklist.document?.sha256,created_at:new Date(p.created_at).toISOString()};
   if(p.status==='requested'){
    const event=validateEvent(preparationEvent(request,'discovery'));if(!event)throw Error('safe_preflight_event_invalid');
    const job=await createJob(event,'whatsapp-preview-preparation',c);
    if(!job.jobId)throw Error('preflight_job_identity_required');
    await c.query("UPDATE adops_campaign_preparations SET status='discovery',job_id=$2,updated_at=now() WHERE id=$1",[p.id,job.jobId]);
    await queueText(c,{key:'campaign-preparation:'+p.id+':started',event:p.event_key,identity:'campaign-preparation:'+p.id,revision:p.source_fingerprint,text:`*Preparando prévia — ${p.identity}*\nPedido recebido: solicitar prévia. Etapa: conferir fontes, calendário, destino e mídia. Próxima consulta: em até 1 minuto. Limite desta preparação: 30 minutos; se exceder, enviarei o ponto de parada. Referência: ${job.jobId}`});
    continue;
   }
   const job=(await c.query('SELECT * FROM ops_jobs WHERE id=$1',[p.job_id])).rows[0];
   if(!job)throw Error('preflight_job_missing');
   if(['queued','ready_for_runner','running'].includes(job.status)){
    if(age>=5*60000)await queueText(c,{key:'campaign-preparation:'+p.id+':waiting',event:p.event_key,identity:'campaign-preparation:'+p.id,revision:p.source_fingerprint,text:`*Prévia em espera — ${p.identity}*\nEtapa: ${p.status==='strict'?'validar arquivos de mídia':'ler fontes da campanha'}. O executor ainda está ${job.status==='running'?'processando':'na fila'}. Consultarei o mesmo trabalho novamente em até 1 minuto, até o limite de 30 minutos da solicitação. Referência: ${p.job_id}.`});
    await c.query('UPDATE adops_campaign_preparations SET updated_at=now(),next_attempt_at=now()+interval \'1 minute\' WHERE id=$1',[p.id]);continue;
   }
   if(job.status!=='completed')throw Error('preflight_failed_requires_review');
   const payload=parsed(job.payload_json),result=parsed(job.result_json),e=result?.execution;
   if(!e)throw Error('preflight_execution_missing');
   const site=(await c.query('SELECT id,nome,sigla FROM sites WHERE sigla=$1',[current.checklist.site])).rows[0];
   if(!site)throw Error('site_not_found');
   if(p.status==='discovery'){
    const runs=(await c.query('SELECT fields_json FROM cod5_document_parse_runs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 12',[payload.documentId])).rows;
    let fields=runs.map(r=>parsed(r.fields_json)).find(f=>Array.isArray(f?.insertions));if(!fields)throw Error('parsed_source_fields_required');
    const source=e.sourceOperationalReview;
    if(request.documentaryPending&&fields.destinationSourceVerified!==true&&source?.verified===true&&source.documentIds?.every(id=>current.checklist.files?.some(f=>f.id===id))){
     fields={...fields,destinationSourceVerified:true,destinationSource:source.source,destinationMode:source.mode,clickUrl:source.url};
    }
    const plan=buildPreparationPlan(current.checklist,fields,e,site,groupFor,new Date().toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'}),{discovery:true});
    const event=validateEvent(preparationEvent(request,'strict',plan.parsedPi));if(!event)throw Error('strict_preflight_event_invalid');
    const next=await createJob(event,'whatsapp-preview-preparation',c);if(!next.jobId)throw Error('preflight_job_identity_required');
    await c.query("UPDATE adops_campaign_preparations SET status='strict',job_id=$2,plan_json=$3,updated_at=now() WHERE id=$1",[p.id,next.jobId,JSON.stringify(plan)]);
   }else{
    const plan=p.plan_json;
    const media=e.mediaProcessing?.results??[];
    plan.validation.mediaVerified=plan.parsedPi.insertions.every(i=>media.some(m=>m.validated===true&&m.uploaded===false&&Number(m.siteId)===Number(i.siteId)&&m.localFormato===i.localFormato&&m.sourceDriveFileId===i.mediaDriveFileId&&String(m.md5).toLowerCase()===String(i.mediaMd5Checksum).toLowerCase()));
    const preview=await persistPreview(c,{identity:p.identity,expectedRevision:current.revision,preflightJobId:job.id,parsedPi:plan.parsedPi,validation:plan.validation,answerEventKey:p.event_key},'wa-preview:'+p.id);
    await c.query("UPDATE adops_campaign_preparations SET status='ready',preview_id=$2,updated_at=now() WHERE id=$1",[p.id,preview.previewId]);
   }
  }catch(error){
   await c.query('ROLLBACK TO SAVEPOINT preparation_item');
   const technical=!!error.code||/query|connection|timeout|fetch|unavailable/i.test(error.message??'');
   const retry=Number(p.retry_count??0)+1,delay=[2,5,10][retry-1];
   const expired=Date.now()-new Date(p.created_at).getTime()>=30*60000;
   if(technical&&delay&&!expired){
    await c.query("UPDATE adops_campaign_preparations SET retry_count=$2,next_attempt_at=now()+($3::int*interval '1 minute'),updated_at=now() WHERE id=$1",[p.id,retry,delay]);
    await queueText(c,{key:'campaign-preparation:'+p.id+':retry:'+retry,event:p.event_key,identity:'campaign-preparation:'+p.id,revision:p.source_fingerprint,text:`*Falha técnica — ${p.identity}*\nEtapa: ${p.status}. Não foi possível consultar/concluir esta etapa. Nova tentativa ${retry}/3 em ${delay} minutos, preservando o mesmo trabalho ${p.job_id??p.id}. Nenhuma nova publicação será disparada por esta retentativa.`});
    continue;
   }
   const code=expired?'preparation_deadline_exceeded':technical?'technical_retries_exhausted':/^[a-z][a-z0-9_]{1,100}$/.test(error.message??'')?error.message:'operational_unknown_error';
   await c.query("UPDATE adops_campaign_preparations SET status='blocked',error_code=$2,updated_at=now() WHERE id=$1",[p.id,code]);
   await queueText(c,{key:'campaign-preparation:'+p.id+':blocked',event:p.event_key,identity:'campaign-preparation:'+p.id,revision:p.source_fingerprint,text:preparationFailureText(p.identity,code)});
  }
 }
 return {processed:rows.length,enabled:true};
}
