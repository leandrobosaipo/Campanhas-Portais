import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

type JobKind =
  | "print-batch"
  | "print-backfill"
  | "print-single"
  | "sync-planilha"
  | "analytics-report"
  | "pi-site-export"
  | "drive-pi-ingest"
  | "operational-documents"
  | "reconcile-adrotate"
  | "adrotate-link"
  | "telegram-send-evidence";

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
  "operational-documents",
  "reconcile-adrotate",
  "adrotate-link",
  "telegram-send-evidence",
];

const OPS_JOB_STATUSES: JobStatus[] = ["queued", "ready_for_runner", "running", "completed", "failed"];

type RuntimeEnvCheck = {
  name: string;
  present: boolean;
  requiredFor: string;
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

function buildOpsRuntimeReadiness() {
  const driveChecks = buildEnvChecks([
    { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", requiredFor: "Ler PI e mídia do Google Drive via service account inline." },
    { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", requiredFor: "Ler PI e mídia do Google Drive via arquivo service account." },
    { name: "GOOGLE_DRIVE_ACCESS_TOKEN", requiredFor: "Ler PI e mídia do Google Drive via access token." },
    { name: "GOOGLE_DRIVE_REFRESH_TOKEN", requiredFor: "Renovar OAuth do Google Drive." },
    { name: "GOOGLE_DRIVE_CLIENT_ID", requiredFor: "Renovar OAuth do Google Drive." },
    { name: "GOOGLE_DRIVE_CLIENT_SECRET", requiredFor: "Renovar OAuth do Google Drive." },
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
  const googleDriveReady = anyEnvPresent(["GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", "GOOGLE_DRIVE_ACCESS_TOKEN"]) || driveOAuthReady;
  const telegramDirectReady = allEnvPresent(["TELEGRAM_BOT_TOKEN", "TELEGRAM_DEFAULT_GROUP_ID"]);
  const telegramBridgeConfigured = envIsPresent("ADOPS_TELEGRAM_BOT_URL");
  const mutationAllowed = process.env.ADOPS_DRIVE_PI_ALLOW_MUTATION === "true";
  const warnings: string[] = [];
  if (!googleDriveReady) warnings.push("Google Drive nao esta pronto neste runtime; intake por pasta pode virar diagnostico bloqueado.");
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
      note: "Este endpoint retorna somente nomes e presença/ausência de variáveis. Valores de segredo nunca são expostos.",
    },
    capabilities: {
      opsApiAuthReady: envIsPresent("OPS_API_TOKEN"),
      privateApiAuthReady: anyEnvPresent(["PRIVATE_ADOPS_API_TOKEN", "ADOPS_INTERNAL_API_TOKEN"]),
      googleDriveReady,
      telegramReady: telegramBridgeConfigured || telegramDirectReady,
      telegramBridgeConfigured,
      telegramDirectReady,
      drivePiMutationAllowed: mutationAllowed,
      piAgentEnabled: process.env.ADOPS_PI_AGENT_ENABLED === "true",
      piAgentAutoApply: process.env.ADOPS_PI_AGENT_AUTO_APPLY === "true",
      adrotateSshConfigured: envIsPresent("ADOPS_PERRENGUE_SSH_KEY_PATH"),
    },
    categories: [
      { id: "auth", title: "Autenticacao da API", checks: authChecks },
      { id: "google-drive", title: "Google Drive e PI", checks: driveChecks },
      { id: "telegram", title: "Telegram", checks: telegramChecks },
      { id: "runner", title: "Runner e Jobs", checks: runnerChecks },
      { id: "mutation-policy", title: "Politica de Mutacao", checks: mutationChecks },
    ],
    warnings,
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
    needs_review: "Precisa revisao",
    completed: "Concluido",
    failed: "Falhou",
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
  "telegram-send-evidence": {
    queued: "Na fila",
    ready_for_runner: "Aguardando runner",
    running: "Enviando evidencia no Telegram",
    completed: "Concluido",
    failed: "Falhou",
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
  if (status === "queued" || status === "ready_for_runner") {
    return kind === "analytics-report" || kind === "pi-site-export" ? 30 * 60_000 : 15 * 60_000;
  }
  if (status === "running") {
    return kind === "analytics-report" || kind === "pi-site-export" ? 120 * 60_000 : 30 * 60_000;
  }
  return Number.POSITIVE_INFINITY;
}

function buildWatchdogFailure(record: OpsJobRecord, detectedAt: string) {
  return {
    error: `Watchdog marcou falha automatica: ${record.status} excedeu o tempo limite de ${record.kind}.`,
    result: {
      ok: false,
      watchdog: true,
      previousStatus: record.status,
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

async function getOpsJob(id: string) {
  const result = await pool.query<OpsJobRecord>("SELECT * FROM ops_jobs WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? describeJob(result.rows[0]) : null;
}

async function updateOpsJob(id: string, patch: { status?: JobStatus; result?: unknown; error?: string | null; runnerId?: string | null }) {
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
     RETURNING *`,
    [status, resultJson, errorText, runnerId, updatedAt, id],
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
  const values: unknown[] = [];
  let kindFilter = "";
  if (requestedKinds?.length) {
    values.push(requestedKinds);
    kindFilter = `AND kind = ANY($${values.length})`;
  }
  const result = await pool.query<OpsJobRecord>(
    `UPDATE ops_jobs
       SET status = 'running', runner_id = $${values.length + 1}, error_text = NULL, updated_at = $${values.length + 2}
     WHERE id = (
       SELECT id FROM ops_jobs
       WHERE status = 'ready_for_runner' ${kindFilter}
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [...values, runnerId, nowIso()],
  );
  res.json({ ok: true, job: result.rows[0] ? describeJob(result.rows[0]) : null });
});

router.post("/ops/runner/jobs/:id/progress", async (req, res): Promise<void> => {
  const updated = await updateOpsJob(req.params.id, {
    result: req.body?.result ?? null,
    runnerId: readOptionalString(req.body?.runnerId) ?? undefined,
  });
  res.status(updated ? 200 : 404).json(updated ? { ok: true, job: describeJob(updated) } : { error: "not_found", details: "Job not found" });
});

router.post("/ops/runner/jobs/:id/complete", async (req, res): Promise<void> => {
  const updated = await updateOpsJob(req.params.id, {
    status: "completed",
    result: req.body?.result ?? { ok: true },
    error: null,
    runnerId: readOptionalString(req.body?.runnerId) ?? undefined,
  });
  res.status(updated ? 200 : 404).json(updated ? { ok: true, job: describeJob(updated) } : { error: "not_found", details: "Job not found" });
});

router.post("/ops/runner/jobs/:id/fail", async (req, res): Promise<void> => {
  const updated = await updateOpsJob(req.params.id, {
    status: "failed",
    result: req.body?.result ?? null,
    error: readOptionalString(req.body?.error) ?? "Runner reportou falha sem detalhe.",
    runnerId: readOptionalString(req.body?.runnerId) ?? undefined,
  });
  res.status(updated ? 200 : 404).json(updated ? { ok: true, job: describeJob(updated) } : { error: "not_found", details: "Job not found" });
});

router.post("/ops/jobs/watchdog", async (req, res): Promise<void> => {
  const dryRun = Boolean(req.body?.dryRun);
  const limit = Math.min(Number(req.body?.limit) || 200, 500);
  const active = await pool.query<OpsJobRecord>(
    "SELECT * FROM ops_jobs WHERE status IN ('queued','ready_for_runner','running') ORDER BY created_at ASC LIMIT $1",
    [limit],
  );
  const stale: OpsJobRecord[] = active.rows.filter((record: OpsJobRecord) => getJobAgeMs(record) >= getJobTimeoutMs(record.kind, record.status));
  if (!dryRun) {
    for (const record of stale) {
      const failure = buildWatchdogFailure(record, nowIso());
      await updateOpsJob(record.id, { status: "failed", error: failure.error, result: failure.result, runnerId: record.runner_id });
    }
  }
  res.json({
    ok: true,
    dryRun,
    checked: active.rows.length,
    staleCount: stale.length,
    failedCount: dryRun ? 0 : stale.length,
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
  const active = await pool.query<OpsJobRecord>(
    "SELECT * FROM ops_jobs WHERE status IN ('running','queued','ready_for_runner') ORDER BY created_at ASC",
  );
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
  });
});

router.get("/ops/runtime-readiness", (_req, res): void => {
  res.json(buildOpsRuntimeReadiness());
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
        purpose: "Ver jobs ativos, fila e totais do dia.",
        authRequired: false,
        curl: `curl -fsSL ${base}/api/ops/queue/overview`,
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
        purpose: "Garantir evidências retroativas, documentos operacionais e ZIP por PI + site.",
        authRequired: true,
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/pi-site-export -d '{"piCodigo":"16628","siteSigla":"PERRENGUE"}'`,
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
    version: "adops-ops-api-catalog-v1",
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
      <span class="pill"><a href="/api/ops/api-catalog">JSON</a></span>
      <span class="pill"><a href="/api/ops/openapi.json">OpenAPI</a></span>
      <span class="pill"><a href="/api/ops/docs">Swagger UI</a></span>
    </div>
  </header>
  <main>${rows}</main>
</body>
</html>`);
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

router.post("/ops/jobs/pi-site-export", async (req, res): Promise<void> => {
  const piCodigo = readOptionalString(req.body?.piCodigo);
  const siteSigla = readOptionalString(req.body?.siteSigla)?.toUpperCase() ?? null;
  if (!piCodigo || !siteSigla) {
    res.status(400).json({ error: "bad_request", details: "Informe piCodigo e siteSigla." });
    return;
  }
  const jobId = await createOpsJob("pi-site-export", {
    piCodigo,
    siteSigla,
    source: "macmini-api",
  }, "ops-api");
  res.status(202).json({ ok: true, jobId, kind: "pi-site-export", status: "ready_for_runner" });
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

router.post("/ops/jobs/drive-pi-folder", async (req, res): Promise<void> => {
  await createDrivePiFolderJob(req, res, { preflightOnly: false });
});

router.post("/ops/jobs/drive-pi-preflight", async (req, res): Promise<void> => {
  await createDrivePiFolderJob(req, res, { preflightOnly: true });
});

async function createDrivePiFolderJob(req: Request, res: Response, options: { preflightOnly: boolean }) {
  const folderId = parseDriveFolderId(req.body?.folderUrl ?? req.body?.folderId ?? req.body?.driveFolderId);
  if (!folderId) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe folderUrl, folderId ou driveFolderId válido do Google Drive.",
    });
    return;
  }
  const now = nowIso();
  const source = options.preflightOnly ? "macmini-api-preflight" : "macmini-api";
  const event = {
    eventId: readOptionalString(req.body?.eventId) ?? `drive:${options.preflightOnly ? "preflight:" : ""}${folderId}:${now}`,
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
    source,
  };
  const validated = validateDrivePiEvent(event);
  if (!validated) {
    res.status(400).json({ error: "bad_request", details: "Não foi possível montar evento Drive PI válido." });
    return;
  }
  const result = await createDrivePiEventJob(validated, "ops-api");
  res.status(result.duplicate ? 200 : 202).json({ ok: true, kind: "drive-pi-ingest", preflightOnly: options.preflightOnly, ...result });
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

export default router;
