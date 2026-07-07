import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

type JobKind =
  | "print-batch"
  | "print-backfill"
  | "print-single"
  | "sync-planilha"
  | "analytics-report"
  | "pi-site-export"
  | "drive-pi-ingest"
  | "operational-documents";

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
];

const OPS_JOB_STATUSES: JobStatus[] = ["queued", "ready_for_runner", "running", "completed", "failed"];

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
    payload: parseJson(record.payload_json),
    result: parseJson(record.result_json),
    error: record.error_text,
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
  const jobId = await createOpsJob("drive-pi-ingest", { ...event, documentId, source: "google-drive-monitor" }, requestedBy);

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

router.get("/ops/api-catalog", (_req, res): void => {
  const base = "${ADOPS_API_BASE_URL:-https://adops-api.codigo5.com.br}";
  const auth = "-H \"Authorization: Bearer $OPS_API_TOKEN\" -H \"Content-Type: application/json\"";
  res.json({
    ok: true,
    version: "adops-ops-api-catalog-v1",
    auth: {
      type: "bearer",
      env: "OPS_API_TOKEN",
      note: "Nunca coloque o token em documentação, Git ou chat. Use variável de ambiente no terminal.",
    },
    endpoints: [
      {
        id: "health",
        method: "GET",
        path: "/api/healthz",
        purpose: "Conferir se a API está viva.",
        curl: `curl -fsSL ${base}/api/healthz`,
      },
      {
        id: "resolve-audit-checklist",
        method: "GET",
        path: "/api/audit-checklists/resolve?insertionId={id}&date=YYYY-MM-DD",
        purpose: "Resolver período, mídia, slot, grupo, regra e gates antes de gerar print.",
        curl: `curl -fsSL "${base}/api/audit-checklists/resolve?insertionId=1663&date=2026-07-01"`,
      },
      {
        id: "validate-proof",
        method: "POST",
        path: "/api/audit-checklists/validate-proof",
        purpose: "Validar a evidência final pela API central de checklist.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/audit-checklists/validate-proof -d '{"insertionId":1663,"date":"2026-07-01"}'`,
      },
      {
        id: "print-single",
        method: "POST",
        path: "/api/ops/jobs/print-single",
        purpose: "Gerar ou regerar uma evidência de uma inserção em uma data específica pela fila operacional.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-single -d '{"insertionId":1663,"date":"2026-07-01","replace":true}'`,
      },
      {
        id: "print-backfill",
        method: "POST",
        path: "/api/ops/jobs/print-backfill",
        purpose: "Gerar retroativos pendentes por inserção, site ou competência, usando o runner oficial.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-backfill -d '{"insertionId":1663}'`,
      },
      {
        id: "print-batch",
        method: "POST",
        path: "/api/ops/jobs/print-batch",
        purpose: "Gerar lote de uma data para site ou competência.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/print-batch -d '{"siteId":1,"date":"2026-07-01"}'`,
      },
      {
        id: "pi-site-export",
        method: "POST",
        path: "/api/ops/jobs/pi-site-export",
        purpose: "Garantir evidências retroativas, documentos operacionais e ZIP por PI + site.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/pi-site-export -d '{"piCodigo":"16628","siteSigla":"PERRENGUE"}'`,
      },
      {
        id: "drive-pi-folder",
        method: "POST",
        path: "/api/ops/jobs/drive-pi-folder",
        purpose: "Iniciar intake/cadastro operacional a partir de uma pasta do Google Drive com PI e mídia.",
        curl: `curl -fsSL -X POST ${auth} ${base}/api/ops/jobs/drive-pi-folder -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA"}'`,
      },
      {
        id: "job-status",
        method: "GET",
        path: "/api/ops/jobs/{jobId}",
        purpose: "Consultar resultado bruto do job.",
        curl: `curl -fsSL ${base}/api/ops/jobs/JOB_ID`,
      },
      {
        id: "job-progress",
        method: "GET",
        path: "/api/ops/jobs/{jobId}/progress",
        purpose: "Consultar progresso resumido do job.",
        curl: `curl -fsSL ${base}/api/ops/jobs/JOB_ID/progress`,
      },
      {
        id: "capture-proof-status",
        method: "GET",
        path: "/api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD",
        purpose: "Status final da evidência, já integrado com validate-proof.",
        curl: `curl -fsSL "${base}/api/insertions/1663/capture-proof/status?date=2026-07-01"`,
      },
    ],
  });
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
  const siteId = readOptionalNumber(req.body?.siteId);
  const competencia = readOptionalString(req.body?.competencia);
  if (!insertionId && !siteId && !competencia) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe insertionId, siteId ou competencia para limitar o backfill.",
    });
    return;
  }
  const jobId = await createOpsJob("print-backfill", {
    insertionId,
    siteId,
    competencia,
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

router.post("/ops/jobs/drive-pi-folder", async (req, res): Promise<void> => {
  const folderId = parseDriveFolderId(req.body?.folderUrl ?? req.body?.folderId ?? req.body?.driveFolderId);
  if (!folderId) {
    res.status(400).json({
      error: "bad_request",
      details: "Informe folderUrl, folderId ou driveFolderId válido do Google Drive.",
    });
    return;
  }
  const now = nowIso();
  const event = {
    eventId: readOptionalString(req.body?.eventId) ?? `drive:${folderId}:${now}`,
    driveFileId: folderId,
    name: readOptionalString(req.body?.name) ?? `Drive PI ${folderId}`,
    mimeType: "application/vnd.google-apps.folder",
    path: readOptionalString(req.body?.path) ?? `/drive/${folderId}`,
    parentFolderId: null,
    modifiedTime: readOptionalString(req.body?.modifiedTime) ?? now,
    webViewLink: readOptionalString(req.body?.folderUrl) ?? `https://drive.google.com/drive/folders/${folderId}`,
    eventType: "folder_updated" as const,
    simulation: req.body?.simulation,
    parsedPi: req.body?.parsedPi,
  };
  const validated = validateDrivePiEvent(event);
  if (!validated) {
    res.status(400).json({ error: "bad_request", details: "Não foi possível montar evento Drive PI válido." });
    return;
  }
  const result = await createDrivePiEventJob(validated, "ops-api");
  res.status(result.duplicate ? 200 : 202).json({ ok: true, kind: "drive-pi-ingest", ...result });
});

export default router;
