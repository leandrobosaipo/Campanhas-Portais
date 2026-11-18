import {
  evidenceReviewMessages as legacyMessages,
  reviewHash,
  reviewReportUrl,
} from "./evidence-review-messages.mjs";
import * as messageContext from "./whatsapp-message-context.mjs";
const portalLabel =
  messageContext.portalLabel ??
  ((value) => String(value ?? "portal não informado"));
const labels = {
  approved: "✅ print aprovado para esta posição/data",
  missing: "⚠️ print faltante",
  invalid: "⚠️ print reprovado; conferir auditoria",
  in_progress: "⏳ captura em andamento",
  unknown: "❔ auditoria indisponível; resultado não confirmado",
  not_due: "⏳ aguardando rotina das18h",
};
export function humanizedEvidenceSummary(review, counts) {
  const items = [
      ...new Map((review.items ?? []).map((i) => [i.insertionId, i])).values(),
    ],
    campaigns = new Set(
      items.filter((i) => i.campaignId != null).map((i) => i.campaignId),
    ),
    portals = new Map();
  for (const i of items) {
    const key = i.site || "Portal não informado";
    if (!portals.has(key)) portals.set(key, []);
    portals.get(key).push(i);
  }
  const blocks = [
    `📋 *ADOPS — ${review.final ? "fechamento" : "conferência"} de ${review.date.split("-").reverse().join("/")}*\n${campaigns.size} ${campaigns.size === 1 ? "campanha" : "campanhas"} · ${items.length} ${items.length === 1 ? "exibição prevista" : "exibições previstas"} · ${items.filter((i) => i.state === "approved").length} com print aprovado.`,
  ];
  for (const [site, rows] of [...portals].sort(([a], [b]) =>
    a.localeCompare(b, "pt-BR"),
  )) {
    const approved = rows.find((i) => i.state === "approved"),
      positionCounts = new Map();
    for (const row of rows)
      positionCounts.set(
        row.format || "Posição não informada",
        (positionCounts.get(row.format || "Posição não informada") ?? 0) + 1,
      );
    const portalName = rows[0].portalName || portalLabel(site),
      campaignCount = new Set(
        rows.map((i) => i.campaignId ?? `${i.campaignName}|${i.pi}`),
      ).size,
      approvedCount = rows.filter((i) => i.state === "approved").length;
    blocks.push(
      `*${portalName}${portalName !== site ? ` (${site})` : ""}* · ${campaignCount} ${campaignCount === 1 ? "campanha" : "campanhas"} · ${rows.length === 1 && approvedCount === 1 ? "1 exibição com print aprovado" : `${approvedCount} de ${rows.length} exibições com print aprovado`}\n${[...positionCounts].map(([name, n]) => `${name}: ${n}`).join(" • ")}${approved ? `\nReceber arquivo: print ${review.date} #${approved.insertionId}` : "\nSem arquivo aprovado identificado nesta revisão."}`,
    );
    const groups = new Map();
    for (const i of rows) {
      const key = i.campaignId ?? `${i.campaignName}|${i.pi}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (const rows of groups.values()) {
      const first = rows[0],
        lines = [],
        approvedRows = rows.filter((i) => i.state === "approved"),
        positionNames = [
          ...new Set(
            approvedRows.map((i) => i.format || "posição não informada"),
          ),
        ];
      if (approvedRows.length)
        lines.push(
          `${first.campaignName || "Campanha não informada"}${!first.pi ? " (PI não informada)" : ""} — ${positionNames.join(" e ")} ✓${approvedRows.some((i) => i.reconstructed) ? " (reconstrução histórica)" : ""}`,
        );
      for (const i of rows.filter((i) => i.state !== "approved")) {
        lines.push(
          `${i.campaignName || "Campanha não informada"} — ${i.format || "Posição não informada"}: ${labels[i.state] || "resultado não confirmado"}.`,
        );
        lines.push(
          `  Motivo: ${(i.reasons ?? []).join(" ") || "Motivo não disponível; equipe AdOps precisa conferir a fonte."}`,
        );
      }
      blocks.push(lines.join("\n"));
    }
  }
  const footer = `*Próximo passo*\n${items.some((i) => !["approved", "not_due"].includes(i.state)) ? "Equipe AdOps: conferir as posições pendentes e acompanhar o mesmo trabalho quando houver captura em andamento." : "Sem correção indicada nas posições aprovadas desta revisão."}\nA conferência cobre os anúncios selecionados para esta data, não toda a planilha. Os totais contam inserções distintas, inclusive campanhas na mesma posição. A aprovação vale para os prints desta data, não para toda a campanha ou publicação atual.${items.some((i) => i.reconstructed) ? " Reconstruções históricas não comprovam exibição original." : ""}\nSem print aprovado, o menu informa a falta; não substitui por prévia nem dispara captura.\nRelatório completo: ${reviewReportUrl(review.date)}`;
  const out = [];
  let size = footer.length + 2;
  for (const b of blocks) {
    if (size + b.length + 2 > 10500) {
      out.push(
        "Outras posições estão no relatório completo; o total acima inclui todos os registros consultados.",
      );
      break;
    }
    out.push(b);
    size += b.length + 2;
  }
  out.push(footer);
  return out.join("\n\n");
}
export function evidenceReviewMessages(review) {
  const pack = legacyMessages(review),
    messages = pack.messages.filter((m) => m.kind === "issue");
  // Stable decision identity excludes changing executor IDs/timestamps.
  for (const m of messages) {
    const item = review.items.find(
      (i) => m.identity === `evidence:${i.insertionId}:${review.date}`,
    );
    if (item) {
      m.revision = reviewHash([item.state, item.reasons]);
      m.key = reviewHash(["issue-v2", m.identity, m.revision, m.part]);
    }
  }
  if (review.final || review.manual) {
    const revision = reviewHash(
      review.items.map((i) => [
        i.insertionId,
        i.state,
        i.evidenceId,
        i.imageUrl,
        i.reasons,
      ]),
    );
    messages.push({
      key: reviewHash(["daily-v2", review.date, review.final, revision]),
      identity: `evidence-summary:${review.date}`,
      revision,
      part: "text",
      kind: "summary",
      text: humanizedEvidenceSummary(review, pack.counts),
    });
  }
  return { messages, counts: pack.counts };
}
