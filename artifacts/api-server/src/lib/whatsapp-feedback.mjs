import {formatWhatsAppContext,portalLabel} from './whatsapp-message-context.mjs';
import {campaignProgress} from './campaign-notification-policy.mjs';
const shortDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`:'data não informada';
const issueText=value=>{const raw=String(value??'').replace(/^.*?:\s*/, '').trim();const known={missing_pi_pdf:'PDF da PI não localizado; a validação documental fica pendente.',missing_media:'mídia não localizada; não é possível confirmar a correspondência.',media_mismatch:'mídia diverge do cadastro; precisa de conferência.',pi_mismatch:'número da PI diverge entre as fontes.',ambiguous_insertion:'há mais de um cadastro para a posição.'}[raw];return known??(/^[a-z]+(?:_[a-z]+)+$/.test(raw)?'Há uma divergência registrada; precisa de conferência.':raw||'Informação pendente de conferência.');};
// A receipt acknowledges storage only. Operational results need their own verified event.
export function acknowledgement(answer,checklist) {
  if (!answer?.event_key || !['text', 'poll'].includes(answer.kind)) return null;
  const linked = answer.status === 'linked_for_review' && Boolean(answer.identity);
  if(linked&&/^campaign-(?:preview|action):/.test(answer.identity))return {key:`${answer.event_key}:received:v1`,text:'Recebi sua orientação sobre a prévia. O vínculo e a revisão serão validados antes de qualquer execução. Ciente e recebido não autorizam cadastrar ou publicar.'};
  if(linked&&/^(?:evidence:|evidence-summary:)/.test(answer.identity))return {key:`${answer.event_key}:received:v1`,text:'Recebi sua orientação sobre o relatório/evidência e registrei para revisão. Não solicitei nova captura nem publiquei campanha.'};
  if (!linked && answer.status !== 'unlinked_for_review') return null;
  const requested=String(answer.text_value??answer.selected_options?.join(', ')??'').trim().slice(0,350);
  const intent=requested.toLocaleLowerCase('pt-BR');
  const context=checklist?`${checklist.campaignName||checklist.campaign||(checklist.known??[]).find(x=>x.startsWith('Campanha:'))||'Campanha'} · ${portalLabel(checklist.site)} · PI ${checklist.pi||'pendente'}`:answer.identity;
  if(linked&&intent==='solicitar prévia')return {key:`${answer.event_key}:received:v1`,text:`*Recebido: solicitar prévia*\n${context}\nFluxo: conferir dados comerciais, período, posições, destino e arquivos; preparar a revisão para publicação. A próxima consulta ocorre em até 1 minuto. Se faltar informação ou a etapa exceder o prazo, enviarei o ponto de parada. A publicação depende da confirmação da prévia validada.`};
  if(linked&&/publicar|publicação|publicacao/.test(intent))return {key:`${answer.event_key}:received:v1`,text:`*Recebido: pedido de publicação*\n${context}\nPedido: ${requested}\nEsta resposta está vinculada ao resumo da campanha. Falta vinculá-la à prévia executável validada: responda à mensagem de prévia com a confirmação indicada nela. Etapa parada: validação da autorização; o resumo não iniciou a publicação.`};
  return {
    key: `${answer.event_key}:received:v1`,
    text: linked
      ? `*Orientação recebida*\n${context}\nPedido: ${requested||'resposta à mensagem citada'}\nFluxo: revisão da campanha. A orientação foi registrada; não há execução de publicação em andamento por esta resposta.`
      : 'Recebi e salvei sua mensagem, mas ela veio sem referência a uma campanha. Use Responder na mensagem do checklist para vincular sua orientação; esta mensagem foi preservada.',
  };
}

export function mayClaimFeedback(row) {
  // A reserved attempt is delivery_unknown and must never be automatically resent.
  return row?.status === 'pending' && !row?.provider_id && !row?.attempted_at;
}

export function reviewFeedback(answer, checklist, revision, source, observedAt) {
  if (!answer?.event_key || !answer.identity || answer.status !== 'linked_for_review' || !revision) return null;
  const observed=Date.parse(observedAt), received=Date.parse(answer.received_at);
  if (!Number.isFinite(observed)||!Number.isFinite(received)||observed<=received) return null;
  const known=(checklist.known||[]).filter(x=>typeof x==='string');
  const missing=(checklist.missing||[]).filter(x=>typeof x==='string');
  const conflicts=(checklist.conflicts||[]).filter(x=>typeof x==='string');
  const campaign=known.find(x=>x.startsWith('Campanha:'))?.replace(/^Campanha:\s*/,'').replace(/\.$/,'')||checklist.campaignName||checklist.campaign||'Campanha';
  const periods=(checklist.positions??[]).map(p=>`${p.name}: ${shortDate(p.start)} a ${shortDate(p.end)}`);
  const progress=campaignProgress(checklist,answer,answer.answered_checklist);
  const preview=progress.answerIntent==='request_preview'?[`*Conferência das fontes — ${checklist.piWaived?'sem PI — confirmado':'PI '+(checklist.pi||'não informada')}*`,
    ...periods.map((period,index)=>`• ${period}. Cadastros: ${(checklist.positions[index].insertionIds??[]).map(id=>'#'+id).join(', ')||'nenhum correspondente localizado'}.`),
    ...(checklist.files??[]).filter(f=>/^(image|video)\//.test(f.mimeType)||f.mimeType==='application/pdf').map(f=>`• ${f.name}: https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`),
    progress.materialChangedSinceAnswer?'Os dados comerciais mudaram desde a mensagem respondida. A orientação anterior precisa de nova conferência.':'A revisão comercial coincide com a mensagem respondida; diferenças técnicas não são nova autorização.',
    'Destino do clique, correspondência da mídia por posição e validade do período precisam ser conferidos antes de uma confirmação de cadastro.',
    'Solicitar prévia não autoriza cadastrar ou publicar. Ciente/recebido também não autorizam. Estado: aguardando conferência e confirmação da revisão exata. Esta prévia não inicia executores.']:[];
  const text=[`*${campaign}* · *${portalLabel(checklist.site)}*`,
    `*PI:* ${checklist.piWaived?'sem PI — confirmado':checklist.pi||'não informada'}`,...(periods.length?[`*Período:* ${periods.join('; ')}`]:['*Período:* não informado']),
    `*Atualização das fontes:* conferi ${source==='drive'?'os materiais no Drive':'a planilha'} e consultei os cadastros e auditorias. Este resumo não confirma a execução do seu pedido. O preparador envia separadamente a prévia executável ou o motivo da interrupção.`,
    ...formatWhatsAppContext(checklist),
    ...preview,
    ...missing.map(x=>'*Falta/impacto:* '+issueText(x)),...conflicts.map(x=>'*Divergência/impacto:* '+issueText(x)),
    missing.length||conflicts.length?'*Próximo responsável:* solicitante envia/corrige os itens; a equipe AdOps confere novamente.':'*Próximo responsável:* equipe AdOps confere a prévia e retorna para validação humana.',
    'Ação realizada: conferência e atualização do checklist. Nenhum anúncio foi republicado e nenhuma evidência foi substituída.'].join('\n');
  // Preserve complete source links; never truncate a URL halfway through.
  return {key:`${answer.event_key}:review:v2`,text};
}

export async function queueReviewFeedback(client,{checklist,revision,source,observedAt,group,enrichChecklist}) {
  const exists=(await client.query("SELECT to_regclass('adops_wa_feedback') AS table_name")).rows[0]?.table_name;
  if(!exists)return 0;
  await client.query('ALTER TABLE adops_wa_feedback DROP CONSTRAINT IF EXISTS adops_wa_feedback_phase_check');
  await client.query('ALTER TABLE adops_wa_feedback DROP CONSTRAINT IF EXISTS adops_wa_feedback_answer_event_key_key');
  const answers=(await client.query(`SELECT a.event_key,a.identity,a.status,a.received_at,a.revision,a.text_value,a.selected_options,v.checklist AS answered_checklist FROM adops_wa_answers a LEFT JOIN adops_monitor_checklist_versions v ON v.identity=a.identity AND v.revision=a.revision
    WHERE a.identity=$1 AND a.status='linked_for_review' AND a.received_at<$2::timestamptz
    AND EXISTS(SELECT 1 FROM adops_wa_feedback f WHERE f.answer_event_key=a.event_key AND f.phase='received')
    AND NOT EXISTS(SELECT 1 FROM adops_wa_answers newer WHERE newer.identity=a.identity AND newer.status='linked_for_review' AND newer.received_at>a.received_at)
    AND NOT EXISTS(SELECT 1 FROM adops_wa_feedback f WHERE f.answer_event_key=a.event_key AND f.phase='review' AND f.status IN ('pending','delivery_unknown','accepted','delivered','read'))
    ORDER BY a.received_at DESC LIMIT 1`,[checklist.identity,observedAt])).rows;
  // Replies about Drive material need a fresh Drive observation, not a sheet tick.
  if(source!=='drive'||!answers.length)return 0;
  const enriched=enrichChecklist?await enrichChecklist(checklist):checklist;
  let count=0;
  for(const answer of answers){const item=reviewFeedback({...answer,received_at:new Date(answer.received_at).toISOString()},enriched,revision,source,observedAt);if(!item)continue;
    const saved=await client.query(`INSERT INTO adops_wa_feedback(message_key,answer_event_key,identity,phase,request)
      VALUES($1,$2,$3,'review',$4) ON CONFLICT DO NOTHING`,[item.key,answer.event_key,answer.identity,JSON.stringify({number:group,text:item.text,linkPreview:false})]);count+=saved.rowCount;
  }
  return count;
}
