import { pool } from "@workspace/db";
import { auditedPrintSelection } from "./audited-print-delivery";
import { getAdRotateGroupId } from "./adrotate-sites";
import { visualPreviewSnapshot } from "./visual-previews";
import { previewHash } from "./visual-preview-policy.mjs";
import { ADOPS_GROUP } from "./whatsapp-checklist.mjs";

const portals = ["AFL", "OMT", "PERRENGUE", "ROO", "PNMT", "PPMT"];
const help = "Use status para ver as PIs avisadas recentemente, status AFL para filtrar o portal ou status PI 92005 AFL para consultar as posições.";
const localTime = (date: string | Date) => new Date(date).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
const day = (s: string) => s.split("-").reverse().join("/");
const normalize = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function recent(site?: string) {
  const rows = (await pool.query(
    `SELECT checklist->>'pi' pi, checklist->>'site' site, max(d.attempted_at) at
       FROM adops_wa_deliveries d JOIN adops_monitor_checklists c ON c.identity=d.identity
      WHERE checklist->>'pi' ~ '^[0-9]+$' AND d.group_jid=$1 AND d.part='text'
        AND ($2::text IS NULL OR checklist->>'site'=$2)
      GROUP BY 1,2 ORDER BY at DESC NULLS LAST LIMIT 8`, [ADOPS_GROUP, site ?? null])).rows;
  return ["*Status da PI · avisos recentes*", ...rows.map(r => `• ${localTime(r.at)} · ${r.site} · status PI ${r.pi} ${r.site}`),
    ...(!rows.length ? ["Nenhuma PI identificada nos avisos deste filtro."] : []), help].join("\n");
}

async function publication(row: any, today: string) {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 4011}/api/integrations/adrotate/insertions/${row.id}/relation`,
    { headers: { authorization: "Bearer " + process.env.OPS_API_TOKEN }, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) return false;
  const r = await response.json(), group = getAdRotateGroupId(row.site, row.normalized || row.format);
  if (!group || !row.media || !r.plannedSelf?.externalKey || r.insertionId !== row.id || r.rotation?.expectedMediaObserved !== true) return false;
  const matches = (r.exactLiveMatches ?? []).filter((ad: any) => ad.groupId === group && ad.mediaUrl === row.media);
  if (!matches.length) return false;
  const confirmed = new Set<number>((r.historicalAdminMatches ?? []).filter((a: any) => Number(a.groupId) === group &&
    a.adopsExternalKey === r.plannedSelf.externalKey && a.mediaUrl === row.media).map((a: any) => Number(a.adId)));
  const jobs = (await pool.query(`SELECT result_json::jsonb->'execution' AS result FROM ops_jobs
    WHERE kind='adrotate-publish' AND status='completed' AND payload_json::jsonb->>'mode'='apply'
      AND payload_json::jsonb->>'insertionId'=$1 ORDER BY updated_at DESC LIMIT 1`,[String(row.id)])).rows;
  const applied = jobs[0]?.result;
  if (applied?.expectedMedia?.mediaUrl === row.media && Number(applied.wpCliResult?.group_id) === group)
    confirmed.add(Number(applied.wpCliResult.ad_id));
  const captures = (await pool.query(`SELECT metadata->>'adClass' AS class FROM capture_proof_logs
     WHERE insertion_id=$1 AND target_date=$2 AND status='ok' AND metadata->>'captureClass' IN ('scheduled','live')
       AND metadata->>'insertionId'=$3 AND metadata->>'targetDate'=$4 AND metadata->>'matchedMediaUrl'=$5
       AND metadata->>'mediaUrl'=$5 AND metadata->'checklistValidation'->>'approved'='true'
       AND metadata->>'frameSelectionDowngraded' IS DISTINCT FROM 'true'`,[row.id,today,String(row.id),today,row.media])).rows;
  for(const c of captures) if(/^a-[1-9]\d*$/.test(c.class)) confirmed.add(Number(c.class.slice(2)));
  return new Set(matches.filter((a: any)=>confirmed.has(Number(a.adId))).map((a: any) => a.adId)).size === 1;
}

async function physicalSchedule(row: any) {
  if (row.status !== "agendado") return false;
  const receipts = (await pool.query(`SELECT p.snapshot_hash FROM adops_scheduled_preview_deliveries d
    JOIN adops_visual_previews p ON p.id=d.preview_id WHERE d.insertion_id=$1 AND d.status<>'cancelled'`, [row.id])).rows;
  return receipts.length > 0 && receipts.some(r => r.snapshot_hash === row.snapshotHash);
}

async function printStatus(row: any, date: string) {
  const selection = await auditedPrintSelection(`${date} #${row.id}`, date);
  if (!selection.print) return { line: `Print de ${day(date)}: aprovação da imagem ainda não comprovada. Envio: aguarda print aprovado.`,
    next: `Conferir auditoria de ${day(date)}. Consultar: menu 3 ${date} ${row.site}.` };
  const desc = selection.print;
  const deliveries = (await pool.query(`SELECT m.status ledger,d.status event_status,m.provider_id
    FROM adops_wa_menu_deliveries m LEFT JOIN adops_wa_deliveries d ON d.message_key=m.message_key
      AND d.group_jid=$2 AND d.provider_id=m.provider_id
    WHERE m.request->'_auditedPrint' @> $1::jsonb AND m.request->>'number'=$2 ORDER BY m.created_at DESC`,
    [JSON.stringify(desc), ADOPS_GROUP])).rows;
  const states = deliveries.map(r => r.provider_id ? r.event_status ?? r.ledger : r.ledger);
  const state = ["read", "delivered", "accepted", "delivery_unknown", "pending"].find(s => states.includes(s));
  const delivery = ({ read: "leitura registrada no grupo", delivered: "entrega confirmada no grupo", accepted: "aceito pelo provedor; confirmação de entrega pendente",
    delivery_unknown: "tentativa registrada; resultado incerto", pending: "envio na fila" } as Record<string,string>)[state ?? ""] ?? "sem envio registrado para estes bytes";
  return { line: `Print de ${day(date)}: aprovado · evidência #${desc.evidenceId}. Envio: ${delivery}.`,
    next: !state ? `Solicitar no grupo: menu 7 ${date} #${row.id}.` : ["pending","delivery_unknown","accepted"].includes(state) ? "Acompanhar o recibo da mesma mensagem." : "" };
}

async function insertionStatus(row: any, today: string) {
  const lines = [`*PI ${row.pi} · ${row.site} · ${row.name}*`, `${row.format} · ${day(row.start)} a ${day(row.end)} · cadastro #${row.id}.`];
  if (row.start > today) {
    let scheduled = false;
    if (row.status === "agendado") {
      try { row.snapshotHash = previewHash(await visualPreviewSnapshot(row.id, false)); scheduled = await physicalSchedule(row); } catch {}
    }
    lines.push(scheduled ? "Agendamento confirmado pelo recibo físico da posição." : "Agendamento físico pendente de confirmação.",
      `Exibição e print: conferir a partir de ${day(row.start)}. Envio do print: aguarda a primeira evidência aprovada.`,
      scheduled ? `Próximo passo: conferir o anúncio no portal em ${day(row.start)}.` : "Próximo passo: conferir materiais, autorização e recibo da agenda.");
    return lines.join("\n");
  }
  const ended = row.end < today;
  const observed = !ended && await publication(row,today).catch(() => false);
  lines.push(ended ? "Período encerrado." : observed ? "Publicação conferida agora no portal para este anúncio, mídia e grupo."
    : "Publicação no portal pendente de confirmação para este anúncio e grupo. Próximo passo: conferir a página e o AdRotate.");
  const proof = await printStatus(row, ended ? row.end : today).catch(() => ({line:"Auditoria ou registro de envio indisponível nesta consulta.",next:"Consultar novamente o relatório da posição."}));
  lines.push(proof.line); if (proof.next) lines.push("Próximo passo: " + proof.next);
  return lines.join("\n");
}

export async function piStatus(query: string, now = new Date()) {
  const tokens = query.toUpperCase().trim().split(/\s+/).filter(Boolean), pi=tokens.find(t=>/^\d{1,24}$/.test(t)), site=tokens.find(t=>portals.includes(t));
  if (tokens.length !== Number(Boolean(site)) + Number(Boolean(pi))) return help;
  if (!pi) return recent(site);
  const today=now.toLocaleDateString("sv-SE",{timeZone:"America/Cuiaba"});
  const checklists=(await pool.query(`SELECT checklist,updated_at FROM adops_monitor_checklists WHERE active AND checklist->>'pi'=$1
    AND ($2::text IS NULL OR checklist->>'site'=$2) ORDER BY identity`,[pi,site??null])).rows;
  const rows=(await pool.query(`SELECT i.id,c.pi_codigo pi,c.nome name,s.sigla site,i.local_formato format,i.local_formato_normalizado normalized,
    i.periodo_inicio::text start,i.periodo_fim::text end,i.status_normalizado status,i.media_url media
    FROM insertions i JOIN campaigns c ON c.id=i.campanha_id JOIN sites s ON s.id=i.site_id WHERE c.pi_codigo=$1
    AND ($2::text IS NULL OR s.sigla=$2) AND i.archived_at IS NULL AND i.superseded_by_insertion_id IS NULL
    AND COALESCE(i.status_normalizado,'') NOT IN ('cancelado','arquivado') ORDER BY s.sigla,c.id,i.id`,[pi,site??null])).rows;
  const blocks=[`*Status da PI ${pi}* · consulta de ${localTime(now)}`];
  for(const entry of checklists){
    const c=entry.checklist;
    const lacking=[...(c.missing??[]),...(c.conflicts??[])].map(v => typeof v === "string" ? ({missing_pi_pdf:"PDF da PI não localizado.", missing_media:"Mídia não localizada."} as Record<string,string>)[v] ?? v : "Conferir divergência entre as fontes.");
    if(lacking.length) blocks.push(`Checklist de ${localTime(entry.updated_at)} · ${c.site}: ${[...new Set(lacking)].join(" ")}${rows.some(r=>r.site===c.site)?" O cadastro já foi localizado. A equipe deve reconciliar o inventário da pasta com os documentos usados.":""}`);
    for(const p of c.positions?.length ? c.positions : [{name:"Posição ainda não identificada"}]){
      if(rows.some(r=>r.site===c.site && ((p.insertionIds??[]).includes(r.id) || ([r.format,r.normalized].some(f=>f&&normalize(f)===normalize(p.name)) && r.start===p.start && r.end===p.end)))) continue;
      const name=c.campaignName || (c.known??[]).find((v:string)=>v.startsWith("Campanha:"))?.replace(/^Campanha:\s*|\.$/g,"") || "Campanha sem nome confirmado";
      blocks.push(`*${name} · ${c.site} · ${p.name}*\nCadastro correspondente pendente. Agendamento, publicação, print e envio aguardam identificação da inserção.\nPróximo passo: ${lacking.length?"conferir as pendências do checklist e os documentos oficiais.":"conferir o cadastro autorizado desta posição e seu vínculo à PI."}`);
    }
  }
  if(!rows.length&&!checklists.length) return blocks.concat("Nenhum cadastro vigente na base ou checklist ativo corresponde à PI e ao portal informados. Confira o número e a planilha.").join("\n\n");
  blocks.push(...await Promise.all(rows.slice(0,12).map(r=>insertionStatus(r,today))));
  if(rows.length>12) blocks.push(`Exibidas 12 de ${rows.length} inserções. Filtre pelo portal ou consulte a planilha completa.`);
  return blocks.join("\n\n");
}
