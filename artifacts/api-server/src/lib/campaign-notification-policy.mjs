import {commercialDecisionHash} from './campaign-decision-policy.mjs';
import {createHash} from 'node:crypto';
export const notificationFingerprint=c=>{const officialMedia=(c.files??[]).some(f=>/^(image|video)\//.test(f.mimeType));const material=officialMedia?{...c,positions:(c.positions??[]).map(p=>({...p,existingMedia:null}))}:c;return createHash('sha256').update(JSON.stringify({commercial:commercialDecisionHash(material),missing:[...(c.missing??[])].map(x=>JSON.stringify(x)).sort(),conflicts:[...(c.conflicts??[])].map(x=>JSON.stringify(x)).sort()})).digest('hex');};
const protectedStatuses=new Set(['pending','delivery_unknown','accepted','delivered','read']);
export function campaignNotificationState(row,history,deliveries,{now=new Date(),packageKey}={}){
 const time=new Date(now).getTime(),today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'}),fingerprint=notificationFingerprint(row.checklist);
 const prior=history.filter(v=>v.checklist).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const current=deliveries.filter(d=>protectedStatuses.has(d.status)&&d.package_key===packageKey);
 if(current.length)return {state:'finishing_reserved_package',eligible:true,fingerprint};
 const lastPositions=prior.find(v=>v.checklist.positions?.length)?.checklist.positions??[];
 if(!row.checklist.positions?.length&&lastPositions.length&&lastPositions.every(p=>p.end&&p.end<today))return {state:'period_ended',eligible:false,fingerprint,reason:'Último período conhecido encerrado; ausência na planilha vigente não é nova pendência.'};
 if(deliveries.some(d=>protectedStatuses.has(d.status)&&d.checklist&&notificationFingerprint(d.checklist)===fingerprint))return {state:'already_notified',eligible:false,fingerprint};
 let since=new Date(row.updated_at).getTime();
 for(const v of prior){if(notificationFingerprint(v.checklist)!==fingerprint)break;since=new Date(v.created_at).getTime();}
 if(!Number.isFinite(since))return {state:'awaiting_source_timestamp',eligible:false,fingerprint};
 const lastAttempt=Math.max(0,...deliveries.filter(d=>protectedStatuses.has(d.status)).map(d=>new Date(d.attempted_at).getTime()).filter(Number.isFinite));
 const eligibleAt=Math.max(since+15*60000,lastAttempt+30*60000);
 return {state:time<eligibleAt?time<since+15*60000?'consolidating_sources':'notification_cooldown':'ready_for_review',eligible:time>=eligibleAt,fingerprint,stableSince:new Date(since).toISOString(),eligibleAt:new Date(eligibleAt).toISOString()};
}
export function campaignProgress(checklist,answer,answeredChecklist,action){
 if(action)return action;
 const options=answer?.selected_options??[],wantsPreview=options.includes('Solicitar prévia')||String(answer?.text_value??'').trim().toLocaleLowerCase('pt-BR')==='solicitar prévia';
 const changed=!!answeredChecklist&&notificationFingerprint(answeredChecklist)!==notificationFingerprint(checklist);
 return {phase:checklist.missing?.length||checklist.conflicts?.length?'awaiting_data':wantsPreview?'preview_requested':'awaiting_preview_or_confirmation',answerIntent:wantsPreview?'request_preview':answer?'recorded_for_review':null,answeredRevision:answer?.revision??null,materialChangedSinceAnswer:changed,commercialMutation:false,publicationEnabled:false,executionJobId:null,nextStep:changed?'Conferir a revisão atual; orientação anterior não autoriza executar dados alterados.':wantsPreview?'Conferir a prévia e confirmar a revisão exata em etapa separada; nenhum cadastro foi executado.':'Consultar dados e solicitar prévia. Ciente ou recebimento não autorizam cadastro/publicação.'};
}
export function campaignActionPhase(action,job,plan){
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'});
 if(action.verification_json?.scheduleVerified===true&&action.verification_json.positions?.filter(p=>p.scheduled).every(p=>p.periodStart>today))return 'schedule_verified';
 if(action.verification_json?.verified===true)return job?.status==='failed'?'verified_with_execution_warning':'verified';
 if(job?.status==='completed'){
  const result=typeof job.result_json==='string'?JSON.parse(job.result_json):job.result_json,e=result?.execution;
  const pendingPiOnly=plan?.validation?.documentaryPending===true&&e?.operationalReady===true&&e?.packageReadiness?.issues?.every(x=>(typeof x==='string'?x:x.code)==='missing_pi_pdf');
  if(e?.stage==='needs_review'||(e?.packageReadiness?.ok===false&&!pendingPiOnly)||(e?.strictReady===false&&!pendingPiOnly))return 'needs_operational_review';
  if(plan?.parsedPi?.insertions?.some(i=>i.periodoInicio>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'})))return 'scheduled_needs_verification';
  const applied=e?.applied,ids=[...(applied?.createdInsertions??[]),...(applied?.skippedInsertions??[]).map(x=>x.id)];
  return ids.some(x=>Number(x)>0)?'completed_needs_public_readback':'completed_needs_diagnostic';
 }
 return job?job.status==='failed'?'error':job.status==='running'?'executing':'queued':action.status;
}
export async function loadCampaignActionProgress(client,identity,checklist){
 if(!(await client.query("SELECT to_regclass('adops_campaign_actions') name")).rows[0]?.name)return null;
 const rows=(await client.query('SELECT a.*,p.source_fingerprint,p.plan AS preview_plan,j.status AS job_status,j.result_json AS job_result_json FROM adops_campaign_actions a JOIN adops_campaign_previews p ON p.id=a.preview_id LEFT JOIN ops_jobs j ON j.id=a.job_id WHERE a.identity=$1 ORDER BY a.created_at DESC LIMIT 10',[identity])).rows;
 const a=rows.find(a=>a.source_fingerprint===notificationFingerprint(checklist));if(!a)return null;const phase=campaignActionPhase(a,a.job_id?{status:a.job_status,result_json:a.job_result_json}:null,a.preview_plan);
 const reasons={preview_expired:'A prévia expirou; solicite uma nova prévia antes de confirmar.',commercial_material_revision_changed:'Os dados comerciais mudaram; confira e confirme uma nova prévia.',preflight_requires_review:'A validação operacional não foi aprovada; confira o diagnóstico antes de confirmar outra vez.'};
 return {phase,actionId:a.id,jobId:a.job_id??null,errorCode:a.error_code??null,publicationVerified:a.verification_json?.verified===true,commercialMutationRequested:!!a.job_id,commercialMutation:false,nextStep:phase==='schedule_verified'?'Instalação conferida. Verificar exibição pública na vigência.':phase==='needs_operational_review'?'A execução parou para revisão operacional; conferir o motivo antes de nova tentativa. Nenhuma publicação foi confirmada.':phase==='completed_needs_diagnostic'?'Job terminou sem recibo de cadastro; conferir o diagnóstico, sem assumir publicação.':phase==='verified'?'Publicação conferida no portal para as posições e mídias desta revisão.':phase==='verified_with_execution_warning'?'Publicação conferida; a falha do job permanece registrada e deve ser analisada.':phase==='blocked'?reasons[a.error_code]??'Execução bloqueada antes do job; revisar a prévia.':phase==='executing'?'Acompanhe este mesmo job; não envie novamente.':phase==='queued'?'Job real reservado; aguardando o executor.':phase==='error'?'O job falhou e foi preservado; conferir o diagnóstico antes de qualquer nova tentativa.':phase==='completed_needs_public_readback'?'Execução terminou; conferir o anúncio no portal e a relação antes de afirmar publicação.':'Confirmação registrada; aguardando o despacho do mesmo pedido.'};
}
