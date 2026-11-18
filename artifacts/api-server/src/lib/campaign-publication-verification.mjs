import {createHash} from 'node:crypto';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const day=v=>String(v??'').slice(0,10);
export function appliedPublicationIds(execution){return [...new Set([...(execution?.applied?.createdInsertions??[]),...(execution?.applied?.skippedInsertions??[])].map(x=>Number(x&&typeof x==='object'?x.id:x)).filter(x=>Number.isInteger(x)&&x>0))];}
export function safeCampaignFailure(value){
 const s=String(value??'');
 if(/rebuild|headless/i.test(s))return 'A etapa de confirmação da atualização do site falhou. O anúncio pode já ter sido instalado; conferir a exibição antes de repetir a publicação.';
 if(/fetch failed/i.test(s))return 'Uma chamada de rede falhou. O registro não permite afirmar qual serviço causou a falha; conferir a etapa e o resultado parcial deste mesmo trabalho.';
 if(/timeout|timed out|tempo.*exced/i.test(s))return 'O prazo de resposta foi excedido. O resultado pode ter sido aplicado parcialmente; consultar este mesmo trabalho antes de reenviar.';
 if(/perfil de m[ií]dia|operational_media_profile/i.test(s))return 'A configuração do formato de mídia não foi resolvida. Conferir portal e posição antes de validar outra prévia.';
 if(/site_catalog|site_identity_mismatch/.test(s))return 'A identificação do portal não pôde ser validada. Conferir a configuração antes de continuar.';
 if(/compress|ffprobe|v[ií]deo/i.test(s))return 'O processamento ou a validação do vídeo não concluiu. A causa exata exige conferir o diagnóstico desta tentativa.';
 return 'A execução registrou uma falha técnica. A causa exata ainda precisa ser investigada neste mesmo trabalho.';
}
export function evaluatePublicationReadback({plan,execution,jobStatus,items,targets,today,checkedAt=new Date().toISOString(),intakeRecovery=null}){
 const issues=[],executionIds=appliedPublicationIds(execution),ids=executionIds.length?executionIds:(intakeRecovery?.insertionIds??[]),mediaProcessing=execution?.mediaProcessing??intakeRecovery?.mediaProcessing,expected=plan.parsedPi.insertions;
 if(!['completed','failed'].includes(jobStatus))issues.push('job_not_terminal');
 if(ids.length!==expected.length||items.length!==expected.length)issues.push('execution_scope_incomplete');
 const receipts=[];
 for(const raw of expected){const target=targets.find(t=>Number(t.siteId)===Number(raw.siteId)&&norm(t.localFormato)===norm(raw.localFormatoNormalizado??raw.localFormato));const matches=items.filter(x=>Number(x.insertion.siteId)===Number(raw.siteId)&&norm(x.insertion.localFormatoNormalizado??x.insertion.localFormato)===norm(raw.localFormatoNormalizado??raw.localFormato)&&day(x.insertion.periodoInicio)===raw.periodoInicio&&day(x.insertion.periodoFim)===raw.periodoFim);if(matches.length!==1){issues.push('position_identity_not_unique');continue;}const {insertion:i,relation:r,mediaHead,campaign}=matches[0],local=[];const m=mediaProcessing?.results?.find(m=>Number(m.siteId)===Number(raw.siteId)&&norm(m.localFormato)===norm(raw.localFormato)&&m.sourceDriveFileId===raw.mediaDriveFileId);
  if(!ids.includes(Number(i.id))||norm(i.piCodigo)!==norm(plan.parsedPi.piCodigo)||!target?.groupId)local.push('commercial_identity_mismatch');
  if(!campaign||Number(campaign.id)!==Number(i.campanhaId)||norm(campaign.pi_codigo)!==norm(plan.parsedPi.piCodigo)||Number(campaign.cliente_id)!==Number(plan.parsedPi.clienteId)||Number(campaign.agencia_id)!==Number(plan.parsedPi.agenciaId))local.push('campaign_master_identity_mismatch');
   const publications=(execution?.publicationResults??[]).filter(row=>Number(row.insertionId)===Number(i.id));
   const installed=publications.length===1?publications[0].published:null,wp=installed?.wpCliResult;
   const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
   const pin=plan.targets?.find(t=>Number(t.siteId)===Number(i.siteId)&&norm(t.localFormato)===norm(raw.localFormatoNormalizado??raw.localFormato));
   const validSchedule=!(jobStatus!=='completed'||installed?.apply!==true||installed?.scheduled!==true||wp?.schedule_verified!==true||
     Number(wp?.insertion_id)!==Number(i.id)||!positive(wp?.ad_id)||!positive(wp?.schedule_id)||!positive(pin?.groupId)||
     Number(pin.groupId)!==Number(target?.groupId)||Number(wp?.group_id)!==Number(pin.groupId)||
     wp?.period_start!==raw.periodoInicio||wp?.period_end!==raw.periodoFim);
  if(!m?.mediaUrl||i.mediaUrl!==m.mediaUrl)local.push('media_identity_mismatch');
  if(raw.periodoInicio>today){
   if(!validSchedule)local.push('future_schedule_not_confirmed');
   if(mediaHead?.ok!==true)local.push('public_media_http_not_confirmed');
   receipts.push({insertionId:Number(i.id),groupId:target?.groupId??null,periodStart:raw.periodoInicio,periodEnd:raw.periodoFim,
    scheduled:local.length===0,adId:wp?.ad_id??null,scheduleId:wp?.schedule_id??null,issues:local});
   issues.push(...local);continue;
  }
  if(r.mediaUrl!==i.mediaUrl)local.push('media_identity_mismatch');
  const p=r.plannedSelf;if(!p||Number(p.insertionId)!==Number(i.id)||norm(p.piCodigo)!==norm(plan.parsedPi.piCodigo)||day(p.periodoInicio)!==raw.periodoInicio||day(p.periodoFim)!==raw.periodoFim||Number(r.adrotateGroupId)!==Number(target?.groupId)||Number(p.adrotateGroupId)!==Number(target?.groupId))local.push('relation_identity_mismatch');
  const adminExact=(r.historicalAdminMatches??[]).filter(x=>typeof p?.externalKey==='string'&&p.externalKey.length>0&&x.adopsExternalKey===p.externalKey&&x.mediaUrl===i.mediaUrl&&Number(x.groupId)===Number(target?.groupId));
  if(raw.periodoInicio>today||raw.periodoFim<today)local.push('position_not_active_today');
  const observed=(r.exactLiveMatches??[]).filter(x=>Number(x.groupId)===Number(target?.groupId)&&(x.mediaUrl===i.mediaUrl||x.mediaBasename===r.mediaBasename)),adIds=[...new Set(observed.map(x=>Number(x.adId)).filter(x=>x>0))];
  const scheduledAdObserved=validSchedule&&adIds.length===1&&adIds[0]===Number(wp.ad_id)&&observed.every(x=>x.mediaUrl===i.mediaUrl);
  if(validSchedule&&!scheduledAdObserved)local.push('scheduled_public_ad_identity_mismatch');
  if(i.bannerPublicadoNoSite!==true&&!scheduledAdObserved&&!(jobStatus==='failed'&&adminExact.length===1))local.push('publication_flag_not_confirmed');
  if(r.rotation?.expectedMediaObserved!==true||adIds.length!==1)local.push('expected_public_media_not_uniquely_observed');
  const destination=raw.clickUrl||plan.parsedPi.clickUrl;
  if(plan.authorizationVersion===2){
   const noLink=plan.parsedPi.destinationMode==='none'&&plan.parsedPi.clickUrl===null;
   if(noLink?(observed.length!==1||observed[0].linklessMediaConfirmed!==true||observed[0].clickHref!=null):(!destination||observed.length!==1||observed[0].clickHref!==destination))local.push('public_click_destination_not_confirmed');
  }
  if(mediaHead?.ok!==true)local.push('public_media_http_not_confirmed');
  if(i.bannerPublicadoNoSite!==true&&adminExact.length===1&&!adIds.includes(Number(adminExact[0].adId)))local.push('admin_public_ad_identity_mismatch');
  receipts.push({insertionId:Number(i.id),campaignId:Number(i.campanhaId),siteId:Number(i.siteId),format:raw.localFormato,groupId:target?.groupId??null,targetSource:target?.source??null,periodStart:raw.periodoInicio,periodEnd:raw.periodoFim,mediaUrl:i.mediaUrl,adIds,adopsPublicationFlag:i.bannerPublicadoNoSite===true,mediaHTTP:mediaHead??null,issues:local});issues.push(...local);
 }
 const unique=[...new Set(issues)],allChecked=unique.length===0&&receipts.length===expected.length&&receipts.length>0,scheduleVerified=allChecked&&receipts.some(p=>p.scheduled===true),verified=allChecked&&!scheduleVerified,proof={scheduleVerified,verified,state:scheduleVerified?'schedule_verified':verified?'verified':ids.length!==expected.length?'error':'pending',issues:unique,positions:receipts,executionStatus:jobStatus,executionWarning:jobStatus==='failed',evidenceSource:executionIds.length?'job_execution':intakeRecovery?.source??'job_execution',intakeProvenance:intakeRecovery?{eventId:intakeRecovery.eventId,driveFileId:intakeRecovery.driveFileId,sourcePdfSha:intakeRecovery.sourcePdfSha,appliedParseRunId:intakeRecovery.appliedParseRunId,mediaParseRunId:intakeRecovery.mediaParseRunId}:null};
 return {...proof,checkedAt,proofHash:createHash('sha256').update(JSON.stringify(proof)).digest('hex')};
}
export async function publicMediaHead(url,{fetcher=fetch,allowedHosts=[]}={}){try{const u=new URL(url);if(u.protocol!=='https:'||u.port||u.username||u.password||(!u.hostname.endsWith('.digitaloceanspaces.com')&&!allowedHosts.includes(u.hostname)))return {ok:false,reason:'media_host_not_approved'};const r=await fetcher(u,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)}),type=r.headers.get('content-type')??'';return {ok:r.status===200&&/^(image|video)\//.test(type),status:r.status,contentType:type.split(';')[0],bytes:Number(r.headers.get('content-length'))||null};}catch{return {ok:false,reason:'media_head_unavailable'};}}
