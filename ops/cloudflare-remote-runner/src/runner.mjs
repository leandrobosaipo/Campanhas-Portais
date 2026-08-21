import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
import { buildRunnerPools } from "./runner-concurrency.mjs";
import { planCampaignPublicationReconciliation } from "./publication-reconcile-policy.mjs";
import { classifyDailyPrintOutcome, classifyDailyReconciliationOperation } from "../../shared/daily-operations-policy.mjs";

const execFileAsync = promisify(execFile);

const OPS_API_BASE_URL = (process.env.OPS_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || "";
const PRIVATE_ADOPS_API_BASE_URL = (process.env.PRIVATE_ADOPS_API_BASE_URL || "http://127.0.0.1:4011").replace(/\/$/, "");
const PRIVATE_ADOPS_API_TOKEN = process.env.PRIVATE_ADOPS_API_TOKEN || "";
const RUNNER_ID = process.env.RUNNER_ID || `runner-${process.pid}`;
const PROJECT_ROOT = process.env.CAMPANHAS_PORTAIS_ROOT || process.cwd();
const POLL_INTERVAL_MS = Number.parseInt(process.env.OPS_POLL_INTERVAL_MS || "5000", 10);
const OPS_CAMPAIGN_EXPORT_CONCURRENCY = Number.parseInt(process.env.OPS_CAMPAIGN_EXPORT_CONCURRENCY || "3", 10);
const RUNNER_HEALTH_PORT = Number.parseInt(process.env.ADOPS_RUNNER_HEALTH_PORT || "0", 10);
const WATCHDOG_INTERVAL_MS = Number.parseInt(process.env.OPS_WATCHDOG_INTERVAL_MS || "60000", 10);
const RUNNER_HEARTBEAT_INTERVAL_MS = Number.parseInt(process.env.ADOPS_RUNNER_HEARTBEAT_INTERVAL_MS || "60000", 10);
const RUNNER_VERSION = (process.env.ADOPS_RELEASE_SHA || process.env.ADOPS_IMAGE_TAG || "development").trim();
const ANALYTICS_REPORT_PROJECT_ROOT = process.env.ANALYTICS_REPORT_PROJECT_ROOT || "/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/projects/perrengue-ga4-relatorio-analytics";
const ANALYTICS_REPORT_PYTHON = process.env.ANALYTICS_REPORT_PYTHON || path.join(ANALYTICS_REPORT_PROJECT_ROOT, ".venv/bin/python");
const ANALYTICS_REPORT_HOOK_URL = (process.env.ANALYTICS_REPORT_HOOK_URL || "").trim();
const DRIVE_PI_ARCHIVE_DIR = process.env.DRIVE_PI_ARCHIVE_DIR || path.join(PROJECT_ROOT, ".adops-drive-pi");
const DRIVE_PI_MONITOR_ENABLED = process.env.DRIVE_PI_MONITOR_ENABLED === "true";
const DRIVE_PI_MONITOR_ROOT_FOLDER_ID = (process.env.DRIVE_PI_MONITOR_ROOT_FOLDER_ID || "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6").trim();
const DRIVE_PI_MONITOR_INTERVAL_MS = Number.parseInt(process.env.DRIVE_PI_MONITOR_INTERVAL_MS || "300000", 10);
const DRIVE_PI_MONITOR_STATE_FILE = process.env.DRIVE_PI_MONITOR_STATE_FILE || "/var/lib/adops/drive-pi-monitor-state.json";
const DRIVE_PI_MONITOR_MAX_ITEMS = Number.parseInt(process.env.DRIVE_PI_MONITOR_MAX_ITEMS || "2000", 10);
const ADOPS_DRIVE_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.ADOPS_DRIVE_REQUEST_TIMEOUT_MS || "30000", 10);
const ADOPS_DRIVE_RETRY_MAX_ATTEMPTS = Number.parseInt(process.env.ADOPS_DRIVE_RETRY_MAX_ATTEMPTS || "7", 10);
const ADOPS_DRIVE_RETRY_BASE_MS = Number.parseInt(process.env.ADOPS_DRIVE_RETRY_BASE_MS || "2000", 10);
const ADOPS_DRIVE_RETRY_MAX_MS = Number.parseInt(process.env.ADOPS_DRIVE_RETRY_MAX_MS || "30000", 10);
const GOOGLE_DRIVE_REFRESH_TOKEN = (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();
const GOOGLE_DRIVE_CLIENT_ID = (process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim();
const GOOGLE_DRIVE_CLIENT_SECRET = (process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim();
const GOOGLE_DRIVE_ACCESS_TOKEN = (process.env.GOOGLE_DRIVE_ACCESS_TOKEN || "").trim();
const GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE || "").trim();
const GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "").trim();
const ADOPS_DRIVE_PI_ALLOW_MUTATION = process.env.ADOPS_DRIVE_PI_ALLOW_MUTATION === "true";
// This gate is intentionally independent from the generic Drive/AI intake.
// It permits only the deterministic planilha + snapshot reconciliation flow.
const ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED = process.env.ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED === "true";
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const ADOPS_PI_AGENT_ENABLED = process.env.ADOPS_PI_AGENT_ENABLED === "true";
const ADOPS_PI_AGENT_AUTO_APPLY = process.env.ADOPS_PI_AGENT_AUTO_APPLY === "true";
const ADOPS_PI_AGENT_MODEL = (process.env.ADOPS_PI_AGENT_MODEL || "gpt-4.1-mini").trim();
const ADOPS_PI_AGENT_MIN_CONFIDENCE = Number.parseFloat(process.env.ADOPS_PI_AGENT_MIN_CONFIDENCE || "0.85");
const ADOPS_PI_AGENT_KNOWLEDGE_FILE = process.env.ADOPS_PI_AGENT_KNOWLEDGE_FILE || path.join(PROJECT_ROOT, "docs/adops/pi-automation-v3/spm-agent-knowledge.md");
const ADOPS_PI_AGENT_TIMEOUT_MS = Number.parseInt(process.env.ADOPS_PI_AGENT_TIMEOUT_MS || "15000", 10);
const ADOPS_PI_AGENT_RETRIES = Number.parseInt(process.env.ADOPS_PI_AGENT_RETRIES || "1", 10);
const ADOPS_PI_AGENT_VERSION = "adops-pi-agent-v1";
const COD5_VIDEO_COMPRESSOR_API_BASE = (process.env.COD5_VIDEO_COMPRESSOR_API_BASE || "https://video-compress.codigo5.com.br").replace(/\/$/, "");
const COD5_VIDEO_COMPRESSOR_API_TOKEN = (process.env.COD5_VIDEO_COMPRESSOR_API_TOKEN || "").trim();
const COD5_VIDEO_COMPRESSOR_PROFILE = (process.env.COD5_VIDEO_COMPRESSOR_PROFILE || "balanced-720p").trim();
const COD5_VIDEO_COMPRESSOR_TIMEOUT_MS = Number.parseInt(process.env.COD5_VIDEO_COMPRESSOR_TIMEOUT_MS || "900000", 10);
const COD5_VIDEO_COMPRESSOR_POLL_INTERVAL_MS = Number.parseInt(process.env.COD5_VIDEO_COMPRESSOR_POLL_INTERVAL_MS || "10000", 10);
const DO_SPACES_ACCESS_KEY_ID = (process.env.DO_SPACES_ACCESS_KEY_ID || "").trim();
const DO_SPACES_SECRET_ACCESS_KEY = (process.env.DO_SPACES_SECRET_ACCESS_KEY || "").trim();
const DO_SPACES_ENDPOINT = (process.env.DO_SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com").replace(/\/$/, "");
const DO_SPACES_REGION = (process.env.DO_SPACES_REGION || "nyc3").trim();
const ADOPS_VIDEO_MEDIA_BUCKET = (process.env.ADOPS_VIDEO_MEDIA_BUCKET || process.env.ADOPS_SPACES_BUCKET || "cod5").trim();
const ADOPS_VIDEO_MEDIA_BASE_PATH = (process.env.ADOPS_VIDEO_MEDIA_BASE_PATH || "adops-media").replace(/^\/+|\/+$/g, "");
const ADOPS_EXPORT_BUCKET = (process.env.ADOPS_EXPORT_BUCKET || process.env.ADOPS_SPACES_BUCKET || "cod5").trim();
const ADOPS_EXPORT_BASE_PATH = (process.env.ADOPS_EXPORT_BASE_PATH || "adops-exports").replace(/^\/+|\/+$/g, "");
const ADOPS_VIDEO_MEDIA_BUCKET_BY_SITE = process.env.ADOPS_VIDEO_MEDIA_BUCKET_BY_SITE || "";
const ADOPS_VIDEO_MEDIA_PUBLIC_BASE_URL = (process.env.ADOPS_VIDEO_MEDIA_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const ADOPS_VIDEO_MEDIA_PUBLIC_BASE_BY_SITE = process.env.ADOPS_VIDEO_MEDIA_PUBLIC_BASE_BY_SITE || "";
const ADOPS_MEDIA_MAX_BYTES = Number.parseInt(process.env.ADOPS_MEDIA_MAX_BYTES || String(256 * 1024 * 1024), 10);
const ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS = (process.env.ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS || "")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);
const ADOPS_TELEGRAM_BOT_URL = (process.env.ADOPS_TELEGRAM_BOT_URL || "https://adops-telegram-bot.leandro471.workers.dev").replace(/\/$/, "");
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_DEFAULT_GROUP_ID = (process.env.TELEGRAM_DEFAULT_GROUP_ID || "").trim();
const PORTAINER_URL = (process.env.PORTAINER_URL || "").replace(/\/$/, "");
const PORTAINER_API_KEY = (process.env.PORTAINER_API_KEY || "").trim();
const ADOPS_PERRENGUE_ADROTATE_EXEC_MODE = (process.env.ADOPS_PERRENGUE_ADROTATE_EXEC_MODE || "ssh").trim().toLowerCase();
const ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID = Number.parseInt(process.env.ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID || process.env.PORTAINER_ENDPOINT_ID || "3", 10);
const ADOPS_PERRENGUE_WP_CONTAINER = (process.env.ADOPS_PERRENGUE_WP_CONTAINER || "cod5-pro119-perrenguematogrosso-app").trim();
const ADOPS_PERRENGUE_CONTAINER_WP_PATH = (process.env.ADOPS_PERRENGUE_CONTAINER_WP_PATH || "/app/web/wp").trim();
const ADOPS_PERRENGUE_CONTAINER_PHP_BIN = (process.env.ADOPS_PERRENGUE_CONTAINER_PHP_BIN || "php").trim();
const ADOPS_PERRENGUE_CONTAINER_WP_CLI_PATH = (process.env.ADOPS_PERRENGUE_CONTAINER_WP_CLI_PATH || "wp").trim();
const ADOPS_PERRENGUE_PORTAINER_TLS_INSECURE = process.env.ADOPS_PERRENGUE_PORTAINER_TLS_INSECURE === "true";
const ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS = Number.parseInt(process.env.ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS || "1200000", 10);
const ADOPS_PERRENGUE_REBUILD_POLL_INTERVAL_MS = Number.parseInt(process.env.ADOPS_PERRENGUE_REBUILD_POLL_INTERVAL_MS || "5000", 10);
const kinds = (process.env.OPS_JOB_KINDS || "sync-planilha,print-batch,print-backfill,print-single,analytics-report,pi-site-export,campaign-evidence-export,evidence-monthly-report,campaign-publication-reconcile,drive-pi-ingest,drive-inventory-refresh,reconcile-adrotate,adrotate-link,adrotate-publish,drive-pi-reconcile,telegram-send-evidence,runtime-readiness-probe")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let lastWatchdogAt = 0;
let lastDrivePiMonitorAt = 0;
let lastRunnerHeartbeatAt = 0;
let runnerLastCycleError = null;
let runnerLastSuccessAt = null;
let googleDriveAccessTokenCache = null;

const ANALYTICS_SITE_CONFIGS = {
  "afolhalivre-ga4": "afolhalivre",
  "omatogrossense-ga4": "omatogrossense",
  "perrenguemt-ga4": "perrenguemt",
  "portalnortemt-ga4": "portalnortemt",
  "portalpantanalmt-ga4": "portalpantanalmt",
  "roonoticias-ga4": "roonoticias",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startRunnerHealthServer() {
  if (!Number.isInteger(RUNNER_HEALTH_PORT) || RUNNER_HEALTH_PORT <= 0) return null;
  const server = http.createServer((req, res) => {
    if (req.url !== "/healthz") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"ok":false,"error":"not_found"}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({
      ok: true,
      runnerId: RUNNER_ID,
      driveMonitorEnabled: DRIVE_PI_MONITOR_ENABLED,
      kinds,
      uptimeSeconds: Math.floor(process.uptime()),
    }));
  });
  server.listen(RUNNER_HEALTH_PORT, "0.0.0.0", () => {
    console.log(`[runner] health interno em :${RUNNER_HEALTH_PORT}/healthz`);
  });
  return server;
}

async function request(pathname, init = {}) {
  const response = await fetch(`${OPS_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPS_API_TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Falha em ${pathname}`);
  }
  return payload;
}

async function privateApi(pathname, body, extraHeaders = {}) {
  const response = await fetch(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PRIVATE_ADOPS_API_TOKEN ? { "x-adops-api-token": PRIVATE_ADOPS_API_TOKEN } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Falha na API privada ${pathname}`);
  }
  return payload;
}

function competenciaForEvidenceDate(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match) return null;
  const months = ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  return `${months[Number(match[2])]}/${match[1]}`;
}

async function markMonthlyReportRefreshAfterApproval(date, insertionId) {
  const competencia = competenciaForEvidenceDate(date);
  if (!competencia) return null;
  try {
    return await request("/api/ops/monthly-report-refreshes", {
      method: "POST",
      body: JSON.stringify({
        targetDate: date,
        competencia,
        insertionId,
        source: "runner-evidence-approved",
      }),
    });
  } catch (error) {
    console.warn(`[runner] atualização incremental do relatório não foi agendada para #${insertionId}/${date}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function enqueueAndWaitCaptureProof({ outerJobId, insertionId, date, captureAt = null, replace = false, force = false, reconstructionReason = null }) {
  if (!outerJobId) throw new Error("Captura assíncrona exige o ID estável do job externo.");
  const idempotencyKey = `runner-capture:${outerJobId}:${insertionId}:${date}`;
  const accepted = await privateApi(`/api/insertions/${insertionId}/capture-proof/jobs`, {
    date,
    captureAt,
    replace: replace || force,
    force,
    reconstructionReason,
  }, { "Idempotency-Key": idempotencyKey });
  const jobId = String(accepted?.jobId || "").trim();
  if (!jobId) throw new Error(`API não retornou jobId para captura ${insertionId}/${date}.`);

  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const job = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/jobs/${encodeURIComponent(jobId)}`);
    await progressJob(outerJobId, {
      stage: "capture_async_wait",
      captureJobId: jobId,
      insertionId,
      date,
      captureStatus: job?.status ?? "unknown",
    });
    if (job?.status === "completed") {
      const item = Array.isArray(job?.items) ? job.items.find((entry) => Number(entry?.insertionId) === insertionId && entry?.targetDate === date) : null;
      if (!item || item.status !== "ok") throw new Error(item?.error || `Captura assíncrona ${jobId} concluiu sem item aprovado.`);
      await markMonthlyReportRefreshAfterApproval(date, insertionId);
      return { jobId, job, item };
    }
    if (["failed", "cancelled"].includes(String(job?.status || ""))) {
      const item = Array.isArray(job?.items) ? job.items.find((entry) => Number(entry?.insertionId) === insertionId && entry?.targetDate === date) : null;
      throw new Error(item?.error || `Captura assíncrona ${jobId} terminou como ${job.status}.`);
    }
    await sleep(5000);
  }
  throw new Error(`Timeout aguardando captura assíncrona ${jobId} para ${insertionId}/${date}.`);
}

async function sendRunnerHeartbeat(force = false) {
  const now = Date.now();
  if (!force && now - lastRunnerHeartbeatAt < RUNNER_HEARTBEAT_INTERVAL_MS) return null;
  lastRunnerHeartbeatAt = now;
  return privateApi("/api/ops/runner/heartbeat", {
    runnerId: RUNNER_ID,
    version: RUNNER_VERSION,
    capabilities: {
      jobKinds: kinds,
      driveMonitorEnabled: DRIVE_PI_MONITOR_ENABLED,
      healthPortEnabled: RUNNER_HEALTH_PORT > 0,
    },
    lastCycleAt: new Date(now).toISOString(),
    lastSuccessAt: runnerLastSuccessAt,
    lastError: runnerLastCycleError,
  });
}

async function privateApiPatch(pathname, body) {
  const response = await fetch(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(PRIVATE_ADOPS_API_TOKEN ? { "x-adops-api-token": PRIVATE_ADOPS_API_TOKEN } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Falha na API privada ${pathname}`);
  }
  return payload;
}

async function privateApiGet(pathname) {
  const response = await fetch(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: "GET",
    headers: {
      ...(PRIVATE_ADOPS_API_TOKEN ? { "x-adops-api-token": PRIVATE_ADOPS_API_TOKEN } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || `Falha na API privada ${pathname}`);
  }
  return payload;
}

function httpDownloadBuffer(url, {
  method = "GET",
  headers = {},
  body = undefined,
  timeoutMs = 20 * 60_000,
  maxBytes = ADOPS_MEDIA_MAX_BYTES,
} = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const requestBody = body === undefined ? null : Buffer.from(body);
    let settled = false;
    let deadline = null;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      reject(error);
    };
    const succeed = (result) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      resolve(result);
    };
    const req = client.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        ...headers,
        ...(requestBody ? { "content-length": String(requestBody.length) } : {}),
      },
    }, (response) => {
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > maxBytes) {
        const error = new Error(`Download excede o limite de ${maxBytes} bytes.`);
        fail(error);
        response.destroy(error);
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          const error = new Error(`Download excede o limite de ${maxBytes} bytes.`);
          fail(error);
          response.destroy(error);
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on("error", fail);
      response.on("end", () => succeed({
        statusCode: response.statusCode || 0,
        contentType: String(response.headers["content-type"] || "application/octet-stream").split(";", 1)[0],
        buffer: Buffer.concat(chunks),
      }));
    });
    const timeoutError = () => new Error(`Timeout após ${timeoutMs} ms no download da API privada.`);
    deadline = setTimeout(() => {
      const error = timeoutError();
      fail(error);
      req.destroy(error);
    }, timeoutMs);
    req.setTimeout(timeoutMs, () => {
      const error = timeoutError();
      fail(error);
      req.destroy(error);
    });
    req.on("error", fail);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

async function privateApiDownload(pathname, body = undefined) {
  const result = await httpDownloadBuffer(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(PRIVATE_ADOPS_API_TOKEN ? { "x-adops-api-token": PRIVATE_ADOPS_API_TOKEN } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const details = result.buffer.toString("utf8");
    throw new Error(details || `Falha na API privada ${pathname}`);
  }
  const buffer = result.buffer;
  if (!buffer.length) throw new Error("A API privada concluiu o export sem conteúdo.");
  return {
    buffer,
    contentType: result.contentType,
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSiteAlias(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/\b(a folha livre|afolha livre|afl)\b/.test(normalized)) return "AFL";
  if (/\b(o matogrossense|omatogrossense|matogrossense|omt)\b/.test(normalized)) return "OMT";
  if (/\b(perrengue|perrengue mt|perrengue mato grosso)\b/.test(normalized)) return "PERRENGUE";
  if (/\b(portal norte mt|portal norte|norte mt|pnmt|nmt)\b/.test(normalized)) return "PNMT";
  if (/\b(portal pantanal mt|portal pantanal|pantanal mt|ppmt|pmmt)\b/.test(normalized)) return "PPMT";
  if (/\b(roo noticias|roo news|roo)\b/.test(normalized)) return "ROO";
  return null;
}

function exactSiteFolderAlias(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases = new Map([
    ["a folha livre", "AFL"], ["afolha livre", "AFL"], ["afl", "AFL"],
    ["o matogrossense", "OMT"], ["omatogrossense", "OMT"], ["matogrossense", "OMT"], ["omt", "OMT"],
    ["perrengue", "PERRENGUE"], ["perrengue mt", "PERRENGUE"], ["perrengue mato grosso", "PERRENGUE"],
    ["portal norte mt", "PNMT"], ["portal norte", "PNMT"], ["norte mt", "PNMT"], ["pnmt", "PNMT"], ["nmt", "PNMT"],
    ["portal pantanal mt", "PPMT"], ["portal pantanal", "PPMT"], ["pantanal mt", "PPMT"], ["ppmt", "PPMT"], ["pmmt", "PPMT"],
    ["roo noticias", "ROO"], ["roo news", "ROO"], ["roo", "ROO"],
  ]);
  return aliases.get(normalized) || null;
}

function observedSiteFolderAliases(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[\\/]+/)
      .map(exactSiteFolderAlias)
      .filter(Boolean),
  ));
}

function observedCanonicalSiteAliases(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = [
    ["AFL", /\b(a folha livre|afolha livre|afl)\b/],
    ["OMT", /\b(o matogrossense|omatogrossense|matogrossense|omt)\b/],
    ["PERRENGUE", /\b(perrengue|perrengue mt|perrengue mato grosso)\b/],
    ["PNMT", /\b(portal norte mt|portal norte|norte mt|pnmt|nmt)\b/],
    ["PPMT", /\b(portal pantanal mt|portal pantanal|pantanal mt|ppmt|pmmt)\b/],
    ["ROO", /\b(roo noticias|roo news|roo)\b/],
  ];
  return matches.filter(([, pattern]) => pattern.test(normalized)).map(([sigla]) => sigla);
}

function clientAliasCandidates(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [];
  if (/\b(assembleia legislativa|almt)\b/.test(normalized)) candidates.push("ALMT");
  if (/\b(secom|governo|gov mt|governo do estado)\b/.test(normalized)) candidates.push("Governo do Estado");
  if (/\b(municipio de cuiaba|prefeitura de cuiaba|pref cba|cuiaba)\b/.test(normalized)) candidates.push("Prefeitura de Cuiabá");
  if (/\b(pref mun de rondonopolis|municipio de rondonopolis|prefeitura de rondonopolis|pref roo)\b/.test(normalized)) candidates.push("Prefeitura de Rondonópolis");
  if (/\b(tribunal de contas|tce mt|tce)\b/.test(normalized)) candidates.push("TCE-MT");
  return candidates;
}

function agencyAliasCandidates(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [];
  if (/\b(zimmermann publicidade|zimmermann|z3)\b/.test(normalized)) candidates.push("Z3");
  if (/\b(spm comunicacao|spm)\b/.test(normalized)) candidates.push("DMD");
  if (/\b(renca)\b/.test(normalized)) candidates.push("Renca");
  if (/\b(genius)\b/.test(normalized)) candidates.push("Genius");
  return candidates;
}

function normalizeCompetenciaKey(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const iso = normalized.match(/\b(20\d{2})\s+(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}`;
  const numeric = normalized.match(/\b(\d{1,2})\s+(20\d{2})\b/);
  if (numeric) return `${numeric[2]}-${String(Number(numeric[1])).padStart(2, "0")}`;
  const monthMap = new Map([
    ["janeiro", "01"],
    ["fevereiro", "02"],
    ["marco", "03"],
    ["abril", "04"],
    ["maio", "05"],
    ["junho", "06"],
    ["julho", "07"],
    ["agosto", "08"],
    ["setembro", "09"],
    ["outubro", "10"],
    ["novembro", "11"],
    ["dezembro", "12"],
  ]);
  const month = Array.from(monthMap.entries()).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  const year = normalized.match(/\b(20\d{2})\b/)?.[1];
  return month && year ? `${year}-${month[1]}` : normalized;
}

function normalizeSlotKey(value) {
  return normalizeText(value)
    .replace(/\b\d+\s*x\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(banner|px|pixel|pixels|diaria|diario)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SOCIAL_INSERTION_PATTERN = /\b(instagram|stories?|reels?|social|sociais|redes sociais|feed|bonificacao|facebook|tiktok)\b/;

function isSocialInsertion(raw) {
  const format = readStringRecord(raw, ["localFormato", "localFormatoNormalizado", "formato", "posicao"]);
  return SOCIAL_INSERTION_PATTERN.test(normalizeText(format));
}

function filterSiteInsertions(insertions) {
  const accepted = [];
  const excluded = [];
  for (const insertion of Array.isArray(insertions) ? insertions : []) {
    if (isSocialInsertion(insertion)) {
      excluded.push({ insertion, reason: "social_format" });
    } else {
      accepted.push(insertion);
    }
  }
  return { accepted, excluded };
}

function safeFileName(value, fallback = "drive-pi") {
  const sanitized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return sanitized || fallback;
}

function slugifyPathPart(value, fallback = "media") {
  const sanitized = normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return sanitized || fallback;
}

function parseEnvMap(value) {
  const entries = new Map();
  for (const item of String(value || "").split(",")) {
    const match = item.trim().match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (match) entries.set(match[1].trim().toUpperCase(), match[2].trim());
  }
  return entries;
}

function isVideoMediaItem(item) {
  const mimeType = String(item?.mimeType || "");
  const name = String(item?.name || "");
  return /^video\//.test(mimeType) || /\.(mp4|mov|m4v|webm)$/i.test(name);
}

function isVideoInsertion(raw) {
  const formato = readStringRecord(raw, ["localFormato", "localFormatoNormalizado", "formato", "posicao"]);
  return /\bvideo\b/.test(normalizeSlotKey(formato));
}

function buildVideoCompressorIdempotencyKey(payload, mediaItem, raw, fields) {
  const source = [
    "drive-pi-video",
    payload?.eventId || payload?.driveFileId || payload?.parentFolderId || "event",
    mediaItem?.driveFileId || mediaItem?.name || "media",
    fields?.piCodigo || "pi",
    readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "video",
    COD5_VIDEO_COMPRESSOR_PROFILE,
  ].join(":");
  return crypto.createHash("sha256").update(source).digest("hex");
}

function scoreVideoMediaForInsertion(mediaItem, raw, fields) {
  const haystack = normalizeText(`${mediaItem?.name || ""} ${mediaItem?.path || ""}`);
  let score = 0;
  const piDigits = normalizePiDigits(fields?.piCodigo);
  if (piDigits && haystack.includes(piDigits)) score += 80;
  const campaignWords = normalizeText(fields?.campaignName || "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  for (const word of campaignWords) {
    if (haystack.includes(word)) score += 8;
  }
  const formatoWords = normalizeSlotKey(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  for (const word of formatoWords) {
    if (haystack.includes(word)) score += 6;
  }
  if (/(\b|[-_])video(\b|[-_])/.test(haystack)) score += 20;
  if (/\.(mp4|mov|m4v|webm)$/i.test(String(mediaItem?.name || ""))) score += 10;
  return score;
}

function selectDriveVideoForInsertion(packageContext, raw, fields) {
  const videos = (Array.isArray(packageContext?.media) ? packageContext.media : []).filter(isVideoMediaItem);
  if (videos.length === 0) return { mediaItem: null, ambiguous: false, candidates: 0 };
  const explicitDriveFileId = readStringRecord(raw, ["mediaDriveFileId", "sourceDriveFileId", "driveFileId"]);
  if (explicitDriveFileId) {
    const exact = videos.find((item) => item?.driveFileId === explicitDriveFileId);
    return exact
      ? { mediaItem: exact, ambiguous: false, candidates: 1, selectedBy: "explicit_drive_file_id" }
      : { mediaItem: null, ambiguous: false, candidates: 0, selectedBy: "explicit_drive_file_id_missing" };
  }
  if (videos.length === 1) return { mediaItem: videos[0], ambiguous: false, candidates: 1 };
  const ranked = videos
    .map((item) => ({ item, score: scoreVideoMediaForInsertion(item, raw, fields) }))
    .sort((a, b) => b.score - a.score);
  const ambiguous = ranked.length > 1 && ranked[0].score === ranked[1].score;
  return {
    mediaItem: ranked[0].item,
    ambiguous,
    candidates: videos.length,
    score: ranked[0].score,
  };
}

function selectObservedMediaLink(packageContext, kind) {
  const links = (Array.isArray(packageContext?.textObservations) ? packageContext.textObservations : [])
    .flatMap((item) => Array.isArray(item?.links) ? item.links.map((link) => ({ ...link, sourceName: item.name })) : [])
    .filter((item) => item?.url && item.kind === kind);
  const candidates = links;
  if (candidates.length !== 1) {
    return { link: null, ambiguous: candidates.length > 1, candidates: candidates.length };
  }
  return { link: candidates[0], ambiguous: false, candidates: 1 };
}

function resolveDrivePiClickUrl(fields, packageContext) {
  const explicit = firstNonEmptyString(fields?.clickUrl, readUrlRecord(fields?.raw || {}, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]));
  const unknownLinks = Array.from(new Set(
    (Array.isArray(packageContext?.textObservations) ? packageContext.textObservations : [])
      .flatMap((item) => Array.isArray(item?.links) ? item.links : [])
      .filter((item) => item?.kind === "unknown" && item?.url)
      .map((item) => item.url),
  ));
  const clickUrl = explicit || (unknownLinks.length === 1 ? unknownLinks[0] : null);
  return {
    fields: {
      ...fields,
      clickUrl,
      insertions: (Array.isArray(fields?.insertions) ? fields.insertions : []).map((item) => ({
        ...item,
        ...(readUrlRecord(item, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]) || !clickUrl ? {} : { clickUrl }),
      })),
    },
    clickUrl,
    source: explicit ? "parsed_pi_or_pdf" : clickUrl ? "txt_observation" : "missing",
    ambiguousCandidates: explicit ? [] : unknownLinks.length > 1 ? unknownLinks : [],
  };
}

function scoreImageMediaForInsertion(mediaItem, raw, fields) {
  const haystack = normalizeText(`${mediaItem?.name || ""} ${mediaItem?.path || ""}`);
  let score = 0;
  const piDigits = normalizePiDigits(fields?.piCodigo);
  if (piDigits && haystack.includes(piDigits)) score += 80;
  for (const word of normalizeText(fields?.campaignName || "").split(/[^a-z0-9]+/).filter((item) => item.length >= 4)) {
    if (haystack.includes(word)) score += 8;
  }
  for (const word of normalizeSlotKey(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "").split(/\s+/).filter((item) => item.length >= 4)) {
    if (haystack.includes(word)) score += 6;
  }
  if (/\.(gif|png|jpe?g|webp)$/i.test(String(mediaItem?.name || ""))) score += 10;
  return score;
}

function selectDriveImageForInsertion(packageContext, raw, fields) {
  const images = (Array.isArray(packageContext?.media) ? packageContext.media : []).filter(isImageMediaItem);
  if (images.length === 0) return { mediaItem: null, ambiguous: false, candidates: 0 };
  const explicitDriveFileId = readStringRecord(raw, ["mediaDriveFileId", "sourceDriveFileId", "driveFileId"]);
  if (explicitDriveFileId) {
    const exact = images.find((item) => item?.driveFileId === explicitDriveFileId);
    return exact
      ? { mediaItem: exact, ambiguous: false, candidates: 1, selectedBy: "explicit_drive_file_id" }
      : { mediaItem: null, ambiguous: false, candidates: 0, selectedBy: "explicit_drive_file_id_missing" };
  }
  if (images.length === 1) return { mediaItem: images[0], ambiguous: false, candidates: 1 };
  const ranked = images.map((item) => ({ item, score: scoreImageMediaForInsertion(item, raw, fields) })).sort((a, b) => b.score - a.score);
  return {
    mediaItem: ranked[0].item,
    ambiguous: ranked[0].score === ranked[1].score,
    candidates: images.length,
    score: ranked[0].score,
  };
}

async function downloadExternalMediaToArchive(url, fallbackName = "media") {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Falha ao baixar mídia externa: HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Mídia externa excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Mídia externa excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  let sourceName = safeFileName(mediaBasenameFromUrl(response.url || url) || fallbackName, fallbackName);
  if (!path.extname(sourceName)) {
    const extension = ({
      "image/gif": ".gif",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm",
    })[mimeType];
    if (extension) sourceName += extension;
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const dir = path.join(DRIVE_PI_ARCHIVE_DIR, new Date().toISOString().slice(0, 10));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sha256.slice(0, 12)}-${sourceName}`);
  await writeFile(filePath, buffer);
  return {
    filePath,
    buffer,
    bytes: buffer.length,
    sha256,
    sourceName,
    mimeType: mimeType === "application/octet-stream" ? contentTypeForMediaName(sourceName) : mimeType,
    sourceUrl: url,
  };
}

async function materializeMediaSource({ driveItem, observedLink, fallbackName }) {
  if (observedLink?.driveFileId) {
    const metadata = await googleDriveRequest(`files/${encodeURIComponent(observedLink.driveFileId)}`, {
      fields: "id,name,mimeType,size,webViewLink",
      supportsAllDrives: "true",
    }).catch(() => null);
    const archived = await downloadDriveFileToArchive({
      driveFileId: observedLink.driveFileId,
      name: metadata?.name || fallbackName,
      mimeType: metadata?.mimeType || "application/octet-stream",
    });
    return {
      ...archived,
      buffer: await readFile(archived.filePath),
      sourceUrl: observedLink.url,
      sourceName: metadata?.name || archived.sourceName,
      mimeType: metadata?.mimeType || contentTypeForMediaName(metadata?.name || archived.sourceName),
    };
  }
  if (observedLink?.url) return downloadExternalMediaToArchive(observedLink.url, fallbackName);
  if (driveItem?.driveFileId) {
    const archived = await downloadDriveFileToArchive(driveItem);
    return {
      ...archived,
      buffer: await readFile(archived.filePath),
      mimeType: driveItem.mimeType || contentTypeForMediaName(driveItem.name),
      sourceName: driveItem.name,
    };
  }
  return null;
}

async function compressVideoWithCod5Api({ inputPath, sourceName, idempotencyKey }) {
  if (!COD5_VIDEO_COMPRESSOR_API_TOKEN) {
    throw new Error("COD5_VIDEO_COMPRESSOR_API_TOKEN ausente no runner");
  }
  const inputStat = await stat(inputPath);
  if (inputStat.size > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Vídeo excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const bytes = await readFile(inputPath);
  const form = new FormData();
  form.append("profile", COD5_VIDEO_COMPRESSOR_PROFILE);
  form.append("file", new Blob([bytes], { type: "video/mp4" }), safeFileName(sourceName, "video.mp4"));
  const createResponse = await fetch(`${COD5_VIDEO_COMPRESSOR_API_BASE}/v1/video-compression/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COD5_VIDEO_COMPRESSOR_API_TOKEN}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: form,
  });
  const created = await createResponse.json().catch(() => null);
  if (!createResponse.ok) {
    throw new Error(created?.detail || created?.error || `Falha ao criar job no compressor: ${createResponse.status}`);
  }
  const jobId = created?.job_id || created?.id;
  if (!jobId) throw new Error("Compressor nao retornou job_id");

  const deadline = Date.now() + COD5_VIDEO_COMPRESSOR_TIMEOUT_MS;
  let statusPayload = null;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${COD5_VIDEO_COMPRESSOR_API_BASE}/v1/video-compression/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${COD5_VIDEO_COMPRESSOR_API_TOKEN}` },
    });
    statusPayload = await statusResponse.json().catch(() => null);
    if (!statusResponse.ok) {
      throw new Error(statusPayload?.detail || statusPayload?.error || `Falha ao consultar compressor: ${statusResponse.status}`);
    }
    if (statusPayload?.status === "done") break;
    if (["failed", "error", "cancelled"].includes(String(statusPayload?.status || ""))) {
      throw new Error(statusPayload?.error || `Compressor terminou com status ${statusPayload?.status}`);
    }
    await sleep(COD5_VIDEO_COMPRESSOR_POLL_INTERVAL_MS);
  }
  if (statusPayload?.status !== "done") {
    throw new Error(`Timeout aguardando compressor concluir job ${jobId}`);
  }

  const downloadResponse = await fetch(`${COD5_VIDEO_COMPRESSOR_API_BASE}/v1/video-compression/jobs/${encodeURIComponent(jobId)}/download`, {
    headers: { Authorization: `Bearer ${COD5_VIDEO_COMPRESSOR_API_TOKEN}` },
  });
  if (!downloadResponse.ok) {
    throw new Error(`Falha ao baixar video comprimido: ${downloadResponse.status}`);
  }
  const compressedLength = Number(downloadResponse.headers.get("content-length") || 0);
  if (compressedLength > ADOPS_MEDIA_MAX_BYTES) throw new Error("Vídeo comprimido excede limite operacional do runner.");
  const compressedBuffer = Buffer.from(await downloadResponse.arrayBuffer());
  if (compressedBuffer.length > ADOPS_MEDIA_MAX_BYTES) throw new Error("Vídeo comprimido excede limite operacional do runner.");
  return {
    jobId,
    status: statusPayload,
    filename: statusPayload?.download_filename || safeFileName(sourceName, "video-compressed.mp4"),
    buffer: compressedBuffer,
  };
}

function spacesBucketForSite(siteSigla) {
  const bySite = parseEnvMap(ADOPS_VIDEO_MEDIA_BUCKET_BY_SITE);
  return bySite.get(String(siteSigla || "").toUpperCase()) || ADOPS_VIDEO_MEDIA_BUCKET;
}

function spacesPublicBaseForSite(siteSigla, bucket) {
  const bySite = parseEnvMap(ADOPS_VIDEO_MEDIA_PUBLIC_BASE_BY_SITE);
  const configured = bySite.get(String(siteSigla || "").toUpperCase()) || ADOPS_VIDEO_MEDIA_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  try {
    const endpoint = new URL(DO_SPACES_ENDPOINT);
    if (endpoint.hostname.endsWith(".digitaloceanspaces.com")) {
      const region = endpoint.hostname.split(".")[0] || DO_SPACES_REGION;
      return `https://${bucket}.${region}.digitaloceanspaces.com`;
    }
    return `${endpoint.origin}/${bucket}`;
  } catch {
    return `${DO_SPACES_ENDPOINT}/${bucket}`;
  }
}

function buildSpacesVideoObjectKey({ siteSigla, fields, raw }) {
  const periodoInicio = readStringRecord(raw, ["periodoInicio", "inicio"]) || todayInCuiaba();
  const month = periodoInicio.slice(0, 7);
  const sitePart = slugifyPathPart(siteSigla || readStringRecord(raw, ["siteSigla"]) || "site");
  const piPart = slugifyPathPart(fields?.piCodigo || "pi");
  const campaignPart = slugifyPathPart(fields?.campaignName || "campanha");
  const formatPart = slugifyPathPart(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "video");
  const filename = `${piPart}-${campaignPart}-${formatPart}-compressed.mp4`;
  return [ADOPS_VIDEO_MEDIA_BASE_PATH, sitePart, month, filename].filter(Boolean).join("/");
}

function signSpacesRequest({ method, url, bodyHash, contentType, extraHeaders = {} }) {
  if (!DO_SPACES_ACCESS_KEY_ID || !DO_SPACES_SECRET_ACCESS_KEY) {
    throw new Error("Credenciais DO Spaces ausentes no runner");
  }
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const parsed = new URL(url);
  const headers = {
    "content-type": contentType,
    host: parsed.host,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), String(value)])),
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");
  const canonicalRequest = [
    method,
    parsed.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${DO_SPACES_REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const dateKey = crypto.createHmac("sha256", `AWS4${DO_SPACES_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
  const regionKey = crypto.createHmac("sha256", dateKey).update(DO_SPACES_REGION).digest();
  const serviceKey = crypto.createHmac("sha256", regionKey).update("s3").digest();
  const signingKey = crypto.createHmac("sha256", serviceKey).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host, ...requestHeaders } = headers;
  return {
    ...requestHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${DO_SPACES_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function uploadVideoToSpaces({ buffer, bucket, objectKey }) {
  return uploadBufferToSpaces({ buffer, bucket, objectKey, contentType: "video/mp4" });
}

async function uploadBufferToSpaces({ buffer, bucket, objectKey, contentType = "application/octet-stream" }) {
  const encodedKey = objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
  const url = `${DO_SPACES_ENDPOINT}/${encodeURIComponent(bucket)}/${encodedKey}`;
  const bodyHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const extraHeaders = { "x-amz-acl": "public-read" };
  const headers = signSpacesRequest({ method: "PUT", url, bodyHash, contentType, extraHeaders });
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: buffer,
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Falha no upload DO Spaces: ${response.status} ${details.slice(0, 300)}`);
  }
}

function contentTypeForMediaName(name, fallback = "application/octet-stream") {
  const extension = path.extname(String(name || "")).toLowerCase();
  return ({
    ".gif": "image/gif",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
  })[extension] || fallback;
}

function isImageMediaItem(item) {
  const mimeType = String(item?.mimeType || "");
  const name = String(item?.name || "");
  return /^image\//.test(mimeType) || /\.(gif|png|jpe?g|webp)$/i.test(name);
}

function buildSpacesImageObjectKey({ siteSigla, fields, raw, sourceName, contentHash = null }) {
  const periodoInicio = readStringRecord(raw, ["periodoInicio", "inicio"]) || todayInCuiaba();
  const month = periodoInicio.slice(0, 7);
  const extension = path.extname(String(sourceName || "")).toLowerCase() || ".bin";
  const filename = [
    slugifyPathPart(fields?.piCodigo || fields?.operationalIdentityKey || "operational"),
    slugifyPathPart(fields?.campaignName || "campanha"),
    slugifyPathPart(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "banner"),
    ...(contentHash ? [slugifyPathPart(String(contentHash).slice(0, 16))] : []),
  ].join("-") + extension;
  return [ADOPS_VIDEO_MEDIA_BASE_PATH, slugifyPathPart(siteSigla || "site"), month, filename].filter(Boolean).join("/");
}

function mediaPublicUrl(siteSigla, bucket, objectKey) {
  return `${spacesPublicBaseForSite(siteSigla, bucket)}/${objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

async function getSiteSiglaByIdMap() {
  const sites = await privateApiGet("/api/sites?limit=500").catch(() => []);
  const map = new Map();
  for (const site of Array.isArray(sites) ? sites : []) {
    if (site?.id && site?.sigla) map.set(Number(site.id), String(site.sigla).toUpperCase());
  }
  return map;
}

async function resolveDrivePiVideoMedia(fields, packageContext, payload) {
  const results = [];
  const issues = [];
  const insertions = Array.isArray(fields?.insertions) ? fields.insertions : [];
  if (!insertions.some((item) => isVideoInsertion(item) && !readStringRecord(item, ["mediaUrl", "media_url"]))) {
    return { fields, videoMediaProcessing: { skipped: true, results, issues } };
  }
  const siteSiglaById = await getSiteSiglaByIdMap();
  const resolvedInsertions = [];
  for (const raw of insertions) {
    if (!isVideoInsertion(raw) || readStringRecord(raw, ["mediaUrl", "media_url"])) {
      resolvedInsertions.push(raw);
      continue;
    }
    const observed = selectObservedMediaLink(packageContext, "video");
    const selected = observed.link ? { mediaItem: null, ambiguous: observed.ambiguous, candidates: observed.candidates } : selectDriveVideoForInsertion(packageContext, raw, fields);
    if (!observed.link && !selected.mediaItem?.driveFileId) {
      issues.push(`video_media_missing:${readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "video"}`);
      resolvedInsertions.push(raw);
      continue;
    }
    try {
      await updateDrivePiState(payload, "packaging", {
        parseRun: {
          fields: {
            piCodigo: fields.piCodigo,
            campaignName: fields.campaignName,
            video: { sourceName: observed.link?.sourceName || selected.mediaItem?.name, candidates: selected.candidates, ambiguous: selected.ambiguous },
          },
          alerts: ["Comprimindo video da PI no cod5-video-compressor antes de criar a insercao."],
        },
      });
      if (selected.ambiguous || observed.ambiguous) throw new Error("Mais de uma mídia de vídeo candidata; revisão obrigatória.");
      const archivedVideo = await materializeMediaSource({
        driveItem: selected.mediaItem,
        observedLink: observed.link,
        fallbackName: "video-source.mp4",
      });
      const compressed = await compressVideoWithCod5Api({
        inputPath: archivedVideo.filePath,
        sourceName: archivedVideo.sourceName,
        idempotencyKey: buildVideoCompressorIdempotencyKey(payload, selected.mediaItem || observed.link, raw, fields),
      });
      await updateDrivePiState(payload, "packaging", {
        parseRun: {
          fields: {
            piCodigo: fields.piCodigo,
            campaignName: fields.campaignName,
            compressorJobId: compressed.jobId,
          },
          alerts: ["Subindo video comprimido para DigitalOcean Spaces."],
        },
      });
      const siteId = readNumberRecord(raw, ["siteId"]);
      const siteSigla = siteSiglaById.get(Number(siteId)) || readStringRecord(raw, ["siteSigla"]) || "SITE";
      const bucket = spacesBucketForSite(siteSigla);
      const objectKey = buildSpacesVideoObjectKey({ siteSigla, fields, raw });
      await uploadVideoToSpaces({ buffer: compressed.buffer, bucket, objectKey });
      const publicUrl = `${spacesPublicBaseForSite(siteSigla, bucket)}/${objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
      results.push({
        siteId,
        siteSigla,
        localFormato: readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "VIDEO",
        sourceDriveFileId: selected.mediaItem?.driveFileId || observed.link?.driveFileId || null,
        sourceUrl: observed.link?.url || null,
        sourceName: archivedVideo.sourceName,
        compressorJobId: compressed.jobId,
        bucket,
        objectKey,
        mediaUrl: publicUrl,
        ambiguousSource: selected.ambiguous,
      });
      resolvedInsertions.push({
        ...raw,
        mediaUrl: publicUrl,
        mediaProcessingNote: `Video comprimido no Mac Mini e publicado no Spaces: ${objectKey}`,
      });
    } catch (error) {
      issues.push(`video_media_processing_failed:${error instanceof Error ? error.message : String(error)}`);
      resolvedInsertions.push(raw);
    }
  }
  return {
    fields: {
      ...fields,
      insertions: resolvedInsertions,
      videoMediaProcessing: { skipped: false, results, issues },
    },
    videoMediaProcessing: { skipped: false, results, issues },
  };
}

async function resolveDrivePiImageMedia(fields, packageContext, payload) {
  const results = [];
  const issues = [];
  const insertions = Array.isArray(fields?.insertions) ? fields.insertions : [];
  const unresolved = insertions.filter((item) => !isVideoInsertion(item) && !readStringRecord(item, ["mediaUrl", "media_url"]));
  if (!unresolved.length) return { fields, imageMediaProcessing: { skipped: true, results, issues } };
  const siteSiglaById = await getSiteSiglaByIdMap();
  const resolvedInsertions = [];
  for (const raw of insertions) {
    if (isVideoInsertion(raw) || readStringRecord(raw, ["mediaUrl", "media_url"])) {
      resolvedInsertions.push(raw);
      continue;
    }
    const observed = selectObservedMediaLink(packageContext, "image");
    const selected = observed.link ? { mediaItem: null, ambiguous: observed.ambiguous, candidates: observed.candidates } : selectDriveImageForInsertion(packageContext, raw, fields);
    if ((!observed.link && !selected.mediaItem?.driveFileId) || observed.ambiguous || selected.ambiguous) {
      issues.push(`${observed.ambiguous || selected.ambiguous ? "image_media_ambiguous" : "image_media_missing"}:${readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "banner"}`);
      resolvedInsertions.push(raw);
      continue;
    }
    try {
      const materialized = await materializeMediaSource({
        driveItem: selected.mediaItem,
        observedLink: observed.link,
        fallbackName: "banner.gif",
      });
      const siteId = readNumberRecord(raw, ["siteId"]);
      const siteSigla = siteSiglaById.get(Number(siteId)) || readStringRecord(raw, ["siteSigla"]) || "SITE";
      const bucket = spacesBucketForSite(siteSigla);
      const objectKey = buildSpacesImageObjectKey({ siteSigla, fields, raw, sourceName: materialized.sourceName });
      await uploadBufferToSpaces({
        buffer: materialized.buffer,
        bucket,
        objectKey,
        contentType: materialized.mimeType || contentTypeForMediaName(materialized.sourceName),
      });
      const stagedUrl = mediaPublicUrl(siteSigla, bucket, objectKey);
      let mediaUrl = stagedUrl;
      let wordpressImport = null;
      if (String(siteSigla).toUpperCase() === "PERRENGUE") {
        const mediaKey = crypto.createHash("sha256").update([
          fields.piCodigo,
          fields.campaignName,
          siteSigla,
          readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]),
          materialized.sha256,
        ].join(":" )).digest("hex");
        wordpressImport = await importPerrengueMediaFromUrl({ sourceUrl: stagedUrl, filename: materialized.sourceName, mediaKey });
        mediaUrl = wordpressImport.url;
      } else {
        const validation = await fetch(mediaUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(30000) });
        if (!validation.ok) throw new Error(`URL pública da mídia não respondeu 200: HTTP ${validation.status}`);
      }
      results.push({
        siteId,
        siteSigla,
        localFormato: readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]),
        sourceDriveFileId: selected.mediaItem?.driveFileId || observed.link?.driveFileId || null,
        sourceUrl: observed.link?.url || null,
        sourceName: materialized.sourceName,
        stagedUrl,
        mediaUrl,
        wordpressImport,
      });
      resolvedInsertions.push({
        ...raw,
        mediaUrl,
        mediaProcessingNote: `Mídia resolvida da pasta Drive e publicada em URL canônica: ${mediaUrl}`,
      });
    } catch (error) {
      issues.push(`image_media_processing_failed:${error instanceof Error ? error.message : String(error)}`);
      resolvedInsertions.push(raw);
    }
  }
  return {
    fields: { ...fields, insertions: resolvedInsertions, imageMediaProcessing: { skipped: false, results, issues } },
    imageMediaProcessing: { skipped: false, results, issues },
  };
}

async function ensureRuntimeDirs() {
  await mkdir(path.join(PROJECT_ROOT, "docs"), { recursive: true });
  await mkdir(DRIVE_PI_ARCHIVE_DIR, { recursive: true });
}

function readStringRecord(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readUrlRecord(source, keys) {
  const value = readStringRecord(source, keys);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function readNumberRecord(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function readAgentValue(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  for (const key of keys) {
    const field = source[key];
    if (field && typeof field === "object" && !Array.isArray(field) && "value" in field) {
      const value = field.value;
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (value && typeof value === "object") return value;
    }
    if (typeof field === "string" && field.trim()) return field.trim();
    if (typeof field === "number" && Number.isFinite(field)) return field;
  }
  return null;
}

function readAgentConfidence(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  for (const key of keys) {
    const field = source[key];
    if (field && typeof field === "object" && !Array.isArray(field)) {
      const confidence = Number(field.confidence);
      if (Number.isFinite(confidence)) return confidence;
    }
  }
  return null;
}

function readAgentSource(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  for (const key of keys) {
    const field = source[key];
    if (field && typeof field === "object" && !Array.isArray(field) && typeof field.source === "string" && field.source.trim()) {
      return field.source.trim().slice(0, 240);
    }
  }
  return null;
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? String(match[1] || "").trim() : null;
}

function extractFlattenedClientVehicle(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    if ((line.match(/\bVE[IÍ]CULO\b/gi) || []).length !== 1) continue;
    const match = line.trim().match(
      /^CLIENTE\s*:?\s+(.+?)\s+VE[IÍ]CULO\s*:?\s+((?:SITE|PORTAL)\b.+)$/i,
    );
    const vehicleName = String(match?.[2] || "").trim();
    if (match && observedCanonicalSiteAliases(vehicleName).length === 1) {
      return {
        clientName: String(match[1] || "").trim() || null,
        vehicleName,
      };
    }
  }
  return null;
}

function extractPdfCommercialLabels(text) {
  const source = String(text || "");
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const flattenedLabels = extractFlattenedClientVehicle(source);
  const clientName = flattenedLabels?.clientName || firstMatch(source, /^CLIENTE\s*:?\s*(.+)$/im);
  const firstEntityBoundary = lines.findIndex((line) => /^(?:VE[IÍ]CULO|CLIENTE|RAZÃO SOCIAL|CNPJ)\b/i.test(line));
  const preamble = lines.slice(0, firstEntityBoundary < 0 ? lines.length : firstEntityBoundary);
  const agencyCandidates = preamble.filter((line) => (
    !/^(?:CLIENTE|RAZÃO SOCIAL|VE[IÍ]CULO|CAMPANHA|PRODUTO|CNPJ)\b/i.test(line)
    && /\b(?:ZIMMERMANN|DMD|SPM COMUNICAÇÃO|SPM COMUNICACAO|RENCA|GENIUS)\b/i.test(line)
  ));
  const agencyIdentities = new Set(agencyCandidates.map((line) => (
    agencyAliasCandidates(line)[0] || normalizeText(line)
  )));
  const legacyLegalName = clientName ? null : firstMatch(source, /^RAZÃO SOCIAL\s*:?\s*(.+)$/im);
  const legacyCnpj = clientName ? null : firstMatch(source, /^CNPJ\s*:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/im);
  return {
    clientName,
    clientLegalName: legacyLegalName,
    clientCnpj: legacyCnpj,
    agencyName: agencyIdentities.size === 1 ? agencyCandidates[0] : null,
  };
}

function monthNameToNumber(value) {
  const normalized = normalizeText(value).replace(/[^a-z]/g, "");
  const months = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };
  return months[normalized] || null;
}

function parseCurrencyPtBr(value) {
  if (!value) return null;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parsePdfBboxWords(bboxText) {
  const words = [];
  const source = String(bboxText || "");
  const pattern = /<word\s+xMin="([^"]+)"\s+yMin="([^"]+)"\s+xMax="([^"]+)"\s+yMax="([^"]+)">([\s\S]*?)<\/word>/g;
  for (const match of source.matchAll(pattern)) {
    const xMin = Number(match[1]);
    const yMin = Number(match[2]);
    const xMax = Number(match[3]);
    const yMax = Number(match[4]);
    if (![xMin, yMin, xMax, yMax].every(Number.isFinite)) continue;
    words.push({
      text: decodeXmlText(match[5]).trim(),
      xMin,
      yMin,
      xMax,
      yMax,
      xCenter: (xMin + xMax) / 2,
      yCenter: (yMin + yMax) / 2,
    });
  }
  return words;
}

function groupWordsByLine(words, tolerance = 2) {
  const lines = [];
  for (const word of [...words].sort((a, b) => a.yCenter - b.yCenter || a.xCenter - b.xCenter)) {
    const line = lines.find((item) => Math.abs(item.yCenter - word.yCenter) <= tolerance);
    if (line) {
      line.words.push(word);
      line.yCenter = (line.yCenter * (line.words.length - 1) + word.yCenter) / line.words.length;
    } else {
      lines.push({ yCenter: word.yCenter, words: [word] });
    }
  }
  return lines.map((line) => ({
    ...line,
    words: line.words.sort((a, b) => a.xCenter - b.xCenter),
  }));
}

function parsePeriodoFromBboxText(bboxText, competencia) {
  const words = parsePdfBboxWords(bboxText);
  if (!words.length) return {};

  const year = firstMatch(competencia, /(\d{4})/) || String(new Date().getFullYear());
  const month = monthNameToNumber(firstMatch(competencia, /([A-ZÇÃÉÍÓÚ]+)\/\d{4}/i) || "");
  if (!month) return {};

  const lines = groupWordsByLine(words);
  const headerLines = lines.filter((line) => {
    const values = line.words.map((word) => word.text);
    const days = values.filter((text) => /^\d{1,2}$/.test(text)).map((text) => Number(text));
    return days.includes(1) && days.includes(15) && days.includes(31);
  });
  if (headerLines.length !== 1) return {};
  const headerLine = headerLines[0];

  const dayWords = headerLine.words
    .filter((word) => /^\d{1,2}$/.test(word.text))
    .map((word) => ({ ...word, day: Number(word.text) }))
    .filter((word) => word.day >= 1 && word.day <= 31)
    .sort((a, b) => a.day - b.day);
  const uniqueHeaderDays = new Set(dayWords.map((word) => word.day));
  if (dayWords.length < 28 || dayWords.length > 31 || uniqueHeaderDays.size !== dayWords.length) return {};

  const minDayX = Math.min(...dayWords.map((word) => word.xCenter));
  const maxDayX = Math.max(...dayWords.map((word) => word.xCenter));
  const candidateRows = lines
    .filter((line) => line.yCenter > headerLine.yCenter + 15 && line.yCenter < headerLine.yCenter + 80)
    .map((line) => {
      const rowText = line.words.map((word) => word.text).join(" ");
      const markers = line.words.filter((word) =>
        word.text === "1" &&
        word.xCenter >= minDayX - 6 &&
        word.xCenter <= maxDayX + 6
      );
      return { line, markers, formatMatch: /\bMEGABANNER\s+TOPO\b/i.test(rowText) };
    })
    .filter((row) => row.formatMatch && row.markers.length > 0);

  if (candidateRows.length !== 1) return {};
  const row = candidateRows[0];

  const usedDays = [];
  for (const marker of row.markers) {
    const nearest = dayWords.reduce((best, current) => {
      const distance = Math.abs(current.xCenter - marker.xCenter);
      return !best || distance < best.distance ? { ...current, distance } : best;
    }, null);
    if (nearest && nearest.distance <= 7) usedDays.push(nearest.day);
  }

  const uniqueDays = Array.from(new Set(usedDays)).sort((a, b) => a - b);
  if (!uniqueDays.length) return {};
  const startDay = String(uniqueDays[0]).padStart(2, "0");
  const endDay = String(uniqueDays[uniqueDays.length - 1]).padStart(2, "0");
  return {
    periodoInicio: `${year}-${month}-${startDay}`,
    periodoFim: `${year}-${month}-${endDay}`,
    periodoOriginal: `${startDay}/${month} - ${endDay}/${month}`,
  };
}

function parsePeriodoFromLayoutText(layoutText, competencia) {
  const explicit = String(layoutText || "").match(/(\d{1,2})\/(\d{1,2})\s*(?:-|a|até)\s*(\d{1,2})\/(\d{1,2})/i);
  const year = firstMatch(competencia, /(\d{4})/) || String(new Date().getFullYear());
  if (explicit) {
    const startDay = explicit[1].padStart(2, "0");
    const startMonth = explicit[2].padStart(2, "0");
    const endDay = explicit[3].padStart(2, "0");
    const endMonth = explicit[4].padStart(2, "0");
    return {
      periodoInicio: `${year}-${startMonth}-${startDay}`,
      periodoFim: `${year}-${endMonth}-${endDay}`,
      periodoOriginal: `${startDay}/${startMonth} - ${endDay}/${endMonth}`,
    };
  }

  const month = monthNameToNumber(firstMatch(competencia, /([A-ZÇÃÉÍÓÚ]+)\/\d{4}/i) || "");
  if (!month) return {};
  const lines = String(layoutText || "").split(/\r?\n/);
  const headerIndexes = lines.map((line, index) => ({ line, index })).filter(({ line }) => {
    const days = Array.from(line.matchAll(/\b(\d{1,2})\b/g)).map((match) => Number(match[1]));
    const uniqueDays = new Set(days);
    return days.includes(1) && days.includes(15) && days.includes(31)
      && days.length >= 28 && days.length <= 31 && uniqueDays.size === days.length;
  }).map(({ index }) => index);
  if (headerIndexes.length !== 1) return {};
  const headerIndex = headerIndexes[0];
  const header = lines[headerIndex];
  const insertionLines = headerIndex >= 0
    ? lines.slice(headerIndex + 1, headerIndex + 7)
      .filter((line) => (line.match(/\bMEGABANNER\s+TOPO\b/gi) || []).length === 1 && (line.match(/\b1\b/g) || []).length > 0)
    : [];
  if (!header || insertionLines.length !== 1) return {};
  const insertionLine = insertionLines[0];

  const dayColumns = [];
  for (const match of header.matchAll(/\b(\d{1,2})\b/g)) {
    const day = Number(match[1]);
    if (day >= 1 && day <= 31) dayColumns.push({ day, index: match.index || 0 });
  }
  const usedDays = [];
  for (const match of insertionLine.matchAll(/\b1\b/g)) {
    const oneIndex = match.index || 0;
    const nearest = dayColumns.reduce((best, current) => {
      const distance = Math.abs(current.index - oneIndex);
      return !best || distance < best.distance ? { ...current, distance } : best;
    }, null);
    if (nearest && nearest.distance <= 4) usedDays.push(nearest.day);
  }
  const uniqueDays = Array.from(new Set(usedDays)).sort((a, b) => a - b);
  if (!uniqueDays.length) return {};
  const startDay = String(uniqueDays[0]).padStart(2, "0");
  const endDay = String(uniqueDays[uniqueDays.length - 1]).padStart(2, "0");
  return {
    periodoInicio: `${year}-${month}-${startDay}`,
    periodoFim: `${year}-${month}-${endDay}`,
    periodoOriginal: `${startDay}/${month} - ${endDay}/${month}`,
  };
}

async function extractTextFromArchivedPdf(archived) {
  if (!archived?.filePath || !/\.pdf$/i.test(archived.filePath)) return null;
  try {
    const [plain, layout, bbox] = await Promise.all([
      execFileAsync("pdftotext", [archived.filePath, "-"], { maxBuffer: 1024 * 1024 * 8 }),
      execFileAsync("pdftotext", ["-layout", archived.filePath, "-"], { maxBuffer: 1024 * 1024 * 8 }),
      execFileAsync("pdftotext", ["-bbox", archived.filePath, "-"], { maxBuffer: 1024 * 1024 * 8 }),
    ]);
    return {
      plain: String(plain.stdout || ""),
      layout: String(layout.stdout || ""),
      bbox: String(bbox.stdout || ""),
    };
  } catch (error) {
    return {
      plain: "",
      layout: "",
      bbox: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveDrivePiEntityIds(parsedFromPdf) {
  const [clients, agencies, sites] = await Promise.all([
    privateApiGet("/api/clients"),
    privateApiGet("/api/agencies"),
    privateApiGet("/api/sites"),
  ]);

  const clientText = normalizeText(`${parsedFromPdf.clientName || ""} ${parsedFromPdf.clientLegalName || ""} ${parsedFromPdf.clientCnpj || ""}`);
  const agencyText = normalizeText(parsedFromPdf.agencyName || "");
  const vehicleText = normalizeText(parsedFromPdf.vehicleName || "");
  const vehicleAlias = normalizeSiteAlias(parsedFromPdf.vehicleName);
  const clientAliases = clientAliasCandidates(`${parsedFromPdf.clientName || ""} ${parsedFromPdf.clientLegalName || ""}`);
  const agencyAliases = agencyAliasCandidates(parsedFromPdf.agencyName || "");

  const client = Array.isArray(clients)
    ? clients.find((item) => normalizeText(item?.cnpj) && normalizeText(item.cnpj) === normalizeText(parsedFromPdf.clientCnpj))
      || clients.find((item) => clientAliases.some((alias) => normalizeText(item?.nome) === normalizeText(alias)))
      || clients.find((item) => {
        const name = normalizeText(item?.nome);
        return clientText && name && (clientText.includes(name) || name.includes(clientText.split(" ")[0] || ""));
      })
    : null;
  const agency = Array.isArray(agencies)
    ? agencies.find((item) => agencyAliases.some((alias) => normalizeText(item?.nome) === normalizeText(alias)))
      || agencies.find((item) => {
        const name = normalizeText(item?.nome);
        return agencyText && name && (agencyText.includes(name) || name.includes(agencyText));
      })
      || agencies.find((item) => normalizeText(item?.nome) === "dmd" && /dmd/.test(agencyText))
    : null;
  const site = Array.isArray(sites)
    ? sites.find((item) => vehicleAlias && String(item?.sigla || "").toUpperCase() === vehicleAlias)
      || sites.find((item) => {
        const sigla = normalizeText(item?.sigla);
        const nome = normalizeText(item?.nome);
        return (sigla && vehicleText.includes(sigla)) || (nome && vehicleText.includes(nome)) || (item?.sigla === "ROO" && /roo/.test(vehicleText));
      })
    : null;

  return {
    clienteId: client?.id ? Number(client.id) : null,
    agenciaId: agency?.id ? Number(agency.id) : null,
    siteId: site?.id ? Number(site.id) : null,
  };
}

function extractPdfCompetencia(text) {
  return firstMatch(text, /(?:PERÍODO|COLOCAÇÃO|VEICULAÇÃO)\s*:?\s*([A-ZÇÃÉÍÓÚ]+\/\d{4})/i);
}

function extractPdfVehicleName(text) {
  return firstMatch(text, /(?:^|\n)\s*VE[IÍ]CULO\s*:\s*([^\n]+)/i)
    || extractFlattenedClientVehicle(text)?.vehicleName
    || null;
}

function buildDrivePiPdfInsertions({ siteId, localFormato, periodo, clickUrl }) {
  if (!siteId || !localFormato || !periodo?.periodoInicio || !periodo?.periodoFim) return [];
  return [{
    siteId,
    localFormato: localFormato.replace(/\s*-\s*[0-9 Xx]+$/, "").trim(),
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: periodo.periodoInicio,
    periodoFim: periodo.periodoFim,
    periodoOriginal: periodo.periodoOriginal,
    clickUrl,
  }];
}

async function parseDrivePiPdfFields(archived) {
  const extracted = await extractTextFromArchivedPdf(archived);
  if (!extracted) return {};
  const text = extracted.plain || "";
  const layout = extracted.layout || text;
  const explicitPiCandidates = extractExplicitPisFromPdfText(text);
  const piNumber = explicitPiCandidates[0] || null;
  const competencia = extractPdfCompetencia(text) || extractPdfCompetencia(layout);
  const campaignName = firstMatch(text, /CAMPANHA:\s*([^\n]+)/i);
  const localFormato = firstMatch(text, /(MEGABANNER TOPO\s*-\s*[0-9 Xx]+)/i) || firstMatch(text, /(MEGABANNER TOPO)/i);
  const bboxPeriodo = parsePeriodoFromBboxText(extracted.bbox, competencia);
  const commercialLabels = extractPdfCommercialLabels(text);
  const parsed = {
    piCodigo: piNumber ? `PI ${piNumber}` : null,
    campaignName,
    competencia,
    clientName: commercialLabels.clientName,
    clientLegalName: commercialLabels.clientLegalName,
    clientCnpj: commercialLabels.clientCnpj,
    agencyName: commercialLabels.agencyName,
    vehicleName: extractPdfVehicleName(text),
    valorLiquido: parseCurrencyPtBr(firstMatch(text, /LIQUIDO R\$\s+([\d.,]+)/i)),
    clickUrl: firstMatch(text, /(https:\/\/[^\s)]+)/i),
    periodo: bboxPeriodo.periodoInicio ? bboxPeriodo : parsePeriodoFromLayoutText(layout, competencia),
    rawTextExcerpt: text.slice(0, 1200),
    parseError: extracted.error || null,
    explicitPiCandidates,
  };
  const ids = await resolveDrivePiEntityIds(parsed);
  return {
    piCodigo: parsed.piCodigo,
    campaignName: parsed.campaignName,
    competencia: parsed.competencia,
    clienteId: ids.clienteId,
    agenciaId: ids.agenciaId,
    valorLiquido: parsed.valorLiquido,
    clickUrl: parsed.clickUrl,
    rawTextExcerpt: parsed.rawTextExcerpt,
    parseError: parsed.parseError,
    explicitPiCandidates: parsed.explicitPiCandidates,
    insertions: buildDrivePiPdfInsertions({
      siteId: ids.siteId,
      localFormato,
      periodo: parsed.periodo,
      clickUrl: parsed.clickUrl,
    }),
  };
}

function extractExplicitPiFromPdfText(text) {
  return extractExplicitPisFromPdfText(text)[0] || null;
}

function extractExplicitPisFromPdfText(text) {
  const values = [];
  const pattern = /\bPI(?:\s+PEDIDO\s+DE\s+INSERÇÃO)?\s*(?:(?:N[ÚU]MERO|N\s*[º°o.]?)\s*)?[:#-]?\s*(\d{3,})\b/gi;
  for (const match of String(text || "").matchAll(pattern)) {
    const normalized = normalizeExpectedPiIdentity(match[1]);
    if (normalized && !values.includes(normalized)) values.push(normalized);
  }
  return values;
}

function mergeFieldValue(primary, fallback) {
  return primary ?? fallback ?? null;
}

function parseIsoDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function inferCompetenciaFromInsertionPeriod(insertions) {
  if (!Array.isArray(insertions) || !insertions.length) return null;
  const inferred = [];
  for (const insertion of insertions) {
    const inicio = parseIsoDateOnly(readStringRecord(insertion, ["periodoInicio", "inicio"]));
    const fim = parseIsoDateOnly(readStringRecord(insertion, ["periodoFim", "fim"]));
    if (!inicio || !fim) continue;
    if (inicio.year !== fim.year || inicio.month !== fim.month) continue;
    inferred.push(`${String(inicio.month).padStart(2, "0")}/${inicio.year}`);
  }
  const unique = Array.from(new Set(inferred));
  return unique.length === 1 ? unique[0] : null;
}

function buildDrivePiTextHints(payload, archived, packageContext) {
  const primaryArchive = packageContext?.primaryArchive || archived || null;
  const mediaNames = Array.isArray(packageContext?.media)
    ? packageContext.media.map((item) => `${item?.name || ""} ${item?.path || ""}`).filter(Boolean)
    : [];
  const itemNames = Array.isArray(packageContext?.items)
    ? packageContext.items.map((item) => `${item?.name || ""} ${item?.path || ""}`).filter(Boolean)
    : [];
  return [
    payload?.name,
    payload?.path,
    primaryArchive?.sourceName,
    primaryArchive?.filePath,
    packageContext?.pdf?.sourceName,
    packageContext?.folder?.name,
    packageContext?.folder?.path,
    ...mediaNames,
    ...itemNames,
  ].filter(Boolean).join(" ");
}

function buildDrivePiFolderIdentityText(payload, packageContext) {
  const folder = packageContext?.folder;
  if (folder?.path) return String(folder.path);
  if (folder?.name) return String(folder.name);
  if (String(payload?.mimeType || "") === "application/vnd.google-apps.folder") {
    return String(payload?.path || payload?.name || "");
  }
  const payloadPath = String(payload?.path || "").trim();
  if (!payloadPath || !payload?.parentFolderId) return "";
  const folderPath = path.posix.dirname(payloadPath);
  return folderPath;
}

async function resolveDrivePiPackageFolder(payload) {
  if (!payload?.driveFileId) return null;
  const mimeType = String(payload.mimeType || "");
  const isExplicitFolder = payload?.explicitFolder === true || payload?.preflightOnly === true;
  if (mimeType === "application/vnd.google-apps.folder" && (isExplicitFolder || /\bPI[\s_-]*\d{3,}\b/i.test(String(payload.name || payload.path || "")))) {
    return {
      folderId: payload.driveFileId,
      path: payload.path || `/${payload.name}`,
      name: payload.name || payload.path || payload.driveFileId,
    };
  }
  if (payload.parentFolderId) {
    return {
      folderId: payload.parentFolderId,
      path: String(payload.path || "").split("/").slice(0, -1).join("/") || null,
      name: String(payload.path || "").split("/").filter(Boolean).slice(-2, -1)[0] || payload.parentFolderId,
    };
  }
  return null;
}

async function listDrivePiPackageItems(folderId, basePath = "") {
  if (!folderId) return [];
  let payload = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      payload = await googleDriveRequest("files", {
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents,size,md5Checksum)",
        pageSize: 1000,
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        orderBy: "folder,name",
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(750 * (attempt + 1));
    }
  }
  if (!payload) throw lastError || new Error("Falha ao listar pasta da PI no Google Drive.");
  return (payload.files || []).map((file) => ({
    driveFileId: file.id,
    name: file.name || file.id,
    mimeType: file.mimeType || "application/octet-stream",
    path: `${basePath || ""}/${file.name || file.id}`.replace(/\/+/g, "/"),
    parentFolderId: folderId,
    modifiedTime: file.modifiedTime || null,
    webViewLink: file.webViewLink || null,
    size: file.size || null,
    md5Checksum: file.md5Checksum || null,
  }));
}

async function downloadDriveFileToArchive(file) {
  if (!file?.driveFileId || String(file.mimeType || "").includes("folder")) {
    return null;
  }
  if (Number(file.size || 0) > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Arquivo do Drive excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const isGoogleDocument = file.mimeType === "application/vnd.google-apps.document";
  const downloadUrl = isGoogleDocument
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}/export?mimeType=${encodeURIComponent("text/plain")}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}?alt=media`;
  let response = null;
  let lastError = null;
  for (let attempt = 1; attempt <= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS; attempt += 1) {
    let retryAfterMs = 0;
    try {
      const accessToken = await getGoogleDriveAccessToken();
      response = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(ADOPS_DRIVE_REQUEST_TIMEOUT_MS),
      });
      if (response.ok) break;
      const payload = await response.json().catch(() => null);
      const failure = classifyGoogleDriveDownloadFailure(response.status, payload);
      const error = new Error(`Falha ao baixar ${safeFileName(file.name || file.driveFileId)} do Drive: ${response.status} ${failure.reason}`);
      error.retryable = failure.retryable;
      if (!failure.retryable) throw error;
      lastError = error;
      const retryAfterSeconds = Number.parseFloat(response.headers.get("retry-after") || "0");
      retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.retryable === false) throw lastError;
      if (attempt >= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS) throw lastError;
    }
    if (attempt >= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS) break;
    const exponentialMs = ADOPS_DRIVE_RETRY_BASE_MS * (2 ** (attempt - 1));
    const delayMs = Math.min(ADOPS_DRIVE_RETRY_MAX_MS, Math.max(retryAfterMs, exponentialMs));
    console.warn(`[runner] Download Google Drive temporariamente indisponível; retry ${attempt}/${ADOPS_DRIVE_RETRY_MAX_ATTEMPTS} em ${delayMs}ms`);
    await sleep(delayMs);
  }
  if (!response?.ok) throw lastError || new Error("Download Google Drive indisponível após retries.");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Arquivo do Drive excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Arquivo do Drive excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const dir = path.join(DRIVE_PI_ARCHIVE_DIR, new Date().toISOString().slice(0, 10));
  await mkdir(dir, { recursive: true });
  const archiveName = isGoogleDocument && !/\.txt$/i.test(String(file.name || "")) ? `${file.name || file.driveFileId}.txt` : file.name;
  const filePath = path.join(dir, `${sha256.slice(0, 12)}-${safeFileName(archiveName)}`);
  await writeFile(filePath, bytes);
  return { filePath, sha256, md5: crypto.createHash("md5").update(bytes).digest("hex"), bytes: bytes.length, sourceDriveFileId: file.driveFileId, sourceName: file.name };
}

function classifyGoogleDriveDownloadFailure(status, payload) {
  const reason = String(payload?.error?.errors?.[0]?.reason || payload?.error?.message || `HTTP ${status}`).slice(0, 240);
  const quotaLimited = Number(status) === 403 && /quota|rate.?limit|userratelimitexceeded|downloadquotaexceeded/i.test(reason);
  return {
    reason,
    retryable: Number(status) === 429 || Number(status) >= 500 || quotaLimited,
  };
}

function trimUrlPunctuation(value) {
  return String(value || "").replace(/[),.;:'\"]+$/g, "");
}

function extractUrlsFromText(text) {
  return Array.from(new Set((String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || []).map(trimUrlPunctuation)));
}

function resolveOperationalDestination(observations) {
  return resolveOptionalOperationalDestination(observations).url;
}

function resolveOptionalOperationalDestination(observations) {
  const items = Array.isArray(observations) ? observations : [];
  if (items.length === 0) return { mode: "none", url: null, statusText: "Banner informativo, sem link" };
  if (items.some((item) => item?.error)) throw new Error("O link fornecido precisa ser corrigido: o documento não pôde ser lido.");
  const urls = Array.from(new Set(items.flatMap((item) => extractUrlsFromText(item?.text))));
  if (urls.length > 1) throw new Error("Foram encontrados links diferentes; informe somente um destino.");
  if (urls.length === 0) throw new Error("O link fornecido precisa ser corrigido: o documento não contém um endereço válido.");
  let parsed;
  try {
    parsed = new URL(urls[0]);
  } catch {
    throw new Error("O link fornecido precisa ser corrigido.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || isReservedDestinationHost(parsed.hostname) || /(^|\.)(?:drive|docs)\.google\.com$/i.test(parsed.hostname)) {
    throw new Error("O link fornecido precisa ser corrigido: use um único endereço HTTPS público.");
  }
  return { mode: "https", url: urls[0], statusText: "Link válido encontrado" };
}

function isReservedDestinationHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (!net.isIP(host)) return false;
  if (host === "::1" || host === "::" || /^fe[89ab]/i.test(host) || /^fc|^fd/i.test(host)) return true;
  if (host.startsWith("::ffff:")) return isReservedDestinationHost(host.slice(7));
  const octets = host.split(".").map(Number);
  if (octets.length !== 4) return false;
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19));
}

async function assertPublicOperationalDestination(value) {
  const parsed = new URL(value);
  const addresses = await dnsLookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isReservedDestinationHost(item.address))) {
    throw new Error("Destino HTTPS não resolve exclusivamente para endereços públicos.");
  }
  return value;
}

function normalizeOperationalValue(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function validateOperationalPublicationScope({ campaignId, insertionId, siteSigla, identityMode }) {
  if (!readPositiveInteger(campaignId) || !readPositiveInteger(insertionId)) {
    throw new Error("Preflight operacional sem campanha ou inserção canônica.");
  }
  const normalizedSite = normalizeOperationalValue(siteSigla);
  const supported = identityMode === "sheet_drive_composite"
    ? new Set(["PERRENGUE", "ROO", "AFL"]).has(normalizedSite)
    : normalizedSite === "PERRENGUE";
  if (!supported) {
    throw new Error("Identidade operacional sem PDF recusada: portal ainda não suportado pelo publicador seguro.");
  }
  return true;
}

function validateOperationalPublicationContract(payload, { insertion, campaign, site }) {
  const campaignId = readPositiveInteger(insertion?.campanhaId ?? insertion?.campaignId);
  const checks = [
    [Number(insertion?.id) === Number(payload?.expectedInsertionId), "inserção"],
    [campaignId === Number(payload?.expectedCampaignId) && Number(campaign?.id) === Number(payload?.expectedCampaignId), "campanha"],
    [normalizeOperationalValue(site?.sigla) === normalizeOperationalValue(payload?.expectedSiteSigla), "portal"],
    [normalizeOperationalValue(insertion?.localFormatoNormalizado ?? insertion?.localFormato) === normalizeOperationalValue(payload?.expectedFormat), "formato"],
    [String(insertion?.periodoInicio || "") === String(payload?.expectedPeriodStart || ""), "início"],
    [String(insertion?.periodoFim || "") === String(payload?.expectedPeriodEnd || ""), "fim"],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`Preflight operacional divergiu em ${failed[1]}; nenhuma mutação foi aplicada.`);
  const commercialPis = [campaign?.piCodigo, insertion?.piCodigo].filter((value) => String(value || "").trim());
  const commercialPi = firstNonEmptyString(...commercialPis);
  if (payload?.identityMode === "sheet_drive_composite") {
    const expectedPiCodigo = normalizeExpectedPiIdentity(payload?.expectedPiCodigo);
    if (!expectedPiCodigo) throw new Error("Identidade composta sem PI canônica esperada.");
    for (const value of commercialPis) {
      if (normalizeExpectedPiIdentity(value) !== expectedPiCodigo) {
        throw new Error("PI da campanha ou inserção diverge da identidade composta; nenhuma mutação foi aplicada.");
      }
    }
    return { ok: true, preserveCommercialPi: commercialPi, expectedPiCodigo };
  }
  if (commercialPis.some((value) => /\d{3,}/.test(String(value)))) {
    throw new Error("Identidade operacional não pode publicar com PI numérica ainda não confirmada por PDF.");
  }
  return { ok: true, preserveCommercialPi: commercialPi };
}

function validateCompositePdfEvidence({ expectedPiCodigo, expectedDocument, archive, parsedPdf }) {
  const expectedPi = normalizeExpectedPiIdentity(expectedPiCodigo);
  const expectedSize = Number(expectedDocument?.size || 0);
  const expectedMd5 = String(expectedDocument?.md5Checksum || "").trim().toLowerCase();
  if (!expectedPi || expectedSize <= 0 || !/^[a-f0-9]{32}$/.test(expectedMd5)) {
    throw new Error("Identidade composta exige checksum e tamanho autoritativos do PDF.");
  }
  if (!archive || Number(archive.bytes || 0) !== expectedSize || String(archive.md5 || "").trim().toLowerCase() !== expectedMd5) {
    throw new Error("PDF baixado diverge do checksum ou tamanho do snapshot aprovado.");
  }
  if (parsedPdf?.parseError) throw new Error("O PDF não pôde ser lido com segurança; nenhuma mutação foi aplicada.");
  const explicitPis = Array.from(new Set([
    ...(Array.isArray(parsedPdf?.explicitPiCandidates) ? parsedPdf.explicitPiCandidates : []),
    parsedPdf?.piCodigo,
  ].map(normalizeExpectedPiIdentity).filter(Boolean)));
  if (explicitPis.some((value) => value !== expectedPi) || explicitPis.length > 1) {
    throw new Error("O PDF contém PI explícita divergente ou ambígua para a identidade composta.");
  }
  return true;
}

function validateCompositePendingGuard(liveItem, guard) {
  if (!liveItem || liveItem?.identityMode !== guard?.identityMode || liveItem?.publicationStatus !== "ready_for_publication") {
    throw new Error("Identidade composta não está mais liberada para publicação.");
  }
  if (String(liveItem?.operationalIdentity?.fingerprint || "") !== String(guard?.fingerprint || "")) {
    throw new Error("Fingerprint operacional mudou; nenhuma mutação foi aplicada.");
  }
  const expectedPi = normalizeExpectedPiIdentity(guard?.expectedPiCodigo);
  const currentPi = normalizeExpectedPiIdentity(liveItem?.sourceIdentity?.canonicalPi);
  if (guard?.identityMode === "sheet_drive_composite" && (!expectedPi || currentPi !== expectedPi)) {
    throw new Error("PI canônica da identidade composta mudou; nenhuma mutação foi aplicada.");
  }
  return true;
}

function validateAdrotatePublicationGuard(guard, { insertion, campaign, site }) {
  const checks = [
    [Number(insertion?.id) === Number(guard?.expectedInsertionId), "inserção"],
    [Number(insertion?.campanhaId ?? insertion?.campaignId) === Number(guard?.expectedCampaignId) && Number(campaign?.id) === Number(guard?.expectedCampaignId), "campanha"],
    [normalizeOperationalValue(site?.sigla) === normalizeOperationalValue(guard?.expectedSiteSigla), "portal"],
    [normalizeOperationalValue(insertion?.localFormatoNormalizado ?? insertion?.localFormato) === normalizeOperationalValue(guard?.expectedFormat), "formato"],
    [String(insertion?.periodoInicio || "") === String(guard?.expectedPeriodStart || ""), "início"],
    [String(insertion?.periodoFim || "") === String(guard?.expectedPeriodEnd || ""), "fim"],
    [String(insertion?.mediaUrl || "") === String(guard?.expectedMediaUrl || ""), "mídia"],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`Guard de publicação divergiu em ${failed[1]}; nenhuma mutação AdRotate foi aplicada.`);
  const expectedPi = normalizeExpectedPiIdentity(guard?.expectedPiCodigo);
  if (expectedPi) {
    for (const [label, value] of [["campanha", campaign?.piCodigo], ["inserção", insertion?.piCodigo]]) {
      const currentPi = normalizeExpectedPiIdentity(value);
      if (currentPi && currentPi !== expectedPi) throw new Error(`Guard de publicação divergiu na PI da ${label}.`);
    }
  }
  return true;
}

function validateOperationalDriveItem(expected, actual, label) {
  const expectedId = firstNonEmptyString(expected?.id, expected?.driveFileId);
  const actualId = firstNonEmptyString(actual?.id, actual?.driveFileId);
  if (!expectedId || expectedId !== actualId) throw new Error(`${label} operacional não corresponde mais ao ID aprovado.`);
  for (const key of ["name", "mimeType", "modifiedTime", "size", "md5Checksum"]) {
    const expectedValue = expected?.[key] == null ? null : String(expected[key]).trim();
    const actualValue = actual?.[key] == null ? null : String(actual[key]).trim();
    if (expectedValue && expectedValue !== actualValue) throw new Error(`${label} operacional mudou em ${key}; nenhuma mutação foi aplicada.`);
  }
  return true;
}

async function readOperationalImageMetadata(filePath) {
  const script = `
import json, sys
from PIL import Image
p=sys.argv[1]
with Image.open(p) as im:
    im.verify()
with Image.open(p) as im:
    frames=getattr(im, "n_frames", 1)
    durations=[]
    for frame_index in range(frames):
        im.seek(frame_index)
        durations.append(im.info.get("duration", 0))
    im.seek(0)
    rgb=im.convert("RGB")
    extrema=rgb.getextrema()
    non_uniform=any(lo != hi for lo, hi in extrema)
    print(json.dumps({"format": im.format, "width": im.width, "height": im.height, "frames": frames, "durations": durations, "loop": im.info.get("loop", 0), "nonUniform": non_uniform}))
`;
  const { stdout } = await execFileAsync("python3", ["-c", script, filePath], { timeout: 30000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}

async function inspectOperationalImage(filePath, expected) {
  const metadata = await readOperationalImageMetadata(filePath);
  if (String(metadata.format || "").toUpperCase() !== String(expected?.format || "").toUpperCase()) throw new Error("Formato binário da mídia diverge do esperado.");
  if (Number(metadata.width) !== Number(expected?.width) || Number(metadata.height) !== Number(expected?.height)) throw new Error("Dimensões binárias da mídia divergem do formato contratado.");
  if (!metadata.nonUniform) throw new Error("Mídia operacional possui conteúdo uniforme e não pode ser publicada.");
  return metadata;
}

async function prepareOperationalDeliveryImage(filePath, profile) {
  const source = await readOperationalImageMetadata(filePath);
  const expectedFormat = String(profile?.formats?.[0] || "GIF").toUpperCase();
  if (String(source.format || "").toUpperCase() !== expectedFormat) throw new Error("Formato binário da mídia diverge do esperado.");
  if (!source.nonUniform) throw new Error("Mídia operacional possui conteúdo uniforme e não pode ser publicada.");
  if (Number(source.width) === Number(profile?.width) && Number(source.height) === Number(profile?.height)) {
    return { transformed: false, source, metadata: source, filePath, transform: null };
  }

  const transform = profile?.deliveryTransform;
  const exactTransform = transform?.mode === "pad-horizontal"
    && Number(transform.sourceWidth) === Number(source.width)
    && Number(transform.sourceHeight) === Number(source.height)
    && Number(transform.targetWidth) === Number(profile?.width)
    && Number(transform.targetHeight) === Number(profile?.height)
    && Number(transform.targetWidth) > Number(transform.sourceWidth)
    && Number(transform.targetHeight) === Number(transform.sourceHeight);
  if (!exactTransform) throw new Error("Dimensões binárias da mídia divergem do formato contratado.");

  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}-${transform.targetWidth}x${transform.targetHeight}-delivery.gif`,
  );
  const script = `
import sys
from PIL import Image, ImageSequence
source_path, output_path = sys.argv[1], sys.argv[2]
target_width, target_height = int(sys.argv[3]), int(sys.argv[4])
with Image.open(source_path) as source:
    frames=[]
    durations=[]
    loop=source.info.get("loop", 0)
    for frame in ImageSequence.Iterator(source):
        rgba=frame.convert("RGBA")
        if rgba.height != target_height or rgba.width >= target_width:
            raise ValueError("invalid pad-horizontal source")
        background=rgba.getpixel((0, 0))
        canvas=Image.new("RGBA", (target_width, target_height), background)
        canvas.alpha_composite(rgba, ((target_width-rgba.width)//2, 0))
        frames.append(canvas)
        durations.append(frame.info.get("duration", source.info.get("duration", 100)))
    if not frames:
        raise ValueError("empty GIF")
    frames[0].save(output_path, format="GIF", save_all=True, append_images=frames[1:], duration=durations, loop=loop, disposal=2, optimize=False)
`;
  await execFileAsync("python3", ["-c", script, filePath, outputPath, String(transform.targetWidth), String(transform.targetHeight)], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const metadata = await inspectOperationalImage(outputPath, {
    width: Number(profile.width),
    height: Number(profile.height),
    format: expectedFormat,
  });
  if (Number(metadata.frames) !== Number(source.frames)) throw new Error("Transformação de entrega não preservou todos os frames do GIF.");
  if (JSON.stringify(metadata.durations) !== JSON.stringify(source.durations) || Number(metadata.loop) !== Number(source.loop)) {
    throw new Error("Transformação de entrega não preservou duração/loop do GIF.");
  }
  return { transformed: true, source, metadata, filePath: outputPath, transform };
}

async function readOperationalVideoMetadata(filePath) {
  await execFileAsync("ffmpeg", ["-v", "error", "-i", filePath, "-f", "null", "-"], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,pix_fmt:format=format_name,duration",
    "-of", "json", filePath,
  ], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const stream = parsed?.streams?.[0];
  const formatName = String(parsed?.format?.format_name || "").toLowerCase();
  if (!stream || !/(^|,)mp4(,|$)|mov/.test(formatName)) throw new Error("Container de vídeo não é MP4 válido.");
  const metadata = {
    format: "MP4",
    codec: String(stream.codec_name || "").toLowerCase(),
    width: Number(stream.width),
    height: Number(stream.height),
    pixelFormat: String(stream.pix_fmt || "").toLowerCase(),
    duration: Number(parsed?.format?.duration),
    frames: null,
  };
  if (metadata.codec !== "h264" || !Number.isFinite(metadata.duration) || metadata.duration <= 0 || metadata.width <= 0 || metadata.height <= 0) {
    throw new Error("Vídeo MP4 precisa ser H.264, íntegro e ter duração positiva.");
  }
  return metadata;
}

async function prepareOperationalDeliveryMedia(filePath, profile) {
  const extension = path.extname(filePath).toLowerCase();
  const mediaFormat = extension === ".mp4" ? "MP4" : "GIF";
  const allowed = (Array.isArray(profile?.formats) ? profile.formats : []).map((value) => String(value).toUpperCase());
  if (!allowed.includes(mediaFormat)) throw new Error(`Perfil vigente não permite ${mediaFormat}.`);
  if (mediaFormat === "GIF") return prepareOperationalDeliveryImage(filePath, profile);

  const source = await readOperationalVideoMetadata(filePath);
  const transform = profile?.deliveryTransforms?.MP4;
  const exactTransform = transform?.mode === "contain-pad"
    && Number(transform.sourceWidth) === source.width
    && Number(transform.sourceHeight) === source.height
    && Number(transform.contentWidth) > 0
    && Number(transform.contentHeight) > 0
    && Number(transform.targetWidth) === Number(profile?.width)
    && Number(transform.targetHeight) === Number(profile?.height)
    && Number(transform.contentWidth) <= Number(transform.targetWidth)
    && Number(transform.contentHeight) <= Number(transform.targetHeight);
  if (!exactTransform) throw new Error("Dimensões do MP4 divergem da transformação autorizada para o formato contratado.");
  const outputPath = path.join(path.dirname(filePath), `${path.basename(filePath, extension)}-${transform.targetWidth}x${transform.targetHeight}-delivery.mp4`);
  const filter = `scale=${Number(transform.contentWidth)}:${Number(transform.contentHeight)}:flags=lanczos,pad=${Number(transform.targetWidth)}:${Number(transform.targetHeight)}:(ow-iw)/2:(oh-ih)/2:color=black`;
  await execFileAsync("ffmpeg", [
    "-y", "-v", "error", "-i", filePath, "-vf", filter, "-an",
    "-c:v", "libx264", "-pix_fmt", String(transform.pixelFormat || "yuv420p"),
    ...(transform.faststart ? ["-movflags", "+faststart"] : []),
    outputPath,
  ], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  const metadata = await readOperationalVideoMetadata(outputPath);
  if (metadata.width !== Number(profile.width) || metadata.height !== Number(profile.height) || metadata.pixelFormat !== String(transform.pixelFormat || "yuv420p") || metadata.codec !== "h264") {
    throw new Error("Conversão MP4 não produziu o perfil HOME 1 aprovado.");
  }
  if (Math.abs(metadata.duration - source.duration) > 0.15) throw new Error("Conversão MP4 alterou a duração da peça.");
  return { transformed: true, source, metadata, filePath: outputPath, transform };
}

async function assertOperationalMediaReadback({ mediaUrl, expectedSha256, expectedProfile, archivePath }) {
  const url = new URL(mediaUrl);
  url.searchParams.set("adops_sha", String(expectedSha256).slice(0, 16));
  const response = await fetch(url, {
    method: "GET",
    headers: { "Cache-Control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Mídia canônica não respondeu HTTP válido: ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) throw new Error("Readback público da mídia divergiu do SHA-256 da entrega.");
  const expectedFormat = String(expectedProfile?.format || expectedProfile?.formats?.find((value) => String(value).toUpperCase() === "MP4") || "GIF").toUpperCase();
  const readbackPath = `${archivePath}.public-readback.${expectedFormat === "MP4" ? "mp4" : "gif"}`;
  await writeFile(readbackPath, bytes);
  try {
    const metadata = expectedFormat === "MP4"
      ? await readOperationalVideoMetadata(readbackPath)
      : await inspectOperationalImage(readbackPath, { width: Number(expectedProfile.width), height: Number(expectedProfile.height), format: "GIF" });
    if (Number(metadata.width) !== Number(expectedProfile.width) || Number(metadata.height) !== Number(expectedProfile.height)) throw new Error("Readback público da mídia divergiu das dimensões aprovadas.");
    return { ok: true, sha256: actualSha256, bytes: bytes.length, metadata };
  } finally {
    await rm(readbackPath, { force: true });
  }
}

function normalizeOperationalMediaProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const deliveryTransform = profile.deliveryTransform && typeof profile.deliveryTransform === "object"
    ? {
        mode: String(profile.deliveryTransform.mode || ""),
        sourceWidth: Number(profile.deliveryTransform.sourceWidth),
        sourceHeight: Number(profile.deliveryTransform.sourceHeight),
        targetWidth: Number(profile.deliveryTransform.targetWidth),
        targetHeight: Number(profile.deliveryTransform.targetHeight),
      }
    : null;
  const deliveryTransforms = profile.deliveryTransforms && typeof profile.deliveryTransforms === "object"
    ? Object.fromEntries(Object.entries(profile.deliveryTransforms).sort(([left], [right]) => left.localeCompare(right)).map(([format, value]) => [String(format).toUpperCase(), Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, typeof item === "number" ? Number(item) : item]))]))
    : null;
  return {
    groupId: Number(profile.groupId),
    width: Number(profile.width),
    height: Number(profile.height),
    formats: (Array.isArray(profile.formats) ? profile.formats : []).map((value) => String(value).toUpperCase()).sort(),
    ...(deliveryTransform ? { deliveryTransform } : {}),
    ...(deliveryTransforms ? { deliveryTransforms } : {}),
  };
}

async function loadOperationalMediaProfile(siteSigla, localFormat) {
  const config = JSON.parse(await readFile(path.join(PROJECT_ROOT, "config/adrotate-sites.json"), "utf8"));
  const siteConfig = config?.[String(siteSigla || "").toUpperCase()];
  const normalizedFormat = normalizeOperationalValue(localFormat);
  const matches = (siteConfig?.formatMappings || []).filter((mapping) => (mapping?.aliases || []).some((alias) => normalizeOperationalValue(alias) === normalizedFormat));
  if (matches.length !== 1 || !matches[0]?.operationalMediaProfile) throw new Error("Formato operacional não possui um perfil de mídia único na configuração vigente.");
  return normalizeOperationalMediaProfile({ groupId: Number(matches[0].groupId), ...matches[0].operationalMediaProfile });
}

function extractMediaLinksFromText(text) {
  const links = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    for (const url of extractUrlsFromText(line)) {
      links.push({ url, kind: mediaKindFromUrl(url, line), driveFileId: parseGoogleDriveFileId(url) });
    }
  }
  return Array.from(new Map(links.map((item) => [item.url, item])).values());
}

function parseGoogleDriveFileId(value) {
  const raw = String(value || "");
  return raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]
    || raw.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1]
    || null;
}

function mediaKindFromUrl(url, surroundingText = "") {
  const value = `${url} ${surroundingText}`;
  if (/\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(url)) return "video";
  if (/\.(gif|png|jpe?g|webp)(?:[?#]|$)/i.test(url)) return "image";
  if (/\b(direcion(?:ar|amento)|destino|landing|clique|saiba mais)\b/i.test(surroundingText)) return "unknown";
  if (/\b(video|vt|download do video)\b/i.test(value)) return "video";
  if (/\b(banner|arte|imagem|gif)\b/i.test(value)) return "image";
  return "unknown";
}

async function readDriveTextObservations(items) {
  const textItems = (Array.isArray(items) ? items : [])
    .filter((item) => item?.mimeType === "text/plain"
      || item?.mimeType === "application/vnd.google-apps.document"
      || /\.txt$/i.test(String(item?.name || "")))
    .slice(0, 20);
  const observations = [];
  for (const item of textItems) {
    try {
      const archived = await downloadDriveFileToArchive(item);
      const text = String(await readFile(archived.filePath, "utf8")).slice(0, 1024 * 1024);
      observations.push({
        driveFileId: item.driveFileId,
        name: item.name,
        text,
        links: extractMediaLinksFromText(text),
      });
    } catch (error) {
      observations.push({
        driveFileId: item?.driveFileId || null,
        name: item?.name || null,
        text: "",
        links: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return observations;
}

async function buildDrivePiPackageContext(payload, archived) {
  if (payload?.simulation?.packageContext && typeof payload.simulation.packageContext === "object" && !Array.isArray(payload.simulation.packageContext)) {
    const context = payload.simulation.packageContext;
    const items = Array.isArray(context.items) ? context.items : [];
    const media = Array.isArray(context.media) ? context.media : items.filter((item) =>
      /^image\//.test(String(item?.mimeType || "")) || /^video\//.test(String(item?.mimeType || "")) || /\.(gif|png|jpe?g|webp|mp4)$/i.test(String(item?.name || ""))
    );
    return {
      event: {
        name: payload?.name ?? null,
        path: payload?.path ?? null,
        mimeType: payload?.mimeType ?? null,
        eventType: payload?.eventType ?? null,
        webViewLink: payload?.webViewLink ?? null,
      },
      folder: context.folder || {
        folderId: payload?.driveFileId ?? null,
        path: payload?.path ?? null,
      },
      items,
      media,
      textObservations: Array.isArray(context.textObservations) ? context.textObservations : [],
      pdf: context.pdf || null,
      primaryArchive: context.primaryArchive || archived || null,
    };
  }
  const folder = await resolveDrivePiPackageFolder(payload);
  const items = folder?.folderId ? await listDrivePiPackageItems(folder.folderId, folder.path || "") : [];
  const pdfItems = items.filter((item) => item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name));
  const mediaItems = items.filter((item) => /^image\//.test(item.mimeType) || /^video\//.test(item.mimeType) || /\.(gif|png|jpe?g|webp|mp4)$/i.test(item.name));
  const textObservations = await readDriveTextObservations(items);
  let primaryArchive = archived;
  if (!primaryArchive && pdfItems.length) {
    primaryArchive = await downloadDriveFileToArchive(pdfItems[0]);
  }
  const extracted = await extractTextFromArchivedPdf(primaryArchive);
  return {
    event: {
      name: payload?.name ?? null,
      path: payload?.path ?? null,
      mimeType: payload?.mimeType ?? null,
      eventType: payload?.eventType ?? null,
      webViewLink: payload?.webViewLink ?? null,
    },
    folder,
    items: items.map((item) => ({
      driveFileId: item.driveFileId,
      name: item.name,
      path: item.path,
      mimeType: item.mimeType,
      modifiedTime: item.modifiedTime,
      webViewLink: item.webViewLink,
      size: item.size,
    })),
    media: mediaItems.map((item) => ({
      driveFileId: item.driveFileId,
      name: item.name,
      path: item.path,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink,
      size: item.size,
    })),
    textObservations,
    pdf: primaryArchive ? {
      filePath: primaryArchive.filePath,
      sha256: primaryArchive.sha256,
      bytes: primaryArchive.bytes,
      sourceDriveFileId: primaryArchive.sourceDriveFileId || payload?.driveFileId || null,
      sourceName: primaryArchive.sourceName || payload?.name || null,
      textExcerpt: String(extracted?.plain || extracted?.layout || "").slice(0, 12000),
      parseError: extracted?.error || null,
    } : null,
    primaryArchive,
  };
}

function classifyDrivePiPackage(packageContext, payload, archived) {
  const mimeType = String(payload?.mimeType || "");
  const name = String(payload?.name || "");
  const isFolderEvent = mimeType === "application/vnd.google-apps.folder" || String(payload?.eventType || "").startsWith("folder_");
  const eventLooksPdf = mimeType === "application/pdf" || /\.pdf$/i.test(name);
  const eventLooksMedia = /^image\//.test(mimeType) || /^video\//.test(mimeType) || /\.(gif|png|jpe?g|webp|mp4)$/i.test(name);
  const itemCount = Array.isArray(packageContext?.items) ? packageContext.items.length : 0;
  const mediaCount = Array.isArray(packageContext?.media) ? packageContext.media.length : 0;
  const hasPdf = Boolean(packageContext?.pdf || archived || eventLooksPdf);
  const hasMedia = mediaCount > 0 || eventLooksMedia;

  let packageClass = "unknown";
  const missing = [];
  if (isFolderEvent && itemCount === 0) {
    packageClass = "folder_empty";
    missing.push("pi_pdf", "media");
  } else if (hasPdf && hasMedia) {
    packageClass = "pi_and_media_present";
  } else if (hasPdf) {
    packageClass = "missing_media";
    missing.push("media");
  } else if (hasMedia) {
    packageClass = "missing_pi_pdf";
    missing.push("pi_pdf");
  } else {
    packageClass = "missing_pi_pdf_and_media";
    missing.push("pi_pdf", "media");
  }

  return {
    class: packageClass,
    aliases: [
      packageClass === "missing_media" ? "pdf_only" : null,
      packageClass === "missing_pi_pdf" ? "media_only" : null,
    ].filter(Boolean),
    hasPdf,
    hasMedia,
    itemCount,
    mediaCount,
    missing,
    canUseAgent: hasPdf || hasMedia || Boolean(name.trim()) || Boolean(payload?.path),
  };
}

async function readPiAgentKnowledge() {
  try {
    return (await readFile(ADOPS_PI_AGENT_KNOWLEDGE_FILE, "utf8")).slice(0, 12000);
  } catch {
    return [
      "Fonte SPM indisponivel no runtime. Aplicar regras conservadoras do AdOps.",
      "Nao inventar campos. Usar null quando a PI nao informar.",
      "Todo campo critico exige confianca e citacao curta.",
    ].join("\n");
  }
}

function buildPiAgentJsonSchema() {
  const nullableTextField = {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: ["string", "null"] },
      confidence: { type: "number" },
      source: { type: ["string", "null"] },
    },
    required: ["value", "confidence", "source"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["parsed", "needs_review"] },
      agentVersion: { type: "string" },
      piCodigo: nullableTextField,
      cliente: nullableTextField,
      agencia: nullableTextField,
      campanhaName: nullableTextField,
      competencia: nullableTextField,
      periodo: {
        type: "object",
        additionalProperties: false,
        properties: {
          inicio: nullableTextField,
          fim: nullableTextField,
          original: nullableTextField,
        },
        required: ["inicio", "fim", "original"],
      },
      site: nullableTextField,
      localFormato: nullableTextField,
      media: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            filename: { type: ["string", "null"] },
            format: { type: ["string", "null"] },
            confidence: { type: "number" },
            source: { type: ["string", "null"] },
          },
          required: ["filename", "format", "confidence", "source"],
        },
      },
      clickUrl: nullableTextField,
      insertions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            site: nullableTextField,
            localFormato: nullableTextField,
            periodoInicio: nullableTextField,
            periodoFim: nullableTextField,
            periodoOriginal: nullableTextField,
          },
          required: ["site", "localFormato", "periodoInicio", "periodoFim", "periodoOriginal"],
        },
      },
      conflicts: { type: "array", items: { type: "string" } },
      missingFields: { type: "array", items: { type: "string" } },
    },
    required: [
      "status",
      "agentVersion",
      "piCodigo",
      "cliente",
      "agencia",
      "campanhaName",
      "competencia",
      "periodo",
      "site",
      "localFormato",
      "media",
      "clickUrl",
      "insertions",
      "conflicts",
      "missingFields",
    ],
  };
}

function extractOpenAIResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callPiAgentOpenAI(packageContext) {
  const knowledge = await readPiAgentKnowledge();
  const userPayload = {
    instructions: [
      "Extraia dados de PI para AdOps.",
      "Responda apenas JSON no schema solicitado.",
      "Nao invente campos; use null quando nao houver evidencia.",
      "Use citacao curta da PI, nome de arquivo ou caminho para cada campo critico.",
      "Quando houver periodoInicio e periodoFim no mesmo mes, preencha competencia como MM/YYYY a partir do periodoInicio.",
      "A IA nao aplica mudancas; scripts deterministas validam e executam depois.",
    ],
    spmKnowledge: knowledge,
    packageClassification: packageContext.packageClassification || null,
    packageContext: {
      event: packageContext.event,
      folder: packageContext.folder,
      items: packageContext.items,
      media: packageContext.media,
      pdf: packageContext.pdf ? {
        sourceName: packageContext.pdf.sourceName,
        sha256: packageContext.pdf.sha256,
        bytes: packageContext.pdf.bytes,
        textExcerpt: packageContext.pdf.textExcerpt,
        parseError: packageContext.pdf.parseError,
      } : null,
    },
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: ADOPS_PI_AGENT_MODEL,
      input: [
        {
          role: "system",
          content: "Voce e um agente de analise de PI do AdOps. Gere somente dados estruturados auditaveis; nunca autorize mutacao direta.",
        },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "adops_pi_agent_analysis",
          strict: true,
          schema: buildPiAgentJsonSchema(),
        },
      },
    }),
    signal: AbortSignal.timeout(ADOPS_PI_AGENT_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI PI agent falhou: ${response.status}`);
  }
  const text = extractOpenAIResponseText(payload);
  if (!text) throw new Error("OpenAI PI agent retornou resposta vazia.");
  return JSON.parse(text);
}

async function analyzeDrivePiWithAgent(packageContext) {
  if (!ADOPS_PI_AGENT_ENABLED) return { skipped: "ADOPS_PI_AGENT_ENABLED=false" };
  if (!OPENAI_API_KEY) return { skipped: "OPENAI_API_KEY ausente" };
  let lastError = null;
  for (let attempt = 0; attempt <= ADOPS_PI_AGENT_RETRIES; attempt += 1) {
    try {
      const parsedPi = await callPiAgentOpenAI(packageContext);
      return {
        ok: true,
        provider: "openai",
        model: ADOPS_PI_AGENT_MODEL,
        agentVersion: parsedPi.agentVersion || ADOPS_PI_AGENT_VERSION,
        parsedPi,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < ADOPS_PI_AGENT_RETRIES) await sleep(500 * (attempt + 1));
    }
  }
  return {
    ok: false,
    provider: "openai",
    model: ADOPS_PI_AGENT_MODEL,
    agentVersion: ADOPS_PI_AGENT_VERSION,
    error: lastError,
  };
}

function collectAgentQualityIssues(agentParsedPi) {
  if (!agentParsedPi || typeof agentParsedPi !== "object" || Array.isArray(agentParsedPi)) {
    return { ok: true, issues: [], missingFields: [], conflicts: [] };
  }
  const checks = [
    { name: "piCodigo", source: agentParsedPi, keys: ["piCodigo"] },
    { name: "cliente", source: agentParsedPi, keys: ["cliente"] },
    { name: "agencia", source: agentParsedPi, keys: ["agencia"] },
    { name: "campanhaName", source: agentParsedPi, keys: ["campanhaName", "campanha"] },
    { name: "competencia", source: agentParsedPi, keys: ["competencia"] },
    { name: "site", source: agentParsedPi, keys: ["site"] },
    { name: "localFormato", source: agentParsedPi, keys: ["localFormato"] },
    { name: "periodoInicio", source: agentParsedPi.periodo || {}, keys: ["inicio", "periodoInicio"] },
    { name: "periodoFim", source: agentParsedPi.periodo || {}, keys: ["fim", "periodoFim"] },
  ];
  const issues = [];
  for (const check of checks) {
    const value = readAgentValue(check.source, check.keys);
    if (!value) continue;
    const confidence = readAgentConfidence(check.source, check.keys);
    const source = readAgentSource(check.source, check.keys);
    if (confidence === null || confidence < ADOPS_PI_AGENT_MIN_CONFIDENCE) {
      issues.push(`${check.name}: confianca abaixo do minimo`);
    }
    if (!source) {
      issues.push(`${check.name}: citacao ausente`);
    }
  }
  const missingFields = Array.isArray(agentParsedPi.missingFields) ? agentParsedPi.missingFields.filter(Boolean).map(String) : [];
  const conflicts = Array.isArray(agentParsedPi.conflicts) ? agentParsedPi.conflicts.filter(Boolean).map(String) : [];
  return {
    ok: issues.length === 0 && conflicts.length === 0,
    issues,
    missingFields,
    conflicts,
  };
}

async function normalizeAgentParsedPi(agentParsedPi) {
  if (!agentParsedPi || typeof agentParsedPi !== "object" || Array.isArray(agentParsedPi)) return {};
  const piCodigo = readAgentValue(agentParsedPi, ["piCodigo"]);
  const campaignName = readAgentValue(agentParsedPi, ["campanhaName", "campanha"]);
  const competencia = readAgentValue(agentParsedPi, ["competencia"]);
  const clientName = readAgentValue(agentParsedPi, ["cliente"]);
  const agencyName = readAgentValue(agentParsedPi, ["agencia"]);
  const siteName = readAgentValue(agentParsedPi, ["site"]);
  const localFormato = readAgentValue(agentParsedPi, ["localFormato"]);
  const clickUrl = readUrlRecord({ clickUrl: readAgentValue(agentParsedPi, ["clickUrl", "redirectUrl", "urlDestino"]) }, ["clickUrl"]);
  const periodo = agentParsedPi.periodo && typeof agentParsedPi.periodo === "object" ? agentParsedPi.periodo : {};
  const periodoInicio = readAgentValue(periodo, ["inicio", "periodoInicio"]);
  const periodoFim = readAgentValue(periodo, ["fim", "periodoFim"]);
  const periodoOriginal = readAgentValue(periodo, ["original", "periodoOriginal"]);
  const ids = await resolveDrivePiEntityIds({
    clientName,
    agencyName,
    vehicleName: siteName,
  });
  const agentInsertions = Array.isArray(agentParsedPi.insertions) && agentParsedPi.insertions.length
    ? agentParsedPi.insertions.map((item) => ({
        siteId: readNumberRecord(item, ["siteId"]) ?? ids.siteId,
        localFormato: readAgentValue(item, ["localFormato"]) ?? localFormato,
        localFormatoNormalizado: readAgentValue(item, ["localFormatoNormalizado"]) ?? readAgentValue(item, ["localFormato"]) ?? localFormato,
        periodoInicio: readAgentValue(item, ["periodoInicio", "inicio"]) ?? periodoInicio,
        periodoFim: readAgentValue(item, ["periodoFim", "fim"]) ?? periodoFim,
        periodoOriginal: readAgentValue(item, ["periodoOriginal", "original"]) ?? periodoOriginal,
        clickUrl,
      }))
    : ids.siteId && localFormato && periodoInicio && periodoFim
      ? [{
          siteId: ids.siteId,
          localFormato,
          localFormatoNormalizado: localFormato,
          periodoInicio,
          periodoFim,
          periodoOriginal,
          clickUrl,
        }]
      : [];
  const agentQuality = collectAgentQualityIssues(agentParsedPi);
  return {
    piCodigo,
    campaignName,
    competencia,
    clienteId: ids.clienteId,
    agenciaId: ids.agenciaId,
    clickUrl,
    insertions: agentInsertions,
    agentQuality,
    agentAnalysis: {
      provider: "openai",
      model: ADOPS_PI_AGENT_MODEL,
      agentVersion: agentParsedPi.agentVersion || ADOPS_PI_AGENT_VERSION,
      status: agentParsedPi.status || "parsed",
      missingFields: agentQuality.missingFields,
      conflicts: agentQuality.conflicts,
      issues: agentQuality.issues,
    },
    raw: agentParsedPi,
  };
}

function mergeDrivePiFields(parsed, parsedFromPdf, {
  allowPdfInsertions = true,
  preferPdfInsertions = false,
  preferPdfCommercialIdentity = false,
} = {}) {
  const pdfInsertions = allowPdfInsertions ? parsedFromPdf.insertions || [] : [];
  const parsedInsertions = preferPdfInsertions && pdfInsertions.length
    ? pdfInsertions
    : parsed.insertions?.length
      ? parsed.insertions
      : pdfInsertions;
  const mergedCompetencia = mergeFieldValue(parsed.competencia, parsedFromPdf.competencia);
  const inferredCompetencia = mergedCompetencia ? null : inferCompetenciaFromInsertionPeriod(parsedInsertions);
  return {
    ...parsed,
    piCodigo: mergeFieldValue(parsed.piCodigo, parsedFromPdf.piCodigo),
    pdfPiCodigo: parsedFromPdf.piCodigo || null,
    campaignName: mergeFieldValue(parsed.campaignName, parsedFromPdf.campaignName),
    competencia: mergedCompetencia || inferredCompetencia,
    pdfCompetencia: parsedFromPdf.competencia || null,
    clienteId: preferPdfCommercialIdentity && parsedFromPdf.clienteId
      ? parsedFromPdf.clienteId
      : mergeFieldValue(parsed.clienteId, parsedFromPdf.clienteId),
    agenciaId: preferPdfCommercialIdentity && parsedFromPdf.agenciaId
      ? parsedFromPdf.agenciaId
      : mergeFieldValue(parsed.agenciaId, parsedFromPdf.agenciaId),
    valorLiquido: mergeFieldValue(readNumberRecord(parsed.raw, ["valorLiquido"]), parsedFromPdf.valorLiquido),
    clickUrl: mergeFieldValue(readUrlRecord(parsed.raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]), parsedFromPdf.clickUrl),
    insertions: parsedInsertions,
    agentQuality: parsed.agentQuality || null,
    agentAnalysis: parsed.agentAnalysis || null,
    raw: {
      ...parsedFromPdf,
      ...parsed.raw,
      competenciaInference: inferredCompetencia
        ? { value: inferredCompetencia, source: "periodoInicio/periodoFim no mesmo mes" }
        : null,
    },
  };
}

function mergeExpectedDrivePiContext(fields, { insertion, campaign, sourceText = "" }) {
  const canonicalInsertion = {
    siteId: readNumberRecord(insertion, ["siteId"]),
    siteSigla: readStringRecord(insertion, ["siteSigla"]),
    localFormato: readStringRecord(insertion, ["localFormato", "localFormatoNormalizado"]),
    localFormatoNormalizado: readStringRecord(insertion, ["localFormatoNormalizado", "localFormato"]),
    periodoInicio: readStringRecord(insertion, ["periodoInicio"]),
    periodoFim: readStringRecord(insertion, ["periodoFim"]),
    periodoOriginal: readStringRecord(insertion, ["periodoOriginal"]),
  };
  const parsedInsertions = Array.isArray(fields?.insertions) ? fields.insertions : [];
  const sourceSiteAliases = observedSiteFolderAliases(sourceText);
  const expectedSiteSigla = normalizeSiteAlias(canonicalInsertion.siteSigla);
  const canHydrateUniqueSite = parsedInsertions.length === 1
    && !readNumberRecord(parsedInsertions[0], ["siteId"])
    && Boolean(canonicalInsertion.siteId)
    && Boolean(expectedSiteSigla)
    && sourceSiteAliases.length === 1
    && sourceSiteAliases[0] === expectedSiteSigla
    && normalizeSlotKey(readStringRecord(parsedInsertions[0], ["localFormatoNormalizado", "localFormato"]) || "")
      === normalizeSlotKey(canonicalInsertion.localFormatoNormalizado || canonicalInsertion.localFormato)
    && readStringRecord(parsedInsertions[0], ["periodoInicio", "inicio"]) === canonicalInsertion.periodoInicio
    && readStringRecord(parsedInsertions[0], ["periodoFim", "fim"]) === canonicalInsertion.periodoFim;
  const insertions = parsedInsertions.length
    ? canHydrateUniqueSite
      ? [{ ...parsedInsertions[0], siteId: canonicalInsertion.siteId }]
      : parsedInsertions
    : [canonicalInsertion];
  return {
    ...fields,
    campaignName: fields?.campaignName || readStringRecord(campaign, ["nome", "campaignName"]),
    competencia: fields?.competencia || readStringRecord(campaign, ["competencia"]),
    // An expected campaign means the API has already fixed the commercial
    // identity. Preserve the PDF extraction in raw audit data, but hydrate
    // these fields from the canonical campaign before any mutation gate.
    clienteId: readNumberRecord(campaign, ["clienteId"]),
    agenciaId: readNumberRecord(campaign, ["agenciaId"]),
    insertions,
  };
}

async function extractDrivePiFields(payload, archived, agentParsedPi = null, packageContext = null) {
  const hasPayloadParsedPi = payload?.parsedPi && typeof payload.parsedPi === "object" && !Array.isArray(payload.parsedPi);
  const parsed = hasPayloadParsedPi
    ? payload.parsedPi
    : agentParsedPi && typeof agentParsedPi === "object" && !Array.isArray(agentParsedPi)
      ? await normalizeAgentParsedPi(agentParsedPi)
      : {};
  const nameAndPath = buildDrivePiTextHints(payload, archived, packageContext);
  const piMatch = nameAndPath.match(/\bPI[\s_-]*(\d{3,})\b/i) || nameAndPath.match(/\b(\d{5,})\b/);
  const piCodigo = readStringRecord(parsed, ["piCodigo", "pi", "codigoPi"]) ?? (piMatch ? `PI ${piMatch[1]}` : null);
  const campaignName = readStringRecord(parsed, ["campanhaNome", "campaignName", "nome"]);
  const competencia = readStringRecord(parsed, ["competencia", "mesReferencia", "referenceMonth"]);
  const clienteId = readNumberRecord(parsed, ["clienteId", "clientId"]);
  const agenciaId = readNumberRecord(parsed, ["agenciaId", "agencyId"]);
  const insertions = Array.isArray(parsed.insertions)
    ? parsed.insertions
    : Array.isArray(parsed.insercoes)
      ? parsed.insercoes
      : [];

  const baseFields = {
    piCodigo,
    campaignName,
    competencia,
    clienteId,
    agenciaId,
    insertions,
    raw: parsed,
  };
  const parsedFromPdf = await parseDrivePiPdfFields(archived);
  return mergeDrivePiFields(baseFields, parsedFromPdf, {
    allowPdfInsertions: payload?.allowPdfInsertions !== false,
    preferPdfInsertions: Boolean(
      readPositiveInteger(payload?.expectedInsertionId)
      && readPositiveInteger(payload?.expectedCampaignId),
    ),
    // Once the API has resolved a canonical campaign/insertion, its client
    // and agency are the authoritative commercial identity. The PDF remains
    // auditable in `raw`, but cannot overwrite or falsely block that target.
    preferPdfCommercialIdentity: false,
  });
}

function validateDrivePiApplyFields(fields) {
  const missing = [];
  if (!fields.piCodigo) missing.push("piCodigo");
  if (!fields.campaignName) missing.push("campanhaNome");
  if (!fields.competencia) missing.push("competencia");
  if (!fields.clienteId) missing.push("clienteId");
  if (!fields.agenciaId) missing.push("agenciaId");
  if (!fields.insertions.length) missing.push("insertions");
  if (fields.agentQuality && !fields.agentQuality.ok) missing.push("agentQuality");

  const invalidInsertions = fields.insertions
    .map((item, index) => {
      const missingInsertion = [];
      if (!readNumberRecord(item, ["siteId"])) missingInsertion.push("siteId");
      if (!readStringRecord(item, ["localFormato", "localFormatoNormalizado"])) missingInsertion.push("localFormato");
      if (!readStringRecord(item, ["periodoInicio", "inicio"])) missingInsertion.push("periodoInicio");
      if (!readStringRecord(item, ["periodoFim", "fim"])) missingInsertion.push("periodoFim");
      return missingInsertion.length ? { index, missing: missingInsertion } : null;
    })
    .filter(Boolean);

  return {
    ok: missing.length === 0 && invalidInsertions.length === 0,
    missing,
    invalidInsertions,
    agentQuality: fields.agentQuality || null,
  };
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function isDiscardableDraftCampaign(detail, relationsByInsertionId = new Map()) {
  const insertions = Array.isArray(detail?.insertions) ? detail.insertions : [];
  const trustedDraftOrigin = ["google-drive-monitor", "planilha_sincronizada"].includes(String(detail?.origem || "").trim().toLowerCase());
  if (!trustedDraftOrigin) return false;
  return insertions.every((insertion) => {
    const status = normalizeText(insertion?.statusNormalizado);
    const knownDraftOrigin = /^(criado a partir do drive|sincronizado da planilha)/.test(normalizeText(insertion?.observacoes));
    const relation = relationsByInsertionId.get(Number(insertion?.id)) || {};
    const hasAdrotateHistory = Boolean(
      relation?.plannedSelf
      || (Array.isArray(relation?.exactLiveMatches) && relation.exactLiveMatches.length)
      || (Array.isArray(relation?.historicalAdminMatches) && relation.historicalAdminMatches.length),
    );
    return knownDraftOrigin
      && ["rascunho", "aguardando_publicacao"].includes(status)
      && insertion?.bannerPublicadoNoSite !== true
      && !firstNonEmptyString(insertion?.mediaUrl)
      && Number(insertion?.totalEvidencias || 0) === 0
      && insertion?.printGerado !== true
      && !hasAdrotateHistory;
  });
}

async function validateDrivePiDedupeSafety(fields, expectedTarget = null) {
  const piKey = normalizePiDigits(fields.piCodigo);
  const competenciaKey = normalizeCompetenciaKey(fields.competencia);
  if (!piKey || !competenciaKey) return { ok: true, conflicts: [], checkedCampaignIds: [] };

  const allCampaigns = await privateApiGet("/api/campaigns?limit=500").catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  if (!Array.isArray(allCampaigns)) {
    return {
      ok: false,
      conflicts: [`dedupe_check_failed: ${allCampaigns?.error || "nao foi possivel listar campanhas"}`],
      checkedCampaignIds: [],
    };
  }

  const campaignCandidates = allCampaigns.filter((item) =>
    (normalizePiDigits(item?.piCodigo) || normalizeText(item?.piCodigo)) === (piKey || normalizeText(fields.piCodigo)) &&
    normalizeCompetenciaKey(item?.competencia) === competenciaKey
  );
  const exactCandidates = campaignCandidates.filter((item) =>
    normalizeText(item?.nome) === normalizeText(fields.campaignName) &&
    Number(item?.agenciaId ?? 0) === Number(fields.agenciaId)
  );

  const expectedCampaignId = readPositiveInteger(expectedTarget?.expectedCampaignId);
  const expectedInsertionId = readPositiveInteger(expectedTarget?.expectedInsertionId);
  if (expectedCampaignId && expectedInsertionId) {
    const campaign = campaignCandidates.find((item) => Number(item?.id) === expectedCampaignId);
    if (!campaign) {
      return { ok: false, conflicts: [`dedupe_conflict: campanha canônica #${expectedCampaignId} não corresponde mais à PI/competência`], checkedCampaignIds: [] };
    }
    const detail = await privateApiGet(`/api/campaigns/${expectedCampaignId}`).catch(() => null);
    const expectedInsertion = Array.isArray(detail?.insertions)
      ? detail.insertions.find((item) => Number(item?.id) === expectedInsertionId)
      : null;
    const raw = fields.insertions.length === 1 ? fields.insertions[0] : null;
    const sameScope = Boolean(raw && expectedInsertion
      && Number(expectedInsertion.siteId ?? 0) === Number(readNumberRecord(raw, ["siteId"]) || 0)
      && normalizeSlotKey(expectedInsertion.localFormatoNormalizado ?? expectedInsertion.localFormato) === normalizeSlotKey(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]))
      && expectedInsertion.periodoInicio === readStringRecord(raw, ["periodoInicio", "inicio"])
      && expectedInsertion.periodoFim === readStringRecord(raw, ["periodoFim", "fim"]));
    if (!sameScope) {
      return { ok: false, conflicts: [`dedupe_conflict: inserção canônica #${expectedInsertionId} não corresponde mais ao portal/formato/período`], checkedCampaignIds: [expectedCampaignId] };
    }
    const ignoredDraftCampaignIds = [];
    for (const competitor of campaignCandidates.filter((item) => Number(item?.id) !== expectedCampaignId)) {
      const competitorDetail = await privateApiGet(`/api/campaigns/${competitor.id}`).catch(() => null);
      if (!Array.isArray(competitorDetail?.insertions)) {
        return { ok: false, conflicts: [`dedupe_check_failed: não foi possível validar a campanha concorrente #${competitor.id}`], checkedCampaignIds: [expectedCampaignId] };
      }
      const relations = new Map();
      for (const insertion of competitorDetail.insertions) {
        const relation = await privateApiGet(`/api/integrations/adrotate/insertions/${insertion.id}/relation`).catch(() => null);
        if (!relation) {
          return { ok: false, conflicts: [`dedupe_check_failed: não foi possível validar o histórico AdRotate da inserção #${insertion.id}`], checkedCampaignIds: [expectedCampaignId] };
        }
        relations.set(Number(insertion.id), relation);
      }
      if (!isDiscardableDraftCampaign(competitorDetail, relations)) {
        return { ok: false, conflicts: [`dedupe_conflict: campanha concorrente #${competitor.id} possui publicação, mídia, evidência ou origem não descartável`], checkedCampaignIds: [expectedCampaignId, Number(competitor.id)] };
      }
      ignoredDraftCampaignIds.push(Number(competitor.id));
    }
    return {
      ok: true,
      conflicts: [],
      checkedCampaignIds: [expectedCampaignId],
      ignoredDraftCampaignIds,
    };
  }

  const conflicts = [];
  if (campaignCandidates.length > 1 && exactCandidates.length !== 1) {
    conflicts.push(`dedupe_conflict: PI/competencia com campanhas concorrentes (${campaignCandidates.map((item) => `#${item.id}`).join(", ")})`);
  }
  if (exactCandidates.length > 1) {
    conflicts.push(`dedupe_conflict: campanha canonica ambigua (${exactCandidates.map((item) => `#${item.id}`).join(", ")})`);
  }

  const campaignsToCheck = exactCandidates.length ? exactCandidates : campaignCandidates;
  for (const campaign of campaignsToCheck) {
    const detail = await privateApiGet(`/api/campaigns/${campaign.id}`).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (!Array.isArray(detail?.insertions)) {
      conflicts.push(`dedupe_check_failed: nao foi possivel ler insercoes da campanha #${campaign.id}`);
      continue;
    }
    for (const raw of fields.insertions) {
      const siteId = readNumberRecord(raw, ["siteId"]);
      const localFormato = readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]);
      const periodoInicio = readStringRecord(raw, ["periodoInicio", "inicio"]);
      const periodoFim = readStringRecord(raw, ["periodoFim", "fim"]);
      const matches = detail.insertions.filter((item) =>
        Number(item.siteId ?? 0) === Number(siteId) &&
        normalizeSlotKey(item.localFormatoNormalizado ?? item.localFormato) === normalizeSlotKey(localFormato) &&
        item.periodoInicio === periodoInicio &&
        item.periodoFim === periodoFim
      );
      if (matches.length > 1) {
        conflicts.push(`dedupe_conflict: insercoes concorrentes na campanha #${campaign.id} (${matches.map((item) => `#${item.id}`).join(", ")})`);
      }
    }
  }

  return {
    ok: conflicts.length === 0,
    conflicts: uniqueStrings(conflicts),
    checkedCampaignIds: campaignsToCheck.map((item) => item.id).filter(Boolean),
  };
}

async function validateDrivePiSiteRollout(fields) {
  if (!ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS.length) return { ok: true, blockedSites: [], resolvedSites: [] };
  const sites = await privateApiGet("/api/sites");
  const siteById = new Map(Array.isArray(sites) ? sites.map((site) => [Number(site.id), String(site.sigla || "").toUpperCase()]) : []);
  const resolvedSites = fields.insertions
    .map((item) => {
      const siteId = readNumberRecord(item, ["siteId"]);
      return { siteId, sigla: siteId ? siteById.get(Number(siteId)) || null : null };
    });
  const blockedSites = resolvedSites.filter((item) => !item.sigla || !ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS.includes(item.sigla));
  return { ok: blockedSites.length === 0, blockedSites, resolvedSites };
}

function buildDrivePiReviewReasons({
  packageClassification,
  packageReadiness,
  validation,
  rollout,
  dedupe,
  preflightOnly = false,
  mutationEnabled,
  canApply,
  evidenceCoverage,
  postApplyWarnings = [],
}) {
  const reasons = [];
  const packageMissing = Array.isArray(packageClassification?.missing) ? packageClassification.missing : [];
  if (packageClassification?.class === "folder_empty" && preflightOnly) reasons.push("drive_folder_empty_or_not_shared");
  if (packageMissing.includes("pi_pdf") && packageReadiness?.issues?.includes("missing_pi_pdf")) reasons.push("missing_pi_pdf");
  if (packageMissing.includes("media") && packageReadiness?.issues?.includes("missing_media")) reasons.push("missing_media");
  for (const item of packageReadiness?.issues || []) reasons.push(item);
  for (const item of validation?.missing || []) reasons.push(`missing_${item}`);
  if (validation?.invalidInsertions?.length) reasons.push("invalid_insertions");
  if (validation?.agentQuality && !validation.agentQuality.ok) reasons.push("agent_quality");
  if (rollout && !rollout.ok) reasons.push("rollout_blocked");
  if (dedupe && !dedupe.ok) reasons.push("dedupe_conflict");
  if (canApply && preflightOnly) reasons.push("preflight_only");
  if (canApply && !mutationEnabled) reasons.push("auto_apply_disabled");
  for (const result of evidenceCoverage?.results || []) {
    if (result?.status === "needs_media") reasons.push("needs_media");
    else if (result?.status && result.status !== "audited") reasons.push(`evidence_${result.status}`);
  }
  if (postApplyWarnings.length) reasons.push("post_apply_warning");
  return uniqueStrings(reasons);
}

function hasHttpsDrivePiDestination(fields, expectedInsertion = null) {
  const globalDestination = readUrlRecord(fields, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]);
  if (String(globalDestination || "").toLowerCase().startsWith("https://")) return true;

  const insertions = Array.isArray(fields?.insertions) ? fields.insertions : [];
  const hasHttps = (item) => String(readUrlRecord(item, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]) || "")
    .toLowerCase()
    .startsWith("https://");
  if (expectedInsertion) {
    const scoped = insertions.filter((raw) => (
      Number(readNumberRecord(raw, ["siteId"]) || 0) === Number(expectedInsertion.siteId || 0)
      && normalizeSlotKey(readStringRecord(raw, ["localFormatoNormalizado", "localFormato"]) || "")
        === normalizeSlotKey(expectedInsertion.localFormatoNormalizado || expectedInsertion.localFormato)
      && readStringRecord(raw, ["periodoInicio", "inicio"]) === expectedInsertion.periodoInicio
      && readStringRecord(raw, ["periodoFim", "fim"]) === expectedInsertion.periodoFim
    ));
    return scoped.length === 1 && hasHttps(scoped[0]);
  }
  return insertions.length > 0 && insertions.every(hasHttps);
}

function validateOptionalDrivePiDestination(fields, expectedInsertion = null) {
  const values = [];
  const globalDestination = readStringRecord(fields, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]);
  if (globalDestination) values.push(globalDestination);
  const insertions = Array.isArray(fields?.insertions) ? fields.insertions : [];
  const scoped = expectedInsertion
    ? insertions.filter((raw) => (
        Number(readNumberRecord(raw, ["siteId"]) || 0) === Number(expectedInsertion.siteId || 0)
        && normalizeSlotKey(readStringRecord(raw, ["localFormatoNormalizado", "localFormato"]) || "") === normalizeSlotKey(expectedInsertion.localFormatoNormalizado || expectedInsertion.localFormato)
        && readStringRecord(raw, ["periodoInicio", "inicio"]) === expectedInsertion.periodoInicio
        && readStringRecord(raw, ["periodoFim", "fim"]) === expectedInsertion.periodoFim
      ))
    : insertions;
  for (const item of scoped) {
    const value = readStringRecord(item, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]);
    if (value) values.push(value);
  }
  const unique = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: true, mode: "none", url: null, issue: null };
  if (unique.length > 1) return { ok: false, mode: "ambiguous", url: null, issue: "ambiguous_destination" };
  try {
    const parsed = new URL(unique[0]);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || /(^|\.)(?:drive|docs)\.google\.com$/i.test(parsed.hostname) || isReservedDestinationHost(parsed.hostname)) {
      return { ok: false, mode: "invalid", url: null, issue: "invalid_provided_destination" };
    }
    return { ok: true, mode: "https", url: unique[0], issue: null };
  } catch {
    return { ok: false, mode: "invalid", url: null, issue: "invalid_provided_destination" };
  }
}

function validateDrivePiPackageReadiness(packageClassification, fields, mediaProcessing = null, { requireResolvedMedia = false, requireHttpsDestination = false, expectedInsertion = null } = {}) {
  const hasInsertionMedia = fields.insertions.some((item) => readStringRecord(item, ["mediaUrl", "media_url"]));
  const unresolvedMedia = fields.insertions.filter((item) => !readStringRecord(item, ["mediaUrl", "media_url"]));
  const issues = [];
  if (!packageClassification?.hasPdf) issues.push("missing_pi_pdf");
  if (!packageClassification?.hasMedia && !hasInsertionMedia) issues.push("missing_media");
  if (unresolvedMedia.some(isVideoInsertion)) issues.push("video_media_url_missing_after_processing");
  if (requireResolvedMedia && unresolvedMedia.length) issues.push("insertion_media_url_missing_after_processing");
  if (requireHttpsDestination) {
    const destination = validateOptionalDrivePiDestination(fields, expectedInsertion);
    if (!destination.ok && destination.issue) issues.push(destination.issue);
  }
  for (const issue of mediaProcessing?.issues || []) issues.push(issue);
  return {
    ok: issues.length === 0,
    issues: uniqueStrings(issues),
    hasPdf: Boolean(packageClassification?.hasPdf),
    hasMedia: Boolean(packageClassification?.hasMedia || hasInsertionMedia),
  };
}

async function updateDrivePiState(payload, status, extra = {}) {
  if (!payload?.eventId) return null;
  return request("/api/ops/drive-pi-events/status", {
    method: "POST",
    body: JSON.stringify({
      eventId: payload.eventId,
      documentId: payload.documentId ?? null,
      status,
      ...extra,
    }),
  });
}

async function downloadDriveFileIfConfigured(payload) {
  if (!payload?.driveFileId || String(payload.mimeType || "").includes("folder")) {
    return null;
  }
  return downloadDriveFileToArchive(payload);
}

async function notifyDrivePiTelegram(summary) {
  if (!ADOPS_TELEGRAM_BOT_URL) return { skipped: "ADOPS_TELEGRAM_BOT_URL ausente" };
  const response = await fetch(`${ADOPS_TELEGRAM_BOT_URL}/ops/drive-pi-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPS_API_TOKEN}`,
    },
    body: JSON.stringify(summary),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.details || payload?.error || `Telegram drive-pi-event falhou: ${response.status}`);
  return payload;
}

async function notifyDrivePiStageTelegram(payload, status, extra = {}) {
  return notifyDrivePiTelegram({
    status,
    eventId: payload?.eventId,
    driveFileId: payload?.driveFileId,
    name: payload?.name,
    path: payload?.path,
    webViewLink: payload?.webViewLink,
    falsePositive: false,
    ...extra,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
}

async function runPnpm(args, options) {
  const pnpmOptions = {
    ...options,
    env: {
      ...process.env,
      ...(options?.env || {}),
      CI: "true",
      npm_config_confirm_modules_purge: "false",
      POLARS_SKIP_CPU_CHECK: "1",
    },
  };
  try {
    return await execFileAsync("pnpm", args, pnpmOptions);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return execFileAsync("corepack", ["pnpm", ...args], pnpmOptions);
  }
}

function safeProcessOutput(value, maxLength = 4000) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(-maxLength);
}

function parseWpCliJsonObject(stdout) {
  const text = String(stdout ?? "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function shellEscape(value) {
  return `'${String(value ?? "").replace(/'/g, `'\"'\"'`)}'`;
}

function mediaBasenameFromUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const pathname = new URL(value).pathname;
    return path.basename(decodeURIComponent(pathname)) || null;
  } catch {
    return path.basename(value.split("?")[0] || "") || null;
  }
}

function shouldUsePerrenguePortainerAdrotate(siteSigla) {
  return String(siteSigla || "").toUpperCase() === "PERRENGUE" && ADOPS_PERRENGUE_ADROTATE_EXEC_MODE === "portainer";
}

function requirePortainerConfig() {
  if (!PORTAINER_URL || !PORTAINER_API_KEY) {
    throw new Error("Publicação AdRotate do PERRENGUE via Portainer exige PORTAINER_URL e PORTAINER_API_KEY no runner.");
  }
  if (!Number.isInteger(ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID) || ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID <= 0) {
    throw new Error("ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID inválido para publicação AdRotate do PERRENGUE.");
  }
  if (!ADOPS_PERRENGUE_WP_CONTAINER) {
    throw new Error("ADOPS_PERRENGUE_WP_CONTAINER ausente para publicação AdRotate do PERRENGUE.");
  }
}

async function portainerRequest(method, pathname, body = undefined) {
  requirePortainerConfig();
  const response = await portainerHttpRequest(`${PORTAINER_URL}/api${pathname}`, {
    method,
    headers: {
      "X-API-Key": PORTAINER_API_KEY,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { statusCode, text } = response;
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (statusCode < 200 || statusCode >= 300) {
    const details = typeof payload === "object" && payload
      ? (payload.message || payload.details || payload.err || payload.error || JSON.stringify(payload))
      : (text || `HTTP ${statusCode}`);
    throw new Error(`Portainer API falhou em ${method} ${pathname}: ${details}`);
  }
  return payload;
}

function portainerHttpRequest(url, { method = "GET", headers = {}, body = undefined, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "http:" ? http : https;
    const request = client.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
      path: `${parsed.pathname}${parsed.search}`,
      headers,
      timeout: timeoutMs,
      ...(parsed.protocol === "https:" ? { rejectUnauthorized: !ADOPS_PERRENGUE_PORTAINER_TLS_INSECURE } : {}),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`Timeout na chamada Portainer ${method} ${parsed.pathname}`));
    });
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

async function findPortainerContainerByName(containerName) {
  const containers = await portainerRequest("GET", `/endpoints/${ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID}/docker/containers/json?all=true`);
  const match = Array.isArray(containers)
    ? containers.find((container) => Array.isArray(container.Names) && container.Names.some((name) => name.replace(/^\//, "") === containerName))
    : null;
  if (!match?.Id) {
    throw new Error(`Container WordPress do PERRENGUE não encontrado no Portainer: ${containerName}.`);
  }
  return match;
}

async function execPortainerContainerCommand(containerId, command, timeoutMs = 180000) {
  const created = await portainerRequest("POST", `/endpoints/${ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID}/docker/containers/${containerId}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ["sh", "-lc", command],
  });
  if (!created?.Id) {
    throw new Error("Portainer não retornou ID de exec para o container do PERRENGUE.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await portainerHttpRequest(`${PORTAINER_URL}/api/endpoints/${ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID}/docker/exec/${created.Id}/start`, {
      method: "POST",
      headers: {
        "X-API-Key": PORTAINER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Detach: false, Tty: true }),
      timeoutMs,
    });
    const stdout = response.text;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Portainer exec start falhou: HTTP ${response.statusCode} ${stdout.slice(0, 1000)}`);
    }
    const inspect = await portainerRequest("GET", `/endpoints/${ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID}/docker/exec/${created.Id}/json`);
    const exitCode = Number(inspect?.ExitCode ?? 0);
    if (exitCode !== 0) {
      throw new Error(`Comando no container PERRENGUE terminou com exit ${exitCode}: ${safeProcessOutput(stdout, 3000)}`);
    }
    return { stdout, stderr: "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function executePerrenguePortainerWpCliPublish({ payloadJson, apply }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const payloadBase64 = Buffer.from(payloadJson).toString("base64");
  const runnerPhp = `<?php
$wp_path = getenv('ADOPS_WP_PATH') ?: '/app/web/wp';
$payload_path = getenv('ADOPS_PAYLOAD_JSON');
$apply = getenv('ADOPS_APPLY') === '1';
if (!$payload_path || !is_readable($payload_path)) {
  throw new RuntimeException('Payload JSON ausente ou ilegivel.');
}

require_once rtrim($wp_path, '/') . '/wp-load.php';
require_once WP_CONTENT_DIR . '/plugins/adrotate/adrotate-adops.php';
if (!function_exists('adrotate_adops_publish_payload')) {
  throw new RuntimeException('Funcao adrotate_adops_publish_payload nao carregada.');
}
$payload = json_decode(file_get_contents($payload_path), true);
if (!is_array($payload)) {
  throw new RuntimeException('Payload JSON invalido.');
}
$result = adrotate_adops_publish_payload($payload, $apply);
echo wp_json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
`;
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  const command = [
    'tmp_payload="$(mktemp /tmp/adops-adrotate-publish.XXXXXX.json)"',
    'tmp_runner="$(mktemp /tmp/adops-adrotate-runner.XXXXXX.php)"',
    `printf %s ${shellEscape(payloadBase64)} | base64 -d > "$tmp_payload"`,
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(ADOPS_PERRENGUE_CONTAINER_WP_PATH)} ADOPS_PAYLOAD_JSON="$tmp_payload" ADOPS_APPLY=${apply ? "1" : "0"} ${shellEscape(ADOPS_PERRENGUE_CONTAINER_PHP_BIN)} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_payload" "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
  const result = await execPortainerContainerCommand(container.Id, command);
  return {
    ...result,
    executor: "portainer",
    containerName: ADOPS_PERRENGUE_WP_CONTAINER,
    endpointId: ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID,
    wpPath: ADOPS_PERRENGUE_CONTAINER_WP_PATH,
  };
}

function buildPerrenguePhpCommand(runnerPhp, input, mode) {
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  return [
    `tmp_runner="$(mktemp /tmp/adops-${mode}.XXXXXX.php)"`,
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(ADOPS_PERRENGUE_CONTAINER_WP_PATH)} ADOPS_ROLLBACK_INPUT=${shellEscape(input)} ${shellEscape(ADOPS_PERRENGUE_CONTAINER_PHP_BIN)} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
}

function buildPerrengueAdrotateSnapshotPhp() {
  return `<?php
$wp_path=getenv('ADOPS_WP_PATH') ?: '/app/web/wp'; $input=json_decode(base64_decode(getenv('ADOPS_ROLLBACK_INPUT') ?: ''),true);
require_once rtrim($wp_path,'/').'/wp-load.php'; global $wpdb;
$at=$wpdb->prefix.'adrotate'; $st=$wpdb->prefix.'adrotate_schedule'; $lt=$wpdb->prefix.'adrotate_linkmeta';
$iid=(int)($input['insertionId'] ?? 0); $key=sanitize_text_field($input['externalKey'] ?? '');
$ads=$wpdb->get_results($wpdb->prepare('SELECT * FROM '.$at.' WHERE adops_insertion_id=%d OR adops_external_key=%s ORDER BY id',$iid,$key),ARRAY_A);
$ids=array_map(fn($r)=>(int)$r['id'],$ads); $links=[]; $schedules=[];
if ($ids) { $sqlids=implode(',',array_map('intval',$ids)); $links=$wpdb->get_results('SELECT * FROM '.$lt.' WHERE ad IN ('.$sqlids.') ORDER BY id',ARRAY_A); $sids=array_values(array_unique(array_filter(array_map(fn($r)=>(int)($r['schedule'] ?? 0),$links)))); if ($sids) $schedules=$wpdb->get_results('SELECT * FROM '.$st.' WHERE id IN ('.implode(',',array_map('intval',$sids)).') ORDER BY id',ARRAY_A); }
echo wp_json_encode(['ads'=>$ads,'links'=>$links,'schedules'=>$schedules],JSON_UNESCAPED_SLASHES).PHP_EOL;
`;
}

function buildPerrengueAdrotateRestorePhp() {
  return `<?php
$wp_path=getenv('ADOPS_WP_PATH') ?: '/app/web/wp'; $input=json_decode(base64_decode(getenv('ADOPS_ROLLBACK_INPUT') ?: ''),true);
require_once rtrim($wp_path,'/').'/wp-load.php'; global $wpdb;
$at=$wpdb->prefix.'adrotate'; $st=$wpdb->prefix.'adrotate_schedule'; $lt=$wpdb->prefix.'adrotate_linkmeta';
$iid=(int)($input['insertionId'] ?? 0); $key=sanitize_text_field($input['externalKey'] ?? ''); $snap=$input['snapshot'] ?? [];
$must=function($result,$label){ if ($result === false) throw new RuntimeException('Falha WPDB: '.$label.'; '.$GLOBALS['wpdb']->last_error); return $result; };
foreach ([$at,$st,$lt] as $table) { $status=$wpdb->get_row($wpdb->prepare('SHOW TABLE STATUS LIKE %s',$table),ARRAY_A); if (!$status || strtoupper((string)($status['Engine'] ?? '')) !== 'INNODB') throw new RuntimeException('Rollback exige tabelas InnoDB: '.$table); }
$must($wpdb->query('START TRANSACTION'),'start transaction');
try { $current=$wpdb->get_results($wpdb->prepare('SELECT id FROM '.$at.' WHERE adops_insertion_id=%d OR adops_external_key=%s',$iid,$key),ARRAY_A); $ids=array_map(fn($r)=>(int)$r['id'],$current); $sids=[];
if ($ids) { $sqlids=implode(',',array_map('intval',$ids)); $sids=$wpdb->get_col('SELECT DISTINCT schedule FROM '.$lt.' WHERE ad IN ('.$sqlids.') AND schedule>0'); $must($wpdb->query('DELETE FROM '.$lt.' WHERE ad IN ('.$sqlids.')'),'delete current links'); $must($wpdb->query('DELETE FROM '.$at.' WHERE id IN ('.$sqlids.')'),'delete current ads'); }
foreach (($snap['schedules'] ?? []) as $row) $must($wpdb->replace($st,$row),'restore schedule'); foreach (($snap['ads'] ?? []) as $row) $must($wpdb->replace($at,$row),'restore ad'); foreach (($snap['links'] ?? []) as $row) $must($wpdb->replace($lt,$row),'restore link');
foreach ($sids as $sid) { $sid=(int)$sid; $original=array_filter(($snap['schedules'] ?? []),fn($r)=>(int)$r['id']===$sid); if ($sid>0 && !$original && !(int)$wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM '.$lt.' WHERE schedule=%d',$sid))) $must($wpdb->delete($st,['id'=>$sid]),'delete orphan schedule'); }
$must($wpdb->query('COMMIT'),'commit');
$maintenance=null; $maintenance_error=null;
try { if (function_exists('adrotate_adops_run_maintenance')) $maintenance=adrotate_adops_run_maintenance(); else $maintenance_error='adrotate_adops_run_maintenance indisponível'; } catch (Throwable $maintenance_exception) { $maintenance_error=$maintenance_exception->getMessage(); }
echo wp_json_encode(['restored'=>true,'ads'=>count($snap['ads'] ?? []),'maintenance'=>$maintenance,'maintenance_error'=>$maintenance_error]).PHP_EOL; } catch (Throwable $e) { $wpdb->query('ROLLBACK'); throw $e; }
`;
}

function normalizePerrengueAdrotateSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Snapshot AdRotate inválido.");
  const normalized = {};
  for (const key of ["ads", "links", "schedules"]) {
    if (!Array.isArray(value[key])) throw new Error(`Snapshot AdRotate inválido: ${key}.`);
    normalized[key] = value[key].map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row) || !readPositiveInteger(row.id)) throw new Error(`Snapshot AdRotate inválido: linha ${key}.`);
      return Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)));
    }).sort((left, right) => Number(left.id) - Number(right.id));
  }
  return normalized;
}

async function snapshotPerrengueAdrotate({ insertionId, externalKey }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const input = Buffer.from(JSON.stringify({ insertionId, externalKey })).toString("base64");
  const runnerPhp = buildPerrengueAdrotateSnapshotPhp();
  const execution = await execPortainerContainerCommand(container.Id, buildPerrenguePhpCommand(runnerPhp, input, "snapshot"), 120000);
  return normalizePerrengueAdrotateSnapshot(parseWpCliJsonObject(execution.stdout));
}

async function restorePerrengueAdrotate({ insertionId, externalKey, snapshot }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const expectedSnapshot = normalizePerrengueAdrotateSnapshot(snapshot);
  const input = Buffer.from(JSON.stringify({ insertionId, externalKey, snapshot: expectedSnapshot })).toString("base64");
  const runnerPhp = buildPerrengueAdrotateRestorePhp();
  const execution = await execPortainerContainerCommand(container.Id, buildPerrenguePhpCommand(runnerPhp, input, "restore"), 120000);
  const result = parseWpCliJsonObject(execution.stdout);
  if (!result?.restored) throw new Error("Rollback AdRotate não confirmou restauração.");
  const readback = await snapshotPerrengueAdrotate({ insertionId, externalKey });
  if (JSON.stringify(readback) !== JSON.stringify(expectedSnapshot)) throw new Error("Rollback AdRotate divergiu no readback pós-restauração.");
  return { ...result, readbackVerified: true };
}

function isRestrictedKvm8GatewaySite(site) {
  return String(site?.sshUser || "") === "cod5adops" && String(site?.sshHost || "") === "93.127.210.71";
}

function assertSqlIdentifier(value, label) {
  const identifier = String(value || "");
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error(`${label} SQL inválido.`);
  return identifier;
}

async function executeRestrictedWpDbQuery({ site, siteSigla, sql, skipColumnNames = true }) {
  if (!isRestrictedKvm8GatewaySite(site)) throw new Error(`Portal ${siteSigla} não usa o gateway DB restrito.`);
  const sshKeyPath = sshKeyPathForSite(siteSigla);
  const remoteCommand = [
    shellEscape(site.phpBin ?? "php"),
    shellEscape(site.wpCliPath ?? "/home/cod5adops/wp-cli.phar"),
    "--allow-root",
    `--path=${shellEscape(site.wpPath)}`,
    "db",
    "query",
    shellEscape(sql),
    "--batch",
    "--quiet",
    ...(skipColumnNames ? ["--skip-column-names"] : []),
  ].join(" ");
  if (remoteCommand.length > 95000) throw new Error("Query de rollback excede o limite seguro do gateway restrito.");
  return execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=/tmp/adops-known-hosts",
    ...(sshKeyPath ? ["-i", sshKeyPath] : []),
    "-p", String(site.sshPort),
    `${site.sshUser}@${site.sshHost}`,
    remoteCommand,
  ], { maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
}

function parseRestrictedDbRows(stdout, columns) {
  const safeColumns = columns.map((column) => assertSqlIdentifier(column, "Coluna"));
  const lines = String(stdout || "").split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line) => {
    const values = line.split("\t");
    if (values.length !== safeColumns.length) throw new Error("Snapshot DB restrito retornou quantidade inesperada de colunas.");
    return Object.fromEntries(safeColumns.map((column, index) => [
      column,
      values[index] === "~" ? null : decodeRestrictedHexUtf8(values[index]),
    ]));
  });
}

function decodeRestrictedHexUtf8(value) {
  const hex = String(value ?? "");
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error("Snapshot DB restrito retornou HEX inválido.");
  const bytes = Buffer.from(hex, "hex");
  const decoded = bytes.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(bytes)) {
    throw new Error("Snapshot DB restrito contém bytes não UTF-8; rollback foi bloqueado.");
  }
  return decoded;
}

async function restrictedTableColumns({ site, siteSigla, table }) {
  const safeTable = assertSqlIdentifier(table, "Tabela");
  const result = await executeRestrictedWpDbQuery({ site, siteSigla, sql: `SHOW COLUMNS FROM \`${safeTable}\`` });
  const columns = String(result.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => line.split("\t")[0]);
  if (!columns.length) throw new Error(`Tabela ${safeTable} não retornou colunas.`);
  return columns.map((column) => assertSqlIdentifier(column, "Coluna"));
}

async function restrictedSelectRows({ site, siteSigla, table, columns, whereSql }) {
  const safeTable = assertSqlIdentifier(table, "Tabela");
  const projection = restrictedProjectionSql(columns);
  const sql = `SELECT CONCAT_WS('\\t',${projection}) FROM \`${safeTable}\` WHERE ${whereSql}`;
  const result = await executeRestrictedWpDbQuery({ site, siteSigla, sql });
  return parseRestrictedDbRows(result.stdout, columns);
}

function restrictedProjectionSql(columns) {
  return columns.map((column) => `IF(\`${assertSqlIdentifier(column, "Coluna")}\` IS NULL,${restrictedBinaryLiteral("~")},HEX(CAST(\`${column}\` AS BINARY)))`).join(",");
}

function restrictedBinaryLiteral(value) {
  const hex = Buffer.from(String(value ?? ""), "utf8").toString("hex");
  return hex ? `0x${hex}` : "LEFT(0x00,0)";
}

function parseRestrictedAdrotateBaseTable(stdout) {
  const matches = String(stdout || "").split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z0-9_]+_adrotate$/.test(value));
  if (matches.length !== 1) throw new Error(`Portal restrito precisa de uma única tabela base AdRotate; encontradas ${matches.length}.`);
  return assertSqlIdentifier(matches[0], "Tabela AdRotate");
}

async function resolveRestrictedAdrotateTables({ site, siteSigla }) {
  const result = await executeRestrictedWpDbQuery({ site, siteSigla, sql: "SHOW TABLES LIKE '%adrotate'" });
  const ads = parseRestrictedAdrotateBaseTable(result.stdout);
  const prefix = ads.slice(0, -"adrotate".length);
  return {
    ads,
    links: assertSqlIdentifier(`${prefix}adrotate_linkmeta`, "Tabela linkmeta"),
    schedules: assertSqlIdentifier(`${prefix}adrotate_schedule`, "Tabela schedule"),
  };
}

async function validateRestrictedAdrotateEngines({ site, siteSigla, tables }) {
  const names = Object.values(tables).map((table) => `'${assertSqlIdentifier(table, "Tabela")}'`).join(",");
  const result = await executeRestrictedWpDbQuery({
    site,
    siteSigla,
    sql: `SELECT table_name,engine FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${names}) ORDER BY table_name`,
  });
  const rows = String(result.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
  if (rows.length !== 3 || rows.some((row) => row.length < 2 || String(row[1]).toUpperCase() !== "INNODB")) {
    throw new Error("Rollback restrito exige exatamente as três tabelas AdRotate em InnoDB.");
  }
  return true;
}

function buildRestrictedAdrotateSnapshotSql({ tables, columns, insertionId, externalKey }) {
  const safeInsertionId = readPositiveInteger(insertionId);
  if (!safeInsertionId) throw new Error("Snapshot DB restrito exige insertionId positivo.");
  const safeTables = Object.fromEntries(Object.entries(tables).map(([key, table]) => [key, assertSqlIdentifier(table, "Tabela")]));
  const externalKeyLiteral = restrictedBinaryLiteral(externalKey);
  const adPredicate = `adops_insertion_id=${safeInsertionId} OR BINARY adops_external_key=${externalKeyLiteral}`;
  const adIds = `SELECT id FROM \`${safeTables.ads}\` WHERE ${adPredicate}`;
  const scheduleIds = `SELECT DISTINCT schedule FROM \`${safeTables.links}\` WHERE ad IN (${adIds}) AND schedule>0`;
  return [
    "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ",
    "START TRANSACTION WITH CONSISTENT SNAPSHOT",
    `SELECT ${restrictedBinaryLiteral("META")},${restrictedBinaryLiteral("ADS")},COUNT(*) FROM \`${safeTables.ads}\` WHERE ${adPredicate}`,
    `SELECT ${restrictedBinaryLiteral("ADS")},${restrictedProjectionSql(columns.ads)} FROM \`${safeTables.ads}\` WHERE ${adPredicate} ORDER BY id`,
    `SELECT ${restrictedBinaryLiteral("META")},${restrictedBinaryLiteral("LINKS")},COUNT(*) FROM \`${safeTables.links}\` WHERE ad IN (${adIds})`,
    `SELECT ${restrictedBinaryLiteral("LINKS")},${restrictedProjectionSql(columns.links)} FROM \`${safeTables.links}\` WHERE ad IN (${adIds}) ORDER BY id`,
    `SELECT ${restrictedBinaryLiteral("META")},${restrictedBinaryLiteral("SCHEDULES")},COUNT(*) FROM \`${safeTables.schedules}\` WHERE id IN (${scheduleIds})`,
    `SELECT ${restrictedBinaryLiteral("SCHEDULES")},${restrictedProjectionSql(columns.schedules)} FROM \`${safeTables.schedules}\` WHERE id IN (${scheduleIds}) ORDER BY id`,
    "COMMIT",
  ].join(";");
}

function parseRestrictedAdrotateSnapshotOutput(stdout, columns) {
  const datasets = { ADS: [], LINKS: [], SCHEDULES: [] };
  const expectedCounts = {};
  for (const line of String(stdout || "").split(/\r?\n/).filter(Boolean)) {
    const [dataset, ...values] = line.split("\t");
    if (dataset === "META") {
      const [target, rawCount] = values;
      if (values.length !== 2 || !Object.hasOwn(datasets, target) || Object.hasOwn(expectedCounts, target) || !/^\d+$/.test(rawCount || "")) {
        throw new Error("Snapshot DB restrito retornou metadados inválidos ou duplicados.");
      }
      expectedCounts[target] = Number(rawCount);
      continue;
    }
    if (!Object.hasOwn(datasets, dataset)) throw new Error(`Snapshot DB restrito retornou dataset inesperado: ${dataset}.`);
    const safeColumns = columns[dataset.toLowerCase()];
    if (!Array.isArray(safeColumns) || values.length !== safeColumns.length) {
      throw new Error(`Snapshot DB restrito retornou colunas inválidas para ${dataset}.`);
    }
    datasets[dataset].push(Object.fromEntries(safeColumns.map((column, index) => [
      assertSqlIdentifier(column, "Coluna"),
      values[index] === "~" ? null : decodeRestrictedHexUtf8(values[index]),
    ])));
  }
  for (const dataset of Object.keys(datasets)) {
    if (!Object.hasOwn(expectedCounts, dataset) || datasets[dataset].length !== expectedCounts[dataset]) {
      const expected = Object.hasOwn(expectedCounts, dataset) ? expectedCounts[dataset] : "missing";
      throw new Error(`Snapshot DB restrito incompleto para ${dataset}: esperado=${expected} recebido=${datasets[dataset].length}.`);
    }
  }
  return normalizePerrengueAdrotateSnapshot({
    ads: datasets.ADS,
    links: datasets.LINKS,
    schedules: datasets.SCHEDULES,
  });
}

function summarizeRestrictedSnapshotOutput(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return "empty";
  return lines.map((line) => {
    const [dataset, target, count] = line.split("\t");
    return dataset === "META" ? `META:${target}:${count}` : String(dataset || "unknown").slice(0, 24);
  }).join(",").slice(0, 500);
}

async function snapshotRestrictedAdrotate({ site, siteSigla, insertionId, externalKey }) {
  const tables = await resolveRestrictedAdrotateTables({ site, siteSigla });
  await validateRestrictedAdrotateEngines({ site, siteSigla, tables });
  const columns = {
    ads: await restrictedTableColumns({ site, siteSigla, table: tables.ads }),
    links: await restrictedTableColumns({ site, siteSigla, table: tables.links }),
    schedules: await restrictedTableColumns({ site, siteSigla, table: tables.schedules }),
  };
  const sql = buildRestrictedAdrotateSnapshotSql({ tables, columns, insertionId, externalKey });
  const result = await executeRestrictedWpDbQuery({ site, siteSigla, sql });
  try {
    return parseRestrictedAdrotateSnapshotOutput(result.stdout, columns);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} saída=${summarizeRestrictedSnapshotOutput(result.stdout)}`);
  }
}

function restrictedReplaceSql(table, rows) {
  const safeTable = assertSqlIdentifier(table, "Tabela");
  return rows.map((row) => {
    const columns = Object.keys(row).map((column) => assertSqlIdentifier(column, "Coluna"));
    const values = columns.map((column) => row[column] == null
      ? "NULL"
      : `FROM_BASE64(${restrictedBinaryLiteral(Buffer.from(String(row[column]), "utf8").toString("base64"))})`);
    return `REPLACE INTO \`${safeTable}\` (${columns.map((column) => `\`${column}\``).join(",")}) VALUES (${values.join(",")})`;
  }).join(";");
}

async function restoreRestrictedAdrotate({ site, siteSigla, insertionId, externalKey, snapshot }) {
  const expectedSnapshot = normalizePerrengueAdrotateSnapshot(snapshot);
  const tables = await resolveRestrictedAdrotateTables({ site, siteSigla });
  await validateRestrictedAdrotateEngines({ site, siteSigla, tables });
  const externalKeyLiteral = restrictedBinaryLiteral(externalKey);
  const statements = [
    "SET autocommit=0",
    `LOCK TABLES \`${tables.ads}\` WRITE, \`${tables.links}\` WRITE, \`${tables.schedules}\` WRITE`,
    "CREATE TEMPORARY TABLE cod5_adops_current_ads (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=MEMORY",
    "CREATE TEMPORARY TABLE cod5_adops_current_schedules (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=MEMORY",
    `INSERT IGNORE INTO cod5_adops_current_ads (id) SELECT id FROM \`${tables.ads}\` WHERE adops_insertion_id=${Number(insertionId)} OR BINARY adops_external_key=${externalKeyLiteral}`,
    `INSERT IGNORE INTO cod5_adops_current_schedules (id) SELECT schedule FROM \`${tables.links}\` WHERE ad IN (SELECT id FROM cod5_adops_current_ads) AND schedule>0`,
    `DELETE FROM \`${tables.links}\` WHERE ad IN (SELECT id FROM cod5_adops_current_ads)`,
    `DELETE FROM \`${tables.ads}\` WHERE id IN (SELECT id FROM cod5_adops_current_ads)`,
  ];
  for (const [table, rows] of [[tables.schedules, expectedSnapshot.schedules], [tables.ads, expectedSnapshot.ads], [tables.links, expectedSnapshot.links]]) {
    const replaceSql = restrictedReplaceSql(table, rows);
    if (replaceSql) statements.push(replaceSql);
  }
  const expectedScheduleIds = expectedSnapshot.schedules.map((row) => readPositiveInteger(row.id)).filter(Boolean);
  statements.push(`DELETE FROM \`${tables.schedules}\` WHERE id IN (SELECT id FROM cod5_adops_current_schedules)${expectedScheduleIds.length ? ` AND id NOT IN (${expectedScheduleIds.join(",")})` : ""} AND id NOT IN (SELECT schedule FROM \`${tables.links}\` WHERE schedule>0)`);
  statements.push("COMMIT", "UNLOCK TABLES", "SET autocommit=1");
  await executeRestrictedWpDbQuery({ site, siteSigla, sql: statements.join(";") });
  const readback = await snapshotRestrictedAdrotate({ site, siteSigla, insertionId, externalKey });
  if (JSON.stringify(readback) !== JSON.stringify(expectedSnapshot)) throw new Error("Rollback AdRotate restrito divergiu no readback pós-restauração.");
  return { restored: true, readbackVerified: true, transport: "restricted_wp_db_query" };
}

async function executeSiteRollbackPhp({ site, siteSigla, runnerPhp, input, mode }) {
  if (shouldUsePerrenguePortainerAdrotate(siteSigla)) {
    const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
    return execPortainerContainerCommand(container.Id, buildPerrenguePhpCommand(runnerPhp, input, mode), 120000);
  }
  if (!site?.sshHost || !site?.sshPort || !site?.sshUser || !site?.wpPath) throw new Error(`Portal ${siteSigla} sem transporte de rollback AdRotate.`);
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  const remoteCommand = [
    `tmp_runner="$(mktemp /tmp/adops-${mode}.XXXXXX.php)"`,
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(site.wpPath)} ADOPS_ROLLBACK_INPUT=${shellEscape(input)} ${shellEscape(site.phpBin ?? "php")} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
  const sshKeyPath = sshKeyPathForSite(siteSigla);
  return execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=/tmp/adops-known-hosts",
    ...(sshKeyPath ? ["-i", sshKeyPath] : []),
    "-p", String(site.sshPort),
    `${site.sshUser}@${site.sshHost}`,
    remoteCommand,
  ], { maxBuffer: 2 * 1024 * 1024, timeout: 120000 });
}

async function snapshotSiteAdrotate({ site, siteSigla, insertionId, externalKey }) {
  if (isRestrictedKvm8GatewaySite(site)) return snapshotRestrictedAdrotate({ site, siteSigla, insertionId, externalKey });
  const input = Buffer.from(JSON.stringify({ insertionId, externalKey })).toString("base64");
  const execution = await executeSiteRollbackPhp({ site, siteSigla, runnerPhp: buildPerrengueAdrotateSnapshotPhp(), input, mode: "snapshot" });
  return normalizePerrengueAdrotateSnapshot(parseWpCliJsonObject(execution.stdout));
}

async function restoreSiteAdrotate({ site, siteSigla, insertionId, externalKey, snapshot }) {
  if (isRestrictedKvm8GatewaySite(site)) return restoreRestrictedAdrotate({ site, siteSigla, insertionId, externalKey, snapshot });
  const expectedSnapshot = normalizePerrengueAdrotateSnapshot(snapshot);
  const input = Buffer.from(JSON.stringify({ insertionId, externalKey, snapshot: expectedSnapshot })).toString("base64");
  const execution = await executeSiteRollbackPhp({ site, siteSigla, runnerPhp: buildPerrengueAdrotateRestorePhp(), input, mode: "restore" });
  const result = parseWpCliJsonObject(execution.stdout);
  if (!result?.restored) throw new Error("Rollback AdRotate não confirmou restauração.");
  const readback = await snapshotSiteAdrotate({ site, siteSigla, insertionId, externalKey });
  if (JSON.stringify(readback) !== JSON.stringify(expectedSnapshot)) throw new Error("Rollback AdRotate divergiu no readback pós-restauração.");
  return { ...result, readbackVerified: true };
}

async function importPerrengueMediaFromUrl({ sourceUrl, filename, mediaKey }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const input = Buffer.from(JSON.stringify({ sourceUrl, filename, mediaKey })).toString("base64");
  const runnerPhp = `<?php
$wp_path = getenv('ADOPS_WP_PATH') ?: '/app/web/wp';
$input = json_decode(base64_decode(getenv('ADOPS_MEDIA_INPUT') ?: ''), true);
if (!is_array($input) || empty($input['sourceUrl']) || empty($input['filename']) || empty($input['mediaKey'])) throw new RuntimeException('Payload de midia invalido.');
require_once rtrim($wp_path, '/') . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';
$existing = get_posts(['post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_adops_media_key', 'meta_value' => sanitize_text_field($input['mediaKey'])]);
if (!empty($existing[0])) {
  echo wp_json_encode(['attachment_id' => (int) $existing[0], 'url' => wp_get_attachment_url((int) $existing[0]), 'reused' => true]) . PHP_EOL;
  exit(0);
}
$tmp = download_url(esc_url_raw($input['sourceUrl']), 120);
if (is_wp_error($tmp)) throw new RuntimeException($tmp->get_error_message());
$attachment_id = media_handle_sideload(['name' => sanitize_file_name($input['filename']), 'tmp_name' => $tmp], 0, 'AdOps Drive PI');
if (is_wp_error($attachment_id)) { @unlink($tmp); throw new RuntimeException($attachment_id->get_error_message()); }
update_post_meta($attachment_id, '_adops_media_key', sanitize_text_field($input['mediaKey']));
update_post_meta($attachment_id, '_adops_source_url', esc_url_raw($input['sourceUrl']));
echo wp_json_encode(['attachment_id' => (int) $attachment_id, 'url' => wp_get_attachment_url($attachment_id), 'reused' => false]) . PHP_EOL;
`;
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  const command = [
    'tmp_runner="$(mktemp /tmp/adops-media-import.XXXXXX.php)"',
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(ADOPS_PERRENGUE_CONTAINER_WP_PATH)} ADOPS_MEDIA_INPUT=${shellEscape(input)} ${shellEscape(ADOPS_PERRENGUE_CONTAINER_PHP_BIN)} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
  const execution = await execPortainerContainerCommand(container.Id, command, 300000);
  const result = parseWpCliJsonObject(execution.stdout);
  if (!result?.attachment_id || !result?.url) throw new Error(`Importação WordPress não retornou attachment/url: ${safeProcessOutput(execution.stdout)}`);
  const validation = await fetch(result.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!validation.ok) throw new Error(`URL importada no WordPress não respondeu 200: HTTP ${validation.status}`);
  return { ...result, executor: "portainer", containerName: ADOPS_PERRENGUE_WP_CONTAINER };
}

async function validatePerrengueHeadlessRebuildReadiness() {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const runnerPhp = `<?php
$wp_path = getenv('ADOPS_WP_PATH') ?: '/app/web/wp';
require_once rtrim($wp_path, '/') . '/wp-load.php';
if (!function_exists('cod5_static_rebuild_webhook_url') || !function_exists('cod5_static_rebuild_webhook_secret')) throw new RuntimeException('MU-plugin de rebuild headless nao carregado.');
$url = cod5_static_rebuild_webhook_url();
$secret = cod5_static_rebuild_webhook_secret();
if ($url === '' || $secret === '') throw new RuntimeException('Webhook/secret de rebuild headless ausente.');
$parts = wp_parse_url($url);
if (empty($parts['scheme']) || empty($parts['host'])) throw new RuntimeException('URL do webhook headless invalida.');
$health_url = $parts['scheme'] . '://' . $parts['host'] . (!empty($parts['port']) ? ':' . (int) $parts['port'] : '') . '/health';
$response = wp_remote_get($health_url, ['timeout' => 3, 'redirection' => 0]);
if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) throw new RuntimeException('Health do rebuild headless indisponivel.');
echo wp_json_encode(['ready' => true, 'health_status' => 200]) . PHP_EOL;
`;
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  const command = [
    'tmp_runner="$(mktemp /tmp/adops-headless-readiness.XXXXXX.php)"',
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(ADOPS_PERRENGUE_CONTAINER_WP_PATH)} ${shellEscape(ADOPS_PERRENGUE_CONTAINER_PHP_BIN)} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
  const execution = await execPortainerContainerCommand(container.Id, command, 30000);
  const result = parseWpCliJsonObject(execution.stdout);
  if (!result?.ready) throw new Error("Readiness do rebuild headless não foi confirmada.");
  return result;
}

function buildPerrengueRebuildTriggerReason({ insertionId, operation, operationId }) {
  const cod5_insertion_id = readPositiveInteger(insertionId);
  if (!cod5_insertion_id) throw new Error("Trigger de rebuild exige insertionId positivo.");
  const cod5_operation = operation === "rollback" ? "rollback" : operation === "publish" ? "publish" : null;
  if (!cod5_operation) throw new Error("Trigger de rebuild exige operação publish ou rollback.");
  const cod5_operation_id = String(operationId || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!cod5_operation_id) throw new Error("Trigger de rebuild exige operationId rastreável.");
  return `adops_adrotate_${cod5_operation}_${cod5_insertion_id}_${cod5_operation_id}`;
}

function evaluatePerrengueRebuildHealth(health, expectedReason) {
  const candidates = [
    health?.last && typeof health.last === "object" ? health.last : null,
    ...(Array.isArray(health?.recentRuns) ? health.recentRuns : []),
  ].filter(Boolean);
  const match = candidates.find((item) => String(item?.trigger?.reason || "") === String(expectedReason || "")) || null;
  const matched = Boolean(match);
  const status = matched ? String(match?.status || "").toLowerCase() || null : null;
  const terminalFailure = new Set(["failed", "error", "cancelled", "canceled"]);
  const terminalSuccess = new Set(["ok", "completed", "complete", "success", "succeeded"]);
  return {
    matched,
    completed: matched && terminalSuccess.has(status),
    failed: matched && terminalFailure.has(status),
    status,
  };
}

function normalizePerrengueRebuildHealthPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const last = source.last && typeof source.last === "object"
    ? source.last
    : source.lastRun && typeof source.lastRun === "object"
      ? source.lastRun
      : {};
  const recentRuns = Array.isArray(source.recentRuns)
    ? source.recentRuns
    : Array.isArray(source.runs)
      ? source.runs
      : Array.isArray(source.recent)
        ? source.recent
        : [];
  return {
    available: source.available !== false,
    running: Boolean(source.running),
    queued: Boolean(source.queued),
    last,
    recentRuns,
    lastStatus: last?.status ?? null,
    lastStartedAt: last?.startedAt ?? null,
    lastFinishedAt: last?.finishedAt ?? null,
  };
}

async function executePerrengueHeadlessRebuild({ insertionId, adId, mediaBasename, purgeCache, operation = "publish" }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const triggerReason = buildPerrengueRebuildTriggerReason({
    insertionId,
    operation,
    operationId: crypto.randomUUID(),
  });
  const input = Buffer.from(JSON.stringify({ insertionId, adId, mediaBasename, purgeCache, triggerReason })).toString("base64");
  const timeoutSeconds = Math.max(60, Math.ceil(ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS / 1000));
  const pollMicroseconds = Math.max(1000000, ADOPS_PERRENGUE_REBUILD_POLL_INTERVAL_MS * 1000);
  const runnerPhp = `<?php
$wp_path = getenv('ADOPS_WP_PATH') ?: '/app/web/wp';
$input = json_decode(base64_decode(getenv('ADOPS_REBUILD_INPUT') ?: ''), true);
require_once rtrim($wp_path, '/') . '/wp-load.php';
if (!function_exists('cod5_static_rebuild_webhook_url') || !function_exists('cod5_static_rebuild_webhook_secret')) throw new RuntimeException('MU-plugin de rebuild headless nao carregado.');
$url = cod5_static_rebuild_webhook_url();
$secret = cod5_static_rebuild_webhook_secret();
if ($url === '' || $secret === '') throw new RuntimeException('Webhook/secret de rebuild headless ausente.');
$read_health = static function () use ($url) {
  $parts = wp_parse_url($url);
  if (empty($parts['scheme']) || empty($parts['host'])) return ['available' => false];
  $health_url = $parts['scheme'] . '://' . $parts['host'] . (!empty($parts['port']) ? ':' . (int) $parts['port'] : '') . '/health';
  $response = wp_remote_get($health_url, ['timeout' => 3, 'redirection' => 0]);
  if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) return ['available' => false];
  $body = json_decode((string) wp_remote_retrieve_body($response), true);
  if (!is_array($body)) return ['available' => false];
$last = isset($body['last']) && is_array($body['last']) ? $body['last'] : (isset($body['lastRun']) && is_array($body['lastRun']) ? $body['lastRun'] : []);
$recent_runs = isset($body['recentRuns']) && is_array($body['recentRuns']) ? $body['recentRuns'] : (isset($body['runs']) && is_array($body['runs']) ? $body['runs'] : (isset($body['recent']) && is_array($body['recent']) ? $body['recent'] : []));
return ['available' => true, 'running' => !empty($body['running']), 'queued' => !empty($body['queued']), 'last' => $last, 'recentRuns' => $recent_runs, 'lastStatus' => $last['status'] ?? null, 'lastStartedAt' => $last['startedAt'] ?? null, 'lastFinishedAt' => $last['finishedAt'] ?? null];
};
$insertion_id = (int) ($input['insertionId'] ?? 0);
$trigger_reason = (string) ($input['triggerReason'] ?? '');
if ($trigger_reason === '') throw new RuntimeException('Trigger único do rebuild ausente.');
$payload = ['reason' => $trigger_reason, 'status' => 'publish', 'priority' => true, 'insertion_id' => $insertion_id, 'ad_id' => (int) ($input['adId'] ?? 0), 'media_basename' => sanitize_file_name((string) ($input['mediaBasename'] ?? '')), 'purge_routes' => !empty($input['purgeCache']) ? ['/', '/index.html', '/cod5-static-export.json'] : []];
$response = wp_remote_post($url, ['timeout' => 10, 'blocking' => true, 'headers' => ['content-type' => 'application/json', 'x-cod5-webhook-secret' => $secret], 'body' => wp_json_encode($payload)]);
if (is_wp_error($response)) throw new RuntimeException($response->get_error_message());
$code = (int) wp_remote_retrieve_response_code($response);
if ($code < 200 || $code >= 300) throw new RuntimeException('Webhook rejeitou rebuild com HTTP ' . $code);
$deadline = time() + ${timeoutSeconds};
while (time() < $deadline) {
  usleep(${pollMicroseconds});
  $health = $read_health();
  $candidates = array_merge([isset($health['last']) && is_array($health['last']) ? $health['last'] : []], isset($health['recentRuns']) && is_array($health['recentRuns']) ? $health['recentRuns'] : []);
  $matched_run = null;
  foreach ($candidates as $candidate) {
    $candidate_trigger = isset($candidate['trigger']) && is_array($candidate['trigger']) ? $candidate['trigger'] : [];
    if ((string) ($candidate_trigger['reason'] ?? '') === $trigger_reason) { $matched_run = $candidate; break; }
  }
  $matched = is_array($matched_run);
  $last_status = $matched ? strtolower((string) ($matched_run['status'] ?? '')) : '';
  if ($matched && in_array($last_status, ['ok', 'completed', 'complete', 'success', 'succeeded'], true)) { echo wp_json_encode(['accepted' => true, 'completed' => true, 'triggerReason' => $trigger_reason, 'health' => $health]) . PHP_EOL; exit(0); }
  $terminal_failure = in_array($last_status, ['failed', 'error', 'cancelled', 'canceled'], true);
  if ($matched && $terminal_failure) throw new RuntimeException('Rebuild ' . $trigger_reason . ' terminou com status ' . $last_status);
}
throw new RuntimeException('Timeout aguardando rebuild headless concluir para ' . $trigger_reason . '.');
`;
  const runnerBase64 = Buffer.from(runnerPhp).toString("base64");
  const command = [
    'tmp_runner="$(mktemp /tmp/adops-headless-rebuild.XXXXXX.php)"',
    `printf %s ${shellEscape(runnerBase64)} | base64 -d > "$tmp_runner"`,
    `ADOPS_WP_PATH=${shellEscape(ADOPS_PERRENGUE_CONTAINER_WP_PATH)} ADOPS_REBUILD_INPUT=${shellEscape(input)} ${shellEscape(ADOPS_PERRENGUE_CONTAINER_PHP_BIN)} "$tmp_runner"; rc=$?`,
    'rm -f "$tmp_runner"',
    "exit $rc",
  ].join(" && ");
  const execution = await execPortainerContainerCommand(container.Id, command, ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS + 30000);
  const result = parseWpCliJsonObject(execution.stdout);
  if (!result?.completed) throw new Error(`Rebuild headless não confirmou conclusão: ${safeProcessOutput(execution.stdout)}`);
  return { ...result, triggerReason };
}

function todayInCuiaba() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function buildAdrotatePublishTitle(insertion, campaign) {
  const campaignName = firstNonEmptyString(
    insertion.campanhaName,
    insertion.campaignName,
    campaign?.nome,
    insertion.campanha?.nome,
    insertion.campaign?.nome,
    "Campanha AdOps",
  );
  const siteSigla = firstNonEmptyString(insertion.siteSigla, insertion.site?.sigla);
  const format = firstNonEmptyString(insertion.localFormatoNormalizado, insertion.localFormato);
  return [siteSigla, campaignName, format].filter(Boolean).join(" - ");
}

function destinationUrlFromObservations(value) {
  const match = String(value || "").match(/Link destino informado[^:]*:\s*(https?:\/\/\S+)/i);
  return match?.[1] ? trimUrlPunctuation(match[1]) : null;
}

function buildAdrotatePublishPayload({ insertion, campaign, site, checklist, targetDate, replaceExisting, purgeCache, generateEvidence, identityMode, destinationOverride }) {
  const groupId = readPositiveInteger(checklist?.expectedSelectors?.groupId);
  const mediaUrl = firstNonEmptyString(
    checklist?.expectedMedia?.mediaUrl,
    insertion.mediaUrl,
    insertion.midiaUrl,
    insertion.media?.url,
  );
  const campaignId = readPositiveInteger(
    insertion.campanhaId ?? insertion.campaignId ?? insertion.campanha?.id ?? insertion.campaign?.id ?? campaign?.id,
  );
  const piCodigo = firstNonEmptyString(
    insertion.piCodigo,
    insertion.campanha?.piCodigo,
    insertion.campaign?.piCodigo,
    insertion.campanhaPiCodigo,
    insertion.campaignPiCodigo,
    campaign?.piCodigo,
  );
  const linkUrl = destinationOverride !== undefined
    ? destinationOverride
    : firstNonEmptyString(
        insertion.linkUrl,
        insertion.urlDestino,
        insertion.destinationUrl,
        insertion.destinoUrl,
        insertion.campanha?.linkUrl,
        insertion.campaign?.linkUrl,
        campaign?.linkUrl,
        campaign?.urlDestino,
        destinationUrlFromObservations(insertion.observacoes),
      );
  if (!groupId) throw new Error(`Checklist da inserção ${insertion.id} não resolveu groupId.`);
  if (!mediaUrl) throw new Error(`Inserção ${insertion.id} sem mediaUrl resolvida.`);
  if (!campaignId) throw new Error(`Inserção ${insertion.id} sem campanha vinculada.`);
  const siteSigla = firstNonEmptyString(site?.sigla, insertion.siteSigla, insertion.site?.sigla);
  const externalKey = siteSigla ? `ADOPS-${siteSigla}-${insertion.id}` : `ADOPS-${insertion.id}`;

  return {
    insertion_id: insertion.id,
    campaign_id: campaignId,
    pi_code: identityMode === "operational_identity" ? null : piCodigo,
    external_key: externalKey,
    title: buildAdrotatePublishTitle(insertion, campaign),
    group_id: groupId,
    media_url: mediaUrl,
    media_basename: mediaBasenameFromUrl(mediaUrl),
    link_url: linkUrl,
    period_start: insertion.periodoInicio ?? null,
    period_end: insertion.periodoFim ?? null,
    local_format: insertion.localFormatoNormalizado ?? insertion.localFormato ?? null,
    page: checklist?.resolvedRule?.page ?? null,
    slot_selector: checklist?.expectedSelectors?.slotSelector ?? null,
    context_selector: checklist?.expectedSelectors?.contextSelector ?? null,
    target_date: targetDate,
    site_sigla: siteSigla,
    replace_existing: replaceExisting,
    purge_cache: purgeCache,
    generate_evidence: generateEvidence,
  };
}

function readPositiveInteger(value) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function compactAdrotateRelation(relation) {
  if (!relation || typeof relation !== "object") return null;
  const exactLiveMatches = Array.isArray(relation.exactLiveMatches) ? relation.exactLiveMatches : [];
  const historicalAdminMatches = Array.isArray(relation.historicalAdminMatches) ? relation.historicalAdminMatches : [];
  return {
    plannedSelf: relation.plannedSelf ?? null,
    exactLiveMatches: exactLiveMatches.map((item) => ({
      adId: item?.adId ?? item?.id ?? null,
      groupId: item?.groupId ?? item?.group_id ?? null,
      title: item?.title ?? null,
    })),
    historicalAdminMatches: historicalAdminMatches.map((item) => ({
      adId: item?.adId ?? item?.id ?? null,
      groupId: item?.groupId ?? item?.group_id ?? null,
      title: item?.title ?? null,
      adopsInsertionId: item?.adopsInsertionId ?? null,
      adopsExternalKey: item?.adopsExternalKey ?? null,
      adopsMediaBasename: item?.adopsMediaBasename ?? null,
    })),
  };
}

function isAdrotatePublicationConfirmed({ activeToday, relationAfter, adId, groupId, insertionId, externalKey, publicHtmlOk }) {
  if (publicHtmlOk === true) return true;
  const live = Array.isArray(relationAfter?.exactLiveMatches) ? relationAfter.exactLiveMatches : [];
  if (live.some((item) => Number(item?.adId) === Number(adId) && Number(item?.groupId) === Number(groupId))) return true;
  if (activeToday) return false;
  const historical = Array.isArray(relationAfter?.historicalAdminMatches) ? relationAfter.historicalAdminMatches : [];
  return historical.some((item) => (
    Number(item?.adId) === Number(adId)
    && Number(item?.groupId) === Number(groupId)
    && (Number(item?.adopsInsertionId) === Number(insertionId) || String(item?.adopsExternalKey || "") === String(externalKey || ""))
  ));
}

function sitePublicHomeUrl(site) {
  const domain = firstNonEmptyString(site?.siteUrl, site?.domain, site?.dominio, site?.url);
  if (!domain) return null;
  if (/^https?:\/\//i.test(domain)) return new URL("/", domain).toString();
  return `https://${domain.replace(/^\/+|\/+$/g, "")}/`;
}

function extractSameOriginArticleCandidates(homeUrl, html, limit = 12) {
  const home = new URL(homeUrl);
  const ignoredPrefixes = [
    "/blog/", "/categoria/", "/category/", "/tag/", "/author/", "/busca/",
    "/midia-kit/", "/quem-somos/", "/fale-conosco/", "/politica-de-privacidade/",
    "/cod5-status/", "/feed/", "/comments/", "/wp/", "/wp-json/", "/assets/",
  ];
  const urls = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/\bhref=["']([^"'#]+)["']/gi)) {
    let candidate;
    try {
      candidate = new URL(match[1], home);
    } catch {
      continue;
    }
    if (candidate.origin !== home.origin || candidate.pathname === "/") continue;
    if (ignoredPrefixes.some((prefix) => candidate.pathname.startsWith(prefix))) continue;
    if (!/^\/[a-z0-9][a-z0-9-]+\/$/i.test(candidate.pathname)) continue;
    candidate.search = "";
    candidate.hash = "";
    const normalized = candidate.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= limit) break;
  }
  return urls;
}

async function validatePublishedAdHtml({ site, insertionId, adId, mediaBasename, page }) {
  const homeUrl = sitePublicHomeUrl(site);
  if (!homeUrl) return { ok: false, url: null, error: "site_public_url_missing" };
  const needsArticle = String(page || "").toLowerCase() === "article";
  let lastResult = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const homeAttemptUrl = new URL(homeUrl);
    homeAttemptUrl.searchParams.set("cod5_adops_verify", `${insertionId}-${attempt}-${Date.now()}`);
    const homeResponse = await fetch(homeAttemptUrl, {
      redirect: "follow",
      headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
      signal: AbortSignal.timeout(30000),
    });
    const homeHtml = await homeResponse.text();
    const validationUrls = needsArticle
      ? [
          ...extractSameOriginArticleCandidates(homeUrl, homeHtml),
          firstNonEmptyString(site?.artigoExemploUrl, site?.articleFallbackUrl),
        ].filter(Boolean)
      : [homeResponse.url];
    const triedUrls = [];
    for (const candidateUrl of validationUrls) {
      const candidate = new URL(candidateUrl);
      candidate.searchParams.set("cod5_adops_verify", `${insertionId}-${attempt}-${Date.now()}`);
      const response = candidate.origin === new URL(homeResponse.url).origin && candidate.pathname === new URL(homeResponse.url).pathname
        ? homeResponse
        : await fetch(candidate, {
            redirect: "follow",
            headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
            signal: AbortSignal.timeout(30000),
          });
      const html = response === homeResponse ? homeHtml : await response.text();
      const mediaFound = Boolean(mediaBasename && html.includes(mediaBasename));
      const insertionFound = html.includes(`ADOPS-PERRENGUE-${insertionId}`) || html.includes(`ADOPS-${insertionId}`);
      const adFound = Boolean(adId && (html.includes(`a-${adId}`) || html.includes(`data-ad-id=\"${adId}\"`)));
      triedUrls.push(response.url);
      lastResult = {
        ok: response.ok && (mediaFound || insertionFound || adFound),
        url: response.url,
        status: response.status,
        page: needsArticle ? "article" : "home",
        mediaFound,
        insertionFound,
        adFound,
        attempts: attempt,
        triedUrls,
      };
      if (lastResult.ok) return lastResult;
    }
    await sleep(750);
  }
  return lastResult;
}

async function validateMediaAbsentFromPublicHtml({ site, insertionId, mediaBasename }) {
  const homeUrl = sitePublicHomeUrl(site);
  if (!homeUrl || !mediaBasename) throw new Error("Rollback público sem URL ou mídia para validar ausência.");
  let last = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const url = new URL(homeUrl);
    url.searchParams.set("cod5_adops_rollback", `${insertionId}-${attempt}-${Date.now()}`);
    const response = await fetch(url, { redirect: "follow", headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" }, signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    last = { ok: response.ok && !html.includes(mediaBasename), url: response.url, status: response.status, attempts: attempt };
    if (last.ok) return last;
    await sleep(750);
  }
  return last;
}

async function validateRestoredAdHtml({ site, insertionId, previousAdId, previousMediaBasename, rejectedMediaBasename }) {
  const homeUrl = sitePublicHomeUrl(site);
  if (!homeUrl || !previousAdId || !previousMediaBasename || !rejectedMediaBasename) throw new Error("Rollback público sem identidade estrita do anúncio anterior e rejeitado.");
  let last = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const url = new URL(homeUrl);
    url.searchParams.set("cod5_adops_rollback", `${insertionId}-${attempt}-${Date.now()}`);
    const response = await fetch(url, { redirect: "follow", headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" }, signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const strict = evaluateRestoredAdHtml(html, { previousAdId, previousMediaBasename, rejectedMediaBasename });
    last = { ok: response.ok && strict.ok, url: response.url, status: response.status, ...strict, attempts: attempt };
    if (last.ok) return last;
    await sleep(750);
  }
  return last;
}

function evaluateRestoredAdHtml(html, { previousAdId, previousMediaBasename, rejectedMediaBasename }) {
  const source = String(html || "");
  const previousMediaFound = Boolean(previousMediaBasename && source.includes(previousMediaBasename));
  const previousAdFound = Boolean(previousAdId && (source.includes(`a-${previousAdId}`) || source.includes(`data-ad-id=\"${previousAdId}\"`)));
  const rejectedMediaAbsent = Boolean(rejectedMediaBasename) && !source.includes(rejectedMediaBasename);
  return { ok: rejectedMediaAbsent && (previousMediaFound || previousAdFound), previousMediaFound, previousAdFound, rejectedMediaAbsent };
}

function selectCanonicalSnapshotAd(snapshot) {
  return (Array.isArray(snapshot?.ads) ? snapshot.ads : []).slice().sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0))[0] || null;
}

function isAdrotateSnapshotPublicationConfirmed(snapshot, expected) {
  const normalized = normalizePerrengueAdrotateSnapshot(snapshot);
  const adId = Number(expected?.adId || 0);
  const groupId = Number(expected?.groupId || 0);
  const scheduleId = Number(expected?.scheduleId || 0);
  const insertionId = Number(expected?.insertionId || 0);
  const externalKey = String(expected?.externalKey || "");
  const mediaBasename = String(expected?.mediaBasename || "");
  const ad = normalized.ads.find((item) => Number(item?.id) === adId);
  if (!ad || Number(ad?.adops_insertion_id || 0) !== insertionId || String(ad?.adops_external_key || "") !== externalKey) return false;
  if (mediaBasename && String(ad?.adops_media_basename || "") !== mediaBasename) return false;
  const link = normalized.links.find((item) => Number(item?.ad) === adId && Number(item?.group) === groupId && Number(item?.schedule) === scheduleId);
  if (!link) return false;
  return normalized.schedules.some((item) => Number(item?.id) === scheduleId);
}

function isCacheMaintenanceDegraded({ apply, purgeCache, wpCliResult }) {
  return Boolean(apply && purgeCache && (
    wpCliResult?.cache_maintenance_requested !== true
    || wpCliResult?.cache_maintenance_ok !== true
  ));
}

function publicationFailureDiagnostic({ wpCliResult, headlessRebuild, publicHtmlValidation, exactLiveCount }) {
  return JSON.stringify({
    cacheRequested: wpCliResult?.cache_maintenance_requested === true,
    cacheOk: wpCliResult?.cache_maintenance_ok === true,
    cacheWarnings: Array.isArray(wpCliResult?.cache_maintenance_warnings)
      ? wpCliResult.cache_maintenance_warnings.map((warning) => safeProcessOutput(warning, 240))
      : [],
    rebuildCompleted: headlessRebuild?.completed === true,
    publicHtmlOk: publicHtmlValidation?.ok === true,
    publicHtmlError: publicHtmlValidation?.error ? safeProcessOutput(publicHtmlValidation.error, 500) : null,
    exactLiveCount,
  });
}

async function captureAndValidatePublishedProof({ insertionId, targetDate, captureAt }) {
  const capture = await privateApi(`/api/insertions/${insertionId}/capture-proof`, {
    date: targetDate,
    captureAt: captureAt || undefined,
    replace: true,
    force: true,
  });
  const checklist = await privateApi("/api/audit-checklists/validate-proof", { insertionId, date: targetDate });
  const status = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(targetDate)}`);
  const approved = status?.status === "audited"
    && (status?.checklistValidation?.approved ?? checklist?.approved) === true
    && (status?.blockingIssues || checklist?.blockingIssues || []).length === 0
    && Boolean(status?.arquivoUrl || status?.evidence?.arquivoUrl || capture?.arquivoUrl || capture?.capture?.arquivoUrl);
  if (!approved) throw new Error(`Evidência da inserção ${insertionId} não foi aprovada: ${JSON.stringify({ status: status?.status, blockingIssues: status?.blockingIssues || checklist?.blockingIssues || [] })}`);
  await markMonthlyReportRefreshAfterApproval(targetDate, insertionId);
  return { capture, checklist, status };
}

function envNameForSite(prefix, siteSigla) {
  const safeSigla = String(siteSigla || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeSigla ? `ADOPS_${safeSigla}_${prefix}` : null;
}

function sshKeyPathForSite(siteSigla) {
  const specificEnvName = envNameForSite("SSH_KEY_PATH", siteSigla);
  const specificPath = specificEnvName ? String(process.env[specificEnvName] || "").trim() : "";
  if (specificPath) return specificPath;
  const safeSigla = String(siteSigla || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (safeSigla && safeSigla !== "PERRENGUE") {
    return String(process.env.ADOPS_MULTISITE_SSH_KEY_PATH || "").trim();
  }
  return "";
}

function classifySshFailure(error) {
  const text = `${error?.stdout || ""}\n${error?.stderr || ""}\n${error?.message || ""}`;
  if (/Permission denied/i.test(text)) return "permission_denied";
  if (/Connection timed out|Operation timed out/i.test(text)) return "connection_timeout";
  if (/Connection refused/i.test(text)) return "connection_refused";
  if (/No route to host/i.test(text)) return "no_route";
  if (/Could not resolve hostname|Name or service not known/i.test(text)) return "dns_resolution_failed";
  if (/Load key .* bad permissions|UNPROTECTED PRIVATE KEY FILE/i.test(text)) return "bad_key_permissions";
  if (/Identity file .* not accessible|No such file or directory/i.test(text)) return "key_not_accessible";
  return "ssh_failed";
}

async function probeSshAuthForSite(siteSigla) {
  const requestedSigla = String(siteSigla || "").trim().toUpperCase();
  const result = {
    siteSigla: requestedSigla,
    configured: false,
    keyConfigured: false,
    authOk: false,
    errorCode: null,
  };
  try {
    const sites = await privateApiGet("/api/sites");
    const site = Array.isArray(sites) ? sites.find((item) => String(item?.sigla || "").toUpperCase() === requestedSigla) : null;
    const sshKeyPath = sshKeyPathForSite(requestedSigla);
    result.configured = Boolean(site?.sshHost && site?.sshPort && site?.sshUser);
    result.keyConfigured = Boolean(sshKeyPath);
    result.portConfigured = Boolean(site?.sshPort);
    if (!result.configured) {
      result.errorCode = "site_ssh_not_configured";
      return result;
    }
    if (!sshKeyPath) {
      result.errorCode = "ssh_key_not_configured";
      return result;
    }
    await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=12",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/tmp/adops-known-hosts",
        "-i",
        sshKeyPath,
        "-p",
        String(site.sshPort),
        `${site.sshUser}@${site.sshHost}`,
        "true",
      ],
      { maxBuffer: 512 * 1024, timeout: 20000 },
    );
    result.authOk = true;
    return result;
  } catch (error) {
    result.errorCode = classifySshFailure(error);
    return result;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function readGoogleDriveServiceAccount() {
  if (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) return JSON.parse(GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
  if (GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE) return JSON.parse(await readFile(GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE, "utf8"));
  return null;
}

async function getGoogleDriveServiceAccountAccessToken() {
  const serviceAccount = await readGoogleDriveServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = { alg: "RS256", typ: "JWT" };
  const assertionPayload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedAssertion = `${base64UrlJson(assertionHeader)}.${base64UrlJson(assertionPayload)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedAssertion), serviceAccount.private_key).toString("base64url");
  const assertion = `${unsignedAssertion}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const googleError = payload?.error ? ` ${payload.error}` : "";
    const googleErrorDescription = payload?.error_description ? ` (${payload.error_description})` : "";
    throw new Error(`Falha ao autenticar conta de servico Google Drive: ${response.status}${googleError}${googleErrorDescription}`);
  }
  return {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3000) * 1000,
  };
}

async function getGoogleDriveAccessToken() {
  if (googleDriveAccessTokenCache && googleDriveAccessTokenCache.expiresAt > Date.now() + 60000) {
    return googleDriveAccessTokenCache.token;
  }
  if (GOOGLE_DRIVE_ACCESS_TOKEN) return GOOGLE_DRIVE_ACCESS_TOKEN;
  const serviceAccountToken = await getGoogleDriveServiceAccountAccessToken();
  if (serviceAccountToken) {
    googleDriveAccessTokenCache = serviceAccountToken;
    return googleDriveAccessTokenCache.token;
  }
  if (!GOOGLE_DRIVE_REFRESH_TOKEN || !GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new Error("Credenciais Google Drive ausentes para DRIVE_PI_MONITOR_ENABLED. Configure conta de servico ou OAuth de usuario.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const googleError = payload?.error ? ` ${payload.error}` : "";
    const googleErrorDescription = payload?.error_description ? ` (${payload.error_description})` : "";
    throw new Error(`Falha ao renovar token do Google Drive: ${response.status}${googleError}${googleErrorDescription}`);
  }
  googleDriveAccessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3000) * 1000,
  };
  return googleDriveAccessTokenCache.token;
}

async function googleDriveRequest(pathname, query = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  let lastError = null;
  for (let attempt = 1; attempt <= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS; attempt += 1) {
    let retryAfterMs = 0;
    try {
      const token = await getGoogleDriveAccessToken();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ADOPS_DRIVE_REQUEST_TIMEOUT_MS),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;

      const message = payload?.error?.message || `Google Drive API falhou: ${response.status}`;
      const quotaLimited = response.status === 403 && /quota|rate.?limit|userratelimitexceeded/i.test(message);
      const retryable = response.status === 429 || response.status >= 500 || quotaLimited;
      if (!retryable) {
        const error = new Error(message);
        error.retryable = false;
        throw error;
      }

      const retryAfterSeconds = Number.parseFloat(response.headers.get("retry-after") || "0");
      retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
      lastError = new Error(message);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.retryable === false) throw lastError;
      if (attempt >= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS) throw lastError;
    }

    if (attempt >= ADOPS_DRIVE_RETRY_MAX_ATTEMPTS) break;
    const exponentialMs = ADOPS_DRIVE_RETRY_BASE_MS * (2 ** (attempt - 1));
    const delayMs = Math.min(ADOPS_DRIVE_RETRY_MAX_MS, Math.max(retryAfterMs, exponentialMs));
    console.warn(`[runner] Google Drive temporariamente indisponível; retry ${attempt}/${ADOPS_DRIVE_RETRY_MAX_ATTEMPTS} em ${delayMs}ms`);
    await sleep(delayMs);
  }
  throw lastError || new Error("Google Drive API indisponível após retries.");
}

function drivePiEventType(item, previous) {
  if (String(item.mimeType || "") === "application/vnd.google-apps.folder") {
    return previous ? "folder_updated" : "folder_created";
  }
  return previous ? "updated" : "created";
}

async function listDrivePiFolderRecursive(folderId, basePath = "", seen = new Map()) {
  if (seen.size >= DRIVE_PI_MONITOR_MAX_ITEMS) return seen;
  let pageToken = null;
  do {
    const payload = await googleDriveRequest("files", {
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,parents,size,md5Checksum)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    for (const file of payload.files || []) {
      const itemPath = `${basePath}/${file.name || file.id}`;
      seen.set(file.id, {
        driveFileId: file.id,
        name: file.name || file.id,
        mimeType: file.mimeType || "application/octet-stream",
        path: itemPath,
        parentFolderId: folderId,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink || null,
        size: file.size || null,
        checksum: file.md5Checksum || null,
      });
      if (file.mimeType === "application/vnd.google-apps.folder") {
        await listDrivePiFolderRecursive(file.id, itemPath, seen);
      }
      if (seen.size >= DRIVE_PI_MONITOR_MAX_ITEMS) break;
    }
    pageToken = payload.nextPageToken || null;
  } while (pageToken && seen.size < DRIVE_PI_MONITOR_MAX_ITEMS);
  return seen;
}

async function syncDriveInventorySnapshot(currentMap, scanId = crypto.randomUUID()) {
  const scannedAt = new Date().toISOString();
  const result = await privateApi("/api/ops/drive-inventory/sync", {
    scanId,
    rootFolderId: DRIVE_PI_MONITOR_ROOT_FOLDER_ID,
    scannedAt,
    items: Array.from(currentMap.values()),
  });
  return { ...result, scannedAt };
}

async function postDrivePiMonitorEvent(item, previous) {
  const event = {
    eventId: `drive:${item.driveFileId}:${item.modifiedTime}`,
    driveFileId: item.driveFileId,
    name: item.name,
    mimeType: item.mimeType,
    path: item.path,
    parentFolderId: item.parentFolderId,
    modifiedTime: item.modifiedTime,
    webViewLink: item.webViewLink,
    eventType: drivePiEventType(item, previous),
  };
  return request("/api/ops/drive-pi-events", {
    method: "POST",
    body: JSON.stringify(event),
  });
}

async function runDrivePiMonitorOnce({ force = false } = {}) {
  if (!DRIVE_PI_MONITOR_ENABLED && !force) return null;
  const now = Date.now();
  if (!force && now - lastDrivePiMonitorAt < DRIVE_PI_MONITOR_INTERVAL_MS) return null;
  lastDrivePiMonitorAt = now;

  const state = await readJsonFile(DRIVE_PI_MONITOR_STATE_FILE, { initialized: false, items: {} });
  const currentMap = await listDrivePiFolderRecursive(DRIVE_PI_MONITOR_ROOT_FOLDER_ID);
  const currentItems = Object.fromEntries(currentMap);
  const sent = [];

  if (state.initialized) {
    for (const item of currentMap.values()) {
      const previous = state.items?.[item.driveFileId] || null;
      if (!previous || previous.modifiedTime !== item.modifiedTime || previous.path !== item.path || previous.name !== item.name) {
        const result = await postDrivePiMonitorEvent(item, previous);
        sent.push({
          eventId: `drive:${item.driveFileId}:${item.modifiedTime}`,
          driveFileId: item.driveFileId,
          name: item.name,
          path: item.path,
          duplicate: Boolean(result?.duplicate),
          jobId: result?.jobId || null,
        });
      }
    }
  }

  const snapshot = await syncDriveInventorySnapshot(currentMap);

  await writeJsonFile(DRIVE_PI_MONITOR_STATE_FILE, {
    initialized: true,
    rootFolderId: DRIVE_PI_MONITOR_ROOT_FOLDER_ID,
    checkedAt: new Date().toISOString(),
    count: currentMap.size,
    items: currentItems,
  });

  if (!state.initialized) {
    console.log(`[runner] drive-pi monitor baseline criado com ${currentMap.size} item(s)`);
  } else if (sent.length) {
    console.log(`[runner] drive-pi monitor enviou ${sent.length} evento(s)`);
  }
  return { baseline: !state.initialized, scanned: currentMap.size, sent, snapshot };
}

async function executeDriveInventoryRefresh(job) {
  await progressJob(job.id, { stage: "scanning", stageKey: "scanning", percentTotal: 20 });
  const currentMap = await listDrivePiFolderRecursive(DRIVE_PI_MONITOR_ROOT_FOLDER_ID);
  await progressJob(job.id, {
    stage: "syncing",
    stageKey: "syncing",
    percentTotal: 70,
    itemsDone: 0,
    itemsTotal: currentMap.size,
  });
  const snapshot = await syncDriveInventorySnapshot(currentMap, job?.payload?.scanId || crypto.randomUUID());
  await writeJsonFile(DRIVE_PI_MONITOR_STATE_FILE, {
    initialized: true,
    rootFolderId: DRIVE_PI_MONITOR_ROOT_FOLDER_ID,
    checkedAt: snapshot.scannedAt,
    count: currentMap.size,
    items: Object.fromEntries(currentMap),
  });
  return {
    stage: "completed",
    stageKey: "completed",
    percentTotal: 100,
    scanned: currentMap.size,
    snapshot,
  };
}

async function findOrCreateDrivePiCampaign(fields, payload) {
  const campaigns = await privateApiGet(`/api/campaigns?competencia=${encodeURIComponent(fields.competencia)}`);
  const competenciaKey = normalizeCompetenciaKey(fields.competencia);
  const piKey = normalizePiDigits(fields.piCodigo);
  const existing = Array.isArray(campaigns)
    ? campaigns.find((item) =>
        (normalizePiDigits(item?.piCodigo) || normalizeText(item?.piCodigo)) === (piKey || normalizeText(fields.piCodigo)) &&
        normalizeText(item?.nome) === normalizeText(fields.campaignName) &&
        Number(item?.clienteId ?? 0) === Number(fields.clienteId) &&
        Number(item?.agenciaId ?? 0) === Number(fields.agenciaId)
      )
    : null;
  if (existing?.id) return { campaign: existing, created: false, dedupedBy: "exact" };

  const allCampaigns = await privateApiGet("/api/campaigns?limit=500").catch(() => []);
  const broaderExisting = Array.isArray(allCampaigns)
    ? allCampaigns.find((item) =>
        (normalizePiDigits(item?.piCodigo) || normalizeText(item?.piCodigo)) === (piKey || normalizeText(fields.piCodigo)) &&
        normalizeText(item?.nome) === normalizeText(fields.campaignName) &&
        normalizeCompetenciaKey(item?.competencia) === competenciaKey &&
        Number(item?.agenciaId ?? 0) === Number(fields.agenciaId)
      )
    : null;
  if (broaderExisting?.id) return { campaign: broaderExisting, created: false, dedupedBy: "pi_campaign_competencia" };

  const singlePiCompetencia = Array.isArray(allCampaigns)
    ? allCampaigns.filter((item) =>
        (normalizePiDigits(item?.piCodigo) || normalizeText(item?.piCodigo)) === (piKey || normalizeText(fields.piCodigo)) &&
        normalizeCompetenciaKey(item?.competencia) === competenciaKey
      )
    : [];
  if (singlePiCompetencia.length === 1 && singlePiCompetencia[0]?.id) {
    return { campaign: singlePiCompetencia[0], created: false, dedupedBy: "pi_competencia_single" };
  }

  const campaign = await privateApi("/api/campaigns", {
    nome: fields.campaignName,
    clienteId: fields.clienteId,
    agenciaId: fields.agenciaId,
    piCodigo: fields.piCodigo,
    valorLiquido: fields.valorLiquido ?? undefined,
    competencia: fields.competencia,
    origem: "google-drive-monitor",
    observacoes: `Criado a partir do Drive: ${payload.path}`,
  });
  return { campaign, created: true, dedupedBy: null };
}

function normalizeExpectedPiIdentity(value) {
  return normalizePiDigits(value)?.replace(/^0+(?=\d)/, "") || null;
}

function validateExpectedDrivePiIdentity({ expectedPiCodigo, fieldsPiCodigo, pdfPiCodigo, campaignPiCodigo, insertionPiCodigo }) {
  const expected = normalizeExpectedPiIdentity(expectedPiCodigo);
  const merged = normalizeExpectedPiIdentity(fieldsPiCodigo);
  const fromPdf = normalizeExpectedPiIdentity(pdfPiCodigo);
  if (!expected || !fromPdf) {
    throw new Error("O PDF não confirmou uma PI numérica; nenhuma mutação foi aplicada.");
  }
  if (fromPdf !== expected) {
    throw new Error("A PI lida no PDF diverge da PI que liberou a retomada.");
  }
  if (merged && merged !== expected) {
    throw new Error("A PI consolidada diverge da PI que liberou a retomada.");
  }
  for (const [label, value] of [["campanha", campaignPiCodigo], ["inserção", insertionPiCodigo]]) {
    const current = normalizeExpectedPiIdentity(value);
    if (current && current !== expected) {
      throw new Error(`A PI atual da ${label} diverge da PI esperada; nenhuma mutação foi aplicada.`);
    }
  }
  return true;
}

function validateExpectedDrivePiCommercialContext({ campaignCompetencia, fieldsCompetencia, pdfCompetencia }) {
  const expected = normalizeCompetenciaKey(campaignCompetencia);
  const consolidated = normalizeCompetenciaKey(fieldsCompetencia);
  const fromPdf = normalizeCompetenciaKey(pdfCompetencia);
  if (!expected || !consolidated || consolidated !== expected || (fromPdf && fromPdf !== expected)) {
    throw new Error("A competência lida ou consolidada diverge da campanha canônica; nenhuma mutação foi aplicada.");
  }
  return true;
}

async function applyDrivePiToExpectedInsertion(fields, payload) {
  const expectedInsertionId = Number(payload?.expectedInsertionId || 0);
  const expectedCampaignId = Number(payload?.expectedCampaignId || 0);
  const expectedPiCodigo = normalizeExpectedPiIdentity(payload?.expectedPiCodigo);
  if (!Number.isInteger(expectedInsertionId) || expectedInsertionId <= 0 || !Number.isInteger(expectedCampaignId) || expectedCampaignId <= 0 || !expectedPiCodigo) {
    throw new Error("Retomada de campanha sem alvo canônico completo.");
  }
  const [expected, campaign] = await Promise.all([
    privateApiGet(`/api/insertions/${expectedInsertionId}`),
    privateApiGet(`/api/campaigns/${expectedCampaignId}`),
  ]);
  if (Number(expected?.campanhaId || 0) !== expectedCampaignId || Number(campaign?.id || 0) !== expectedCampaignId) {
    throw new Error("A inserção canônica não pertence à campanha esperada.");
  }
  validateExpectedDrivePiIdentity({
    expectedPiCodigo,
    fieldsPiCodigo: fields.piCodigo,
    pdfPiCodigo: fields.pdfPiCodigo,
    campaignPiCodigo: campaign?.piCodigo,
    insertionPiCodigo: expected?.piCodigo,
  });
  validateExpectedDrivePiCommercialContext({
    campaignCompetencia: campaign?.competencia,
    fieldsCompetencia: fields.competencia,
    pdfCompetencia: fields.pdfCompetencia,
  });
  if (Number(campaign?.clienteId || 0) !== Number(fields.clienteId || 0) || Number(campaign?.agenciaId || 0) !== Number(fields.agenciaId || 0)) {
    throw new Error("Cliente ou agência do PDF divergem da campanha já cadastrada.");
  }
  const scoped = fields.insertions.filter((raw) => (
    Number(readNumberRecord(raw, ["siteId"]) || 0) === Number(expected.siteId || 0)
    && normalizeSlotKey(readStringRecord(raw, ["localFormatoNormalizado", "localFormato"]) || "")
      === normalizeSlotKey(expected.localFormatoNormalizado || expected.localFormato)
    && readStringRecord(raw, ["periodoInicio", "inicio"]) === expected.periodoInicio
    && readStringRecord(raw, ["periodoFim", "fim"]) === expected.periodoFim
  ));
  if (scoped.length !== 1) {
    throw new Error("O PDF não contém exatamente o portal, formato e período da inserção canônica.");
  }
  const raw = scoped[0];
  const mediaUrl = readStringRecord(raw, ["mediaUrl"]);
  if (!mediaUrl) throw new Error("A mídia validada não produziu URL canônica para a inserção esperada.");
  const clickUrl = readUrlRecord(raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]) || fields.clickUrl;
  await privateApiPatch(`/api/campaigns/${expectedCampaignId}`, { piCodigo: fields.piCodigo });
  await privateApiPatch(`/api/insertions/${expectedInsertionId}`, {
    mediaUrl,
    observacoes: [
      expected.observacoes,
      `Mídia e PI validadas pelo reconciliador: ${payload.path}`,
      clickUrl ? `Link destino informado na PI/arte: ${clickUrl}` : null,
      readStringRecord(raw, ["mediaProcessingNote"]),
    ].filter(Boolean).join("\n"),
  });
  return {
    campaignId: expectedCampaignId,
    campaignCreated: false,
    campaignDedupedBy: "expected_campaign_and_insertion",
    createdInsertions: [],
    skippedInsertions: [{ id: expectedInsertionId, reason: "updated_expected_insertion" }],
  };
}

async function applyDrivePiToAdOps(fields, payload) {
  if (payload?.expectedInsertionId) return applyDrivePiToExpectedInsertion(fields, payload);
  const { campaign, created, dedupedBy } = await findOrCreateDrivePiCampaign(fields, payload);
  const campaignDetail = await privateApiGet(`/api/campaigns/${campaign.id}`);
  const existingInsertions = Array.isArray(campaignDetail?.insertions) ? campaignDetail.insertions : [];
  const createdInsertions = [];
  const skippedInsertions = [];

  for (const raw of fields.insertions) {
    const siteId = readNumberRecord(raw, ["siteId"]);
    const localFormato = readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]);
    const periodoInicio = readStringRecord(raw, ["periodoInicio", "inicio"]);
    const periodoFim = readStringRecord(raw, ["periodoFim", "fim"]);
    const duplicate = existingInsertions.find((item) =>
      Number(item.siteId ?? 0) === Number(siteId) &&
      normalizeSlotKey(item.localFormatoNormalizado ?? item.localFormato) === normalizeSlotKey(localFormato) &&
      item.periodoInicio === periodoInicio &&
      item.periodoFim === periodoFim
    );
    if (duplicate) {
      const duplicatePatch = {};
      const mediaUrl = readStringRecord(raw, ["mediaUrl"]);
      const clickUrl = readUrlRecord(raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]) || fields.clickUrl;
      if (mediaUrl && mediaUrl !== duplicate.mediaUrl) duplicatePatch.mediaUrl = mediaUrl;
      if (readStringRecord(raw, ["periodoOriginal"]) && readStringRecord(raw, ["periodoOriginal"]) !== duplicate.periodoOriginal) {
        duplicatePatch.periodoOriginal = readStringRecord(raw, ["periodoOriginal"]);
      }
      if (Object.keys(duplicatePatch).length) {
        duplicatePatch.observacoes = [
          duplicate.observacoes,
          clickUrl ? `Link destino informado na PI/arte: ${clickUrl}` : null,
          readStringRecord(raw, ["mediaProcessingNote"]),
        ]
          .filter(Boolean)
          .join("\n");
        await privateApiPatch(`/api/insertions/${duplicate.id}`, duplicatePatch);
      }
      skippedInsertions.push({ id: duplicate.id, reason: "duplicate" });
      continue;
    }
    const clickUrl = readUrlRecord(raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]) || fields.clickUrl;
    const insertion = await privateApi("/api/insertions", {
      campanhaId: campaign.id,
      siteId,
      localFormato,
      localFormatoNormalizado: readStringRecord(raw, ["localFormatoNormalizado"]) ?? localFormato,
      periodoInicio,
      periodoFim,
      periodoOriginal: readStringRecord(raw, ["periodoOriginal"]),
      statusNormalizado: "aguardando_publicacao",
      mediaUrl: readStringRecord(raw, ["mediaUrl"]),
      observacoes: [
        `Criado a partir do Drive: ${payload.path}`,
        clickUrl ? `Link destino informado na PI/arte: ${clickUrl}` : null,
        readStringRecord(raw, ["mediaProcessingNote"]),
      ].filter(Boolean).join("\n"),
    });
    createdInsertions.push(insertion);
    existingInsertions.push(insertion);
  }

  return {
    campaignId: campaign.id,
    campaignCreated: created,
    campaignDedupedBy: dedupedBy,
    createdInsertions: createdInsertions.map((item) => item.id),
    skippedInsertions,
  };
}

function insertionScopeKey(raw) {
  return [
    Number(readNumberRecord(raw, ["siteId"]) || 0),
    normalizeSlotKey(readStringRecord(raw, ["localFormatoNormalizado", "localFormato"]) || ""),
    readStringRecord(raw, ["periodoInicio", "inicio"]) || "",
    readStringRecord(raw, ["periodoFim", "fim"]) || "",
  ].join("|");
}

async function reconcileDrivePiStrictScope(applied, fields, payload) {
  if (payload?.expectedInsertionId) {
    return { skipped: true, reason: "expected_insertion_scope_preserved", cancelledInsertions: [] };
  }
  if (payload?.strictInsertionScope !== true || !applied?.campaignId) {
    return { skipped: true, reason: "strict_insertion_scope_disabled", cancelledInsertions: [] };
  }
  const detail = await privateApiGet(`/api/campaigns/${applied.campaignId}`);
  const current = Array.isArray(detail?.insertions) ? detail.insertions : [];
  const allowedKeys = new Set(fields.insertions.map(insertionScopeKey));
  const allowedPeriodsBySite = new Set(fields.insertions.map((item) => [
    Number(readNumberRecord(item, ["siteId"]) || 0),
    readStringRecord(item, ["periodoInicio", "inicio"]) || "",
    readStringRecord(item, ["periodoFim", "fim"]) || "",
  ].join("|")));
  const cancelledInsertions = [];
  for (const insertion of current) {
    if (insertion?.statusNormalizado === "cancelado" || allowedKeys.has(insertionScopeKey(insertion))) continue;
    const periodSiteKey = [Number(insertion?.siteId || 0), insertion?.periodoInicio || "", insertion?.periodoFim || ""].join("|");
    const reason = isSocialInsertion(insertion)
      ? "social_format_outside_site_scope"
      : allowedPeriodsBySite.has(periodSiteKey)
        ? "duplicate_outside_explicit_scope"
        : null;
    if (!reason) continue;
    await privateApiPatch(`/api/insertions/${insertion.id}`, {
      statusNormalizado: "cancelado",
      bannerPublicadoNoSite: false,
      observacoes: [
        insertion.observacoes,
        `Cancelada pelo fluxo Drive PI estrito em ${new Date().toISOString()}: ${reason}. Fonte: ${payload?.webViewLink || payload?.path || "Drive"}.`,
      ].filter(Boolean).join("\n"),
    });
    cancelledInsertions.push({ insertionId: insertion.id, reason });
  }
  return { skipped: false, cancelledInsertions };
}

async function executeSyncPlanilha(payload) {
  await ensureRuntimeDirs();
  const args = ["--dir", "scripts", "run", "sync:planilha"];
  const { stdout, stderr } = await runPnpm(args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload?.targetDate || ""))
    ? String(payload.targetDate)
    : todayInCuiaba();
  const operations = await privateApiGet(`/api/campaign-operations/active?${new URLSearchParams({ date: targetDate, includeEvidence: "false" }).toString()}`);
  const diagnostics = (Array.isArray(operations?.items) ? operations.items : []).map((item) => {
    const insertionId = readPositiveInteger(item?.adops?.insertionId);
    const classification = classifyDailyReconciliationOperation(item);
    return {
      piCodigo: item?.piCodigo ?? null,
      siteSigla: item?.siteSigla ?? null,
      campaignName: item?.campaignName ?? null,
      campaignId: readPositiveInteger(item?.adops?.campaignId),
      insertionId,
      status: classification.status,
      reason: classification.reason,
    };
  });
  return {
    mode: payload?.mode || "latest",
    targetDate,
    stdout: safeProcessOutput(stdout),
    stderr: safeProcessOutput(stderr),
    diagnostics: {
      total: diagnostics.length,
      byStatus: diagnostics.reduce((counts, item) => ({ ...counts, [item.status]: Number(counts[item.status] || 0) + 1 }), {}),
      items: diagnostics,
    },
  };
}

async function executeReconcilePlanilhaAdrotate() {
  await ensureRuntimeDirs();
  const args = ["--dir", "scripts", "run", "reconcile:planilha-adrotate"];
  const { stdout, stderr } = await runPnpm(args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    stdout: safeProcessOutput(stdout),
    stderr: safeProcessOutput(stderr),
  };
}

async function executeReconcileAdrotateJob(payload) {
  await ensureRuntimeDirs();
  const apply = payload?.apply === true;
  if (!apply) {
    const { stdout, stderr } = await execFileAsync("node", ["scripts/src/harness-reconcile-planilha-adrotate-v1.mjs"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ADOPS_HARNESS_ALLOW_MUTATION: "false",
        ADOPS_PUBLIC_API_BASE_URL: `${OPS_API_BASE_URL}/api`,
      },
      maxBuffer: 1024 * 1024 * 10,
    });
    return {
      mode: "audit",
      apply: false,
      stdout: safeProcessOutput(stdout, 6000),
      stderr: safeProcessOutput(stderr, 6000),
    };
  }
  const result = await executeReconcilePlanilhaAdrotate();
  return {
    mode: "apply",
    apply: true,
    ...result,
  };
}

async function executeAdrotateLinkJob(payload) {
  const insertionId = readPositiveInteger(payload?.insertionId);
  const adId = readPositiveInteger(payload?.adId);
  const apply = payload?.apply === true;
  if (!insertionId || !adId) {
    throw new Error("adrotate-link exige insertionId e adId positivos.");
  }

  const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
  if (!insertion?.id) {
    throw new Error(`Inserção ${insertionId} não encontrada.`);
  }
  const siteId = readPositiveInteger(insertion.siteId ?? insertion.site?.id);
  if (!siteId) {
    throw new Error(`Inserção ${insertionId} sem siteId.`);
  }
  const site = await privateApiGet(`/api/sites/${siteId}`);
  if (!site?.sshHost || !site?.sshPort || !site?.sshUser || !site?.wpPath) {
    throw new Error(`Site ${siteId} sem configuração SSH/WP-CLI para AdRotate.`);
  }

  const campaignId = readPositiveInteger(insertion.campanhaId ?? insertion.campaignId ?? insertion.campanha?.id ?? insertion.campaign?.id);
  const piCodigo = String(
    insertion.piCodigo ??
    insertion.campanha?.piCodigo ??
    insertion.campaign?.piCodigo ??
    insertion.campanhaPiCodigo ??
    insertion.campaignPiCodigo ??
    ""
  ).trim();
  const mediaBasename = mediaBasenameFromUrl(insertion.mediaUrl ?? insertion.midiaUrl ?? insertion.media?.url);
  if (!campaignId) {
    throw new Error(`Inserção ${insertionId} sem campanha vinculada.`);
  }
  if (!piCodigo) {
    throw new Error(`Inserção ${insertionId} sem piCodigo resolvido.`);
  }
  const siteSigla = site.sigla ?? insertion.siteSigla ?? insertion.site?.sigla ?? null;
  const sshKeyPath = sshKeyPathForSite(siteSigla);
  const restrictedKvm8Gateway = String(site.sshUser || "") === "cod5adops"
    && String(site.sshHost || "") === "93.127.210.71";
  const commandPiCodigo = restrictedKvm8Gateway
    ? piCodigo.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._/-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    : piCodigo;

  const args = [
    shellEscape(site.phpBin ?? "php"),
    shellEscape(site.wpCliPath ?? "wp"),
    "--allow-root",
    `--path=${shellEscape(site.wpPath)}`,
    "adrotate",
    "adops",
    "link",
    String(adId),
    `--insertion=${String(insertionId)}`,
    `--campaign=${String(campaignId)}`,
    `--pi=${shellEscape(commandPiCodigo)}`,
    `--external-key=${shellEscape(`adops-${insertionId}`)}`,
  ];
  if (mediaBasename) args.push(`--media-basename=${shellEscape(mediaBasename)}`);
  if (apply) args.push("--apply");
  const remoteCommand = args.join(" ");

  const { stdout, stderr } = await execFileAsync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "UserKnownHostsFile=/tmp/adops-known-hosts",
      ...(sshKeyPath ? ["-i", sshKeyPath] : []),
      "-p",
      String(site.sshPort),
      `${site.sshUser}@${site.sshHost}`,
      remoteCommand,
    ],
    { maxBuffer: 2 * 1024 * 1024, timeout: 120000 },
  );

  const relationAfter = apply
    ? compactAdrotateRelation(await privateApiGet(`/api/integrations/adrotate/insertions/${insertionId}/relation`).catch(() => null))
    : null;

  return {
    mode: apply ? "apply" : "preview",
    apply,
    insertionId,
    adId,
    campaignId,
    piCodigo,
    commandPiCodigo,
    siteId,
    siteSigla,
    mediaBasename,
    sshKeyConfigured: Boolean(sshKeyPath),
    stdout: safeProcessOutput(stdout, 6000),
    stderr: safeProcessOutput(stderr, 6000),
    relationAfter,
  };
}

async function executeAdrotatePublishJob(payload) {
  const insertionId = readPositiveInteger(payload?.insertionId);
  if (!insertionId) {
    throw new Error("adrotate-publish exige insertionId positivo.");
  }

  const apply = payload?.apply === true;
  const replaceExisting = payload?.replaceExisting !== false;
  const purgeCache = payload?.purgeCache !== false;
  const generateEvidence = payload?.generateEvidence === true;
  const targetDate = firstNonEmptyString(payload?.date) ?? todayInCuiaba();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("adrotate-publish exige date em YYYY-MM-DD quando informado.");
  }

  const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
  if (!insertion?.id) {
    throw new Error(`Inserção ${insertionId} não encontrada.`);
  }
  const periodStart = firstNonEmptyString(insertion.periodoInicio);
  const periodEnd = firstNonEmptyString(insertion.periodoFim);
  const targetInPeriod = Boolean(periodStart && periodEnd && targetDate >= periodStart && targetDate <= periodEnd);
  const checklistDate = targetInPeriod ? targetDate : periodStart || targetDate;
  const checklist = await privateApiGet(`/api/audit-checklists/resolve?insertionId=${insertionId}&date=${encodeURIComponent(checklistDate)}`);
  if (!checklist?.ok) {
    throw new Error(`Checklist bloqueou publicação da inserção ${insertionId}: ${JSON.stringify(checklist?.blockingIssues ?? checklist)}`);
  }

  const siteId = readPositiveInteger(insertion.siteId ?? insertion.site?.id ?? checklist.insertion?.siteId);
  if (!siteId) {
    throw new Error(`Inserção ${insertionId} sem siteId.`);
  }
  const site = await privateApiGet(`/api/sites/${siteId}`);
  const campaignId = readPositiveInteger(insertion.campanhaId ?? insertion.campaignId ?? insertion.campanha?.id ?? insertion.campaign?.id);
  const campaign = campaignId ? await privateApiGet(`/api/campaigns/${campaignId}`).catch(() => null) : null;
  const siteSigla = site.sigla ?? insertion.siteSigla ?? insertion.site?.sigla ?? checklist.insertion?.siteSigla ?? null;
  if (payload?.publicationGuard) {
    validateAdrotatePublicationGuard(payload.publicationGuard, { insertion, campaign, site });
    if (payload.publicationGuard.identityMode === "sheet_drive_composite") {
      const pending = await privateApiGet(`/api/campaign-operations/pending-publication?date=${encodeURIComponent(targetDate)}`);
      const liveItem = (pending?.items || []).find((item) => Number(item?.adops?.insertionId) === insertionId);
      validateCompositePendingGuard(liveItem, payload.publicationGuard);
    }
  }
  if (!shouldUsePerrenguePortainerAdrotate(siteSigla) && (!site?.sshHost || !site?.sshPort || !site?.sshUser || !site?.wpPath)) {
    throw new Error(`Site ${siteId} sem configuração SSH/WP-CLI para AdRotate.`);
  }
  const sshKeyPath = sshKeyPathForSite(siteSigla);
  const restrictedKvm8Gateway = String(site.sshUser || "") === "cod5adops"
    && String(site.sshHost || "") === "93.127.210.71";
  const publishPayload = buildAdrotatePublishPayload({
    insertion,
    campaign,
    site,
    checklist,
    targetDate: checklistDate,
    replaceExisting,
    purgeCache,
    generateEvidence,
    identityMode: payload?.identityMode,
    destinationOverride: payload?.publicationGuard?.destinationMode
      ? payload.publicationGuard.destinationUrl ?? null
      : undefined,
  });
  const payloadJson = JSON.stringify(publishPayload);
  const wpCliCommand = [
    shellEscape(site.phpBin ?? "php"),
    shellEscape(site.wpCliPath ?? "wp"),
    "--allow-root",
    `--path=${shellEscape(site.wpPath)}`,
    "adops-adrotate-publish",
    '--payload-json="$tmp_payload"',
    ...(apply ? ["--apply"] : []),
  ].join(" ");
  const pluginSourceBase64 = shouldUsePerrenguePortainerAdrotate(siteSigla) || restrictedKvm8Gateway
    ? null
    : Buffer.from(await readFile(path.join(PROJECT_ROOT, "ops/wordpress/adrotate-adops.php"))).toString("base64");
  const wpCliBase = [
    shellEscape(site.phpBin ?? "php"),
    shellEscape(site.wpCliPath ?? "wp"),
    "--allow-root",
    `--path=${shellEscape(site.wpPath)}`,
  ].join(" ");
  const staleMuPluginTargets = [
    path.posix.join(site.wpPath, "wp-content/mu-plugins/adrotate-adops.php"),
    path.posix.join(path.posix.dirname(site.wpPath), "app/mu-plugins/adrotate-adops.php"),
  ];
  const remotePluginSyncCommand = [
    `content_dir="$(${wpCliBase} eval ${shellEscape("echo WP_CONTENT_DIR;")} 2>/dev/null)"`,
    'test -n "$content_dir"',
    'plugin_target="$content_dir/plugins/adrotate/adrotate-adops.php"',
    'tmp_plugin="$(mktemp /tmp/adrotate-adops.XXXXXX.php)"',
    `printf %s ${shellEscape(pluginSourceBase64 || "")} | base64 -d > "$tmp_plugin"`,
    `${shellEscape(site.phpBin ?? "php")} -l "$tmp_plugin" >/dev/null`,
    'mkdir -p "$(dirname "$plugin_target")"',
    'if ! cmp -s "$tmp_plugin" "$plugin_target"; then if test -f "$plugin_target"; then cp "$plugin_target" "$plugin_target.bak-$(date +%Y%m%d-%H%M%S)"; fi; install -m 0644 "$tmp_plugin" "$plugin_target"; fi',
    'rm -f "$tmp_plugin"',
    `${wpCliBase} help adops-adrotate-publish >/dev/null 2>&1`,
  ].join(" && ");
  const remoteCommand = restrictedKvm8Gateway
    ? [
        wpCliBase,
        "adops-adrotate-publish",
        `--payload-json=${shellEscape(payloadJson)}`,
        ...(apply ? ["--apply"] : []),
      ].join(" ")
    : [
        `rm -f ${staleMuPluginTargets.map(shellEscape).join(" ")}`,
        remotePluginSyncCommand,
        'tmp_payload="$(mktemp /tmp/adops-adrotate-publish.XXXXXX.json)"',
        `printf %s ${shellEscape(payloadJson)} > "$tmp_payload"`,
        `${wpCliCommand}; rc=$?`,
        'rm -f "$tmp_payload"',
        "exit $rc",
      ].join(" && ");

  const headlessReadiness = String(siteSigla || "").toUpperCase() === "PERRENGUE"
    ? await validatePerrengueHeadlessRebuildReadiness()
    : null;
  const execution = shouldUsePerrenguePortainerAdrotate(siteSigla)
    ? await executePerrenguePortainerWpCliPublish({ payloadJson, apply })
    : {
        ...(await execFileAsync(
          "ssh",
          [
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "UserKnownHostsFile=/tmp/adops-known-hosts",
            ...(sshKeyPath ? ["-i", sshKeyPath] : []),
            "-p",
            String(site.sshPort),
            `${site.sshUser}@${site.sshHost}`,
            remoteCommand,
          ],
          { maxBuffer: 2 * 1024 * 1024, timeout: 180000 },
        )),
        executor: "ssh",
      };
  const { stdout, stderr } = execution;

  const wpCliResult = parseWpCliJsonObject(stdout);
  const wpCliPublished = Boolean(wpCliResult?.ad_id && wpCliResult?.group_id);
  let headlessRebuild = null;
  if (apply && wpCliPublished && String(siteSigla || "").toUpperCase() === "PERRENGUE") {
    headlessRebuild = await executePerrengueHeadlessRebuild({
      insertionId,
      adId: wpCliResult.ad_id,
      mediaBasename: publishPayload.media_basename,
      purgeCache,
    });
  }

  const relationAfter = apply
    ? compactAdrotateRelation(await privateApiGet(`/api/integrations/adrotate/insertions/${insertionId}/relation`).catch(() => null))
    : null;
  const exactLiveCount = relationAfter?.exactLiveMatches?.length ?? 0;
  const publicHtmlValidation = apply && wpCliPublished
      ? await validatePublishedAdHtml({
        site,
        insertionId,
        adId: wpCliResult.ad_id,
        mediaBasename: publishPayload.media_basename,
        page: publishPayload.page,
      }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;
  const activeToday = todayInCuiaba() >= String(insertion.periodoInicio || "") && todayInCuiaba() <= String(insertion.periodoFim || "");
  const publicationConfirmed = apply && wpCliPublished
    ? isAdrotatePublicationConfirmed({
        activeToday,
        relationAfter,
        adId: wpCliResult.ad_id,
        groupId: wpCliResult.group_id,
        insertionId,
        externalKey: publishPayload.external_key,
        publicHtmlOk: publicHtmlValidation?.ok === true,
      })
    : false;
  const cacheMaintenanceDegraded = isCacheMaintenanceDegraded({ apply, purgeCache, wpCliResult });
  const failureDiagnostic = publicationFailureDiagnostic({
    wpCliResult,
    headlessRebuild,
    publicHtmlValidation,
    exactLiveCount,
  });
  if (apply && wpCliPublished && activeToday && cacheMaintenanceDegraded && publicHtmlValidation?.ok !== true) {
    throw new Error(`Manutenção de cache falhou e o anúncio não apareceu no HTML público da inserção ${insertionId}. Diagnóstico: ${failureDiagnostic}`);
  }
  if (apply && wpCliPublished && activeToday && !cacheMaintenanceDegraded && exactLiveCount === 0 && publicHtmlValidation?.ok !== true) {
    throw new Error(`Publicação AdRotate não apareceu na relação nem no HTML público da inserção ${insertionId}. Diagnóstico: ${failureDiagnostic}`);
  }

  let insertionAfterPublish = null;
  if (apply && wpCliPublished) {
    insertionAfterPublish = await privateApiPatch(`/api/insertions/${insertionId}`, {
      ...(payload?.publicationGuard?.expectedUpdatedAt
        ? { expectedUpdatedAt: payload.publicationGuard.expectedUpdatedAt }
        : {}),
      bannerPublicadoNoSite: true,
      statusNormalizado: "publicado",
      observacoes: [
        insertion.observacoes,
        `AdRotate publicado via adrotate-publish em ${new Date().toISOString()} (grupo ${publishPayload.group_id}, ad ${wpCliResult.ad_id}).`,
        exactLiveCount > 0
          ? "Relação pública validada após publicação."
          : "Publicação agendada/criada no WordPress; relação pública pode ficar vazia antes do início do período.",
      ].filter(Boolean).join("\n"),
    });
  }

  let evidenceJob = null;
  if (apply && generateEvidence) {
    evidenceJob = targetInPeriod && targetDate <= todayInCuiaba()
      ? await captureAndValidatePublishedProof({
          insertionId,
          targetDate,
          captureAt: firstNonEmptyString(payload?.captureAt),
        })
      : { skipped: true, reason: targetInPeriod ? "future_date" : "date_out_of_period", targetDate, checklistDate };
  }

  return {
    mode: apply ? "apply" : "preview",
    apply,
    insertionId,
    targetDate,
    checklistDate,
    siteId,
    siteSigla,
    executor: execution.executor,
    executorContext: execution.executor === "portainer"
      ? {
          endpointId: execution.endpointId,
          containerName: execution.containerName,
          wpPath: execution.wpPath,
        }
      : {
          sshHost: site.sshHost,
          sshPort: site.sshPort,
          sshUser: site.sshUser,
          wpPath: site.wpPath,
        },
    sshKeyConfigured: Boolean(sshKeyPath),
    resolvedRule: checklist.resolvedRule,
    expectedSelectors: checklist.expectedSelectors,
    expectedMedia: checklist.expectedMedia,
    headlessReadiness,
    publishPayload: {
      ...publishPayload,
      link_url: publishPayload.link_url ?? null,
    },
    wpCliResult,
    stdout: safeProcessOutput(stdout, 8000),
    stderr: safeProcessOutput(stderr, 8000),
    relationAfter,
    relationOk: apply ? exactLiveCount > 0 : null,
    historicalRelationOk: apply && !activeToday ? publicationConfirmed : null,
    cacheMaintenanceDegraded,
    headlessRebuild,
    publicHtmlValidation,
    insertionAfterPublish,
    evidenceJob,
    requiredFollowUp: apply
      ? ["validate_adrotate_relation", "validate_public_html", ...(generateEvidence ? ["validate_capture_proof"] : [])]
      : ["review_preview", "rerun_with_apply_true"],
  };
}

function getAppliedInsertionIds(applied) {
  if (!applied) return [];
  const ids = [
    ...(Array.isArray(applied.createdInsertions) ? applied.createdInsertions : []),
    ...(Array.isArray(applied.skippedInsertions) ? applied.skippedInsertions.map((item) => item?.id) : []),
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(ids));
}

async function ensureDrivePiEvidenceCoverage(applied) {
  const insertionIds = getAppliedInsertionIds(applied);
  const results = [];
  for (const insertionId of insertionIds) {
    const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
    const mediaUrl = readStringRecord(insertion, ["mediaUrl", "media_url"]);
    if (!mediaUrl) {
      results.push({
        insertionId,
        status: "needs_media",
        reason: "Insercao sem mediaUrl; captura automatica foi pulada para preservar o cadastro.",
        invalidatedEvidenceIds: [],
        regeneratedDates: [],
        auditedDates: [],
      });
      continue;
    }
    const coverage = await ensureInsertionCaptureCoverage(insertion);
    results.push({
      insertionId,
      status: "audited",
      invalidatedEvidenceIds: coverage.invalidatedEvidenceIds,
      regeneratedDates: coverage.regeneratedDates,
      auditedDates: coverage.finalStatuses.filter((item) => item?.status === "audited").map((item) => item.date),
    });
  }
  return {
    checked: insertionIds,
    results,
  };
}

async function notifyDrivePiErrorTelegram(payload, error) {
  return notifyDrivePiTelegram({
    status: "failed",
    eventId: payload?.eventId,
    driveFileId: payload?.driveFileId,
    name: payload?.name,
    path: payload?.path,
    webViewLink: payload?.webViewLink,
    error: error instanceof Error ? error.message : String(error),
    falsePositive: false,
  }).catch((telegramError) => ({ error: telegramError instanceof Error ? telegramError.message : String(telegramError) }));
}

async function executeDrivePiIngest(payload) {
  const preflightOnly = payload?.preflightOnly === true;
  await updateDrivePiState(payload, "received", {
    parseRun: {
      fields: null,
      alerts: [preflightOnly ? "Preflight de pasta Drive recebido pela API operacional." : "Evento recebido do monitor do Google Drive."],
    },
  });
  const intakeLock = {
    key: payload?.parentFolderId || payload?.driveFileId || payload?.eventId || null,
    eventId: payload?.eventId || null,
    lockedAt: new Date().toISOString(),
    ttlHours: 24,
    reason: preflightOnly
      ? "Preflight de PI em andamento. Diagnostico sem mutacao."
      : "Nova entrada do Drive em processamento automatico. Evitar cadastro manual duplicado.",
  };
  await updateDrivePiState(payload, "intake_locked", {
    parseRun: {
      fields: { intakeLock },
      alerts: [preflightOnly
        ? "Preflight automatico iniciado; nenhuma campanha sera criada ou publicada por este job."
        : "Intake automatico iniciado; operador deve evitar cadastro manual ate o status final."],
    },
  });
  const intakeTelegram = await notifyDrivePiTelegram({
    status: "intake_locked",
    eventId: payload.eventId,
    driveFileId: payload.driveFileId,
    name: payload.name,
    path: payload.path,
    webViewLink: payload.webViewLink,
    intakeLock: intakeLock.key,
    falsePositive: false,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  let archived = null;
  try {
    archived = await downloadDriveFileIfConfigured(payload);
  } catch (error) {
    await updateDrivePiState(payload, "needs_review", {
      parseRun: {
        fields: null,
        alerts: ["Arquivo recebido, mas o download pelo runner falhou."],
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  let packageContext = null;
  let packageClassification = null;
  let agentResult = { skipped: "nao_executado" };
  try {
    packageContext = await buildDrivePiPackageContext(payload, archived);
    archived = archived || packageContext.primaryArchive || null;
    packageClassification = classifyDrivePiPackage(packageContext, payload, archived);
    packageContext.packageClassification = packageClassification;
  } catch (error) {
    packageContext = {
      event: {
        name: payload?.name ?? null,
        path: payload?.path ?? null,
        mimeType: payload?.mimeType ?? null,
        eventType: payload?.eventType ?? null,
        webViewLink: payload?.webViewLink ?? null,
      },
      folder: null,
      items: [],
      media: [],
      pdf: archived ? { filePath: archived.filePath, sha256: archived.sha256, bytes: archived.bytes } : null,
      primaryArchive: archived,
      packageError: error instanceof Error ? error.message : String(error),
    };
    packageClassification = classifyDrivePiPackage(packageContext, payload, archived);
    packageContext.packageClassification = packageClassification;
  }

  await updateDrivePiState(payload, "packaging", {
    contentSha256: archived?.sha256 ?? null,
    parseRun: {
      fields: { packageClassification },
      alerts: [
        "Montando pacote da PI com pasta, PDF e midias relacionadas.",
        `Classificacao do pacote: ${packageClassification.class}.`,
        ...(packageClassification.missing.length ? [`Pendencias do pacote: ${packageClassification.missing.join(", ")}`] : []),
      ],
    },
  });
  await notifyDrivePiStageTelegram(payload, "packaging", {
    packageClass: packageClassification?.class,
    missing: packageClassification?.missing || [],
    intakeLock: intakeLock.key,
  });

  const packageHasReadableContent = Boolean(packageContext?.pdf) || (Array.isArray(packageContext?.items) && packageContext.items.length > 0);
  if (!payload?.parsedPi && packageHasReadableContent) {
    await updateDrivePiState(payload, "agent_analysis", {
      contentSha256: archived?.sha256 ?? null,
      parseRun: {
        fields: null,
        alerts: ["Executando agente IA para identificar campos da PI antes dos scripts determinísticos."],
      },
    });
    await notifyDrivePiStageTelegram(payload, "agent_analysis", {
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
    });
    agentResult = await analyzeDrivePiWithAgent(packageContext);
    await notifyDrivePiStageTelegram(payload, "agent_analysis_done", {
      packageClass: packageClassification?.class,
      piCodigo: agentResult?.parsedPi?.piCodigo || null,
      campaignName: agentResult?.parsedPi?.campaignName || null,
      agentAnalysis: agentResult,
      intakeLock: intakeLock.key,
    });
  } else if (!payload?.parsedPi) {
    agentResult = {
      skipped: "package_without_readable_content",
      reason: preflightOnly
        ? "Preflight nao encontrou arquivos legiveis na pasta. Verifique se a pasta foi compartilhada com a credencial do runner."
        : "Pacote Drive sem conteudo legivel para analise IA.",
    };
  }

  let fields = await extractDrivePiFields(payload, archived, agentResult?.parsedPi || null, packageContext);
  let expectedInsertionContext = null;
  if (readPositiveInteger(payload?.expectedInsertionId) && readPositiveInteger(payload?.expectedCampaignId)) {
    const [expectedInsertion, expectedCampaign] = await Promise.all([
      privateApiGet(`/api/insertions/${readPositiveInteger(payload.expectedInsertionId)}`),
      privateApiGet(`/api/campaigns/${readPositiveInteger(payload.expectedCampaignId)}`),
    ]);
    if (Number(expectedInsertion?.campanhaId || 0) !== Number(expectedCampaign?.id || 0)) {
      throw new Error("A inserção canônica não pertence mais à campanha esperada; nenhuma mutação foi aplicada.");
    }
    expectedInsertionContext = expectedInsertion;
    fields = mergeExpectedDrivePiContext(fields, {
      insertion: expectedInsertion,
      campaign: expectedCampaign,
      sourceText: buildDrivePiFolderIdentityText(payload, packageContext),
    });
  }
  const clickUrlResolution = resolveDrivePiClickUrl(fields, packageContext);
  fields = clickUrlResolution.fields;
  const insertionScope = (payload?.strictInsertionScope === true || payload?.publish === true)
    ? filterSiteInsertions(fields.insertions)
    : { accepted: fields.insertions, excluded: [] };
  fields = { ...fields, insertions: insertionScope.accepted };
  const destinationPolicy = validateOptionalDrivePiDestination(fields, expectedInsertionContext);
  if (payload?.publish === true && destinationPolicy.ok && destinationPolicy.url) {
    await assertPublicOperationalDestination(destinationPolicy.url);
  }
  const shouldResolveMedia = (payload?.resolveMedia === true || payload?.publish === true)
    && (payload?.publish !== true || destinationPolicy.ok);
  const videoResolution = shouldResolveMedia
    ? await resolveDrivePiVideoMedia(fields, packageContext, payload)
    : { fields, videoMediaProcessing: { skipped: true, results: [], issues: [] } };
  fields = videoResolution.fields;
  const imageResolution = shouldResolveMedia
    ? await resolveDrivePiImageMedia(fields, packageContext, payload)
    : { fields, imageMediaProcessing: { skipped: true, results: [], issues: [] } };
  fields = imageResolution.fields;
  const mediaProcessing = {
    results: [...(videoResolution.videoMediaProcessing?.results || []), ...(imageResolution.imageMediaProcessing?.results || [])],
    issues: [...(videoResolution.videoMediaProcessing?.issues || []), ...(imageResolution.imageMediaProcessing?.issues || [])],
    video: videoResolution.videoMediaProcessing,
    image: imageResolution.imageMediaProcessing,
  };
  const validation = validateDrivePiApplyFields(fields);
  const packageReadiness = validateDrivePiPackageReadiness(packageClassification, fields, mediaProcessing, {
    requireResolvedMedia: payload?.publish === true,
    requireHttpsDestination: payload?.publish === true,
    expectedInsertion: expectedInsertionContext,
  });
  const rollout = validation.ok ? await validateDrivePiSiteRollout(fields) : { ok: true, blockedSites: [], resolvedSites: [] };
  const dedupeTarget = readPositiveInteger(payload?.expectedCampaignId) && readPositiveInteger(payload?.expectedInsertionId)
    ? { expectedCampaignId: payload.expectedCampaignId, expectedInsertionId: payload.expectedInsertionId }
    : null;
  const dedupe = validation.ok && packageReadiness.ok && rollout.ok
    ? await validateDrivePiDedupeSafety(fields, dedupeTarget)
    : { ok: true, conflicts: [], checkedCampaignIds: [] };
  const canApply = validation.ok && packageReadiness.ok && rollout.ok && dedupe.ok;
  // The protected drive-pi-publish endpoint is an explicit mutation request even
  // when publish=false. That mode updates AdOps/media only and must not touch
  // AdRotate, cache or evidence for an expired campaign.
  const explicitPublishFlow = /api-publish$/.test(String(payload?.source || ""));
  const strictExplicitPublishFlow = explicitPublishFlow
    && payload?.strictInsertionScope === true
    && (Array.isArray(payload?.parsedPi?.insertions) || Number(payload?.expectedInsertionId || 0) > 0);
  const mutationEnabled = !preflightOnly && (
    explicitPublishFlow
    || (ADOPS_DRIVE_PI_ALLOW_MUTATION && ADOPS_PI_AGENT_AUTO_APPLY)
  );
  let preApplySyncPlanilha = { skipped: true, reason: strictExplicitPublishFlow
    ? "Sync da planilha ignorado porque parsedPi.insertions define o escopo canônico estrito."
    : "Pre-apply sync executa apenas quando validacao, pacote, rollout, dedupe e flags permitem mutacao." };
  if (canApply && mutationEnabled && !strictExplicitPublishFlow) {
    try {
      preApplySyncPlanilha = await executeSyncPlanilha({ mode: "pre-apply-latest" });
    } catch (error) {
      preApplySyncPlanilha = {
        ok: false,
        mode: "pre-apply-latest",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  const preApplySyncOk = !(canApply && mutationEnabled) || preApplySyncPlanilha.ok !== false;
  const preApplyDedupe = canApply && mutationEnabled && preApplySyncOk
    ? await validateDrivePiDedupeSafety(fields, dedupeTarget)
    : dedupe;
  const finalCanApply = canApply && preApplySyncOk && preApplyDedupe.ok;
  const reviewReasons = buildDrivePiReviewReasons({
    packageClassification,
    packageReadiness,
    validation,
    rollout,
    dedupe: preApplyDedupe,
    preflightOnly,
    mutationEnabled,
    canApply: finalCanApply,
  });
  if (!preApplySyncOk) reviewReasons.push("sync_planilha_failed");
  const parseStatus = finalCanApply ? "parsed" : "needs_review";
  await updateDrivePiState(payload, finalCanApply ? "validated" : parseStatus, {
    contentSha256: archived?.sha256 ?? null,
    parseRun: {
      fields: {
        piCodigo: fields.piCodigo,
        campaignName: fields.campaignName,
        competencia: fields.competencia,
        clienteId: fields.clienteId,
        agenciaId: fields.agenciaId,
        insertions: fields.insertions,
        agentAnalysis: fields.agentAnalysis || agentResult,
        package: {
          folder: packageContext?.folder || null,
          items: Array.isArray(packageContext?.items) ? packageContext.items.length : 0,
          media: Array.isArray(packageContext?.media) ? packageContext.media.length : 0,
          pdf: packageContext?.pdf ? {
            sha256: packageContext.pdf.sha256,
            bytes: packageContext.pdf.bytes,
            sourceName: packageContext.pdf.sourceName,
          } : null,
          classification: packageClassification,
        },
        packageReadiness,
        mediaProcessing,
        clickUrlResolution,
        insertionScope: {
          strict: payload?.strictInsertionScope === true,
          excluded: insertionScope.excluded.map((item) => ({
            reason: item.reason,
            localFormato: readStringRecord(item.insertion, ["localFormato", "localFormatoNormalizado"]),
          })),
        },
        dedupe: preApplyDedupe,
        preApplySyncPlanilha,
        reviewReasons,
      },
      alerts: validation.ok
        ? packageReadiness.ok
          ? rollout.ok
            ? !preApplySyncOk
              ? [`PI exige revisão porque o sync da planilha falhou antes da mutação: ${preApplySyncPlanilha.error}`]
              : preApplyDedupe.ok
              ? ["PI possui campos mínimos e pacote completo para aplicação segura."]
              : ["PI exige revisão por conflito de deduplicação apos sincronizar a planilha.", ...preApplyDedupe.conflicts]
            : [`Portal fora do rollout atual: ${JSON.stringify(rollout.blockedSites)}`]
          : ["PI exige revisão porque o pacote ainda não tem PDF e mídia suficientes.", ...packageReadiness.issues]
        : [
            "PI exige revisão antes de criar campanha/inserções.",
            ...validation.missing.map((item) => `Campo ausente: ${item}`),
            ...(validation.agentQuality?.issues || []),
            ...(validation.agentQuality?.conflicts || []).map((item) => `Conflito IA: ${item}`),
          ],
      rawTextExcerpt: `${payload?.name ?? ""}\n${payload?.path ?? ""}`.slice(0, 1000),
    },
  });
  await notifyDrivePiStageTelegram(payload, finalCanApply ? "validated" : "needs_review", {
    piCodigo: fields.piCodigo,
    campaignName: fields.campaignName,
    packageClass: packageClassification?.class,
    intakeLock: intakeLock.key,
    missing: validation.missing,
    invalidInsertions: validation.invalidInsertions,
    reviewReasons,
    packageReadiness,
    dedupe: preApplyDedupe,
    rollout,
    agentAnalysis: fields.agentAnalysis || agentResult,
  });

  let applied = null;
  let evidenceCoverage = null;
  if (finalCanApply && mutationEnabled) {
    await updateDrivePiState(payload, "applying", {
      parseRun: {
        fields,
        alerts: ["Aplicação automática habilitada por ADOPS_DRIVE_PI_ALLOW_MUTATION=true e ADOPS_PI_AGENT_AUTO_APPLY=true."],
      },
    });
    await notifyDrivePiStageTelegram(payload, "applying", {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
    });
    applied = await applyDrivePiToAdOps(fields, payload);
    await notifyDrivePiStageTelegram(payload, "applied_records", {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
      applied,
    });
    if (payload?.publish !== true && payload?.generateEvidence === true) {
      evidenceCoverage = await ensureDrivePiEvidenceCoverage(applied);
      await notifyDrivePiStageTelegram(payload, "evidence_checked", {
        piCodigo: fields.piCodigo,
        campaignName: fields.campaignName,
        packageClass: packageClassification?.class,
        intakeLock: intakeLock.key,
        applied,
        evidenceCoverage,
      });
    }
    const evidenceNeedsReview = evidenceCoverage?.results?.some((item) => !["audited", "not_due", "not_requested"].includes(item?.status));
    await updateDrivePiState(payload, "applied", {
      parseRun: {
        fields,
        alerts: [
          "Campanha/inserções aplicadas no AdOps com deduplicação.",
          evidenceNeedsReview
            ? "Algumas evidências dependem de mídia/publicação e ficaram marcadas para revisão."
            : "Evidências conferidas/corrigidas para inserções afetadas.",
        ],
      },
    });
  }

  const hasAdOpsChanges = Boolean(applied?.campaignCreated || applied?.createdInsertions?.length || applied?.skippedInsertions?.length);
  const postApplyWarnings = [];
  if (hasAdOpsChanges) {
    await notifyDrivePiStageTelegram(payload, "syncing", {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
      applied,
    });
  }
  const syncPlanilha = hasAdOpsChanges && !strictExplicitPublishFlow
    ? await executeSyncPlanilha({ mode: "latest" })
    : preApplySyncPlanilha;
  const strictScopeReconciliation = hasAdOpsChanges
    ? await reconcileDrivePiStrictScope(applied, fields, payload)
    : { skipped: true, reason: "no_adops_changes", cancelledInsertions: [] };
  let reconcile = {
    skipped: true,
    reason: payload?.publish === true
      ? "O fluxo de publicação valida a relação por inserção após o AdRotate."
      : "Nenhuma alteração nova aplicada no AdOps.",
  };
  if (hasAdOpsChanges && payload?.publish !== true && !strictExplicitPublishFlow) {
    try {
      reconcile = await executeReconcilePlanilhaAdrotate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reconcile = { ok: false, error: message };
      postApplyWarnings.push(`Reconcile planilha/AdRotate falhou: ${message}`);
      await notifyDrivePiStageTelegram(payload, "reconcile_failed", {
        piCodigo: fields.piCodigo,
        campaignName: fields.campaignName,
        packageClass: packageClassification?.class,
        intakeLock: intakeLock.key,
        applied,
        error: message,
      });
    }
  }
  if (hasAdOpsChanges) {
    await notifyDrivePiStageTelegram(payload, "synced", {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
      applied,
    });
  }
  const publicationResults = [];
  if (hasAdOpsChanges && payload?.publish === true) {
    for (const insertionId of getAppliedInsertionIds(applied)) {
      const common = {
        insertionId,
        replaceExisting: true,
        purgeCache: payload?.purgeCache !== false,
        date: firstNonEmptyString(payload?.date) || todayInCuiaba(),
        captureAt: firstNonEmptyString(payload?.captureAt),
      };
      const preview = await executeAdrotatePublishJob({ ...common, apply: false, generateEvidence: false });
      const published = await executeAdrotatePublishJob({
        ...common,
        apply: true,
        generateEvidence: payload?.generateEvidence !== false,
      });
      publicationResults.push({ insertionId, preview, published });
    }
    evidenceCoverage = {
      checked: publicationResults.map((item) => item.insertionId),
      results: publicationResults.map((item) => ({
        insertionId: item.insertionId,
        status: item.published?.evidenceJob?.skipped
          ? "not_due"
          : item.published?.evidenceJob
            ? "audited"
            : "not_requested",
      })),
    };
  }
  const evidenceNeedsReview = evidenceCoverage?.results?.some((item) => !["audited", "not_due", "not_requested"].includes(item?.status));
  const finalStatus = applied ? (evidenceNeedsReview || postApplyWarnings.length ? "needs_review" : "applied") : "needs_review";
  const finalReviewReasons = buildDrivePiReviewReasons({
    packageClassification,
    packageReadiness,
    validation,
    rollout,
    dedupe: preApplyDedupe,
    preflightOnly,
    mutationEnabled,
    canApply: finalCanApply,
    evidenceCoverage,
    postApplyWarnings,
  });
  await updateDrivePiState(payload, finalStatus, {
    contentSha256: archived?.sha256 ?? null,
    parseRun: {
      fields: {
        ...fields,
        packageReadiness,
        dedupe: preApplyDedupe,
        preApplySyncPlanilha,
        strictScopeReconciliation,
        publicationResults,
        reviewReasons: finalReviewReasons,
      },
      alerts: applied
        ? [
            "Fluxo Drive PI aplicado e conciliado.",
            ...(evidenceNeedsReview ? ["Cadastro preservado; evidência ficou pendente por mídia/publicação ausente."] : []),
            ...postApplyWarnings,
          ]
        : [
            "Fluxo seguro bloqueou mutação automática; revisar campos antes de publicar.",
            ...(canApply && !mutationEnabled ? [preflightOnly ? "Campos validos; preflight concluiu sem aplicar por desenho." : "Campos validos, mas flags de auto-apply nao estao ambas habilitadas."] : []),
            ...(canApply && mutationEnabled && !finalCanApply ? ["Planilha sincronizada antes da mutacao revelou conflito de deduplicacao."] : []),
          ],
    },
  });

  const telegram = await notifyDrivePiTelegram({
    status: finalStatus,
    eventId: payload.eventId,
    driveFileId: payload.driveFileId,
    name: payload.name,
    path: payload.path,
    webViewLink: payload.webViewLink,
    piCodigo: fields.piCodigo,
    campaignName: fields.campaignName,
    clickUrl: fields.clickUrl,
    packageClass: packageClassification?.class,
    intakeLock: intakeLock.key,
    missing: validation.missing,
    invalidInsertions: validation.invalidInsertions,
    reviewReasons: finalReviewReasons,
    packageReadiness,
    dedupe: preApplyDedupe,
    applied,
    evidenceCoverage,
    strictScopeReconciliation,
    publicationResults,
    rollout,
    agentAnalysis: fields.agentAnalysis || agentResult,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));

  return {
    stage: finalStatus,
    eventId: payload.eventId,
    documentId: payload.documentId ?? null,
    driveFileId: payload.driveFileId,
    name: payload.name,
    path: payload.path,
    archived,
    fields: {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      competencia: fields.competencia,
      clienteId: fields.clienteId,
      agenciaId: fields.agenciaId,
      insertions: fields.insertions.length,
    },
    validation,
    packageClassification,
    mediaCandidates: (Array.isArray(packageContext?.media) ? packageContext.media : []).map((item) => ({
      driveFileId: item?.driveFileId ?? null,
      name: item?.name ?? null,
      path: item?.path ?? null,
      mimeType: item?.mimeType ?? null,
      webViewLink: item?.webViewLink ?? null,
      size: item?.size ?? null,
    })),
    packageReadiness,
    reviewReasons: finalReviewReasons,
    dedupe: preApplyDedupe,
    rollout,
    preflightOnly,
    mutationEnabled,
    driveMutationEnabled: ADOPS_DRIVE_PI_ALLOW_MUTATION,
    agentAutoApplyEnabled: ADOPS_PI_AGENT_AUTO_APPLY,
    agentAnalysis: fields.agentAnalysis || agentResult,
    applied,
    evidenceCoverage,
    strictScopeReconciliation,
    publicationResults,
    syncPlanilha,
    reconcile,
    telegram: {
      intake: intakeTelegram,
      final: telegram,
    },
  };
}

async function executePrintBatch(job) {
  const payload = job?.payload || {};
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload?.date || ""))
    ? String(payload.date)
    : todayInCuiaba();
  const params = new URLSearchParams({ date: targetDate, includeEvidence: "true" });
  const competencia = typeof payload?.competencia === "string" && payload.competencia.trim() ? payload.competencia.trim().toUpperCase() : null;
  const siteId = readPositiveInteger(payload?.siteId);
  if (siteId) {
    const site = await privateApiGet(`/api/sites/${siteId}`);
    if (!site?.sigla) throw new Error(`print-batch não encontrou sigla para siteId ${siteId}.`);
    params.set("siteSigla", String(site.sigla));
  }
  const operations = await privateApiGet(`/api/campaign-operations/active?${params.toString()}`);
  const candidates = (Array.isArray(operations?.items) ? operations.items : [])
    .filter((item) => {
      const insertionId = readPositiveInteger(item?.adops?.insertionId);
      if (competencia && String(item?.adops?.competencia || "").toUpperCase() !== competencia) return false;
      const publicConfirmed = item?.adops?.publicConfirmation === "confirmed";
      if (!insertionId || (item?.adops?.bannerPublicadoNoSite !== true && !publicConfirmed) || !item?.adops?.mediaUrl) return false;
      const requiredDates = Array.isArray(item?.evidence?.requiredDates) ? item.evidence.requiredDates : [];
      return requiredDates.includes(targetDate);
    });
  const captured = [];
  const skipped = [];
  let transportError = null;
  for (const [index, item] of candidates.entries()) {
    const insertionId = readPositiveInteger(item?.adops?.insertionId);
    const missingDates = Array.isArray(item?.evidence?.missingDates) ? item.evidence.missingDates : [];
    const invalidDates = Array.isArray(item?.evidence?.invalidDates) ? item.evidence.invalidDates : [];
    if (!missingDates.includes(targetDate) && !invalidDates.includes(targetDate)) {
      skipped.push({ insertionId, reason: "evidencia_auditada" });
      continue;
    }
    await progressJob(job.id, {
      stage: "capture_async_dispatch",
      targetDate,
      itemsDone: index,
      itemsTotal: candidates.length,
      insertionId,
      replace: invalidDates.includes(targetDate),
    });
    try {
      const capture = await enqueueAndWaitCaptureProof({
        outerJobId: job.id,
        insertionId,
        date: targetDate,
        captureAt: payload?.captureAt ?? null,
        replace: invalidDates.includes(targetDate),
      });
      captured.push({ insertionId, captureJobId: capture.jobId, uploadedUrl: capture.item?.uploadedUrl ?? null });
    } catch (error) {
      transportError = error instanceof Error ? error.message : String(error);
      break;
    }
  }
  const auditQuery = new URLSearchParams({ date: targetDate });
  if (competencia) auditQuery.set("competencia", competencia);
  if (readPositiveInteger(payload?.siteId)) auditQuery.set("siteId", String(payload.siteId));
  auditQuery.set("insertionIds", candidates.map((item) => readPositiveInteger(item?.adops?.insertionId)).filter(Boolean).join(","));
  const audit = await privateApiGet(`/api/insertions/capture-proof/audit?${auditQuery.toString()}`);
  const outcome = classifyDailyPrintOutcome({
    jobId: job.id,
    childJobId: captured.at(-1)?.captureJobId ?? null,
    expectedTotal: candidates.length,
    audit: {
      date: targetDate,
      totalEligible: Number(audit?.totalEligible ?? 0),
      ok: Number(audit?.ok ?? 0),
      missing: Number(audit?.missing ?? 0),
      invalid: Number(audit?.invalid ?? 0),
      missingDates: Number(audit?.missing ?? 0) > 0 ? [targetDate] : [],
      invalidDates: Number(audit?.invalid ?? 0) > 0 ? [targetDate] : [],
    },
    transportError,
  });
  if (outcome.status === "incident_required") {
    const incident = outcome.incident ?? {};
    throw new Error(`daily_print_audit_incomplete:${JSON.stringify({
      incidentLayer: incident.layer ?? "audit",
      incidentSummary: incident.summary ?? null,
      transportError: transportError ?? null,
      date: targetDate,
      expectedTotal: candidates.length,
      totalEligible: audit?.totalEligible ?? null,
      ok: audit?.ok ?? null,
      missing: audit?.missing ?? null,
      invalid: audit?.invalid ?? null,
    })}`);
  }
  return {
    stage: outcome.status === "recovered" ? "recovered_after_transport_error" : "completed",
    targetDate,
    mode: "async_per_insertion",
    totalCandidates: candidates.length,
    captured,
    skipped,
    audit: {
      totalEligible: audit.totalEligible,
      ok: audit.ok,
      missing: audit.missing,
      invalid: audit.invalid,
    },
    canonicalAudit: {
      expected: candidates.length,
      approved: Number(audit.ok ?? 0),
      missing: Number(audit.missing ?? 0),
      invalid: Number(audit.invalid ?? 0),
    },
    transportError,
  };
}

function isAuditApprovedStatus(status) {
  if (!status || typeof status !== "object") return false;
  const approved = status?.checklistValidation?.approved ?? status?.auditChecklist?.approved ?? status?.approved ?? null;
  const issues = Array.isArray(status?.issues) ? status.issues : [];
  return status.status === "audited" && approved === true && issues.length === 0;
}

function clampDateRange(startDate, endDate, fromDate, toDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return [];
  const today = parseIsoDate(formatIsoDate(new Date()));
  const requestedStart = parseIsoDate(fromDate);
  const requestedEnd = parseIsoDate(toDate);
  let effectiveStart = requestedStart && requestedStart > start ? requestedStart : start;
  let effectiveEnd = requestedEnd && requestedEnd < end ? requestedEnd : end;
  if (today && effectiveEnd > today) effectiveEnd = today;
  if (effectiveEnd < effectiveStart) return [];
  return eachIsoDay(effectiveStart, effectiveEnd);
}

async function resolveBackfillInsertionIds(payload) {
  const insertionId = readPositiveInteger(payload?.insertionId);
  if (insertionId) return { mode: "insertion", insertionIds: [insertionId] };

  const campaignId = readPositiveInteger(payload?.campaignId);
  if (campaignId) {
    const campaign = await privateApiGet(`/api/campaigns/${campaignId}`);
    const insertions = Array.isArray(campaign?.insertions) ? campaign.insertions : [];
    return {
      mode: "campaign",
      campaignId,
      insertionIds: insertions
        .map((item) => readPositiveInteger(item?.id))
        .filter(Boolean),
    };
  }

  const piCodigo = normalizePiDigits(payload?.piCodigo);
  const siteSigla = String(payload?.siteSigla || "").trim().toUpperCase();
  if (piCodigo && siteSigla) {
    const descriptor = await privateApiGet(`/api/pi-site-exports?piCodigo=${encodeURIComponent(piCodigo)}&siteSigla=${encodeURIComponent(siteSigla)}`);
    const insertionIds = Array.isArray(descriptor?.insertionIds) ? descriptor.insertionIds : [];
    return {
      mode: "pi-site",
      piCodigo,
      siteSigla,
      insertionIds: insertionIds
        .map((item) => readPositiveInteger(item))
        .filter(Boolean),
    };
  }

  return { mode: "legacy-filters", insertionIds: null };
}

async function executePrintBackfill(job) {
  const payload = job?.payload || {};
  const resolved = await resolveBackfillInsertionIds(payload);
  const replaceRequested = payload?.replace === true;
  const force = payload?.force === true;
  const items = [];
  const skipped = [];
  const captureTargets = [];

  if (resolved.insertionIds) {
    for (const insertionId of resolved.insertionIds) {
      const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
      const dates = clampDateRange(insertion?.periodoInicio, insertion?.periodoFim, payload?.fromDate, payload?.toDate);
      if (!dates.length) {
        skipped.push({ insertionId, reason: "sem_periodo_valido_ou_fora_do_intervalo" });
        continue;
      }
      captureTargets.push(...dates.map((date) => ({ insertionId, date, captureAt: null })));
    }
  } else {
    const params = new URLSearchParams();
    if (payload?.competencia) params.set("competencia", String(payload.competencia));
    if (payload?.siteId) params.set("siteId", String(payload.siteId));
    const preview = await privateApiGet(`/api/insertions/capture-proof/backfill-overdue/preview?${params.toString()}`);
    const previewJobs = Array.isArray(preview?.jobs) ? preview.jobs : [];
    for (const target of previewJobs) {
      const insertionId = readPositiveInteger(target?.insertionId);
      const date = String(target?.targetDate || "");
      if (!insertionId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (payload?.fromDate && date < payload.fromDate) continue;
      if (payload?.toDate && date > payload.toDate) continue;
      captureTargets.push({ insertionId, date, captureAt: target?.captureAt ?? null });
    }
  }

  for (const { insertionId, date, captureAt } of captureTargets) {
      const before = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(date)}`).catch((error) => ({
        status: "status_error",
        error: error instanceof Error ? error.message : String(error),
      }));
      if (!replaceRequested && isAuditApprovedStatus(before)) {
        items.push({
          insertionId,
          date,
          status: "skipped",
          reason: "already_audited",
          approved: true,
        });
        continue;
      }

      const capture = await enqueueAndWaitCaptureProof({
        outerJobId: job.id,
        insertionId,
        date,
        captureAt,
        replace: replaceRequested || !isAuditApprovedStatus(before),
        force,
        reconstructionReason: "late_publication_recovery",
      });
      const after = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(date)}`).catch((error) => ({
        status: "status_error",
        error: error instanceof Error ? error.message : String(error),
      }));
      items.push({
        insertionId,
        date,
        status: isAuditApprovedStatus(after) ? "ok" : "error",
        approved: isAuditApprovedStatus(after),
        captureSkipped: false,
        evidenceUrl: after?.arquivoUrl ?? capture?.item?.uploadedUrl ?? null,
        checklistStatus: after?.status ?? null,
        error: isAuditApprovedStatus(after) ? null : after?.error ?? capture?.error ?? "Checklist final não aprovado.",
      });
  }

  const errors = items.filter((item) => item.status === "error");
  return {
    ok: errors.length === 0,
    mode: resolved.mode,
    campaignId: resolved.campaignId ?? null,
    piCodigo: resolved.piCodigo ?? null,
    siteSigla: resolved.siteSigla ?? null,
    insertionIds: Array.from(new Set(captureTargets.map((target) => target.insertionId))),
    fromDate: payload?.fromDate ?? null,
    toDate: payload?.toDate ?? null,
    replace: replaceRequested,
    force,
    totalInsertions: new Set(captureTargets.map((target) => target.insertionId)).size,
    totalDates: captureTargets.length,
    generatedOrValidated: items.filter((item) => item.status === "ok" || item.status === "skipped").length,
    errors: errors.length,
    skipped,
    items,
  };
}

async function executePrintSingle(job) {
  const payload = job?.payload || {};
  if (!payload?.insertionId) {
    throw new Error("print-single sem insertionId.");
  }
  const date = String(payload?.date || payload?.captureAt || todayInCuiaba()).slice(0, 10);
  const capture = await enqueueAndWaitCaptureProof({
    outerJobId: job.id,
    insertionId: Number(payload.insertionId),
    date,
    captureAt: payload?.captureAt ?? null,
    replace: payload?.replace === true,
    force: payload?.force === true,
    reconstructionReason: payload?.reconstructionReason === "late_publication_recovery"
      ? "late_publication_recovery"
      : null,
  });
  return {
    ok: true,
    skipped: false,
    date,
    capture: {
      status: "ok",
      uploadedUrl: capture.item?.uploadedUrl ?? null,
      captureLogId: capture.item?.captureLogId ?? null,
    },
    asyncJob: {
      jobId: capture.jobId,
      status: capture.job?.status ?? "completed",
    },
  };
}

async function executeEvidenceMonthlyReport(job) {
  const startedAtMs = Date.now();
  const timings = {};
  const payload = job?.payload || {};
  const incremental = payload.incremental === true;
  const refreshRevision = incremental ? Number(payload.refreshRevision || 0) : null;
  const targetDate = String(payload.targetDate || todayInCuiaba());
  const competencia = String(payload.competencia || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !competencia) {
    throw new Error("evidence-monthly-report exige targetDate e competencia.");
  }

  await progressJob(job.id, {
    stage: "collecting",
    itemsDone: 0,
    itemsTotal: 4,
    percentStage: 5,
    percentTotal: 5,
  });
  if (!incremental) {
    await runPnpm(["--filter", "@workspace/scripts", "run", "sync:planilha"], {
      cwd: PROJECT_ROOT,
      env: process.env,
      timeout: 20 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    timings.sheetSyncMs = Date.now() - startedAtMs;
    await progressJob(job.id, {
      stage: "collecting",
      itemsDone: 1,
      itemsTotal: 4,
      percentStage: 35,
      percentTotal: 15,
    });
    await runPnpm(["--dir", "scripts", "run", "audit:capture-rules-integrity"], {
      cwd: PROJECT_ROOT,
      env: process.env,
      timeout: 10 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    timings.captureRulesAuditMs = Date.now() - startedAtMs - timings.sheetSyncMs;
  } else {
    timings.sheetSyncMs = 0;
    timings.captureRulesAuditMs = 0;
    await progressJob(job.id, {
      stage: "collecting",
      itemsDone: 2,
      itemsTotal: 4,
      percentStage: 50,
      percentTotal: 30,
      refreshMode: "incremental",
      refreshRevision,
    });
  }
  await progressJob(job.id, {
    stage: "exporting",
    itemsDone: 2,
    itemsTotal: 4,
    percentStage: 50,
    percentTotal: 30,
  });
  const reportHeartbeat = setInterval(() => {
    progressJob(job.id, {
      stage: "exporting",
      itemsDone: 2,
      itemsTotal: 4,
      percentStage: 65,
      percentTotal: 60,
      elapsedSeconds: Math.round((Date.now() - startedAtMs) / 1000),
    }).catch(() => null);
  }, 25_000);
  let result;
  try {
    result = await execFileAsync("node", ["scripts/src/build-current-month-evidence-report.mjs"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ADOPS_REPORT_DATE: targetDate,
        ADOPS_REPORT_MONTH: targetDate.slice(0, 7),
        ADOPS_REPORT_COMPETENCIA: competencia,
        ADOPS_PUBLIC_API_BASE_URL: OPS_API_BASE_URL,
        ADOPS_REPORT_SKIP_PUBLISH: "0",
        ADOPS_REPORT_SKIP_EXPORTS: incremental ? "1" : "0",
        ADOPS_REPORT_REFRESH_MODE: incremental ? "incremental" : "full",
        ADOPS_REPORT_REFRESH_REVISION: refreshRevision ? String(refreshRevision) : "",
      },
      timeout: 90 * 60_000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } finally {
    clearInterval(reportHeartbeat);
  }
  timings.reportGenerationMs = Date.now() - startedAtMs - timings.sheetSyncMs - timings.captureRulesAuditMs;
  await progressJob(job.id, {
    stage: "publishing",
    itemsDone: 3,
    itemsTotal: 4,
    percentStage: 90,
    percentTotal: 90,
  });
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  let report = null;
  try {
    report = JSON.parse(lines.slice(lines.findIndex((line) => line.trim().startsWith("{"))).join("\n"));
  } catch {
    report = { stdout: String(result.stdout || "").slice(-4000) };
  }
  return {
    ok: true,
    refreshMode: incremental ? "incremental" : "full",
    refreshRevision,
    stage: "completed",
    targetDate,
    competencia,
    publicUrl: report?.publicUrl || null,
    summary: report?.summary || null,
    timings: { ...timings, ...(report?.timings || {}), totalMs: Date.now() - startedAtMs },
    telemetry: report?.telemetry || null,
    report,
  };
}

async function executeTelegramSendEvidence(payload) {
  const insertionId = Number(payload?.insertionId || 0);
  const date = String(payload?.date || "").trim();
  if (!insertionId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("telegram-send-evidence exige insertionId e date=YYYY-MM-DD.");
  }

  const checklist = await privateApi("/api/audit-checklists/validate-proof", {
    insertionId,
    date,
  });
  if (!checklist?.approved) {
    throw new Error(`Checklist recusou evidencia #${insertionId} em ${date}: ${JSON.stringify(checklist?.blockingIssues || checklist?.issues || [])}`);
  }

  const status = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(date)}`);
  if (!status?.arquivoUrl) {
    throw new Error(`Evidencia #${insertionId} em ${date} sem arquivoUrl para Telegram.`);
  }

  let result = null;
  if (TELEGRAM_BOT_TOKEN) {
    const chatId = String(payload?.chatId || TELEGRAM_DEFAULT_GROUP_ID || "").trim();
    if (!chatId) throw new Error("TELEGRAM_DEFAULT_GROUP_ID ausente para envio direto.");
    result = await sendTelegramPhotoDirect({
      chatId,
      photo: String(status.arquivoUrl),
      caption: `AdOps evidencia auditada\nInsercao: #${insertionId}\nData: ${date}\nChecklist: aprovado`,
    });
  } else {
    const response = await fetch(`${ADOPS_TELEGRAM_BOT_URL}/ops/resend-print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPS_API_TOKEN}`,
      },
      body: JSON.stringify({
        insertionId,
        date,
        ...(payload?.chatId ? { chatId: payload.chatId } : {}),
      }),
    });
    result = await response.json().catch(() => null);
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.details || result?.error || `Telegram resend-print falhou: ${response.status}`);
    }
  }
  return {
    ok: true,
    stage: "completed",
    insertionId,
    date,
    checklist: {
      approved: checklist.approved,
      evidenceStatus: checklist.evidenceStatus,
      blockingIssues: checklist.blockingIssues || [],
      warnings: checklist.warnings || [],
    },
    evidence: {
      arquivoUrl: status.arquivoUrl,
      status: status.status,
    },
    telegram: result,
  };
}

function envPresent(name) {
  return Boolean(String(process.env[name] || "").trim());
}

function namedChecks(items) {
  return items.map((item) => ({
    name: item.name,
    present: envPresent(item.name),
    requiredFor: item.requiredFor,
  }));
}

async function executeRuntimeReadinessProbe() {
  const driveOAuthReady = Boolean(GOOGLE_DRIVE_REFRESH_TOKEN && GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET);
  const directGoogleDriveReady = Boolean(GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE || GOOGLE_DRIVE_ACCESS_TOKEN || driveOAuthReady);
  const googleDriveReady = !DRIVE_PI_MONITOR_ENABLED || directGoogleDriveReady;
  const telegramDirectReady = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_DEFAULT_GROUP_ID);
  const telegramBridgeConfigured = Boolean(ADOPS_TELEGRAM_BOT_URL);
  const perrengueSshEnvName = "ADOPS_PERRENGUE_SSH_KEY_PATH";
  const perrengueSshAuth = await probeSshAuthForSite("PERRENGUE");
  const runnerRuntimeReadiness = {
    ok: true,
    version: "adops-runner-runtime-readiness-v1",
    runnerId: RUNNER_ID,
    generatedAt: new Date().toISOString(),
    noSecretValues: true,
    capabilities: {
      privateApiReady: Boolean(PRIVATE_ADOPS_API_BASE_URL && PRIVATE_ADOPS_API_TOKEN),
      opsApiReady: Boolean(OPS_API_BASE_URL && OPS_API_TOKEN),
      googleDriveReady,
      directGoogleDriveReady,
      googleDriveRequired: DRIVE_PI_MONITOR_ENABLED,
      telegramReady: telegramBridgeConfigured || telegramDirectReady,
      telegramBridgeConfigured,
      telegramDirectReady,
      drivePiMutationAllowed: ADOPS_DRIVE_PI_ALLOW_MUTATION,
      campaignAutoPublicationEnabled: ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED,
      piAgentEnabled: ADOPS_PI_AGENT_ENABLED,
      piAgentAutoApply: ADOPS_PI_AGENT_AUTO_APPLY,
      perrengueAdrotateExecMode: ADOPS_PERRENGUE_ADROTATE_EXEC_MODE,
      perrenguePortainerConfigured: Boolean(PORTAINER_URL && PORTAINER_API_KEY && ADOPS_PERRENGUE_WP_CONTAINER),
      perrengueSshConfigured: envPresent(perrengueSshEnvName),
      perrengueSshAuthOk: perrengueSshAuth.authOk,
      jobKindAllowed: kinds.includes("runtime-readiness-probe"),
    },
    categories: [
      {
        id: "api",
        title: "APIs usadas pelo runner",
        checks: namedChecks([
          { name: "OPS_API_BASE_URL", requiredFor: "Runner consumir fila operacional." },
          { name: "OPS_API_TOKEN", requiredFor: "Runner autenticar na API operacional." },
          { name: "PRIVATE_ADOPS_API_BASE_URL", requiredFor: "Runner consultar/corrigir dados pela API privada." },
          { name: "PRIVATE_ADOPS_API_TOKEN", requiredFor: "Runner autenticar na API privada." },
          { name: "OPS_JOB_KINDS", requiredFor: "Runner declarar quais jobs executa." },
        ]),
      },
      {
        id: "google-drive",
        title: "Google Drive e PI",
        checks: namedChecks([
          { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", requiredFor: "Ler PI e mídia do Google Drive via service account inline." },
          { name: "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", requiredFor: "Ler PI e mídia do Google Drive via arquivo service account." },
          { name: "GOOGLE_DRIVE_ACCESS_TOKEN", requiredFor: "Ler PI e mídia do Google Drive via access token." },
          { name: "GOOGLE_DRIVE_REFRESH_TOKEN", requiredFor: "Renovar OAuth do Google Drive." },
          { name: "GOOGLE_DRIVE_CLIENT_ID", requiredFor: "Renovar OAuth do Google Drive." },
          { name: "GOOGLE_DRIVE_CLIENT_SECRET", requiredFor: "Renovar OAuth do Google Drive." },
        ]),
      },
      {
        id: "telegram",
        title: "Telegram",
        checks: namedChecks([
          { name: "ADOPS_TELEGRAM_BOT_URL", requiredFor: "Enviar evidência pelo bridge/bot interno." },
          { name: "TELEGRAM_BOT_TOKEN", requiredFor: "Enviar evidência direto pela API do Telegram." },
          { name: "TELEGRAM_DEFAULT_GROUP_ID", requiredFor: "Enviar evidência no grupo padrão do Telegram." },
        ]),
      },
      {
        id: "mutation-policy",
        title: "Política de mutação e IA",
        checks: namedChecks([
          { name: "ADOPS_DRIVE_PI_ALLOW_MUTATION", requiredFor: "Permitir intake aplicar cadastro." },
          { name: "ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED", requiredFor: "Permitir reconciliação determinística criar/publicar somente itens canônicos." },
          { name: "ADOPS_PI_AGENT_ENABLED", requiredFor: "Permitir análise assistida de PI." },
          { name: "ADOPS_PI_AGENT_AUTO_APPLY", requiredFor: "Permitir auto-aplicação quando aprovado." },
          { name: "OPENAI_API_KEY", requiredFor: "Usar análise assistida de documentos quando habilitada." },
        ]),
      },
      {
        id: "adrotate",
        title: "AdRotate e WordPress",
        checks: namedChecks(
          ADOPS_PERRENGUE_ADROTATE_EXEC_MODE === "portainer"
            ? [
                { name: "PORTAINER_URL", requiredFor: "Executar WP-CLI do Perrengue no container VM8 via Portainer." },
                { name: "PORTAINER_API_KEY", requiredFor: "Autorizar execução no Portainer sem expor segredo." },
                { name: "ADOPS_PERRENGUE_WP_CONTAINER", requiredFor: "Identificar o container WordPress do Perrengue." },
              ]
            : [
                { name: perrengueSshEnvName, requiredFor: "Corrigir/publicar AdRotate do Perrengue via SSH/WP-CLI." },
              ],
        ).concat([
          {
            name: "PERRENGUE_SSH_AUTH",
            present: perrengueSshAuth.authOk,
            requiredFor: ADOPS_PERRENGUE_ADROTATE_EXEC_MODE === "portainer"
              ? "Fallback SSH do Perrengue; não é requisito quando o modo está em Portainer."
              : "Executar WP-CLI do Perrengue pelo job adrotate-publish.",
            status: perrengueSshAuth.authOk ? "ok" : (ADOPS_PERRENGUE_ADROTATE_EXEC_MODE === "portainer" ? "skipped" : "failed"),
            errorCode: perrengueSshAuth.errorCode,
          },
        ]),
      },
    ],
  };
  return { stage: "completed", runnerRuntimeReadiness };
}

async function executeDrivePiReconcile(payload) {
  const insertionId = Number(payload?.insertionId || 0);
  if (!Number.isInteger(insertionId) || insertionId <= 0) {
    throw new Error("drive-pi-reconcile exige insertionId positivo.");
  }
  const apply = payload?.apply === true;
  const canonicalPi = String(payload?.canonicalPi || "").trim() || null;
  const mediaUrl = String(payload?.mediaUrl || "").trim() || null;
  const selectedDriveFileId = String(payload?.selectedDriveFileId || "").trim() || null;
  const sourcePreflightJobId = String(payload?.sourcePreflightJobId || "").trim() || null;
  const confirmationNote = String(payload?.confirmationNote || "").trim() || null;
  const before = await privateApiGet(`/api/insertions/${insertionId}`);
  const consistency = await privateApiGet(`/api/insertions/${insertionId}/media-consistency`);
  const driveFiles = Array.isArray(consistency?.drive?.mediaFiles) ? consistency.drive.mediaFiles : [];
  let selectedDriveFile = selectedDriveFileId
    ? driveFiles.find((file) => String(file?.id || "") === selectedDriveFileId) || null
    : null;

  if (selectedDriveFileId && !selectedDriveFile && sourcePreflightJobId) {
    const preflightJob = await privateApiGet(`/api/ops/jobs/${encodeURIComponent(sourcePreflightJobId)}`);
    const execution = preflightJob?.result?.execution;
    const preflightCandidates = Array.isArray(execution?.mediaCandidates) ? execution.mediaCandidates : [];
    const resolvedFolderId = String(consistency?.drive?.folderId || "").trim();
    const preflightFolderId = String(execution?.driveFileId || "").trim();
    if (preflightJob?.kind !== "drive-pi-ingest" || preflightJob?.status !== "completed" || execution?.preflightOnly !== true) {
      throw new Error(`Job ${sourcePreflightJobId} não é um preflight Drive concluído.`);
    }
    if (!resolvedFolderId || preflightFolderId !== resolvedFolderId) {
      throw new Error(`Preflight ${sourcePreflightJobId} não pertence à pasta exata resolvida para a inserção ${insertionId}.`);
    }
    selectedDriveFile = preflightCandidates.find((file) => String(file?.driveFileId || "") === selectedDriveFileId) || null;
  }

  if (selectedDriveFileId && !selectedDriveFile) {
    throw new Error(`Arquivo Drive ${selectedDriveFileId} não pertence à pasta exata resolvida para a inserção ${insertionId}.`);
  }

  const proposal = {
    campaignPatch: canonicalPi && canonicalPi !== before?.piCodigo ? { piCodigo: canonicalPi } : null,
    insertionPatch: mediaUrl && mediaUrl !== before?.mediaUrl ? { mediaUrl } : null,
    selectedDriveFile: selectedDriveFile ? {
      id: selectedDriveFile.id ?? selectedDriveFile.driveFileId,
      name: selectedDriveFile.name,
      path: selectedDriveFile.path,
      sourcePreflightJobId,
    } : null,
    requiresDrivePublish: Boolean(selectedDriveFile && !mediaUrl),
  };

  if (!apply) {
    return {
      stage: "preview_ready",
      mode: "preview",
      insertionId,
      consistency,
      proposal,
      mutated: false,
    };
  }
  if (!confirmationNote || confirmationNote.length < 8) {
    throw new Error("Reconciliação apply exige confirmationNote rastreável.");
  }
  if (consistency?.issues?.includes("source_pi_conflict") && !canonicalPi) {
    throw new Error("Conflito de PI exige canonicalPi explícita antes da mutação.");
  }
  if (mediaUrl) {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== "https:" || /(^|\.)drive\.google\.com$/i.test(parsed.hostname) || /(^|\.)docs\.google\.com$/i.test(parsed.hostname)) {
      throw new Error("mediaUrl deve ser HTTPS pública canônica e não pode ser URL de visualização do Drive.");
    }
    const probe = await fetch(mediaUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!probe.ok) throw new Error(`mediaUrl canônica não respondeu HTTP válido: ${probe.status}.`);
  }

  const applied = [];
  if (proposal.campaignPatch) {
    await privateApiPatch(`/api/campaigns/${before.campanhaId}`, proposal.campaignPatch);
    applied.push("campaign.piCodigo");
  }
  if (proposal.insertionPatch) {
    const note = [
      String(before?.observacoes || "").trim(),
      `Reconciliação de fontes aplicada em ${new Date().toISOString()}: ${confirmationNote}`,
    ].filter(Boolean).join("\n");
    await privateApiPatch(`/api/insertions/${insertionId}`, { ...proposal.insertionPatch, observacoes: note });
    applied.push("insertion.mediaUrl");
  }

  return {
    stage: "completed",
    mode: "apply",
    insertionId,
    consistencyBefore: consistency,
    proposal,
    applied,
    mutated: applied.length > 0,
    after: await privateApiGet(`/api/insertions/${insertionId}`),
  };
}

async function executeOperationalMediaPublish(payload) {
  if (!["operational_identity", "sheet_drive_composite"].includes(payload?.identityMode)) throw new Error("Preflight operacional exige um modo de identidade suportado.");
  const insertionId = readPositiveInteger(payload?.expectedInsertionId);
  const campaignId = readPositiveInteger(payload?.expectedCampaignId);
  if (!insertionId || !campaignId || !payload?.fingerprint) throw new Error("Preflight operacional sem IDs canônicos ou fingerprint.");

  const pending = await privateApiGet(`/api/campaign-operations/pending-publication?date=${encodeURIComponent(payload?.targetDate || todayInCuiaba())}`);
  const liveItem = (pending?.items || []).find((item) => Number(item?.adops?.insertionId) === insertionId);
  validateCompositePendingGuard(liveItem, payload);

  const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
  const campaign = await privateApiGet(`/api/campaigns/${campaignId}`);
  const siteId = readPositiveInteger(insertion?.siteId ?? insertion?.site?.id);
  const site = siteId ? await privateApiGet(`/api/sites/${siteId}`) : null;
  validateOperationalPublicationScope({ campaignId, insertionId, siteSigla: site?.sigla, identityMode: payload?.identityMode });
  validateOperationalPublicationContract(payload, { insertion, campaign, site });

  const folderItems = await listDrivePiPackageItems(payload.folderId, payload.folderPath || "");
  const mediaId = firstNonEmptyString(payload?.media?.id, payload?.media?.driveFileId);
  const documentId = firstNonEmptyString(payload?.destinationDocument?.id, payload?.destinationDocument?.driveFileId);
  const pdfId = firstNonEmptyString(payload?.pdfDocument?.id, payload?.pdfDocument?.driveFileId);
  const mediaItem = folderItems.find((item) => item.driveFileId === mediaId);
  const destinationItem = documentId ? folderItems.find((item) => item.driveFileId === documentId) : null;
  const pdfItem = pdfId ? folderItems.find((item) => item.driveFileId === pdfId) : null;
  if (!mediaItem || (documentId && !destinationItem) || (payload.identityMode === "sheet_drive_composite" && !pdfItem)) throw new Error("Mídia, PDF ou documento exatos não pertencem mais à pasta operacional.");
  validateOperationalDriveItem(payload.media, mediaItem, "Mídia");
  if (destinationItem) validateOperationalDriveItem(payload.destinationDocument, destinationItem, "Documento de destino");
  if (payload.identityMode === "sheet_drive_composite") validateOperationalDriveItem(payload.pdfDocument, pdfItem, "PDF");
  const mediaCandidates = folderItems.filter((item) => isImageMediaItem(item) || isVideoMediaItem(item));
  const pdfCandidates = folderItems.filter((item) => item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name));
  const textCandidates = folderItems.filter((item) => item.mimeType === "text/plain" || item.mimeType === "application/vnd.google-apps.document" || /\.txt$/i.test(item.name));
  if (mediaCandidates.length !== 1 || textCandidates.length > 1 || (payload.identityMode === "sheet_drive_composite" && pdfCandidates.length !== 1)) throw new Error("Pasta operacional deixou de conter uma única mídia, um destino opcional inequívoco e o PDF esperado.");

  const observations = destinationItem ? await readDriveTextObservations([destinationItem]) : [];
  const destination = resolveOptionalOperationalDestination(observations);
  const destinationUrl = destination.url;
  if (destinationUrl) await assertPublicOperationalDestination(destinationUrl);
  if (payload.identityMode === "sheet_drive_composite") {
    const pdfArchive = await materializeMediaSource({ driveItem: pdfItem, fallbackName: pdfItem.name || "documento.pdf" });
    const parsedPdf = await parseDrivePiPdfFields(pdfArchive);
    validateCompositePdfEvidence({ expectedPiCodigo: payload.expectedPiCodigo, expectedDocument: payload.pdfDocument, archive: pdfArchive, parsedPdf });
  }
  const materialized = await materializeMediaSource({ driveItem: mediaItem, fallbackName: mediaItem.name || "banner.gif" });
  if (!payload?.media?.md5Checksum) throw new Error("Snapshot operacional não possui checksum autoritativo da mídia; atualize o inventário antes de publicar.");
  if (String(materialized.md5 || "").toLowerCase() !== String(payload.media.md5Checksum).toLowerCase()) throw new Error("Checksum do binário baixado diverge do snapshot aprovado; nenhuma mutação foi aplicada.");
  if (payload?.media?.size && Number(materialized.bytes) !== Number(payload.media.size)) throw new Error("Tamanho do binário baixado diverge do snapshot aprovado; nenhuma mutação foi aplicada.");
  const mediaProfile = await loadOperationalMediaProfile(site?.sigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
  const approvedMediaProfile = normalizeOperationalMediaProfile(payload?.mediaProfile);
  if (!approvedMediaProfile || JSON.stringify(mediaProfile) !== JSON.stringify(approvedMediaProfile)) {
    throw new Error("Perfil de mídia/transformação mudou desde o fingerprint aprovado; nenhuma mutação foi aplicada.");
  }
  const deliveryMedia = await prepareOperationalDeliveryMedia(materialized.filePath, mediaProfile);
  const mediaMetadata = deliveryMedia.metadata;
  const mediaFormat = String(mediaMetadata.format || "GIF").toUpperCase();
  const deliveryBuffer = deliveryMedia.transformed ? await readFile(deliveryMedia.filePath) : materialized.buffer;
  const deliverySha256 = crypto.createHash("sha256").update(deliveryBuffer).digest("hex");
  const deliveryExtension = mediaFormat === "MP4" ? ".mp4" : ".gif";
  const deliverySourceName = deliveryMedia.transformed
    ? `${path.basename(materialized.sourceName || "banner", path.extname(materialized.sourceName || ""))}-${mediaMetadata.width}x${mediaMetadata.height}${deliveryExtension}`
    : materialized.sourceName;
  if (!readPositiveInteger(mediaProfile.groupId)) throw new Error("Formato/Perrengue não resolveu um grupo AdRotate válido na configuração vigente.");

  const siteSigla = firstNonEmptyString(site?.sigla, payload?.expectedSiteSigla);
  const fields = { campaignName: campaign?.nome || liveItem?.campaignName || "RADAR", operationalIdentityKey: `insertion-${insertionId}` };
  const raw = {
    siteId,
    siteSigla,
    localFormato: insertion.localFormato,
    localFormatoNormalizado: insertion.localFormatoNormalizado,
    periodoInicio: insertion.periodoInicio,
  };
  const bucket = spacesBucketForSite(siteSigla);
  const objectKey = buildSpacesImageObjectKey({ siteSigla, fields, raw, sourceName: deliverySourceName, contentHash: deliverySha256 });
  await uploadBufferToSpaces({ buffer: deliveryBuffer, bucket, objectKey, contentType: mediaFormat === "MP4" ? "video/mp4" : "image/gif" });
  const stagedUrl = mediaPublicUrl(siteSigla, bucket, objectKey);
  const stagedReadback = await assertOperationalMediaReadback({
    mediaUrl: stagedUrl,
    expectedSha256: deliverySha256,
    expectedProfile: { ...mediaProfile, format: mediaFormat },
    archivePath: deliveryMedia.filePath,
  });
  const mediaKey = crypto.createHash("sha256").update(["operational_identity", insertionId, deliverySha256].join(":" )).digest("hex");
  const wordpressImport = String(siteSigla).toUpperCase() === "PERRENGUE"
    ? await importPerrengueMediaFromUrl({ sourceUrl: stagedUrl, filename: deliverySourceName, mediaKey })
    : null;
  const mediaUrl = wordpressImport?.url || stagedUrl;
  const canonicalReadback = mediaUrl === stagedUrl
    ? stagedReadback
    : await assertOperationalMediaReadback({
        mediaUrl,
        expectedSha256: deliverySha256,
        expectedProfile: { ...mediaProfile, format: mediaFormat },
        archivePath: deliveryMedia.filePath,
      });
  const [latestInsertion, latestCampaign] = await Promise.all([
    privateApiGet(`/api/insertions/${insertionId}`),
    privateApiGet(`/api/campaigns/${campaignId}`),
  ]);
  const latestSiteId = readPositiveInteger(latestInsertion?.siteId ?? latestInsertion?.site?.id);
  const latestSite = latestSiteId ? await privateApiGet(`/api/sites/${latestSiteId}`) : null;
  validateOperationalPublicationContract(payload, { insertion: latestInsertion, campaign: latestCampaign, site: latestSite });
  const externalKey = `ADOPS-${String(siteSigla).toUpperCase()}-${insertionId}`;
  const adrotateSnapshot = await snapshotSiteAdrotate({ site: latestSite, siteSigla, insertionId, externalKey });
  let preview;
  let published;
  let insertionPatched = false;
  let patchedInsertion = null;
  try {
    patchedInsertion = await privateApiPatch(`/api/insertions/${insertionId}`, {
      expectedUpdatedAt: latestInsertion.updatedAt,
      mediaUrl,
      observacoes: [
        latestInsertion.observacoes,
        destinationUrl ? `Link destino informado: ${destinationUrl}` : "Banner informativo publicado sem link de direcionamento.",
        `Mídia ${mediaFormat} validada por identidade operacional em ${new Date().toISOString()} (Drive ${mediaId}; ${mediaMetadata.width}x${mediaMetadata.height}${mediaMetadata.frames ? `; ${mediaMetadata.frames} frame(s)` : ""}).`,
        deliveryMedia.transformed
          ? `Derivação de entrega auditável: original ${deliveryMedia.source.width}x${deliveryMedia.source.height} preservado; canvas ${mediaMetadata.width}x${mediaMetadata.height} por ${deliveryMedia.transform.mode}; SHA-256 origem ${materialized.sha256}; SHA-256 entrega ${deliverySha256}.`
          : null,
        payload.identityMode === "operational_identity"
          ? "PI/PDF autoritativa permanece pendente para faturamento e agrupamento comercial."
          : `Identidade composta confirmada por planilha, inserção canônica e pasta Drive (PI ${payload.expectedPiCodigo}).`,
      ].filter(Boolean).join("\n"),
    });
    insertionPatched = true;

    const publicationGuard = {
      expectedCampaignId: campaignId,
      expectedInsertionId: insertionId,
      expectedSiteSigla: siteSigla,
      expectedFormat: payload.expectedFormat,
      expectedPeriodStart: payload.expectedPeriodStart,
      expectedPeriodEnd: payload.expectedPeriodEnd,
      expectedMediaUrl: mediaUrl,
      expectedPiCodigo: payload.expectedPiCodigo,
      identityMode: payload.identityMode,
      destinationMode: destination.mode,
      destinationUrl,
      fingerprint: payload.fingerprint,
      expectedUpdatedAt: patchedInsertion?.updatedAt,
    };
    const publishBase = { insertionId, identityMode: payload.identityMode, replaceExisting: false, purgeCache: true, generateEvidence: false, date: payload?.targetDate, publicationGuard };
    preview = await executeAdrotatePublishJob({ ...publishBase, apply: false });
    published = await executeAdrotatePublishJob({ ...publishBase, apply: true });
    let historicalSnapshotOk = false;
    if (String(latestInsertion.periodoFim || "") < todayInCuiaba() && published?.wpCliResult?.ad_id) {
      const afterSnapshot = await snapshotSiteAdrotate({ site: latestSite, siteSigla, insertionId, externalKey });
      historicalSnapshotOk = isAdrotateSnapshotPublicationConfirmed(afterSnapshot, {
        adId: published.wpCliResult.ad_id,
        groupId: published.wpCliResult.group_id,
        scheduleId: published.wpCliResult.schedule_id,
        insertionId,
        externalKey,
        mediaBasename: mediaBasenameFromUrl(mediaUrl),
      });
    }
    if (!published?.wpCliResult?.ad_id || (published?.relationOk !== true && published?.historicalRelationOk !== true && historicalSnapshotOk !== true && published?.publicHtmlValidation?.ok !== true)) {
      const diagnostic = {
        adId: published?.wpCliResult?.ad_id ?? null,
        groupId: published?.wpCliResult?.group_id ?? null,
        scheduleId: published?.wpCliResult?.schedule_id ?? null,
        relationOk: published?.relationOk === true,
        historicalRelationOk: published?.historicalRelationOk === true,
        historicalSnapshotOk,
        publicHtmlOk: published?.publicHtmlValidation?.ok === true,
      };
      throw new Error(`Publicação operacional da inserção ${insertionId} não passou nos gates AdRotate/HTML: ${JSON.stringify(diagnostic)}.`);
    }
  } catch (error) {
    const rollbackErrors = [];
    if (insertionPatched) {
      await privateApiPatch(`/api/insertions/${insertionId}`, {
        expectedUpdatedAt: published?.insertionAfterPublish?.updatedAt || patchedInsertion?.updatedAt,
        mediaUrl: latestInsertion.mediaUrl ?? null,
        observacoes: latestInsertion.observacoes ?? null,
        bannerPublicadoNoSite: latestInsertion.bannerPublicadoNoSite === true,
        statusNormalizado: latestInsertion.statusNormalizado,
      }).catch((rollbackError) => rollbackErrors.push(`insertion:${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`));
    }
    let adrotateRestored = false;
    await restoreSiteAdrotate({ site: latestSite, siteSigla, insertionId, externalKey, snapshot: adrotateSnapshot })
      .then(() => { adrotateRestored = true; })
      .catch((rollbackError) => rollbackErrors.push(`adrotate:${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`));
    if (adrotateRestored) {
      const previousAd = selectCanonicalSnapshotAd(adrotateSnapshot);
      const previousMediaBasename = firstNonEmptyString(previousAd?.adops_media_basename, mediaBasenameFromUrl(previousAd?.image));
      const rebuildRestoredConsumer = String(siteSigla).toUpperCase() === "PERRENGUE"
        ? executePerrengueHeadlessRebuild({
            insertionId,
            adId: readPositiveInteger(previousAd?.id) || 0,
            mediaBasename: previousMediaBasename || mediaBasenameFromUrl(mediaUrl),
            purgeCache: true,
            operation: "rollback",
          })
        : Promise.resolve({ skipped: true, reason: "wordpress_public_consumer" });
      await rebuildRestoredConsumer.then(async () => {
        const publicRollback = previousAd
          ? await validateRestoredAdHtml({ site, insertionId, previousAdId: readPositiveInteger(previousAd.id), previousMediaBasename, rejectedMediaBasename: mediaBasenameFromUrl(mediaUrl) })
          : await validateMediaAbsentFromPublicHtml({ site, insertionId, mediaBasename: mediaBasenameFromUrl(mediaUrl) });
        if (publicRollback?.ok !== true) throw new Error("HTML público não confirmou o estado restaurado.");
      }).catch((rollbackError) => rollbackErrors.push(`public-consumer:${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`));
    }
    const suffix = rollbackErrors.length ? ` Rollback incompleto: ${rollbackErrors.join("; ")}` : " Rollback da inserção e AdRotate confirmado; mídia órfã permanece recuperável.";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
  }
  return {
    stage: "published",
    insertionId,
    campaignId,
    identityMode: payload.identityMode,
    commercialIdentityStatus: payload.identityMode === "sheet_drive_composite" ? "confirmed" : "awaiting_authoritative_pi",
    media: {
      sourceDriveFileId: mediaId,
      stagedUrl,
      mediaUrl,
      metadata: mediaMetadata,
      transformed: deliveryMedia.transformed,
      sourceMetadata: deliveryMedia.source,
      sourceSha256: materialized.sha256,
      deliverySha256,
      stagedReadback,
      canonicalReadback,
    },
    destinationMode: destination.mode,
    destinationUrl,
    preview,
    published,
  };
}

async function executeCampaignPublicationReconcile(job) {
  const cod5_targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(job?.payload?.targetDate || ""))
    ? String(job.payload.targetDate)
    : todayInCuiaba();
  const cod5_source = String(job?.payload?.source || "").trim();
  const cod5_automaticSource = ["google-drive-monitor", "cloudflare-cron-campaign-publication-reconcile"].includes(cod5_source);
  const cod5_requestedMode = job?.payload?.mode === "preflight" ? "preflight" : "apply";
  const cod5_apply = cod5_requestedMode === "apply" && (!cod5_automaticSource || ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED);
  const cod5_mode = cod5_apply ? "apply" : "preflight";
  await progressJob(job.id, {
    stage: "consultando campanhas pendentes",
    stageKey: "collecting",
    targetDate: cod5_targetDate,
    mode: cod5_mode,
    automationEnabled: ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED,
    percentTotal: 10,
  });
  let cod5_sheetSync = { skipped: true, reason: "preflight_only" };
  if (cod5_apply) {
    await progressJob(job.id, {
      stage: "sincronizando planilha canônica",
      stageKey: "syncing_sheet",
      targetDate: cod5_targetDate,
      mode: cod5_mode,
      percentTotal: 15,
    });
    cod5_sheetSync = await executeSyncPlanilha({ mode: "campaign-publication-reconcile" });
  }
  const cod5_pending = await privateApiGet(`/api/campaign-operations/pending-publication?date=${encodeURIComponent(cod5_targetDate)}`);
  const cod5_checkedAt = new Date().toISOString();
  const cod5_requestedInsertionId = readPositiveInteger(job?.payload?.insertionId);
  const cod5_items = cod5_requestedInsertionId
    ? (cod5_pending?.items || []).filter((item) => Number(item?.adops?.insertionId) === cod5_requestedInsertionId)
    : cod5_pending?.items;
  if (cod5_requestedInsertionId && !cod5_items.length) throw new Error(`Inserção ${cod5_requestedInsertionId} não está na fila de publicação.`);
  const cod5_plan = planCampaignPublicationReconciliation(cod5_items, cod5_checkedAt, { mode: cod5_mode });
  if (cod5_automaticSource && !ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED) {
    cod5_plan.blockers.unshift({
      insertionId: null,
      code: "automatic_publication_disabled",
      reason: "A automação está em observação; ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED ainda não foi habilitada.",
    });
  }
  const cod5_results = [];
  let cod5_done = 0;
  if (!cod5_apply) {
    return {
      stage: "preflight",
      targetDate: cod5_targetDate,
      checkedAt: cod5_checkedAt,
      mode: cod5_mode,
      automationEnabled: ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED,
      sheetSync: cod5_sheetSync,
      actionsPlanned: cod5_plan.actions.length,
      actionsCompleted: 0,
      blockers: cod5_plan.blockers,
      actions: cod5_plan.actions,
      nextAction: cod5_plan.actions.length ? "enable_or_request_apply" : "resolve_blockers",
    };
  }
  for (const cod5_action of cod5_plan.actions) {
    await progressJob(job.id, {
      stage: "retomando publicações liberadas",
      stageKey: "processing",
      targetDate: cod5_targetDate,
      itemsDone: cod5_done,
      itemsTotal: cod5_plan.actions.length,
      blockers: cod5_plan.blockers,
      percentTotal: 20 + Math.round((cod5_done / Math.max(1, cod5_plan.actions.length)) * 70),
    });
    if (cod5_action.type === "drive_pi_publish") {
      cod5_results.push({
        type: cod5_action.type,
        insertionId: cod5_action.insertionId,
        result: await executeDrivePiIngest(cod5_action.event),
      });
    } else if (cod5_action.type === "operational_media_publish") {
      cod5_results.push({
        type: cod5_action.type,
        insertionId: cod5_action.insertionId,
        result: await executeOperationalMediaPublish({ ...cod5_action.payload, targetDate: cod5_targetDate }),
      });
    } else if (cod5_action.type === "adrotate_publish") {
      cod5_results.push({
        type: cod5_action.type,
        insertionId: cod5_action.insertionId,
        result: await executeAdrotatePublishJob({ ...cod5_action.payload, date: cod5_targetDate }),
      });
    }
    cod5_done += 1;
  }
  return {
    stage: cod5_plan.actions.length ? "completed" : "waiting_sources",
    targetDate: cod5_targetDate,
    checkedAt: cod5_checkedAt,
    mode: cod5_mode,
    automationEnabled: ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED,
    sheetSync: cod5_sheetSync,
    actionsPlanned: cod5_plan.actions.length,
    actionsCompleted: cod5_results.length,
    blockers: cod5_plan.blockers,
    results: cod5_results,
  };
}

async function sendTelegramPhotoDirect({ chatId, photo, caption }) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      photo,
      caption,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram sendPhoto falhou: ${response.status}`);
  }
  return {
    ok: true,
    mode: "direct",
    messageId: payload?.result?.message_id ?? null,
    date: payload?.result?.date ?? null,
  };
}

function resolveAnalyticsConfig(payload) {
  const propertyKey = String(payload?.propertyKey || "").trim().toLowerCase();
  const reportConfigName = String(payload?.reportConfigName || ANALYTICS_SITE_CONFIGS[propertyKey] || "").trim();
  if (!reportConfigName) {
    throw new Error(`propertyKey/reportConfigName sem mapeamento para Analytics: ${propertyKey || "vazio"}`);
  }
  return {
    propertyKey,
    reportConfigName,
    envFile: path.join(ANALYTICS_REPORT_PROJECT_ROOT, "configs", `${reportConfigName}.env`),
  };
}

function sanitizeAnalyticsNamePart(value, fallback = "ITEM") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return normalized || fallback;
}

function compactTimestamp(date = new Date()) {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function buildAnalyticsReportFileBase(payload) {
  return [
    sanitizeAnalyticsNamePart(payload?.siteSigla, "SITE"),
    sanitizeAnalyticsNamePart(payload?.campaignName, "CAMPANHA"),
    sanitizeAnalyticsNamePart(payload?.clientName, "CLIENTE"),
    sanitizeAnalyticsNamePart(payload?.piCodigo ? `PI_${payload.piCodigo}` : "", "PI"),
    sanitizeAnalyticsNamePart(payload?.periodStart, "INICIO"),
    sanitizeAnalyticsNamePart(payload?.periodEnd, "FIM"),
    "ANALYTICS",
    compactTimestamp(),
  ].join("_");
}

function extractTaggedValue(stdout, tag) {
  const match = String(stdout || "").match(new RegExp(`^${tag}:\\s+(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

async function executeAnalyticsReport(payload) {
  if (!payload?.insertionId) {
    throw new Error("analytics-report sem insertionId.");
  }
  if (!payload?.periodStart || !payload?.periodEnd) {
    throw new Error("analytics-report sem periodStart/periodEnd.");
  }

  const cfg = resolveAnalyticsConfig(payload);
  const reportFileBase = buildAnalyticsReportFileBase(payload);
  if (ANALYTICS_REPORT_HOOK_URL) {
    const response = await fetch(ANALYTICS_REPORT_HOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "range",
        startDate: String(payload.periodStart),
        endDate: String(payload.periodEnd),
        onlyPdf: true,
        publishToSpaces: true,
        envFile: `configs/${cfg.reportConfigName}.env`,
        reportFileDomain: reportFileBase,
        reportFileNameTemplate: "{domain}",
        timeoutSeconds: 600,
      }),
    });
    const hookPayload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(hookPayload?.error || hookPayload?.details || `Hook de Analytics falhou (${response.status}).`);
    }
    const downloadUrl = String(hookPayload?.downloadUrl || "").trim();
    const reportPath = String(hookPayload?.filePaths?.pdf || "").trim();
    if (!downloadUrl) {
      throw new Error("Hook de Analytics concluiu sem downloadUrl.");
    }
    return {
      propertyKey: cfg.propertyKey,
      reportConfigName: cfg.reportConfigName,
      insertionId: payload.insertionId,
      campaignId: payload?.campaignId ?? null,
      piCodigo: payload?.piCodigo ?? null,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      reportPath,
      downloadUrl,
      previewUrl: String(hookPayload?.previewUrl || downloadUrl),
      generatedAt: String(hookPayload?.finishedAt || new Date().toISOString()),
      hook: true,
      hookUrl: ANALYTICS_REPORT_HOOK_URL,
      hookResult: hookPayload,
    };
  }

  const reportArgs = [
    "-m",
    "src.main",
    "--env",
    cfg.envFile,
    "--start-date",
    String(payload.periodStart),
    "--end-date",
    String(payload.periodEnd),
    "--only-pdf",
  ];

  const { stdout, stderr } = await execFileAsync(ANALYTICS_REPORT_PYTHON, reportArgs, {
    cwd: ANALYTICS_REPORT_PROJECT_ROOT,
    env: {
      ...process.env,
      TELEGRAM_ENABLED: "false",
    },
    maxBuffer: 1024 * 1024 * 10,
  });

  const reportPath = extractTaggedValue(stdout, "pdf");
  if (!reportPath) {
    throw new Error(`Relatório gerado sem caminho de PDF no stdout. stderr=${String(stderr || "").slice(-1000)}`);
  }

  const publishArgs = [
    path.join(ANALYTICS_REPORT_PROJECT_ROOT, "scripts", "publish_to_spaces.py"),
    reportPath,
    "--env",
    cfg.envFile,
  ];
  const publish = await execFileAsync(ANALYTICS_REPORT_PYTHON, publishArgs, {
    cwd: ANALYTICS_REPORT_PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  const downloadUrl = String(publish.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("http"));

  if (!downloadUrl) {
    throw new Error(`Publicação no Spaces não retornou URL pública. stdout=${String(publish.stdout || "").slice(-1000)}`);
  }

  return {
    propertyKey: cfg.propertyKey,
    reportConfigName: cfg.reportConfigName,
    insertionId: payload.insertionId,
    campaignId: payload?.campaignId ?? null,
    piCodigo: payload?.piCodigo ?? null,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    reportPath,
    downloadUrl,
    previewUrl: downloadUrl,
    generatedAt: new Date().toISOString(),
    stdout: safeProcessOutput(stdout),
    stderr: safeProcessOutput(stderr),
    publishStdout: safeProcessOutput(publish.stdout),
    publishStderr: safeProcessOutput(publish.stderr),
  };
}

async function progressJob(jobId, result) {
  await request(`/api/ops/runner/jobs/${encodeURIComponent(jobId)}/progress`, {
    method: "POST",
    body: JSON.stringify({
      runnerId: RUNNER_ID,
      result,
    }),
  });
}

function normalizePiDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00-04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIsoDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eachIsoDay(start, end) {
  const days = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    days.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function waitForAnalyticsJob(jobId, timeoutMs = 12 * 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const payload = await request(`/api/analytics/jobs/${encodeURIComponent(jobId)}`);
    if (payload?.status === "completed") return payload;
    if (payload?.status === "failed") {
      throw new Error(payload?.error || `Job de Analytics ${jobId} falhou.`);
    }
    await sleep(5000);
  }
  throw new Error(`Timeout aguardando job de Analytics ${jobId}.`);
}

async function ensureAnalyticsMode(insertion, periodMode) {
  const requirements = await request(`/api/analytics/insertions/${insertion.id}/requirements`);
  if (!requirements?.propertyKey) {
    throw new Error(`O site ${insertion.siteSigla || "sem-site"} não possui configuração de Analytics para liberar o ZIP.`);
  }

  const desiredOption = Array.isArray(requirements.periodOptions)
    ? requirements.periodOptions.find((item) => item?.mode === periodMode)
    : null;
  if (!desiredOption?.periodStart || !desiredOption?.periodEnd) {
    throw new Error(`A inserção #${insertion.id} não tem período resolvido para Analytics (${periodMode}).`);
  }

  const reportsPayload = await request(`/api/analytics/insertions/${insertion.id}/reports`);
  const reports = Array.isArray(reportsPayload?.reports) ? reportsPayload.reports : [];
  const existing = reports.find((item) =>
    item?.status === "completed" &&
    item?.periodMode === periodMode &&
    item?.periodStart === desiredOption.periodStart &&
    item?.periodEnd === desiredOption.periodEnd &&
    item?.downloadUrl,
  );
  if (existing) {
    return {
      mode: periodMode,
      status: "completed",
      reportId: existing.id,
      downloadUrl: existing.downloadUrl,
      periodStart: desiredOption.periodStart,
      periodEnd: desiredOption.periodEnd,
      reused: true,
    };
  }

  const requested = await request("/api/analytics/jobs/request-report", {
    method: "POST",
    body: JSON.stringify({
      insertionId: insertion.id,
      periodMode,
      requestedBy: RUNNER_ID,
      source: "pi-site-export",
    }),
  });
  const finalJob = await waitForAnalyticsJob(requested.jobId);
  const execution = (finalJob?.result?.execution ?? finalJob?.result ?? {}) || {};
  if (!execution.downloadUrl) {
    throw new Error(`O job de Analytics ${requested.jobId} concluiu sem downloadUrl para ${periodMode}.`);
  }
  return {
    mode: periodMode,
    status: "completed",
    jobId: requested.jobId,
    reportId: finalJob.id,
    downloadUrl: execution.downloadUrl,
    periodStart: desiredOption.periodStart,
    periodEnd: desiredOption.periodEnd,
    reused: false,
  };
}

async function ensureAnalyticsModeBestEffort(insertion, periodMode) {
  try {
    return await ensureAnalyticsMode(insertion, periodMode);
  } catch (error) {
    return {
      mode: periodMode,
      status: "skipped",
      optional: true,
      reason: "analytics_unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensureOperationalDocuments(insertion) {
  const docs = await privateApiGet(`/api/insertions/${insertion.id}/operational-documents`);
  const visibleDocs = Array.isArray(docs?.documents) ? docs.documents : [];
  if (visibleDocs.length >= 2) {
    return { status: "ready", regenerated: false, total: visibleDocs.length };
  }
  const regenerated = await privateApi(`/api/insertions/${insertion.id}/operational-documents/regenerate`, {});
  return {
    status: "ready",
    regenerated: true,
    total: Array.isArray(regenerated?.documents) ? regenerated.documents.length : visibleDocs.length,
  };
}

async function captureProofWithRetry(insertionId, targetDate, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const alternateCaptureAt = attempt === 2
        ? `${targetDate}T18:00`
        : attempt === 3
          ? `${targetDate}T20:00`
          : null;
      return await privateApi(`/api/insertions/${insertionId}/capture-proof`, {
        date: targetDate,
        ...(alternateCaptureAt ? { captureAt: alternateCaptureAt } : {}),
        replace: true,
        force: true,
        candidate: true,
        promote: true,
      });
    } catch (error) {
      lastError = error;
      const status = await privateApiGet(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(targetDate)}`)
        .catch(() => null);
      const proof = status?.audit?.retroContentProof;
      if (
        status?.status === "audited"
        && proof?.status === "approved"
        && proof?.futureCount === 0
        && typeof proof?.manifestHash === "string"
        && proof.manifestHash.length === 64
      ) {
        return { ok: true, recoveredAfterError: true, capture: { status: "ok" } };
      }
      if (attempt >= maxAttempts) break;
      const delayMs = attempt * 2_000;
      console.warn(`[runner] captura ${insertionId}/${targetDate} falhou; retry ${attempt + 1}/${maxAttempts} em ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Falha ao capturar inserção ${insertionId} em ${targetDate}.`);
}

async function ensureInsertionCaptureCoverage(insertion, requiredDatesOverride = null) {
  const start = parseIsoDate(insertion.periodoInicio);
  const end = parseIsoDate(insertion.periodoFim);
  const today = parseIsoDate(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()));
  if (!start || !end) {
    throw new Error(`A inserção #${insertion.id} não possui período válido para conferir evidências.`);
  }
  const effectiveEnd = today && end > today ? today : end;
  if (effectiveEnd < start) {
    return {
      invalidatedEvidenceIds: [],
      regeneratedDates: [],
      finalStatuses: [],
    };
  }

  const invalidatedEvidenceIds = [];
  const regeneratedDates = [];
  const firstPassDates = Array.isArray(requiredDatesOverride)
    ? Array.from(new Set(requiredDatesOverride.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date))))).sort()
    : eachIsoDay(start, effectiveEnd);
  const firstPassStatuses = await Promise.all(firstPassDates.map((date) => privateApiGet(`/api/insertions/${insertion.id}/capture-proof/status?date=${encodeURIComponent(date)}`)));
  const hasInvalid = firstPassStatuses.some((item) => item?.status === "invalid_audit" || item?.status === "invalid_url");
  if (hasInvalid && !Array.isArray(requiredDatesOverride)) {
    const fixed = await privateApi(`/api/insertions/${insertion.id}/capture-proof/fix-invalid`, {});
    if (Array.isArray(fixed?.deletedEvidenceIds)) {
      invalidatedEvidenceIds.push(...fixed.deletedEvidenceIds);
    }
    if (Array.isArray(fixed?.items)) {
      for (const item of fixed.items) {
        if (item?.status === "ok" && item?.date) regeneratedDates.push(item.date);
      }
    }
  }

  const secondPassStatuses = await Promise.all(firstPassDates.map((date) => privateApiGet(`/api/insertions/${insertion.id}/capture-proof/status?date=${encodeURIComponent(date)}`)));
  for (const status of secondPassStatuses) {
    const proof = status?.audit?.retroContentProof;
    const strictAuditApproved = status?.status === "audited"
      && proof?.status === "approved"
      && proof?.futureCount === 0
      && typeof proof?.manifestHash === "string"
      && proof.manifestHash.length === 64;
    if (strictAuditApproved) continue;
    const targetDate = status?.date;
    if (!targetDate) continue;
    const result = await captureProofWithRetry(insertion.id, targetDate);
    if (result?.capture?.status === "ok" || result?.ok === true) {
      regeneratedDates.push(targetDate);
    }
  }

  const finalStatuses = await Promise.all(firstPassDates.map((date) => privateApiGet(`/api/insertions/${insertion.id}/capture-proof/status?date=${encodeURIComponent(date)}`)));
  const failed = finalStatuses.filter((item) => {
    const proof = item?.audit?.retroContentProof;
    return item?.status !== "audited"
      || proof?.status !== "approved"
      || proof?.futureCount !== 0
      || typeof proof?.manifestHash !== "string"
      || proof.manifestHash.length !== 64;
  });
  if (failed.length) {
    throw new Error(`A inserção #${insertion.id} ainda tem ${failed.length} evidência(s) sem prova editorial retroativa aprovada.`);
  }

  return {
    invalidatedEvidenceIds,
    regeneratedDates,
    finalStatuses,
  };
}

async function executePiSiteExport(job) {
  const payload = job?.payload || {};
  const piCodigo = normalizePiDigits(payload.piCodigo);
  const siteSigla = String(payload.siteSigla || "").trim().toUpperCase();
  const mode = ["full", "prints-only", "pdf", "full-pdf"].includes(String(payload.mode || "").toLowerCase())
    ? String(payload.mode).toLowerCase()
    : "full";
  const variant = mode === "pdf" || mode === "full-pdf"
    ? "web"
    : String(payload.variant || "").toLowerCase() === "web"
      ? "web"
      : "original";
  const pdfMaxWidth = Math.max(800, Math.min(2560, Number.parseInt(String(payload.pdfMaxWidth || "1920"), 10) || 1920));
  const pdfQuality = Math.max(45, Math.min(85, Number.parseInt(String(payload.pdfQuality || "68"), 10) || 68));
  const pdfResolution = Math.max(72, Math.min(180, Number.parseInt(String(payload.pdfResolution || "120"), 10) || 120));
  const imageMaxWidth = Math.max(800, Math.min(2560, Number.parseInt(String(payload.imageMaxWidth || "1600"), 10) || 1600));
  const imageQuality = Math.max(45, Math.min(90, Number.parseInt(String(payload.imageQuality || "72"), 10) || 72));
  if (!piCodigo || !siteSigla) {
    throw new Error("pi-site-export sem piCodigo/siteSigla válidos.");
  }

  const descriptor = await privateApiGet(`/api/pi-site-exports?piCodigo=${encodeURIComponent(piCodigo)}&siteSigla=${encodeURIComponent(siteSigla)}`);
  const preferredInsertionIds = mode === "full" ? descriptor?.exportableInsertionIds : descriptor?.evidenceInsertionIds;
  const operationalInsertionIds = Array.isArray(preferredInsertionIds)
    ? preferredInsertionIds
    : Array.isArray(descriptor?.exportableInsertionIds)
      ? descriptor.exportableInsertionIds
    : Array.isArray(descriptor?.operationalInsertionIds)
      ? descriptor.operationalInsertionIds
    : descriptor?.insertionIds;
  if (!operationalInsertionIds?.length) {
    throw new Error(`Nenhuma inserção encontrada para PI ${piCodigo} no site ${siteSigla}.`);
  }

  const insertions = await Promise.all(operationalInsertionIds.map((id) => privateApiGet(`/api/insertions/${id}`)));
  const invalidatedEvidenceIds = [];
  const regeneratedDates = [];
  const analyticsPiStatus = [];
  const analyticsFullMonthStatus = [];
  const stagePayload = {
    piCodigo,
    siteSigla,
    insertionIds: operationalInsertionIds,
    mode,
    variant,
    pdfMaxWidth,
    pdfQuality,
    pdfResolution,
    imageMaxWidth,
    imageQuality,
  };

  await progressJob(job.id, { stage: "reauditando evidências", ...stagePayload });
  for (const insertion of insertions) {
    const capture = await ensureInsertionCaptureCoverage(insertion);
    invalidatedEvidenceIds.push(...capture.invalidatedEvidenceIds);
    regeneratedDates.push(...capture.regeneratedDates.map((date) => ({ insertionId: insertion.id, date })));
  }

  if (mode !== "prints-only") {
    await progressJob(job.id, { stage: "garantindo documentos operacionais", ...stagePayload, regeneratedDates, invalidatedEvidenceIds });
    for (const insertion of insertions) {
      await ensureOperationalDocuments(insertion);
    }

    await progressJob(job.id, { stage: "gerando analytics pi", ...stagePayload, regeneratedDates, invalidatedEvidenceIds });
    for (const insertion of insertions) {
      analyticsPiStatus.push({ insertionId: insertion.id, ...(await ensureAnalyticsModeBestEffort(insertion, "pi")) });
    }

    await progressJob(job.id, { stage: "gerando analytics full_month", ...stagePayload, regeneratedDates, invalidatedEvidenceIds, analyticsPiStatus });
    for (const insertion of insertions) {
      analyticsFullMonthStatus.push({ insertionId: insertion.id, ...(await ensureAnalyticsModeBestEffort(insertion, "full_month")) });
    }
  }

  await progressJob(job.id, {
    stage: mode === "pdf" ? "montando pdf comprimido" : mode === "full-pdf" ? "montando zip com pdf comprimido" : "montando zip final",
    ...stagePayload,
    regeneratedDates,
    invalidatedEvidenceIds,
    analyticsPiStatus,
    analyticsFullMonthStatus,
  });
  const downloadParams = new URLSearchParams({
    piCodigo,
    siteSigla,
    download: "1",
    mode,
    variant,
    pdfMaxWidth: String(pdfMaxWidth),
    pdfQuality: String(pdfQuality),
    pdfResolution: String(pdfResolution),
    imageMaxWidth: String(imageMaxWidth),
    imageQuality: String(imageQuality),
  });
  await progressJob(job.id, {
    stage: "materializando artefato comprimido",
    ...stagePayload,
    regeneratedDates,
    invalidatedEvidenceIds,
    analyticsPiStatus,
    analyticsFullMonthStatus,
  });
  const artifact = await privateApiDownload(`/api/pi-site-exports?${downloadParams.toString()}`);
  const artifactExtension = artifact.contentType === "application/pdf" ? ".pdf" : ".zip";
  const artifactFileName = [
    `PI-${slugifyPathPart(piCodigo)}`,
    slugifyPathPart(siteSigla),
    slugifyPathPart(mode),
  ].join("-") + artifactExtension;
  const artifactObjectKey = [
    ADOPS_EXPORT_BASE_PATH,
    slugifyPathPart(siteSigla),
    slugifyPathPart(piCodigo),
    slugifyPathPart(job.id),
    artifactFileName,
  ].filter(Boolean).join("/");
  await uploadBufferToSpaces({
    buffer: artifact.buffer,
    bucket: ADOPS_EXPORT_BUCKET,
    objectKey: artifactObjectKey,
    contentType: artifact.contentType,
  });
  const downloadUrl = `${spacesPublicBaseForSite("", ADOPS_EXPORT_BUCKET)}/${artifactObjectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
  return {
    stage: "completed",
    piCodigo,
    siteSigla,
    mode,
    variant,
    pdfMaxWidth,
    pdfQuality,
    pdfResolution,
    imageMaxWidth,
    imageQuality,
    insertionIds: descriptor.insertionIds,
    invalidatedEvidenceIds,
    regeneratedDates,
    analyticsPiStatus,
    analyticsFullMonthStatus,
    downloadUrl,
    artifactBytes: artifact.buffer.length,
    artifactContentType: artifact.contentType,
    artifactFileName,
    artifactSha256: crypto.createHash("sha256").update(artifact.buffer).digest("hex"),
  };
}

async function executeCampaignEvidenceExport(job) {
  const startedAtMs = Date.now();
  const payload = job?.payload || {};
  const piCodigo = normalizePiDigits(payload.piCodigo);
  const competencia = String(payload.competencia || "").trim().toUpperCase();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.asOfDate || "")) ? String(payload.asOfDate) : null;
  const imageMaxWidth = Math.max(800, Math.min(2560, Number.parseInt(String(payload.imageMaxWidth || "1600"), 10) || 1600));
  const imageQuality = Math.max(45, Math.min(90, Number.parseInt(String(payload.imageQuality || "72"), 10) || 72));
  if (!piCodigo || !competencia) throw new Error("campaign-evidence-export sem PI canônica/competência válidas.");

  const insertionIds = Array.isArray(payload.insertionIds) ? payload.insertionIds.map(Number).filter(Number.isFinite) : [];
  const siteSiglas = Array.isArray(payload.siteSiglas) ? payload.siteSiglas.map(String) : [];
  const evidenceFingerprint = Array.isArray(payload.evidenceFingerprint) ? payload.evidenceFingerprint : [];
  const evidenceFingerprintSignature = String(payload.evidenceFingerprintSignature || "");
  if (!insertionIds.length || !evidenceFingerprint.length || !evidenceFingerprintSignature) {
    throw new Error(`Nenhuma inserção canônica publicada encontrada para PI ${piCodigo} em ${competencia}.`);
  }
  const descriptorValidatedMs = Date.now();
  await progressJob(job.id, {
    stage: "materializando ZIP completo da campanha",
    stageKey: "compiling",
    piCodigo,
    competencia,
    insertionIds,
    itemsDone: 0,
    itemsTotal: evidenceFingerprint.length,
    percentTotal: 20,
  });
  const params = new URLSearchParams({
    piCodigo,
    competencia,
    download: "1",
    imageMaxWidth: String(imageMaxWidth),
    imageQuality: String(imageQuality),
  });
  if (asOfDate) params.set("asOfDate", asOfDate);
  const artifact = await privateApiDownload(`/api/internal/campaign-evidence-exports?${params.toString()}`, { evidenceFingerprint, evidenceFingerprintSignature });
  const artifactFileName = `PI-${slugifyPathPart(piCodigo)}-${slugifyPathPart(competencia)}-todos-os-prints.zip`;
  const artifactObjectKey = [
    ADOPS_EXPORT_BASE_PATH,
    "campanhas",
    slugifyPathPart(piCodigo),
    slugifyPathPart(competencia),
    slugifyPathPart(job.id),
    artifactFileName,
  ].join("/");
  await uploadBufferToSpaces({ buffer: artifact.buffer, bucket: ADOPS_EXPORT_BUCKET, objectKey: artifactObjectKey, contentType: "application/zip" });
  const downloadUrl = `${spacesPublicBaseForSite("", ADOPS_EXPORT_BUCKET)}/${artifactObjectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
  return {
    stage: "completed",
    piCodigo,
    competencia,
    asOfDate,
    mode: "prints-only",
    variant: "web",
    imageMaxWidth,
    imageQuality,
    insertionIds,
    siteSiglas,
    evidenceCount: evidenceFingerprint.length,
    downloadUrl,
    artifactBytes: artifact.buffer.length,
    artifactContentType: "application/zip",
    artifactFileName,
    artifactSha256: crypto.createHash("sha256").update(artifact.buffer).digest("hex"),
    timings: {
      descriptorMs: descriptorValidatedMs - startedAtMs,
      packagingAndUploadMs: Date.now() - descriptorValidatedMs,
      totalMs: Date.now() - startedAtMs,
    },
  };
}

async function handleJob(job) {
  const payload = job?.payload || {};
  if (!job?.kind) {
    throw new Error("Job sem kind.");
  }
  if (job.kind === "sync-planilha") {
    return executeSyncPlanilha(payload);
  }
  if (job.kind === "print-batch") {
    return executePrintBatch(job);
  }
  if (job.kind === "print-backfill") {
    return executePrintBackfill(job);
  }
  if (job.kind === "print-single") {
    return executePrintSingle(job);
  }
  if (job.kind === "telegram-send-evidence") {
    return executeTelegramSendEvidence(payload);
  }
  if (job.kind === "runtime-readiness-probe") {
    return executeRuntimeReadinessProbe(payload);
  }
  if (job.kind === "reconcile-adrotate") {
    return executeReconcileAdrotateJob(payload);
  }
  if (job.kind === "adrotate-link") {
    return executeAdrotateLinkJob(payload);
  }
  if (job.kind === "adrotate-publish") {
    return executeAdrotatePublishJob(payload);
  }
  if (job.kind === "drive-pi-reconcile") {
    return executeDrivePiReconcile(payload);
  }
  if (job.kind === "analytics-report") {
    return executeAnalyticsReport(payload);
  }
  if (job.kind === "pi-site-export") {
    return executePiSiteExport(job);
  }
  if (job.kind === "campaign-evidence-export") {
    return executeCampaignEvidenceExport(job);
  }
  if (job.kind === "evidence-monthly-report") {
    return executeEvidenceMonthlyReport(job);
  }
  if (job.kind === "campaign-publication-reconcile") {
    return executeCampaignPublicationReconcile(job);
  }
  if (job.kind === "drive-pi-ingest") {
    try {
      return await executeDrivePiIngest(payload);
    } catch (error) {
      await updateDrivePiState(payload, "failed", {
        parseRun: {
          fields: null,
          alerts: ["Falha real no processamento Drive PI. Verificar detalhes do job."],
          error: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => null);
      await notifyDrivePiErrorTelegram(payload, error);
      throw error;
    }
  }
  if (job.kind === "drive-inventory-refresh") {
    return executeDriveInventoryRefresh(job);
  }
  throw new Error(`Kind não suportado pelo runner: ${job.kind}`);
}

async function claimNext(poolKinds = kinds) {
  const payload = await request("/api/ops/runner/claim-next", {
    method: "POST",
    body: JSON.stringify({
      runnerId: RUNNER_ID,
      kinds: poolKinds,
    }),
  });
  return payload?.job || null;
}

async function completeJob(jobId, result) {
  await request(`/api/ops/runner/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: "POST",
    body: JSON.stringify({
      runnerId: RUNNER_ID,
      result,
    }),
  });
}

async function failJob(jobId, error, result = null) {
  await request(`/api/ops/runner/jobs/${encodeURIComponent(jobId)}/fail`, {
    method: "POST",
    body: JSON.stringify({
      runnerId: RUNNER_ID,
      error: String(error),
      result,
    }),
  });
}

async function runWatchdogIfDue(force = false) {
  const now = Date.now();
  if (!force && now - lastWatchdogAt < WATCHDOG_INTERVAL_MS) {
    return null;
  }
  lastWatchdogAt = now;
  const payload = await request("/api/ops/jobs/watchdog", {
    method: "POST",
    body: JSON.stringify({
      dryRun: false,
      limit: 200,
      requestedBy: RUNNER_ID,
    }),
  });
  const failedCount = Number(payload?.failedCount || 0);
  if (failedCount > 0) {
    console.warn(`[runner] watchdog marcou ${failedCount} job(s) antigo(s) como failed`);
  }
  return payload;
}

async function runOnce(poolKinds = kinds) {
  const job = await claimNext(poolKinds);
  if (!job) {
    console.log(`[runner] nenhum job pronto para ${RUNNER_ID}`);
    return false;
  }
  console.log(`[runner] job recebido`, job.id, job.kind);
  try {
    const result = await handleJob(job);
    await completeJob(job.id, {
      ok: true,
      runnerId: RUNNER_ID,
      completedAt: new Date().toISOString(),
      execution: result,
    });
    console.log(`[runner] job concluído`, job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(job.id, message, {
      ok: false,
      runnerId: RUNNER_ID,
      failedAt: new Date().toISOString(),
    });
    console.error(`[runner] job falhou`, job.id, message);
  }
  return true;
}

async function runPool(pool, workerIndex) {
  const poolLabel = `${pool.kinds.join("+")}:${workerIndex + 1}/${pool.concurrency}`;
  for (;;) {
    try {
      if (pool.maintenance && workerIndex === 0) {
        await sendRunnerHeartbeat(false).catch((error) => console.warn("[runner] heartbeat falhou", error instanceof Error ? error.message : String(error)));
        await runWatchdogIfDue(false);
      }
      const handled = await runOnce(pool.kinds);
      runnerLastCycleError = null;
      runnerLastSuccessAt = new Date().toISOString();
      if (!handled) await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      runnerLastCycleError = error instanceof Error ? error.message : String(error);
      await sendRunnerHeartbeat(true).catch(() => null);
      console.error(`[runner] pool ${poolLabel} com erro`, runnerLastCycleError);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function runDrivePiMonitorLoop() {
  for (;;) {
    await runDrivePiMonitorOnce().catch((error) => {
      console.warn("[runner] monitor Drive PI falhou; tentará novamente sem bloquear a fila", error instanceof Error ? error.message : String(error));
    });
    await sleep(POLL_INTERVAL_MS);
  }
}

async function main() {
  if (!OPS_API_TOKEN) {
    throw new Error("Defina OPS_API_TOKEN para usar o runner remoto.");
  }

  const once = process.argv.includes("--once");
  if (once) {
    await runOnce();
    return;
  }

  if (process.argv.includes("--drive-monitor-once")) {
    const result = await runDrivePiMonitorOnce({ force: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`[runner] iniciado em ${RUNNER_ID}`);
  console.log(`[runner] ops=${OPS_API_BASE_URL}`);
  console.log(`[runner] privateApi=${PRIVATE_ADOPS_API_BASE_URL}`);
  console.log(`[runner] kinds=${kinds.join(",")}`);
  const pools = buildRunnerPools(kinds, OPS_CAMPAIGN_EXPORT_CONCURRENCY);
  console.log(`[runner] pools=${JSON.stringify(pools)}`);
  console.log(`[runner] drivePiMonitor=${DRIVE_PI_MONITOR_ENABLED ? "enabled" : "disabled"}`);
  startRunnerHealthServer();
  await sendRunnerHeartbeat(true).catch((error) => console.warn("[runner] heartbeat inicial falhou", error instanceof Error ? error.message : String(error)));

  const workers = pools.flatMap((pool) => (
    Array.from({ length: pool.concurrency }, (_, workerIndex) => runPool(pool, workerIndex))
  ));
  if (DRIVE_PI_MONITOR_ENABLED) workers.push(runDrivePiMonitorLoop());
  await Promise.all(workers);
}

export {
  agencyAliasCandidates,
  assertOperationalMediaReadback,
  buildSpacesImageObjectKey,
  buildRestrictedAdrotateSnapshotSql,
  buildDrivePiFolderIdentityText,
  buildPerrengueRebuildTriggerReason,
  classifyGoogleDriveDownloadFailure,
  buildAdrotatePublishPayload,
  buildPerrengueAdrotateRestorePhp,
  buildPerrengueAdrotateSnapshotPhp,
  buildDrivePiPdfInsertions,
  clientAliasCandidates,
  extractPdfCommercialLabels,
  extractPdfCompetencia,
  extractPdfVehicleName,
  extractSameOriginArticleCandidates,
  extractUrlsFromText,
  extractMediaLinksFromText,
  evaluateRestoredAdHtml,
  evaluatePerrengueRebuildHealth,
  filterSiteInsertions,
  isSocialInsertion,
  isCacheMaintenanceDegraded,
  isAdrotatePublicationConfirmed,
  isAdrotateSnapshotPublicationConfirmed,
  isDiscardableDraftCampaign,
  mediaKindFromUrl,
  hasHttpsDrivePiDestination,
  httpDownloadBuffer,
  mergeExpectedDrivePiContext,
  inspectOperationalImage,
  isRestrictedKvm8GatewaySite,
  parseRestrictedDbRows,
  parseRestrictedAdrotateBaseTable,
  parseRestrictedAdrotateSnapshotOutput,
  prepareOperationalDeliveryImage,
  prepareOperationalDeliveryMedia,
  restrictedReplaceSql,
  normalizePerrengueAdrotateSnapshot,
  normalizePerrengueRebuildHealthPayload,
  mergeDrivePiFields,
  parsePeriodoFromBboxText,
  parsePeriodoFromLayoutText,
  parseDrivePiPdfFields,
  resolveDrivePiClickUrl,
  resolveOperationalDestination,
  resolveOptionalOperationalDestination,
  selectDriveImageForInsertion,
  selectDriveVideoForInsertion,
  selectCanonicalSnapshotAd,
  selectObservedMediaLink,
  validateDrivePiPackageReadiness,
  validateOptionalDrivePiDestination,
  validateExpectedDrivePiCommercialContext,
  validateExpectedDrivePiIdentity,
  extractExplicitPiFromPdfText,
  extractExplicitPisFromPdfText,
  validateCompositePdfEvidence,
  validateCompositePendingGuard,
  validateAdrotatePublicationGuard,
  validateOperationalPublicationContract,
  validateOperationalPublicationScope,
  validateOperationalDriveItem,
};

if (process.env.ADOPS_RUNNER_TEST_MODE !== "1") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
