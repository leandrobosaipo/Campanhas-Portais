import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const WATCHDOG_INTERVAL_MS = Number.parseInt(process.env.OPS_WATCHDOG_INTERVAL_MS || "60000", 10);
const ANALYTICS_REPORT_PROJECT_ROOT = process.env.ANALYTICS_REPORT_PROJECT_ROOT || "/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/projects/perrengue-ga4-relatorio-analytics";
const ANALYTICS_REPORT_PYTHON = process.env.ANALYTICS_REPORT_PYTHON || path.join(ANALYTICS_REPORT_PROJECT_ROOT, ".venv/bin/python");
const ANALYTICS_REPORT_HOOK_URL = (process.env.ANALYTICS_REPORT_HOOK_URL || "").trim();
const DRIVE_PI_ARCHIVE_DIR = process.env.DRIVE_PI_ARCHIVE_DIR || path.join(PROJECT_ROOT, ".adops-drive-pi");
const DRIVE_PI_MONITOR_ENABLED = process.env.DRIVE_PI_MONITOR_ENABLED === "true";
const DRIVE_PI_MONITOR_ROOT_FOLDER_ID = (process.env.DRIVE_PI_MONITOR_ROOT_FOLDER_ID || "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6").trim();
const DRIVE_PI_MONITOR_INTERVAL_MS = Number.parseInt(process.env.DRIVE_PI_MONITOR_INTERVAL_MS || "300000", 10);
const DRIVE_PI_MONITOR_STATE_FILE = process.env.DRIVE_PI_MONITOR_STATE_FILE || "/var/lib/adops/drive-pi-monitor-state.json";
const DRIVE_PI_MONITOR_MAX_ITEMS = Number.parseInt(process.env.DRIVE_PI_MONITOR_MAX_ITEMS || "2000", 10);
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
const ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS = (process.env.ADOPS_DRIVE_PI_ALLOWED_SITE_SIGLAS || "")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);
const ADOPS_TELEGRAM_BOT_URL = (process.env.ADOPS_TELEGRAM_BOT_URL || "https://adops-telegram-bot.leandro471.workers.dev").replace(/\/$/, "");
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_DEFAULT_GROUP_ID = (process.env.TELEGRAM_DEFAULT_GROUP_ID || "").trim();
const kinds = (process.env.OPS_JOB_KINDS || "sync-planilha,print-batch,print-backfill,print-single,analytics-report,pi-site-export,drive-pi-ingest")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let lastWatchdogAt = 0;
let lastDrivePiMonitorAt = 0;
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

function safeFileName(value, fallback = "drive-pi") {
  const sanitized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return sanitized || fallback;
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

async function resolveDrivePiPackageFolder(payload) {
  if (!payload?.driveFileId) return null;
  const mimeType = String(payload.mimeType || "");
  if (mimeType === "application/vnd.google-apps.folder" && /\bPI[\s_-]*\d{3,}\b/i.test(String(payload.name || payload.path || ""))) {
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
  const payload = await googleDriveRequest("files", {
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents,size)",
    pageSize: 1000,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    orderBy: "folder,name",
  });
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
  const accessToken = await getGoogleDriveAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.driveFileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo do Drive: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const dir = path.join(DRIVE_PI_ARCHIVE_DIR, new Date().toISOString().slice(0, 10));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sha256.slice(0, 12)}-${safeFileName(file.name)}`);
  await writeFile(filePath, bytes);
  return { filePath, sha256, bytes: bytes.length, sourceDriveFileId: file.driveFileId, sourceName: file.name };
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
      pdf: context.pdf || null,
      primaryArchive: context.primaryArchive || archived || null,
    };
  }
  const folder = await resolveDrivePiPackageFolder(payload);
  const items = folder?.folderId ? await listDrivePiPackageItems(folder.folderId, folder.path || "") : [];
  const pdfItems = items.filter((item) => item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name));
  const mediaItems = items.filter((item) => /^image\//.test(item.mimeType) || /^video\//.test(item.mimeType) || /\.(gif|png|jpe?g|webp|mp4)$/i.test(item.name));
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
      name: item.name,
      path: item.path,
      mimeType: item.mimeType,
      modifiedTime: item.modifiedTime,
      webViewLink: item.webViewLink,
    })),
    media: mediaItems.map((item) => ({
      name: item.name,
      path: item.path,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink,
    })),
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

function mergeDrivePiFields(parsed, parsedFromPdf) {
  const parsedInsertions = parsed.insertions?.length ? parsed.insertions : parsedFromPdf.insertions || [];
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

async function extractDrivePiFields(payload, archived, agentParsedPi = null) {
  const hasPayloadParsedPi = payload?.parsedPi && typeof payload.parsedPi === "object" && !Array.isArray(payload.parsedPi);
  const parsed = hasPayloadParsedPi
    ? payload.parsedPi
    : agentParsedPi && typeof agentParsedPi === "object" && !Array.isArray(agentParsedPi)
      ? await normalizeAgentParsedPi(agentParsedPi)
      : {};
  const nameAndPath = `${payload?.name ?? ""} ${payload?.path ?? ""}`;
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
  return mergeDrivePiFields(baseFields, parsedFromPdf);
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
  mutationEnabled,
  canApply,
  evidenceCoverage,
  postApplyWarnings = [],
}) {
  const reasons = [];
  const packageMissing = Array.isArray(packageClassification?.missing) ? packageClassification.missing : [];
  if (packageMissing.includes("pi_pdf")) reasons.push("missing_pi_pdf");
  if (packageMissing.includes("media")) reasons.push("missing_media");
  for (const item of packageReadiness?.issues || []) reasons.push(item);
  for (const item of validation?.missing || []) reasons.push(`missing_${item}`);
  if (validation?.invalidInsertions?.length) reasons.push("invalid_insertions");
  if (validation?.agentQuality && !validation.agentQuality.ok) reasons.push("agent_quality");
  if (rollout && !rollout.ok) reasons.push("rollout_blocked");
  if (dedupe && !dedupe.ok) reasons.push("dedupe_conflict");
  if (canApply && !mutationEnabled) reasons.push("auto_apply_disabled");
  for (const result of evidenceCoverage?.results || []) {
    if (result?.status === "needs_media") reasons.push("needs_media");
    else if (result?.status && result.status !== "audited") reasons.push(`evidence_${result.status}`);
  }
  if (postApplyWarnings.length) reasons.push("post_apply_warning");
  return uniqueStrings(reasons);
}

function validateDrivePiPackageReadiness(packageClassification, fields) {
  const hasInsertionMedia = fields.insertions.some((item) => readStringRecord(item, ["mediaUrl", "media_url"]));
  const issues = [];
  if (!packageClassification?.hasPdf) issues.push("missing_pi_pdf");
  if (!packageClassification?.hasMedia && !hasInsertionMedia) issues.push("missing_media");
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
  const token = await getGoogleDriveAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/${pathname}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Google Drive API falhou: ${response.status}`);
  }
  return payload;
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
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,parents)",
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
  return { baseline: !state.initialized, scanned: currentMap.size, sent };
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
      const clickUrl = readUrlRecord(raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]);
      if (mediaUrl && mediaUrl !== duplicate.mediaUrl) duplicatePatch.mediaUrl = mediaUrl;
      if (readStringRecord(raw, ["periodoOriginal"]) && readStringRecord(raw, ["periodoOriginal"]) !== duplicate.periodoOriginal) {
        duplicatePatch.periodoOriginal = readStringRecord(raw, ["periodoOriginal"]);
      }
      if (Object.keys(duplicatePatch).length) {
        duplicatePatch.observacoes = [duplicate.observacoes, clickUrl ? `Link destino informado na PI/arte: ${clickUrl}` : null]
          .filter(Boolean)
          .join("\n");
        await privateApiPatch(`/api/insertions/${duplicate.id}`, duplicatePatch);
      }
      skippedInsertions.push({ id: duplicate.id, reason: "duplicate" });
      continue;
    }
    const clickUrl = readUrlRecord(raw, ["clickUrl", "urlDestino", "linkDestino", "destinationUrl"]);
    const insertion = await privateApi("/api/insertions", {
      campanhaId: campaign.id,
      siteId,
      localFormato,
      localFormatoNormalizado: readStringRecord(raw, ["localFormatoNormalizado"]) ?? localFormato,
      periodoInicio,
      periodoFim,
      periodoOriginal: readStringRecord(raw, ["periodoOriginal"]),
      statusNormalizado: readStringRecord(raw, ["statusNormalizado"]) ?? "aguardando_publicacao",
      mediaUrl: readStringRecord(raw, ["mediaUrl"]),
      observacoes: [
        `Criado a partir do Drive: ${payload.path}`,
        clickUrl ? `Link destino informado na PI/arte: ${clickUrl}` : null,
      ].filter(Boolean).join("\n"),
    });
    createdInsertions.push(insertion);
  }

  return {
    campaignId: campaign.id,
    campaignCreated: created,
    campaignDedupedBy: dedupedBy,
    createdInsertions: createdInsertions.map((item) => item.id),
    skippedInsertions,
  };
}

async function executeSyncPlanilha(payload) {
  await ensureRuntimeDirs();
  const args = ["--filter", "@workspace/scripts", "run", "sync:planilha"];
  const { stdout, stderr } = await runPnpm(args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    mode: payload?.mode || "latest",
    stdout: String(stdout || "").slice(-4000),
    stderr: String(stderr || "").slice(-4000),
  };
}

async function executeReconcilePlanilhaAdrotate() {
  await ensureRuntimeDirs();
  const args = ["--filter", "@workspace/scripts", "run", "reconcile:planilha-adrotate"];
  const { stdout, stderr } = await runPnpm(args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    stdout: String(stdout || "").slice(-4000),
    stderr: String(stderr || "").slice(-4000),
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
  await updateDrivePiState(payload, "received", {
    parseRun: {
      fields: null,
      alerts: ["Evento recebido do monitor do Google Drive."],
    },
  });
  const intakeLock = {
    key: payload?.parentFolderId || payload?.driveFileId || payload?.eventId || null,
    eventId: payload?.eventId || null,
    lockedAt: new Date().toISOString(),
    ttlHours: 24,
    reason: "Nova entrada do Drive em processamento automatico. Evitar cadastro manual duplicado.",
  };
  await updateDrivePiState(payload, "intake_locked", {
    parseRun: {
      fields: { intakeLock },
      alerts: ["Intake automatico iniciado; operador deve evitar cadastro manual ate o status final."],
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

  if (!payload?.parsedPi) {
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
  }

  const fields = await extractDrivePiFields(payload, archived, agentResult?.parsedPi || null);
  const validation = validateDrivePiApplyFields(fields);
  const packageReadiness = validation.ok
    ? validateDrivePiPackageReadiness(packageClassification, fields)
    : { ok: true, issues: [], hasPdf: false, hasMedia: false };
  const rollout = validation.ok ? await validateDrivePiSiteRollout(fields) : { ok: true, blockedSites: [], resolvedSites: [] };
  const dedupe = validation.ok && packageReadiness.ok && rollout.ok
    ? await validateDrivePiDedupeSafety(fields)
    : { ok: true, conflicts: [], checkedCampaignIds: [] };
  const canApply = validation.ok && packageReadiness.ok && rollout.ok && dedupe.ok;
  const mutationEnabled = ADOPS_DRIVE_PI_ALLOW_MUTATION && ADOPS_PI_AGENT_AUTO_APPLY;
  let preApplySyncPlanilha = { skipped: true, reason: "Pre-apply sync executa apenas quando validacao, pacote, rollout, dedupe e flags permitem mutacao." };
  if (canApply && mutationEnabled) {
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
    evidenceCoverage = await ensureDrivePiEvidenceCoverage(applied);
    await notifyDrivePiStageTelegram(payload, "evidence_checked", {
      piCodigo: fields.piCodigo,
      campaignName: fields.campaignName,
      packageClass: packageClassification?.class,
      intakeLock: intakeLock.key,
      applied,
      evidenceCoverage,
    });
    const evidenceNeedsReview = evidenceCoverage?.results?.some((item) => item?.status !== "audited");
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
  const syncPlanilha = hasAdOpsChanges
    ? await executeSyncPlanilha({ mode: "latest" })
    : preApplySyncPlanilha;
  let reconcile = { skipped: true, reason: "Nenhuma alteração nova aplicada no AdOps." };
  if (hasAdOpsChanges) {
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
  const evidenceNeedsReview = evidenceCoverage?.results?.some((item) => item?.status !== "audited");
  const finalStatus = applied ? (evidenceNeedsReview || postApplyWarnings.length ? "needs_review" : "applied") : "needs_review";
  const finalReviewReasons = buildDrivePiReviewReasons({
    packageClassification,
    packageReadiness,
    validation,
    rollout,
    dedupe: preApplyDedupe,
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
            ...(canApply && !mutationEnabled ? ["Campos validos, mas flags de auto-apply nao estao ambas habilitadas."] : []),
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
    packageReadiness,
    reviewReasons: finalReviewReasons,
    dedupe: preApplyDedupe,
    rollout,
    mutationEnabled,
    driveMutationEnabled: ADOPS_DRIVE_PI_ALLOW_MUTATION,
    agentAutoApplyEnabled: ADOPS_PI_AGENT_AUTO_APPLY,
    agentAnalysis: fields.agentAnalysis || agentResult,
    applied,
    evidenceCoverage,
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

async function executePrintBackfill(payload) {
  return privateApi("/api/insertions/capture-proof/backfill-overdue", {
    competencia: payload?.competencia ?? undefined,
    siteId: payload?.siteId ?? undefined,
    insertionId: payload?.insertionId ?? undefined,
  });
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
    stdout: String(stdout || "").slice(-4000),
    stderr: String(stderr || "").slice(-4000),
    publishStdout: String(publish.stdout || "").slice(-4000),
    publishStderr: String(publish.stderr || "").slice(-4000),
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
    if (status?.status === "audited") continue;
    const targetDate = status?.date;
    if (!targetDate) continue;
    const result = await privateApi(`/api/insertions/${insertion.id}/capture-proof`, {
      date: targetDate,
      replace: true,
      force: true,
    });
    if (result?.capture?.status === "ok" || result?.ok === true) {
      regeneratedDates.push(targetDate);
    }
  }

  const finalStatuses = await Promise.all(firstPassDates.map((date) => privateApiGet(`/api/insertions/${insertion.id}/capture-proof/status?date=${encodeURIComponent(date)}`)));
  const failed = finalStatuses.filter((item) => item?.status !== "audited");
  if (failed.length) {
    throw new Error(`A inserção #${insertion.id} ainda tem ${failed.length} evidência(s) sem auditoria válida.`);
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
  if (!piCodigo || !siteSigla) {
    throw new Error("pi-site-export sem piCodigo/siteSigla válidos.");
  }

  const descriptor = await privateApiGet(`/api/pi-site-exports?piCodigo=${encodeURIComponent(piCodigo)}&siteSigla=${encodeURIComponent(siteSigla)}`);
  if (!descriptor?.insertionIds?.length) {
    throw new Error(`Nenhuma inserção encontrada para PI ${piCodigo} no site ${siteSigla}.`);
  }

  const insertions = await Promise.all(descriptor.insertionIds.map((id) => privateApiGet(`/api/insertions/${id}`)));
  const invalidatedEvidenceIds = [];
  const regeneratedDates = [];
  const analyticsPiStatus = [];
  const analyticsFullMonthStatus = [];
  const stagePayload = {
    piCodigo,
    siteSigla,
    insertionIds: descriptor.insertionIds,
  };

  await progressJob(job.id, { stage: "reauditando evidências", ...stagePayload });
  for (const insertion of insertions) {
    const capture = await ensureInsertionCaptureCoverage(insertion);
    invalidatedEvidenceIds.push(...capture.invalidatedEvidenceIds);
    regeneratedDates.push(...capture.regeneratedDates.map((date) => ({ insertionId: insertion.id, date })));
  }

  await progressJob(job.id, { stage: "garantindo documentos operacionais", ...stagePayload, regeneratedDates, invalidatedEvidenceIds });
  for (const insertion of insertions) {
    await ensureOperationalDocuments(insertion);
  }

  await progressJob(job.id, { stage: "gerando analytics pi", ...stagePayload, regeneratedDates, invalidatedEvidenceIds });
  for (const insertion of insertions) {
    analyticsPiStatus.push({ insertionId: insertion.id, ...(await ensureAnalyticsMode(insertion, "pi")) });
  }

  await progressJob(job.id, { stage: "gerando analytics full_month", ...stagePayload, regeneratedDates, invalidatedEvidenceIds, analyticsPiStatus });
  for (const insertion of insertions) {
    analyticsFullMonthStatus.push({ insertionId: insertion.id, ...(await ensureAnalyticsMode(insertion, "full_month")) });
  }

  await progressJob(job.id, { stage: "montando zip final", ...stagePayload, regeneratedDates, invalidatedEvidenceIds, analyticsPiStatus, analyticsFullMonthStatus });
  const downloadUrl = `${OPS_API_BASE_URL}/api/pi-site-exports?piCodigo=${encodeURIComponent(piCodigo)}&siteSigla=${encodeURIComponent(siteSigla)}&download=1`;
  return {
    stage: "completed",
    piCodigo,
    siteSigla,
    insertionIds: descriptor.insertionIds,
    invalidatedEvidenceIds,
    regeneratedDates,
    analyticsPiStatus,
    analyticsFullMonthStatus,
    downloadUrl,
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

  console.log(`[runner] iniciado em ${RUNNER_ID}`);
  console.log(`[runner] ops=${OPS_API_BASE_URL}`);
  console.log(`[runner] privateApi=${PRIVATE_ADOPS_API_BASE_URL}`);
  console.log(`[runner] kinds=${kinds.join(",")}`);
  console.log(`[runner] drivePiMonitor=${DRIVE_PI_MONITOR_ENABLED ? "enabled" : "disabled"}`);

  while (true) {
    try {
      await runWatchdogIfDue(false);
      await runDrivePiMonitorOnce();
      const handled = await runOnce();
      if (!handled) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error("[runner] ciclo com erro", error instanceof Error ? error.message : String(error));
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
