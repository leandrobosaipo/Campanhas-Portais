import {createHash} from 'node:crypto';
import {notificationFingerprint} from './campaign-notification-policy.mjs';
import {campaignPreviewMessage} from './campaign-action-messages.mjs';
import {allowedCampaignActor,readCampaignAuthorizationConfig,publicationWords,authorizationSourceFingerprint} from './campaign-authorization.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const actionHash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export class ActionError extends Error{constructor(message,status=409){super(message);this.status=status;}}
export function requireAction(condition,message,status=409){if(!condition)throw new ActionError(message,status);}
export const parseActionJson=v=>typeof v==='string'?JSON.parse(v):v;
export function validateActionPreview({checklist,parsedPi,preflight,validation,siteId}){
 const payload=parseActionJson(preflight.payload_json),result=parseActionJson(preflight.result_json),e=result?.execution;
 const pendingPi=validation?.documentaryPending===true&&readCampaignAuthorizationConfig().allowPendingPi===true&&!checklist.document?.sha256&&!e?.sourceDocument?.sha256;
 requireAction(preflight.kind==='drive-pi-ingest'&&preflight.status==='completed'&&payload.preflightOnly===true&&payload.sendTelegram===false,'completed_safe_preflight_required');
 requireAction(/^[a-f0-9]{64}$/.test(result.runnerSourceSha??''),'preflight_loaded_source_attestation_required');
 requireAction(/^[a-f0-9]{64}$/.test(result.runnerMediaSourceSha??''),'preflight_loaded_media_attestation_required');
 const packageReady=e?.packageReadiness?.ok===true||(pendingPi&&e?.packageReadiness?.hasMedia===true&&Array.isArray(e.packageReadiness.issues)&&e.packageReadiness.issues.every(x=>x==='missing_pi_pdf'));
 requireAction(e?.preflightOnly===true&&e.mutationEnabled===false&&(e.strictReady===true||(pendingPi&&payload.operationMode==='operational_minimum'&&e.operationalReady===true))&&e.validation?.ok===true&&packageReady&&e.dedupe?.ok===true,'preflight_requires_review');
 requireAction(actionHash(payload.parsedPi)===actionHash(parsedPi),'parsed_plan_differs_from_preflight');
 requireAction(payload.strictInsertionScope===true&&payload.allowPdfInsertions===false&&payload.generateEvidence===false,'strict_no_extra_insertions_or_capture_required');
 requireAction(norm(parsedPi.piCodigo)===norm(checklist.pi)&&Number(parsedPi.clienteId)>0&&Number(parsedPi.agenciaId)>0,'commercial_identity_required');
 const insertions=parsedPi.insertions,allPositions=checklist.positions??[];
 const excluded=allPositions.filter(p=>norm(p.name)==='INSTAGRAM');
 // Social placement stays in the commercial checklist and fingerprint. A web
 // preview may exclude it only when the exact exclusion is explicitly recorded.
 requireAction(!excluded.length||(validation?.executionScope==='website'&&actionHash(validation.excludedPositions)===actionHash(excluded.map(p=>({name:p.name,start:p.start,end:p.end,reason:'social_delivery_separate'})))),'social_scope_must_be_explicit');
 const positions=allPositions.filter(p=>norm(p.name)!=='INSTAGRAM');
 requireAction(Array.isArray(insertions)&&insertions.length>0&&insertions.length===positions.length,'exact_position_scope_required');
 const key=p=>[norm(p.localFormatoNormalizado??p.localFormato??p.name),p.periodoInicio??p.start,p.periodoFim??p.end].join(':');
 requireAction(new Set(insertions.map(key)).size===insertions.length&&insertions.every(i=>Number(i.siteId)===Number(siteId)&&positions.some(p=>key(p)===key(i))),'position_site_or_period_changed');
 const media=e.mediaProcessing?.results??[];
 requireAction(insertions.every(i=>media.some(m=>Number(m.siteId)===Number(i.siteId)&&norm(m.localFormato)===norm(i.localFormato)&&m.validated===true&&m.uploaded===false&&m.sourceDriveFileId===i.mediaDriveFileId&&String(i.mediaMd5Checksum??'').toLowerCase()===String(m.md5).toLowerCase()&&checklist.files?.some(f=>f.id===m.sourceDriveFileId&&f.checksum&&String(f.checksum).toLowerCase()===String(m.md5).toLowerCase()))),'validated_exact_source_media_required');
 requireAction(validation?.calendarVerified===true&&validation?.placementsVerified===true&&validation?.mediaVerified===true&&validation?.destinationSourceVerified===true&&typeof validation.notes==='string'&&validation.notes.trim().length>=16,'operational_review_required');
 if(!pendingPi){requireAction(typeof e.sourceDocument?.sha256==='string'&&e.sourceDocument.sha256.length===64,'authoritative_pdf_required');requireAction(checklist.document?.sha256===e.sourceDocument.sha256,'authoritative_pdf_changed');}
 else requireAction(validation.sourceReview?.positionsSource==='verified_sheet'&&typeof validation.sourceReview?.clientSource==='string'&&validation.sourceReview.clientSource.length>=8&&typeof validation.sourceReview?.destinationSource==='string'&&validation.sourceReview.destinationSource.length>=8,'complete_non_pdf_source_review_required');
 return {sourceFingerprint:notificationFingerprint(checklist),payload,sourcePdfSha:e.sourceDocument?.sha256??null,documentaryPending:pendingPi,runnerSourceSha:result.runnerSourceSha,runnerMediaSourceSha:result.runnerMediaSourceSha,media};
}
export function assertActionPreviewCurrent(preview,checklist,now=Date.now()){
 requireAction(!preview.cancelled_at,'preview_cancelled');
 requireAction(new Date(preview.expires_at).getTime()>now,'preview_expired');
 if(preview.plan?.authorizationVersion===2)requireAction(preview.plan.parsedPi.insertions?.every(i=>i.periodoFim>=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'})),'period_ended');
 requireAction(notificationFingerprint(checklist)===preview.source_fingerprint,'commercial_material_revision_changed');
 if(preview.plan?.authorizationVersion===2)requireAction(preview.plan.authorizationSourceFingerprint===authorizationSourceFingerprint(checklist),'authorization_source_changed');
}
export function explicitPreviewConfirmation(answer,preview,cfg=readCampaignAuthorizationConfig()){
 const text=String(answer.text_value??'').trim().toLocaleLowerCase('pt-BR'),options=answer.selected_options;
 return preview.plan?.authorizationVersion===2&&new Date(preview.created_at).getTime()>=Date.parse(cfg.cutover)&&allowedCampaignActor(answer,preview.identity,cfg)&&!preview.cancelled_at&&Date.parse(preview.expires_at)>Date.now()
  &&answer.kind==='text'&&!!answer.reply_to&&(!Array.isArray(options)||options.length===0)
  &&answer.identity==='campaign-preview:'+preview.id&&answer.revision===preview.revision&&answer.group_jid===preview.group_jid
  &&!!preview.participant&&answer.participant===preview.participant&&new Date(answer.received_at)>new Date(preview.created_at)
  &&text===publicationWords.toLocaleLowerCase('pt-BR');
}
export function actionPreviewText(p){
 return campaignPreviewMessage(p);
}
