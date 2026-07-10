import http from "node:http";

const PORT = Number.parseInt(process.env.PORT || "4022", 10);
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_DEFAULT_GROUP_ID = process.env.TELEGRAM_DEFAULT_GROUP_ID || "";

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function short(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function truncate(value, max = 180) {
  const text = short(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function piLabel(payload) {
  return short(payload.piCodigo, short(payload.name));
}

function flowLabel(payload) {
  return `Fluxo: ${piLabel(payload)}`;
}

function humanMissing(payload) {
  const missing = Array.isArray(payload.missing) ? payload.missing.filter(Boolean) : [];
  const invalid = Array.isArray(payload.invalidInsertions) ? payload.invalidInsertions : [];
  const reviewReasons = Array.isArray(payload.reviewReasons) ? payload.reviewReasons.filter(Boolean) : [];
  const dedupeConflicts = Array.isArray(payload.dedupe?.conflicts) ? payload.dedupe.conflicts.filter(Boolean) : [];
  const reasons = [];
  if (reviewReasons.includes("missing_pi_pdf")) reasons.push("PDF da PI");
  if (reviewReasons.includes("missing_media")) reasons.push("mídia");
  if (reviewReasons.includes("needs_media")) reasons.push("mídia pública");
  if (reviewReasons.includes("dedupe_conflict")) reasons.push("conflito de duplicidade");
  if (missing.includes("campanhaNome")) reasons.push("nome da campanha");
  if (missing.includes("competencia")) reasons.push("competência");
  if (missing.includes("clienteId")) reasons.push("cliente");
  if (missing.includes("agenciaId")) reasons.push("agência");
  if (missing.includes("insertions")) reasons.push("inserção");
  if (missing.includes("piCodigo")) reasons.push("número da PI");
  if (invalid.length) reasons.push("dados da inserção");
  if (dedupeConflicts.length) reasons.push(truncate(dedupeConflicts.join(" | "), 160));
  return reasons.length ? reasons.join(", ") : null;
}

function evidenceReason(payload) {
  const results = Array.isArray(payload.evidenceCoverage?.results) ? payload.evidenceCoverage.results : [];
  if (results.some((item) => item?.status === "needs_media")) return "mídia pública ainda não vinculada";
  if (results.some((item) => item?.status && item.status !== "audited")) return "evidência ainda pendente";
  return null;
}

function appliedSummary(payload) {
  const applied = payload.applied || {};
  const created = Array.isArray(applied.createdInsertions) ? applied.createdInsertions.length : 0;
  const skipped = Array.isArray(applied.skippedInsertions) ? applied.skippedInsertions.length : 0;
  if (created > 0) return `${created} inserção(ões) criada(s)`;
  if (skipped > 0) return `${skipped} inserção(ões) já existiam`;
  if (applied.campaignId) return "campanha conferida";
  return null;
}

function buildCompactMessage({ icon, title, payload, lines = [], action = null }) {
  const link = short(payload.webViewLink);
  return [
    `${icon} ${title}`,
    flowLabel(payload),
    `Pasta: ${truncate(payload.name, 90)}`,
    ...lines.filter(Boolean),
    action ? `Próxima ação: ${action}` : null,
    link !== "-" ? `Drive: ${link}` : null,
  ].filter(Boolean).join("\n");
}

function buildDrivePiMessage(payload) {
  const status = short(payload.status);
  const name = short(payload.name);
  const piCodigo = short(payload.piCodigo);
  const packageClass = short(payload.packageClass);
  const missing = Array.isArray(payload.missing) && payload.missing.length
    ? payload.missing.join(", ")
    : "-";
  const link = short(payload.webViewLink);

  if (status === "intake_locked") {
    return buildCompactMessage({
      icon: "🟡",
      title: "AdOps iniciou uma nova PI",
      payload,
      lines: [
        "Status: processamento automático em andamento",
        "Evite cadastro manual para não duplicar.",
      ],
      action: "aguardar a próxima mensagem",
    });
  }

  if (status === "failed") {
    return buildCompactMessage({
      icon: "❌",
      title: "AdOps travou nesta PI",
      payload,
      lines: [`Erro: ${truncate(payload.error, 220)}`],
      action: "abrir revisão técnica antes de cadastrar manualmente",
    });
  }

  const stageMessages = {
    packaging: {
      icon: "📦",
      title: "AdOps conferiu a pasta",
      lines: [
        packageClass === "pi_and_media_present" ? "Encontrou PI e mídia." : `Pacote: ${packageClass}`,
        missing !== "-" ? `Falta: ${missing}` : null,
      ],
      action: packageClass === "pi_and_media_present" ? "IA vai ler a PI" : "completar a pasta",
    },
    agent_analysis: {
      icon: "🤖",
      title: "IA está lendo a PI",
      lines: ["Status: extraindo cliente, agência, portal, formato e período"],
      action: "aguardar validação",
    },
    agent_analysis_done: {
      icon: "🤖",
      title: "IA terminou a leitura",
      lines: [
        piCodigo !== "-" ? `PI identificada: ${piCodigo}` : null,
        payload.campaignName ? `Campanha: ${truncate(payload.campaignName, 120)}` : null,
      ],
      action: "AdOps vai validar antes de cadastrar",
    },
    validated: {
      icon: "✅",
      title: "PI validada para cadastro",
      lines: [piCodigo !== "-" ? `PI: ${piCodigo}` : null],
      action: "cadastro automático vai continuar",
    },
    applying: {
      icon: "🧾",
      title: "AdOps está cadastrando",
      lines: [payload.campaignName ? `Campanha: ${truncate(payload.campaignName, 120)}` : null],
      action: "aguardar confirmação",
    },
    applied_records: {
      icon: "✅",
      title: "Cadastro conferido",
      lines: [appliedSummary(payload)],
      action: "AdOps vai checar evidência e sincronização",
    },
    evidence_checked: {
      icon: evidenceReason(payload) ? "🟠" : "🖼️",
      title: evidenceReason(payload) ? "Evidência ainda pendente" : "Evidência conferida",
      lines: [evidenceReason(payload) ? `Motivo: ${evidenceReason(payload)}` : "Print/auditoria conferidos."],
      action: evidenceReason(payload) ? "vincular mídia pública" : "aguardar sync final",
    },
    syncing: {
      icon: "🔄",
      title: "AdOps está sincronizando",
      lines: ["Status: atualizando planilha e conferências finais"],
      action: "aguardar fechamento",
    },
    synced: {
      icon: "✅",
      title: "Sincronização concluída",
      lines: ["Planilha sincronizada."],
      action: "aguardar status final",
    },
    reconcile_failed: {
      icon: "⚠️",
      title: "Cadastro preservado, conferência AdRotate pendente",
      lines: [`Motivo: ${truncate(payload.error, 180)}`],
      action: "corrigir acesso AdRotate/SSH depois; não recadastrar",
    },
  };

  if (stageMessages[status]) {
    const stage = stageMessages[status];
    return buildCompactMessage({
      icon: stage.icon,
      title: stage.title,
      payload,
      lines: stage.lines,
      action: stage.action,
    });
  }

  if (status === "needs_review") {
    const reason = evidenceReason(payload) || humanMissing(payload) || "revisão operacional necessária";
    return buildCompactMessage({
      icon: "📝",
      title: "PI precisa de revisão",
      payload,
      lines: [
        piCodigo !== "-" ? `PI: ${piCodigo}` : null,
        `Motivo: ${reason}`,
        appliedSummary(payload) ? `Cadastro: ${appliedSummary(payload)}` : null,
      ],
      action: evidenceReason(payload) ? "vincular mídia pública e gerar evidência" : "corrigir os dados faltantes",
    });
  }

  if (status === "applied") {
    return buildCompactMessage({
      icon: "✅",
      title: "PI finalizada",
      payload,
      lines: [
        piCodigo !== "-" ? `PI: ${piCodigo}` : null,
        appliedSummary(payload) ? `Cadastro: ${appliedSummary(payload)}` : null,
      ],
      action: "nenhuma ação manual agora",
    });
  }

  return [
    "ℹ️ AdOps atualizou uma PI",
    "",
    `Pasta: ${name}`,
    `Status: ${status}`,
    `PI: ${piCodigo}`,
    link !== "-" ? `Drive: ${link}` : null,
  ].filter(Boolean).join("\n");
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_DEFAULT_GROUP_ID) {
    return { skipped: "telegram_env_missing" };
  }
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_DEFAULT_GROUP_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `telegram_http_${response.status}`);
  }
  return { ok: true, messageId: payload?.result?.message_id || null };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return json(res, 200, { ok: true, service: "adops-telegram-adapter" });
    }

    if (req.method !== "POST" || req.url !== "/ops/drive-pi-event") {
      return json(res, 404, { ok: false, error: "not_found" });
    }

    if (!OPS_API_TOKEN || bearerToken(req) !== OPS_API_TOKEN) {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }

    const payload = await readBody(req);
    const message = buildDrivePiMessage(payload);
    const telegram = await sendTelegram(message);
    return json(res, 200, { ok: true, telegram });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: "telegram_adapter_error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[adops-telegram-adapter] listening on ${PORT}`);
});
