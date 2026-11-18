// Presentation only: delivery keys, approval and execution policy stay with callers.
const label=v=>String(v??'').replace(/[\r\n*_`]/g,' ').trim().slice(0,180);
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v??'')?v.slice(8)+'/'+v.slice(5,7):'data não informada';
const localTime=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})+' (Cuiabá)':'horário não informado';
function context(preview,identity){
 const plan=preview?.plan??{},pi=plan.parsedPi??{},parts=String(identity??'').split(':');
 const site=label(plan.labels?.site||plan.validation?.siteLabel||parts[0]||'Portal não informado');
 const number=label(pi.piCodigo||parts.slice(1).join(':')||'não informada');
 const report=new URL('https://sites.codigo5.com.br/reports/adops-evidencias/');
 const start=pi.insertions?.[0]?.periodoInicio;
 if(start)report.searchParams.set('mes',start.slice(0,7));
 report.searchParams.set('q',number);
 const portal=String(parts[0]||site).toUpperCase();
 if(['AFL','OMT','PERRENGUE','PNMT','PPMT','ROO'].includes(portal))report.searchParams.set('portal',portal);
 return {plan,pi,site,number,report:report.href};
}
const phases={
 schedule_verified:['📅 Cadastro antecipado confirmado','O AdRotate confirmou anúncio, grupo e período das posições futuras.','A exibição no portal será conferida durante a vigência.'],
 scheduled_needs_verification:['📅 Agendamento em conferência','O trabalho terminou para um período futuro. A instalação ainda exige conferência; a exibição pública não está devida hoje.','Automação: conferir instalação e exibição na vigência. Este aviso não confirma mídia visível nem prova auditada.'],
 claimed:['⏳ Confirmação recebida','Seu pedido foi reservado e aguarda o executor.','Automação: iniciar este mesmo pedido. Você não precisa confirmar novamente.'],
 queued:['⏳ Publicação na fila','O pedido entrou na fila. A publicação ainda não foi confirmada.','Automação: acompanhar este mesmo trabalho até obter o resultado.'],
 executing:['🔄 Publicação em andamento','O executor está processando o pedido autorizado. O resultado final ainda será conferido.','Automação: concluir o processamento e conferir o anúncio no portal.'],
 completed_needs_public_readback:['🔎 Publicação em conferência','O processamento terminou; ainda falta comprovar a exibição no portal.','Automação: conferir cadastro, anúncio e mídia pública antes de declarar publicado.'],
 verified:['✅ Publicação confirmada','As posições foram conferidas no portal e na API.','Você: pode conferir no relatório. As provas têm auditoria própria; veja as datas no link.'],
 verified_with_execution_warning:['✅ Publicação confirmada com alerta técnico','A exibição foi confirmada no portal. A tentativa de execução teve uma falha técnica, mantida no histórico.','Equipe técnica: analisar a falha preservada, sem repetir a publicação já confirmada. Você pode conferir no relatório.'],
 error:['⚠️ Execução interrompida','O trabalho registrou uma falha. Isso não confirma que nenhuma parte foi publicada.','Equipe técnica: conferir o resultado parcial deste mesmo pedido antes de tentar outra vez.'],
 needs_operational_review:['⚠️ Publicação precisa de análise','O processamento não liberou uma conclusão segura. A publicação ainda não está confirmada.','Equipe técnica: conferir o diagnóstico e os resultados parciais. Não repetir o pedido enquanto o resultado estiver incerto.'],
 completed_needs_diagnostic:['⚠️ Resultado ainda não confirmado','O trabalho terminou sem um comprovante suficiente do cadastro/publicação.','Equipe técnica: consultar o mesmo trabalho e verificar cadastro e portal.'],
 blocked:['✋ Pedido aguardando revisão','A validação bloqueou a execução desta revisão.','Você: aguarde uma prévia atualizada e confira os dados antes de confirmar novamente.'],
};
export function campaignActionMessage({preview,action,status}){
 const c=context(preview,action.identity),[title,what,next]=phases[status.phase]??['🔎 Pedido em conferência','Ainda não há confirmação suficiente para concluir esta etapa.','Equipe técnica: conferir o estado deste mesmo pedido.'];
 const lines=[`*${title}*`,'',`*${label(c.pi.campanhaNome)||'Campanha'} — PI ${c.number}*`,`📍 ${c.site}`,...(c.pi.insertions??[]).map(i=>`• ${label(i.localFormato)}: ${day(i.periodoInicio)} a ${day(i.periodoFim)}`),'','*O que aconteceu*',what];
 if(['error','needs_operational_review','verified_with_execution_warning'].includes(status.phase))lines.push('','*Diagnóstico disponível*',status.failureSummary||'A causa exata ainda está em investigação.');
 if(status.phase==='blocked')lines.push('','*O que precisa ser revisto*',status.errorCode==='preview_expired'?'A prévia expirou; é necessário conferir uma nova prévia.':status.errorCode==='commercial_material_revision_changed'?'Os dados mudaram depois da prévia. A confirmação antiga não vale para os dados novos.':'A validação operacional precisa ser conferida antes de continuar.');
 lines.push('','*Próximo passo*',next,'','*Conferir*',c.report,'','*Evidências*','Este aviso não confirma provas auditadas. Consulte a data de cada prova no relatório.');
 if(action.job_id)lines.push('',`Referência para suporte: ${label(action.job_id)}`);
 return lines.join('\n');
}
export function campaignPreviewMessage(p){
 const c=context(p,p.identity),plan=c.plan,pi=c.pi;
 const mediaLinks=(plan.media??[]).filter(m=>m.sourceDriveFileId).map(m=>`Material — ${label(m.sourceName)||'mídia conferida'}: https://drive.google.com/file/d/${encodeURIComponent(m.sourceDriveFileId)}/view`);
 return ['📝 *Confira antes de publicar*','',`*${label(pi.campanhaNome)||'Campanha'} — PI ${c.number}*`,`📍 ${c.site}`,
  `Cliente: ${label(plan.labels?.client||plan.validation?.clientLabel)||'identificação no pedido'}`,
  `Agência: ${label(plan.labels?.agency||plan.validation?.agencyLabel)||'identificação no pedido'}`,
  '','*Posições e período*',...(pi.insertions??[]).map(i=>`• ${label(i.localFormato)}: ${day(i.periodoInicio)} a ${day(i.periodoFim)}\n  Material: ${label(plan.media?.find(m=>m.sourceDriveFileId===i.mediaDriveFileId)?.sourceName)||'mídia conferida'}`),
  ...((plan.validation?.excludedPositions??[]).length?['','*Entrega separada*',...(plan.validation.excludedPositions.map(p=>`• ${label(p.name)}: ${day(p.start)} a ${day(p.end)}. A publicação social não é executada por esta prévia do site.`))]:[]),
  ...((plan.operations??[]).map(o=>`${label(o.position)}: ${label(o.action)}${o.insertionIds?.length?' · #'+o.insertionIds.join(', #'):''}.`)),
  '','*Já conferido*',plan.validation?.documentaryPending?'Cliente, campanha, calendário da planilha, posições, mídia e destino. PI pendente: a publicação pode avançar e o documento continuará sendo procurado para conciliação.':'PDF da PI, calendário, posições, mídia e destino. A publicação ainda não foi executada.',`Destino: ${pi.clickUrl||'sem link'}`,
  '','*O que sua confirmação autoriza*','Cadastrar e publicar somente as posições desta prévia, preservando as outras campanhas; depois gerar e auditar as provas do site.',
  '','*Sua ação agora*','Use Responder NESTA mensagem e escreva: *Autorizar cadastro e publicação*.',
  '“Ciente”, “recebido” e “Solicitar prévia” não autorizam publicar. Para corrigir: Revisar dados. Para desistir antes da execução: Cancelar solicitação.',
  `Validade: ${localTime(p.expires_at)}`,`Revisão: ${label(p.revision?.slice(0,12))}`,
  '','*Links para conferir*',...mediaLinks,c.report,...(plan.folderId?[`Pasta: https://drive.google.com/drive/folders/${encodeURIComponent(plan.folderId)}`]:[])].join('\n');
}
