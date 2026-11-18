import {createHash} from 'node:crypto';
import {portalLabel} from './whatsapp-message-context.mjs';
export const reviewHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function reviewDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('invalid_date');
 return value;
}
const shortDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`:'data não informada';
export function reviewReportUrl(date,campaignId,site){
 const url=new URL('https://sites.codigo5.com.br/reports/adops-evidencias/');
 url.searchParams.set('mes',date.slice(0,7));url.searchParams.set('from',date);url.searchParams.set('to',date);
 if(campaignId)url.searchParams.set('campaignId',String(campaignId));if(site)url.searchParams.set('portal',site);return url.href;
}
const jsonValue=value=>{if(typeof value!=='string')return value??{};try{return JSON.parse(value);}catch{return {};}};
const resultIds=execution=>['captured','skipped','blocked','failed'].flatMap(key=>Array.isArray(execution?.[key])?execution[key].map(item=>Number(typeof item==='object'?item?.insertionId:item)).filter(Number.isInteger):[]);
export function legacyDailySelectionDiagnostic(row,job,{date,captureAttempts}={}){
 if(!job||captureAttempts!==0||row.published!==true||!row.mediaUrl)return null;
 const payload=jsonValue(job.payload_json),result=jsonValue(job.result_json),execution=result?.execution;
 if(job.kind!=='print-batch'||job.status!=='completed'||payload.routineKind!=='daily-print'||(payload.targetDate??payload.date)!==date||typeof payload.competencia!=='string'||!payload.competencia.trim()||execution?.scopePolicy||!Array.isArray(execution?.captured)||!Number.isFinite(Number(execution?.totalCandidates)))return null;
 const outcomes=resultIds(execution);
 if(outcomes.length!==Number(execution.totalCandidates)||new Set(outcomes).size!==outcomes.length||outcomes.includes(Number(row.id)))return null;
 const rowCompetence=String(row.competencia??'').trim();
 if(!rowCompetence||rowCompetence.toUpperCase()===payload.competencia.trim().toUpperCase())return null;
 return {kind:'legacy_competence_filter',jobId:job.id,requestedCompetence:payload.competencia.trim(),recordedCompetence:rowCompetence};
}
export function classifyReviewProof(row,proof,{date,due=true,activeJobs=[],captureAttempts=null,selectionDiagnostic=null}={}){
 const rawIssues=[proof?.checklistValidation?.blockingIssues,proof?.audit?.issues].flatMap(value=>Array.isArray(value)?value:value?['Contrato de auditoria inválido; requer análise.']:[]);
 const issues=[...new Set(rawIssues.map(x=>{const raw=typeof x==='string'?x:'';return typeof x!=='string'||/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(raw)?'Impedimento registrado na auditoria; consultar o relatório.':raw;}))];
 const approved=proof?.status==='ok'&&proof?.checklistValidation?.approved===true&&proof?.audit?.ok===true&&issues.length===0&&proof?.audit?.visualAudit?.frameSelectionDowngraded!==true&&proof?.isReachable===true&&proof?.hasEvidenceForDate===true&&Number(proof?.urlStatus)>=200&&Number(proof?.urlStatus)<300&&/^https:\/\//.test(proof?.arquivoUrl??'')&&row.evidenceCount===1;
 const provenance=proof?.audit?.captureClass??null;
 let state=approved?'approved':!due?'not_due':activeJobs.length?'in_progress':!proof?'unknown':proof.status==='missing'?'missing':'invalid';
 if(row.evidenceCount>1){state='invalid';issues.push('Mais de um registro de evidência para a mesma inserção e data. Revisar sem apagar o histórico.');}
 const reasons=approved?[]:state==='not_due'?['Aguardando a rotina oficial das18h de Cuiabá.']:state==='in_progress'?['Trabalho existente ainda em andamento; acompanhar o mesmo ID.']:state==='unknown'?['Auditoria indisponível ou item não retornado; causa não confirmada.']:state==='missing'?selectionDiagnostic?.kind==='legacy_competence_filter'?[`No lote diário anterior, a posição não foi selecionada: o filtro considerou ${selectionDiagnostic.requestedCompetence}, enquanto o cadastro registra ${selectionDiagnostic.recordedCompetence}. Essa causa vale para o lote identificado, não para a rotina diária atual.`,'Nenhuma tentativa de captura consta no registro para esta data.']:captureAttempts===0?['Nenhuma evidência ou tentativa de captura consta no registro para esta data.']:['Nenhuma evidência registrada para esta data.']:issues.length?issues:[proof?.status==='invalid_url'?'Imagem inacessível no armazenamento.':'A prova não atende a todos os critérios da auditoria.'];
 if(!row.published)reasons.push('Cadastro sem confirmação de publicação; conferir mídia e relação pública antes de capturar.');
 if(!row.mediaUrl)reasons.push('Mídia não vinculada ao cadastro.');
 return {insertionId:row.id,campaignId:row.campaignId,campaignName:row.campaignName,site:row.site,pi:row.pi,format:row.format,date,state,provenance,reconstructed:provenance==='historical_recovery',imageUrl:approved?proof.arquivoUrl:null,evidenceId:approved?proof.evidenceId:null,reasons,activeJobs,captureAttempts,selectionDiagnostic:selectionDiagnostic?.kind??null,reportUrl:reviewReportUrl(date,row.campaignId,row.site)};
}
export function evidenceReviewMessages(review){
 const messages=[];
 for(const item of review.items){
  // An active job is progress, not a new decision. Keep it in the summary.
  if(item.state==='not_due'||item.state==='in_progress'&&!review.final)continue;
  const identity=`evidence:${item.insertionId}:${review.date}`;
  const title=`${item.campaignName} · ${portalLabel(item.site)} · PI ${item.pi??'não informada'} · #${item.insertionId}`;
  if(item.state==='approved'){
   const text=[`✅ *${title}*`,`Data da evidência: ${shortDate(review.date)} · formato ${item.format??'não informado'}`,'',item.reconstructed?'*Confirmado:* evidência reconstruída depois da data de referência. Ela não comprova veiculação original naquele dia.':'*Confirmado:* evidência aprovada na auditoria salva.','*Sua ação:* nenhuma correção desta evidência; confira a imagem e o relatório se desejar.','',`Imagem pública: ${item.imageUrl}`,`Relatório e auditoria: ${item.reportUrl}`,'A aprovação se refere à evidência desta data; não confirma aceite externo.'].join('\n');
   messages.push({key:reviewHash(['proof-v1',identity,item.evidenceId,item.imageUrl]),identity,revision:reviewHash([item.evidenceId,item.imageUrl]),part:'text',kind:'proof',text});
  }else{
   const revision=reviewHash([item.state,item.reasons,item.activeJobs]);
   const nextStep=item.state==='in_progress'?'acompanhar o mesmo trabalho, sem reenviar.':item.selectionDiagnostic==='legacy_competence_filter'?'a equipe AdOps deve conferir o lote posterior à correção e confirmar a evidência no relatório; não repetir o lote antigo.':item.captureAttempts===0?'a equipe AdOps deve verificar a rotina e, se necessário, solicitar a captura pelo fluxo autorizado; esta mensagem não a dispara.':'conferir cadastro, mídia e relatório antes de solicitar outra captura.';
   const text=[`${item.state==='in_progress'?'⏳':'⚠️'} *${title}*`,`Data da evidência: ${shortDate(review.date)} · formato ${item.format??'não informado'}`,'','*O que aconteceu:* evidência ainda não aprovada nesta conferência.',...item.reasons.map(r=>'• '+r),'',`*Próximo passo:* ${nextStep}`,'*Responsável:* equipe AdOps.',`Relatório e auditoria: ${item.reportUrl}`,'Responda à enquete ou use Responder nesta mensagem. A resposta fica para revisão; não solicita captura nem publica campanha.'].join('\n');
   const poll={name:`#${item.insertionId} · ${shortDate(review.date)} — como seguir?`,values:item.state==='in_progress'?['Acompanhar mesmo trabalho','Pedir análise técnica','Vou conferir no relatório']:['Conferir mídia e cache','Pedir análise técnica','Vou conferir no relatório'],selectableCount:1};
   messages.push({key:reviewHash(['issue-v1',identity,revision,'text']),identity,revision,part:'text',kind:'issue',text});
   messages.push({key:reviewHash(['issue-v1',identity,revision,'poll']),identity,revision,part:'poll',kind:'issue',poll});
  }
 }
 const states=['approved','missing','invalid','in_progress','unknown','not_due'];
 const counts=Object.fromEntries(states.map(state=>[state,review.items.filter(i=>i.state===state).length]));
 const signature=reviewHash(review.items.map(i=>[i.insertionId,i.state,i.evidenceId,i.imageUrl,i.reasons]));
 const approvedLines=review.items.filter(i=>i.state==='approved').map(i=>`✅ ${i.campaignName} · ${portalLabel(i.site)} · PI ${i.pi??'não informada'} #${i.insertionId}${i.reconstructed?' (reconstrução histórica)':''}\n${i.reportUrl}`);
 const sample=review.items.find(i=>i.state==='approved'&&i.imageUrl);
 const pendingLines=review.items.filter(i=>!['approved','not_due'].includes(i.state)).map(i=>`⚠️ ${i.campaignName} · ${portalLabel(i.site)} · PI ${i.pi??'não informada'} #${i.insertionId}: ${i.reasons.join(' ')}`);
 const text=[`📋 *ADOPS — evidências de ${shortDate(review.date)}*`,review.manual?'Conferência manual do histórico salvo':review.final?'Fechamento do dia':'Conferência após a rotina das 18h','', '*Resultado*',`Posições de anúncios: ${review.items.length}`,`✅ Com evidência aprovada: ${counts.approved}`,`⚠️ Faltantes: ${counts.missing} · Reprovadas: ${counts.invalid}`,`⏳ Em andamento: ${counts.in_progress} · Sem confirmação: ${counts.unknown}`,'Esta é uma revisão salva; não é uma consulta ao vivo nem confirmação geral de publicação.',...approvedLines,'','*Pendências*',...(pendingLines.length?pendingLines:['Nenhuma pendência nesta revisão salva.']),'','*Conferir*',...(pendingLines.length?['Responsável: equipe AdOps confere os itens e o relatório antes de solicitar nova captura.']:['Confira imagem e relatório para avaliar as evidências desta data.']),...(sample?[`Exemplo de imagem aprovada: ${sample.imageUrl}`]:[]),`Relatório: ${reviewReportUrl(review.date)}`,'Reconstruções históricas estão identificadas. Aprovação não comprova exposição original no passado.'].join('\n');
 messages.push({key:reviewHash(['daily-v1',review.date,review.final,signature]),identity:`evidence-summary:${review.date}`,revision:signature,part:'text',kind:'summary',text});
 return {messages,counts};
}
