import { createHash } from "node:crypto";
import * as messageContext from "./whatsapp-message-context.mjs";
const portalLabel=messageContext.portalLabel??(value=>String(value??'portal não informado'));
export const MENU_ID = "adops-menu:v1";
export const MENU_CHOICES = [
  "1 Planilha e publicação",
  "2 Pendências",
  "3 Evidências do dia",
  "4 Nova campanha",
  "5 Corrigir cadastro",
  "6 Ajuda e outros",
  "7 Receber print auditado",
  "8 Status da PI",
];
export const menuHash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function menuDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const n = new Date(value + "T12:00:00Z");
  return Number.isFinite(n.valueOf()) && n.toISOString().slice(0, 10) === value;
}
const issueText = (x) =>
  ({
    missing_pi_pdf: "PDF da PI não localizado.",
    media_mismatch: "Mídia não coincide com o cadastro.",
    missing_media: "Material da campanha não localizado.",
    pi_mismatch: "Número da PI diverge entre as fontes.",
    ambiguous_insertion: "Mais de um cadastro corresponde à posição.",
  })[typeof x === "string" ? x : x?.code] ??
  (typeof x === "string" && !/^[a-z]+(?:_[a-z]+)+$/.test(x)
    ? x
    : "Há divergência entre as fontes; conferir os dados antes de qualquer alteração.");
const snapshotReason = (value) =>
  typeof value === "string" && !/^[a-z]+(?:_[a-z]+)+$/.test(value)
    ? value
    : "Motivo detalhado não disponível nesta conferência.";
const shortDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
    ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
    : "data não informada";
const dateTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? date.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })
    : "horário não informado";
};
const boundedText = (lines) => {
  const out = [];
  let size = 0;
  for (const line of lines) {
    const extra = String(line).length + (out.length ? 1 : 0);
    if (size + extra > 11000) {
      out.push("Conteúdo adicional no relatório vinculado.");
      break;
    }
    out.push(String(line));
    size += extra;
  }
  return out.join("\n");
};
const nextStepText = (value) =>
  typeof value === "string" &&
  !/^[a-zA-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/.test(value.trim())
    ? value
    : "A equipe AdOps precisa conferir a próxima etapa.";
export function menuRegistrationLabel(i, today) {
  return i.scheduleConfirmed === true && i.status === "agendado"
    ? "agendada com recibo físico conferido"
    : i.start > today
      ? "início previsto; agendamento físico não confirmado nesta consulta"
      : i.status === "agendado"
        ? "cadastro marcado para agendamento; recibo físico não confirmado nesta consulta"
        : (i.status ?? "status não informado");
}
export function menuCommand(answer, { group, senderAliases = [] } = {}) {
  if (
    answer.group_jid !== group ||
    !answer.participant ||
    senderAliases.includes(answer.participant)
  )
    return null;
  const linked = String(answer.identity ?? "").startsWith(MENU_ID + ":");
  if (answer.kind === "poll") {
    if (
      !linked ||
      !Array.isArray(answer.selected_options) ||
      answer.selected_options.length !== 1
    )
      return null;
    const n = MENU_CHOICES.indexOf(answer.selected_options[0]);
    return n < 0 ? null : { choice: n + 1, query: "" };
  }
  if (answer.kind !== "text") return null;
  const text = String(answer.text_value ?? "").trim();
  if (/^(menu|ajuda)$/i.test(text)) return { choice: 0, query: "" };
  const status = text.match(/^status(?:\s+(?:da\s+)?pi\b)?(?:\s+(.{1,90}))?$/i);
  if (status && (!status[1] || /^(?:\d+|AFL|OMT|PERRENGUE|ROO|PNMT|PPMT)(?:\s+(?:\d+|AFL|OMT|PERRENGUE|ROO|PNMT|PPMT))?$/i.test(status[1].trim())))
    return { choice: 8, query: (status[1] ?? "").trim() };
  const print = text.match(/^(?:print|ver print)(?:\s+(.{1,160}))?$/i);
  if (print) return { choice: 7, query: (print[1] ?? "").trim() };
  const match = text.match(/^(?:menu\s+([1-8])|([1-8]))(?:\s+(.{1,160}))?$/i);
  if (!match || (match[2] && !linked)) return null;
  return {
    choice: Number(match[1] || match[2]),
    query: (match[3] ?? "").trim(),
  };
}
export function menuText(command, rows, now) {
  const footer =
    "Consulta/prévia apenas. Nenhum cadastro, captura ou publicação foi executado.";
  if (!command.choice || command.choice === 6)
    return [
      "*ADOPS — menu*",
      "",
      "*Consultar*",
      ...MENU_CHOICES.slice(0, 3),
      MENU_CHOICES[6],
      MENU_CHOICES[7],
      "",
      "*Preparar um pedido para revisão*",
      ...MENU_CHOICES.slice(3, 5),
      "",
      "*Ajuda*",
      MENU_CHOICES[5],
      "",
      "*Como usar*",
      "Responda à enquete ou escreva menu 1 a menu 8. Exemplo: menu 2 92597.",
      "Andamento por posição: status PI 92005 AFL. Digite status para ver as PIs avisadas recentemente.",
      "Consultar auditoria: menu 3 AAAA-MM-DD portal.",
      "Receber arquivo real: print 2026-11-09 PERRENGUE HOME 1, ou menu 7 2026-11-09 #3122.",
      "Atalho equivalente: ver print AFL HOME 1 (assume hoje em Cuiabá).",
      "Portal sem posição lista opções; se houver mais de uma campanha na posição, escolha #ID. Arquivo só segue com auditoria aprovada; sem prévia substituta ou nova captura.",
      "",
      footer,
    ].join("\n");
  if (command.choice === 4 || command.choice === 5) {
    const lines = [
      command.choice === 4
        ? "*Nova campanha — dados para revisão*"
        : "*Correção de cadastro — dados para revisão*",
      "",
      "Envie em linhas separadas:",
      "1. Campanha e número da PI (ou diga “sem PI”).",
      "2. Portal e posição/formato.",
      "3. Data inicial e final do período.",
      "4. Link da pasta com a PI e as mídias.",
      "5. Destino do anúncio.",
    ];
    if (command.choice === 5)
      lines.push("6. ID do cadastro e campo que precisa de correção.");
    lines.push(
      "",
      "*Quem age:* você envia as informações; a equipe AdOps confere e retorna com uma prévia.",
      "*Limite deste menu:* a resposta não salva solicitação, não altera cadastro e não publica. Nenhuma ação operacional foi executada.",
      footer,
    );
    return lines.join("\n");
  }
  const needle = command.query.toLocaleLowerCase("pt-BR");
  const selected = rows.filter(
    (r) =>
      !needle ||
      JSON.stringify([
        r.identity,
        r.checklist?.site,
        r.checklist?.siteSigla,
        r.checklist?.campaignName,
        r.checklist?.pi,
        r.checklist?.known,
        r.checklist?.positions,
      ])
        .toLocaleLowerCase("pt-BR")
        .includes(needle),
  );
  const workbook =
    "https://docs.google.com/spreadsheets/d/1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu/edit";
  const lines = [
    `*ADOPS — ${MENU_CHOICES[command.choice - 1].slice(2)}*`,
    `Consulta feita em ${dateTime(now)} (Cuiabá). Os registros abaixo vêm da última conferência salva; não são ao vivo nem confirmam publicação.`,
  ];
  if (command.choice === 1)
    lines.push("Planilha (inclui campanhas ainda não publicadas): " + workbook);
  for (const r of selected.slice(0, 5)) {
    const c = r.checklist ?? {},
      name =
        c.campaignName ??
        c.campaign ??
        (c.known ?? [])
          .find((x) => x.startsWith("Campanha: "))
          ?.replace(/^Campanha: /, "")
          .replace(/\.$/, "") ??
        "campanha não informada";
    const ids = [
      ...new Set((c.positions ?? []).flatMap((p) => p.insertionIds ?? [])),
    ];
    const portal = portalLabel(c.site ?? c.siteSigla);
    const period = (c.positions ?? [])
      .map((p) => `${p.name}: ${shortDate(p.start)} a ${shortDate(p.end)}`)
      .join("; ");
    lines.push(
      `• *${name}* · ${portal}${ids.length ? " · inserção " + ids.map((id) => "#" + id).join(", ") : ""}`,
    );
    if (period) lines.push("  Período: " + period + ".");
    if (c.piWaived) lines.push("  PI: sem PI — confirmado.");
    else if (c.pi) lines.push(`  PI: ${c.pi}.`);
    if (command.choice === 2) {
      const labels = {
        awaiting_data: "aguardando dados",
        preview_requested: "prévia solicitada",
        awaiting_preview_or_confirmation: "aguardando prévia ou confirmação",
        period_ended: "período encerrado",
        confirmed: "confirmação registrada",
        claimed: "confirmação reservada; aguardando despacho",
        queued: "aguardando executor",
        executing: "em execução",
        blocked: "bloqueado antes da execução",
        error: "erro técnico; trabalho preservado",
        needs_operational_review:
          "revisão necessária; publicação não confirmada",
        completed_needs_diagnostic:
          "execução sem comprovante de cadastro; requer diagnóstico",
        verified: "publicação conferida no portal",
        verified_with_execution_warning:
          "publicação conferida; falha do trabalho preservada",
        completed_needs_public_readback:
          "execução concluída; falta conferência pública final",
      };
      lines.push(
        "  *Situação:* " +
          (labels[r.progress?.phase] ??
            "conferência salva; resultado atual não confirmado") +
          ".",
      );
      if (r.progress?.nextStep)
        lines.push("  *Próximo:* " + nextStepText(r.progress.nextStep));
      if (r.progress?.materialChangedSinceAnswer)
        lines.push(
          "  *Falta:* dados comerciais mudaram desde a resposta; a equipe precisa conferir novamente.",
        );
    }
    if (command.choice === 2 && r.progress?.phase !== "period_ended")
      lines.push(
        ...[...(c.missing ?? []), ...(c.conflicts ?? [])].map(
          (x) => "  " + issueText(x),
        ),
      );
    if (
      command.choice === 2 &&
      r.progress?.phase !== "period_ended" &&
      !c.missing?.length &&
      !c.conflicts?.length
    )
      lines.push(
        "  Sem falta/conflito na conferência salva; não comprova publicação.",
      );
    if (command.choice === 1) {
      for (const p of c.positions ?? []) {
        const regs = (r.registrations ?? []).filter((i) =>
          (p.insertionIds ?? []).includes(i.id),
        );
        if (!regs.length)
          lines.push(
            `  *Falta:* cadastro correspondente não localizado para ${p.name}, ${shortDate(p.start)} a ${shortDate(p.end)}; publicação não confirmada.`,
          );
        for (const i of regs)
          lines.push(
            `  #${i.id} · ${shortDate(i.start)} a ${shortDate(i.end)}: ${menuRegistrationLabel(i, new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" }))}; marcação de publicação no AdOps ${i.published ? "sim" : "não"}. *Exibição no portal:* não verificada nesta consulta.`,
          );
      }
    }
    if (command.choice === 3)
      lines.push(
        "  *Próximo:* confira os dias e a auditoria no relatório. Cadastro e conferência salva não comprovam exibição no portal.",
      );
    if (command.choice === 1 || command.choice === 3 || command.choice === 2) {
      const url = new URL(
        "https://sites.codigo5.com.br/reports/adops-evidencias/",
      );
      url.searchParams.set("mes", now.slice(0, 7));
      url.searchParams.set("q", String(name));
      const rawPortal = String(c.site ?? c.siteSigla ?? "").trim(),
        portal = portalLabel(rawPortal);
      if (
        (rawPortal && portal !== rawPortal) ||
        (rawPortal &&
          ["PERRENGUE", "OMT", "AFL", "PNMT", "PPMT", "ROO"].includes(portal))
      )
        url.searchParams.set("portal", portal);
      lines.push("  Relatório: " + url.href);
    }
    if (r.updated_at)
      lines.push(
        "  Conferência salva: " + dateTime(r.updated_at) + " (Cuiabá).",
      );
  }
  if (!selected.length)
    lines.push(
      "Nenhum checklist atual corresponde ao filtro. Consulte a planilha; ausência aqui não comprova ausência de cadastro.",
    );
  if (selected.length > 5)
    lines.push(
      `Mostrando 5 de ${selected.length}. Use menu ${command.choice} campanha ou portal para filtrar.`,
    );
  lines.push("Digite menu para ver as opções.", footer);
  return boundedText(lines);
}
export function menuEvidenceText(command, snapshot, now) {
  const date =
      command.query.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? now.slice(0, 10),
    needle = command.query.replace(date, "").trim().toLocaleLowerCase("pt-BR");
  if (!menuDate(date))
    return "Data inválida. Use menu 3 YYYY-MM-DD, por exemplo menu 3 2026-10-22 AFL. Nenhuma captura foi solicitada.";
  const displayDate = shortDate(date),
    lines = [`*ADOPS — evidências de ${displayDate}*`];
  const current = new Date(now),
    today = current.toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" }),
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Cuiaba",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(current),
    );
  if (date === today && hour < 18)
    lines.push(
      "A rotina oficial de hoje começa às 18h de Cuiabá. Ausência de prova antes desse horário não indica atraso.",
    );
  if (!snapshot) {
    lines.push(
      "Não há revisão salva para esta data. Isso não comprova ausência de prints; confira os dias no relatório.",
    );
  } else {
    lines.push(
      "Fonte: revisão de auditoria salva em " +
        dateTime(snapshot.created_at) +
        " (Cuiabá). Não é ao vivo e não confirma a publicação atual.",
    );
    const items = (snapshot.payload?.items ?? []).filter(
      (i) =>
        !needle ||
        JSON.stringify([i.site, i.campaignName, i.pi, i.insertionId])
          .toLocaleLowerCase("pt-BR")
          .includes(needle),
    );
    const labels = {
      approved: "aprovada na revisão salva",
      missing: "faltante na revisão salva",
      invalid: "requer revisão",
      in_progress: "trabalho em andamento",
      unknown: "sem confirmação",
      not_due: "aguardando rotina oficial",
    };
    for (const i of items.slice(0, 5)) {
      lines.push(
        `• *${i.campaignName}* · ${portalLabel(i.site)} · PI ${i.pi ?? "não informada"} · inserção #${i.insertionId} · ${displayDate}: ${labels[i.state] ?? "estado não confirmado"}${i.reconstructed ? " (reconstrução histórica)" : ""}.`,
      );
      for (const reason of (i.reasons ?? []).slice(0, 4))
        lines.push("  *Motivo:* " + snapshotReason(reason));
      if (i.reportUrl) lines.push("Relatório: " + i.reportUrl);
      if (i.state === "in_progress")
        lines.push(
          "  *Próximo responsável:* equipe AdOps acompanha o mesmo trabalho, sem reenviar.",
        );
      else if (["missing", "invalid", "unknown"].includes(i.state))
        lines.push(
          "  *Falta/impacto:* esta revisão não confirmou uma evidência aprovada. *Próximo responsável:* equipe AdOps confere o relatório e o diagnóstico antes de pedir outra captura.",
        );
    }
    if (!items.length)
      lines.push("Nenhum item corresponde ao filtro na revisão salva.");
    if (items.length > 5)
      lines.push(
        "Mostrando 5 itens; use menu 3 " + date + " portal ou campanha.",
      );
  }
  const url = new URL("https://sites.codigo5.com.br/reports/adops-evidencias/");
  url.searchParams.set("mes", date.slice(0, 7));
  url.searchParams.set("from", date);
  url.searchParams.set("to", date);
  lines.push(
    "Relatório: " + url.href,
    "Nenhuma nova captura, publicação ou alteração foi solicitada.",
  );
  return boundedText(lines);
}
