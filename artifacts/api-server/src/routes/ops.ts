import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { getActiveCampaignOperations } from "../lib/campaign-operations";
import { enqueueDriveInventoryRefresh, getDriveInventoryStatus, syncDriveInventory, type DriveInventoryItemInput } from "../lib/drive-inventory";
import { buildRetryJobInput, buildSchedulerReadback, reconcileDueSchedules, resolveCanonicalSchedule, suppressCompletedPrintRecoveries, validateDryRunNow } from "../lib/ops-scheduler";
import { listRunnerHeartbeats, upsertRunnerHeartbeat } from "../lib/runner-heartbeats";
// @ts-expect-error shared runtime module is JavaScript and intentionally reused by runner and API.
import { selectDailyPrintCandidates } from "../../../../ops/shared/daily-print-candidates.mjs";
import { getCaptureProofAuditForDate } from "./insertions";
// @ts-expect-error shared runtime module is JavaScript and intentionally reused by Worker and API.
import { buildDailyPrintStatus } from "../../../../ops/shared/daily-print-status.mjs";
// @ts-expect-error shared runtime module is JavaScript and intentionally reused by Worker and API.
import { resolveDailyPrintAlertDecision } from "../../../../ops/shared/daily-print-alert-decision.mjs";

type JobKind =
  | "print-batch"
  | "print-backfill"
  | "print-single"
  | "sync-planilha"
  | "analytics-report"
  | "pi-site-export"
  | "drive-pi-ingest"
  | "drive-inventory-refresh"
  | "operational-documents"
  | "reconcile-adrotate"
  | "adrotate-link"
  | "adrotate-publish"
  | "drive-pi-reconcile"
  | "campaign-publication-reconcile"
  | "evidence-monthly-report"
  | "telegram-send-evidence"
  | "runtime-readiness-probe";

type JobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed";

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

const router: IRouter = Router();

const OPS_JOB_KINDS: JobKind[] = [
  "print-batch",
  "print-backfill",
  "print-single",
  "sync-planilha",
  "analytics-report",
  "pi-site-export",
  "drive-pi-ingest",
  "drive-inventory-refresh",
  "operational-documents",
  "reconcile-adrotate",
  "adrotate-link",
  "adrotate-publish",
  "drive-pi-reconcile",
  "campaign-publication-reconcile",
  "evidence-monthly-report",
  "telegram-send-evidence",
  "runtime-readiness-probe",
];

const OPS_JOB_STATUSES: JobStatus[] = ["queued", "ready_for_runner", "running", "completed", "failed"];
const OPS_PUBLIC_WORKER_BASE_URL = (process.env.OPS_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, "");
const ADOPS_CONTROL_PLANE_PROVIDER = (process.env.ADOPS_CONTROL_PLANE_PROVIDER || "cloudflare").trim();
const recoveryAuditGateByScheduleId = new Map<string, { complete: boolean; checkedAt: number }>();

async function readDailyPrintCandidateAudit(targetDate: string) {
  const operations = await getActiveCampaignOperations({ date: targetDate, includeEvidence: true });
  const candidates = selectDailyPrintCandidates(operations.items, targetDate);
  const insertionIds = new Set<number>(candidates
    .map((item: { adops?: { insertionId?: unknown } }) => Number(item?.adops?.insertionId))
    .filter((value: number) => Number.isInteger(value) && value > 0));
  return {
    ...await getCaptureProofAuditForDate(targetDate, { insertionIds }),
    expectedTotal: candidates.length,
  };
}

async function proxyPublicWorkerJob(req: Request, res: Response, targetPath = req.originalUrl): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const method = req.method.toUpperCase();
    const upstream = await fetch(`${OPS_PUBLIC_WORKER_BASE_URL}${targetPath}`, {
      method: req.method,
      signal: controller.signal,
      headers: {
        accept: req.header("accept") || "application/json",
        "content-type": "application/json",
        ...(req.header("authorization") ? { authorization: req.header("authorization")! } : {}),
        ...(req.header("idempotency-key") ? { "idempotency-key": req.header("idempotency-key")! } : {}),
      },
      ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(req.body ?? {}) }),
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.status(503).json({
      error: "ops_worker_unavailable",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

const D1_JOB_POST_PATHS = new Set([
  "/ops/jobs/print-batch",
  "/ops/jobs/print-backfill",
  "/ops/jobs/print-single",
  "/ops/jobs/evidence-monthly-report",
  "/ops/monthly-report-refreshes",
  "/ops/jobs/campaign-publication-reconcile",
  "/ops/jobs/drive-pi-preflight",
  "/ops/jobs/drive-pi-folder",
  "/ops/jobs/drive-pi-publish",
  "/ops/jobs/reconcile-adrotate",
  "/ops/jobs/adrotate-link",
  "/ops/jobs/adrotate-publish",
  "/ops/jobs/watchdog",
  "/ops/jobs/sync-planilha",
  "/ops/jobs/drive-inventory-refresh",
  "/ops/jobs/drive-pi-reconcile",
  "/ops/jobs/telegram-send-evidence",
  "/ops/jobs/runtime-readiness-probe",
]);

router.use((req, res, next) => {
  if (ADOPS_CONTROL_PLANE_PROVIDER === "macmini") {
    next();
    return;
  }
  const method = req.method.toUpperCase();
  if (method === "POST" && req.path === "/ops/jobs/pi-site-export") {
    void proxyPublicWorkerJob(req, res, "/api/pi-site-exports/jobs");
    return;
  }
  if (method === "POST" && (req.path === "/ops/drive-pi-events" || req.path === "/ops/drive-pi-events/status")) {
    void proxyPublicWorkerJob(req, res);
    return;
  }
  const d1Read = method === "GET" && (
    req.path === "/ops/jobs"
    || req.path === "/ops/daily-print-status"
    || req.path === "/ops/queue/overview"
    || /^\/ops\/jobs\/[^/]+(?:\/progress)?$/.test(req.path)
  );
  if (d1Read || (method === "POST" && D1_JOB_POST_PATHS.has(req.path))) {
    void proxyPublicWorkerJob(req, res);
    return;
  }
  next();
});

type RuntimeEnvCheck = {
  name: string;
  present: boolean;
  requiredFor: string;
};

type RunnerLiveness = {
  ok: boolean;
  recentRunnerWindowMinutes: number;
  hasRecentRunner: boolean;
  lastRunnerSeenAt: string | null;
  lastRunnerId: string | null;
  runners: Array<{
    runnerId: string;
    lastSeenAt: string;
    lastSeenAgeMinutes: number | null;
    recent: boolean;
    totalJobsSeen: number;
    heartbeat: boolean;
    version: string | null;
    capabilities: Record<string, unknown>;
    lastError: string | null;
  }>;
  error?: string;
};

function envIsPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function buildEnvChecks(items: Array<{ name: string; requiredFor: string }>): RuntimeEnvCheck[] {
  return items.map((item) => ({
    name: item.name,
    present: envIsPresent(item.name),
    requiredFor: item.requiredFor,
  }));
}

function anyEnvPresent(names: string[]) {
  return names.some((name) => envIsPresent(name));
}

function allEnvPresent(names: string[]) {
  return names.every((name) => envIsPresent(name));
}

function minutesSince(value: string | null, nowMs = Date.now()) {
  const ms = parseDateMs(value);
  return ms === null ? null : Math.max(0, Math.round((nowMs - ms) / 60_000));
}

async function readRunnerLiveness(recentRunnerWindowMinutes = 30): Promise<RunnerLiveness> {
  try {
    const [rows, heartbeats] = await Promise.all([
      pool.query<{ runner_id: string; last_seen_at: string; total_jobs_seen: string | number }>(
      `SELECT runner_id, MAX(updated_at)::text AS last_seen_at, COUNT(*) AS total_jobs_seen
         FROM ops_jobs
        WHERE runner_id IS NOT NULL AND runner_id <> ''
        GROUP BY runner_id
        ORDER BY MAX(updated_at) DESC
        LIMIT 10`,
      ),
      listRunnerHeartbeats(),
    ]);
    const nowMs = Date.now();
    const jobsByRunner = new Map(rows.rows.map((row) => [row.runner_id, row]));
    const ids = new Set([...rows.rows.map((row) => row.runner_id), ...heartbeats.map((row) => row.runner_id)]);
    const runners = [...ids].map((runnerId) => {
      const job = jobsByRunner.get(runnerId);
      const heartbeat = heartbeats.find((row) => row.runner_id === runnerId);
      const lastSeenAt = heartbeat?.updated_at ?? job?.last_seen_at ?? null;
      const age = minutesSince(lastSeenAt, nowMs);
      return {
        runnerId,
        lastSeenAt: lastSeenAt ?? "",
        lastSeenAgeMinutes: age,
        recent: age !== null && age <= recentRunnerWindowMinutes,
        totalJobsSeen: Number(job?.total_jobs_seen ?? 0) || 0,
        heartbeat: Boolean(heartbeat),
        version: heartbeat?.version ?? null,
        capabilities: heartbeat?.capabilities_json ?? {},
        lastError: heartbeat?.last_error ?? null,
      };
    }).sort((a, b) => (parseDateMs(b.lastSeenAt) ?? 0) - (parseDateMs(a.lastSeenAt) ?? 0));
    return {
      ok: true,
      recentRunnerWindowMinutes,
      hasRecentRunner: runners.some((runner) => runner.recent),
      lastRunnerSeenAt: runners[0]?.lastSeenAt ?? null,
      lastRunnerId: runners[0]?.runnerId ?? null,
      runners,
    };
  } catch (error) {
    return {
      ok: false,
      recentRunnerWindowMinutes,
      hasRecentRunner: false,
      lastRunnerSeenAt: null,
      lastRunnerId: null,
      runners: [],
      error: error instanceof Error ? sanitizeJobText(error.message, 2000) as string : "Falha ao consultar runner.",
    };
  }
}

function buildOpsRuntimeReadiness(
  runnerLiveness: RunnerLiveness,
  driveInventory: Awaited<ReturnType<typeof getDriveInventoryStatus>>,
) {
  const monitorMode = process.env.DRIVE_INTEGRATION_MODE === "monitor";
  const driveChecks: RuntimeEnvCheck[] = monitorMode
    ? [
        { name: "DRIVE_INTEGRATION_MODE", present: true, requiredFor: "Obrigar API e runner a consumir o snapshot do monitor interno." },
        { name: "DRIVE_INVENTORY_SNAPSHOT", present: driveInventory.snapshotStatus !== "unavailable", requiredFor: "Consultar Drive sem credencial Google na API pública." },
      ]
    : buildEnvChecks([
        { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", requiredFor: "Compatibilidade legada: leitura direta do Drive pela API." },
        { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", requiredFor: "Compatibilidade legada: leitura direta do Drive pela API." },
        { name: "GOOGLE_DRIVE_ACCESS_TOKEN", requiredFor: "Compatibilidade legada: leitura direta do Drive pela API." },
        { name: "GOOGLE_DRIVE_REFRESH_TOKEN", requiredFor: "Compatibilidade legada: renovar OAuth do Drive." },
        { name: "GOOGLE_DRIVE_CLIENT_ID", requiredFor: "Compatibilidade legada: renovar OAuth do Drive." },
        { name: "GOOGLE_DRIVE_CLIENT_SECRET", requiredFor: "Compatibilidade legada: renovar OAuth do Drive." },
      ]);
  const telegramChecks = buildEnvChecks([
    { name: "ADOPS_TELEGRAM_BOT_URL", requiredFor: "Enviar evidência pelo bridge/bot interno." },
    { name: "TELEGRAM_BOT_TOKEN", requiredFor: "Enviar evidência direto pela API do Telegram." },
    { name: "TELEGRAM_DEFAULT_GROUP_ID", requiredFor: "Enviar evidência no grupo padrão do Telegram." },
  ]);
  const authChecks = buildEnvChecks([
    { name: "OPS_API_TOKEN", requiredFor: "Autorizar jobs operacionais pela API." },
    { name: "PRIVATE_ADOPS_API_TOKEN", requiredFor: "Permitir runner chamar API privada." },
    { name: "ADOPS_INTERNAL_API_TOKEN", requiredFor: "Permitir integrações internas autenticadas." },
  ]);
  const runnerChecks = buildEnvChecks([
    { name: "PRIVATE_ADOPS_API_BASE_URL", requiredFor: "Runner chamar API privada." },
    { name: "OPS_JOB_KINDS", requiredFor: "Runner limitar tipos de job aceitos." },
    { name: "ADOPS_PERRENGUE_SSH_KEY_PATH", requiredFor: "Runner corrigir/publicar AdRotate do Perrengue por SSH/WP-CLI." },
  ]);
  const mutationChecks = buildEnvChecks([
    { name: "ADOPS_DRIVE_PI_ALLOW_MUTATION", requiredFor: "Permitir intake de PI aplicar cadastro em vez de apenas diagnosticar." },
    { name: "ADOPS_PI_AGENT_ENABLED", requiredFor: "Permitir análise assistida de PI." },
    { name: "ADOPS_PI_AGENT_AUTO_APPLY", requiredFor: "Permitir auto-aplicação quando a análise aprovar." },
    { name: "OPENAI_API_KEY", requiredFor: "Usar análise assistida de documentos quando habilitada." },
  ]);
  const driveOAuthReady = allEnvPresent(["GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"]);
  const directGoogleDriveReady = anyEnvPresent(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "GOOGLE_DRIVE_ACCESS_TOKEN"]) || driveOAuthReady;
  const googleDriveReady = monitorMode ? driveInventory.snapshotStatus !== "unavailable" : directGoogleDriveReady;
  const telegramDirectReady = allEnvPresent(["TELEGRAM_BOT_TOKEN", "TELEGRAM_DEFAULT_GROUP_ID"]);
  const telegramBridgeConfigured = envIsPresent("ADOPS_TELEGRAM_BOT_URL");
  const mutationAllowed = process.env.ADOPS_DRIVE_PI_ALLOW_MUTATION === "true";
  const warnings: string[] = [];
  if (!googleDriveReady) warnings.push(monitorMode
    ? "Snapshot do Google Drive indisponível; o último inventário não pode ser consultado."
    : "Google Drive nao esta pronto neste runtime; intake por pasta pode virar diagnostico bloqueado.");
  if (monitorMode && driveInventory.stale) warnings.push("Snapshot do Google Drive está vencido; um refresh deve ser enfileirado.");
  if (!telegramBridgeConfigured && !telegramDirectReady) warnings.push("Telegram nao esta pronto neste runtime; envio de evidencia pode falhar.");
  if (!mutationAllowed) warnings.push("Mutacao de PI por Drive esta desabilitada; intake nao deve publicar automaticamente.");
  return {
    ok: true,
    version: "adops-runtime-readiness-v1",
    generatedAt: nowIso(),
    runtime: {
      service: "adops-api",
      nodeEnv: process.env.NODE_ENV || "unknown",
      timezone: process.env.TZ || "runtime-default",
      noSecretValues: true,
      driveIntegrationMode: monitorMode ? "monitor" : "legacy",
      note: "Este endpoint retorna somente nomes e presença/ausência de variáveis. Valores de segredo nunca são expostos.",
    },
    capabilities: {
      opsApiAuthReady: envIsPresent("OPS_API_TOKEN"),
      privateApiAuthReady: anyEnvPresent(["PRIVATE_ADOPS_API_TOKEN", "ADOPS_INTERNAL_API_TOKEN"]),
      runnerRecentlySeen: runnerLiveness.hasRecentRunner,
      googleDriveReady,
      telegramReady: telegramBridgeConfigured || telegramDirectReady,
      telegramBridgeConfigured,
      telegramDirectReady,
      drivePiMutationAllowed: mutationAllowed,
      piAgentEnabled: process.env.ADOPS_PI_AGENT_ENABLED === "true",
      piAgentAutoApply: process.env.ADOPS_PI_AGENT_AUTO_APPLY === "true",
      adrotateSshConfigured: envIsPresent("ADOPS_PERRENGUE_SSH_KEY_PATH"),
    },
    services: [
      {
        id: "api",
        location: "macmini-portainer-endpoint-3",
        ready: envIsPresent("OPS_API_TOKEN") && anyEnvPresent(["PRIVATE_ADOPS_API_TOKEN", "ADOPS_INTERNAL_API_TOKEN"]),
        owns: ["rest-contracts", "postgres-control-plane", "ops-job-queue"],
        mayMutate: ["adops-postgres", "ops-job-queue"],
        mustNotOwn: ["google-drive-credentials", "wordpress-admin-credentials", "telegram-bot-token-when-bridge-is-used"],
      },
      {
        id: "runner",
        location: "macmini-portainer-endpoint-3",
        ready: runnerLiveness.hasRecentRunner,
        owns: ["job-execution", "adrotate-publication", "capture", "telegram-delivery"],
        mayMutate: ["adrotate", "wordpress-media", "cloudflare-cache", "evidence-storage"],
      },
      {
        id: "drive-monitor",
        location: "macmini-portainer-endpoint-3-internal-network",
        ready: driveInventory.snapshotStatus !== "unavailable",
        owns: ["google-drive-credentials", "drive-inventory-snapshot", "internal-file-download"],
        mayMutate: ["drive-inventory-snapshot", "ops-job-queue"],
      },
      {
        id: "perrengue-wordpress",
        location: "hostinger-vm8-portainer",
        ready: runnerLiveness.hasRecentRunner,
        readinessNote: "Acesso Portainer/WP-CLI é validado pelo job runtime-readiness-probe; heartbeat confirma apenas liveness do runner.",
        owns: ["perrengue-adrotate", "wordpress-media", "headless-rebuild-webhook"],
        mayMutate: ["perrengue-adrotate", "perrengue-wordpress-media", "perrengue-static-export"],
      },
    ],
    categories: [
      { id: "auth", title: "Autenticacao da API", checks: authChecks },
      { id: "google-drive", title: "Google Drive e PI", checks: driveChecks },
      { id: "telegram", title: "Telegram", checks: telegramChecks },
      { id: "runner", title: "Runner e Jobs", checks: runnerChecks },
      { id: "mutation-policy", title: "Politica de Mutacao", checks: mutationChecks },
    ],
    runnerLiveness,
    driveInventory,
    warnings,
  };
}

function buildRuntimeTopology() {
  return {
    version: "adops-runtime-topology-v1",
    generatedAt: nowIso(),
    noSecretValues: true,
    canonicalRepository: "https://github.com/leandrobosaipo/Campanhas-Portais",
    controlPlane: {
      host: "Mac Mini Código5",
      deployment: "Portainer endpoint 3",
      services: ["adops-api", "adops-runner", "adops-print-single-runner", "adops-drive-pi-monitor", "adops-web", "postgresql"],
    },
    edge: {
      provider: "Cloudflare",
      responsibilities: ["dns", "tunnel", "access", "selective-cache-purge"],
      prohibitedResponsibilities: ["google-drive-credential-owner", "adrotate-database-owner", "long-running-capture-runner"],
    },
    perrengue: {
      host: "Hostinger VM8",
      deployment: "Portainer VM8",
      wordpressContainer: "cod5-pro119-perrenguematogrosso-app",
      wordpressPath: "/app/web/wp",
      flow: ["adops-api", "runner", "portainer-vm8", "wordpress-adrotate", "headless-rebuild-webhook", "static-public-site"],
    },
    credentialOwnership: {
      googleDrive: "adops-drive-pi-monitor",
      operationsApi: "adops-api-and-authorized-clients",
      internalApi: "api-runner-monitor-service-to-service",
      adrotateAndWordpress: "adops-runner",
      telegram: "adops-runner-or-internal-bridge",
    },
    mutationPolicy: {
      defaultMode: "preview",
      requirements: ["explicit-apply", "validated-input", "idempotency-key", "audit-log"],
      sourceConflict: "block-until-human-confirmation",
      driveWebViewLinkAsMedia: "prohibited",
    },
  };
}

const JOB_STAGE_LABELS: Record<JobKind, Record<string, string>> = {
  "print-batch": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando prints",
    completed: "Concluido",
    failed: "Falhou",
  },
  "print-backfill": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando retroativos",
    completed: "Concluido",
    failed: "Falhou",
  },
  "print-single": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando print",
    completed: "Concluido",
    failed: "Falhou",
  },
  "sync-planilha": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Sincronizando planilha",
    completed: "Concluido",
    failed: "Falhou",
  },
  "analytics-report": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando Analytics",
    completed: "Concluido",
    failed: "Falhou",
  },
  "pi-site-export": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Montando pacote PI/site",
    completed: "Concluido",
    failed: "Falhou",
  },
  "drive-pi-ingest": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    intake_locked: "Processo automatico iniciado",
    packaging: "Conferindo pacote",
    agent_analysis: "Analisando PI com IA",
    compressing_video: "Comprimindo video",
    uploading_video: "Publicando video no CDN",
    applying: "Aplicando campanha no AdOps",
    syncing: "Sincronizando planilha e AdRotate",
    applied: "Campanha aplicada",
    needs_review: "Precisa revisao",
    completed: "Concluido",
    failed: "Falhou",
  },
  "drive-inventory-refresh": {
    queued: "Na fila",
    ready_for_runner: "Aguardando monitor do Drive",
    running: "Atualizando inventário do Drive",
    scanning: "Lendo arquivos do Drive",
    syncing: "Persistindo snapshot",
    completed: "Inventário do Drive atualizado",
    failed: "Falha ao atualizar inventário do Drive",
  },
  "operational-documents": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando documentos",
    completed: "Concluido",
    failed: "Falhou",
  },
  "reconcile-adrotate": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Conferindo planilha e AdRotate",
    completed: "Concluido",
    failed: "Falhou",
  },
  "adrotate-link": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Vinculando anuncio AdRotate",
    completed: "Vinculo AdRotate concluido",
    failed: "Falha no vinculo AdRotate",
  },
  "adrotate-publish": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Publicando anuncio AdRotate",
    resolving_contract: "Resolvendo checklist",
    publishing: "Criando ou atualizando anuncio",
    purging_cache: "Limpando cache do portal",
    generating_evidence: "Gerando evidencia",
    completed: "Publicacao AdRotate concluida",
    failed: "Falha na publicacao AdRotate",
  },
  "campaign-publication-reconcile": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner do Drive",
    running: "Reavaliando campanhas bloqueadas",
    completed: "Retomada de campanhas conferida",
    failed: "Falha na retomada de campanhas",
  },
  "evidence-monthly-report": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Gerando relatório de evidências",
    completed: "Concluído",
    failed: "Falhou",
  },
  "telegram-send-evidence": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Enviando evidencia no Telegram",
    completed: "Concluido",
    failed: "Falhou",
  },
  "drive-pi-reconcile": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Comparando fontes",
    preview_ready: "Preview pronto",
    applying: "Aplicando confirmação",
    completed: "Concluido",
    failed: "Falhou",
  },
  "runtime-readiness-probe": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Conferindo prontidao do runner",
    completed: "Prontidao do runner conferida",
    failed: "Falha na prontidao do runner",
  },
};

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeJobText(value: unknown, maxLength = 12000) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(authorization|cookie|set-cookie|x-api-key|x-adops-api-token)\s*:\s*[^\r\n,}]+/gi, "$1: [redacted]")
    .replace(/([?&](?:access_)?(?:token|api[_-]?key|secret|password|authorization|cookie)=)[^&#\s]+/gi, "$1[redacted]")
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
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isSensitiveJobKey(key) ? "[redacted]" : sanitizeJobValue(item)]));
  }
  return value;
}

function isSensitiveJobKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.includes("authorization")
    || normalized.endsWith("token")
    || normalized.endsWith("apikey")
    || normalized.endsWith("secret")
    || normalized.endsWith("password")
    || normalized.endsWith("passwd")
    || normalized.endsWith("cookie")
    || normalized === "bearer";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function parseIsoDate(value: unknown) {
  const raw = readOptionalString(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function parseIsoTimestamp(value: unknown) {
  const raw = readOptionalString(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function readNumber(candidates: unknown[], keys: string[]): number | null {
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    }
  }
  return null;
}

function readString(candidates: unknown[], keys: string[]): string | null {
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackStageByStatus(status: JobStatus) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return status;
}

function fallbackPercentByStatus(status: JobStatus) {
  if (status === "completed") return 100;
  if (status === "failed") return 100;
  if (status === "running") return 50;
  return 5;
}

function titleFromStageKey(stageKey: string) {
  return stageKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((item) => item.slice(0, 1).toUpperCase() + item.slice(1))
    .join(" ");
}

function resolveStageLabel(kind: JobKind, stageKey: string, status: JobStatus) {
  const byKind = JOB_STAGE_LABELS[kind] ?? {};
  return byKind[stageKey] ?? byKind[status] ?? titleFromStageKey(stageKey);
}

function describeJob(record: OpsJobRecord) {
  return {
    id: record.id,
    jobId: record.id,
    kind: record.kind,
    status: record.status,
    payload: sanitizeJobValue(parseJson(record.payload_json)),
    result: sanitizeJobValue(parseJson(record.result_json)),
    error: sanitizeJobText(record.error_text),
    requestedBy: record.requested_by,
    runnerId: record.runner_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function computeJobProgress(job: ReturnType<typeof describeJob>) {
  const result = asRecord(job.result);
  const execution = asRecord(result?.["execution"]);
  const progress = asRecord(result?.["progress"]) ?? asRecord(execution?.["progress"]);
  const candidates: unknown[] = [progress, execution, result];
  const stageKey = readString(candidates, ["stageKey", "stage", "currentStage", "step", "current_step"]) ?? fallbackStageByStatus(job.status);
  const itemsDoneRaw = readNumber(candidates, ["itemsDone", "done", "processed", "completedItems", "countDone"]);
  const itemsTotalRaw = readNumber(candidates, ["itemsTotal", "total", "totalItems", "countTotal"]);
  const itemsDone = Math.max(0, Math.round(itemsDoneRaw ?? 0));
  const itemsTotal = Math.max(0, Math.round(itemsTotalRaw ?? 0));
  let percentTotalRaw = readNumber(candidates, ["percentTotal", "totalPercent", "progress", "overallPercent", "percentage"]);
  let percentStageRaw = readNumber(candidates, ["percentStage", "stagePercent", "stepPercent", "currentPercent"]);
  if (percentTotalRaw === null && itemsTotal > 0) percentTotalRaw = (itemsDone / itemsTotal) * 100;
  if (percentTotalRaw === null) percentTotalRaw = fallbackPercentByStatus(job.status);
  if (percentStageRaw === null) percentStageRaw = percentTotalRaw;
  const startedAt = readString(candidates, ["startedAt", "started_at", "started"]) ?? (job.status === "queued" || job.status === "ready_for_runner" ? null : job.createdAt);
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
  const longRunning = kind === "analytics-report" || kind === "pi-site-export" || kind === "drive-pi-ingest" || kind === "drive-inventory-refresh" || kind === "adrotate-publish";
  if (status === "queued" || status === "ready_for_runner") {
    return longRunning ? 30 * 60_000 : 15 * 60_000;
  }
  if (status === "running") {
    return longRunning ? 120 * 60_000 : 30 * 60_000;
  }
  return Number.POSITIVE_INFINITY;
}

function buildWatchdogFailure(record: OpsJobRecord, detectedAt: string) {
  const errorCode = record.status === "running" ? "expired" : "queue_timeout";
  return {
    error: `Watchdog marcou falha automatica: ${record.status} excedeu o tempo limite de ${record.kind}.`,
    result: {
      ok: false,
      watchdog: true,
      incidentLayer: record.status === "running" ? "runner" : "queue",
      errorCode,
      previousStatus: record.status,
      partialResult: parseJson(record.result_json),
      detectedAt,
      ageMinutes: Math.round(getJobAgeMs(record) / 60_000),
      timeoutMinutes: Math.round(getJobTimeoutMs(record.kind, record.status) / 60_000),
      note: "Job antigo demais para continuar como ativo. Reenvie a operacao se ainda for necessaria.",
    },
  };
}

function validateDrivePiEvent(body: Record<string, unknown>): DrivePiEventPayload | null {
  const driveFileId = readOptionalString(body["driveFileId"]);
  const name = readOptionalString(body["name"]);
  const mimeType = readOptionalString(body["mimeType"]);
  const path = readOptionalString(body["path"]);
  const modifiedTime = readOptionalString(body["modifiedTime"]);
  const eventTypeRaw = readOptionalString(body["eventType"]);
  const allowedEventTypes: DrivePiEventType[] = ["created", "updated", "folder_created", "folder_updated"];
  const eventType = allowedEventTypes.includes(eventTypeRaw as DrivePiEventType) ? eventTypeRaw as DrivePiEventType : null;
  if (!driveFileId || !name || !mimeType || !path || !modifiedTime || Number.isNaN(Date.parse(modifiedTime)) || !eventType) return null;
  const eventId = readOptionalString(body["eventId"]) ?? `drive:${driveFileId}:${modifiedTime}`;
  if (!/^drive:[A-Za-z0-9_-]+:.+/.test(eventId)) return null;
  return {
    eventId,
    driveFileId,
    name,
    mimeType,
    path,
    parentFolderId: readOptionalString(body["parentFolderId"]),
    modifiedTime,
    webViewLink: readOptionalString(body["webViewLink"]),
    eventType,
    ...(body["parsedPi"] !== undefined ? { parsedPi: body["parsedPi"] } : {}),
    ...(body["simulation"] !== undefined ? { simulation: body["simulation"] } : {}),
    ...(body["preflightOnly"] === true ? { preflightOnly: true } : {}),
    ...(body["explicitFolder"] === true ? { explicitFolder: true } : {}),
    ...(typeof body["resolveMedia"] === "boolean" ? { resolveMedia: body["resolveMedia"] } : {}),
    ...(typeof body["strictInsertionScope"] === "boolean" ? { strictInsertionScope: body["strictInsertionScope"] } : {}),
    ...(typeof body["allowPdfInsertions"] === "boolean" ? { allowPdfInsertions: body["allowPdfInsertions"] } : {}),
    ...(typeof body["publish"] === "boolean" ? { publish: body["publish"] } : {}),
    ...(typeof body["generateEvidence"] === "boolean" ? { generateEvidence: body["generateEvidence"] } : {}),
    ...(typeof body["purgeCache"] === "boolean" ? { purgeCache: body["purgeCache"] } : {}),
    ...(readOptionalString(body["source"]) ? { source: readOptionalString(body["source"]) as string } : {}),
  };
}

async function createOpsJob(kind: JobKind, payload: Record<string, unknown>, requestedBy: string | null) {
  const id = randomUUID();
  const now = nowIso();
  await pool.query(
    `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
     VALUES ($1, $2, 'ready_for_runner', $3, NULL, NULL, $4, NULL, $5, $6)`,
    [id, kind, JSON.stringify(payload), requestedBy, now, now],
  );
  return id;
}

async function createIdempotentOpsJob(kind: JobKind, payload: Record<string, unknown>, requestedBy: string | null, idempotencyKey: string, activeOnly = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ops-job:${kind}:${idempotencyKey}`]);
    const existing = await client.query<{ id: string; status: JobStatus; not_before: string | null }>(
      `SELECT id, status, payload_json::jsonb ->> 'notBefore' AS not_before
         FROM ops_jobs
        WHERE kind = $1
          AND payload_json::jsonb ->> 'idempotencyKey' = $2
          AND (NOT $3::boolean OR status IN ('queued', 'ready_for_runner'))
        ORDER BY created_at DESC
        LIMIT 1`,
      [kind, idempotencyKey, activeOnly],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return {
        jobId: existing.rows[0].id,
        status: existing.rows[0].status,
        duplicate: true,
        existingNotBefore: existing.rows[0].not_before,
      };
    }
    const jobId = randomUUID();
    const createdAt = nowIso();
    await client.query(
      `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
       VALUES ($1, $2, 'ready_for_runner', $3, NULL, NULL, $4, NULL, $5, $6)`,
      [jobId, kind, JSON.stringify({ ...payload, idempotencyKey }), requestedBy, createdAt, createdAt],
    );
    await client.query("COMMIT");
    return { jobId, status: "ready_for_runner" as const, duplicate: false, existingNotBefore: null };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function competenciaForDate(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return null;
  const months = ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  return `${months[Number(match[2])]}\/${match[1]}`;
}

router.post("/ops/schedules/reconcile", async (req, res): Promise<void> => {
  const dryRun = req.body?.dryRun === true || req.body?.shadow === true;
  const requestedNow = validateDryRunNow(dryRun, req.body?.now);
  if (requestedNow === undefined) {
    res.status(400).json({ error: "bad_request", details: "now deve ser um instante ISO válido e só é aceito em dry-run." });
    return;
  }
  const scheduled = resolveCanonicalSchedule(requestedNow ?? new Date());
  const recoveryGateRequired = scheduled.some((decision) => decision.due
    && ["daily-print-recovery", "daily-print-morning-recovery"].includes(decision.routineKind));
  const decisions = dryRun
    ? scheduled
    : await suppressCompletedPrintRecoveries(scheduled, readDailyPrintCandidateAudit, recoveryAuditGateByScheduleId);
  const results = await reconcileDueSchedules(decisions, async (input) => {
    if (dryRun) return { jobId: `dry-run:${input.scheduleId}`, created: true };
    if (!input.jobKind) throw new Error(`Rotina sem jobKind: ${input.routineKind}`);
    const created = await createIdempotentOpsJob(input.jobKind, {
      ...input,
      date: input.targetDate,
      ...(input.routineKind === "daily-print-morning-recovery" ? { recoveryMode: "late_publication_recovery" } : {}),
      ...(input.jobKind === "evidence-monthly-report" ? { competencia: competenciaForDate(input.targetDate) } : {}),
      source: "macmini-canonical-scheduler",
    }, req.body?.shadow === true ? "cloudflare-shadow" : "macmini-scheduler", input.idempotencyKey);
    return { jobId: created.jobId, created: !created.duplicate };
  });
  res.status(dryRun || results.every((item) => item.outcome !== "created") ? 200 : 202).json({
    ok: true,
    dryRun,
    auditGateEvaluated: !dryRun && recoveryGateRequired,
    timezone: "America/Cuiaba",
    decisions: results,
  });
});

async function getOpsJob(id: string) {
  const result = await pool.query<OpsJobRecord>("SELECT * FROM ops_jobs WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? describeJob(result.rows[0]) : null;
}

async function updateOpsJob(id: string, patch: {
  status?: JobStatus;
  result?: unknown;
  error?: string | null;
  runnerId?: string | null;
  expectedStatus?: JobStatus;
  expectedRunnerId?: string | null;
  expectedUpdatedAt?: string;
}) {
  const current = await pool.query<OpsJobRecord>("SELECT * FROM ops_jobs WHERE id = $1 LIMIT 1", [id]);
  const record = current.rows[0];
  if (!record) return null;
  const status = patch.status ?? record.status;
  const resultJson = patch.result === undefined ? record.result_json : JSON.stringify(patch.result);
  const errorText = patch.error === undefined ? record.error_text : patch.error;
  const runnerId = patch.runnerId === undefined ? record.runner_id : patch.runnerId;
  const updatedAt = nowIso();
  const updated = await pool.query<OpsJobRecord>(
    `UPDATE ops_jobs
       SET status = $1, result_json = $2, error_text = $3, runner_id = $4, updated_at = $5
     WHERE id = $6
       AND ($7::text IS NULL OR status = $7)
       AND ($8::text IS NULL OR runner_id = $8)
       AND ($9::text IS NULL OR updated_at = $9)
     RETURNING *`,
    [status, resultJson, errorText, runnerId, updatedAt, id, patch.expectedStatus ?? null, patch.expectedRunnerId ?? null, patch.expectedUpdatedAt ?? null],
  );
  return updated.rows[0] ?? null;
}

async function createDrivePiEventJob(event: DrivePiEventPayload, requestedBy: string | null) {
  const existing = await pool.query<{ event_id: string; job_id: string | null; status: string }>(
    "SELECT event_id, job_id, status FROM cod5_drive_events WHERE event_id = $1 LIMIT 1",
    [event.eventId],
  );
  if (existing.rows[0]) {
    return {
      duplicate: true,
      eventId: existing.rows[0].event_id,
      jobId: existing.rows[0].job_id,
      status: existing.rows[0].status,
      documentId: null,
    };
  }

  const documentId = randomUUID();
  const now = nowIso();
  const jobId = await createOpsJob("drive-pi-ingest", { ...event, documentId, source: event.source ?? "google-drive-monitor" }, requestedBy);

  await pool.query(
    `INSERT INTO cod5_drive_events
      (event_id, drive_file_id, name, mime_type, path, parent_folder_id, modified_time, web_view_link, event_type, payload_json, job_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ready_for_runner', $12, $13)`,
    [
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
    ],
  );

  await pool.query(
    `INSERT INTO cod5_inbound_documents
      (id, source, event_id, drive_file_id, original_name, mime_type, path, web_view_link, content_sha256, status, created_at, updated_at)
     VALUES ($1, 'google-drive', $2, $3, $4, $5, $6, $7, NULL, 'ready_for_runner', $8, $9)`,
    [documentId, event.eventId, event.driveFileId, event.name, event.mimeType, event.path, event.webViewLink, now, now],
  );

  return { duplicate: false, eventId: event.eventId, jobId, status: "ready_for_runner", documentId };
}

router.post("/ops/drive-pi-events", async (req, res): Promise<void> => {
  const event = validateDrivePiEvent(req.body ?? {});
  if (!event) {
    res.status(400).json({ error: "bad_request", details: "Evento Drive PI invalido." });
    return;
  }
  const result = await createDrivePiEventJob(event, "google-drive-monitor");
  res.status(result.duplicate ? 200 : 202).json({ ok: true, kind: "drive-pi-ingest", ...result });
});

router.post("/ops/drive-pi-events/status", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const eventId = readOptionalString(body.eventId);
  const documentId = readOptionalString(body.documentId);
  const status = readOptionalString(body.status);
  const allowedStatuses = ["received", "queued", "ready_for_runner", "intake_locked", "packaging", "agent_analysis", "parsed", "validated", "applying", "applied", "needs_review", "failed"];
  if (!eventId || !status || !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "bad_request", details: "eventId/status invalidos." });
    return;
  }
  const now = nowIso();
  await pool.query("UPDATE cod5_drive_events SET status = $1, updated_at = $2 WHERE event_id = $3", [status, now, eventId]);
  if (documentId) {
    await pool.query(
      "UPDATE cod5_inbound_documents SET status = $1, content_sha256 = COALESCE($2, content_sha256), updated_at = $3 WHERE id = $4",
      [status, readOptionalString(body.contentSha256), now, documentId],
    );
  }
  const parseRun = asRecord(body.parseRun);
  if (documentId && parseRun) {
    await pool.query(
      `INSERT INTO cod5_document_parse_runs
        (id, document_id, status, fields_json, alerts_json, raw_text_excerpt, error_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        documentId,
        status,
        JSON.stringify(parseRun.fields ?? null),
        JSON.stringify(parseRun.alerts ?? []),
        readOptionalString(parseRun.rawTextExcerpt),
        readOptionalString(parseRun.error),
        now,
        now,
      ],
    );
  }
  res.json({ ok: true, eventId, documentId: documentId ?? null, status });
});

router.get("/ops/drive-inventory/status", async (_req, res): Promise<void> => {
  res.json({ ok: true, ...(await getDriveInventoryStatus()) });
});

router.post("/ops/jobs/drive-inventory-refresh", async (_req, res): Promise<void> => {
  const result = await enqueueDriveInventoryRefresh("ops-api");
  res.status(result.duplicate ? 200 : 202).json({
    ok: true,
    kind: "drive-inventory-refresh",
    ...result,
  });
});

router.post("/ops/drive-inventory/sync", async (req, res): Promise<void> => {
  const scanId = readOptionalString(req.body?.scanId);
  const rootFolderId = readOptionalString(req.body?.rootFolderId);
  const scannedAt = readOptionalString(req.body?.scannedAt);
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!scanId || !rootFolderId || !scannedAt || !rawItems || rawItems.length > 5000) {
    res.status(400).json({ error: "bad_request", details: "scanId, rootFolderId, scannedAt e items (máximo 5000) são obrigatórios." });
    return;
  }
  const items: DriveInventoryItemInput[] = [];
  for (const raw of rawItems) {
    const item = asRecord(raw);
    const driveFileId = readOptionalString(item?.["driveFileId"]);
    const name = readOptionalString(item?.["name"]);
    const mimeType = readOptionalString(item?.["mimeType"]);
    const itemPath = readOptionalString(item?.["path"]);
    const modifiedTime = readOptionalString(item?.["modifiedTime"]);
    if (!driveFileId || !name || !mimeType || !itemPath || !modifiedTime) {
      res.status(400).json({ error: "bad_request", details: "Item inválido no snapshot do Drive." });
      return;
    }
    items.push({
      driveFileId,
      name,
      mimeType,
      path: itemPath,
      parentFolderId: readOptionalString(item?.["parentFolderId"]),
      modifiedTime,
      webViewLink: readOptionalString(item?.["webViewLink"]),
      size: readOptionalString(item?.["size"]),
      checksum: readOptionalString(item?.["checksum"]),
    });
  }
  const result = await syncDriveInventory({ scanId, rootFolderId, scannedAt, items });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
});

router.get("/ops/jobs", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const statuses = String(req.query.status ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is JobStatus => OPS_JOB_STATUSES.includes(item as JobStatus));
  const kinds = String(req.query.kind ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is JobKind => OPS_JOB_KINDS.includes(item as JobKind));
  const where: string[] = [];
  const values: unknown[] = [];
  if (statuses.length) {
    values.push(statuses);
    where.push(`status = ANY($${values.length})`);
  }
  if (kinds.length) {
    values.push(kinds);
    where.push(`kind = ANY($${values.length})`);
  }
  values.push(limit);
  const sql = `SELECT * FROM ops_jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${values.length}`;
  const result = await pool.query<OpsJobRecord>(sql, values);
  res.json({ items: result.rows.map(describeJob) });
});

router.get("/ops/jobs/:id/progress", async (req, res): Promise<void> => {
  const job = await getOpsJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "not_found", details: "Job not found" });
    return;
  }
  res.json(computeJobProgress(job));
});

router.get("/ops/jobs/:id", async (req, res): Promise<void> => {
  const job = await getOpsJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "not_found", details: "Job not found" });
    return;
  }
  res.json(job);
});

router.post("/ops/runner/claim-next", async (req, res): Promise<void> => {
  const requestedKinds = Array.isArray(req.body?.kinds)
    ? req.body.kinds.filter((item: unknown): item is JobKind => OPS_JOB_KINDS.includes(String(item) as JobKind))
    : null;
  const runnerId = readOptionalString(req.body?.runnerId);
  if (!runnerId || !requestedKinds?.length) {
    res.status(400).json({ error: "bad_request", details: "runnerId e ao menos um kind válido são obrigatórios." });
    return;
  }
  const values: unknown[] = [];
  let kindFilter = "";
  values.push(requestedKinds);
  kindFilter = `AND kind = ANY($${values.length}::text[])`;
  const claimedAt = nowIso();
  const result = await pool.query<OpsJobRecord>(
    `UPDATE ops_jobs
       SET status = 'running',
           runner_id = $${values.length + 1},
           error_text = NULL,
           payload_json = (payload_json::jsonb || jsonb_build_object('claimedAt', $${values.length + 2}::text, 'heartbeatAt', $${values.length + 2}::text))::text,
           updated_at = $${values.length + 2}
     WHERE id = (
       SELECT id FROM ops_jobs
       WHERE status = 'ready_for_runner' ${kindFilter}
         AND (payload_json::jsonb ->> 'notBefore' IS NULL OR payload_json::jsonb ->> 'notBefore' <= $${values.length + 2})
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [...values, runnerId, claimedAt],
  );
  res.json({ ok: true, job: result.rows[0] ? describeJob(result.rows[0]) : null });
});

router.post("/ops/runner/jobs/:id/progress", async (req, res): Promise<void> => {
  const runnerId = readOptionalString(req.body?.runnerId);
  if (!runnerId) {
    res.status(400).json({ error: "bad_request", details: "runnerId é obrigatório." });
    return;
  }
  const updated = await updateOpsJob(req.params.id, {
    result: req.body?.result ?? null,
    runnerId: runnerId ?? undefined,
    expectedStatus: "running",
    expectedRunnerId: runnerId,
  });
  res.status(updated ? 200 : 409).json(updated ? { ok: true, job: describeJob(updated) } : { error: "lease_lost", details: "Job não está running para este runner." });
});

router.post("/ops/runner/jobs/:id/complete", async (req, res): Promise<void> => {
  const runnerId = readOptionalString(req.body?.runnerId);
  if (!runnerId) {
    res.status(400).json({ error: "bad_request", details: "runnerId é obrigatório." });
    return;
  }
  const updated = await updateOpsJob(req.params.id, {
    status: "completed",
    result: req.body?.result ?? { ok: true },
    error: null,
    runnerId: runnerId ?? undefined,
    expectedStatus: "running",
    expectedRunnerId: runnerId,
  });
  res.status(updated ? 200 : 409).json(updated ? { ok: true, job: describeJob(updated) } : { error: "lease_lost", details: "Job não está running para este runner." });
});

router.post("/ops/runner/jobs/:id/fail", async (req, res): Promise<void> => {
  const runnerId = readOptionalString(req.body?.runnerId);
  if (!runnerId) {
    res.status(400).json({ error: "bad_request", details: "runnerId é obrigatório." });
    return;
  }
  const updated = await updateOpsJob(req.params.id, {
    status: "failed",
    result: req.body?.result ?? null,
    error: readOptionalString(req.body?.error) ?? "Runner reportou falha sem detalhe.",
    runnerId: runnerId ?? undefined,
    expectedStatus: "running",
    expectedRunnerId: runnerId,
  });
  res.status(updated ? 200 : 409).json(updated ? { ok: true, job: describeJob(updated) } : { error: "lease_lost", details: "Job não está running para este runner." });
});

router.post("/ops/jobs/watchdog", async (req, res): Promise<void> => {
  const dryRun = Boolean(req.body?.dryRun);
  const limit = Math.min(Number(req.body?.limit) || 200, 500);
  const active = await pool.query<OpsJobRecord>(
    "SELECT * FROM ops_jobs WHERE status IN ('queued','ready_for_runner','running') ORDER BY created_at ASC LIMIT $1",
    [limit],
  );
  const stale: OpsJobRecord[] = active.rows.filter((record: OpsJobRecord) => getJobAgeMs(record) >= getJobTimeoutMs(record.kind, record.status));
  const recoveries: Array<{ parentJobId: string; jobId: string; attempt: number }> = [];
  if (!dryRun) {
    for (const record of stale) {
      const failure = buildWatchdogFailure(record, nowIso());
      const failed = await updateOpsJob(record.id, {
        status: "failed",
        error: failure.error,
        result: failure.result,
        runnerId: record.runner_id,
        expectedStatus: record.status,
        expectedUpdatedAt: record.updated_at,
      });
      if (!failed) continue;
      if (record.status !== "running") continue;
      const retry = buildRetryJobInput({
        parentJobId: record.id,
        jobKind: record.kind,
        payload: (parseJson(record.payload_json) ?? {}) as Record<string, unknown>,
        failedAt: failure.result.detectedAt,
        errorCode: failure.result.errorCode,
      });
      if (!retry || !OPS_JOB_KINDS.includes(retry.jobKind as JobKind)) continue;
      const created = await createIdempotentOpsJob(
        retry.jobKind as JobKind,
        {
          ...retry.payload,
          notBefore: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
        "watchdog-recovery",
        retry.idempotencyKey,
      );
      if (!created.duplicate) {
        recoveries.push({ parentJobId: record.id, jobId: created.jobId, attempt: Number(retry.payload.attempt) });
      }
    }
  }
  res.json({
    ok: true,
    dryRun,
    checked: active.rows.length,
    staleCount: stale.length,
    failedCount: dryRun ? 0 : stale.length,
    recoveries,
    stale: stale.map((record: OpsJobRecord) => ({
      id: record.id,
      kind: record.kind,
      status: record.status,
      ageMinutes: Math.round(getJobAgeMs(record) / 60_000),
      requestedBy: record.requested_by,
      runnerId: record.runner_id,
    })),
  });
});

router.get("/ops/queue/overview", async (_req, res): Promise<void> => {
  const [active, heartbeats] = await Promise.all([
    pool.query<OpsJobRecord>("SELECT * FROM ops_jobs WHERE status IN ('running','queued','ready_for_runner') ORDER BY created_at ASC"),
    listRunnerHeartbeats().catch(() => []),
  ]);
  const described: Array<ReturnType<typeof describeJob>> = active.rows.map(describeJob);
  const running = described.filter((job: ReturnType<typeof describeJob>) => job.status === "running");
  const queue = described.filter((job: ReturnType<typeof describeJob>) => job.status === "queued" || job.status === "ready_for_runner");
  const totals = await pool.query<{
    running: string | number | null;
    queued: string | number | null;
    ready_for_runner: string | number | null;
    completed_today: string | number | null;
    failed_today: string | number | null;
  }>(
    `SELECT
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
       SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
       SUM(CASE WHEN status = 'ready_for_runner' THEN 1 ELSE 0 END) AS ready_for_runner,
       SUM(CASE WHEN status = 'completed' AND (updated_at::timestamptz AT TIME ZONE 'America/Cuiaba')::date = (now() AT TIME ZONE 'America/Cuiaba')::date THEN 1 ELSE 0 END) AS completed_today,
       SUM(CASE WHEN status = 'failed' AND (updated_at::timestamptz AT TIME ZONE 'America/Cuiaba')::date = (now() AT TIME ZONE 'America/Cuiaba')::date THEN 1 ELSE 0 END) AS failed_today
     FROM ops_jobs`,
  );
  const row = totals.rows[0] ?? {};
  const heartbeatRows = heartbeats as Awaited<ReturnType<typeof listRunnerHeartbeats>>;
  const recentHeartbeatWindowMs = 30 * 60_000;
  const recentHeartbeats = heartbeatRows.filter((heartbeat) => (
    heartbeat.updated_at && Date.now() - Date.parse(heartbeat.updated_at) <= recentHeartbeatWindowMs
  ));
  res.json({
    now: running[0] ?? null,
    queue,
    scheduled: [],
    totals: {
      running: Number(row.running ?? 0) || 0,
      queued: Number(row.queued ?? 0) || 0,
      readyForRunner: Number(row.ready_for_runner ?? 0) || 0,
      completedToday: Number(row.completed_today ?? 0) || 0,
      failedToday: Number(row.failed_today ?? 0) || 0,
    },
    runners: {
      lastHeartbeatAt: heartbeatRows[0]?.updated_at ?? null,
      hasRecentRunner: heartbeatRows.length ? recentHeartbeats.length > 0 : null,
      count: recentHeartbeats.length || null,
      registeredCount: heartbeatRows.length || null,
    },
    scheduler: buildSchedulerReadback(new Date(), ADOPS_CONTROL_PLANE_PROVIDER),
  });
});

router.get("/ops/daily-print-status", async (req, res): Promise<void> => {
  const targetDate = readOptionalString(req.query.date);
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    res.status(400).json({ error: "bad_request", details: "date deve estar em YYYY-MM-DD." });
    return;
  }
  const result = await pool.query<OpsJobRecord>(
    `SELECT * FROM ops_jobs
      WHERE kind = 'print-batch'
      ORDER BY created_at DESC
      LIMIT 100`,
  );
  res.json(buildDailyPrintStatus({ jobs: result.rows.map(describeJob), now: new Date(), targetDate }));
});

router.get("/ops/daily-print-alerts/evaluate", (_req, res): void => {
  res.json(resolveDailyPrintAlertDecision(new Date()));
});

router.post("/ops/daily-print-alerts/claim", async (req, res): Promise<void> => {
  const date = readOptionalString(req.body?.date);
  const state = readOptionalString(req.body?.state);
  const pendingInsertionIds = Array.isArray(req.body?.pendingInsertionIds)
    ? (req.body.pendingInsertionIds as unknown[])
      .map((item: unknown) => readOptionalNumber(item))
      .filter((item: number | null): item is number => item !== null)
      .sort((a: number, b: number) => a - b)
    : [];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !state) {
    res.status(400).json({ error: "bad_request", details: "date e state são obrigatórios." });
    return;
  }
  const previous = await pool.query<{ total: string | number }>(
    "SELECT COUNT(*) AS total FROM daily_print_alerts WHERE target_date = $1",
    [date],
  );
  if (state === "resolved" && Number(previous.rows[0]?.total ?? 0) === 0) {
    res.json({ ok: true, claimed: false, reason: "no_previous_incident" });
    return;
  }
  const fingerprint = `${date}:${state}:${pendingInsertionIds.join(",")}`;
  const inserted = await pool.query(
    `INSERT INTO daily_print_alerts (fingerprint, target_date, state, pending_ids_json, claimed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fingerprint) DO NOTHING`,
    [fingerprint, date, state, JSON.stringify(pendingInsertionIds), nowIso()],
  );
  res.json({ ok: true, claimed: inserted.rowCount === 1 });
});

router.get("/ops/runtime-readiness", async (_req, res): Promise<void> => {
  const [runnerLiveness, driveInventory] = await Promise.all([
    readRunnerLiveness(),
    getDriveInventoryStatus(),
  ]);
  res.json(buildOpsRuntimeReadiness(runnerLiveness, driveInventory));
});

router.get("/ops/runtime-topology", (_req, res): void => {
  res.json(buildRuntimeTopology());
});

router.post("/ops/runner/heartbeat", async (req, res): Promise<void> => {
  const runnerId = readOptionalString(req.body?.runnerId);
  if (!runnerId || !/^[a-zA-Z0-9._:-]{1,120}$/.test(runnerId)) {
    res.status(400).json({ error: "bad_request", details: "runnerId inválido." });
    return;
  }
  const rawCapabilities = asRecord(req.body?.capabilities) ?? {};
  const capabilities = {
    jobKinds: Array.isArray(rawCapabilities.jobKinds)
      ? rawCapabilities.jobKinds.filter((value): value is string => typeof value === "string").slice(0, 30).map((value) => value.slice(0, 80))
      : [],
    driveMonitorEnabled: rawCapabilities.driveMonitorEnabled === true,
    healthPortEnabled: rawCapabilities.healthPortEnabled === true,
  };
  await upsertRunnerHeartbeat({
    runnerId,
    version: readOptionalString(req.body?.version),
    capabilities,
    lastCycleAt: parseIsoTimestamp(req.body?.lastCycleAt) ?? nowIso(),
    lastSuccessAt: parseIsoTimestamp(req.body?.lastSuccessAt),
    lastError: sanitizeJobText(readOptionalString(req.body?.lastError), 1000) as string | null,
  });
  const jobId = readOptionalString(req.body?.jobId);
  const heartbeatAt = parseIsoTimestamp(req.body?.heartbeatAt) ?? nowIso();
  let jobLease: { jobId: string; accepted: boolean } | null = null;
  if (jobId) {
    const updated = await pool.query(
      `UPDATE ops_jobs
          SET payload_json = (payload_json::jsonb || jsonb_build_object('heartbeatAt', $1::text))::text,
              updated_at = $1
        WHERE id = $2 AND runner_id = $3 AND status = 'running'`,
      [heartbeatAt, jobId, runnerId],
    );
    jobLease = { jobId, accepted: updated.rowCount === 1 };
  }
  res.status(jobLease && !jobLease.accepted ? 409 : 200).json({
    ok: !jobLease || jobLease.accepted,
    ...(jobLease && !jobLease.accepted ? { error: "lease_lost" } : {}),
    runnerId,
    receivedAt: nowIso(),
    jobLease,
  });
});

router.get("/ops/api-catalog", (_req, res): void => {
  res.json(buildOpsApiCatalog());
});

router.get("/ops/openapi.json", (_req, res): void => {
  res.json(buildOpsOpenApiDocument());
});

router.get("/ops/docs", (_req, res): void => {
  res.type("html").send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AdOps Ops API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #f8fafc; }
    .topbar { display: none; }
    .cod5-header {
      padding: 18px 24px;
      border-bottom: 1px solid #e2e8f0;
      background: #fff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .cod5-header h1 { margin: 0 0 6px; font-size: 22px; color: #0f172a; }
    .cod5-header p { margin: 0; color: #475569; }
    .cod5-header a { color: #2563eb; }
  </style>
</head>
<body>
  <header class="cod5-header">
    <h1>AdOps Ops API</h1>
    <p>Swagger UI operacional. PI é identificação da campanha; API é o endpoint para operar sem escrita direta no banco. <a href="/api/ops/api-catalog.html">Catálogo HTML</a> · <a href="/api/ops/openapi.json">OpenAPI JSON</a></p>
  </header>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/ops/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
    });
  </script>
</body>
</html>`);
});

function buildOpsApiCatalog() {
  const base = "${ADOPS_API_BASE_URL:-https://adops-api.codigo5.com.br}";
  const auth = "-H \"Authorization: Bearer $OPS_API_TOKEN\" -H \"Content-Type: application/json\"";
  const sections = [
    {
      id: "health-and-queue",
      title: "Saúde, Fila e Progresso",
      description: "Leitura operacional sem mutação. Use antes e depois de qualquer job.",
      endpoints: [
      {
        id: "health",
        method: "GET",
        path: "/api/healthz",
        purpose: "Conferir se a API está viva.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/healthz`,
      },
      {
        id: "queue-overview",
        method: "GET",
        path: "/api/ops/queue/overview",
        purpose: "Ver jobs ativos, fila, runners e decisões do scheduler canônico do Mac Mini.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/queue/overview`,
      },
      {
        id: "schedule-reconcile",
        method: "POST",
        path: "/api/ops/schedules/reconcile",
        purpose: "Reconciliar a janela atual na API canônica; a API calcula data, horário e idempotência.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/schedules/reconcile -d '{}'`,
      },
      {
        id: "daily-print-alert-claim",
        method: "POST",
        path: "/api/ops/daily-print-alerts/claim",
        purpose: "Reservar idempotentemente uma transição de alerta diário no Postgres.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/daily-print-alerts/claim -d '{"date":"2026-08-26","state":"incident","pendingInsertionIds":[2713]}'`,
      },
      {
        id: "daily-print-status",
        method: "GET",
        path: "/api/ops/daily-print-status",
        purpose: "Consultar tentativa, auditoria e próxima janela canônica de uma data em America/Cuiaba.",
        authRequired: false,
        curl: `curl -fsSL '${base}/api/ops/daily-print-status?date=2026-08-26'`,
      },
      {
        id: "ops-incidents",
        method: "GET",
        path: "/api/ops/incidents",
        purpose: "Consultar incidentes derivados de jobs, com camada, código e IDs correlacionados.",
        authRequired: true,
        curl: `curl -fsSL ${auth} '${base}/api/ops/incidents?status=open'`,
      },
      {
        id: "runner-claim-next",
        method: "POST",
        path: "/api/ops/runner/claim-next",
        purpose: "Fazer claim exclusivo do próximo job permitido para o runner.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/runner/claim-next -d '{"runnerId":"runner-1","kinds":["print-batch"]}'`,
      },
      {
        id: "runner-heartbeat",
        method: "POST",
        path: "/api/ops/runner/heartbeat",
        purpose: "Registrar heartbeat e capacidades reais do runner sem inventar contagens ausentes.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/runner/heartbeat -d '{"runnerId":"runner-1","status":"idle","currentJobId":null,"capabilities":{"jobKinds":["print-batch"]}}'`,
      },
      {
        id: "runner-job-progress",
        method: "POST",
        path: "/api/ops/runner/jobs/{jobId}/progress",
        purpose: "Atualizar progresso somente enquanto o runner ainda possui o lease do job.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/runner/jobs/JOB_ID/progress -d '{"runnerId":"runner-1","result":{"stage":"capture"}}'`,
      },
      {
        id: "runtime-readiness",
        method: "GET",
        path: "/api/ops/runtime-readiness",
        purpose: "Conferir prontidao de API, Drive, Telegram, runner e politica de mutacao sem expor valores de segredo.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/runtime-readiness`,
      },
      {
        id: "runtime-topology",
        method: "GET",
        path: "/api/ops/runtime-topology",
        purpose: "Mostrar onde cada serviço roda, quais credenciais possui e quais mutações pode executar, sem expor segredos.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/runtime-topology`,
      },
      {
        id: "drive-inventory-status",
        method: "GET",
        path: "/api/ops/drive-inventory/status",
        purpose: "Consultar idade, quantidade de arquivos e saúde do snapshot persistido do Google Drive.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/drive-inventory/status`,
      },
      {
        id: "drive-inventory-refresh",
        method: "POST",
        path: "/api/ops/jobs/drive-inventory-refresh",
        purpose: "Enfileirar atualização idempotente do inventário do Google Drive sem fornecer credenciais à API pública.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/drive-inventory-refresh -d '{}'`,
      },
      {
        id: "ops-quickstart",
        method: "GET",
        path: "/api/ops/quickstart",
        purpose: "Obter glossário PI/API e fluxos cURL recomendados para operar o AdOps sem banco direto.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/quickstart`,
      },
      {
        id: "job-status",
        method: "GET",
        path: "/api/ops/jobs/{jobId}",
        purpose: "Consultar resultado bruto do job.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/jobs/JOB_ID`,
      },
      {
        id: "job-progress",
        method: "GET",
        path: "/api/ops/jobs/{jobId}/progress",
        purpose: "Consultar progresso resumido do job.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/jobs/JOB_ID/progress`,
      },
      ],
    },
    {
      id: "audit-checklist",
      title: "Checklist Central de Auditoria",
      description: "Contrato obrigatório para impedir print com slot, período, mídia, frame ou checklist errado.",
      endpoints: [
      {
        id: "resolve-audit-checklist",
        method: "GET",
        path: "/api/audit-checklists/resolve?insertionId={id}&date=YYYY-MM-DD",
        purpose: "Resolver período, mídia, slot, grupo, regra e gates antes de gerar print.",
        authRequired: false,
        curl: `curl -fsSL "${base}/api/audit-checklists/resolve?insertionId=1663&date=2026-07-01"`,
      },
      {
        id: "validate-proof",
        method: "POST",
        path: "/api/audit-checklists/validate-proof",
        purpose: "Validar a evidência final pela API central de checklist.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/audit-checklists/validate-proof -d '{"insertionId":1663,"date":"2026-07-01"}'`,
      },
      {
        id: "capture-proof-status",
        method: "GET",
        path: "/api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD",
        purpose: "Status final da evidência, já integrado com validate-proof.",
        authRequired: false,
        curl: `curl -fsSL "${base}/api/insertions/1663/capture-proof/status?date=2026-07-01"`,
      },
      ],
    },
    {
      id: "campaign-operations",
      title: "Campanhas Ativas por Planilha, Drive e AdOps",
      description: "Diagnóstico read-only para saber o que está ativo hoje, o que falta cadastrar, publicar ou evidenciar.",
      endpoints: [
      {
        id: "active-campaign-operations",
        method: "GET",
        path: "/api/campaign-operations/active?date=YYYY-MM-DD",
        purpose: "Ler a aba do mês corrente, cruzar com Drive, AdOps e evidências, e retornar ações recomendadas sem criar jobs.",
        authRequired: false,
        curl: `curl -fsSL "${base}/api/campaign-operations/active?date=2026-07-08"`,
      },
      {
        id: "active-campaign-operations-site",
        method: "GET",
        path: "/api/campaign-operations/active?date=YYYY-MM-DD&siteSigla=PERRENGUE",
        purpose: "Filtrar o diagnóstico operacional por portal.",
        authRequired: false,
        curl: `curl -fsSL "${base}/api/campaign-operations/active?date=2026-07-08&siteSigla=PERRENGUE"`,
      },
      ],
    },
    {
      id: "evidence-generation",
      title: "Geração de Prints e Retroativos",
      description: "Cria jobs para o runner oficial. Não escreve direto no banco e não pula checklist.",
      endpoints: [
      {
        id: "print-single",
        method: "POST",
        path: "/api/ops/jobs/print-single",
        purpose: "Gerar ou regerar uma evidência de uma inserção em uma data específica pela fila operacional.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-single -d '{"insertionId":1663,"date":"2026-07-01","replace":true}'`,
      },
      {
        id: "print-backfill",
        method: "POST",
        path: "/api/ops/jobs/print-backfill",
        purpose: "Gerar retroativos pendentes por inserção, campanha, PI+site, site ou competência, usando o runner oficial e checklist central.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-backfill -d '{"piCodigo":"4500152231","siteSigla":"PERRENGUE","fromDate":"2026-07-01","toDate":"2026-07-07"}'`,
      },
      {
        id: "print-batch",
        method: "POST",
        path: "/api/ops/jobs/print-batch",
        purpose: "Gerar lote de uma data para site ou competência.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-batch -d '{"siteId":1,"date":"2026-07-01"}'`,
      },
      ],
    },
    {
      id: "pi-intake-and-export",
      title: "Cadastro de PI, Drive e Entrega",
      description: "Entrada operacional por Drive/PI e montagem de pacote final por PI + portal.",
      endpoints: [
      {
        id: "pi-site-export",
        method: "POST",
        path: "/api/ops/jobs/pi-site-export",
        purpose: "Garantir evidências retroativas e entrega em ZIP, PNG web, PDF comprimido ou ZIP com PDF por PI + site.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/pi-site-export -d '{"piCodigo":"16628","siteSigla":"PERRENGUE","mode":"full-pdf"}'`,
      },
      {
        id: "drive-pi-preflight",
        method: "POST",
        path: "/api/ops/jobs/drive-pi-preflight",
        purpose: "Auditar pasta do Drive e retornar diagnóstico de PI sem aplicar cadastro ou publicar campanha.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/drive-pi-preflight -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA"}'`,
      },
      {
        id: "drive-pi-folder",
        method: "POST",
        path: "/api/ops/jobs/drive-pi-folder",
        purpose: "Iniciar intake/cadastro operacional a partir de uma pasta do Google Drive com PI e mídia.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/drive-pi-folder -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA"}'`,
      },
      {
        id: "drive-pi-publish",
        method: "POST",
        path: "/api/ops/jobs/drive-pi-publish",
        purpose: "Cadastrar a PI, resolver mídia da pasta/TXT, publicar no AdRotate, renovar o headless e validar a evidência.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/drive-pi-publish -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA","parsedPi":{},"resolveMedia":true,"strictInsertionScope":true,"allowPdfInsertions":false,"publish":true,"generateEvidence":true,"purgeCache":true}'`,
      },
      {
        id: "media-consistency",
        method: "GET",
        path: "/api/insertions/{id}/media-consistency",
        purpose: "Comparar PI, pasta exata, nomes de mídia, mediaUrl do AdOps e slot público antes de qualquer mutação.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/insertions/1800/media-consistency`,
      },
      {
        id: "drive-pi-reconcile",
        method: "POST",
        path: "/api/ops/jobs/drive-pi-reconcile",
        purpose: "Gerar preview ou aplicar uma confirmação humana de PI/mediaUrl com idempotência e trilha de auditoria.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} -H "Idempotency-Key: reconcile-1800-preview-v1" ${base}/api/ops/jobs/drive-pi-reconcile -d '{"insertionId":1800,"apply":false}'`,
      },
      {
        id: "drive-pi-event",
        method: "POST",
        path: "/api/ops/drive-pi-events",
        purpose: "Receber evento bruto do monitor do Google Drive.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/drive-pi-events -d '{"eventId":"drive:FILE_ID:2026-07-07T12:00:00Z","driveFileId":"FILE_ID","name":"Pasta PI","mimeType":"application/vnd.google-apps.folder","path":"/drive/FILE_ID","modifiedTime":"2026-07-07T12:00:00Z","eventType":"folder_updated"}'`,
      },
      ],
    },
    {
      id: "adrotate-sync",
      title: "Planilha, AdRotate e Publicação",
      description: "Jobs para conciliar AdOps com planilha e AdRotate sem acesso direto ao banco pelo operador.",
      endpoints: [
      {
        id: "reconcile-adrotate",
        method: "POST",
        path: "/api/ops/jobs/reconcile-adrotate",
        purpose: "Auditar ou aplicar reconciliação Planilha + AdRotate pelo runner oficial. Por padrão não muta.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/reconcile-adrotate -d '{"apply":false}'`,
      },
      {
        id: "adrotate-link",
        method: "POST",
        path: "/api/ops/jobs/adrotate-link",
        purpose: "Vincular ou corrigir um anúncio AdRotate existente para uma inserção AdOps via WP-CLI. Por padrão não muta.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/adrotate-link -d '{"insertionId":1663,"adId":160,"apply":false}'`,
      },
      {
        id: "adrotate-publish",
        method: "POST",
        path: "/api/ops/jobs/adrotate-publish",
        purpose: "Criar ou atualizar o anúncio AdRotate de uma inserção usando o checklist central como fonte de posição. Por padrão não muta.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/adrotate-publish -d '{"insertionId":1666,"apply":false,"replaceExisting":true,"purgeCache":true,"generateEvidence":false}'`,
      },
      {
        id: "adrotate-relation",
        method: "GET",
        path: "/api/integrations/adrotate/insertions/{id}/relation",
        purpose: "Comparar a inserção planejada com anúncios AdRotate encontrados no HTML público e no inventário conhecido.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/integrations/adrotate/insertions/1666/relation`,
      },
      ],
    },
    {
      id: "notifications",
      title: "Telegram e Notificações",
      description: "Reenvio de evidências já auditadas sem expor token do Telegram ao operador.",
      endpoints: [
      {
        id: "telegram-send-evidence",
        method: "POST",
        path: "/api/ops/jobs/telegram-send-evidence",
        purpose: "Validar checklist e reenviar a evidência de uma inserção/data no Telegram.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/telegram-send-evidence -d '{"insertionId":1663,"date":"2026-07-01"}'`,
      },
      {
        id: "runtime-readiness-probe",
        method: "POST",
        path: "/api/ops/jobs/runtime-readiness-probe",
        purpose: "Executar um probe dentro do runner para conferir Drive, Telegram, SSH/WP-CLI e política de mutação sem expor segredos.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/runtime-readiness-probe -d '{}'`,
      },
      ],
    },
  ];
  const endpoints = sections.flatMap((section) => section.endpoints.map((endpoint) => ({
    ...endpoint,
    sectionId: section.id,
    sectionTitle: section.title,
  })));
  return {
    ok: true,
    version: "adops-ops-api-catalog-v2",
    generatedAt: nowIso(),
    baseUrlEnv: "ADOPS_API_BASE_URL",
    auth: {
      type: "bearer",
      env: "OPS_API_TOKEN",
      note: "Nunca coloque o token em documentação, Git ou chat. Use variável de ambiente no terminal.",
    },
    glossary: {
      pi: "Identificação comercial da campanha enviada pela agência ou cliente.",
      api: "Endpoint HTTP da ferramenta AdOps para operar sem escrita direta no banco.",
      campanha: "Registro do AdOps que agrupa uma ou mais inserções da mesma PI.",
      insercao: "Veiculação específica da campanha em portal, posição e período.",
      evidencia: "Print auditado pelo runner oficial e checklist central.",
    },
    sections,
    endpoints,
  };
}

function buildOpsQuickstart() {
  const catalog = buildOpsApiCatalog();
  const base = "${ADOPS_API_BASE_URL:-https://adops-api.codigo5.com.br}";
  const auth = "-H \"Authorization: Bearer $OPS_API_TOKEN\" -H \"Content-Type: application/json\"";
  const byId = new Map(catalog.endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const command = (id: string) => byId.get(id)?.curl ?? null;
  const workflows = [
    {
      id: "gerar-print-data-especifica",
      title: "Gerar print retroativo de uma data",
      when: "Use quando a inserção já existe no AdOps e você precisa corrigir ou gerar uma data específica.",
      steps: [
        { label: "Resolver checklist antes da captura", command: command("resolve-audit-checklist") },
        { label: "Criar job de print", command: command("print-single") },
        { label: "Acompanhar progresso", command: `curl -fsSL ${base}/api/ops/jobs/JOB_ID/progress` },
        { label: "Validar evidência final", command: command("validate-proof") },
        { label: "Enviar no Telegram depois de aprovado", command: command("telegram-send-evidence") },
      ],
      acceptance: ["validate-proof.approved=true", "blockingIssues=[]", "status final audited"],
    },
    {
      id: "gerar-retroativos-campanha",
      title: "Gerar retroativos de uma campanha ou PI/site",
      when: "Use quando precisa cobrir um intervalo, uma PI inteira ou uma campanha já cadastrada.",
      steps: [
        { label: "Conferir fila e runner", command: command("queue-overview") },
        { label: "Criar backfill controlado", command: command("print-backfill") },
        { label: "Acompanhar progresso", command: `curl -fsSL ${base}/api/ops/jobs/JOB_ID/progress` },
        { label: "Validar datas críticas pelo checklist", command: command("validate-proof") },
      ],
      acceptance: ["cada data necessária audited", "nenhum blockingIssue", "ZIP/pacote só depois da validação"],
    },
    {
      id: "cadastrar-campanha-drive",
      title: "Cadastrar e publicar campanha a partir do Google Drive",
      when: "Use quando a PI/PDF, a mídia e possíveis instruções em TXT ou Google Docs estão em uma pasta Drive.",
      steps: [
        { label: "Rodar diagnóstico sem mutação", command: command("drive-pi-preflight") },
        { label: "Acompanhar job de diagnóstico", command: `curl -fsSL ${base}/api/ops/jobs/JOB_ID/progress` },
        { label: "Executar cadastro, mídia, publicação, cache/rebuild e evidência", command: command("drive-pi-publish") },
        { label: "Conferir campanha ativa ou programada", command: command("active-campaign-operations") },
        { label: "Conferir relação AdOps x AdRotate", command: command("adrotate-relation") },
        { label: "Validar evidência somente depois da publicação pública", command: command("validate-proof") },
      ],
      acceptance: [
        "parsedPi.insertions define o escopo quando informado",
        "formatos sociais não criam inserção de site",
        "PDF, mídia e links de TXT/Docs foram avaliados",
        "adId/groupId e período confirmados no AdRotate",
        "PMT reconstruído antes da evidência",
        "validate-proof.approved=true e blockingIssues=[]",
      ],
    },
    {
      id: "corrigir-adrotate",
      title: "Conferir ou corrigir AdRotate sem duplicar campanha",
      when: "Use quando a mídia, link, grupo ou posição divergem entre AdOps, planilha e site.",
      steps: [
        { label: "Auditar reconciliação sem aplicar", command: command("reconcile-adrotate") },
        { label: "Vincular anúncio existente em modo dry-run", command: command("adrotate-link") },
        { label: "Publicar ou atualizar anúncio via checklist em modo dry-run", command: command("adrotate-publish") },
        { label: "Só repetir com apply=true depois de revisar o diagnóstico", command: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/adrotate-link -d '{"insertionId":1663,"adId":160,"apply":true}'` },
      ],
      acceptance: ["sem nova inserção duplicada", "grupo/slot resolvido pelo checklist", "HTML público confere mídia e link"],
    },
    {
      id: "confirmar-divergencia-de-fontes",
      title: "Confirmar divergência entre planilha, Drive, PDF e mídia publicada",
      when: "Use quando números de PI ou versões da arte divergem. O fluxo bloqueia mutação até uma pessoa confirmar.",
      steps: [
        { label: "Consultar campanhas e identidade por fonte", command: command("active-campaign-operations") },
        { label: "Comparar pasta, arquivos, AdOps e site", command: command("media-consistency") },
        { label: "Gerar preview idempotente", command: command("drive-pi-reconcile") },
        { label: "Após confirmação, repetir com apply=true, canonicalPi/mediaUrl e confirmationNote", command: null },
      ],
      acceptance: ["confirmação humana registrada", "nenhuma URL Google Drive salva como mídia", "reconsulta sem conflito inesperado"],
    },
  ];
  return {
    ok: true,
    version: "adops-ops-quickstart-v2",
    generatedAt: nowIso(),
    baseUrlEnv: "ADOPS_API_BASE_URL",
    tokenEnv: "OPS_API_TOKEN",
    rule: "PI é dado comercial da campanha; API é endpoint/ferramenta do AdOps. Operador não escreve direto no banco.",
    glossary: catalog.glossary,
    setup: [
      `export ADOPS_API_BASE_URL="${base}"`,
      'export OPS_API_TOKEN="..."',
    ],
    links: {
      quickstartHtml: "/api/ops/quickstart.html",
      catalogJson: "/api/ops/api-catalog",
      catalogHtml: "/api/ops/api-catalog.html",
      activeCampaignOperations: "/api/campaign-operations/active",
      swaggerUi: "/api/ops/docs",
      openApiJson: "/api/ops/openapi.json",
      runtimeReadiness: "/api/ops/runtime-readiness",
    },
    safety: [
      "Nunca colocar token em Git, chat ou documentação.",
      "Usar drive-pi-preflight antes de cadastrar a partir do Drive.",
      "Usar drive-pi-publish para concluir mídia, AdRotate, cache/rebuild e evidência no mesmo fluxo idempotente.",
      "Campanha futura é aceita por adId, groupId e período administrativo; não exigir HTML antes da data de início.",
      "Aceitar print somente com validate-proof.approved=true.",
      "Usar campaign-operations/active para saber o que está ativo, pendente de cadastro, publicação ou evidência antes de criar jobs.",
      "Se regra de slot, período, mídia ou checklist falhar, corrigir a fonte antes do lote.",
      "Em divergência de fonte, prioridade: PDF/email da PI, planilha, AdOps, AdRotate, HTML público.",
    ],
    workflows,
  };
}

function parseCurlBodyExample(curl: string) {
  const match = curl.match(/-d '([^']+)'/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function openApiSchemaForExample(value: unknown): Record<string, unknown> {
  if (value === null) return { nullable: true };
  if (Array.isArray(value)) return { type: "array", items: value.length ? openApiSchemaForExample(value[0]) : {} };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number", example: value };
  if (typeof value === "boolean") return { type: "boolean", example: value };
  if (typeof value === "string") return { type: "string", example: value };
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      properties: Object.fromEntries(entries.map(([key, item]) => [key, openApiSchemaForExample(item)])),
    };
  }
  return {};
}

function buildOpsOpenApiDocument() {
  const catalog = buildOpsApiCatalog();
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of catalog.endpoints) {
    const method = String(endpoint.method).toLowerCase();
    const pathKey = endpoint.path.replace(/\{([^}]+)\}/g, "{$1}");
    const pathParams = Array.from(endpoint.path.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]);
    const bodyExample = method === "post" ? parseCurlBodyExample(endpoint.curl) : null;
    paths[pathKey] ??= {};
    paths[pathKey][method] = {
      summary: endpoint.purpose,
      description: `${endpoint.sectionTitle}. ${endpoint.purpose}`,
      tags: [endpoint.sectionTitle],
      security: endpoint.authRequired ? [{ bearerAuth: [] }] : [],
      parameters: pathParams.map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      })),
      ...(bodyExample ? {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: openApiSchemaForExample(bodyExample),
              example: bodyExample,
            },
          },
        },
      } : {}),
      responses: {
        "200": { description: "Resposta bem-sucedida." },
        "202": { description: "Job criado para execução assíncrona." },
        "400": { description: "Payload inválido." },
        "401": { description: "Token operacional ausente ou inválido." },
        "422": { description: "Checklist ou regra operacional recusou a operação." },
      },
      "x-curl": endpoint.curl,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "AdOps Ops API",
      version: catalog.version,
      description: "API operacional para gerenciar campanhas, PI, prints retroativos, checklist e entrega sem escrita direta no banco pelo operador.",
    },
    servers: [
      { url: "https://adops-api.codigo5.com.br", description: "Produção Mac Mini" },
    ],
    tags: catalog.sections.map((section) => ({
      name: section.title,
      description: section.description,
    })),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "OPS_API_TOKEN",
        },
      },
    },
    "x-glossary": catalog.glossary,
    paths,
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.get("/ops/api-catalog.html", (_req, res): void => {
  const catalog = buildOpsApiCatalog();
  const rows = catalog.sections.map((section) => `
    <section class="group">
      <h2>${escapeHtml(section.title)}</h2>
      <p>${escapeHtml(section.description)}</p>
    </section>
    ${section.endpoints.map((endpoint) => `
    <section class="endpoint">
      <div class="meta">
        <span class="method ${escapeHtml(endpoint.method.toLowerCase())}">${escapeHtml(endpoint.method)}</span>
        <code>${escapeHtml(endpoint.path)}</code>
        <span class="auth">${endpoint.authRequired ? "token obrigatório" : "sem token"}</span>
      </div>
      <h3>${escapeHtml(endpoint.id)}</h3>
      <p>${escapeHtml(endpoint.purpose)}</p>
      <pre><code>${escapeHtml(endpoint.curl)}</code></pre>
    </section>
    `).join("\n")}
  `).join("\n");

  res.type("html").send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AdOps Ops API</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f3ec;
      --ink: #1f2933;
      --muted: #667085;
      --line: #ded7cc;
      --card: #fffaf2;
      --accent: #7c3aed;
      --post: #0f766e;
      --get: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.5;
    }
    header {
      padding: 48px max(24px, calc((100vw - 1120px) / 2)) 28px;
      border-bottom: 1px solid var(--line);
      background: #fffdf8;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 24px 56px;
      display: grid;
      gap: 16px;
    }
    h1 { margin: 0 0 10px; font-size: clamp(2rem, 4vw, 3.2rem); line-height: 1.05; }
    h2 { margin: 0 0 6px; font-size: 1.35rem; }
    h3 { margin: 12px 0 6px; font-size: 1.1rem; }
    p { margin: 0; color: var(--muted); }
    .summary {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 20px;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 10px;
      background: #fff;
      color: var(--muted);
      font-size: .9rem;
    }
    .endpoint {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }
    .group {
      margin-top: 18px;
      padding-top: 8px;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .method {
      display: inline-flex;
      align-items: center;
      min-width: 56px;
      justify-content: center;
      border-radius: 6px;
      color: white;
      font-weight: 800;
      font-size: .78rem;
      padding: 4px 8px;
      letter-spacing: 0;
    }
    .method.get { background: var(--get); }
    .method.post { background: var(--post); }
    .auth {
      color: var(--muted);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: .78rem;
      background: #fff;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: .9rem;
    }
    pre {
      margin: 14px 0 0;
      padding: 14px;
      overflow: auto;
      border-radius: 8px;
      background: #172033;
      color: #f8fafc;
    }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>AdOps Ops API</h1>
    <p>Catálogo operacional para cadastrar PI, gerar prints, auditar evidências e acompanhar jobs sem escrita direta no banco.</p>
    <div class="summary">
      <span class="pill">Versão: ${escapeHtml(catalog.version)}</span>
      <span class="pill">Endpoints: ${catalog.endpoints.length}</span>
      <span class="pill">Auth: Bearer OPS_API_TOKEN para mutações</span>
      <span class="pill"><a href="/api/ops/quickstart.html">Quickstart</a></span>
      <span class="pill"><a href="/api/ops/api-catalog">JSON</a></span>
      <span class="pill"><a href="/api/ops/openapi.json">OpenAPI</a></span>
      <span class="pill"><a href="/api/ops/docs">Swagger UI</a></span>
    </div>
  </header>
  <main>${rows}</main>
</body>
</html>`);
});

router.get("/ops/quickstart", (_req, res): void => {
  res.json(buildOpsQuickstart());
});

router.get("/ops/quickstart.html", (_req, res): void => {
  const quickstart = buildOpsQuickstart();
  const workflows = quickstart.workflows.map((workflow) => `
    <section class="workflow">
      <h2>${escapeHtml(workflow.title)}</h2>
      <p>${escapeHtml(workflow.when)}</p>
      ${workflow.steps.map((step, index) => `
        <div class="step">
          <strong>${index + 1}. ${escapeHtml(step.label)}</strong>
          ${step.command ? `<pre><code>${escapeHtml(step.command)}</code></pre>` : "<p>Comando indisponível no catálogo.</p>"}
        </div>
      `).join("\n")}
      <h3>Aceite</h3>
      <ul>${workflow.acceptance.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `).join("\n");

  res.type("html").send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AdOps Ops API Quickstart</title>
  <style>
    :root { color-scheme: light; --bg:#f7f3ec; --ink:#1f2933; --muted:#667085; --line:#ded7cc; --card:#fffaf2; --accent:#7c3aed; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); line-height:1.5; }
    header { padding:48px max(24px, calc((100vw - 1040px) / 2)) 28px; border-bottom:1px solid var(--line); background:#fffdf8; }
    main { max-width:1040px; margin:0 auto; padding:28px 24px 56px; display:grid; gap:18px; }
    h1 { margin:0 0 10px; font-size:clamp(2rem, 4vw, 3rem); line-height:1.05; }
    h2 { margin:0 0 6px; font-size:1.35rem; }
    h3 { margin:16px 0 6px; font-size:1rem; }
    p { margin:0; color:var(--muted); }
    .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-top:20px; }
    .card, .workflow { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:18px; }
    .step { margin-top:14px; }
    pre { margin:8px 0 0; padding:14px; overflow:auto; border-radius:8px; background:#172033; color:#f8fafc; }
    code { font-family:"SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size:.9rem; }
    a { color:var(--accent); }
    ul { margin:8px 0 0; color:var(--muted); }
  </style>
</head>
<body>
  <header>
    <h1>AdOps Ops API Quickstart</h1>
    <p>${escapeHtml(quickstart.rule)}</p>
    <div class="cards">
      <div class="card"><strong>Token</strong><p>Use <code>${escapeHtml(quickstart.tokenEnv)}</code>. Nunca cole o valor em Git ou chat.</p></div>
      <div class="card"><strong>Catálogo</strong><p><a href="/api/ops/api-catalog.html">HTML</a> · <a href="/api/ops/docs">Swagger</a> · <a href="/api/ops/openapi.json">OpenAPI</a></p></div>
      <div class="card"><strong>Checklist</strong><p>Print só é aceito com <code>validate-proof.approved=true</code>.</p></div>
    </div>
  </header>
  <main>
    <section class="workflow">
      <h2>Setup no terminal</h2>
      ${quickstart.setup.map((line) => `<pre><code>${escapeHtml(line)}</code></pre>`).join("\n")}
    </section>
    ${workflows}
  </main>
</body>
</html>`);
});

router.post("/ops/jobs/campaign-publication-reconcile", async (req, res): Promise<void> => {
  const targetDate = parseIsoDate(req.body?.targetDate) ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" }).format(new Date());
  const insertionId = readOptionalNumber(req.body?.insertionId);
  const mode = req.body?.mode === "preflight" ? "preflight" : "apply";
  const idempotencyKey = `campaign-publication-reconcile:${targetDate}:${insertionId || "all"}:${mode}`;
  const created = await createIdempotentOpsJob("campaign-publication-reconcile", {
    targetDate,
    insertionId,
    mode,
    source: "macmini-protected-api",
  }, "ops-api", idempotencyKey);
  res.status(created.duplicate ? 200 : 202).json({ ok: true, kind: "campaign-publication-reconcile", ...created });
});

router.post("/ops/jobs/evidence-monthly-report", async (req, res): Promise<void> => {
  const targetDate = parseIsoDate(req.body?.targetDate);
  const competencia = readOptionalString(req.body?.competencia)?.toUpperCase() ?? null;
  if (!targetDate || !competencia || competencia !== competenciaForDate(targetDate)) {
    res.status(400).json({ error: "bad_request", details: "Informe targetDate e competência correspondente." });
    return;
  }
  const idempotencyKey = readOptionalString(req.body?.idempotencyKey) ?? `evidence-monthly-report:${targetDate}:22:15`;
  const created = await createIdempotentOpsJob("evidence-monthly-report", {
    targetDate,
    competencia,
    source: readOptionalString(req.body?.source) ?? "macmini-protected-api",
  }, "ops-api", idempotencyKey);
  res.status(created.duplicate ? 200 : 202).json({ ok: true, kind: "evidence-monthly-report", ...created });
});

router.post("/ops/monthly-report-refreshes", async (req, res): Promise<void> => {
  const targetDate = parseIsoDate(req.body?.targetDate);
  const competencia = readOptionalString(req.body?.competencia)?.toUpperCase() ?? null;
  if (!targetDate || !competencia || competencia !== competenciaForDate(targetDate)) {
    res.status(400).json({ error: "bad_request", details: "Informe targetDate e competência correspondente." });
    return;
  }
  const now = new Date();
  const notBefore = new Date(now.getTime() + 60_000).toISOString();
  const idempotencyKey = `evidence-monthly-report:${competencia}:incremental`;
  const created = await createIdempotentOpsJob("evidence-monthly-report", {
    targetDate,
    competencia,
    incremental: true,
    notBefore,
    source: readOptionalString(req.body?.source) ?? "evidence-approved-refresh",
  }, "evidence-approved-refresh", idempotencyKey, true);
  const { existingNotBefore, ...createdResponse } = created;
  res.status(created.duplicate ? 200 : 202).json({
    ok: true,
    competencia,
    targetDate,
    debounceSeconds: 60,
    ...createdResponse,
    notBefore: created.duplicate ? existingNotBefore : notBefore,
  });
});

router.get("/ops/daily-print-recoveries", async (req, res): Promise<void> => {
  const date = readOptionalString(req.query.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "bad_request", details: "Informe date em YYYY-MM-DD." });
    return;
  }
  const jobs = await pool.query<OpsJobRecord>(
    `SELECT * FROM ops_jobs
      WHERE kind = 'print-batch' AND payload_json::jsonb ->> 'targetDate' = $1
      ORDER BY created_at DESC LIMIT 20`,
    [date],
  );
  const latest = jobs.rows[0] ? describeJob(jobs.rows[0]) : null;
  const items = latest ? [latest] : [];
  const active = latest && ["queued", "ready_for_runner", "running"].includes(latest.status) ? 1 : 0;
  const failed = latest?.status === "failed" ? 1 : 0;
  res.json({
    date,
    items,
    evaluator: {
      status: active ? "retryable" : failed ? "blocked" : items.length ? "complete" : "blocked",
      pending: active,
      blocked: failed,
      reason: items.length ? null : "recovery_not_initialized",
    },
  });
});

router.get("/ops/incidents", async (req, res): Promise<void> => {
  const configuredToken = process.env.OPS_API_TOKEN?.trim() ?? "";
  const bearer = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (configuredToken && bearer !== configuredToken) {
    res.status(401).json({ error: "unauthorized", details: "OPS_API_TOKEN inválido ou ausente." });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const result = await pool.query<OpsJobRecord>(
    "SELECT * FROM ops_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT $1",
    [limit],
  );
  const incidentLayer = (record: OpsJobRecord) => {
    const persisted = (parseJson(record.result_json) as Record<string, unknown> | null)?.incidentLayer;
    if (["scheduling", "queue_or_runner", "api_or_runner_transport", "audit", "portal", "job_execution"].includes(String(persisted))) return persisted;
    const error = String(record.error_text ?? "").toLowerCase();
    if (error.includes("watchdog") || error.includes("expired")) return "queue_or_runner";
    if (error.includes("checklist") || error.includes("audit")) return "audit";
    if (error.includes("transport") || error.includes("timeout") || error.includes("network")) return "api_or_runner_transport";
    if (error.includes("portal") || error.includes("adrotate")) return "portal";
    return "job_execution";
  };
  res.json({ items: result.rows.map((record) => ({
    id: `job-incident:${record.id}`,
    fingerprint: createHash("sha256").update(`${record.id}:${record.error_text ?? "failed"}`).digest("hex"),
    status: "open",
    layer: incidentLayer(record),
    jobId: record.id,
    jobKind: record.kind,
    summary: sanitizeJobText(record.error_text, 500),
    error: sanitizeJobText(record.error_text, 1000),
    evidence: describeJob(record).result,
    attempts: Number((parseJson(record.payload_json) as Record<string, unknown> | null)?.attempt ?? 1),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  })) });
});

router.post("/ops/jobs/print-single", async (req, res): Promise<void> => {
  const insertionId = typeof req.body?.insertionId === "number" ? req.body.insertionId : null;
  if (!insertionId) {
    res.status(400).json({ error: "bad_request", details: "Informe insertionId." });
    return;
  }
  const jobId = await createOpsJob("print-single", {
    insertionId,
    date: readOptionalString(req.body?.date),
    captureAt: readOptionalString(req.body?.captureAt),
    replace: typeof req.body?.replace === "boolean" ? req.body.replace : false,
    force: typeof req.body?.force === "boolean" ? req.body.force : false,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "print-single", status: "ready_for_runner" });
});

router.post("/ops/jobs/print-backfill", async (req, res): Promise<void> => {
  const insertionId = readOptionalNumber(req.body?.insertionId);
  const campaignId = readOptionalNumber(req.body?.campaignId);
  const siteId = readOptionalNumber(req.body?.siteId);
  const competencia = readOptionalString(req.body?.competencia);
  const piCodigo = readOptionalString(req.body?.piCodigo);
  const siteSigla = readOptionalString(req.body?.siteSigla)?.toUpperCase() ?? null;
  const fromDate = parseIsoDate(req.body?.fromDate);
  const toDate = parseIsoDate(req.body?.toDate);
  if (req.body?.fromDate != null && !fromDate) {
    res.status(400).json({ error: "bad_request", details: "fromDate deve estar no formato YYYY-MM-DD." });
    return;
  }
  if (req.body?.toDate != null && !toDate) {
    res.status(400).json({ error: "bad_request", details: "toDate deve estar no formato YYYY-MM-DD." });
    return;
  }
  if ((piCodigo && !siteSigla) || (!piCodigo && siteSigla)) {
    res.status(400).json({ error: "bad_request", details: "Informe piCodigo e siteSigla juntos." });
    return;
  }
  if (!insertionId && !campaignId && !siteId && !competencia && !piCodigo) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe insertionId, campaignId, piCodigo+siteSigla, siteId ou competencia para limitar o backfill.",
    });
    return;
  }
  const jobId = await createOpsJob("print-backfill", {
    insertionId,
    campaignId,
    siteId,
    competencia,
    piCodigo,
    siteSigla,
    fromDate,
    toDate,
    replace: typeof req.body?.replace === "boolean" ? req.body.replace : false,
    force: typeof req.body?.force === "boolean" ? req.body.force : false,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "print-backfill", status: "ready_for_runner" });
});

router.post("/ops/jobs/print-batch", async (req, res): Promise<void> => {
  const siteId = readOptionalNumber(req.body?.siteId);
  const competencia = readOptionalString(req.body?.competencia);
  const date = parseIsoDate(req.body?.date);
  const captureAt = readOptionalString(req.body?.captureAt);
  if (!siteId && !competencia) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe siteId ou competencia para limitar o lote.",
    });
    return;
  }
  if (req.body?.date != null && !date) {
    res.status(400).json({ error: "bad_request", details: "date deve estar no formato YYYY-MM-DD." });
    return;
  }
  const jobId = await createOpsJob("print-batch", {
    siteId,
    competencia,
    date,
    captureAt,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "print-batch", status: "ready_for_runner" });
});

router.post("/ops/jobs/sync-planilha", async (req, res): Promise<void> => {
  const mode = readOptionalString(req.body?.mode) ?? "latest";
  const campaignIds = Array.isArray(req.body?.campaignIds)
    ? req.body.campaignIds.filter((item: unknown) => Number.isInteger(item))
    : null;
  const jobId = await createOpsJob("sync-planilha", {
    mode,
    campaignIds,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "sync-planilha", status: "ready_for_runner" });
});

router.post("/ops/jobs/pi-site-export", async (req, res): Promise<void> => {
  const piCodigo = readOptionalString(req.body?.piCodigo);
  const siteSigla = readOptionalString(req.body?.siteSigla)?.toUpperCase() ?? null;
  if (!piCodigo || !siteSigla) {
    res.status(400).json({ error: "bad_request", details: "Informe piCodigo e siteSigla." });
    return;
  }
  const requestedMode = readOptionalString(req.body?.mode)?.toLowerCase() ?? "full-pdf";
  const mode = ["full", "prints-only", "pdf", "full-pdf"].includes(requestedMode) ? requestedMode : "full-pdf";
  const requestedVariant = readOptionalString(req.body?.variant)?.toLowerCase();
  const variant = mode === "pdf" || mode === "full-pdf"
    ? "web"
    : requestedVariant === "web"
      ? "web"
      : "original";
  const pdfMaxWidth = Math.max(800, Math.min(2560, Math.round(readOptionalNumber(req.body?.pdfMaxWidth) ?? 1920)));
  const pdfQuality = Math.max(45, Math.min(85, Math.round(readOptionalNumber(req.body?.pdfQuality) ?? 68)));
  const pdfResolution = Math.max(72, Math.min(180, Math.round(readOptionalNumber(req.body?.pdfResolution) ?? 120)));
  const imageMaxWidth = Math.max(800, Math.min(2560, Math.round(readOptionalNumber(req.body?.imageMaxWidth) ?? 1600)));
  const imageQuality = Math.max(45, Math.min(90, Math.round(readOptionalNumber(req.body?.imageQuality) ?? 72)));
  const jobId = await createOpsJob("pi-site-export", {
    piCodigo,
    siteSigla,
    mode,
    variant,
    pdfMaxWidth,
    pdfQuality,
    pdfResolution,
    imageMaxWidth,
    imageQuality,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({
    ok: true,
    jobId,
    kind: "pi-site-export",
    status: "ready_for_runner",
    mode,
    variant,
    pdfMaxWidth,
    pdfQuality,
    pdfResolution,
    imageMaxWidth,
    imageQuality,
  });
});

router.post("/ops/jobs/reconcile-adrotate", async (req, res): Promise<void> => {
  const apply = req.body?.apply === true;
  const jobId = await createOpsJob("reconcile-adrotate", {
    apply,
    mode: apply ? "apply" : "audit",
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "reconcile-adrotate", status: "ready_for_runner", apply });
});

router.post("/ops/jobs/adrotate-link", async (req, res): Promise<void> => {
  const insertionId = readOptionalNumber(req.body?.insertionId);
  const adId = readOptionalNumber(req.body?.adId);
  const apply = req.body?.apply === true;
  if (!insertionId || insertionId <= 0 || !adId || adId <= 0) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe insertionId e adId positivos.",
    });
    return;
  }
  const jobId = await createOpsJob("adrotate-link", {
    insertionId,
    adId,
    apply,
    mode: apply ? "apply" : "preview",
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "adrotate-link", status: "ready_for_runner", apply });
});

router.post("/ops/jobs/adrotate-publish", async (req, res): Promise<void> => {
  const insertionId = readOptionalNumber(req.body?.insertionId);
  if (!insertionId || insertionId <= 0) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe insertionId positivo.",
    });
    return;
  }

  const apply = req.body?.apply === true;
  const replaceExisting = req.body?.replaceExisting !== false;
  const purgeCache = req.body?.purgeCache !== false;
  const generateEvidence = req.body?.generateEvidence === true;
  const date = readOptionalString(req.body?.date);
  const captureAt = readOptionalString(req.body?.captureAt);

  const jobId = await createOpsJob("adrotate-publish", {
    insertionId,
    apply,
    replaceExisting,
    purgeCache,
    generateEvidence,
    date,
    captureAt,
    mode: apply ? "apply" : "preview",
    source: "macmini-api",
  }, "ops-api");

  res.status(202).json({
    ok: true,
    jobId,
    kind: "adrotate-publish",
    status: "ready_for_runner",
    apply,
    requiredFollowUp: apply
      ? ["validate_adrotate_relation", "validate_public_html", ...(generateEvidence ? ["validate_capture_proof"] : [])]
      : ["review_preview", "rerun_with_apply_true"],
  });
});

router.post("/ops/jobs/drive-pi-folder", async (req, res): Promise<void> => {
  await createDrivePiFolderJob(req, res, { preflightOnly: false, publishFlow: false });
});

router.post("/ops/jobs/drive-pi-preflight", async (req, res): Promise<void> => {
  await createDrivePiFolderJob(req, res, { preflightOnly: true, publishFlow: false });
});

router.post("/ops/jobs/drive-pi-publish", async (req, res): Promise<void> => {
  await createDrivePiFolderJob(req, res, { preflightOnly: false, publishFlow: true });
});

router.post("/ops/jobs/drive-pi-reconcile", async (req, res): Promise<void> => {
  const insertionId = readOptionalNumber(req.body?.insertionId);
  const apply = req.body?.apply === true;
  const canonicalPi = readOptionalString(req.body?.canonicalPi);
  const selectedDriveFileId = readOptionalString(req.body?.selectedDriveFileId);
  const sourcePreflightJobId = readOptionalString(req.body?.sourcePreflightJobId);
  const mediaUrl = readOptionalString(req.body?.mediaUrl);
  const confirmationNote = readOptionalString(req.body?.confirmationNote);

  if (!insertionId || insertionId <= 0) {
    res.status(400).json({ error: "bad_request", details: "Informe insertionId positivo." });
    return;
  }
  if (canonicalPi && !/\d{3,}/.test(canonicalPi)) {
    res.status(400).json({ error: "bad_request", details: "canonicalPi deve conter ao menos três dígitos." });
    return;
  }
  if (mediaUrl) {
    try {
      const parsed = new URL(mediaUrl);
      if (parsed.protocol !== "https:" || /(^|\.)drive\.google\.com$/i.test(parsed.hostname) || /(^|\.)docs\.google\.com$/i.test(parsed.hostname)) {
        throw new Error("invalid_media_url");
      }
    } catch {
      res.status(400).json({
        error: "bad_request",
        details: "mediaUrl deve ser HTTPS pública e canônica. URL de visualização do Google Drive não é aceita.",
      });
      return;
    }
  }
  if (apply && !canonicalPi && !mediaUrl) {
    res.status(400).json({ error: "bad_request", details: "apply=true exige canonicalPi e/ou mediaUrl explícita." });
    return;
  }
  if (apply && (!confirmationNote || confirmationNote.length < 8)) {
    res.status(400).json({ error: "bad_request", details: "apply=true exige confirmationNote rastreável." });
    return;
  }

  const requestedKey = readOptionalString(req.headers["idempotency-key"]) ?? readOptionalString(req.body?.idempotencyKey);
  const idempotencyKey = requestedKey ?? createHash("sha256")
    .update(JSON.stringify({ insertionId, apply, canonicalPi, selectedDriveFileId, sourcePreflightJobId, mediaUrl }))
    .digest("hex");
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
    res.status(400).json({ error: "bad_request", details: "Idempotency-Key inválida." });
    return;
  }

  const result = await createIdempotentOpsJob("drive-pi-reconcile", {
    insertionId,
    apply,
    mode: apply ? "apply" : "preview",
    canonicalPi,
    selectedDriveFileId,
    sourcePreflightJobId,
    mediaUrl,
    confirmationNote,
    source: "macmini-api",
  }, "ops-api", idempotencyKey);
  res.status(result.duplicate ? 200 : 202).json({
    ok: true,
    kind: "drive-pi-reconcile",
    apply,
    ...result,
    requiredFollowUp: apply
      ? ["review_job_result", "recheck_campaign_operations", "recheck_media_consistency"]
      : ["obtain_human_confirmation", "rerun_with_apply_true"],
  });
});

async function createDrivePiFolderJob(req: Request, res: Response, options: { preflightOnly: boolean; publishFlow: boolean }) {
  const folderId = parseDriveFolderId(req.body?.folderUrl ?? req.body?.folderId ?? req.body?.driveFolderId);
  if (!folderId) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe folderUrl, folderId ou driveFolderId válido do Google Drive.",
    });
    return;
  }
  const now = nowIso();
  const source = options.preflightOnly ? "macmini-api-preflight" : options.publishFlow ? "macmini-api-publish" : "macmini-api";
  const event = {
    eventId: readOptionalString(req.body?.eventId) ?? `drive:${folderId}:${options.publishFlow ? "publish:" : options.preflightOnly ? "preflight:" : ""}${now}`,
    driveFileId: folderId,
    name: readOptionalString(req.body?.name) ?? `${options.preflightOnly ? "Preflight Drive PI" : "Drive PI"} ${folderId}`,
    mimeType: "application/vnd.google-apps.folder",
    path: readOptionalString(req.body?.path) ?? `/drive/${folderId}`,
    parentFolderId: null,
    modifiedTime: readOptionalString(req.body?.modifiedTime) ?? now,
    webViewLink: readOptionalString(req.body?.folderUrl) ?? `https://drive.google.com/drive/folders/${folderId}`,
    eventType: "folder_updated" as const,
    simulation: req.body?.simulation,
    parsedPi: req.body?.parsedPi,
    preflightOnly: options.preflightOnly,
    explicitFolder: true,
    resolveMedia: options.publishFlow ? req.body?.resolveMedia !== false : req.body?.resolveMedia === true,
    strictInsertionScope: options.publishFlow ? req.body?.strictInsertionScope !== false : req.body?.strictInsertionScope === true,
    allowPdfInsertions: options.publishFlow ? req.body?.allowPdfInsertions === true : req.body?.allowPdfInsertions !== false,
    publish: options.publishFlow ? req.body?.publish !== false : req.body?.publish === true,
    generateEvidence: options.publishFlow ? req.body?.generateEvidence !== false : req.body?.generateEvidence === true,
    purgeCache: req.body?.purgeCache !== false,
    source,
  };
  const validated = validateDrivePiEvent(event);
  if (!validated) {
    res.status(400).json({ error: "bad_request", details: "Não foi possível montar evento Drive PI válido." });
    return;
  }
  const result = await createDrivePiEventJob(validated, "ops-api");
  res.status(result.duplicate ? 200 : 202).json({ ok: true, kind: "drive-pi-ingest", preflightOnly: options.preflightOnly, publishFlow: options.publishFlow, ...result });
}

router.post("/ops/jobs/telegram-send-evidence", async (req, res): Promise<void> => {
  const insertionId = readOptionalNumber(req.body?.insertionId);
  const date = parseIsoDate(req.body?.date);
  if (!insertionId || !date) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe insertionId e date=YYYY-MM-DD.",
    });
    return;
  }
  const jobId = await createOpsJob("telegram-send-evidence", {
    insertionId,
    date,
    chatId: readOptionalString(req.body?.chatId),
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "telegram-send-evidence", status: "ready_for_runner" });
});

router.post("/ops/jobs/runtime-readiness-probe", async (req, res): Promise<void> => {
  const jobId = await createOpsJob("runtime-readiness-probe", {
    includeChecks: Array.isArray(req.body?.includeChecks) ? req.body.includeChecks.filter((item: unknown) => typeof item === "string") : [],
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "runtime-readiness-probe", status: "ready_for_runner" });
});

export default router;
