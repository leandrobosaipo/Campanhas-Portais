import { snapshot } from "../data/snapshot";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type InsertionItem = (typeof snapshot.insertions)[number];
type InsertionDetail = (typeof snapshot.insertionDetails)[keyof typeof snapshot.insertionDetails];
type CaptureStatus = (typeof snapshot.captureStatuses)[keyof typeof snapshot.captureStatuses];

type JobKind = "print-batch" | "print-backfill" | "print-single" | "sync-planilha" | "analytics-report" | "pi-site-export" | "drive-pi-ingest" | "drive-inventory-refresh" | "drive-pi-reconcile" | "reconcile-adrotate" | "adrotate-link" | "adrotate-publish" | "telegram-send-evidence" | "runtime-readiness-probe";
type JobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed";
const OPS_JOB_KINDS: JobKind[] = ["print-batch", "print-backfill", "print-single", "sync-planilha", "analytics-report", "pi-site-export", "drive-pi-ingest", "drive-inventory-refresh", "drive-pi-reconcile", "reconcile-adrotate", "adrotate-link", "adrotate-publish", "telegram-send-evidence", "runtime-readiness-probe"];

type JobProgress = {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  stageKey: string;
  stageLabel: string;
  percentStage: number;
  percentTotal: number;
  itemsDone: number;
  itemsTotal: number;
  etaSeconds: number | null;
  startedAt: string | null;
  updatedAt: string;
  runnerId: string | null;
  error: string | null;
};

type QueueJobItem = {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: string | null;
  runnerId: string | null;
  scheduledAt: string | null;
};

type QueueOverview = {
  now: QueueJobItem | null;
  queue: QueueJobItem[];
  scheduled: QueueJobItem[];
  totals: {
    running: number;
    queued: number;
    readyForRunner: number;
    completedToday: number;
    failedToday: number;
  };
};

type OpsJobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  payload_json: string;
  result_json: string | null;
  error_text: string | null;
  requested_by: string | null;
  runner_id: string | null;
  created_at: string;
  updated_at: string;
};

type WatchdogSummaryItem = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  ageMinutes: number;
  requestedBy: string | null;
  runnerId: string | null;
};

type JobQueueMessage = {
  jobId: string;
  kind: JobKind;
};

type DrivePiEventType = "created" | "updated" | "folder_created" | "folder_updated";

type DrivePiEventPayload = {
  eventId: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  path: string;
  parentFolderId: string | null;
  modifiedTime: string;
  webViewLink: string | null;
  eventType: DrivePiEventType;
  parsedPi?: unknown;
  simulation?: unknown;
  preflightOnly?: boolean;
  explicitFolder?: boolean;
  resolveMedia?: boolean;
  strictInsertionScope?: boolean;
  allowPdfInsertions?: boolean;
  publish?: boolean;
  generateEvidence?: boolean;
  purgeCache?: boolean;
  source?: string;
};

type Env = {
  OPS_API_TOKEN?: string;
  PRIVATE_ADOPS_API_BASE_URL?: string;
  PRIVATE_ADOPS_API_TOKEN?: string;
  adops_ops: D1Database;
  adops_ops_queue: Queue<JobQueueMessage>;
};

type AnalyticsSiteConfig = {
  propertyKey: string;
  siteSigla: string;
  siteDomain: string;
  reportConfigName: string;
  analyticsSource: "ga4";
  recommendedDimensions: string[];
  recommendedMetrics: string[];
  notes: string[];
};

type AnalyticsRequirements = {
  insertionId: number;
  campaignId: number | null;
  piCodigo: string | null;
  siteSigla: string | null;
  requiresAnalytics: boolean;
  analyticsSource: "ga4" | null;
  propertyKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  recommendedDimensions: string[];
  recommendedMetrics: string[];
  notes: string[];
  periodOptions: Array<{
    mode: "pi" | "full_month" | "custom";
    label: string;
    description: string;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
};

type InsertionContext = {
  id: number;
  campanhaId?: number | null;
  campanhaName?: string | null;
  clienteNome?: string | null;
  agenciaNome?: string | null;
  piCodigo?: string | null;
  siteSigla?: string | null;
  siteNome?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  observacoes?: string | null;
  competencia?: string | null;
};

const ANALYTICS_SITE_CONFIGS: AnalyticsSiteConfig[] = [
  {
    propertyKey: "afolhalivre-ga4",
    siteSigla: "AFL",
    siteDomain: "afolhalivre.com",
    reportConfigName: "afolhalivre",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
  {
    propertyKey: "omatogrossense-ga4",
    siteSigla: "OMT",
    siteDomain: "omatogrossense.com",
    reportConfigName: "omatogrossense",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
  {
    propertyKey: "perrenguemt-ga4",
    siteSigla: "PERRENGUE",
    siteDomain: "perrenguematogrosso.com",
    reportConfigName: "perrenguemt",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
  {
    propertyKey: "portalnortemt-ga4",
    siteSigla: "PNMT",
    siteDomain: "portalnortemt.com",
    reportConfigName: "portalnortemt",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
  {
    propertyKey: "portalpantanalmt-ga4",
    siteSigla: "PPMT",
    siteDomain: "portalpantanalmt.com",
    reportConfigName: "portalpantanalmt",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
  {
    propertyKey: "roonoticias-ga4",
    siteSigla: "ROO",
    siteDomain: "roonoticias.com",
    reportConfigName: "roonoticias",
    analyticsSource: "ga4",
    recommendedDimensions: ["city"],
    recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
    notes: [
      "A automação atual gera o relatório GA4 em modo Cidade.",
      "O período final segue a janela real da inserção/PI.",
    ],
  },
];

const json = (data: Json, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
      ...(init.headers || {}),
    },
  });

const jsonNoStore = (data: Json, init: ResponseInit = {}) =>
  json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });

const DAILY_PRINT_TIME_ZONE = "America/Cuiaba";
const DAILY_PRINT_CAPTURE_WINDOW = {
  start: "18:00",
  endExclusive: "22:00",
  strategy: "deterministic_by_insertion_and_date",
};
const DAILY_PRINT_SOURCE = "cloudflare-cron-daily-print";

function nowIso() {
  return new Date().toISOString();
}

function isCaptureAtInDailyWindow(captureAt: string | null | undefined) {
  const match = String(captureAt ?? "").trim().match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 18 * 60 && minutes < 20 * 60;
}

function badCaptureAtWindow() {
  return badRequest("captureAt deve ficar na janela operacional 18:00-22:00 America/Cuiaba. Omita captureAt para distribuição automática por inserção/dia.");
}

function notFound(message = "Not found") {
  return json({ error: message }, { status: 404 });
}

function unauthorized(message = "Unauthorized") {
  return json({ error: "unauthorized", details: message }, { status: 401 });
}

function requestDebugMeta(request: Request) {
  const clientBuild = request.headers.get("x-adops-client-build")?.trim() ?? "";
  const authState = request.headers.get("x-adops-auth-state")?.trim() ?? "";
  return {
    ...(clientBuild ? { clientBuild } : {}),
    ...(authState ? { authState } : {}),
  };
}

function unauthorizedWithCode(code: string, message: string, meta?: Record<string, unknown>) {
  return json({ error: "unauthorized", code, details: message, ...(meta ?? {}) }, { status: 401 });
}

function badRequest(message: string) {
  return json({ error: "bad_request", details: message }, { status: 400 });
}

function parseJsonSafe(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sanitizeJobText(value: unknown, maxLength = 12000) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\b[A-Za-z0-9._-]+@(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ssh-user-host]")
    .replace(/\[(?:\d{1,3}\.){3}\d{1,3}\]:\d+/g, "[ssh-host-port]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(-maxLength);
}

function sanitizeJobValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeJobText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJobValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJobValue(item)]));
  }
  return value;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveAnalyticsSiteConfig(insertion: InsertionContext, requestedPropertyKey?: string | null) {
  const wanted = requestedPropertyKey?.trim().toLowerCase() ?? "";
  const siteSigla = normalizeText(insertion.siteSigla);
  if (wanted) {
    const byProperty = ANALYTICS_SITE_CONFIGS.find((item) => item.propertyKey === wanted);
    if (byProperty) return byProperty;
  }
  return ANALYTICS_SITE_CONFIGS.find((item) => normalizeText(item.siteSigla) === siteSigla) ?? null;
}

function requiresAnalyticsForInsertion(insertion: InsertionContext) {
  const agency = normalizeText(insertion.agenciaNome);
  const client = normalizeText(insertion.clienteNome);
  const campaign = normalizeText(insertion.campanhaName);
  const notes = normalizeText(insertion.observacoes);
  const pi = normalizeText(insertion.piCodigo);
  return (
    agency.includes("genius") ||
    (agency.includes("renca") && (client.includes("secom") || campaign.includes("secom") || notes.includes("secom"))) ||
    /\banalytics\b|\bgoogle analytics\b|\bga4\b/.test(`${notes} ${campaign} ${pi}`)
  );
}

function parseIsoDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00-04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseCompetenciaMonth(value: string | null | undefined) {
  const normalized = normalizeText(value).toUpperCase();
  const match = normalized.match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})\b/);
  if (!match) return null;
  const months: Record<string, number> = {
    JANEIRO: 0,
    FEVEREIRO: 1,
    MARCO: 2,
    ABRIL: 3,
    MAIO: 4,
    JUNHO: 5,
    JULHO: 6,
    AGOSTO: 7,
    SETEMBRO: 8,
    OUTUBRO: 9,
    NOVEMBRO: 10,
    DEZEMBRO: 11,
  };
  const month = months[match[1] ?? ""] ?? null;
  const year = Number.parseInt(match[2] ?? "", 10);
  if (month === null || !Number.isFinite(year)) return null;
  return { year, month };
}

function resolveAnalyticsMonthWindow(insertion: InsertionContext) {
  const competenciaMonth = parseCompetenciaMonth(insertion.competencia);
  const base = competenciaMonth
    ? new Date(competenciaMonth.year, competenciaMonth.month, 1)
    : parseIsoDate(insertion.periodoInicio);
  if (!base) return { periodStart: insertion.periodoInicio ?? null, periodEnd: insertion.periodoFim ?? null };
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const today = parseIsoDate(todayInCuiaba());
  const resolvedMonthEnd = today && monthEnd > today ? today : monthEnd;
  return {
    periodStart: formatIsoDate(monthStart),
    periodEnd: formatIsoDate(resolvedMonthEnd),
  };
}

function resolveAnalyticsPeriod(
  insertion: InsertionContext,
  mode: "pi" | "full_month" | "custom",
  customStart?: string | null,
  customEnd?: string | null,
) {
  if (mode === "custom") {
    return {
      periodStart: customStart ?? null,
      periodEnd: customEnd ?? null,
    };
  }
  if (mode === "full_month") {
    return resolveAnalyticsMonthWindow(insertion);
  }
  return {
    periodStart: insertion.periodoInicio ?? null,
    periodEnd: insertion.periodoFim ?? null,
  };
}

function buildAnalyticsRequirements(insertion: InsertionContext, siteConfig: AnalyticsSiteConfig | null): AnalyticsRequirements {
  const requiresAnalytics = requiresAnalyticsForInsertion(insertion);
  const piPeriod = resolveAnalyticsPeriod(insertion, "pi");
  const monthPeriod = resolveAnalyticsPeriod(insertion, "full_month");
  return {
    insertionId: insertion.id,
    campaignId: insertion.campanhaId ?? null,
    piCodigo: insertion.piCodigo ?? null,
    siteSigla: insertion.siteSigla ?? null,
    requiresAnalytics,
    analyticsSource: siteConfig?.analyticsSource ?? null,
    propertyKey: siteConfig?.propertyKey ?? null,
    periodStart: piPeriod.periodStart,
    periodEnd: piPeriod.periodEnd,
    recommendedDimensions: siteConfig?.recommendedDimensions ?? [],
    recommendedMetrics: siteConfig?.recommendedMetrics ?? [],
    notes: [
      ...(requiresAnalytics
        ? ["A inserção bate em uma regra operacional que pede apoio de Analytics."]
        : ["A regra operacional não marcou Analytics como obrigatório, mas a integração pode ser solicitada se o site suportar GA4."]),
      ...(siteConfig?.notes ?? []),
    ],
    periodOptions: [
      {
        mode: "pi",
        label: "Período da PI",
        description: "Usa exatamente a janela da inserção/PI.",
        periodStart: piPeriod.periodStart,
        periodEnd: piPeriod.periodEnd,
      },
      {
        mode: "full_month",
        label: "Mês completo",
        description: "Usa o mês da competência inteira; se a competência atual ainda estiver em andamento, fecha até hoje.",
        periodStart: monthPeriod.periodStart,
        periodEnd: monthPeriod.periodEnd,
      },
      {
        mode: "custom",
        label: "Período customizado",
        description: "Permite escolher manualmente o início e o fim do relatório.",
        periodStart: null,
        periodEnd: null,
      },
    ],
  };
}

async function fetchPrivateApiJson<T>(env: Env, pathname: string): Promise<T | null> {
  const base = env.PRIVATE_ADOPS_API_BASE_URL?.trim();
  if (!base) return null;
  const response = await fetch(`${base.replace(/\/$/, "")}${pathname}`, {
    method: "GET",
    headers: {
      "x-adops-api-token": env.PRIVATE_ADOPS_API_TOKEN?.trim() ?? "",
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function describeJob(record: OpsJobRecord) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    payload: sanitizeJobValue(parseJsonSafe(record.payload_json)),
    result: sanitizeJobValue(parseJsonSafe(record.result_json)),
    error: sanitizeJobText(record.error_text),
    requestedBy: record.requested_by,
    runnerId: record.runner_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

const JOB_STAGE_LABELS: Record<JobKind, Record<string, string>> = {
  "print-single": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Capturando print",
    capture_started: "Captura iniciada",
    navigation: "Abrindo portal",
    lazy_load: "Ativando mídias visíveis",
    critical_assets: "Aguardando conteúdo crítico",
    layout_stability: "Confirmando estabilidade da página",
    visual_preflight: "Validando frame candidato",
    final_png_validation: "Validando PNG final",
    audit: "Executando checklist",
    upload_started: "Publicando evidência",
    completed: "Print concluído",
    failed: "Falha no print",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "print-backfill": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Executando retroativo",
    collecting: "Levantando pendências",
    processing: "Gerando prints pendentes",
    critical_assets: "Aguardando conteúdo crítico",
    final_png_validation: "Validando PNG final",
    completed: "Retroativo concluído",
    failed: "Falha no retroativo",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "print-batch": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Processando lote",
    collecting: "Levantando inserções",
    processing: "Capturando prints",
    completed: "Lote concluído",
    failed: "Falha no lote",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "sync-planilha": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Sincronizando planilha",
    fetch_started: "Lendo planilha",
    applying_updates: "Aplicando ajustes",
    completed: "Sincronização concluída",
    failed: "Falha na sincronização",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "analytics-report": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Gerando relatório",
    fetch_started: "Coletando métricas",
    rendering: "Montando relatório",
    upload_started: "Publicando arquivo",
    completed: "Relatório concluído",
    failed: "Falha no relatório",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "pi-site-export": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Gerando pacote PI/site",
    preparing: "Preparando dados",
    compiling: "Montando pacote",
    upload_started: "Publicando pacote",
    completed: "Pacote concluído",
    failed: "Falha no pacote PI/site",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "drive-pi-ingest": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    queue_received: "Fila recebida",
    running: "Processando PI do Drive",
    received: "Evento recebido",
    intake_locked: "Intake travado",
    packaging: "Montando pacote da PI",
    agent_analysis: "Analisando PI com IA",
    parsing: "Lendo PI",
    compressing_video: "Comprimindo vídeo",
    uploading_video: "Subindo vídeo",
    validated: "PI validada",
    applying: "Aplicando no AdOps",
    syncing: "Sincronizando planilha",
    reconciling: "Conferindo AdRotate",
    needs_review: "Precisa de revisão",
    completed: "PI processada",
    failed: "Falha no processamento da PI",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "drive-inventory-refresh": {
    queued: "Na fila",
    ready_for_runner: "Aguardando monitor do Drive",
    running: "Atualizando inventário do Drive",
    completed: "Inventário do Drive atualizado",
    failed: "Falha ao atualizar inventário do Drive",
  },
  "reconcile-adrotate": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Conferindo planilha e AdRotate",
    completed: "Reconciliação concluída",
    failed: "Falha na reconciliação",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "adrotate-link": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Vinculando anúncio AdRotate",
    completed: "Vínculo AdRotate concluído",
    failed: "Falha no vínculo AdRotate",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "adrotate-publish": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Publicando anúncio AdRotate",
    resolving_contract: "Resolvendo checklist",
    publishing: "Criando ou atualizando anúncio",
    purging_cache: "Limpando cache do portal",
    generating_evidence: "Gerando evidência",
    completed: "Publicação AdRotate concluída",
    failed: "Falha na publicação AdRotate",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "telegram-send-evidence": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Enviando evidência no Telegram",
    completed: "Evidência enviada",
    failed: "Falha no envio Telegram",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
  "runtime-readiness-probe": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Conferindo prontidão do runner",
    completed: "Prontidão do runner conferida",
    failed: "Falha na prontidão do runner",
    queue_dispatch_failed: "Falha ao despachar fila",
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(candidates: unknown[], keys: string[]): string | null {
  for (const candidate of candidates) {
    const item = asRecord(candidate);
    if (!item) continue;
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function readNumber(candidates: unknown[], keys: string[]): number | null {
  for (const candidate of candidates) {
    const item = asRecord(candidate);
    if (!item) continue;
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function titleFromStageKey(stageKey: string) {
  return stageKey
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackStageByStatus(status: JobStatus) {
  if (status === "ready_for_runner") return "ready_for_runner";
  return status;
}

function fallbackPercentByStatus(status: JobStatus) {
  if (status === "queued") return 0;
  if (status === "ready_for_runner") return 5;
  if (status === "running") return 50;
  return 100;
}

function resolveStageLabel(kind: JobKind, stageKey: string, status: JobStatus) {
  const byKind = JOB_STAGE_LABELS[kind] ?? {};
  const fromStage = byKind[stageKey];
  if (fromStage) return fromStage;
  const fromStatus = byKind[status];
  if (fromStatus) return fromStatus;
  return titleFromStageKey(stageKey);
}

function computeJobProgress(job: ReturnType<typeof describeJob>): JobProgress {
  const result = asRecord(job.result);
  const execution = asRecord(result?.execution);
  const progress = asRecord(result?.progress) ?? asRecord(execution?.progress);
  const candidates: unknown[] = [progress, execution, result];

  const stageFromResult = readString(candidates, ["stageKey", "stage", "currentStage", "step", "current_step"]);
  const stageKey = stageFromResult ?? fallbackStageByStatus(job.status);
  const itemsDoneRaw = readNumber(candidates, ["itemsDone", "done", "processed", "completedItems", "countDone"]);
  const itemsTotalRaw = readNumber(candidates, ["itemsTotal", "total", "totalItems", "countTotal"]);
  const itemsDone = Math.max(0, Math.round(itemsDoneRaw ?? 0));
  const itemsTotal = Math.max(0, Math.round(itemsTotalRaw ?? 0));

  let percentTotalRaw = readNumber(candidates, ["percentTotal", "totalPercent", "progress", "overallPercent", "percentage"]);
  let percentStageRaw = readNumber(candidates, ["percentStage", "stagePercent", "stepPercent", "currentPercent"]);

  if (percentTotalRaw === null && itemsTotal > 0) {
    percentTotalRaw = (itemsDone / itemsTotal) * 100;
  }
  if (percentTotalRaw === null) {
    percentTotalRaw = fallbackPercentByStatus(job.status);
  }
  if (percentStageRaw === null) {
    percentStageRaw = percentTotalRaw;
  }

  const startedAt = readString(candidates, ["startedAt", "started_at", "started"]) ?? (job.status === "queued" ? null : job.createdAt);
  const etaSeconds = readNumber(candidates, ["etaSeconds", "eta", "eta_seconds", "remainingSeconds", "estimatedRemainingSeconds"]);
  const runnerId = readString(candidates, ["runnerId", "runner_id"]) ?? job.runnerId ?? null;
  const error = job.error ?? readString(candidates, ["error", "errorText", "message"]);

  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    stageKey,
    stageLabel: resolveStageLabel(job.kind, stageKey, job.status),
    percentStage: clampPercent(percentStageRaw),
    percentTotal: clampPercent(percentTotalRaw),
    itemsDone,
    itemsTotal,
    etaSeconds: etaSeconds === null ? null : Math.max(0, Math.round(etaSeconds)),
    startedAt,
    updatedAt: job.updatedAt,
    runnerId,
    error,
  };
}

function parseScheduledAt(payload: unknown) {
  const payloadRecord = asRecord(payload);
  const scheduledAt = typeof payloadRecord?.scheduledAt === "string" ? payloadRecord.scheduledAt : null;
  if (!scheduledAt) return null;
  return Number.isNaN(Date.parse(scheduledAt)) ? null : scheduledAt;
}

function toQueueItem(job: ReturnType<typeof describeJob>): QueueJobItem {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    requestedBy: job.requestedBy ?? null,
    runnerId: job.runnerId ?? null,
    scheduledAt: parseScheduledAt(job.payload),
  };
}

async function getQueueOverview(env: Env): Promise<QueueOverview> {
  const { results } = await env.adops_ops
    .prepare(`SELECT * FROM ops_jobs WHERE status IN ('running','queued','ready_for_runner') ORDER BY created_at ASC`)
    .all<OpsJobRecord>();
  const described = (results ?? []).map(describeJob);
  const running = described.filter((job) => job.status === "running").map(toQueueItem);
  const queue = described.filter((job) => job.status === "queued" || job.status === "ready_for_runner").map(toQueueItem);
  const nowMs = Date.now();
  const scheduled = queue.filter((job) => {
    if (!job.scheduledAt) return false;
    const parsed = Date.parse(job.scheduledAt);
    return !Number.isNaN(parsed) && parsed > nowMs;
  });

  const totalsRaw = await env.adops_ops
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'ready_for_runner' THEN 1 ELSE 0 END) AS ready_for_runner,
         SUM(CASE WHEN status = 'completed' AND date(updated_at, '-04:00') = date('now', '-04:00') THEN 1 ELSE 0 END) AS completed_today,
         SUM(CASE WHEN status = 'failed' AND date(updated_at, '-04:00') = date('now', '-04:00') THEN 1 ELSE 0 END) AS failed_today
       FROM ops_jobs`,
    )
    .first<Record<string, unknown>>();

  const totals = {
    running: Number(totalsRaw?.running ?? 0) || 0,
    queued: Number(totalsRaw?.queued ?? 0) || 0,
    readyForRunner: Number(totalsRaw?.ready_for_runner ?? 0) || 0,
    completedToday: Number(totalsRaw?.completed_today ?? 0) || 0,
    failedToday: Number(totalsRaw?.failed_today ?? 0) || 0,
  };

  return {
    now: running.at(0) ?? null,
    queue,
    scheduled,
    totals,
  };
}

function notSupported(message: string) {
  return json(
    {
      error: "not_supported_in_cloudflare_readonly",
      details: message,
      mode: "cloudflare-public-readonly",
    },
    { status: 501 },
  );
}

function privateApiEnabled(env: Env) {
  return Boolean(env.PRIVATE_ADOPS_API_BASE_URL?.trim());
}

async function proxyToPrivateApi(request: Request, env: Env, url: URL, options: { noStore?: boolean } = {}) {
  const base = env.PRIVATE_ADOPS_API_BASE_URL?.trim();
  if (!base) {
    return json({ error: "private_api_unavailable", details: "PRIVATE_ADOPS_API_BASE_URL não configurado no Worker." }, { status: 503 });
  }

  const target = `${base.replace(/\/$/, "")}${url.pathname}${url.search}`;
  const method = request.method.toUpperCase();
  const headers = new Headers();
  headers.set("x-adops-api-token", env.PRIVATE_ADOPS_API_TOKEN?.trim() ?? "");
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = { method, headers };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = await request.clone().text();
  }

  const response = await fetch(target, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  responseHeaders.set("access-control-allow-headers", "content-type,authorization,x-adops-api-token,x-adops-client-build,x-adops-auth-state");
  if (options.noStore) {
    responseHeaders.set("cache-control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

function parseIntParam(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function getJobAgeMs(record: OpsJobRecord, nowMs = Date.now()) {
  const updated = parseDateMs(record.updated_at);
  const created = parseDateMs(record.created_at);
  const base = updated ?? created ?? nowMs;
  return Math.max(0, nowMs - base);
}

function getJobTimeoutMs(kind: JobKind, status: JobStatus) {
  const longRunning = kind === "analytics-report" || kind === "pi-site-export" || kind === "drive-pi-ingest" || kind === "adrotate-publish";
  if (status === "queued") {
    return longRunning ? 30 * 60_000 : 15 * 60_000;
  }
  if (status === "ready_for_runner") {
    return longRunning ? 30 * 60_000 : 15 * 60_000;
  }
  if (status === "running") {
    return longRunning ? 120 * 60_000 : 30 * 60_000;
  }
  return Number.POSITIVE_INFINITY;
}

function buildWatchdogFailure(record: OpsJobRecord, detectedAt: string) {
  const ageMinutes = Math.round(getJobAgeMs(record) / 60_000);
  const message = `Watchdog marcou falha automática: ${record.status} excedeu o tempo limite de ${record.kind}.`;
  return {
    error: message,
    result: {
      ok: false,
      watchdog: true,
      previousStatus: record.status,
      detectedAt,
      ageMinutes,
      timeoutMinutes: Math.round(getJobTimeoutMs(record.kind, record.status) / 60_000),
      note: "Job antigo demais para continuar como ativo. Reenvie a operação se ainda for necessária.",
    },
  };
}

function isSettingsProxyPath(path: string) {
  return (
    path === "/api/capture-rules" ||
    path === "/api/capture-rules/bootstrap-status" ||
    path === "/api/capture-rules/import-legacy" ||
    path === "/api/capture-rules/presets" ||
    path === "/api/capture-rules/perf/health" ||
    path === "/api/capture-rules/validate-batch" ||
    /^\/api\/capture-rules\/\d+$/.test(path) ||
    /^\/api\/capture-rules\/\d+\/validate$/.test(path) ||
    /^\/api\/capture-rules\/\d+\/publish$/.test(path) ||
    /^\/api\/capture-rules\/\d+\/rollback$/.test(path) ||
    /^\/api\/capture-rules\/\d+\/versions$/.test(path) ||
    /^\/api\/capture-rules\/\d+\/validations$/.test(path) ||
    path === "/api/capture-rules/runtime" ||
    path === "/api/clients" ||
    path === "/api/agencies" ||
    path === "/api/sites" ||
    /^\/api\/clients\/\d+$/.test(path) ||
    /^\/api\/agencies\/\d+$/.test(path) ||
    /^\/api\/sites\/\d+$/.test(path)
  );
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isMissingBearerTokenValue(value: string | null) {
  if (!value) return true;
  const normalized = value.trim();
  return normalized === "" || normalized === '""' || normalized === "''";
}

function requireOpsAuth(request: Request, env: Env) {
  const expected = env.OPS_API_TOKEN?.trim();
  const debugMeta = requestDebugMeta(request);
  const logUnauthorized = (code: string, message: string) => {
    console.warn(
      JSON.stringify({
        event: "protected_auth_denied",
        code,
        message,
        method: request.method,
        path: new URL(request.url).pathname,
        ...debugMeta,
      }),
    );
  };
  if (!expected) {
    logUnauthorized("ops_api_token_not_configured", "OPS_API_TOKEN não configurado no Worker.");
    return {
      ok: false as const,
      response: unauthorizedWithCode("ops_api_token_not_configured", "OPS_API_TOKEN não configurado no Worker.", debugMeta),
    };
  }
  const rawHeader = request.headers.get("authorization") ?? "";
  const actual = bearerToken(request);
  if (!rawHeader.trim()) {
    logUnauthorized("missing_operator_token", "Informe o token do operador nesta sessão antes de executar ações operacionais.");
    return {
      ok: false as const,
      response: unauthorizedWithCode("missing_operator_token", "Informe o token do operador nesta sessão antes de executar ações operacionais.", debugMeta),
    };
  }
  if (isMissingBearerTokenValue(actual)) {
    logUnauthorized("missing_operator_token", "O header Authorization chegou vazio. Recarregue a sessão e cole novamente o token do operador.");
    return {
      ok: false as const,
      response: unauthorizedWithCode("missing_operator_token", "O header Authorization chegou vazio. Recarregue a sessão e cole novamente o token do operador.", debugMeta),
    };
  }
  if (actual !== expected) {
    logUnauthorized("invalid_operator_token", "O token do operador é inválido para esta ação operacional.");
    return {
      ok: false as const,
      response: unauthorizedWithCode("invalid_operator_token", "O token do operador é inválido para esta ação operacional.", debugMeta),
    };
  }
  return { ok: true as const };
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function parseDriveFolderId(value: unknown) {
  const raw = readOptionalString(value);
  if (!raw) return null;
  const folderUrlMatch = raw.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folderUrlMatch?.[1]) return folderUrlMatch[1];
  const queryIdMatch = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (queryIdMatch?.[1]) return queryIdMatch[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(raw) ? raw : null;
}

function parseIsoDateString(value: unknown) {
  const raw = readOptionalString(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function validateDrivePiEvent(body: Record<string, unknown>): { ok: true; event: DrivePiEventPayload } | { ok: false; response: Response } {
  const driveFileId = readOptionalString(body.driveFileId);
  const name = readOptionalString(body.name);
  const mimeType = readOptionalString(body.mimeType);
  const path = readOptionalString(body.path);
  const modifiedTime = readOptionalString(body.modifiedTime);
  const eventTypeRaw = readOptionalString(body.eventType);
  const allowedEventTypes: DrivePiEventType[] = ["created", "updated", "folder_created", "folder_updated"];
  const eventType = allowedEventTypes.includes(eventTypeRaw as DrivePiEventType) ? eventTypeRaw as DrivePiEventType : null;

  if (!driveFileId) return { ok: false, response: badRequest("driveFileId é obrigatório.") };
  if (!name) return { ok: false, response: badRequest("name é obrigatório.") };
  if (!mimeType) return { ok: false, response: badRequest("mimeType é obrigatório.") };
  if (!path) return { ok: false, response: badRequest("path é obrigatório.") };
  if (!modifiedTime || Number.isNaN(Date.parse(modifiedTime))) return { ok: false, response: badRequest("modifiedTime ISO é obrigatório.") };
  if (!eventType) return { ok: false, response: badRequest("eventType inválido.") };

  const eventId = readOptionalString(body.eventId) ?? `drive:${driveFileId}:${modifiedTime}`;
  if (!/^drive:[A-Za-z0-9_-]+:.+/.test(eventId)) return { ok: false, response: badRequest("eventId inválido.") };

  return {
    ok: true,
    event: {
      eventId,
      driveFileId,
      name,
      mimeType,
      path,
      parentFolderId: readOptionalString(body.parentFolderId),
      modifiedTime,
      webViewLink: readOptionalString(body.webViewLink),
      eventType,
      ...(body.parsedPi !== undefined ? { parsedPi: body.parsedPi } : {}),
      ...(body.simulation !== undefined ? { simulation: body.simulation } : {}),
      ...(body.preflightOnly === true ? { preflightOnly: true } : {}),
      ...(body.explicitFolder === true ? { explicitFolder: true } : {}),
      ...(typeof body.resolveMedia === "boolean" ? { resolveMedia: body.resolveMedia } : {}),
      ...(typeof body.strictInsertionScope === "boolean" ? { strictInsertionScope: body.strictInsertionScope } : {}),
      ...(typeof body.allowPdfInsertions === "boolean" ? { allowPdfInsertions: body.allowPdfInsertions } : {}),
      ...(typeof body.publish === "boolean" ? { publish: body.publish } : {}),
      ...(typeof body.generateEvidence === "boolean" ? { generateEvidence: body.generateEvidence } : {}),
      ...(typeof body.purgeCache === "boolean" ? { purgeCache: body.purgeCache } : {}),
      ...(readOptionalString(body.source) ? { source: readOptionalString(body.source) as string } : {}),
    },
  };
}

async function createOpsJob(env: Env, kind: JobKind, payload: Record<string, unknown>, requestedBy: string | null) {
  const id = crypto.randomUUID();
  const now = nowIso();
  await env.adops_ops
    .prepare(
      `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, NULL, NULL, ?, NULL, ?, ?)`,
    )
    .bind(id, kind, JSON.stringify(payload), requestedBy, now, now)
    .run();
  try {
    await env.adops_ops_queue.send({ jobId: id, kind });
  } catch (error) {
    const queueError = error instanceof Error ? error.message : String(error);
    console.error("[ops_jobs] queue dispatch failed", { id, kind, queueError });
    await env.adops_ops
      .prepare(`UPDATE ops_jobs SET status = 'ready_for_runner', result_json = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify({ stage: "queue_dispatch_failed", queueError }), nowIso(), id)
      .run();
  }
  return id;
}

async function createIdempotentOpsJob(
  env: Env,
  kind: JobKind,
  payload: Record<string, unknown>,
  requestedBy: string | null,
  idempotencyKey: string,
) {
  const existing = await env.adops_ops
    .prepare(
      `SELECT id, status FROM ops_jobs
       WHERE kind = ? AND json_extract(payload_json, '$.idempotencyKey') = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(kind, idempotencyKey)
    .first<{ id: string; status: JobStatus }>();
  if (existing) {
    return { jobId: existing.id, status: existing.status, duplicate: true };
  }
  const jobId = await createOpsJob(env, kind, { ...payload, idempotencyKey }, requestedBy);
  return { jobId, status: "queued" as JobStatus, duplicate: false };
}

async function createDrivePiEventJob(env: Env, event: DrivePiEventPayload, requestedBy: string | null) {
  const existing = await env.adops_ops
    .prepare(`SELECT event_id, job_id, status FROM cod5_drive_events WHERE event_id = ? LIMIT 1`)
    .bind(event.eventId)
    .first<{ event_id: string; job_id: string | null; status: string }>();
  if (existing) {
    return {
      duplicate: true,
      eventId: existing.event_id,
      jobId: existing.job_id,
      status: existing.status,
      documentId: null,
    };
  }

  const documentId = crypto.randomUUID();
  const now = nowIso();
  const jobId = await createOpsJob(env, "drive-pi-ingest", {
    ...event,
    documentId,
    source: event.source ?? "google-drive-monitor",
  }, requestedBy);

  await env.adops_ops
    .prepare(
      `INSERT INTO cod5_drive_events
        (event_id, drive_file_id, name, mime_type, path, parent_folder_id, modified_time, web_view_link, event_type, payload_json, job_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    )
    .bind(
      event.eventId,
      event.driveFileId,
      event.name,
      event.mimeType,
      event.path,
      event.parentFolderId,
      event.modifiedTime,
      event.webViewLink,
      event.eventType,
      JSON.stringify(event),
      jobId,
      now,
      now,
    )
    .run();

  await env.adops_ops
    .prepare(
      `INSERT INTO cod5_inbound_documents
        (id, source, event_id, drive_file_id, original_name, mime_type, path, web_view_link, content_sha256, status, created_at, updated_at)
       VALUES (?, 'google-drive', ?, ?, ?, ?, ?, ?, NULL, 'queued', ?, ?)`,
    )
    .bind(documentId, event.eventId, event.driveFileId, event.name, event.mimeType, event.path, event.webViewLink, now, now)
    .run();

  return { duplicate: false, eventId: event.eventId, jobId, status: "queued", documentId };
}

async function updateDrivePiEventState(env: Env, body: Record<string, unknown>) {
  const eventId = readOptionalString(body.eventId);
  const documentId = readOptionalString(body.documentId);
  const status = readOptionalString(body.status);
  const allowedStatuses = ["received", "queued", "intake_locked", "packaging", "agent_analysis", "parsed", "validated", "applying", "applied", "needs_review", "failed"];
  if (!eventId) return badRequest("eventId é obrigatório.");
  if (!status || !allowedStatuses.includes(status)) return badRequest("status inválido.");

  const now = nowIso();
  await env.adops_ops
    .prepare(`UPDATE cod5_drive_events SET status = ?, updated_at = ? WHERE event_id = ?`)
    .bind(status, now, eventId)
    .run();
  if (documentId) {
    await env.adops_ops
      .prepare(`UPDATE cod5_inbound_documents SET status = ?, content_sha256 = COALESCE(?, content_sha256), updated_at = ? WHERE id = ?`)
      .bind(status, readOptionalString(body.contentSha256), now, documentId)
      .run();
  }

  const parseRun = asRecord(body.parseRun);
  if (documentId && parseRun) {
    await env.adops_ops
      .prepare(
        `INSERT INTO cod5_document_parse_runs
          (id, document_id, status, fields_json, alerts_json, raw_text_excerpt, error_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        documentId,
        status,
        JSON.stringify(parseRun.fields ?? null),
        JSON.stringify(parseRun.alerts ?? []),
        readOptionalString(parseRun.rawTextExcerpt),
        readOptionalString(parseRun.error),
        now,
        now,
      )
      .run();
  }

  return jsonNoStore({ ok: true, eventId, documentId: documentId ?? null, status });
}

async function listOpsJobsByFilter(
  env: Env,
  {
    limit = 20,
    statuses,
    kinds,
    olderThanMinutes,
  }: {
    limit?: number;
    statuses?: JobStatus[] | null;
    kinds?: JobKind[] | null;
    olderThanMinutes?: number | null;
  },
) {
  const where: string[] = [];
  const binds: Array<string | number> = [];

  if (statuses?.length) {
    where.push(`status IN (${statuses.map(() => "?").join(",")})`);
    binds.push(...statuses);
  }
  if (kinds?.length) {
    where.push(`kind IN (${kinds.map(() => "?").join(",")})`);
    binds.push(...kinds);
  }

  const sql = [
    "SELECT * FROM ops_jobs",
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    "ORDER BY created_at DESC LIMIT ?",
  ].filter(Boolean).join(" ");

  binds.push(Math.min(limit, 200));
  const { results } = await env.adops_ops.prepare(sql).bind(...binds).all<OpsJobRecord>();
  const items = (results ?? []);
  if (!olderThanMinutes || olderThanMinutes <= 0) {
    return items.map(describeJob);
  }
  const thresholdMs = olderThanMinutes * 60_000;
  return items
    .filter((record) => getJobAgeMs(record) >= thresholdMs)
    .map(describeJob);
}

async function runOpsJobWatchdog(env: Env, options: { dryRun?: boolean; limit?: number } = {}) {
  const dryRun = Boolean(options.dryRun);
  const limit = Math.min(options.limit ?? 200, 500);
  const statuses: JobStatus[] = ["queued", "ready_for_runner", "running"];
  const { results } = await env.adops_ops
    .prepare(`SELECT * FROM ops_jobs WHERE status IN ('queued','ready_for_runner','running') ORDER BY created_at ASC LIMIT ?`)
    .bind(limit)
    .all<OpsJobRecord>();

  const now = nowIso();
  const stale = (results ?? []).filter((record) => getJobAgeMs(record) >= getJobTimeoutMs(record.kind, record.status));
  const staleItems: WatchdogSummaryItem[] = stale.map((record) => ({
    id: record.id,
    kind: record.kind,
    status: record.status,
    ageMinutes: Math.round(getJobAgeMs(record) / 60_000),
    requestedBy: record.requested_by,
    runnerId: record.runner_id,
  }));

  if (dryRun || !stale.length) {
    return {
      ok: true,
      dryRun,
      checked: (results ?? []).length,
      staleCount: stale.length,
      failedCount: 0,
      stale: staleItems,
    };
  }

  for (const record of stale) {
    const failure = buildWatchdogFailure(record, now);
    await updateOpsJob(env, record.id, {
      status: "failed",
      error: failure.error,
      result: failure.result,
      runnerId: record.runner_id,
    });
  }

  return {
    ok: true,
    dryRun,
    checked: (results ?? []).length,
    staleCount: stale.length,
    failedCount: stale.length,
    stale: staleItems,
  };
}

async function listAnalyticsJobsForInsertion(env: Env, insertionId: number, limit = 20) {
  const { results } = await env.adops_ops
    .prepare(
      `SELECT * FROM ops_jobs
       WHERE kind = 'analytics-report'
         AND CAST(json_extract(payload_json, '$.insertionId') AS INTEGER) = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(insertionId, Math.min(limit, 100))
    .all<OpsJobRecord>();
  return (results ?? []).map(describeJob);
}

async function getAnalyticsJob(env: Env, id: string) {
  const item = await env.adops_ops
    .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'analytics-report' LIMIT 1`)
    .bind(id)
    .first<OpsJobRecord>();
  return item ? describeJob(item) : null;
}

async function getPiSiteExportJob(env: Env, id: string) {
  const item = await env.adops_ops
    .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'pi-site-export' LIMIT 1`)
    .bind(id)
    .first<OpsJobRecord>();
  return item ? describeJob(item) : null;
}

function piSiteExportJobFromOpsJob(job: ReturnType<typeof describeJob>) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const result = (job.result ?? {}) as Record<string, unknown>;
  const execution = ((result.execution ?? result) || {}) as Record<string, unknown>;
  return {
    id: job.id,
    kind: "pi-site-export",
    status: job.status,
    stage: typeof execution.stage === "string" ? execution.stage : typeof result.stage === "string" ? result.stage : null,
    piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
    siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
    mode: typeof execution.mode === "string"
      ? execution.mode
      : typeof payload.mode === "string"
        ? payload.mode
        : "full",
    variant: typeof execution.variant === "string"
      ? execution.variant
      : typeof payload.variant === "string"
        ? payload.variant
        : "original",
    pdfMaxWidth: typeof execution.pdfMaxWidth === "number" ? execution.pdfMaxWidth : payload.pdfMaxWidth ?? null,
    pdfQuality: typeof execution.pdfQuality === "number" ? execution.pdfQuality : payload.pdfQuality ?? null,
    pdfResolution: typeof execution.pdfResolution === "number" ? execution.pdfResolution : payload.pdfResolution ?? null,
    insertionIds: Array.isArray(execution.insertionIds)
      ? execution.insertionIds
      : Array.isArray(payload.insertionIds)
        ? payload.insertionIds
        : [],
    invalidatedEvidenceIds: Array.isArray(execution.invalidatedEvidenceIds) ? execution.invalidatedEvidenceIds : [],
    regeneratedDates: Array.isArray(execution.regeneratedDates) ? execution.regeneratedDates : [],
    analyticsPiStatus: execution.analyticsPiStatus ?? null,
    analyticsFullMonthStatus: execution.analyticsFullMonthStatus ?? null,
    downloadUrl: typeof execution.downloadUrl === "string" ? execution.downloadUrl : null,
    error: job.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
  };
}

async function deleteAnalyticsJob(env: Env, id: string) {
  const existing = await env.adops_ops
    .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'analytics-report' LIMIT 1`)
    .bind(id)
    .first<OpsJobRecord>();
  if (!existing) return false;
  await env.adops_ops
    .prepare(`DELETE FROM ops_jobs WHERE id = ? AND kind = 'analytics-report'`)
    .bind(id)
    .run();
  return true;
}

function reportFromAnalyticsJob(job: ReturnType<typeof describeJob>) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const result = (job.result ?? {}) as Record<string, unknown>;
  const execution = ((result.execution ?? result) || {}) as Record<string, unknown>;
  const downloadUrl = typeof execution.downloadUrl === "string" ? execution.downloadUrl : null;
  const previewUrl = typeof execution.previewUrl === "string" ? execution.previewUrl : downloadUrl;
  let fileName: string | null = typeof execution.fileName === "string" ? execution.fileName : null;
  if (downloadUrl) {
    try {
      const pathname = new URL(downloadUrl).pathname;
      const parts = pathname.split("/").filter(Boolean);
      fileName = fileName || parts.at(-1) || null;
    } catch {
      fileName = fileName || null;
    }
  }
  return {
    id: job.id,
    kind: "ga4",
    propertyKey: typeof payload.propertyKey === "string" ? payload.propertyKey : null,
    campaignName: typeof payload.campaignName === "string" ? payload.campaignName : null,
    clientName: typeof payload.clientName === "string" ? payload.clientName : null,
    piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
    periodStart: typeof payload.periodStart === "string" ? payload.periodStart : null,
    periodEnd: typeof payload.periodEnd === "string" ? payload.periodEnd : null,
    periodMode: typeof payload.periodMode === "string" ? payload.periodMode : "pi",
    dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
    metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
    status: job.status,
    downloadUrl,
    previewUrl,
    fileName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function isAnalyticsRoute(path: string) {
  return (
    /^\/api\/analytics\/insertions\/\d+\/requirements$/.test(path) ||
    /^\/api\/analytics\/insertions\/\d+\/reports$/.test(path) ||
    /^\/api\/analytics\/jobs\/[^/]+$/.test(path) ||
    /^\/api\/analytics\/reports\/[^/]+\/download$/.test(path) ||
    /^\/api\/analytics\/reports\/[^/]+$/.test(path) ||
    path === "/api/analytics/jobs/request-report"
  );
}

async function getInsertionContext(env: Env, insertionId: number): Promise<InsertionContext | null> {
  const privateItem = await fetchPrivateApiJson<InsertionContext>(env, `/api/insertions/${insertionId}`);
  if (privateItem) return privateItem;
  const item = snapshot.insertionDetails[String(insertionId) as keyof typeof snapshot.insertionDetails] as InsertionContext | undefined;
  return item ?? null;
}

async function updateOpsJob(env: Env, id: string, patch: { status?: JobStatus; result?: unknown; error?: string | null; runnerId?: string | null }) {
  const current = await env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first<OpsJobRecord>();
  if (!current) return null;
  const status = patch.status ?? current.status;
  const resultJson = patch.result === undefined ? current.result_json : JSON.stringify(patch.result);
  const errorText = patch.error === undefined ? current.error_text : patch.error;
  const runnerId = patch.runnerId === undefined ? current.runner_id : patch.runnerId;
  const updatedAt = nowIso();
  await env.adops_ops
    .prepare(`UPDATE ops_jobs SET status = ?, result_json = ?, error_text = ?, runner_id = ?, updated_at = ? WHERE id = ?`)
    .bind(status, resultJson, errorText, runnerId, updatedAt, id)
    .run();
  return env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first<OpsJobRecord>();
}

async function listOpsJobs(env: Env, limit = 20) {
  const { results } = await env.adops_ops.prepare(`SELECT * FROM ops_jobs ORDER BY created_at DESC LIMIT ?`).bind(limit).all<OpsJobRecord>();
  return (results ?? []).map(describeJob);
}

async function getOpsJob(env: Env, id: string) {
  const item = await env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first<OpsJobRecord>();
  return item ? describeJob(item) : null;
}

async function claimNextOpsJob(env: Env, kinds: JobKind[] | null, runnerId: string | null) {
  const placeholders = kinds?.length ? kinds.map(() => "?").join(",") : "";
  const sql = kinds?.length
    ? `SELECT * FROM ops_jobs WHERE status = 'ready_for_runner' AND kind IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`
    : `SELECT * FROM ops_jobs WHERE status = 'ready_for_runner' ORDER BY created_at ASC LIMIT 1`;
  const statement = env.adops_ops.prepare(sql);
  const row = await statement.bind(...(kinds ?? [])).first<OpsJobRecord>();
  if (!row) return null;
  return updateOpsJob(env, row.id, { status: "running", runnerId, error: null });
}

function todayInCuiaba() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function findExistingDailyPrintBatchJob(env: Env, date: string) {
  const record = await env.adops_ops
    .prepare(
      `SELECT * FROM ops_jobs
       WHERE kind = 'print-batch'
         AND json_extract(payload_json, '$.source') = ?
         AND json_extract(payload_json, '$.date') = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(DAILY_PRINT_SOURCE, date)
    .first<OpsJobRecord>();
  return record ? describeJob(record) : null;
}

async function scheduleDailyPrintBatch(
  env: Env,
  options: { now?: Date; requestedBy?: string; dryRun?: boolean } = {},
) {
  const now = options.now ?? new Date();
  const scheduledAt = now.toISOString();
  const date = dateInTimeZone(now, DAILY_PRINT_TIME_ZONE);
  const existing = await findExistingDailyPrintBatchJob(env, date);

  if (existing) {
    const result = {
      ok: true,
      skipped: true,
      reason: "existing_daily_print_batch",
      date,
      captureAt: null,
      captureWindow: DAILY_PRINT_CAPTURE_WINDOW,
      source: DAILY_PRINT_SOURCE,
      existingJobId: existing.id,
      existingStatus: existing.status,
    };
    console.log("daily_print_batch_skipped_existing", result);
    return result;
  }

  const payload = {
    competencia: null,
    siteId: null,
    date,
    captureAt: null,
    captureWindow: DAILY_PRINT_CAPTURE_WINDOW,
    source: DAILY_PRINT_SOURCE,
    scheduledAt,
    timeZone: DAILY_PRINT_TIME_ZONE,
  };

  if (options.dryRun) {
    return {
      ok: true,
      skipped: false,
      dryRun: true,
      date,
      captureAt: null,
      captureWindow: DAILY_PRINT_CAPTURE_WINDOW,
      source: DAILY_PRINT_SOURCE,
      payload,
    };
  }

  const jobId = await createOpsJob(env, "print-batch", payload, options.requestedBy ?? "cloudflare-scheduled");
  const result = {
    ok: true,
    skipped: false,
    jobId,
    kind: "print-batch",
    status: "queued",
    date,
    captureAt: null,
    captureWindow: DAILY_PRINT_CAPTURE_WINDOW,
    source: DAILY_PRINT_SOURCE,
  };
  console.log("daily_print_batch_scheduled", result);
  return result;
}

function computeDelay(ins: any): boolean {
  if (ins.processoEnviadoAgencia) return false;
  if (["concluido", "cancelado"].includes(ins.statusNormalizado)) return false;
  if (!ins.periodoFim) return false;
  const due = new Date(`${ins.periodoFim}T23:59:59-04:00`);
  due.setDate(due.getDate() + 1);
  return due.getTime() < Date.now();
}

function filterCampaigns(url: URL) {
  const competencia = url.searchParams.get("competencia");
  const clienteId = parseIntParam(url.searchParams.get("clienteId"));
  const agenciaId = parseIntParam(url.searchParams.get("agenciaId"));
  return snapshot.campaigns.filter((item) => {
    if (competencia && item.competencia !== competencia) return false;
    if (clienteId && item.clienteId !== clienteId) return false;
    if (agenciaId && item.agenciaId !== agenciaId) return false;
    return true;
  });
}

function filterInsertions(url: URL) {
  const competencia = url.searchParams.get("competencia");
  const siteId = parseIntParam(url.searchParams.get("siteId"));
  const clienteId = parseIntParam(url.searchParams.get("clienteId"));
  const agenciaId = parseIntParam(url.searchParams.get("agenciaId"));
  const status = url.searchParams.get("status");
  const atrasado = url.searchParams.get("atrasado") === "true";
  return snapshot.insertions.filter((item) => {
    if (competencia && item.competencia !== competencia) return false;
    if (siteId && item.siteId !== siteId) return false;
    if (clienteId && item.clienteId !== clienteId) return false;
    if (agenciaId && item.agenciaId !== agenciaId) return false;
    if (status && item.statusNormalizado !== status) return false;
    if (atrasado && !item.atrasado) return false;
    return true;
  });
}

function dashboardSummary(competencia: string | null) {
  if (competencia && snapshot.dashboards[competencia as keyof typeof snapshot.dashboards]) {
    return snapshot.dashboards[competencia as keyof typeof snapshot.dashboards].summary;
  }
  const items = snapshot.insertions;
  const campaigns = snapshot.campaigns;
  return {
    totalInsercoes: items.length,
    ativas: items.filter((i) => !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
    concluidas: items.filter((i) => i.statusNormalizado === "concluido").length,
    atrasadas: items.filter((i) => computeDelay(i)).length,
    aguardandoPublicacao: items.filter((i) => !i.bannerPublicadoNoSite && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
    aguardandoPrint: items.filter((i) => i.bannerPublicadoNoSite && !i.printGerado && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
    aguardandoEnvio: items.filter((i) => i.printGerado && !i.processoEnviadoAgencia && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
    aguardandoDocs: items.filter((i) => i.processoEnviadoAgencia && !i.docsEnviados && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
    valorTotalLiquido: campaigns.reduce((acc, item) => acc + Number(item.valorLiquido || 0), 0),
    totalCampanhas: campaigns.length,
  };
}

function getInsertionDetail(insertionId: number): InsertionDetail | null {
  return snapshot.insertionDetails[String(insertionId) as keyof typeof snapshot.insertionDetails] ?? null;
}

function getEvidenceDateKey(title: string | null | undefined) {
  if (!title) return null;
  const match = title.match(/Print\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getEvidenceForDate(detail: InsertionDetail | null, date: string) {
  return detail?.evidences?.find((item: any) => getEvidenceDateKey(item?.titulo) === date) ?? null;
}

function getStoredCaptureStatus(insertionId: number, date: string): CaptureStatus | null {
  return snapshot.captureStatuses[`${insertionId}:${date}` as keyof typeof snapshot.captureStatuses] ?? null;
}

function isInsertionEligibleOnDate(item: InsertionItem, date: string) {
  if (["concluido", "cancelado"].includes(item.statusNormalizado)) return false;
  if (!item.periodoInicio || !item.periodoFim) return false;
  return date >= item.periodoInicio && date <= item.periodoFim;
}

function buildMissingCaptureStatus(item: InsertionItem, detail: InsertionDetail | null, date: string) {
  const evidence = getEvidenceForDate(detail, date);
  const hasMedia = Boolean(item.mediaUrl);
  const inPeriod = isInsertionEligibleOnDate(item, date);
  return {
    insertionId: item.id,
    date,
    inPeriod,
    hasMedia,
    hasEvidenceForDate: Boolean(evidence),
    hasValidUrl: false,
    isReachable: false,
    urlStatus: null,
    arquivoUrl: evidence?.arquivoUrl ?? null,
    audit: null,
    status: "missing",
  };
}

function getCaptureStatusForDate(item: InsertionItem, date: string) {
  const stored = getStoredCaptureStatus(item.id, date);
  if (stored) return stored;
  const detail = getInsertionDetail(item.id);
  return buildMissingCaptureStatus(item, detail, date);
}

function normalizeAuditStatus(status: string) {
  if (status === "audited") return "ok";
  if (status === "invalid_audit") return "invalid_audit";
  if (status === "invalid_url") return "invalid_url";
  return "missing";
}

function buildAuditSummary(url: URL) {
  const targetDate = url.searchParams.get("date") || todayInCuiaba();
  const eligible = filterInsertions(url).filter(
    (item) => item.bannerPublicadoNoSite && isInsertionEligibleOnDate(item, targetDate) && item.mediaUrl,
  );
  const items = eligible.map((item) => {
    const status = getCaptureStatusForDate(item, targetDate);
    return {
      insertionId: item.id,
      targetDate,
      campaignName: item.campanhaName,
      siteSigla: item.siteSigla,
      periodoInicio: item.periodoInicio,
      periodoFim: item.periodoFim,
      hasEvidenceForDate: Boolean(status.hasEvidenceForDate),
      hasValidUrl: Boolean(status.hasValidUrl),
      isReachable: Boolean(status.isReachable),
      urlStatus: status.urlStatus ?? null,
      arquivoUrl: status.arquivoUrl ?? null,
      audit: status.audit ?? null,
      status: normalizeAuditStatus(String(status.status ?? "missing")),
    };
  });
  return {
    date: targetDate,
    totalEligible: items.length,
    ok: items.filter((item) => item.status === "ok").length,
    missing: items.filter((item) => item.status === "missing").length,
    invalid: items.filter((item) => item.status === "invalid_audit" || item.status === "invalid_url").length,
    items,
  };
}

function buildAuditFailures(url: URL) {
  const filters = filterInsertions(url).filter((item) => item.bannerPublicadoNoSite);
  const allowedIds = new Set(filters.map((item) => item.id));
  const items = Object.values(snapshot.captureStatuses)
    .filter(Boolean)
    .filter((status: any) => ["invalid_audit", "invalid_url"].includes(status.status))
    .filter((status: any) => allowedIds.has(status.insertionId))
    .map((status: any) => {
      const item = filters.find((entry) => entry.id === status.insertionId);
      return item
        ? {
            insertionId: item.id,
            campaignName: item.campanhaName,
            siteSigla: item.siteSigla,
            clienteNome: item.clienteNome,
            agenciaNome: item.agenciaNome,
            competencia: item.competencia,
            localFormato: item.localFormato,
            targetDate: status.date,
            arquivoUrl: status.arquivoUrl ?? null,
            status: status.status,
            audit: status.audit ?? null,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => `${a.insertionId}:${a.targetDate}`.localeCompare(`${b.insertionId}:${b.targetDate}`));

  return {
    totalFailures: items.length,
    invalidAudit: items.filter((item: any) => item.status === "invalid_audit").length,
    invalidUrl: items.filter((item: any) => item.status === "invalid_url").length,
    items,
  };
}

function formatDateOffset(base: Date, offsetDays: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildBackfillPreview(url: URL) {
  const insertionId = parseIntParam(url.searchParams.get("insertionId"));
  const yesterday = formatDateOffset(new Date(`${todayInCuiaba()}T00:00:00-04:00`), -1);
  const source = filterInsertions(url).filter((item) => !insertionId || item.id === insertionId);
  const grouped = source
    .map((item) => {
      const missingDates: string[] = [];
      if (!item.periodoInicio || !item.periodoFim || !item.mediaUrl) {
        return { insertionId: item.id, campaignName: item.campanhaName, siteSigla: item.siteSigla, localFormato: item.localFormato, totalMissing: 0, sampleDates: [] };
      }
      let cursor: string = item.periodoInicio;
      while (cursor <= item.periodoFim && cursor <= yesterday) {
        const status = getCaptureStatusForDate(item, cursor);
        if (status.status === "missing") missingDates.push(cursor);
        const next = new Date(`${cursor}T00:00:00-04:00`);
        next.setDate(next.getDate() + 1);
        cursor = next.toISOString().slice(0, 10);
      }
      return {
        insertionId: item.id,
        campaignName: item.campanhaName,
        siteSigla: item.siteSigla,
        localFormato: item.localFormato,
        totalMissing: missingDates.length,
        sampleDates: missingDates.slice(0, 5),
      };
    })
    .filter((item) => item.totalMissing > 0)
    .sort((a, b) => b.totalMissing - a.totalMissing);

  return {
    totalCandidates: grouped.length,
    totalJobs: grouped.reduce((acc, item) => acc + item.totalMissing, 0),
    totalSkipped: 0,
    grouped,
  };
}

function buildBackfillPreviewFromRequest(body: {
  competencia?: string | null;
  siteId?: number | null;
  insertionId?: number | null;
}) {
  const previewUrl = new URL("https://adops-api-public.local/api/insertions/capture-proof/backfill-overdue/preview");
  if (body.competencia) previewUrl.searchParams.set("competencia", body.competencia);
  if (body.siteId) previewUrl.searchParams.set("siteId", String(body.siteId));
  if (body.insertionId) previewUrl.searchParams.set("insertionId", String(body.insertionId));
  return buildBackfillPreview(previewUrl);
}

function describeLegacyBackfillJob(job: ReturnType<typeof describeJob>) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const result = (job.result ?? {}) as Record<string, unknown>;
  const grouped = Array.isArray(payload.previewGrouped) ? payload.previewGrouped : [];
  const skipped = Array.isArray(payload.previewSkipped) ? payload.previewSkipped : [];
  const totalCandidates = typeof payload.previewTotalCandidates === "number" ? payload.previewTotalCandidates : grouped.length;
  const totalJobs = typeof payload.previewTotalJobs === "number" ? payload.previewTotalJobs : 0;
  const totalSkipped = typeof payload.previewTotalSkipped === "number" ? payload.previewTotalSkipped : skipped.length;
  const results = Array.isArray(result.results) ? result.results : [];
  const generated = typeof result.generated === "number" ? result.generated : results.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).status === "ok").length;
  const errors = typeof result.errors === "number" ? result.errors : results.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).status === "error").length;

  return {
    id: job.id,
    status: job.status,
    competencia: typeof payload.competencia === "string" ? payload.competencia : null,
    siteId: typeof payload.siteId === "number" ? payload.siteId : null,
    insertionId: typeof payload.insertionId === "number" ? payload.insertionId : null,
    totalCandidates,
    totalJobs,
    totalSkipped,
    generated,
    errors,
    skipped,
    grouped,
    results,
    current: typeof result.stage === "string" ? result.stage : null,
    runnerId: job.runnerId ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error ?? null,
  };
}

function emptySyncDiagnostics() {
  return {
    invalidDates: [],
    competenciaMismatch: [],
    campaignReview: [],
    summary: {
      invalidDates: 0,
      competenciaMismatch: 0,
      safeCampaignUpdates: 0,
      needsManualReview: 0,
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const analyticsRoute = isAnalyticsRoute(path);
    const publicInsertionBackfillRoute = request.method === "POST" && path === "/api/insertions/capture-proof/backfill-overdue/jobs";
    const publicSingleCaptureMatch = request.method === "POST" ? path.match(/^\/api\/insertions\/(\d+)\/capture-proof$/) : null;
    const publicOperationalDocumentsRoute =
      (request.method === "POST" && /^\/api\/insertions\/\d+\/operational-documents\/regenerate$/.test(path)) ||
      (request.method === "DELETE" && /^\/api\/insertions\/\d+\/operational-documents\/[^/]+$/.test(path));

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,authorization,x-adops-api-token,x-adops-client-build,x-adops-auth-state",
        },
      });
    }

    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      if (isSettingsProxyPath(path)) {
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "As configurações dependem da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }

      if (!path.startsWith("/api/ops/") && path !== "/api/pi-site-exports/jobs" && !analyticsRoute && !isSettingsProxyPath(path) && !publicInsertionBackfillRoute && !publicSingleCaptureMatch && !publicOperationalDocumentsRoute) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
      }
    }

    if (request.method === "POST") {
      if (publicOperationalDocumentsRoute) {
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "Os documentos operacionais dependem da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }

      if (
        path === "/api/insertions/capture-proof/batch" ||
        path === "/api/sync/planilha/latest" ||
        path === "/api/sync/competencia/apply-safe" ||
        /^\/api\/insertions\/\d+\/capture-proof\/fix-invalid$/.test(path) ||
        /^\/api\/insertions\/\d+\/evidences$/.test(path) ||
        /^\/api\/evidences\/\d+$/.test(path)
      ) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "A mutação protegida depende da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }

      if (path === "/api/ops/jobs/print-batch") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
        const body = await readBody(request);
        const captureAt = typeof body.captureAt === "string" ? body.captureAt : null;
        if (captureAt && !isCaptureAtInDailyWindow(captureAt)) return badCaptureAtWindow();
        const jobId = await createOpsJob(env, "print-batch", {
          competencia: typeof body.competencia === "string" ? body.competencia : null,
          siteId: typeof body.siteId === "number" ? body.siteId : null,
          date: typeof body.date === "string" ? body.date : null,
          captureAt,
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "print-batch", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/jobs/daily-print-batch") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        try {
          const result = await scheduleDailyPrintBatch(env, {
            requestedBy: "ops-api",
            dryRun: typeof body.dryRun === "boolean" ? body.dryRun : false,
          });
          return jsonNoStore(result, { status: result.skipped || ("dryRun" in result) ? 200 : 202 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("daily_print_batch_schedule_failed", { error: message });
          return jsonNoStore({ ok: false, error: "daily_print_batch_schedule_failed", details: message }, { status: 500 });
        }
      }

      if (path === "/api/ops/jobs/print-backfill") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
        const body = await readBody(request);
        const insertionId = readOptionalNumber(body.insertionId);
        const campaignId = readOptionalNumber(body.campaignId);
        const siteId = readOptionalNumber(body.siteId);
        const competencia = typeof body.competencia === "string" && body.competencia.trim() ? body.competencia.trim() : null;
        const piCodigo = typeof body.piCodigo === "string" && body.piCodigo.trim() ? body.piCodigo.trim() : null;
        const siteSigla = typeof body.siteSigla === "string" && body.siteSigla.trim() ? body.siteSigla.trim().toUpperCase() : null;
        const fromDate = typeof body.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) ? body.fromDate : null;
        const toDate = typeof body.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate) ? body.toDate : null;
        if (body.fromDate != null && !fromDate) return badRequest("fromDate deve estar no formato YYYY-MM-DD.");
        if (body.toDate != null && !toDate) return badRequest("toDate deve estar no formato YYYY-MM-DD.");
        if ((piCodigo && !siteSigla) || (!piCodigo && siteSigla)) return badRequest("Informe piCodigo e siteSigla juntos.");
        if (!insertionId && !campaignId && !siteId && !competencia && !piCodigo) {
          return badRequest("Informe insertionId, campaignId, piCodigo+siteSigla, siteId ou competencia para limitar o backfill.");
        }
        const jobId = await createOpsJob(env, "print-backfill", {
          competencia,
          siteId,
          insertionId,
          campaignId,
          piCodigo,
          siteSigla,
          fromDate,
          toDate,
          replace: body.replace === true,
          force: body.force === true,
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "print-backfill", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/jobs/print-single") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
        const body = await readBody(request);
        const insertionId = typeof body.insertionId === "number" ? body.insertionId : null;
        if (!insertionId) return badRequest("Informe insertionId para gerar o print individual.");
        const captureAt = typeof body.captureAt === "string" ? body.captureAt : null;
        if (captureAt && !isCaptureAtInDailyWindow(captureAt)) return badCaptureAtWindow();
        const jobId = await createOpsJob(env, "print-single", {
          insertionId,
          date: typeof body.date === "string" ? body.date : null,
          captureAt,
          replace: typeof body.replace === "boolean" ? body.replace : false,
          force: typeof body.force === "boolean" ? body.force : false,
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "print-single", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/jobs/drive-pi-preflight" || path === "/api/ops/jobs/drive-pi-folder" || path === "/api/ops/jobs/drive-pi-publish") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const preflightOnly = path === "/api/ops/jobs/drive-pi-preflight";
        const publishFlow = path === "/api/ops/jobs/drive-pi-publish";
        const folderId = parseDriveFolderId(body.folderUrl ?? body.folderId ?? body.driveFolderId);
        if (!folderId) return badRequest("Informe folderUrl, folderId ou driveFolderId válido do Google Drive.");
        const now = nowIso();
        const event = {
          eventId: readOptionalString(body.eventId) ?? `drive:${folderId}:${publishFlow ? "publish:" : preflightOnly ? "preflight:" : ""}${now}`,
          driveFileId: folderId,
          name: readOptionalString(body.name) ?? `${preflightOnly ? "Preflight Drive PI" : "Drive PI"} ${folderId}`,
          mimeType: "application/vnd.google-apps.folder",
          path: readOptionalString(body.path) ?? `/drive/${folderId}`,
          parentFolderId: null,
          modifiedTime: readOptionalString(body.modifiedTime) ?? now,
          webViewLink: readOptionalString(body.folderUrl) ?? `https://drive.google.com/drive/folders/${folderId}`,
          eventType: "folder_updated" as const,
          simulation: body.simulation,
          parsedPi: body.parsedPi,
          preflightOnly,
          explicitFolder: true,
          resolveMedia: publishFlow ? body.resolveMedia !== false : body.resolveMedia === true,
          strictInsertionScope: publishFlow ? body.strictInsertionScope !== false : body.strictInsertionScope === true,
          allowPdfInsertions: publishFlow ? body.allowPdfInsertions === true : body.allowPdfInsertions !== false,
          publish: publishFlow ? body.publish !== false : body.publish === true,
          generateEvidence: publishFlow ? body.generateEvidence !== false : body.generateEvidence === true,
          purgeCache: body.purgeCache !== false,
          source: preflightOnly
            ? "cloudflare-protected-api-preflight"
            : publishFlow
              ? "cloudflare-protected-api-publish"
              : "cloudflare-protected-api",
        };
        const validated = validateDrivePiEvent(event);
        if (validated.ok === false) return validated.response;
        const result = await createDrivePiEventJob(env, validated.event, "ops-api");
        return jsonNoStore({ ok: true, kind: "drive-pi-ingest", preflightOnly, publishFlow, ...result }, { status: result.duplicate ? 200 : 202 });
      }

      if (path === "/api/ops/jobs/reconcile-adrotate") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const apply = body.apply === true;
        const jobId = await createOpsJob(env, "reconcile-adrotate", {
          apply,
          mode: apply ? "apply" : "audit",
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "reconcile-adrotate", status: "queued", apply }, { status: 202 });
      }

      if (path === "/api/ops/jobs/adrotate-link") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const insertionId = readOptionalNumber(body.insertionId);
        const adId = readOptionalNumber(body.adId);
        const apply = body.apply === true;
        if (!insertionId || insertionId <= 0 || !adId || adId <= 0) {
          return json({ error: "bad_request", details: "Informe insertionId e adId positivos." }, { status: 400 });
        }
        const jobId = await createOpsJob(env, "adrotate-link", {
          insertionId,
          adId,
          apply,
          mode: apply ? "apply" : "preview",
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "adrotate-link", status: "queued", apply }, { status: 202 });
      }

      if (path === "/api/ops/jobs/adrotate-publish") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const insertionId = readOptionalNumber(body.insertionId);
        if (!insertionId || insertionId <= 0) {
          return json({ error: "bad_request", details: "Informe insertionId positivo." }, { status: 400 });
        }
        const apply = body.apply === true;
        const replaceExisting = body.replaceExisting !== false;
        const purgeCache = body.purgeCache !== false;
        const generateEvidence = body.generateEvidence === true;
        const jobId = await createOpsJob(env, "adrotate-publish", {
          insertionId,
          apply,
          replaceExisting,
          purgeCache,
          generateEvidence,
          date: readOptionalString(body.date),
          captureAt: readOptionalString(body.captureAt),
          mode: apply ? "apply" : "preview",
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({
          ok: true,
          jobId,
          kind: "adrotate-publish",
          status: "queued",
          apply,
          requiredFollowUp: apply
            ? ["validate_adrotate_relation", "validate_public_html", ...(generateEvidence ? ["validate_capture_proof"] : [])]
            : ["review_preview", "rerun_with_apply_true"],
        }, { status: 202 });
      }

      if (path === "/api/ops/jobs/watchdog") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const result = await runOpsJobWatchdog(env, {
          dryRun: typeof body.dryRun === "boolean" ? body.dryRun : false,
          limit: typeof body.limit === "number" ? body.limit : 200,
        });
        return jsonNoStore(result);
      }

      if (path === "/api/ops/jobs/sync-planilha") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const jobId = await createOpsJob(env, "sync-planilha", {
          mode: typeof body.mode === "string" ? body.mode : "latest",
          campaignIds: Array.isArray(body.campaignIds) ? body.campaignIds : null,
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "sync-planilha", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/drive-pi-events") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const validated = validateDrivePiEvent(body);
        if (validated.ok === false) return validated.response;
        const result = await createDrivePiEventJob(env, validated.event, "google-drive-monitor");
        return jsonNoStore({ ok: true, kind: "drive-pi-ingest", ...result }, { status: result.duplicate ? 200 : 202 });
      }

      if (path === "/api/ops/jobs/drive-inventory-refresh") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
        const jobId = await createOpsJob(env, "drive-inventory-refresh", {
          scanId: crypto.randomUUID(),
          source: "cloudflare-protected-api",
        }, "ops-api");
        return jsonNoStore({ ok: true, jobId, kind: "drive-inventory-refresh", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/jobs/drive-pi-reconcile") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
        return jsonNoStore({
          error: "private_api_unavailable",
          details: "A reconciliação de fonte e mídia depende da API principal hospedada.",
        }, { status: 503 });
      }

      if (path === "/api/ops/jobs/telegram-send-evidence") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const insertionId = readOptionalNumber(body.insertionId);
        const date = parseIsoDateString(body.date);
        if (!insertionId || !date) return badRequest("Informe insertionId e date=YYYY-MM-DD.");
        const jobId = await createOpsJob(env, "telegram-send-evidence", {
          insertionId,
          date,
          chatId: readOptionalString(body.chatId),
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "telegram-send-evidence", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/jobs/runtime-readiness-probe") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const includeChecks = Array.isArray(body.includeChecks) ? body.includeChecks.filter((item) => typeof item === "string") : [];
        const jobId = await createOpsJob(env, "runtime-readiness-probe", {
          includeChecks,
          source: "cloudflare-protected-api",
        }, "ops-api");
        return json({ ok: true, jobId, kind: "runtime-readiness-probe", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/drive-pi-events/status") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        return updateDrivePiEventState(env, body);
      }

      if (path === "/api/analytics/jobs/request-report") {
        const body = await readBody(request);
        const insertionId = typeof body.insertionId === "number" ? body.insertionId : parseIntParam(String(body.insertionId ?? ""));
        if (!insertionId) return badRequest("Informe insertionId para solicitar o relatório de Analytics.");
        const insertion = await getInsertionContext(env, insertionId);
        if (!insertion) return notFound("Insertion not found");
        const siteConfig = resolveAnalyticsSiteConfig(insertion, typeof body.propertyKey === "string" ? body.propertyKey : null);
        if (!siteConfig) {
          return badRequest("O site desta inserção ainda não possui configuração de Analytics por API.");
        }
        const requirements = buildAnalyticsRequirements(insertion, siteConfig);
        const requestedMode = typeof body.periodMode === "string" ? body.periodMode : "pi";
        const periodMode = ["pi", "full_month", "custom"].includes(requestedMode) ? requestedMode as "pi" | "full_month" | "custom" : "pi";
        const customPeriodStart = typeof body.customPeriodStart === "string" ? body.customPeriodStart : null;
        const customPeriodEnd = typeof body.customPeriodEnd === "string" ? body.customPeriodEnd : null;
        const resolvedPeriod = resolveAnalyticsPeriod(insertion, periodMode, customPeriodStart, customPeriodEnd);
        if (!resolvedPeriod.periodStart || !resolvedPeriod.periodEnd) {
          return badRequest("A inserção não possui período suficiente para gerar o relatório.");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodEnd)) {
          return badRequest("O período informado para Analytics está inválido.");
        }
        if (resolvedPeriod.periodStart > resolvedPeriod.periodEnd) {
          return badRequest("A data inicial do relatório não pode ser maior que a data final.");
        }
        const payload = {
          campaignId: insertion.campanhaId ?? null,
          campaignName: insertion.campanhaName ?? null,
          insertionId: insertion.id,
          piCodigo: insertion.piCodigo ?? null,
          siteSigla: insertion.siteSigla ?? null,
          siteNome: insertion.siteNome ?? null,
          clientName: insertion.clienteNome ?? null,
          agencyName: insertion.agenciaNome ?? null,
          propertyKey: siteConfig.propertyKey,
          reportConfigName: siteConfig.reportConfigName,
          periodMode,
          periodStart: resolvedPeriod.periodStart,
          periodEnd: resolvedPeriod.periodEnd,
          dimensions: requirements.recommendedDimensions,
          metrics: requirements.recommendedMetrics,
          requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "adops-ui-public",
          source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
          analyticsSource: requirements.analyticsSource,
          notes: requirements.notes,
        };
        const jobId = await createOpsJob(env, "analytics-report", payload, payload.requestedBy);
        return jsonNoStore({ ok: true, jobId, status: "queued", payload }, { status: 202 });
      }

      if (path === "/api/pi-site-exports/jobs") {
        const body = await readBody(request);
        const piCodigo = typeof body.piCodigo === "string" ? body.piCodigo.trim() : "";
        const siteSigla = typeof body.siteSigla === "string" ? body.siteSigla.trim().toUpperCase() : "";
        if (!piCodigo || !siteSigla) {
          return badRequest("Informe piCodigo e siteSigla para gerar o pacote PI/site.");
        }
        const requestedMode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "full-pdf";
        if (!["full", "prints-only", "pdf", "full-pdf"].includes(requestedMode)) {
          return badRequest("mode deve ser full, prints-only, pdf ou full-pdf.");
        }
        const mode = requestedMode;
        const variant = mode === "pdf" || mode === "full-pdf"
          ? "web"
          : typeof body.variant === "string" && body.variant.trim().toLowerCase() === "web"
            ? "web"
            : "original";
        const boundedInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
          const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
          return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
        };
        const pdfMaxWidth = boundedInteger(body.pdfMaxWidth, 800, 2560, 1920);
        const pdfQuality = boundedInteger(body.pdfQuality, 45, 85, 68);
        const pdfResolution = boundedInteger(body.pdfResolution, 72, 180, 120);
        const imageMaxWidth = boundedInteger(body.imageMaxWidth, 800, 2560, 1600);
        const imageQuality = boundedInteger(body.imageQuality, 45, 90, 72);
        const requestedKey = request.headers.get("idempotency-key")?.trim() || "";
        const generatedKey = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify({ piCodigo, siteSigla, mode, variant, pdfMaxWidth, pdfQuality, pdfResolution, imageMaxWidth, imageQuality })),
        );
        const idempotencyKey = requestedKey || Array.from(new Uint8Array(generatedKey), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
          return badRequest("Idempotency-Key inválida.");
        }
        const created = await createIdempotentOpsJob(env, "pi-site-export", {
          piCodigo,
          siteSigla,
          mode,
          variant,
          pdfMaxWidth,
          pdfQuality,
          pdfResolution,
          imageMaxWidth,
          imageQuality,
          requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "adops-public-api",
          source: typeof body.source === "string" ? body.source : "cloudflare-public-api",
        }, typeof body.requestedBy === "string" ? body.requestedBy : "adops-public-api", idempotencyKey);
        return jsonNoStore({
          ok: true,
          jobId: created.jobId,
          kind: "pi-site-export",
          status: created.status,
          duplicate: created.duplicate,
          piCodigo,
          siteSigla,
          mode,
          variant,
          pdfMaxWidth,
          pdfQuality,
          pdfResolution,
          imageMaxWidth,
          imageQuality,
        }, { status: created.duplicate ? 200 : 202 });
      }

      if (path === "/api/insertions/capture-proof/backfill-overdue/jobs") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        try {
          const body = await readBody(request.clone());
          const insertionId = typeof body.insertionId === "number" ? body.insertionId : parseIntParam(String(body.insertionId ?? ""));
          if (!insertionId) {
            return notSupported("O lote amplo de retroativos continua protegido no Cloudflare. Para o Pages público, esta rota agora aceita apenas retroativo por inserção.");
          }
          if (privateApiEnabled(env)) {
            return proxyToPrivateApi(request, env, url, { noStore: true });
          }
          const payload = {
            competencia: typeof body.competencia === "string" ? body.competencia : null,
            siteId: typeof body.siteId === "number" ? body.siteId : null,
            insertionId,
            source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
            requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "insertion-detail-public",
          };
          const preview = buildBackfillPreviewFromRequest(payload);
          const jobId = await createOpsJob(env, "print-backfill", {
            ...payload,
            previewTotalCandidates: preview.totalCandidates,
            previewTotalJobs: preview.totalJobs,
            previewTotalSkipped: preview.totalSkipped,
            previewGrouped: preview.grouped,
            previewSkipped: [],
          }, payload.requestedBy);
          return jsonNoStore({
            ok: true,
            jobId,
            status: "queued",
            preview: {
              totalCandidates: preview.totalCandidates,
              totalJobs: preview.totalJobs,
              totalSkipped: preview.totalSkipped,
              grouped: preview.grouped,
            },
          }, { status: 202 });
        } catch (error) {
          const details = error instanceof Error ? error.message : String(error);
          console.error("[backfill-overdue/jobs] failed", { details });
          return jsonNoStore({ error: "internal_error", details: "Falha ao enfileirar retroativos vencidos para a inserção.", cause: details }, { status: 500 });
        }
      }

      if (publicSingleCaptureMatch) {
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        const body = await readBody(request);
        const insertionId = Number.parseInt(publicSingleCaptureMatch[1] ?? "", 10);
        if (!insertionId) {
          return badRequest("Informe insertionId para gerar o print individual.");
        }
        const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy : "insertion-detail-public";
        const captureAt = typeof body.captureAt === "string" ? body.captureAt : null;
        if (captureAt && !isCaptureAtInDailyWindow(captureAt)) return badCaptureAtWindow();
        const date = typeof body.date === "string" ? body.date : captureAt && /^\d{4}-\d{2}-\d{2}/.test(captureAt) ? captureAt.slice(0, 10) : null;
        const jobId = await createOpsJob(env, "print-single", {
          insertionId,
          date,
          captureAt,
          replace: typeof body.replace === "boolean" ? body.replace : false,
          force: typeof body.force === "boolean" ? body.force : false,
          source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
        }, requestedBy);
        return jsonNoStore({ ok: true, jobId, kind: "print-single", status: "queued" }, { status: 202 });
      }

      if (path === "/api/ops/runner/claim-next") {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const requestedKinds = Array.isArray(body.kinds)
          ? body.kinds.filter((item): item is JobKind => OPS_JOB_KINDS.includes(String(item) as JobKind))
          : null;
        const runnerId = typeof body.runnerId === "string" ? body.runnerId : null;
        const job = await claimNextOpsJob(env, requestedKinds?.length ? requestedKinds : null, runnerId);
        return json({ ok: true, job: job ? describeJob(job as OpsJobRecord) : null });
      }

      const completeMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/complete$/);
      if (completeMatch) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const updated = await updateOpsJob(env, completeMatch[1], {
          status: "completed",
          result: body.result ?? { ok: true },
          error: null,
          runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
        });
        return updated ? json({ ok: true, job: describeJob(updated as OpsJobRecord) }) : notFound("Job not found");
      }

      const progressMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/progress$/);
      if (progressMatch) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const updated = await updateOpsJob(env, progressMatch[1], {
          result: body.result ?? null,
          runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
        });
        return updated ? json({ ok: true, job: describeJob(updated as OpsJobRecord) }) : notFound("Job not found");
      }

      const failMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/fail$/);
      if (failMatch) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        const body = await readBody(request);
        const updated = await updateOpsJob(env, failMatch[1], {
          status: "failed",
          result: body.result ?? null,
          error: typeof body.error === "string" ? body.error : "Runner reportou falha sem detalhe.",
          runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
        });
        return updated ? json({ ok: true, job: describeJob(updated as OpsJobRecord) }) : notFound("Job not found");
      }

      if (
        path === "/api/clients" ||
        path === "/api/agencies" ||
        path === "/api/sites" ||
        /^\/api\/clients\/\d+$/.test(path) ||
        /^\/api\/agencies\/\d+$/.test(path) ||
        /^\/api\/sites\/\d+$/.test(path)
      ) {
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "As configurações dependem da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }

      return notFound();
    }

    if (request.method === "PATCH") {
      if (/^\/api\/evidences\/\d+$/.test(path)) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "A edição da evidência depende da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }
      return notFound();
    }

    if (request.method === "DELETE") {
      if (publicOperationalDocumentsRoute) {
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "Os documentos operacionais dependem da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }

      const analyticsReportMatch = path.match(/^\/api\/analytics\/reports\/([^/]+)$/);
      if (analyticsReportMatch) {
        const deleted = await deleteAnalyticsJob(env, analyticsReportMatch[1]);
        return deleted ? jsonNoStore({ ok: true, id: analyticsReportMatch[1] }) : notFound("Analytics report not found");
      }

      if (/^\/api\/evidences\/\d+$/.test(path)) {
        const auth = requireOpsAuth(request, env);
        if (!auth.ok) return auth.response;
        if (privateApiEnabled(env)) {
          return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        return json(
          { error: "private_api_unavailable", details: "A exclusão da evidência depende da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503 },
        );
      }
      return notFound();
    }

    if (
      request.method === "GET" &&
      !path.startsWith("/api/ops/") &&
      path !== "/api/healthz" &&
      !analyticsRoute &&
      !/^\/api\/pi-site-exports\/jobs\/[^/]+(?:\/download)?$/.test(path) &&
      !/^\/api\/insertions\/capture-proof\/backfill-overdue\/jobs\/[^/]+$/.test(path) &&
      privateApiEnabled(env)
    ) {
      return proxyToPrivateApi(request, env, url, { noStore: true });
    }

    if (request.method !== "GET") {
      return notFound();
    }

    if (path === "/api/healthz") return json({ status: "ok", mode: privateApiEnabled(env) ? "cloudflare-public-live-proxy" : "cloudflare-public-readonly", generatedAt: snapshot.generatedAt, opsApiAvailable: true, privateApiEnabled: privateApiEnabled(env) });

    if (path === "/api/ops/drive-inventory/status") {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      return jsonNoStore({ ok: false, snapshotStatus: "unavailable", snapshotAt: null, snapshotAgeSeconds: null, stale: true, itemCount: 0 });
    }

    if (path === "/api/ops/runtime-readiness" || path === "/api/ops/runtime-topology") {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      return jsonNoStore({
        error: "private_api_unavailable",
        details: "A topologia e o readiness dependem da API principal hospedada.",
      }, { status: 503 });
    }

    const analyticsRequirementsMatch = path.match(/^\/api\/analytics\/insertions\/(\d+)\/requirements$/);
    if (analyticsRequirementsMatch) {
      const insertionId = Number.parseInt(analyticsRequirementsMatch[1] ?? "", 10);
      const insertion = await getInsertionContext(env, insertionId);
      if (!insertion) return notFound("Insertion not found");
      const siteConfig = resolveAnalyticsSiteConfig(insertion, null);
      return jsonNoStore(buildAnalyticsRequirements(insertion, siteConfig));
    }

    if (path === "/api/analytics/jobs/request-report") {
      return badRequest("Use POST para solicitar um relatório de Analytics.");
    }

    const analyticsJobMatch = path.match(/^\/api\/analytics\/jobs\/([^/]+)$/);
    if (analyticsJobMatch) {
      const job = await getAnalyticsJob(env, analyticsJobMatch[1]);
      if (!job) return notFound("Analytics job not found");
      const payload = (job.payload ?? {}) as Record<string, unknown>;
      return jsonNoStore({
        id: job.id,
        status: job.status,
        kind: "analytics-report",
        campaignId: typeof payload.campaignId === "number" ? payload.campaignId : null,
        insertionId: typeof payload.insertionId === "number" ? payload.insertionId : null,
        piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
        siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }

    const analyticsReportsMatch = path.match(/^\/api\/analytics\/insertions\/(\d+)\/reports$/);
    if (analyticsReportsMatch) {
      const insertionId = Number.parseInt(analyticsReportsMatch[1] ?? "", 10);
      const reports = await listAnalyticsJobsForInsertion(env, insertionId, 50);
      return jsonNoStore({
        insertionId,
        reports: reports.map(reportFromAnalyticsJob),
      });
    }

    const analyticsDownloadMatch = path.match(/^\/api\/analytics\/reports\/([^/]+)\/download$/);
    if (analyticsDownloadMatch) {
      const job = await getAnalyticsJob(env, analyticsDownloadMatch[1]);
      if (!job) return notFound("Analytics report not found");
      const report = reportFromAnalyticsJob(job);
      if (!report.downloadUrl) {
        return jsonNoStore(
          { error: "report_not_ready", details: "O relatório ainda não possui artefato publicado para download." },
          { status: 409 },
        );
      }
      return Response.redirect(report.downloadUrl, 302);
    }

    const piSiteExportJobMatch = path.match(/^\/api\/pi-site-exports\/jobs\/([^/]+)$/);
    if (piSiteExportJobMatch) {
      const job = await getPiSiteExportJob(env, piSiteExportJobMatch[1]);
      if (!job) return notFound("PI/site export job not found");
      return jsonNoStore(piSiteExportJobFromOpsJob(job));
    }

    const piSiteExportDownloadMatch = path.match(/^\/api\/pi-site-exports\/jobs\/([^/]+)\/download$/);
    if (piSiteExportDownloadMatch) {
      const job = await getPiSiteExportJob(env, piSiteExportDownloadMatch[1]);
      if (!job) return notFound("PI/site export job not found");
      const payload = piSiteExportJobFromOpsJob(job);
      if (payload.status !== "completed" || !payload.downloadUrl) {
        return jsonNoStore({
          error: "export_not_ready",
          details: "O pacote PI/site ainda não terminou de ser montado.",
          job: payload,
        }, { status: 409 });
      }
      return Response.redirect(payload.downloadUrl, 302);
    }

    if (path === "/api/ops/jobs") {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      const limit = Math.min(parseIntParam(url.searchParams.get("limit")) ?? 20, 100);
      const statuses = (url.searchParams.get("status") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is JobStatus => ["queued", "ready_for_runner", "running", "completed", "failed"].includes(item));
      const kinds = (url.searchParams.get("kind") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is JobKind => OPS_JOB_KINDS.includes(item as JobKind));
      const olderThanMinutes = parseIntParam(url.searchParams.get("olderThanMinutes"));
      return jsonNoStore({
        items: await listOpsJobsByFilter(env, {
          limit,
          statuses: statuses.length ? statuses : null,
          kinds: kinds.length ? kinds : null,
          olderThanMinutes,
        }),
      });
    }

    if (path === "/api/ops/queue/overview") {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      return jsonNoStore(await getQueueOverview(env));
    }

    const opsJobProgressMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)\/progress$/);
    if (opsJobProgressMatch) {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      const job = await getOpsJob(env, opsJobProgressMatch[1]);
      return job ? jsonNoStore(computeJobProgress(job)) : notFound("Job not found");
    }

    const opsJobMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)$/);
    if (opsJobMatch) {
      if (privateApiEnabled(env)) return proxyToPrivateApi(request, env, url, { noStore: true });
      const job = await getOpsJob(env, opsJobMatch[1]);
      return job ? jsonNoStore(job) : notFound("Job not found");
    }
    const opsJobLogMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)\/log$/);
    if (opsJobLogMatch) {
      const job = await getOpsJob(env, opsJobLogMatch[1]);
      if (!job) return notFound("Job not found");
      const directResult = job.result as Record<string, unknown> | null;
      const nestedCapture = directResult?.capture as Record<string, unknown> | undefined;
      const nestedExecution = directResult?.execution as Record<string, unknown> | undefined;
      const nestedExecutionCapture = nestedExecution?.capture as Record<string, unknown> | undefined;
      const captureLogId = typeof directResult?.captureLogId === "string"
        ? directResult.captureLogId
        : typeof nestedCapture?.captureLogId === "string"
          ? nestedCapture.captureLogId
          : typeof nestedExecutionCapture?.captureLogId === "string"
            ? nestedExecutionCapture.captureLogId
          : null;
      if (!captureLogId) {
        return jsonNoStore({
          error: "capture_log_not_found",
          details: "Este job ainda não publicou um log estruturado de captura.",
          job,
        }, { status: 404 });
      }
      if (!privateApiEnabled(env)) {
        return json(
          { error: "private_api_unavailable", details: "O detalhamento do log depende da API principal hospedada e ela não está configurada neste Worker." },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
      }
      const privateUrl = new URL(`${request.url}`);
      privateUrl.pathname = `/api/capture-proof-logs/${encodeURIComponent(captureLogId)}`;
      privateUrl.search = "";
      return proxyToPrivateApi(request, env, privateUrl, { noStore: true });
    }
    if (path === "/api/sites") return json(snapshot.sites);
    if (path === "/api/clients") return json(snapshot.clients);
    if (path === "/api/agencies") return json(snapshot.agencies);
    if (path === "/api/campaigns") return json(filterCampaigns(url));
    if (path === "/api/insertions") return json(filterInsertions(url));
    if (path === "/api/dashboard/summary") return json(dashboardSummary(url.searchParams.get("competencia")));
    if (path === "/api/dashboard/by-site") {
      const competencia = url.searchParams.get("competencia");
      return json(competencia && snapshot.dashboards[competencia as keyof typeof snapshot.dashboards]
        ? snapshot.dashboards[competencia as keyof typeof snapshot.dashboards].bySite
        : snapshot.sites.map((site) => ({
            siteId: site.id,
            siteNome: site.nome,
            siteSigla: site.sigla,
            total: snapshot.insertions.filter((i) => i.siteId === site.id).length,
            ativas: snapshot.insertions.filter((i) => i.siteId === site.id && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
            concluidas: snapshot.insertions.filter((i) => i.siteId === site.id && i.statusNormalizado === "concluido").length,
            atrasadas: snapshot.insertions.filter((i) => i.siteId === site.id && computeDelay(i)).length,
          })));
    }
    if (path === "/api/dashboard/by-client") {
      const competencia = url.searchParams.get("competencia");
      return json(competencia && snapshot.dashboards[competencia as keyof typeof snapshot.dashboards]
        ? snapshot.dashboards[competencia as keyof typeof snapshot.dashboards].byClient
        : []);
    }
    if (path === "/api/dashboard/by-competencia") return json(snapshot.byCompetencia);
    if (path === "/api/dashboard/critical") {
      const competencia = url.searchParams.get("competencia");
      return json(competencia && snapshot.dashboards[competencia as keyof typeof snapshot.dashboards]
        ? snapshot.dashboards[competencia as keyof typeof snapshot.dashboards].critical
        : []);
    }
    if (path === "/api/insertions/capture-proof/audit") return json(buildAuditSummary(url));
    if (path === "/api/insertions/capture-proof/audit/failures") return json(buildAuditFailures(url));
    if (path === "/api/insertions/capture-proof/backfill-overdue/preview") {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(buildBackfillPreview(url));
    }
    if (path === "/api/sync/planilha/diagnostics") return json(snapshot.syncDiagnostics ?? emptySyncDiagnostics());
    if (path === "/api/sync/planilha/preview") {
      return snapshot.syncPreview
        ? json(snapshot.syncPreview)
        : notSupported("O preview completo da planilha ainda não foi incluído no snapshot público. Use a leitura pública já publicada e o sync operacional continua na camada privada enquanto a migração é concluída.");
    }

    const campaignMatch = path.match(/^\/api\/campaigns\/(\d+)$/);
    if (campaignMatch) {
      const item = snapshot.campaignDetails[campaignMatch[1] as keyof typeof snapshot.campaignDetails];
      return item ? json(item) : notFound("Campaign not found");
    }

    const insertionMatch = path.match(/^\/api\/insertions\/(\d+)$/);
    if (insertionMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      const item = snapshot.insertionDetails[insertionMatch[1] as keyof typeof snapshot.insertionDetails];
      return item ? json(item) : notFound("Insertion not found");
    }

    const relationMatch = path.match(/^\/api\/integrations\/adrotate\/insertions\/(\d+)\/relation$/);
    if (relationMatch) {
      const item = snapshot.relations?.[relationMatch[1] as keyof typeof snapshot.relations] ?? null;
      return item ? json(item as Json) : notFound("Relação com AdRotate não encontrada.");
    }

    const captureStatusMatch = path.match(/^\/api\/insertions\/(\d+)\/capture-proof\/status$/);
    if (captureStatusMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      const insertionId = Number(captureStatusMatch[1]);
      const date = url.searchParams.get("date") || todayInCuiaba();
      const item = snapshot.insertions.find((entry) => entry.id === insertionId);
      if (!item) return notFound("Insertion not found");
      return json(getCaptureStatusForDate(item, date) as Json);
    }

    const captureLogsMatch = path.match(/^\/api\/insertions\/(\d+)\/capture-proof\/logs$/);
    if (captureLogsMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(
        { error: "private_api_unavailable", details: "Os logs de captura dependem da API principal hospedada e ela não está configurada neste Worker." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    const captureProofLogMatch = path.match(/^\/api\/capture-proof-logs\/([^/]+)$/);
    if (captureProofLogMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(
        { error: "private_api_unavailable", details: "Os logs de captura dependem da API principal hospedada e ela não está configurada neste Worker." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    const plannedMatch = path === "/api/integrations/adrotate/planned";
    if (plannedMatch) {
      const competencia = url.searchParams.get("competencia") ?? "";
      const siteSigla = url.searchParams.get("siteSigla") ?? "";
      return json((snapshot.adrotatePlanned?.[`${competencia}|||${siteSigla}` as keyof typeof snapshot.adrotatePlanned] ?? []) as Json);
    }

    const livePreviewMatch = path === "/api/integrations/adrotate/live-preview";
    if (livePreviewMatch) {
      const siteSigla = url.searchParams.get("siteSigla") ?? "";
      const payload = snapshot.adrotateLivePreview?.[siteSigla as keyof typeof snapshot.adrotateLivePreview] ?? null;
      return payload ? json(payload as Json) : notFound("Prévia pública do site não encontrada.");
    }

    const zipExportMatch = path.match(/^\/api\/insertions\/(\d+)\/evidences\/export\.zip$/);
    if (zipExportMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(
        { error: "private_api_unavailable", details: "A exportação de ZIP depende da API principal hospedada e ela não está configurada neste Worker." },
        { status: 503 },
      );
    }

    const zipExportDebugMatch = path.match(/^\/api\/insertions\/(\d+)\/evidences\/export\.debug$/);
    if (zipExportDebugMatch) {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(
        { error: "private_api_unavailable", details: "O diagnóstico da exportação depende da API principal hospedada e ela não está configurada neste Worker." },
        { status: 503 },
      );
    }

    if (path === "/api/pi-site-exports") {
      if (privateApiEnabled(env)) {
        return proxyToPrivateApi(request, env, url, { noStore: true });
      }
      return json(
        { error: "private_api_unavailable", details: "A exportação consolidada por PI/site depende da API principal hospedada e ela não está configurada neste Worker." },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    const backfillJobMatch = path.match(/^\/api\/insertions\/capture-proof\/backfill-overdue\/jobs\/([^/]+)$/);
    if (backfillJobMatch) {
      const job = await getOpsJob(env, backfillJobMatch[1]);
      if (!job || job.kind !== "print-backfill") return notFound("Lote não encontrado.");
      return jsonNoStore(describeLegacyBackfillJob(job));
    }

    return notFound();
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      scheduleDailyPrintBatch(env, {
        requestedBy: "cloudflare-scheduled",
        now: new Date(controller.scheduledTime),
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("daily_print_batch_schedule_failed", { error: message });
      }),
    );
  },

  async queue(batch: MessageBatch<JobQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;
      if (!body?.jobId) {
        message.ack();
        continue;
      }
      await updateOpsJob(env, body.jobId, {
        status: "ready_for_runner",
        result: {
          stage: "queue_received",
          note: "Job aceito no Cloudflare e aguardando runner remoto para claim.",
          queuedAt: nowIso(),
        },
        error: null,
      });
      message.ack();
    }
  },
};
