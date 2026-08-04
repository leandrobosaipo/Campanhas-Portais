import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);

const OPS_API_BASE_URL = (process.env.OPS_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || "";
const PRIVATE_ADOPS_API_BASE_URL = (process.env.PRIVATE_ADOPS_API_BASE_URL || "http://127.0.0.1:4011").replace(/\/$/, "");
const PRIVATE_ADOPS_API_TOKEN = process.env.PRIVATE_ADOPS_API_TOKEN || "";
const RUNNER_ID = process.env.RUNNER_ID || `runner-${process.pid}`;
const PROJECT_ROOT = process.env.CAMPANHAS_PORTAIS_ROOT || process.cwd();
const POLL_INTERVAL_MS = Number.parseInt(process.env.OPS_POLL_INTERVAL_MS || "5000", 10);
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
const ADOPS_MEDIA_MONITOR_ENABLED = process.env.ADOPS_MEDIA_MONITOR_ENABLED === "true";
const ADOPS_MEDIA_MONITOR_INTERVAL_MS = Number.parseInt(process.env.ADOPS_MEDIA_MONITOR_INTERVAL_MS || "900000", 10);
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
const ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS = Number.parseInt(process.env.ADOPS_PERRENGUE_REBUILD_TIMEOUT_MS || "600000", 10);
const ADOPS_PERRENGUE_REBUILD_POLL_INTERVAL_MS = Number.parseInt(process.env.ADOPS_PERRENGUE_REBUILD_POLL_INTERVAL_MS || "5000", 10);
const kinds = (process.env.OPS_JOB_KINDS || "sync-planilha,print-batch,print-backfill,print-single,analytics-report,pi-site-export,drive-pi-ingest,drive-inventory-refresh,media-monitor,reconcile-adrotate,adrotate-link,adrotate-publish,drive-pi-reconcile,telegram-send-evidence,runtime-readiness-probe")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let lastWatchdogAt = 0;
let lastDrivePiMonitorAt = 0;
let lastMediaMonitorEnqueueAt = 0;
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

async function privateApi(pathname, body) {
  const response = await fetch(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: "POST",
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

async function privateApiDownload(pathname) {
  const response = await fetch(`${PRIVATE_ADOPS_API_BASE_URL}${pathname}`, {
    method: "GET",
    headers: {
      ...(PRIVATE_ADOPS_API_TOKEN ? { "x-adops-api-token": PRIVATE_ADOPS_API_TOKEN } : {}),
    },
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `Falha na API privada ${pathname}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("A API privada concluiu o export sem conteúdo.");
  if (buffer.length > ADOPS_MEDIA_MAX_BYTES) {
    throw new Error(`Artefato excede ADOPS_MEDIA_MAX_BYTES (${buffer.length} bytes).`);
  }
  return {
    buffer,
    contentType: String(response.headers.get("content-type") || "application/octet-stream").split(";", 1)[0],
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

function clientAliasCandidates(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [];
  if (/\b(secom|governo|gov mt|governo do estado)\b/.test(normalized)) candidates.push("Governo do Estado");
  if (/\b(municipio de cuiaba|prefeitura de cuiaba|pref cba|cuiaba)\b/.test(normalized)) candidates.push("Prefeitura de Cuiabá");
  if (/\b(tribunal de contas|tce mt|tce)\b/.test(normalized)) candidates.push("TCE-MT");
  return candidates;
}

function agencyAliasCandidates(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [];
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

function deliveryPositionSegment(value, fallback = "POSICAO") {
  const sanitized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
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

function buildSpacesImageObjectKey({ siteSigla, fields, raw, sourceName }) {
  const periodoInicio = readStringRecord(raw, ["periodoInicio", "inicio"]) || todayInCuiaba();
  const month = periodoInicio.slice(0, 7);
  const extension = path.extname(String(sourceName || "")).toLowerCase() || ".bin";
  const filename = [
    slugifyPathPart(fields?.piCodigo || "pi"),
    slugifyPathPart(fields?.campaignName || "campanha"),
    slugifyPathPart(readStringRecord(raw, ["localFormato", "localFormatoNormalizado"]) || "banner"),
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
  const headerLine = lines.find((line) => {
    const values = line.words.map((word) => word.text);
    const days = values.filter((text) => /^\d{2}$/.test(text)).map((text) => Number(text));
    return days.includes(1) && days.includes(15) && days.includes(31);
  });
  if (!headerLine) return {};

  const dayWords = headerLine.words
    .filter((word) => /^\d{2}$/.test(word.text))
    .map((word) => ({ ...word, day: Number(word.text) }))
    .filter((word) => word.day >= 1 && word.day <= 31)
    .sort((a, b) => a.day - b.day);
  if (dayWords.length < 28) return {};

  const minDayX = Math.min(...dayWords.map((word) => word.xCenter));
  const maxDayX = Math.max(...dayWords.map((word) => word.xCenter));
  const candidateRows = lines
    .filter((line) => line.yCenter > headerLine.yCenter + 15 && line.yCenter < headerLine.yCenter + 80)
    .map((line) => {
      const markers = line.words.filter((word) =>
        word.text === "1" &&
        word.xCenter >= minDayX - 6 &&
        word.xCenter <= maxDayX + 6
      );
      return { line, markers };
    })
    .filter((row) => row.markers.length > 0)
    .sort((a, b) => b.markers.length - a.markers.length);

  const row = candidateRows[0];
  if (!row) return {};

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
  const header = lines.find((line) => /\b01\s+02\s+03\b/.test(line));
  const insertionLine = lines.find((line) => /^\s*C\s+.*\b1\b/.test(line));
  if (!header || !insertionLine) return {};

  const dayColumns = [];
  for (const match of header.matchAll(/\b(\d{2})\b/g)) {
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

async function parseDrivePiPdfFields(archived) {
  const extracted = await extractTextFromArchivedPdf(archived);
  if (!extracted) return {};
  const text = extracted.plain || "";
  const layout = extracted.layout || text;
  const piNumber = firstMatch(text, /\bPI\s+PEDIDO DE INSERÇÃO\s+(\d{3,})/i) || firstMatch(text, /\bPI\s*(\d{3,})\b/i);
  const competencia = firstMatch(text, /PERÍODO\s+([A-ZÇÃÉÍÓÚ]+\/\d{4})/i) || firstMatch(text, /COLOCAÇÃO\s+([A-ZÇÃÉÍÓÚ]+\/\d{4})/i);
  const campaignName = firstMatch(text, /CAMPANHA:\s*([^\n]+)/i);
  const localFormato = firstMatch(text, /(MEGABANNER TOPO\s*-\s*[0-9 Xx]+)/i) || firstMatch(text, /(MEGABANNER TOPO)/i);
  const bboxPeriodo = parsePeriodoFromBboxText(extracted.bbox, competencia);
  const parsed = {
    piCodigo: piNumber ? `PI ${piNumber}` : null,
    campaignName,
    competencia,
    clientName: firstMatch(text, /CLIENTE\s+([^\n]+)/i),
    clientLegalName: firstMatch(text, /RAZÃO SOCIAL\s+([^\n]+)/i),
    clientCnpj: firstMatch(text, /CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i),
    agencyName: firstMatch(text, /^([A-Z0-9 .&-]*DMD[^\n]+)/im) || "DMD",
    vehicleName: firstMatch(text, /VEÍCULO\s+([^\n]+)/i),
    valorLiquido: parseCurrencyPtBr(firstMatch(text, /LIQUIDO R\$\s+([\d.,]+)/i)),
    clickUrl: firstMatch(text, /(https:\/\/[^\s)]+)/i),
    periodo: bboxPeriodo.periodoInicio ? bboxPeriodo : parsePeriodoFromLayoutText(layout, competencia),
    rawTextExcerpt: text.slice(0, 1200),
    parseError: extracted.error || null,
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
    insertions: ids.siteId && parsed.localFormato && parsed.periodo.periodoInicio && parsed.periodo.periodoFim
      ? [{
          siteId: ids.siteId,
          localFormato: parsed.localFormato.replace(/\s*-\s*[0-9 Xx]+$/, "").trim(),
          localFormatoNormalizado: "MEGABANNER TOPO",
          periodoInicio: parsed.periodo.periodoInicio,
          periodoFim: parsed.periodo.periodoFim,
          periodoOriginal: parsed.periodo.periodoOriginal,
          clickUrl: parsed.clickUrl,
        }]
      : [],
  };
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
        fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents,size)",
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
  }));
}

async function downloadDriveFileToArchive(file) {
  if (!file?.driveFileId || String(file.mimeType || "").includes("folder")) {
    return null;
  }
  if (Number(file.size || 0) > ADOPS_MEDIA_MAX_BYTES) throw new Error(`Arquivo do Drive excede limite operacional de ${ADOPS_MEDIA_MAX_BYTES} bytes.`);
  const accessToken = await getGoogleDriveAccessToken();
  const isGoogleDocument = file.mimeType === "application/vnd.google-apps.document";
  const downloadUrl = isGoogleDocument
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}/export?mimeType=${encodeURIComponent("text/plain")}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo do Drive: ${response.status}`);
  }
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
  return { filePath, sha256, bytes: bytes.length, sourceDriveFileId: file.driveFileId, sourceName: file.name };
}

function trimUrlPunctuation(value) {
  return String(value || "").replace(/[),.;:'\"]+$/g, "");
}

function extractUrlsFromText(text) {
  return Array.from(new Set((String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || []).map(trimUrlPunctuation)));
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

function mergeDrivePiFields(parsed, parsedFromPdf, { allowPdfInsertions = true } = {}) {
  const parsedInsertions = parsed.insertions?.length
    ? parsed.insertions
    : allowPdfInsertions
      ? parsedFromPdf.insertions || []
      : [];
  const mergedCompetencia = mergeFieldValue(parsed.competencia, parsedFromPdf.competencia);
  const inferredCompetencia = mergedCompetencia ? null : inferCompetenciaFromInsertionPeriod(parsedInsertions);
  return {
    ...parsed,
    piCodigo: mergeFieldValue(parsed.piCodigo, parsedFromPdf.piCodigo),
    campaignName: mergeFieldValue(parsed.campaignName, parsedFromPdf.campaignName),
    competencia: mergedCompetencia || inferredCompetencia,
    clienteId: mergeFieldValue(parsed.clienteId, parsedFromPdf.clienteId),
    agenciaId: mergeFieldValue(parsed.agenciaId, parsedFromPdf.agenciaId),
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
  return mergeDrivePiFields(baseFields, parsedFromPdf, { allowPdfInsertions: payload?.allowPdfInsertions !== false });
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

async function validateDrivePiDedupeSafety(fields) {
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

function validateDrivePiPackageReadiness(packageClassification, fields, mediaProcessing = null, { requireResolvedMedia = false } = {}) {
  const hasInsertionMedia = fields.insertions.some((item) => readStringRecord(item, ["mediaUrl", "media_url"]));
  const unresolvedMedia = fields.insertions.filter((item) => !readStringRecord(item, ["mediaUrl", "media_url"]));
  const issues = [];
  if (!packageClassification?.hasPdf) issues.push("missing_pi_pdf");
  if (!packageClassification?.hasMedia && !hasInsertionMedia) issues.push("missing_media");
  if (unresolvedMedia.some(isVideoInsertion)) issues.push("video_media_url_missing_after_processing");
  if (requireResolvedMedia && unresolvedMedia.length) issues.push("insertion_media_url_missing_after_processing");
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

async function executePerrengueHeadlessRebuild({ insertionId, adId, mediaBasename, purgeCache }) {
  const container = await findPortainerContainerByName(ADOPS_PERRENGUE_WP_CONTAINER);
  const input = Buffer.from(JSON.stringify({ insertionId, adId, mediaBasename, purgeCache })).toString("base64");
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
  $last = isset($body['last']) && is_array($body['last']) ? $body['last'] : [];
  return ['available' => true, 'running' => !empty($body['running']), 'queued' => !empty($body['queued']), 'lastStatus' => $last['status'] ?? null, 'lastStartedAt' => $last['startedAt'] ?? null, 'lastFinishedAt' => $last['finishedAt'] ?? null];
};
$before = $read_health();
$insertion_id = (int) ($input['insertionId'] ?? 0);
$payload = ['reason' => 'adops_adrotate_publish_' . $insertion_id, 'status' => 'publish', 'insertion_id' => $insertion_id, 'ad_id' => (int) ($input['adId'] ?? 0), 'media_basename' => sanitize_file_name((string) ($input['mediaBasename'] ?? '')), 'purge_routes' => !empty($input['purgeCache']) ? ['/', '/index.html', '/cod5-static-export.json'] : []];
$response = wp_remote_post($url, ['timeout' => 10, 'blocking' => true, 'headers' => ['content-type' => 'application/json', 'x-cod5-webhook-secret' => $secret], 'body' => wp_json_encode($payload)]);
if (is_wp_error($response)) throw new RuntimeException($response->get_error_message());
$code = (int) wp_remote_retrieve_response_code($response);
if ($code < 200 || $code >= 300) throw new RuntimeException('Webhook rejeitou rebuild com HTTP ' . $code);
$deadline = time() + ${timeoutSeconds};
$seen_new_run = false;
while (time() < $deadline) {
  usleep(${pollMicroseconds});
  $health = $read_health();
  $seen_new_run = $seen_new_run || (!empty($health['lastStartedAt']) && $health['lastStartedAt'] !== ($before['lastStartedAt'] ?? null)) || !empty($health['running']) || !empty($health['queued']);
  if ($seen_new_run && empty($health['running']) && empty($health['queued']) && ($health['lastStatus'] ?? null) === 'ok') { echo wp_json_encode(['accepted' => true, 'completed' => true, 'health' => $health]) . PHP_EOL; exit(0); }
  if ($seen_new_run && empty($health['running']) && empty($health['queued']) && !empty($health['lastStatus']) && $health['lastStatus'] !== 'ok') throw new RuntimeException('Rebuild terminou com status ' . $health['lastStatus']);
}
throw new RuntimeException('Timeout aguardando rebuild headless concluir.');
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
  return result;
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

function buildAdrotatePublishPayload({ insertion, campaign, site, checklist, targetDate, replaceExisting, purgeCache, generateEvidence }) {
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
  const linkUrl = firstNonEmptyString(
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
    pi_code: piCodigo,
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

function mediaMonitorWindow(now = Date.now()) {
  const interval = Math.max(60_000, ADOPS_MEDIA_MONITOR_INTERVAL_MS);
  return new Date(Math.floor(now / interval) * interval).toISOString();
}

async function enqueueMediaMonitorIfDue(force = false) {
  if (!ADOPS_MEDIA_MONITOR_ENABLED && !force) return null;
  const now = Date.now();
  if (!force && now - lastMediaMonitorEnqueueAt < ADOPS_MEDIA_MONITOR_INTERVAL_MS) return null;
  lastMediaMonitorEnqueueAt = now;
  return request("/api/ops/jobs/media-monitor", {
    method: "POST",
    headers: { "Idempotency-Key": `media-monitor:${mediaMonitorWindow(now)}` },
    body: JSON.stringify({ requestedBy: RUNNER_ID, window: mediaMonitorWindow(now) }),
  });
}

function buildMediaMonitorPackage(item, insertion, mediaFile) {
  const raw = {
    siteId: insertion.siteId ?? insertion.site?.id ?? null,
    siteSigla: item.siteSigla,
    localFormato: item.format?.adops ?? item.format?.sheet,
    localFormatoNormalizado: item.format?.normalized ?? item.format?.adops,
    periodoInicio: item.period?.start,
    periodoFim: item.period?.end,
    periodoOriginal: item.period?.original,
    mediaDriveFileId: mediaFile.id,
  };
  return {
    fields: { piCodigo: item.piCodigo, campaignName: item.campaignName, insertions: [raw] },
    raw,
    packageContext: {
      media: [{
        driveFileId: mediaFile.id,
        name: mediaFile.name,
        mimeType: mediaFile.mimeType,
        path: mediaFile.path,
        modifiedTime: mediaFile.modifiedTime,
        size: mediaFile.size,
      }],
      textObservations: [],
    },
  };
}

function selectSingleMediaCandidate(item) {
  if (item?.drive?.status !== "matched") return { ok: false, reason: `drive_${item?.drive?.status || "unavailable"}`, candidates: [] };
  if (item?.drive?.safeToApply !== true || item?.drive?.mediaMatchesFormat !== true) return { ok: false, reason: "drive_match_not_safe", candidates: [] };
  if (item?.drive?.sourceIdentity?.piConflict === true) return { ok: false, reason: "source_pi_conflict", candidates: [] };
  const expectedKind = isVideoInsertion({ localFormato: item?.format?.normalized ?? item?.format?.adops }) ? "video" : "image";
  const candidates = (Array.isArray(item?.drive?.mediaFiles) ? item.drive.mediaFiles : []).filter((file) => file?.kind === expectedKind);
  if (candidates.length !== 1) return { ok: false, reason: candidates.length ? "multiple_media_candidates" : "media_not_arrived", candidates };
  return { ok: true, reason: null, expectedKind, mediaFile: candidates[0], candidates };
}

async function executeMediaMonitor(job) {
  await progressJob(job.id, { stage: "scanning", stageKey: "scanning", percentTotal: 10 });
  const snapshot = await privateApiGet("/api/ops/drive-inventory/status");
  if (snapshot?.snapshotStatus !== "fresh") {
    const refresh = await request("/api/ops/jobs/drive-inventory-refresh", {
      method: "POST",
      body: JSON.stringify({ source: "media-monitor" }),
    });
    return {
      stage: "waiting_for_inventory",
      stageKey: "waiting_for_inventory",
      percentTotal: 100,
      scanned: 0,
      waiting: [],
      blocked: [],
      mediaApplied: [],
      publicationJobs: [],
      refreshJobId: refresh?.jobId ?? null,
      snapshotStatus: snapshot?.snapshotStatus ?? "missing",
    };
  }
  const today = todayInCuiaba();
  const operations = await privateApiGet(`/api/campaign-operations/active?date=${encodeURIComponent(today)}&includeEvidence=false`);
  const active = Array.isArray(operations?.items) ? operations.items.map((item) => ({ item, upcoming: false })) : [];
  const upcoming = Array.isArray(operations?.upcomingItems) ? operations.upcomingItems.map((item) => ({ item, upcoming: true })) : [];
  const rows = [...active, ...upcoming];
  const result = { scanned: rows.length, waiting: [], blocked: [], mediaApplied: [], publicationJobs: [], syncJob: null };

  if (rows.some(({ item }) => item?.adops?.status === "missing")) {
    result.syncJob = await request("/api/ops/jobs/sync-planilha", {
      method: "POST",
      headers: { "Idempotency-Key": `media-monitor-sheet:${today}` },
      body: JSON.stringify({ mode: "latest", source: "media-monitor" }),
    });
  }

  let done = 0;
  for (const { item, upcoming: isUpcoming } of rows) {
    done += 1;
    await progressJob(job.id, {
      stage: "matching",
      stageKey: "matching",
      percentTotal: 10 + Math.round((done / Math.max(1, rows.length)) * 70),
      itemsDone: done,
      itemsTotal: rows.length,
    });
    const insertionId = Number(item?.adops?.insertionId || 0);
    if (!insertionId) {
      result.waiting.push({ piCodigo: item?.piCodigo, siteSigla: item?.siteSigla, reason: "awaiting_sheet_sync" });
      continue;
    }
    if (Array.isArray(item?.blockingIssues) && item.blockingIssues.length) {
      result.blocked.push({ insertionId, piCodigo: item.piCodigo, siteSigla: item.siteSigla, reasons: item.blockingIssues });
      continue;
    }
    if (item?.adops?.mediaUrl) {
      if (item.adops.bannerPublicadoNoSite !== true) {
        const publish = await request("/api/ops/jobs/adrotate-publish", {
          method: "POST",
          headers: { "Idempotency-Key": `media-monitor-publish:${insertionId}:${item.period?.start}:${item.period?.end}` },
          body: JSON.stringify({ insertionId, apply: true, replaceExisting: true, purgeCache: true, generateEvidence: !isUpcoming, date: today }),
        });
        result.publicationJobs.push({ insertionId, jobId: publish.jobId, existingMedia: true });
      }
      continue;
    }
    const selection = selectSingleMediaCandidate(item);
    if (!selection.ok) {
      const target = selection.reason === "source_pi_conflict" ? result.blocked : result.waiting;
      target.push({ insertionId, piCodigo: item.piCodigo, siteSigla: item.siteSigla, ...(target === result.blocked ? { reasons: [selection.reason] } : { reason: selection.reason, candidates: selection.candidates.length }) });
      continue;
    }
    const expectedKind = selection.expectedKind;
    const mediaFile = selection.mediaFile;
    const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
    const mediaPackage = buildMediaMonitorPackage(item, insertion, mediaFile);
    const resolved = expectedKind === "video"
      ? await resolveDrivePiVideoMedia(mediaPackage.fields, mediaPackage.packageContext, { source: "media-monitor" })
      : await resolveDrivePiImageMedia(mediaPackage.fields, mediaPackage.packageContext, { source: "media-monitor" });
    const resolvedInsertion = resolved?.fields?.insertions?.[0];
    const mediaUrl = readStringRecord(resolvedInsertion, ["mediaUrl", "media_url"]);
    const processingIssues = resolved?.videoMediaProcessing?.issues || resolved?.imageMediaProcessing?.issues || [];
    if (!mediaUrl || processingIssues.length) {
      result.blocked.push({ insertionId, piCodigo: item.piCodigo, siteSigla: item.siteSigla, reasons: processingIssues.length ? processingIssues : ["media_processing_failed"] });
      continue;
    }
    const note = [
      String(insertion?.observacoes || "").trim(),
      `Mídia vinculada automaticamente pela fila em ${new Date().toISOString()} a partir do arquivo Drive ${mediaFile.id}.`,
    ].filter(Boolean).join("\n");
    await privateApiPatch(`/api/insertions/${insertionId}`, { mediaUrl, observacoes: note });
    result.mediaApplied.push({ insertionId, piCodigo: item.piCodigo, siteSigla: item.siteSigla, driveFileId: mediaFile.id, mediaUrl });
    const publish = await request("/api/ops/jobs/adrotate-publish", {
      method: "POST",
      headers: { "Idempotency-Key": `media-monitor-publish:${insertionId}:${mediaFile.id}` },
      body: JSON.stringify({ insertionId, apply: true, replaceExisting: true, purgeCache: true, generateEvidence: !isUpcoming, date: today }),
    });
    result.publicationJobs.push({ insertionId, jobId: publish.jobId, existingMedia: false });
  }
  return { stage: "completed", stageKey: "completed", percentTotal: 100, snapshot: { status: snapshot.snapshotStatus, itemCount: snapshot.itemCount, snapshotAt: snapshot.snapshotAt }, ...result };
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

async function applyDrivePiToAdOps(fields, payload) {
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
  return {
    mode: payload?.mode || "latest",
    stdout: safeProcessOutput(stdout),
    stderr: safeProcessOutput(stderr),
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
  if (apply && wpCliPublished && activeToday && exactLiveCount === 0 && publicHtmlValidation?.ok !== true) {
    throw new Error(`Publicação AdRotate não apareceu na relação nem no HTML público da inserção ${insertionId}.`);
  }

  if (apply && wpCliPublished) {
    await privateApiPatch(`/api/insertions/${insertionId}`, {
      bannerPublicadoNoSite: true,
      statusNormalizado: "publicado",
      observacoes: [
        insertion.observacoes,
        `AdRotate publicado via adrotate-publish em ${new Date().toISOString()} (grupo ${publishPayload.group_id}, ad ${wpCliResult.ad_id}).`,
        exactLiveCount > 0
          ? "Relação pública validada após publicação."
          : "Publicação agendada/criada no WordPress; relação pública pode ficar vazia antes do início do período.",
      ].filter(Boolean).join("\n"),
    }).catch(() => null);
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
    headlessRebuild,
    publicHtmlValidation,
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
  const clickUrlResolution = resolveDrivePiClickUrl(fields, packageContext);
  fields = clickUrlResolution.fields;
  const insertionScope = (payload?.strictInsertionScope === true || payload?.publish === true)
    ? filterSiteInsertions(fields.insertions)
    : { accepted: fields.insertions, excluded: [] };
  fields = { ...fields, insertions: insertionScope.accepted };
  const shouldResolveMedia = payload?.resolveMedia === true || payload?.publish === true;
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
  const packageReadiness = validateDrivePiPackageReadiness(packageClassification, fields, mediaProcessing, { requireResolvedMedia: payload?.publish === true });
  const rollout = validation.ok ? await validateDrivePiSiteRollout(fields) : { ok: true, blockedSites: [], resolvedSites: [] };
  const dedupe = validation.ok && packageReadiness.ok && rollout.ok
    ? await validateDrivePiDedupeSafety(fields)
    : { ok: true, conflicts: [], checkedCampaignIds: [] };
  const canApply = validation.ok && packageReadiness.ok && rollout.ok && dedupe.ok;
  // The protected drive-pi-publish endpoint is an explicit mutation request even
  // when publish=false. That mode updates AdOps/media only and must not touch
  // AdRotate, cache or evidence for an expired campaign.
  const explicitPublishFlow = /api-publish$/.test(String(payload?.source || ""));
  const strictExplicitPublishFlow = explicitPublishFlow && payload?.strictInsertionScope === true && Array.isArray(payload?.parsedPi?.insertions);
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
    ? await validateDrivePiDedupeSafety(fields)
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

async function executePrintBatch(payload) {
  return privateApi("/api/insertions/capture-proof/batch", {
    competencia: payload?.competencia ?? undefined,
    siteId: payload?.siteId ?? undefined,
    date: payload?.date ?? undefined,
    captureAt: payload?.captureAt ?? undefined,
  });
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

async function executePrintBackfill(payload) {
  const resolved = await resolveBackfillInsertionIds(payload);
  if (!resolved.insertionIds) {
    return privateApi("/api/insertions/capture-proof/backfill-overdue", {
      competencia: payload?.competencia ?? undefined,
      siteId: payload?.siteId ?? undefined,
      insertionId: payload?.insertionId ?? undefined,
    });
  }

  const replaceRequested = payload?.replace === true;
  const force = payload?.force === true;
  const items = [];
  const skipped = [];
  let totalDates = 0;

  for (const insertionId of resolved.insertionIds) {
    const insertion = await privateApiGet(`/api/insertions/${insertionId}`);
    const dates = clampDateRange(insertion?.periodoInicio, insertion?.periodoFim, payload?.fromDate, payload?.toDate);
    if (!dates.length) {
      skipped.push({ insertionId, reason: "sem_periodo_valido_ou_fora_do_intervalo" });
      continue;
    }

    for (const date of dates) {
      totalDates += 1;
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

      const capture = await privateApi(`/api/insertions/${insertionId}/capture-proof`, {
        date,
        replace: replaceRequested || !isAuditApprovedStatus(before),
        force,
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
        captureSkipped: Boolean(capture?.skipped),
        evidenceUrl: after?.arquivoUrl ?? capture?.capture?.uploadedUrl ?? null,
        checklistStatus: after?.status ?? null,
        error: isAuditApprovedStatus(after) ? null : after?.error ?? capture?.error ?? "Checklist final não aprovado.",
      });
    }
  }

  const errors = items.filter((item) => item.status === "error");
  return {
    ok: errors.length === 0,
    mode: resolved.mode,
    campaignId: resolved.campaignId ?? null,
    piCodigo: resolved.piCodigo ?? null,
    siteSigla: resolved.siteSigla ?? null,
    insertionIds: resolved.insertionIds,
    fromDate: payload?.fromDate ?? null,
    toDate: payload?.toDate ?? null,
    replace: replaceRequested,
    force,
    totalInsertions: resolved.insertionIds.length,
    totalDates,
    generatedOrValidated: items.filter((item) => item.status === "ok" || item.status === "skipped").length,
    errors: errors.length,
    skipped,
    items,
  };
}

async function executePrintSingle(payload) {
  if (!payload?.insertionId) {
    throw new Error("print-single sem insertionId.");
  }
  return privateApi(`/api/insertions/${payload.insertionId}/capture-proof`, {
    date: payload?.date ?? undefined,
    captureAt: payload?.captureAt ?? undefined,
    replace: payload?.replace ?? undefined,
    force: payload?.force ?? undefined,
  });
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

async function sendTelegramDeliveryDirect({ chatId, piCodigo, siteSigla, zipArtifact, pdfArtifacts }) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN ausente para enviar a entrega.");
  if (!chatId) throw new Error("TELEGRAM_DEFAULT_GROUP_ID ausente para enviar a entrega.");
  if (!Array.isArray(pdfArtifacts) || pdfArtifacts.length === 0) throw new Error("Nenhum PDF por posição foi gerado para o Telegram.");
  if (pdfArtifacts.length > 9) throw new Error("A entrega excede o limite de 9 PDFs por grupo do Telegram.");
  const form = new FormData();
  const media = [
    {
      type: "document",
      media: "attach://images_zip",
      caption: `PI ${piCodigo} · ${siteSigla}`,
    },
    ...pdfArtifacts.map((artifact, index) => ({
      type: "document",
      media: `attach://campaign_pdf_${index}`,
      caption: artifact.position,
    })),
  ];
  form.set("chat_id", chatId);
  form.set("media", JSON.stringify(media));
  form.set("images_zip", new Blob([zipArtifact.buffer], { type: "application/zip" }), zipArtifact.fileName);
  pdfArtifacts.forEach((artifact, index) => {
    form.set(`campaign_pdf_${index}`, new Blob([artifact.buffer], { type: "application/pdf" }), artifact.fileName);
  });
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram sendMediaGroup falhou: ${response.status}`);
  }
  const messages = Array.isArray(payload?.result) ? payload.result : [];
  return {
    ok: true,
    mode: "direct-media-group",
    messageIds: messages.map((item) => item?.message_id).filter((item) => Number.isInteger(item)),
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

async function ensureInsertionCaptureCoverage(insertion) {
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
  const firstPassDates = eachIsoDay(start, effectiveEnd);
  const firstPassStatuses = await Promise.all(firstPassDates.map((date) => privateApiGet(`/api/insertions/${insertion.id}/capture-proof/status?date=${encodeURIComponent(date)}`)));
  const hasInvalid = firstPassStatuses.some((item) => item?.status === "invalid_audit" || item?.status === "invalid_url");
  if (hasInvalid) {
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
  const mode = ["delivery", "full", "prints-only", "pdf", "full-pdf"].includes(String(payload.mode || "").toLowerCase())
    ? String(payload.mode).toLowerCase()
    : "delivery";
  const variant = mode === "delivery" || mode === "pdf" || mode === "full-pdf"
    ? "web"
    : String(payload.variant || "").toLowerCase() === "web"
      ? "web"
      : "original";
  const pdfMaxWidth = Math.max(800, Math.min(2560, Number.parseInt(String(payload.pdfMaxWidth || "1920"), 10) || 1920));
  const pdfQuality = Math.max(45, Math.min(85, Number.parseInt(String(payload.pdfQuality || "68"), 10) || 68));
  const pdfResolution = Math.max(72, Math.min(180, Number.parseInt(String(payload.pdfResolution || "120"), 10) || 120));
  const imageMaxWidth = Math.max(800, Math.min(2560, Number.parseInt(String(payload.imageMaxWidth || "1600"), 10) || 1600));
  const imageQuality = Math.max(45, Math.min(90, Number.parseInt(String(payload.imageQuality || "72"), 10) || 72));
  const sendTelegram = mode === "delivery" ? payload.sendTelegram !== false : payload.sendTelegram === true;
  if (!piCodigo || !siteSigla) {
    throw new Error("pi-site-export sem piCodigo/siteSigla válidos.");
  }

  const descriptor = await privateApiGet(`/api/pi-site-exports?piCodigo=${encodeURIComponent(piCodigo)}&siteSigla=${encodeURIComponent(siteSigla)}`);
  const operationalInsertionIds = Array.isArray(descriptor?.operationalInsertionIds)
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
    sendTelegram,
  };

  await progressJob(job.id, { stage: "reauditando evidências", ...stagePayload });
  for (const insertion of insertions) {
    const capture = await ensureInsertionCaptureCoverage(insertion);
    invalidatedEvidenceIds.push(...capture.invalidatedEvidenceIds);
    regeneratedDates.push(...capture.regeneratedDates.map((date) => ({ insertionId: insertion.id, date })));
  }

  if (mode !== "delivery") {
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

  if (mode === "delivery") {
    await progressJob(job.id, {
      stage: "montando zip de imagens e pdf separado",
      ...stagePayload,
      regeneratedDates,
      invalidatedEvidenceIds,
    });
    const commonParams = {
      piCodigo,
      siteSigla,
      download: "1",
      variant: "web",
      presentation: "journalist",
      pdfMaxWidth: String(pdfMaxWidth),
      pdfQuality: String(pdfQuality),
      pdfResolution: String(pdfResolution),
      imageMaxWidth: String(imageMaxWidth),
      imageQuality: String(imageQuality),
    };
    const zipParams = new URLSearchParams({ ...commonParams, mode: "prints-only" });
    const exportableInsertionIds = new Set(Array.isArray(descriptor?.exportableInsertionIds)
      ? descriptor.exportableInsertionIds.map(Number)
      : operationalInsertionIds.map(Number));
    const positions = Array.from(new Set(insertions
      .filter((insertion) => exportableInsertionIds.has(Number(insertion.id)))
      .map((insertion) => deliveryPositionSegment(firstNonEmptyString(
      insertion.localFormatoNormalizado,
      insertion.localFormato,
      "POSICAO",
    )))));
    if (positions.length === 0) {
      throw new Error(`Nenhuma posição exportável encontrada para PI ${piCodigo} no site ${siteSigla}.`);
    }
    const [zipDownload, pdfDownloads] = await Promise.all([
      privateApiDownload(`/api/pi-site-exports?${zipParams.toString()}`),
      Promise.all(positions.map(async (position) => {
        const pdfParams = new URLSearchParams({ ...commonParams, mode: "pdf", position });
        const artifact = await privateApiDownload(`/api/pi-site-exports?${pdfParams.toString()}`);
        if (artifact.contentType !== "application/pdf") {
          throw new Error(`A API não retornou PDF para a posição ${position}.`);
        }
        return { ...artifact, position };
      })),
    ]);
    const neutralBaseName = `PI-${slugifyPathPart(piCodigo)}-${slugifyPathPart(siteSigla)}`;
    const zipArtifact = { ...zipDownload, fileName: `${neutralBaseName}.zip` };
    const pdfArtifacts = pdfDownloads.map((artifact) => ({
      ...artifact,
      fileName: `${neutralBaseName}-${artifact.position}.pdf`,
    }));
    const objectPrefix = [
      ADOPS_EXPORT_BASE_PATH,
      slugifyPathPart(siteSigla),
      slugifyPathPart(piCodigo),
      slugifyPathPart(job.id),
    ].filter(Boolean).join("/");
    const zipObjectKey = `${objectPrefix}/${zipArtifact.fileName}`;
    const pdfObjectKeys = pdfArtifacts.map((artifact) => `${objectPrefix}/${artifact.fileName}`);
    await Promise.all([
      uploadBufferToSpaces({
        buffer: zipArtifact.buffer,
        bucket: ADOPS_EXPORT_BUCKET,
        objectKey: zipObjectKey,
        contentType: "application/zip",
      }),
      ...pdfArtifacts.map((artifact, index) => uploadBufferToSpaces({
        buffer: artifact.buffer,
        bucket: ADOPS_EXPORT_BUCKET,
        objectKey: pdfObjectKeys[index],
        contentType: "application/pdf",
      })),
    ]);
    const publicBase = spacesPublicBaseForSite("", ADOPS_EXPORT_BUCKET);
    const publicUrl = (objectKey) => `${publicBase}/${objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
    const downloadUrl = publicUrl(zipObjectKey);
    const pdfUrls = pdfObjectKeys.map(publicUrl);
    const pdfUrl = pdfUrls.length === 1 ? pdfUrls[0] : null;
    let telegram = { ok: true, skipped: true, reason: "sendTelegram=false" };
    if (sendTelegram) {
      await progressJob(job.id, {
        stage: "enviando zip e pdf no telegram",
        ...stagePayload,
        downloadUrl,
        pdfUrls,
      });
      try {
        telegram = await sendTelegramDeliveryDirect({
          chatId: String(payload.chatId || TELEGRAM_DEFAULT_GROUP_ID || "").trim(),
          piCodigo,
          siteSigla,
          zipArtifact,
          pdfArtifacts,
        });
      } catch (error) {
        telegram = {
          ok: false,
          skipped: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const zipSha256 = crypto.createHash("sha256").update(zipArtifact.buffer).digest("hex");
    const pdfArtifactResults = pdfArtifacts.map((artifact, index) => ({
      position: artifact.position,
      url: pdfUrls[index],
      fileName: artifact.fileName,
      bytes: artifact.buffer.length,
      contentType: "application/pdf",
      sha256: crypto.createHash("sha256").update(artifact.buffer).digest("hex"),
    }));
    return {
      stage: "completed",
      piCodigo,
      siteSigla,
      mode,
      variant,
      insertionIds: descriptor.insertionIds,
      invalidatedEvidenceIds,
      regeneratedDates,
      downloadUrl,
      pdfUrl,
      pdfUrls,
      artifactBytes: zipArtifact.buffer.length,
      artifactContentType: "application/zip",
      artifactFileName: zipArtifact.fileName,
      artifactSha256: zipSha256,
      artifacts: {
        zip: {
          url: downloadUrl,
          fileName: zipArtifact.fileName,
          bytes: zipArtifact.buffer.length,
          contentType: "application/zip",
          sha256: zipSha256,
        },
        ...(pdfArtifactResults.length === 1 ? { pdf: pdfArtifactResults[0] } : {}),
        pdfs: pdfArtifactResults,
      },
      telegram,
    };
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

async function handleJob(job) {
  const payload = job?.payload || {};
  if (!job?.kind) {
    throw new Error("Job sem kind.");
  }
  if (job.kind === "sync-planilha") {
    return executeSyncPlanilha(payload);
  }
  if (job.kind === "print-batch") {
    return executePrintBatch(payload);
  }
  if (job.kind === "print-backfill") {
    return executePrintBackfill(payload);
  }
  if (job.kind === "print-single") {
    return executePrintSingle(payload);
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
  if (job.kind === "media-monitor") {
    return executeMediaMonitor(job);
  }
  if (job.kind === "analytics-report") {
    return executeAnalyticsReport(payload);
  }
  if (job.kind === "pi-site-export") {
    return executePiSiteExport(job);
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

async function claimNext() {
  const payload = await request("/api/ops/runner/claim-next", {
    method: "POST",
    body: JSON.stringify({
      runnerId: RUNNER_ID,
      kinds,
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

async function runOnce() {
  const job = await claimNext();
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

  if (process.argv.includes("--media-monitor-once")) {
    const queued = await enqueueMediaMonitorIfDue(true);
    console.log(JSON.stringify(queued, null, 2));
    return;
  }

  console.log(`[runner] iniciado em ${RUNNER_ID}`);
  console.log(`[runner] ops=${OPS_API_BASE_URL}`);
  console.log(`[runner] privateApi=${PRIVATE_ADOPS_API_BASE_URL}`);
  console.log(`[runner] kinds=${kinds.join(",")}`);
  console.log(`[runner] drivePiMonitor=${DRIVE_PI_MONITOR_ENABLED ? "enabled" : "disabled"}`);
  startRunnerHealthServer();
  await sendRunnerHeartbeat(true).catch((error) => console.warn("[runner] heartbeat inicial falhou", error instanceof Error ? error.message : String(error)));

  while (true) {
    try {
      await sendRunnerHeartbeat(false).catch((error) => console.warn("[runner] heartbeat falhou", error instanceof Error ? error.message : String(error)));
      await runWatchdogIfDue(false);
      await runDrivePiMonitorOnce();
      await enqueueMediaMonitorIfDue(false);
      const handled = await runOnce();
      runnerLastCycleError = null;
      runnerLastSuccessAt = new Date().toISOString();
      if (!handled) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      runnerLastCycleError = error instanceof Error ? error.message : String(error);
      await sendRunnerHeartbeat(true).catch(() => null);
      console.error("[runner] ciclo com erro", runnerLastCycleError);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

export {
  extractSameOriginArticleCandidates,
  extractUrlsFromText,
  extractMediaLinksFromText,
  filterSiteInsertions,
  isSocialInsertion,
  mediaKindFromUrl,
  mergeDrivePiFields,
  resolveDrivePiClickUrl,
  selectDriveImageForInsertion,
  selectDriveVideoForInsertion,
  selectObservedMediaLink,
  selectSingleMediaCandidate,
  validateDrivePiPackageReadiness,
};

if (process.env.ADOPS_RUNNER_TEST_MODE !== "1") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
