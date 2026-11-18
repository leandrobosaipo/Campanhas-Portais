import {allowedCampaignActor,readCampaignAuthorizationConfig} from './campaign-authorization.mjs';

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
const pi=v=>String(v??'').toUpperCase().trim().replace(/^P\.?\s*I\.?\s*[:#-]?\s*/,'').trim();
function requireValue(ok,code){if(!ok)throw new Error(code);}
export function preparationRequest(a,cfg){
 const requested=a.kind==='text'?String(a.text_value??'').trim().toLocaleLowerCase('pt-BR')==='solicitar prévia':a.kind==='poll'&&a.selected_options?.length===1&&a.selected_options[0]==='Solicitar prévia';
 return Boolean(requested&&a.reply_to&&a.status==='linked_for_review'&&allowedCampaignActor(a,a.identity,cfg));
}
export function preparationFolder(c){
 const ids=[...new Set((c.known??[]).flatMap(s=>String(s).match(/https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]+)/)?.[1]??[]))];
 requireValue(ids.length===1,'exact_drive_folder_required');return ids[0];
}
export function preparationEvent(p,stage,parsedPi){
 return {eventId:`drive:${p.folderId}:wa-preview:${p.id}:${stage}`,driveFileId:p.folderId,name:'Prévia comercial solicitada',mimeType:'application/vnd.google-apps.folder',path:'/drive/'+p.folderId,parentFolderId:null,modifiedTime:p.created_at,webViewLink:'https://drive.google.com/drive/folders/'+p.folderId,eventType:'folder_updated',source:'macmini-api-preflight',preflightOnly:true,publish:false,sendTelegram:false,purgeCache:false,generateEvidence:false,preserveOtherInsertions:true,explicitFolder:true,resolveMedia:stage==='strict',strictInsertionScope:true,allowPdfInsertions:false,...(p.documentaryPending?{operationMode:'operational_minimum'}:{}),...(parsedPi?{parsedPi}:{})};
}
export function buildPreparationPlan(c,fields,e,site,groupFor,today,{discovery=false}={}){
 const pendingPi=readCampaignAuthorizationConfig().allowPendingPi===true&&!c.document?.sha256&&!e.sourceDocument?.sha256;
 const outstanding=[...(c.missing??[]),...(c.conflicts??[])].filter(x=>!(pendingPi&&/^(missing_pi_pdf|PDF da PI não localizado)/.test(String(x))));
 requireValue(!outstanding.length,'source_conflict_requires_review');
 requireValue(e.preflightOnly===true&&e.mutationEnabled===false,'safe_preflight_required');
 if(!pendingPi)requireValue(c.document?.sha256&&c.document.sha256===e.sourceDocument?.sha256,'authoritative_pdf_changed');
 requireValue(/^\d+$/.test(pi(fields.piCodigo))&&pi(fields.piCodigo)===pi(c.pi)&&Number(fields.clienteId)>0&&Number(fields.agenciaId)>0&&fields.campaignName,'commercial_identity_review_required');
 if(!pendingPi)requireValue(pi(fields.pdfPiCodigo)===pi(c.pi),'authoritative_pi_review_required');
 // Only a uniquely labeled destination in the source PDF is authoritative.
 // Parser-extracted generic links (for example, signatures or verification URLs) are ignored.
 const marked=[...String(e.sourceDocument?.textExcerpt??'').matchAll(/(?:destino(?:\s+do\s+clique)?|url\s+de\s+destino|link\s+de\s+destino|landing\s+page)\s*[:=]\s*((?:https?):\/\/[^\s<>]+)/gi)].map(m=>m[1]);
 const uniqueMarked=[...new Set(marked)];
 requireValue(uniqueMarked.length<=1,'destination_source_review_required');
 // A non-PDF destination must have an explicit source record; never accept a generic parser URL.
 if(pendingPi)requireValue(fields.destinationSourceVerified===true&&typeof fields.destinationSource==='string'&&fields.destinationSource.length>=8,'destination_source_review_required');
 const noDestination=pendingPi?fields.destinationMode==='none':uniqueMarked.length===0;
 const destination=noDestination?null:pendingPi?fields.clickUrl:uniqueMarked[0];
 if(!noDestination){
  let validHttps=false;
  try{validHttps=new URL(destination).protocol==='https:';}catch{}
  requireValue(validHttps,'invalid_destination_url');
 }
 const excluded=(c.positions??[]).filter(p=>norm(p.name)==='INSTAGRAM');
 const positions=(c.positions??[]).filter(p=>norm(p.name)!=='INSTAGRAM');requireValue(positions.length>0,'exact_position_scope_required');
 const targets=[],insertions=[];
 for(const p of positions){
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.start)&&/^\d{4}-\d{2}-\d{2}$/.test(p.end)&&p.start<=p.end,'period_review_required');
  requireValue(p.end>=today,'period_ended');
  const matches=(fields.insertions??[]).filter(i=>Number(i.siteId)===Number(site.id)&&norm(i.localFormatoNormalizado??i.localFormato)===norm(p.name)&&i.periodoInicio===p.start&&i.periodoFim===p.end);
  if(!discovery)requireValue(matches.length===1,'ambiguous_or_changed_position');
  const pdfMatches=(fields.pdfInsertions??[]).filter(i=>Number(i.siteId)===Number(site.id)&&norm(i.localFormatoNormalizado??i.localFormato)===norm(p.name)&&i.periodoInicio===p.start&&i.periodoFim===p.end);
  if(!pendingPi)requireValue(pdfMatches.length===1,'calendar_source_review_required');
  else requireValue(/:R\d+C\d+$/.test(p.source??''),'verified_sheet_calendar_required');
  const sourceMediaId=matches.length===1?matches[0].mediaDriveFileId:null;
  const media=discovery?(c.files??[]).filter(f=>(!sourceMediaId||f.id===sourceMediaId)&&f.checksum&&(norm(p.name)==='VIDEO'?/^video\//.test(f.mimeType):/^image\//.test(f.mimeType))&&!(c.piDocumentImages??[]).some(d=>d.id===f.id||d.name===f.name)).map(f=>({sourceDriveFileId:f.id,md5:f.checksum})):(e.mediaProcessing?.results??[]).filter(m=>Number(m.siteId)===Number(site.id)&&norm(m.localFormato)===norm(p.name)&&m.validated===true&&m.uploaded===false&&c.files?.some(f=>f.id===m.sourceDriveFileId&&f.checksum&&f.checksum.toLowerCase()===String(m.md5).toLowerCase()));
  requireValue(media.length===1,'exact_validated_media_required');
  const groupId=groupFor(c.site,p.name);requireValue(Number.isInteger(groupId)&&groupId>0,'group_mapping_review_required');
  targets.push({siteId:Number(site.id),localFormato:p.name,groupId});
  insertions.push({siteId:Number(site.id),localFormato:p.name,localFormatoNormalizado:p.name,periodoInicio:p.start,periodoFim:p.end,mediaDriveFileId:media[0].sourceDriveFileId,mediaMd5Checksum:media[0].md5,clickUrl:destination});
 }
 requireValue(new Set(insertions.map(i=>[i.siteId,norm(i.localFormato),i.periodoInicio,i.periodoFim].join(':'))).size===positions.length,'duplicate_position_scope');
 return {parsedPi:{piCodigo:c.pi,campanhaNome:fields.campaignName,competencia:fields.competencia,clienteId:Number(fields.clienteId),agenciaId:Number(fields.agenciaId),destinationMode:noDestination?'none':'https',clickUrl:destination,insertions},targets,
  validation:{calendarVerified:true,placementsVerified:true,mediaVerified:!discovery,destinationSourceVerified:true,documentaryPending:pendingPi,executionScope:'website',excludedPositions:excluded.map(p=>({name:p.name,start:p.start,end:p.end,reason:'social_delivery_separate'})),...(pendingPi?{sourceReview:{positionsSource:'verified_sheet',clientSource:'Identidade comercial estruturada e conferida no cadastro mestre.',destinationSource:fields.destinationSource}}:{}),notes:`Conferência determinística: ${pendingPi?'PI pendente; dados comerciais completos e calendário da planilha':'PDF autoritativo e calendário por posição'}, destino ${noDestination?'sem link':'HTTPS com fonte identificada'} e grupo configurado. Mídia candidata exige preflight com checksum antes da prévia.`,evidence:{sourcePdfSha:e.sourceDocument?.sha256??null,destinationMode:noDestination?'none':'https',destination,targets}}};
}
export function preparationFailureText(identity,code){
 if(code==='commercial_identity_review_required')return `*Prévia interrompida — ${identity}*\nEtapa: identificação comercial. Falta confirmar cliente, agência ou nome da campanha nas fontes. A PI pode chegar depois; estes dados precisam estar completos antes de publicar. Próximo passo: informar o dado faltante no cadastro/fonte e solicitar a prévia novamente. Nenhuma publicação foi iniciada.`;
 if(code==='source_conflict_requires_review')return `*Prévia interrompida — ${identity}*\nEtapa: comparação das fontes. Há dados ausentes ou divergentes no checklist. A ausência isolada de PI não bloqueia a publicação quando os demais dados estão conferidos. Próximo passo: corrigir a divergência indicada no checklist e solicitar a prévia novamente.`;
 if(code==='preparation_deadline_exceeded'||code==='technical_retries_exhausted')return `*Preparação interrompida — ${identity}*\n${code==='preparation_deadline_exceeded'?'O executor não concluiu a preparação em 30 minutos.':'As três retentativas técnicas foram esgotadas.'}\nEtapa: preparação da prévia. Próximo responsável: operação AdOps deve consultar o trabalho preservado e o estado do servidor. O acompanhamento automático desta tentativa foi encerrado; não houve autorização de publicação. Referência: ${code}.`;
 const reasons={invalid_destination_url:'A URL de destino precisa ser HTTPS válida.',destination_source_review_required:'A URL encontrada não está identificada como destino do clique no documento. A revisão operacional precisa confirmar a origem do destino.',calendar_source_review_required:'O calendário por posição no PDF precisa de revisão operacional; não foi substituído pelas datas da planilha.',ambiguous_or_changed_position:'Posição, portal ou período divergente/ambíguo entre as fontes.',exact_validated_media_required:'A mídia precisa de validação binária e checksum para esta posição.',period_ended:'O período terminou; esta solicitação não pode publicar a campanha.'};
 return `*Prévia aguardando revisão — ${identity}*\n${reasons[code]??'A conferência não pôde concluir esta etapa com segurança. A equipe precisa revisar as fontes e o diagnóstico preservado.'}\nReferência técnica: ${code}\nNenhum cadastro ou publicação foi autorizado. Após a correção, responda Solicitar prévia ao aviso atual.`;
}
