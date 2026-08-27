type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
type ServiceBindingFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_BASE_URL?: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_ID: string;
  TELEGRAM_DEFAULT_GROUP_ID: string;
  TELEGRAM_MINI_APP_URL?: string;
  ADOPS_PUBLIC_API_BASE_URL: string;
  ADOPS_PUBLIC_API_SERVICE?: ServiceBindingFetcher;
  ADOPS_EXPORT_BASE_URL?: string;
  OPS_API_TOKEN?: string;
  TELEGRAM_NOTIFICATIONS_ENABLED?: string;
  TELEGRAM_TIMEZONE?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string; type: string; title?: string };
  from?: { id: number | string; first_name?: string; username?: string };
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: { id: number | string; first_name?: string; username?: string };
  data?: string;
  message?: TelegramMessage;
};

type Insertion = {
  id: number;
  campanhaId: number | null;
  campanhaName: string | null;
  clienteNome: string | null;
  agenciaNome: string | null;
  piCodigo: string | null;
  siteSigla: string | null;
  siteNome: string | null;
  localFormato: string | null;
  localFormatoNormalizado: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  statusNormalizado: string;
  bannerPublicadoNoSite: boolean;
  printGerado: boolean;
  processoEnviadoAgencia: boolean;
  docsEnviados: boolean;
  dataEnvioAgencia: string | null;
  competencia: string | null;
  mediaUrl: string | null;
  observacoes: string | null;
  siteLogoUrl?: string | null;
  auditSummary?: {
    totalEvidenceDates: number;
    auditedCount: number;
    invalidAuditCount: number;
    invalidUrlCount: number;
    failedCount: number;
    missingCount: number;
  };
};

type PiSiteExport = {
  piCodigo: string;
  siteSigla: string;
  competencia: string | null;
  totalInsertions: number;
  insertionIds: number[];
  label: string;
  downloadUrl: string | null;
  exportableInsertionIds?: number[];
  skippedInsertions?: Array<{
    insertionId: number;
    reason: string;
  }>;
  campaignName?: string | null;
};

type PiSiteExportJob = {
  id: string;
  status: string;
  stage: string | null;
  piCodigo: string | null;
  siteSigla: string | null;
  insertionIds: number[];
  invalidatedEvidenceIds: number[];
  regeneratedDates: Array<{ insertionId?: number; date?: string } | string>;
  analyticsPiStatus: unknown;
  analyticsFullMonthStatus: unknown;
  downloadUrl: string | null;
  error: string | null;
};

type AnalyticsRequirements = {
  requiresAnalytics: boolean;
  analyticsSource: string | null;
};

type AnalyticsReport = {
  id: string;
  status: string;
  periodMode: string;
  periodStart: string;
  periodEnd: string;
  downloadUrl: string | null;
  fileName: string | null;
};

type OperationalDocuments = {
  documents: Array<{
    kind: string;
    title: string;
    downloadDocxUrl: string;
    downloadPdfUrl: string;
  }>;
};

type CaptureAuditSummary = {
  date: string;
  totalEligible: number;
  ok: number;
  missing: number;
  invalid: number;
  items: Array<{
    insertionId: number;
    campaignName: string | null;
    siteSigla: string | null;
    status: string;
  }>;
};

type CaptureStatus = {
  insertionId: number;
  date: string;
  status: string;
  arquivoUrl: string | null;
  audit?: {
    ok?: boolean;
    visualAudit?: {
      viewportImagesTotal?: number;
      viewportImagesLoaded?: number;
      slotImagesTotal?: number;
      slotImagesLoaded?: number;
      viewportBackgroundsTotal?: number;
      viewportBackgroundsLoaded?: number;
      viewportVideosTotal?: number;
      viewportVideosLoaded?: number;
    };
    issues?: Array<{ code?: string; label?: string; detail?: string }>;
  } | null;
};

type OpsJobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed";

type OpsJob = {
  id: string;
  kind: string;
  status: OpsJobStatus;
  payload?: Record<string, unknown> | null;
  error?: string | null;
  requestedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type DailyPrintJobState = {
  date: string;
  job: OpsJob | null;
  status: OpsJobStatus | "not_found";
  error: string | null;
};

type ParsedTelegramInput = {
  command: string;
  args: string[];
  raw: string;
};

const DAILY_PRINT_SOURCE = "cloudflare-cron-daily-print";

const json = (data: Json, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });

function ok(message: string, extra: Record<string, unknown> = {}) {
  return json({ ok: true, message, ...extra });
}

function badRequest(message: string) {
  return json({ ok: false, error: "bad_request", details: message }, { status: 400 });
}

function unauthorized(message: string) {
  return json({ ok: false, error: "unauthorized", details: message }, { status: 401 });
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePiDigits(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || null;
}

function normalizeInsertionId(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^#(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeBotUsername(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function currentDateInTimezone(timeZone = "America/Cuiaba") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentCompetencia(timeZone = "America/Cuiaba") {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    month: "long",
    year: "numeric",
  }).formatToParts(new Date());
  const month = normalizeText(parts.find((p) => p.type === "month")?.value ?? "").toUpperCase();
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const monthMap: Record<string, string> = {
    JANEIRO: "JANEIRO",
    FEVEREIRO: "FEVEREIRO",
    MARCO: "MARÇO",
    ABRIL: "ABRIL",
    MAIO: "MAIO",
    JUNHO: "JUNHO",
    JULHO: "JULHO",
    AGOSTO: "AGOSTO",
    SETEMBRO: "SETEMBRO",
    OUTUBRO: "OUTUBRO",
    NOVEMBRO: "NOVEMBRO",
    DEZEMBRO: "DEZEMBRO",
  };
  return `${monthMap[month] ?? month}/${year}`;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDaysInclusive(start: string | null | undefined, end: string | null | undefined) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) return null;
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

function diffDaysFromStart(start: string | null | undefined, target: string | null | undefined) {
  const startDate = parseDateOnly(start);
  const targetDate = parseDateOnly(target);
  if (!startDate || !targetDate) return null;
  const diffMs = targetDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

function buildPrintProgress(item: Insertion, targetDate: string) {
  const total = diffDaysInclusive(item.periodoInicio, item.periodoFim);
  const current = diffDaysFromStart(item.periodoInicio, targetDate);
  if (!total || !current || current < 1) return null;
  return `${Math.min(current, total)}/${total}`;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

async function telegramApi(env: Env, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram API ${method} falhou: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function sendMessage(env: Env, chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return telegramApi(env, "sendMessage", { chat_id: chatId, text, ...extra });
}

async function sendPhoto(env: Env, chatId: string | number, photo: string, caption?: string, extra: Record<string, unknown> = {}) {
  return telegramApi(env, "sendPhoto", { chat_id: chatId, photo, caption, ...extra });
}

async function answerCallback(env: Env, callbackQueryId: string, text?: string) {
  try {
    return await telegramApi(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text: text ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("query is too old") || message.includes("query ID is invalid")) {
      return null;
    }
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function adopsFetch(env: Env, path: string, init: RequestInit = {}, protectedRoute = false) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  if (protectedRoute) {
    if (!env.OPS_API_TOKEN?.trim()) throw new Error("OPS_API_TOKEN ausente no worker do Telegram.");
    headers.set("authorization", `Bearer ${env.OPS_API_TOKEN.trim()}`);
  }
  const targetUrl = env.ADOPS_PUBLIC_API_SERVICE
    ? `https://adops-api-public.internal${path}`
    : `${env.ADOPS_PUBLIC_API_BASE_URL.replace(/\/$/, "")}${path}`;
  const response = env.ADOPS_PUBLIC_API_SERVICE
    ? await env.ADOPS_PUBLIC_API_SERVICE.fetch(targetUrl, { ...init, headers })
    : await fetch(targetUrl, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AdOps API ${path} falhou: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchDailyPrintJobState(env: Env, date: string): Promise<DailyPrintJobState> {
  const response = await adopsFetch(env, "/api/ops/jobs?kind=print-batch&limit=50", {}, true) as { items?: OpsJob[] };
  const job = (response.items ?? []).find((item) => {
    const payload = item.payload ?? {};
    return payload.source === DAILY_PRINT_SOURCE && payload.date === date;
  }) ?? null;

  if (!job) {
    return { date, job: null, status: "not_found", error: null };
  }

  return {
    date,
    job,
    status: job.status,
    error: typeof job.error === "string" && job.error.trim() ? job.error.trim() : null,
  };
}

function shortJobId(job: OpsJob | null) {
  return job?.id ? job.id.slice(0, 8) : "—";
}

function formatDailyPrintJobState(state?: DailyPrintJobState | null) {
  if (!state) return "Job diário: não consultado.";
  if (state.status === "not_found") return `Job diário: não encontrado para ${state.date}.`;
  if (state.status === "completed") return `Job diário: concluído (#${shortJobId(state.job)}).`;
  if (state.status === "failed") return `Job diário: FALHOU (#${shortJobId(state.job)}).`;
  return `Job diário: prints ainda em andamento (#${shortJobId(state.job)}, ${state.status}).`;
}

async function fetchAllInsertions(env: Env, competencia?: string | null): Promise<Insertion[]> {
  const qs = competencia ? `?competencia=${encodeURIComponent(competencia)}` : "";
  return (await adopsFetch(env, `/api/insertions${qs}`)) as Insertion[];
}

function siteAliasToSigla(value: string | null | undefined): string | null {
  const key = normalizeText(value);
  if (!key) return null;
  const aliases: Record<string, string> = {
    afl: "AFL",
    afolha: "AFL",
    afolhalivre: "AFL",
    folha: "AFL",
    omt: "OMT",
    omatogrossense: "OMT",
    matogrosso: "OMT",
    perrengue: "PERRENGUE",
    perr: "PERRENGUE",
    pnmt: "PNMT",
    norte: "PNMT",
    nortemt: "PNMT",
    portalnorte: "PNMT",
    ppmt: "PPMT",
    pmt: "PPMT",
    pantanal: "PPMT",
    pantanalmt: "PPMT",
    portalpantanal: "PPMT",
    roo: "ROO",
    roonoticias: "ROO",
    rondonopolis: "ROO",
  };
  return aliases[key] ?? null;
}

function competenciaTokenToLabel(value: string | null | undefined): string | null {
  const key = normalizeText(value).replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  const monthPatterns: Array<[RegExp, string]> = [
    [/^(jan|janeiro)(\d{2}|\d{4})$/, "JANEIRO"],
    [/^(fev|fevereiro)(\d{2}|\d{4})$/, "FEVEREIRO"],
    [/^(mar|marco)(\d{2}|\d{4})$/, "MARÇO"],
    [/^(abr|abril)(\d{2}|\d{4})$/, "ABRIL"],
    [/^(mai|maio)(\d{2}|\d{4})$/, "MAIO"],
    [/^(jun|junho)(\d{2}|\d{4})$/, "JUNHO"],
    [/^(jul|julho)(\d{2}|\d{4})$/, "JULHO"],
    [/^(ago|agosto)(\d{2}|\d{4})$/, "AGOSTO"],
    [/^(set|setembro)(\d{2}|\d{4})$/, "SETEMBRO"],
    [/^(out|outubro)(\d{2}|\d{4})$/, "OUTUBRO"],
    [/^(nov|novembro)(\d{2}|\d{4})$/, "NOVEMBRO"],
    [/^(dez|dezembro)(\d{2}|\d{4})$/, "DEZEMBRO"],
    [/^(0?1)(\d{2}|\d{4})$/, "JANEIRO"],
    [/^(0?2)(\d{2}|\d{4})$/, "FEVEREIRO"],
    [/^(0?3)(\d{2}|\d{4})$/, "MARÇO"],
    [/^(0?4)(\d{2}|\d{4})$/, "ABRIL"],
    [/^(0?5)(\d{2}|\d{4})$/, "MAIO"],
    [/^(0?6)(\d{2}|\d{4})$/, "JUNHO"],
    [/^(0?7)(\d{2}|\d{4})$/, "JULHO"],
    [/^(0?8)(\d{2}|\d{4})$/, "AGOSTO"],
    [/^(0?9)(\d{2}|\d{4})$/, "SETEMBRO"],
    [/^(10)(\d{2}|\d{4})$/, "OUTUBRO"],
    [/^(11)(\d{2}|\d{4})$/, "NOVEMBRO"],
    [/^(12)(\d{2}|\d{4})$/, "DEZEMBRO"],
  ];
  for (const [pattern, month] of monthPatterns) {
    const match = key.match(pattern);
    if (!match) continue;
    const rawYear = match[2] ?? "";
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${month}/${year}`;
  }
  return null;
}

function zipButtonLabel(item: Insertion) {
  const piDigits = normalizePiDigits(item.piCodigo) ?? item.piCodigo ?? "sem-pi";
  const format = item.localFormatoNormalizado ?? item.localFormato ?? "formato";
  const base = `PI ${piDigits} · ${item.siteSigla ?? "—"} · #${item.id} · ${format}`;
  return base.length > 60 ? `${base.slice(0, 57)}...` : base;
}

function buildZipSelectionKeyboard(env: Env, insertions: Insertion[]) {
  return {
    inline_keyboard: insertions.map((item) => [{ text: zipButtonLabel(item), url: envExportZipUrl(env, item.id) }]),
  };
}

function buildZipSelectionText(query: string, insertions: Insertion[], totalCount = insertions.length, truncated = false) {
  return [
    `Encontrei ${totalCount} inserção(ões) para: ${query}`,
    "",
    "Escolha a versão do site para baixar o ZIP.",
    ...insertions.map((item) => `- ${item.siteSigla ?? "—"} · #${item.id} · ${item.localFormatoNormalizado ?? item.localFormato ?? "—"} · ${item.periodoInicio ?? "—"} a ${item.periodoFim ?? "—"}`),
    ...(truncated ? ["", "A lista foi truncada nos botões para manter o Telegram estável."] : []),
  ].join("\n");
}

function piSiteButtonLabel(item: PiSiteExport, includeSite = true) {
  const countLabel = `${item.totalInsertions} ${item.totalInsertions === 1 ? "inserção" : "inserções"}`;
  const campaign = (item as PiSiteExport & { campaignName?: string | null }).campaignName?.trim();
  const base = includeSite
    ? `PI ${item.piCodigo} · ${campaign ? `${campaign} · ` : ""}${item.siteSigla} · ${countLabel}`
    : `PI ${item.piCodigo} · ${campaign ? `${campaign} · ` : ""}${countLabel}`;
  return base.length > 60 ? `${base.slice(0, 57)}...` : base;
}

function buildPiSiteSelectionKeyboard(items: PiSiteExport[], includeSite = true) {
  return {
    inline_keyboard: items
      .map((item) => [{ text: piSiteButtonLabel(item, includeSite), callback_data: `zipjob:${item.piCodigo}:${item.siteSigla}` }]),
  };
}

function buildPiSiteSelectionText(query: string, items: PiSiteExport[], unavailable: PiSiteExport[], truncated = false) {
  return [
    `Encontrei ${items.length + unavailable.length} versão(ões) de site para: ${query}`,
    "",
    "Escolha o site para solicitar o ZIP consolidado da PI.",
    ...items.map((item) => `- ${item.siteSigla} · ${item.totalInsertions} ${item.totalInsertions === 1 ? "inserção" : "inserções"}`),
    ...(unavailable.length
      ? [
          "",
          "Sem pacote disponível:",
          ...unavailable.map((item) => `- ${item.siteSigla} · ${item.skippedInsertions?.length ? "sem artefatos anexáveis" : "indisponível"}`),
        ]
      : []),
    ...(truncated ? ["", "A lista foi truncada nos botões para manter o Telegram estável."] : []),
  ].join("\n");
}

function buildScheduledStartsSummary(insertions: Insertion[], today: string) {
  const future = insertions
    .filter((item) => item.periodoInicio && item.periodoInicio > today)
    .filter((item) => !["concluido", "cancelado"].includes(item.statusNormalizado))
    .sort((a, b) => String(a.periodoInicio).localeCompare(String(b.periodoInicio)) || a.id - b.id);

  const lines = future
    .slice(0, 8)
    .map((item) => `- ${item.periodoInicio}: ${item.siteSigla ?? "—"} / ${item.campanhaName ?? "—"} / ${item.piCodigo ?? `#${item.id}`}`);

  return {
    total: future.length,
    text: lines.join("\n") || "- nenhuma campanha agendada para iniciar depois de hoje",
  };
}

async function resolveInsertionCandidates(env: Env, token: string): Promise<Insertion[]> {
  const query = token.trim();
  if (!query) return [];
  const explicitInsertionId = normalizeInsertionId(query);
  if (explicitInsertionId) {
    try {
      return [(await adopsFetch(env, `/api/insertions/${explicitInsertionId}`)) as Insertion];
    } catch {}
  }

  const all = await fetchAllInsertions(env, null);
  const qNorm = normalizeText(query);
  const qDigits = normalizePiDigits(query);

  const scored = all
    .map((item) => {
      let score = 0;
      if (qDigits && normalizePiDigits(item.piCodigo) === qDigits) score += 120;
      if (qNorm && normalizeText(item.piCodigo) === qNorm) score += 90;
      if (normalizeText(item.piCodigo).includes(qNorm)) score += 40;
      if (normalizeText(item.campanhaName).includes(qNorm)) score += 10;
      if (/^\d+$/.test(query) && item.id === Number(query)) score += 5;
      if (["concluido", "cancelado"].includes(item.statusNormalizado)) score -= 5;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.id - a.item.id);

  if (qDigits) {
    const exactPi = scored
      .filter((entry) => normalizePiDigits(entry.item.piCodigo) === qDigits)
      .map((entry) => entry.item);
    if (exactPi.length) return exactPi;
  }

  if (/^\d+$/.test(query)) {
    try {
      const byId = (await adopsFetch(env, `/api/insertions/${Number(query)}`)) as Insertion;
      return byId ? [byId] : [];
    } catch {}
  }

  return scored.map((entry) => entry.item);
}

async function resolveInsertion(env: Env, token: string): Promise<Insertion | null> {
  const results = await resolveInsertionCandidates(env, token);
  return results[0] ?? null;
}

async function fetchPiSiteExport(env: Env, piCodigo: string, siteSigla: string): Promise<PiSiteExport | null> {
  const qs = new URLSearchParams({
    piCodigo,
    siteSigla,
  });
  const headers = new Headers();
  const targetUrl = env.ADOPS_PUBLIC_API_SERVICE
    ? `https://adops-api-public.internal/api/pi-site-exports?${qs.toString()}`
    : `${env.ADOPS_PUBLIC_API_BASE_URL.replace(/\/$/, "")}/api/pi-site-exports?${qs.toString()}`;
  const response = env.ADOPS_PUBLIC_API_SERVICE
    ? await env.ADOPS_PUBLIC_API_SERVICE.fetch(targetUrl, { headers })
    : await fetch(targetUrl, { headers });
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AdOps API /api/pi-site-exports falhou: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) as PiSiteExport : null;
}

async function createPiSiteExportJob(env: Env, piCodigo: string, siteSigla: string): Promise<{ jobId: string }> {
  return adopsFetch(env, "/api/pi-site-exports/jobs", {
    method: "POST",
    body: JSON.stringify({
      piCodigo,
      siteSigla,
      requestedBy: "telegram-bot",
      source: "telegram-bot",
    }),
  }) as Promise<{ jobId: string }>;
}

async function fetchPiSiteExportJob(env: Env, jobId: string): Promise<PiSiteExportJob> {
  return adopsFetch(env, `/api/pi-site-exports/jobs/${encodeURIComponent(jobId)}`) as Promise<PiSiteExportJob>;
}

function envPiSiteExportJobDownloadUrl(env: Env, jobId: string) {
  const base = env.ADOPS_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  return `${base}/api/pi-site-exports/jobs/${encodeURIComponent(jobId)}/download`;
}

async function waitForPiSiteExportJob(env: Env, jobId: string, timeoutMs = 45_000): Promise<PiSiteExportJob> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const job = await fetchPiSiteExportJob(env, jobId);
    if (job.status === "completed" || job.status === "failed") return job;
    await sleep(3000);
  }
  return fetchPiSiteExportJob(env, jobId);
}

function buildPiSiteExportJobText(job: PiSiteExportJob) {
  const regeneratedCount = Array.isArray(job.regeneratedDates) ? job.regeneratedDates.length : 0;
  const invalidatedCount = Array.isArray(job.invalidatedEvidenceIds) ? job.invalidatedEvidenceIds.length : 0;
  return [
    `Pacote PI/site`,
    `PI: ${job.piCodigo ?? "—"}`,
    `Site: ${job.siteSigla ?? "—"}`,
    `Status: ${job.status}`,
    `Etapa: ${job.stage ?? "aguardando runner"}`,
    `Inserções: ${Array.isArray(job.insertionIds) ? job.insertionIds.length : 0}`,
    `Evidências descartadas: ${invalidatedCount}`,
    `Prints regenerados: ${regeneratedCount}`,
    ...(job.error ? ["", `Erro: ${job.error}`] : []),
  ].join("\n");
}

async function listInsertionsBySiteAndCompetencia(env: Env, siteToken: string, competenciaToken: string) {
  const siteSigla = siteAliasToSigla(siteToken);
  if (!siteSigla) {
    throw new Error(`Site inválido: ${siteToken}. Use afl, omt, perrengue, pnmt, pmt/ppmt ou roo.`);
  }

  const competencia = competenciaTokenToLabel(competenciaToken);
  if (!competencia) {
    throw new Error(`Mês inválido: ${competenciaToken}. Exemplo: abr26.`);
  }

  const all = await fetchAllInsertions(env, competencia);
  const items = all
    .filter((item) => normalizeText(item.siteSigla) === normalizeText(siteSigla))
    .filter((item) => item.statusNormalizado !== "cancelado")
    .sort((a, b) => {
      const aPi = normalizePiDigits(a.piCodigo) ?? "";
      const bPi = normalizePiDigits(b.piCodigo) ?? "";
      return aPi.localeCompare(bPi) || a.id - b.id;
    });

  return { siteSigla, competencia, items };
}

async function listPiGroupsBySiteAndCompetencia(env: Env, siteToken: string, competenciaToken: string) {
  const { siteSigla, competencia, items } = await listInsertionsBySiteAndCompetencia(env, siteToken, competenciaToken);
  const groups = new Map<string, { piCodigo: string; siteSigla: string; totalInsertions: number; firstPeriodoInicio: string | null; campaignName: string | null }>();
  for (const item of items) {
    const piCodigo = normalizePiDigits(item.piCodigo);
    if (!piCodigo) continue;
    const current = groups.get(piCodigo) ?? {
      piCodigo,
      siteSigla,
      totalInsertions: 0,
      firstPeriodoInicio: item.periodoInicio ?? null,
      campaignName: item.campanhaName ?? null,
    };
    current.totalInsertions += 1;
    if (!current.firstPeriodoInicio || (item.periodoInicio && item.periodoInicio < current.firstPeriodoInicio)) {
      current.firstPeriodoInicio = item.periodoInicio;
    }
    groups.set(piCodigo, current);
  }

  return {
    siteSigla,
    competencia,
    items: Array.from(groups.values()).sort((a, b) => a.piCodigo.localeCompare(b.piCodigo) || String(a.firstPeriodoInicio ?? "").localeCompare(String(b.firstPeriodoInicio ?? ""))),
  };
}

async function buildCrossSiteCampaignHints(env: Env, competencia: string, currentSiteSigla: string, campaignNames: string[]) {
  if (!campaignNames.length) return [];
  const all = await fetchAllInsertions(env, competencia);
  const requested = new Set(campaignNames.map((item) => normalizeText(item)).filter(Boolean));
  const currentSite = normalizeText(currentSiteSigla);
  const hints = new Map<string, Set<string>>();
  for (const item of all) {
    const campaignKey = normalizeText(item.campanhaName);
    if (!requested.has(campaignKey)) continue;
    const siteSigla = item.siteSigla?.trim();
    if (!siteSigla || normalizeText(siteSigla) === currentSite) continue;
    const current = hints.get(campaignKey) ?? new Set<string>();
    current.add(siteSigla);
    hints.set(campaignKey, current);
  }

  return campaignNames
    .map((campaignName) => {
      const sites = hints.get(normalizeText(campaignName));
      if (!sites || !sites.size) return null;
      return `- ${campaignName}: também aparece em ${Array.from(sites).sort().join(", ")}`;
    })
    .filter((item): item is string => Boolean(item));
}

async function fetchInsertionBundle(env: Env, insertionId: number) {
  const [detail, docs, reports, requirements] = await Promise.all([
    adopsFetch(env, `/api/insertions/${insertionId}`) as Promise<Insertion & { evidences?: Array<unknown> }>,
    adopsFetch(env, `/api/insertions/${insertionId}/operational-documents`) as Promise<OperationalDocuments>,
    adopsFetch(env, `/api/analytics/insertions/${insertionId}/reports`) as Promise<{ reports: AnalyticsReport[] }>,
    adopsFetch(env, `/api/analytics/insertions/${insertionId}/requirements`) as Promise<AnalyticsRequirements>,
  ]);
  return { detail, docs, reports: reports.reports, requirements };
}

function isReadyForDispatch(bundle: Awaited<ReturnType<typeof fetchInsertionBundle>>) {
  const docsReady = bundle.docs.documents.length > 0;
  const audit = bundle.detail.auditSummary;
  if (!audit) return false;
  const printsReady =
    Boolean(bundle.detail.printGerado) &&
    audit.invalidAuditCount === 0 &&
    audit.invalidUrlCount === 0 &&
    audit.missingCount === 0 &&
    audit.totalEvidenceDates > 0;
  const analyticsReady = !bundle.requirements.requiresAnalytics || bundle.reports.some((item) => item.status === "completed");
  return docsReady && printsReady && analyticsReady;
}

function buildInsertionText(bundle: Awaited<ReturnType<typeof fetchInsertionBundle>>) {
  const item = bundle.detail;
  const docsCount = bundle.docs.documents.length;
  const reportsCount = bundle.reports.filter((entry) => entry.status === "completed").length;
  const audit = item.auditSummary;
  const ready = isReadyForDispatch(bundle) ? "SIM" : "NÃO";
  return [
    `PI: ${item.piCodigo ?? "—"}`,
    `Inserção: #${item.id}`,
    `Campanha: ${item.campanhaName ?? "—"}`,
    `Site: ${item.siteSigla ?? "—"}`,
    `Formato: ${item.localFormatoNormalizado ?? item.localFormato ?? "—"}`,
    `Período: ${item.periodoInicio ?? "—"} a ${item.periodoFim ?? "—"}`,
    `Status: ${item.statusNormalizado}`,
    `Print: ${item.printGerado ? "sim" : "não"}`,
    `Docs: ${docsCount}`,
    `Analytics: ${reportsCount}`,
    `Evidências auditadas: ${audit ? `${audit.auditedCount}/${audit.totalEvidenceDates}` : "—"}`,
    `Pronta para envio: ${ready}`,
    "",
    `${envPageUrl(item.id)}`,
  ].join("\n");
}

function envPageUrl(insertionId: number) {
  return `https://adops-campanhas-portais.pages.dev/insercoes/${insertionId}`;
}

function envExportZipUrl(env: Env, insertionId: number) {
  const base = env.ADOPS_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  return `${base}/api/insertions/${insertionId}/evidences/export.zip`;
}

function envPiSiteExportUrl(env: Env, piCodigo: string, siteSigla: string) {
  const base = env.ADOPS_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  const qs = new URLSearchParams({
    piCodigo,
    siteSigla,
    download: "1",
  });
  return `${base}/api/pi-site-exports?${qs.toString()}`;
}

function buildInsertionKeyboard(env: Env, insertionId: number, miniApp = false) {
  const rows: Array<Array<Record<string, unknown>>> = [
    [
      { text: "Abrir inserção", url: envPageUrl(insertionId) },
      { text: "Abrir ZIP", url: envExportZipUrl(env, insertionId) },
    ],
    [
      { text: "Print hoje", callback_data: `print:${insertionId}` },
      { text: "Concluir", callback_data: `concluir:${insertionId}` },
    ],
  ];
  if (miniApp && env.TELEGRAM_MINI_APP_URL?.trim()) {
    rows.push([{ text: "Abrir Mini App", web_app: { url: env.TELEGRAM_MINI_APP_URL.trim() } }]);
  }
  return { inline_keyboard: rows };
}

async function updateInsertionStatus(env: Env, insertionId: number, mode: "concluir" | "enviado" | "docs") {
  const payload: Record<string, unknown> = {};
  if (mode === "concluir") {
    payload.statusNormalizado = "concluido";
  } else if (mode === "enviado") {
    payload.statusNormalizado = "enviado_para_agencia";
    payload.processoEnviadoAgencia = true;
    payload.dataEnvioAgencia = currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  } else if (mode === "docs") {
    payload.statusNormalizado = "docs_enviados";
    payload.processoEnviadoAgencia = true;
    payload.docsEnviados = true;
    payload.dataEnvioAgencia = currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  }
  return adopsFetch(env, `/api/insertions/${insertionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, true);
}

async function requestPrint(env: Env, insertionId: number, date?: string | null) {
  const payload: Record<string, unknown> = {};
  if (date) {
    payload.date = date;
    payload.captureAt = `${date}T10:30:00-04:00`;
    payload.force = true;
    payload.replace = true;
  }
  return adopsFetch(env, `/api/insertions/${insertionId}/capture-proof`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function isCaptureStatusReadyForTelegram(status: CaptureStatus | null | undefined) {
  if (!status?.arquivoUrl) return false;
  if (status.status !== "audited") return false;
  if (!status.audit) return true;
  if (status.audit?.ok !== true) return false;
  const visual = status.audit?.visualAudit;
  if (!visual) return true;
  const viewportImagesOk = Number(visual.viewportImagesLoaded ?? 0) >= Number(visual.viewportImagesTotal ?? 0);
  const slotImagesOk = Number(visual.slotImagesLoaded ?? 0) >= Number(visual.slotImagesTotal ?? 0);
  const backgroundsOk = Number(visual.viewportBackgroundsLoaded ?? 0) >= Number(visual.viewportBackgroundsTotal ?? 0);
  const videosOk = Number(visual.viewportVideosLoaded ?? 0) >= Number(visual.viewportVideosTotal ?? 0);
  return viewportImagesOk && slotImagesOk && backgroundsOk && videosOk;
}

async function fetchCaptureStatus(env: Env, insertionId: number, date: string) {
  return (await adopsFetch(env, `/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(date)}`)) as CaptureStatus;
}

async function collectDailyPreflightState(env: Env, date?: string) {
  const targetDate = date ?? currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const competencia = currentCompetencia(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const finalAudit = (await adopsFetch(
    env,
    `/api/insertions/capture-proof/audit?date=${encodeURIComponent(targetDate)}&competencia=${encodeURIComponent(competencia)}`,
  )) as CaptureAuditSummary;
  const failed: Array<{ insertionId: number; status: string; issues: string[] }> = [];
  for (const item of finalAudit.items) {
    const status = await fetchCaptureStatus(env, item.insertionId, targetDate);
    if (item.status === "ok" && isCaptureStatusReadyForTelegram(status)) continue;
    failed.push({
      insertionId: item.insertionId,
      status: status?.status ?? item.status ?? "missing",
      issues: (status?.audit?.issues ?? []).map((issue) => issue.code || issue.label || "unknown_issue"),
    });
  }

  return { date: targetDate, competencia, repaired: [] as number[], finalAudit, failed };
}

async function sendReadyInsertions(env: Env) {
  const competencia = currentCompetencia(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const insertions = await fetchAllInsertions(env, competencia);
  const candidates = insertions.filter((item) => item.printGerado && !item.processoEnviadoAgencia && !["concluido", "cancelado"].includes(item.statusNormalizado));
  const ready: Array<Awaited<ReturnType<typeof fetchInsertionBundle>>> = [];
  for (const item of candidates) {
    const bundle = await fetchInsertionBundle(env, item.id);
    if (isReadyForDispatch(bundle)) ready.push(bundle);
  }
  if (!ready.length) return;
  await sendMessage(
    env,
    env.TELEGRAM_ALLOWED_USER_ID,
    `AdOps: ${ready.length} inserção(ões) prontas para envio à agência em ${competencia}.`,
  );
  for (const bundle of ready) {
    await sendMessage(
      env,
      env.TELEGRAM_ALLOWED_USER_ID,
      buildInsertionText(bundle),
      { reply_markup: buildInsertionKeyboard(env, bundle.detail.id, true) },
    );
    await sendMessage(env, env.TELEGRAM_ALLOWED_USER_ID, `ZIP da inserção #${bundle.detail.id}:\n${envExportZipUrl(env, bundle.detail.id)}`);
  }
}

async function sendDailySummary(
  env: Env,
  preflight?: {
    date: string;
    competencia: string;
    repaired: number[];
    finalAudit: CaptureAuditSummary;
    failed: Array<{ insertionId: number; status: string; issues: string[] }>;
  },
  dailyPrintJob?: DailyPrintJobState | null,
) {
  const date = preflight?.date ?? currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const competencia = preflight?.competencia ?? currentCompetencia(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const [audit, insertionsCompetencia, insertionsAll] = await Promise.all([
    Promise.resolve(preflight?.finalAudit ?? null) as Promise<CaptureAuditSummary | null>,
    fetchAllInsertions(env, competencia),
    fetchAllInsertions(env, null),
  ]);
  const effectiveAudit = audit ?? await adopsFetch(env, `/api/insertions/capture-proof/audit?date=${encodeURIComponent(date)}&competencia=${encodeURIComponent(competencia)}`) as CaptureAuditSummary;

  const okIds = new Set(effectiveAudit.items.filter((item) => item.status === "ok").map((item) => item.insertionId));
  const bySite = new Map<string, number>();
  const byCampaign = new Map<string, number>();
  for (const item of insertionsCompetencia) {
    if (!okIds.has(item.id)) continue;
    bySite.set(item.siteSigla ?? "—", (bySite.get(item.siteSigla ?? "—") ?? 0) + 1);
    byCampaign.set(item.campanhaName ?? "—", (byCampaign.get(item.campanhaName ?? "—") ?? 0) + 1);
  }

  const topSites = [...bySite.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- sem prints auditados";
  const topCampaigns = [...byCampaign.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- sem prints auditados";
  const scheduled = buildScheduledStartsSummary(insertionsAll, date);
  const remediation = preflight
    ? [
        `Correções automáticas nesta rodada: ${preflight.repaired.length}`,
        `Falhas remanescentes para revisão: ${preflight.failed.length}`,
      ].join("\n")
    : null;
  const remaining = preflight?.failed.length
    ? preflight.failed.slice(0, 8).map((item) => `- #${item.insertionId}: ${item.status}${item.issues.length ? ` (${item.issues.join(", ")})` : ""}`).join("\n")
    : "- nenhuma";
  const dailyPrintJobLine = formatDailyPrintJobState(dailyPrintJob);
  const text = [
    `Resumo diário AdOps`,
    `Data: ${date}`,
    `Competência: ${competencia}`,
    dailyPrintJobLine,
    "",
    `Total elegíveis: ${effectiveAudit.totalEligible}`,
    `Auditados: ${effectiveAudit.ok}`,
    `Pendentes: ${effectiveAudit.missing}`,
    `Inválidos: ${effectiveAudit.invalid}`,
    ...(remediation ? ["", remediation, "", "Falhas remanescentes:", remaining] : []),
    "",
    `Por site:`,
    topSites,
    "",
    `Por campanha:`,
    topCampaigns,
    "",
    `Agendadas para iniciar depois de hoje: ${scheduled.total}`,
    scheduled.text,
  ].join("\n");

  await sendMessage(env, env.TELEGRAM_DEFAULT_GROUP_ID, text);
}

async function sendDailyPrintAlert(env: Env, date: string, escalation = false, publicationBlockedIds: number[] = []) {
  const daily = await adopsFetch(env, `/api/ops/daily-print-status?date=${encodeURIComponent(date)}`, {}, true) as {
    lastAttempt?: {
      status?: string;
      expected?: number;
      approved?: number;
      missing?: number;
      invalid?: number;
      failedInsertionIds?: number[];
    } | null;
  };
  const attempt = daily.lastAttempt;
  const expected = Number(attempt?.expected ?? 0);
  const approved = Number(attempt?.approved ?? 0);
  const missing = Number(attempt?.missing ?? 0);
  const invalid = Number(attempt?.invalid ?? 0);
  const pending = Array.isArray(attempt?.failedInsertionIds)
    ? attempt.failedInsertionIds.filter(Number.isInteger).sort((a, b) => a - b)
    : [];
  const resolved = attempt?.status === "completed" && expected > 0 && approved === expected && missing === 0 && invalid === 0;
  const state = resolved ? "resolved" : escalation ? "blocked_0830" : "recovery_in_progress";
  const claim = await adopsFetch(env, "/api/ops/daily-print-alerts/claim", {
    method: "POST",
    body: JSON.stringify({ date, state, pendingInsertionIds: pending, publicationBlockedIds }),
  }, true) as { claimed?: boolean };
  if (claim.claimed !== true) return;
  const text = resolved
    ? `AdOps: auditoria de ${date} concluída. ${approved} de ${expected} prints aprovados.`
    : [
        escalation ? `AdOps: bloqueio mantido às 08h30 para ${date}.` : `AdOps: recuperação automática em andamento para ${date}.`,
        `Elegíveis: ${expected} · auditados: ${approved} · pendentes: ${missing} · inválidos: ${invalid}`,
        `Inserções: ${pending.length ? pending.join(", ") : "causa ainda sem IDs"}`,
        ...(publicationBlockedIds.length ? [`Publicação bloqueada: ${publicationBlockedIds.join(", ")}`] : []),
      ].join("\n");
  await sendMessage(env, env.TELEGRAM_DEFAULT_GROUP_ID, text);
}

function buildDailyPrintCaption(item: Insertion, targetDate: string) {
  const progress = buildPrintProgress(item, targetDate);
  return [
    `${item.siteSigla ?? "—"} #${item.id}`,
    `${item.campanhaName ?? "—"}`,
    `${item.piCodigo ?? "—"}`,
    `Print: ${progress ?? "—"}`,
    `Período: ${item.periodoInicio ?? "—"} a ${item.periodoFim ?? "—"}`,
  ].join("\n");
}

function buildDrivePiEventText(body: Record<string, unknown>) {
  const status = String(body.status ?? "needs_review");
  const applied = body.applied && typeof body.applied === "object" ? body.applied as Record<string, unknown> : null;
  const missing = Array.isArray(body.missing) ? body.missing.map(String) : [];
  const reviewReasons = Array.isArray(body.reviewReasons) ? body.reviewReasons.map(String) : [];
  const invalidInsertions = Array.isArray(body.invalidInsertions) ? body.invalidInsertions : [];
  const dedupe = body.dedupe && typeof body.dedupe === "object" ? body.dedupe as Record<string, unknown> : null;
  const dedupeConflicts = Array.isArray(dedupe?.conflicts) ? dedupe.conflicts.map(String) : [];
  const campaignCreated = applied?.campaignCreated === true;
  const campaignReused = applied?.campaignCreated === false;
  const createdInsertions = Array.isArray(applied?.createdInsertions) ? applied.createdInsertions.length : 0;
  const skippedInsertions = Array.isArray(applied?.skippedInsertions) ? applied.skippedInsertions.length : 0;
  const evidenceCoverage = body.evidenceCoverage && typeof body.evidenceCoverage === "object" ? body.evidenceCoverage as Record<string, unknown> : null;
  const checkedEvidence = Array.isArray(evidenceCoverage?.checked) ? evidenceCoverage.checked.length : 0;
  const coverageResults = Array.isArray(evidenceCoverage?.results) ? evidenceCoverage.results as Array<Record<string, unknown>> : [];
  const regeneratedDates = coverageResults.flatMap((item) => Array.isArray(item.regeneratedDates) ? item.regeneratedDates.map(String) : []);
  const operation =
    status === "failed"
      ? "Erro real no fluxo Drive PI"
      : status === "intake_locked"
      ? "Processo automático iniciado; não cadastre manualmente ainda"
      : status === "applied"
      ? campaignCreated || createdInsertions > 0
        ? "Cadastrado no AdOps"
        : campaignReused && skippedInsertions > 0
          ? "Já existia no AdOps; não duplicou"
          : "Aplicado no AdOps"
      : "Pendente de revisão";
  const lines = [
    "Nova PI detectada no Drive",
    `Status: ${operation}`,
    "",
    `Arquivo: ${String(body.name ?? "sem nome")}`,
    `Caminho: ${String(body.path ?? "sem caminho")}`,
    body.piCodigo ? `PI: ${String(body.piCodigo)}` : null,
    body.campaignName ? `Campanha: ${String(body.campaignName)}` : null,
    body.packageClass ? `Pacote: ${String(body.packageClass)}` : null,
    body.intakeLock ? `Trava: ${String(body.intakeLock)}` : null,
    applied?.campaignId ? `Campanha AdOps: #${String(applied.campaignId)}` : null,
    applied ? `Campanha: ${campaignCreated ? "criada" : "já existente"}` : null,
    applied ? `Inserções criadas: ${createdInsertions}` : null,
    applied ? `Inserções já existentes: ${skippedInsertions}` : null,
    checkedEvidence ? `Evidências conferidas: ${checkedEvidence}` : null,
    regeneratedDates.length ? `Evidências geradas/corrigidas: ${regeneratedDates.join(", ")}` : null,
    body.clickUrl ? `Link destino: ${String(body.clickUrl)}` : null,
    reviewReasons.length ? `Motivos de revisão: ${reviewReasons.join(", ")}` : null,
    missing.length ? `Campos pendentes: ${missing.join(", ")}` : null,
    dedupeConflicts.length ? `Conflitos de dedupe: ${dedupeConflicts.join(" | ").slice(0, 700)}` : null,
    invalidInsertions.length ? `Inserções com dados pendentes: ${invalidInsertions.length}` : null,
    body.error ? `Erro: ${String(body.error).slice(0, 700)}` : null,
    body.webViewLink ? `Drive: ${String(body.webViewLink)}` : null,
  ];
  return lines.filter(Boolean).join("\n").slice(0, 3500);
}

async function sendDailyPrintPhotos(env: Env) {
  const date = currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const competencia = currentCompetencia(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
  const [audit, insertions] = await Promise.all([
    adopsFetch(env, `/api/insertions/capture-proof/audit?date=${encodeURIComponent(date)}&competencia=${encodeURIComponent(competencia)}`) as Promise<CaptureAuditSummary>,
    fetchAllInsertions(env, competencia),
  ]);

  const insertionMap = new Map(insertions.map((item) => [item.id, item]));
  const okItems = audit.items.filter((item) => item.status === "ok");
  let sent = 0;

  for (const item of okItems) {
    const status = await fetchCaptureStatus(env, item.insertionId, date);
    if (!isCaptureStatusReadyForTelegram(status)) continue;
    const arquivoUrl = status.arquivoUrl;
    if (!arquivoUrl) continue;
    const insertion = insertionMap.get(item.insertionId);
    if (!insertion) continue;
    await sendPhoto(
      env,
      env.TELEGRAM_DEFAULT_GROUP_ID,
      arquivoUrl,
      buildDailyPrintCaption(insertion, date),
      { disable_notification: true },
    );
    sent += 1;
  }

  return { date, competencia, totalOk: okItems.length, sent };
}

function isAllowedUser(env: Env, userId: string | number | null | undefined) {
  return String(userId ?? "") === String(env.TELEGRAM_ALLOWED_USER_ID ?? "");
}

function parseTelegramInput(env: Env, text: string): ParsedTelegramInput {
  const raw = text.trim();
  if (!raw) return { command: "", args: [], raw };

  if (!raw.startsWith("/")) {
    return { command: "/pi", args: [raw], raw };
  }

  const match = raw.match(/^\/([^\s@]+)(?:@([^\s]+))?(?:\s+([\s\S]+))?$/);
  if (!match) {
    const [commandRaw, ...args] = raw.split(/\s+/);
    return { command: commandRaw.toLowerCase(), args, raw };
  }

  const [, commandName, addressedBot, restRaw = ""] = match;
  const expectedBot = normalizeBotUsername(env.TELEGRAM_BOT_USERNAME);
  const targetBot = normalizeBotUsername(addressedBot);

  if (targetBot && expectedBot && targetBot !== expectedBot) {
    return { command: "", args: [], raw };
  }

  return {
    command: `/${String(commandName ?? "").toLowerCase()}`,
    args: restRaw.trim() ? restRaw.trim().split(/\s+/) : [],
    raw,
  };
}

async function handleCommand(env: Env, chatId: string | number, userId: string | number | null | undefined, text: string) {
  const parsed = parseTelegramInput(env, text);
  const command = parsed.command;
  const args = parsed.args;

  console.log("telegram_message_received", JSON.stringify({
    chatId: String(chatId),
    userId: String(userId ?? ""),
    rawText: text,
    command,
    args,
  }));

  if (command === "/start" || command === "/help") {
    return sendMessage(
      env,
      chatId,
      [
        "Bot AdOps",
        "",
        "Consultar",
        "/pi 14028",
        "/pi #860",
        "Use PI para buscar a versão operacional e #id para uma inserção exata.",
        "",
        "Baixar ZIP",
        "/zip 14028",
        "/lista_pi pmt abr26",
        "Alias aceito: /lista-pi pmt abr26",
        "Quando a PI tiver várias inserções no mesmo site, eu preparo um ZIP consolidado por site.",
        "Antes de liberar o arquivo, eu confiro auditoria, prints inválidos e Analytics pi/full_month.",
        "",
        "Listar PIs por site e mês",
        "/lista_pi <site> <mes>",
        "Exemplo: /lista_pi pmt abr26",
        "",
        "Prints",
        "/print 14028",
        "/retro 14028 2026-04-19",
        "",
        "Status operacional",
        "/enviado #860",
        "/docs #860",
        "/concluir #860",
        "",
        "Dica",
        "Se digitar só 14028, eu trato como PI. Se digitar #860, eu trato como ID exato da inserção.",
      ].join("\n"),
      {
        reply_markup: env.TELEGRAM_MINI_APP_URL?.trim()
          ? { inline_keyboard: [[{ text: "Abrir Mini App", web_app: { url: env.TELEGRAM_MINI_APP_URL.trim() } }]] }
          : undefined,
      },
    );
  }

  if (!command) {
    return sendMessage(env, chatId, "Comando inválido para este bot.");
  }

  if ((command === "/pi" || command === "/zip" || command === "/print" || command === "/concluir" || command === "/enviado" || command === "/docs") && !args.length) {
    return sendMessage(env, chatId, "Informe o número da inserção ou a PI.");
  }

  if ((command === "/lista-pi" || command === "/lista_pi") && args.length < 2) {
    return sendMessage(env, chatId, "Use assim: /lista_pi <site> <mes>. Exemplo: /lista_pi pmt abr26");
  }

  if (command === "/pi") {
    const query = args.join(" ").trim();
    const insertion = await resolveInsertion(env, query);
    if (!insertion) {
      return sendMessage(env, chatId, `Não encontrei inserção para: ${query}`);
    }
    const bundle = await fetchInsertionBundle(env, insertion.id);
    return sendMessage(env, chatId, buildInsertionText(bundle), { reply_markup: buildInsertionKeyboard(env, insertion.id, true) });
  }

  if (command === "/zip") {
    const query = args.join(" ").trim();
    const explicitInsertionId = normalizeInsertionId(query);
    if (explicitInsertionId) {
      const insertion = await resolveInsertion(env, query);
      if (!insertion?.piCodigo || !insertion.siteSigla) {
        return sendMessage(env, chatId, `Não consegui resolver PI/site a partir da inserção #${explicitInsertionId}.`);
      }
      const jobRequest = await createPiSiteExportJob(env, normalizePiDigits(insertion.piCodigo) ?? insertion.piCodigo, insertion.siteSigla);
      const job = await waitForPiSiteExportJob(env, jobRequest.jobId);
      if (job.status === "completed" && job.downloadUrl) {
        return sendMessage(env, chatId, `${buildPiSiteExportJobText(job)}\n\n${envPiSiteExportJobDownloadUrl(env, job.id)}`, {
          reply_markup: { inline_keyboard: [[{ text: "Baixar ZIP", url: envPiSiteExportJobDownloadUrl(env, job.id) }]] },
          disable_web_page_preview: true,
        });
      }
      return sendMessage(env, chatId, buildPiSiteExportJobText(job));
    }

    const insertions = await resolveInsertionCandidates(env, query);
    if (!insertions.length) {
      return sendMessage(env, chatId, `Não encontrei inserção para: ${query}`);
    }

    const groupedBySite = new Map<string, Insertion[]>();
    for (const item of insertions) {
      const siteSigla = item.siteSigla ?? "SEM-SITE";
      const current = groupedBySite.get(siteSigla) ?? [];
      current.push(item);
      groupedBySite.set(siteSigla, current);
    }

    const siteExports = (await Promise.all(
      Array.from(groupedBySite.entries()).map(async ([siteSigla, siteItems]) => {
        const piCodigo = normalizePiDigits(siteItems[0]?.piCodigo) ?? normalizePiDigits(query);
        if (!piCodigo) return null;
        const payload = await fetchPiSiteExport(env, piCodigo, siteSigla);
        if (!payload) return null;
        return {
          ...payload,
          downloadUrl: payload.downloadUrl ? envPiSiteExportUrl(env, payload.piCodigo, payload.siteSigla) : null,
        };
      }),
    )).filter((item): item is NonNullable<typeof item> => item !== null);

    if (!siteExports.length) {
      return sendMessage(env, chatId, `Não encontrei pacote consolidado por site para: ${query}`);
    }

    const available = siteExports;
    const unavailable: PiSiteExport[] = [];
    if (available.length === 1 && siteExports.length === 1) {
      const item = available[0]!;
      const jobRequest = await createPiSiteExportJob(env, item.piCodigo, item.siteSigla);
      const job = await waitForPiSiteExportJob(env, jobRequest.jobId);
      if (job.status === "completed" && job.downloadUrl) {
        return sendMessage(env, chatId, `${buildPiSiteExportJobText(job)}\n\n${envPiSiteExportJobDownloadUrl(env, job.id)}`, {
          reply_markup: { inline_keyboard: [[{ text: "Baixar ZIP", url: envPiSiteExportJobDownloadUrl(env, job.id) }]] },
          disable_web_page_preview: true,
        });
      }
      return sendMessage(env, chatId, buildPiSiteExportJobText(job));
    }

    const limited = available.slice(0, 30);
    await sendMessage(env, chatId, buildPiSiteSelectionText(query, limited, unavailable, available.length > limited.length), {
      reply_markup: buildPiSiteSelectionKeyboard(limited, true),
      disable_web_page_preview: true,
    });
    return;
  }

  if (command === "/lista-pi" || command === "/lista_pi") {
    const [siteToken, competenciaToken] = args;
    const { siteSigla, competencia, items } = await listPiGroupsBySiteAndCompetencia(env, siteToken, competenciaToken);
    if (!items.length) {
      return sendMessage(env, chatId, `Não encontrei PI para ${siteSigla} em ${competencia}.`);
    }
    const crossSiteHints = await buildCrossSiteCampaignHints(
      env,
      competencia,
      siteSigla,
      Array.from(new Set(items.map((item) => item.campaignName).filter((item): item is string => Boolean(item?.trim())))),
    );

    const exportCandidates = await Promise.all(
      items.slice(0, 30).map(async (item) => {
        const payload = await fetchPiSiteExport(env, item.piCodigo, siteSigla);
        if (!payload) return null;
        return {
          ...payload,
          totalInsertions: item.totalInsertions,
          downloadUrl: payload.downloadUrl ? envPiSiteExportUrl(env, item.piCodigo, siteSigla) : null,
          campaignName: item.campaignName,
        };
      }),
    );
    const exports = exportCandidates.filter((item): item is Exclude<typeof item, null> => item !== null);

    if (!exports.length) {
      return sendMessage(env, chatId, `Encontrei PIs em ${siteSigla} ${competencia}, mas nenhuma tem pacote consolidado disponível agora.`);
    }

    return sendMessage(
      env,
      chatId,
      [
        `PIs de ${siteSigla} em ${competencia}`,
        `Total: ${items.length}`,
        "",
        ...exports.map((item) => `- PI ${item.piCodigo} · ${(item as PiSiteExport & { campaignName?: string | null }).campaignName ?? "—"} · ${item.totalInsertions} ${item.totalInsertions === 1 ? "inserção" : "inserções"}`),
        "",
        "Toque no botão para solicitar o ZIP da versão do site.",
        ...(crossSiteHints.length ? ["", "Campanhas com o mesmo nome em outros sites nesta competência:", ...crossSiteHints] : []),
        ...(items.length > exports.length ? ["", "Algumas PIs não apareceram porque não têm pacote consolidado disponível."] : []),
        ...(items.length > 30 ? ["", "A lista foi truncada nos botões para manter o Telegram estável."] : []),
      ].join("\n"),
      {
        reply_markup: buildPiSiteSelectionKeyboard(exports, false),
        disable_web_page_preview: true,
      },
    );
  }

  if (command === "/print") {
    const query = args.join(" ").trim();
    const insertion = await resolveInsertion(env, query);
    if (!insertion) {
      return sendMessage(env, chatId, `Não encontrei inserção para: ${query}`);
    }
    const result = await requestPrint(env, insertion.id, null);
    return sendMessage(env, chatId, `Print solicitado para a inserção #${insertion.id}. Resultado: ${JSON.stringify(result)}`);
  }

  if (command === "/retro") {
    const date = args[args.length - 1] ?? "";
    const query = args.slice(0, -1).join(" ").trim();
    if (!query) {
      return sendMessage(env, chatId, "Informe o número da inserção ou a PI.");
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendMessage(env, chatId, "Informe a data no formato aaaa-mm-dd.");
    }
    const insertion = await resolveInsertion(env, query);
    if (!insertion) {
      return sendMessage(env, chatId, `Não encontrei inserção para: ${query}`);
    }
    const result = await requestPrint(env, insertion.id, date);
    return sendMessage(env, chatId, `Print retroativo solicitado para #${insertion.id} em ${date}. Resultado: ${JSON.stringify(result)}`);
  }

  if (!isAllowedUser(env, userId)) {
    return sendMessage(env, chatId, "Você não tem permissão para atualizar status desta inserção.");
  }

  if (command === "/concluir" || command === "/enviado" || command === "/docs") {
    const query = args.join(" ").trim();
    const insertion = await resolveInsertion(env, query);
    if (!insertion) {
      return sendMessage(env, chatId, `Não encontrei inserção para: ${query}`);
    }
    const mode = command === "/concluir" ? "concluir" : command === "/enviado" ? "enviado" : "docs";
    await updateInsertionStatus(env, insertion.id, mode);
    const bundle = await fetchInsertionBundle(env, insertion.id);
    return sendMessage(env, chatId, `Inserção #${insertion.id} atualizada.\n\n${buildInsertionText(bundle)}`, {
      reply_markup: buildInsertionKeyboard(env, insertion.id, true),
    });
  }

  return sendMessage(env, chatId, "Comando não suportado.");
}

async function handleCallback(env: Env, callback: TelegramCallbackQuery) {
  const data = callback.data ?? "";
  const chatId = callback.message?.chat.id;
  if (!chatId) {
    await answerCallback(env, callback.id, "Ação inválida.");
    return;
  }
  try {
    if (data.startsWith("zipjob:")) {
      const [, rawPiCodigo, rawSiteSigla] = data.split(":");
      const piCodigo = normalizePiDigits(rawPiCodigo) ?? rawPiCodigo;
      const siteSigla = String(rawSiteSigla || "").trim().toUpperCase();
      if (!piCodigo || !siteSigla) {
        await answerCallback(env, callback.id, "PI/site inválidos.");
        return;
      }
      const created = await createPiSiteExportJob(env, piCodigo, siteSigla);
      await answerCallback(env, callback.id, "Preparando pacote...");
      const job = await waitForPiSiteExportJob(env, created.jobId);
      if (job.status === "completed" && job.downloadUrl) {
        await sendMessage(env, chatId, `${buildPiSiteExportJobText(job)}\n\n${envPiSiteExportJobDownloadUrl(env, job.id)}`, {
          reply_markup: { inline_keyboard: [[{ text: "Baixar ZIP", url: envPiSiteExportJobDownloadUrl(env, job.id) }]] },
          disable_web_page_preview: true,
        });
      } else {
        await sendMessage(env, chatId, buildPiSiteExportJobText(job));
      }
      return;
    }

    const [action, rawId] = data.split(":");
    const insertionId = Number(rawId);
    if (!insertionId) {
      await answerCallback(env, callback.id, "Ação inválida.");
      return;
    }
    if (action === "print") {
      const result = await requestPrint(env, insertionId, null);
      await answerCallback(env, callback.id, "Print solicitado.");
      await sendMessage(env, chatId, `Print solicitado para a inserção #${insertionId}. Resultado: ${JSON.stringify(result)}`);
      return;
    }
    if (action === "concluir") {
      if (!isAllowedUser(env, callback.from.id)) {
        await answerCallback(env, callback.id, "Sem permissão.");
        return;
      }
      await updateInsertionStatus(env, insertionId, "concluir");
      const bundle = await fetchInsertionBundle(env, insertionId);
      await answerCallback(env, callback.id, "Inserção concluída.");
      await sendMessage(env, chatId, `Inserção #${insertionId} concluída.\n\n${buildInsertionText(bundle)}`, {
        reply_markup: buildInsertionKeyboard(env, insertionId, true),
      });
      return;
    }
    await answerCallback(env, callback.id, "Ação não suportada.");
  } catch (error) {
    await answerCallback(env, callback.id, error instanceof Error ? error.message.slice(0, 150) : "Falha.");
  }
}

async function handleWebhook(request: Request, env: Env) {
  const provided = request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? "";
  if (!env.TELEGRAM_WEBHOOK_SECRET?.trim() || provided !== env.TELEGRAM_WEBHOOK_SECRET.trim()) {
    return unauthorized("Secret do webhook inválido.");
  }
  const update = await readJson<TelegramUpdate>(request);
  if (!update) return badRequest("Payload inválido.");

  try {
    if (update.message?.text) {
      await handleCommand(env, update.message.chat.id, update.message.from?.id, update.message.text);
    } else if (update.callback_query) {
      await handleCallback(env, update.callback_query);
    }
  } catch (error) {
    const targetChat = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (targetChat) {
      await sendMessage(env, targetChat, `Erro: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return ok("processed");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "GET" && path === "/healthz") {
      return ok("telegram-bot-ok", {
        usernameConfigured: Boolean(env.TELEGRAM_BOT_USERNAME?.trim()),
        webhookBaseConfigured: Boolean(env.TELEGRAM_WEBHOOK_BASE_URL?.trim()),
        notificationsEnabled: normalizeText(env.TELEGRAM_NOTIFICATIONS_ENABLED) !== "false",
      });
    }

    if (request.method === "POST" && path === "/webhook") {
      return handleWebhook(request, env);
    }

    if (request.method === "POST" && path === "/ops/daily-report") {
      if (!env.OPS_API_TOKEN?.trim()) return unauthorized("OPS_API_TOKEN ausente.");
      const bearer = request.headers.get("authorization") ?? "";
      if (bearer !== `Bearer ${env.OPS_API_TOKEN.trim()}`) return unauthorized("Bearer inválido.");
      const skipDailyPhotos = url.searchParams.get("skipDailyPhotos") === "1";
      const result: Record<string, unknown> = { watchdog: "skipped", summary: "skipped", readyInsertions: "skipped", dailyPhotos: "skipped" };
      try {
        result.watchdog = await adopsFetch(env, "/api/ops/jobs/watchdog", {
          method: "POST",
          body: JSON.stringify({ dryRun: false, limit: 200 }),
        }, true);
      } catch (error) {
        result.watchdog = error instanceof Error ? error.message : String(error);
      }
      try {
        const preflight = await collectDailyPreflightState(env);
        let dailyPrintJob: DailyPrintJobState | null = null;
        try {
          dailyPrintJob = await fetchDailyPrintJobState(env, preflight.date);
          result.dailyPrintJob = dailyPrintJob;
        } catch (error) {
          result.dailyPrintJob = error instanceof Error ? error.message : String(error);
        }
        result.preflight = {
          date: preflight.date,
          competencia: preflight.competencia,
          repaired: preflight.repaired.length,
          failed: preflight.failed,
          final: {
            totalEligible: preflight.finalAudit.totalEligible,
            ok: preflight.finalAudit.ok,
            missing: preflight.finalAudit.missing,
            invalid: preflight.finalAudit.invalid,
          },
        };
        await sendDailySummary(env, preflight, dailyPrintJob);
        result.summary = "sent";
      } catch (error) {
        result.summary = error instanceof Error ? error.message : String(error);
      }
      try {
        await sendReadyInsertions(env);
        result.readyInsertions = "sent";
      } catch (error) {
        result.readyInsertions = error instanceof Error ? error.message : String(error);
      }
      if (!skipDailyPhotos) {
        try {
          result.dailyPhotos = await sendDailyPrintPhotos(env);
        } catch (error) {
          result.dailyPhotos = error instanceof Error ? error.message : String(error);
        }
      } else {
        result.dailyPhotos = "skipped_by_request";
      }
      return ok("daily-report-processed", result);
    }

    if (request.method === "POST" && path === "/ops/resend-print") {
      if (!env.OPS_API_TOKEN?.trim()) return unauthorized("OPS_API_TOKEN ausente.");
      const bearer = request.headers.get("authorization") ?? "";
      if (bearer !== `Bearer ${env.OPS_API_TOKEN.trim()}`) return unauthorized("Bearer inválido.");
      const body = await readJson<{ insertionId?: number; date?: string; chatId?: string | number }>(request);
      const insertionId = Number(body?.insertionId ?? 0);
      if (!insertionId) return badRequest("insertionId é obrigatório.");
      const targetDate = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba");
      const chatId = body?.chatId ?? env.TELEGRAM_DEFAULT_GROUP_ID;
      const status = await fetchCaptureStatus(env, insertionId, targetDate);
      if (!isCaptureStatusReadyForTelegram(status)) {
        return json({
          ok: false,
          error: "print_not_ready",
          insertionId,
          date: targetDate,
          status,
          details: "O print ainda nao esta auditado para envio. Corrija/regere no VPS e tente reenviar.",
        }, { status: 409 });
      }
      const insertion = await adopsFetch(env, `/api/insertions/${insertionId}`) as Insertion;
      await sendPhoto(
        env,
        chatId,
        String(status.arquivoUrl),
        buildDailyPrintCaption(insertion, targetDate),
      );
      return ok("print-resent", { insertionId, date: targetDate, arquivoUrl: status.arquivoUrl });
    }

    if (request.method === "POST" && path === "/ops/drive-pi-event") {
      if (!env.OPS_API_TOKEN?.trim()) return unauthorized("OPS_API_TOKEN ausente.");
      const bearer = request.headers.get("authorization") ?? "";
      if (bearer !== `Bearer ${env.OPS_API_TOKEN.trim()}`) return unauthorized("Bearer inválido.");
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return badRequest("Payload inválido.");
      const chatId = body.chatId ?? env.TELEGRAM_DEFAULT_GROUP_ID;
      await sendMessage(env, chatId as string | number, buildDrivePiEventText(body));
      return ok("drive-pi-event-sent", { chatId });
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  },

  async scheduled(controller: { cron?: string; scheduledTime?: number }, env: Env): Promise<void> {
    if (normalizeText(env.TELEGRAM_NOTIFICATIONS_ENABLED) === "false") return;
    const decision = await adopsFetch(env, "/api/ops/daily-print-alerts/evaluate") as { due?: boolean; localTime?: string; escalation?: boolean; targetDate?: string; publicationBlockedIds?: number[] };
    if (decision.due !== true || !decision.targetDate) return;
    const localTime = String(decision.localTime ?? "");
    const escalation = decision.escalation === true;
    const targetDate = decision.targetDate;
    try {
      const publicationBlockedIds = Array.isArray(decision.publicationBlockedIds)
        ? decision.publicationBlockedIds.filter(Number.isInteger).sort((a, b) => a - b)
        : [];
      await sendDailyPrintAlert(env, targetDate, escalation, publicationBlockedIds);
    } catch (error) {
      console.error("daily_print_alert_failed", error);
    }
    if (localTime !== "18:45") return;
    try {
      await adopsFetch(env, "/api/ops/jobs/watchdog", {
        method: "POST",
        body: JSON.stringify({ dryRun: false, limit: 200 }),
      }, true);
    } catch (error) {
      console.error("watchdog_failed", error);
    }
    let preflight: Awaited<ReturnType<typeof collectDailyPreflightState>> | null = null;
    try {
      preflight = await collectDailyPreflightState(env);
    } catch (error) {
      console.error("daily_preflight_failed", error);
    }
    let dailyPrintJob: DailyPrintJobState | null = null;
    try {
      dailyPrintJob = await fetchDailyPrintJobState(env, preflight?.date ?? currentDateInTimezone(env.TELEGRAM_TIMEZONE ?? "America/Cuiaba"));
    } catch (error) {
      console.error("daily_print_job_state_failed", error);
    }
    try {
      await sendDailySummary(env, preflight ?? undefined, dailyPrintJob);
    } catch (error) {
      console.error("daily_summary_failed", error);
    }
    try {
      await sendReadyInsertions(env);
    } catch (error) {
      console.error("ready_insertions_failed", error);
    }
    try {
      await sendDailyPrintPhotos(env);
    } catch (error) {
      console.error("daily_photos_failed", error);
    }
  },
};
