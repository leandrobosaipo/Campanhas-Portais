export const shortDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'data não informada';
export const portalLabel=value=>['PERRENGUE','OMT','AFL','PNMT','PPMT','ROO'].find(code=>code.toLowerCase()===String(value??'').trim().toLowerCase())??(String(value??'').trim()||'portal não informado');
const statusLabel=value=>({ativo:'ativo',active:'ativo',scheduled:'agendado',agendado:'agendado',draft:'rascunho',rascunho:'rascunho',cancelled:'cancelado',cancelado:'cancelado',paused:'pausado',pausado:'pausado',published:'marcado como publicado',publicado:'marcado como publicado',ended:'encerrado',encerrado:'encerrado'})[String(value??'').toLowerCase()]??'status cadastral não informado';
export function dateRanges(dates=[]) {
 const days=[...new Set(dates)].sort(),ranges=[];let first,last;
 for(const day of days){if(last&&Date.parse(day)-Date.parse(last)===86400000){last=day;continue;}if(first)ranges.push(first===last?shortDate(first):`${shortDate(first)} a ${shortDate(last)}`);first=last=day;}
 if(first)ranges.push(first===last?shortDate(first):`${shortDate(first)} a ${shortDate(last)}`);return ranges.join(', ');
}
export function formatWhatsAppContext(c) {
 const context=c.operationalContext;
 if(!context)return ['Situação e evidências: consulta ainda não concluída.'];
 const lines=[];
 for(const p of context.positions??[]){
  const label=`${p.name} · ${shortDate(p.start)} a ${shortDate(p.end)}`;
  if(p.state==='not_monitored_instagram'){lines.push(`• ${label}: Instagram — prints fora do monitoramento AdOps.`);continue;}
  const state=p.state==='future_unverified'||p.state==='scheduled'?'Período futuro. Consulte a confirmação de instalação no AdRotate':p.state==='ended'?'Período encerrado':p.state==='visible'?'Mídia localizada no portal nesta consulta':p.state==='unregistered'?'Cadastro correspondente não localizado':p.state==='ambiguous'?'Cadastro ambíguo; requer conferência':`Cadastro ${statusLabel(p.registrationStatus)} no AdOps; exibição pública não confirmada nesta consulta`;
  lines.push(`• ${label}: ${state}.`);
  if(p.evidence){const e=p.evidence;lines.push(`  Evidências: ${e.approved} auditadas de ${e.required} devidas${e.partial?' (recorte parcial)':''}.`);
   if(e.missingDates?.length)lines.push(`  Faltam: ${dateRanges(e.missingDates)}.`);
   if(e.invalidDates?.length)lines.push(`  Auditoria pendente/reprovada: ${dateRanges(e.invalidDates)}.`);
   if(e.reconstructed)lines.push(`  ${e.reconstructed} recuperadas depois da data de referência, identificadas no relatório.`);
   if(e.todayPending)lines.push(`  Hoje (${shortDate(context.date)}): aguarda a rotina das 18h de Cuiabá.`);
  }else if(!['unregistered','ambiguous'].includes(p.state))lines.push('  Evidências: consulta indisponível; conferir relatório.');
  if(p.mediaUrl)lines.push(`  Mídia vinculada/localizada: ${p.mediaUrl}`);
 }
 if(!context.positions?.length)lines.push('Situação: sem posição conciliada para conferir publicação/evidências.');
 if(context.piSource==='document_filename')lines.push(`PI ${c.pi}: identificada automaticamente no nome do arquivo; coincide com a referência do checklist.`);
 if(context.links?.sheet)lines.push(`Planilha: ${context.links.sheet}`);
 for(const link of context.links?.documents??[])lines.push(`PI/anexo — ${link.name}: ${link.url}`);
 for(const link of context.links?.media??[])lines.push(`Material no Drive — ${link.name}: ${link.url}`);
 for(const url of context.links?.folders??[])lines.push(`Pasta: ${url}`);
 for(const url of context.links?.reports??[])lines.push(`Relatório e datas: ${url}`);
 lines.push(`Conferência salva em ${new Date(context.checkedAt).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})} (Cuiabá); este retrato não é ao vivo e não confirma sozinho a publicação.`);
 return lines;
}
