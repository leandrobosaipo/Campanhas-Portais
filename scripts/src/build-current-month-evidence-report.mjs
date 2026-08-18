#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import sitesConfig from "../../config/adrotate-sites.json" with { type: "json" };
import {
  buildAtomicPublishCommand,
  buildCampaignFilterMetadata,
  buildPortalFilterOptions,
  buildCampaignExportIdempotencyKey,
  buildCampaignEvidenceExportDownloadUrl,
  buildMonthlyPublicationGate,
  buildPiSiteExportDownloadUrl,
  buildMonthlyReportManifest,
  buildSevenDayForecast,
  classifyEvidenceStatus,
  findReportsMountSource,
  isMonthlyReportPublishable,
  MONTHLY_REPORT_SOURCE_TIMEOUT_MS,
  MONTHLY_REPORT_PORTAINER_TIMEOUT_MS,
  MONTHLY_REPORT_EXPORT_CREATE_TIMEOUT_MS,
  MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS,
  buildDeliveryProbeOptions,
  adaptAggregatedEvidenceDay,
  canonicalCommercialPi,
  competenciaMatchesMonth,
  canonicalRequiredDates,
  EVIDENCE_ZIP_VALIDATION_PYTHON,
  shouldRetryDeliveryStatus,
  takeDeliverySamples,
  resolveReportPortainerUrl,
  resolveReportsPublishMount,
  isJsonContentType,
  selectCanonicalInsertions,
} from "./monthly-evidence-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiBase = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, "");
const deliveryApiBase = (process.env.ADOPS_DELIVERY_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const adopsPanelBase = (process.env.ADOPS_PANEL_BASE_URL || "https://adops-campanhas-portais.pages.dev").replace(/\/$/, "");
const portainerEnvFile = process.env.PORTAINER_ENV_FILE || "/Users/leandrobosaipo/Projetos/macmini/.env.portainer";
const opsEnvFile = process.env.OPS_ENV_FILE || path.join(repoRoot, ".env.adops-operator.local");
const timeZone = "America/Cuiaba";
const monthNames = [
  "JANEIRO",
  "FEVEREIRO",
  "MARCO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];
const monthSlugNames = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const generatedAt = new Date();
const targetDate = process.env.ADOPS_REPORT_DATE || formatIsoDateInZone(generatedAt, timeZone);
const targetMonth = process.env.ADOPS_REPORT_MONTH || targetDate.slice(0, 7);
const competencia = process.env.ADOPS_REPORT_COMPETENCIA || competenciaFromMonth(targetMonth);
const monthSlug = slugMonth(targetMonth);
const slug = process.env.ADOPS_REPORT_SLUG || `adops-evidencias-${monthSlug}`;
const outputRoot = path.join(repoRoot, "docs", "reports", slug);
const snapshotSlug = new Date().toISOString().replace(/[:.]/g, "-");
const latestDir = outputRoot;
const snapshotDir = path.join(outputRoot, snapshotSlug);
const outputPath = path.join(latestDir, "index.html");
const snapshotPath = path.join(snapshotDir, "index.html");
const publicUrl = `https://sites.codigo5.com.br/reports/${slug}/`;
const sheetDocumentId = "1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu";
const driveMediaFolderId = "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6";
const sheetGids = { "AGOSTO 2026": "971687922" };
const currentSheetName = competencia.replace("/", " ");
const currentSheetUrl = `https://docs.google.com/spreadsheets/d/${sheetDocumentId}/edit${sheetGids[currentSheetName] ? `#gid=${sheetGids[currentSheetName]}` : ""}`;
const driveMediaUrl = `https://drive.google.com/drive/folders/${driveMediaFolderId}`;
const reportMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AdOps"><rect width="128" height="128" rx="16" fill="#164e63"/><path d="M28 92 53 32h22l25 60H80l-4-12H52l-4 12H28Zm30-29h12l-6-18-6 18Z" fill="#fff"/></svg>`;
let apiRequestCount = 0;
let apiResponseBytes = 0;

const terminalStatuses = new Set(["cancelado", "cancelada"]);

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function money(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function formatIsoDateInZone(date, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function datePt(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function fullDatePt(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function dateTimePt(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("pt-BR", { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
}

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    end: `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function competenciaFromMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthNames[monthNumber - 1]}/${year}`;
}

function slugMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthSlugNames[monthNumber - 1]}-${year}`;
}

function dayRange(start, end) {
  if (!start || !end || start > end) return [];
  const days = [];
  const current = new Date(`${start}T12:00:00Z`);
  const limit = new Date(`${end}T12:00:00Z`);
  while (current <= limit) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function clampDate(value, min, max) {
  if (!value) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function findFormat(siteConfig, format) {
  const needle = normalize(format);
  for (const mapping of siteConfig?.formatMappings || []) {
    if ((mapping.aliases || []).some((alias) => normalize(alias) === needle)) return mapping;
  }
  return null;
}

function siteLogoUrl(item) {
  if (item.siteLogoUrl?.startsWith("http")) return item.siteLogoUrl;
  if (item.siteLogoUrl?.startsWith("/")) return `${adopsPanelBase}${item.siteLogoUrl}`;
  return "";
}

function apiHeaders() {
  const token = parseEnvFile(opsEnvFile).OPS_API_TOKEN || process.env.OPS_API_TOKEN || "";
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function api(pathname, options = {}) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 45000;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      apiRequestCount += 1;
      const response = await fetchWithTimeout(`${apiBase}${pathname}`, {
        method: options.method || "GET",
        headers: {
          ...apiHeaders(),
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers || {}),
        },
        body: options.body,
      }, timeoutMs);
      const text = await response.text();
      apiResponseBytes += Buffer.byteLength(text);
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
      if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${String(text).slice(0, 600)}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function portainer(method, apiPath, body, rawBody, rawHeaders = {}) {
  const env = { ...parseEnvFile(portainerEnvFile), ...process.env };
  const portainerUrl = resolveReportPortainerUrl(env);
  if (!portainerUrl || !env.PORTAINER_API_KEY) throw new Error("PORTAINER_URL ou PORTAINER_API_KEY ausente.");
  const url = `${portainerUrl}${apiPath}`;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, {
        method,
        headers: {
          "X-API-Key": env.PORTAINER_API_KEY,
          ...(body ? { "content-type": "application/json" } : {}),
          ...rawHeaders,
        },
        body: body ? JSON.stringify(body) : rawBody,
      }, MONTHLY_REPORT_PORTAINER_TIMEOUT_MS);
      if (!shouldRetryDeliveryStatus(response.status) || attempt === 3) break;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw new Error(`Portainer ${method} ${apiPath} falhou após 3 tentativas: ${error.message}`, { cause: error });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  if (!response) throw lastError;
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(`Portainer ${method} ${apiPath} HTTP ${response.status}: ${String(text).slice(0, 500)}`);
  return payload;
}

async function getContainer(name) {
  const containers = await portainer("GET", "/api/endpoints/3/docker/containers/json?all=true");
  return containers.find((item) => (item.Names || []).includes(`/${name}`));
}

async function execInContainer(containerId, command) {
  const created = await portainer("POST", `/api/endpoints/3/docker/containers/${containerId}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ["sh", "-lc", command],
  });
  const result = await portainer("POST", `/api/endpoints/3/docker/exec/${created.Id}/start`, { Detach: false, Tty: false });
  const inspected = await portainer("GET", `/api/endpoints/3/docker/exec/${created.Id}/json`);
  if (inspected?.ExitCode !== 0) throw new Error(`Troca atômica falhou: ${String(result || "").slice(0, 500)}`);
}

async function publishReport() {
  const directMount = resolveReportsPublishMount(process.env);
  if (directMount) {
    const publishToken = Date.now();
    const stagingDir = path.join(directMount, `${slug}.staging-${publishToken}`);
    const destinationDir = path.join(directMount, slug);
    const backupDir = path.join(directMount, `${slug}.backup-${publishToken}`);
    await cp(latestDir, stagingDir, { recursive: true });
    if (existsSync(destinationDir)) await rename(destinationDir, backupDir);
    try {
      await rename(stagingDir, destinationDir);
    } catch (error) {
      if (existsSync(backupDir) && !existsSync(destinationDir)) await rename(backupDir, destinationDir);
      throw error;
    }
    return;
  }
  const sites = await getContainer("sites-index");
  if (!sites) throw new Error("Container sites-index nao encontrado.");
  const inspect = await portainer("GET", `/api/endpoints/3/docker/containers/${sites.Id}/json`);
  const reportsMountSource = findReportsMountSource(inspect.Mounts);

  const publishToken = Date.now();
  const stagingName = `${slug}.staging-${publishToken}`;
  const backupName = `${slug}.backup-${publishToken}`;
  const publishRoot = path.join("/tmp", `${slug}-publish-${publishToken}`);
  const publishDir = path.join(publishRoot, stagingName);
  const tarPath = path.join("/tmp", `${stagingName}.tar`);
  await mkdir(publishRoot, { recursive: true });
  await cp(latestDir, publishDir, { recursive: true });
  const tar = spawnSync("tar", ["--no-xattrs", "-C", publishRoot, "-cf", tarPath, stagingName], {
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar falhou.");

  const helperName = `adops-evidence-report-publish-${publishToken}`;
  const helper = await portainer("POST", `/api/endpoints/3/docker/containers/create?name=${helperName}`, {
    Image: "node:22-alpine",
    Labels: {
      "cod5.project": "adops",
      "cod5.kind": "report-publisher",
      "cod5.service": slug,
    },
    Cmd: ["sh", "-lc", "mkdir -p /target && sleep 120"],
    HostConfig: {
      Binds: [`${reportsMountSource}:/target`],
      NetworkMode: "none",
      RestartPolicy: { Name: "no" },
    },
  });
  await portainer("POST", `/api/endpoints/3/docker/containers/${helper.Id}/start`);
  try {
    const bytes = readFileSync(tarPath);
    await portainer(
      "PUT",
      `/api/endpoints/3/docker/containers/${helper.Id}/archive?path=${encodeURIComponent("/target")}`,
      null,
      bytes,
      { "content-type": "application/x-tar" },
    );
    await execInContainer(helper.Id, buildAtomicPublishCommand({ slug, stagingName, backupName }));
  } finally {
    await portainer("POST", `/api/endpoints/3/docker/containers/${helper.Id}/stop?t=2`).catch(() => null);
    await portainer("DELETE", `/api/endpoints/3/docker/containers/${helper.Id}?v=false&force=true`).catch(() => null);
    await Promise.allSettled([
      rm(publishRoot, { recursive: true, force: true }),
      rm(tarPath, { force: true }),
    ]);
  }
}

function icon(name) {
  const icons = {
    ok: '<svg viewBox="0 0 20 20"><path d="M7.7 14.2 3.8 10.3l1.4-1.4 2.5 2.5 7.1-7.1 1.4 1.4-8.5 8.5Z"/></svg>',
    warn: '<svg viewBox="0 0 20 20"><path d="M10 2 19 18H1L10 2Zm0 5.8-1 5.1h2l-1-5.1Zm-1 7v2h2v-2H9Z"/></svg>',
    clock: '<svg viewBox="0 0 20 20"><path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 8.1 3.2 1.9-1 1.6L9 11V5h2v5.1Z"/></svg>',
    link: '<svg viewBox="0 0 20 20"><path d="M7.5 12.5a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0Zm-1.4 1.4a4 4 0 0 1 0-5.7l2-2 1.4 1.4-2 2a2 2 0 0 0 2.8 2.8l2-2 1.4 1.4-2 2a4 4 0 0 1-5.6 0Zm4.4-7.3 2-2a4 4 0 0 1 5.6 5.6l-2 2-1.4-1.4 2-2A2 2 0 0 0 13.9 6l-2 2-1.4-1.4Z"/></svg>',
    image: '<svg viewBox="0 0 20 20"><path d="M3 4h14v12H3V4Zm2 2v7.2l3.2-3.2 2.3 2.3 1.8-1.8L15 13.2V6H5Zm1.8 2.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"/></svg>',
    plugin: '<svg viewBox="0 0 20 20"><path d="M7 2h2v4h2V2h2v4h2v4a5 5 0 0 1-4 4.9V18H9v-3.1A5 5 0 0 1 5 10V6h2V2Zm0 6v2a3 3 0 1 0 6 0V8H7Z"/></svg>',
  };
  return icons[name] || icons.link;
}

function linkButton(href, label, iconName) {
  if (!href) return "";
  return `<a class="icon-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}">${icon(iconName)}<span>${escapeHtml(label)}</span></a>`;
}

function statusBadge(status, label) {
  const iconName = status === "ok" ? "ok" : status === "scheduled" ? "clock" : status === "not_published" ? "plugin" : "warn";
  return `<span class="status ${escapeHtml(status)}" title="${escapeHtml(label)}">${icon(iconName)}<span>${escapeHtml(label)}</span></span>`;
}

function computeInsertionState(item, evidenceDays, today) {
  if (item.periodoInicio > today) return "scheduled";
  if (!item.bannerPublicadoNoSite) return "not_published";
  const missing = evidenceDays.filter((day) => day.status === "missing").length;
  const invalid = evidenceDays.filter((day) => !day.status.startsWith("audited") && day.status !== "missing" && day.date <= today).length;
  if (invalid > 0) return "invalid";
  if (missing > 0) return "pending";
  return "ok";
}

function evidenceLabel(state) {
  return {
    ok: "em dia",
    pending: "pendente",
    invalid: "erro",
    scheduled: "agendada",
    not_published: "sem publicação",
  }[state] || state;
}

function evidenceDetails(item) {
  if (item.state === "scheduled") return `Agendada para ${fullDatePt(item.periodoInicio)}. Ainda não exige evidência.`;
  if (item.state === "not_published") return "Fora do gate das campanhas ativas enquanto o banner não estiver publicado. Os retroativos serão exigidos depois da publicação.";
  if (item.state === "pending") return `Faltam ${item.missingDates.length} dia(s) com evidência auditada: ${item.missingDates.map(datePt).join(", ")}.`;
  if (item.state === "invalid") return `Há ${item.invalidDates.length} dia(s) com evidência inválida: ${item.invalidDates.map(datePt).join(", ")}.`;
  return "Todos os dias exigidos até a data alvo têm evidência auditada.";
}

function adrotateLinks(item, relation) {
  const cfg = sitesConfig[item.siteSigla] || {};
  const mapping = findFormat(cfg, item.localFormatoNormalizado || item.localFormato);
  const adId = relation?.exactLiveMatches?.[0]?.adId || relation?.historicalAdminMatches?.[0]?.adId || null;
  const adUrl = cfg.adminBaseUrl && adId ? `${cfg.adminBaseUrl}/admin.php?page=adrotate&view=edit&ad=${encodeURIComponent(adId)}` : "";
  const groupUrl = cfg.adminBaseUrl && mapping?.groupId ? `${cfg.adminBaseUrl}/admin.php?page=adrotate-groups&view=group&id=${encodeURIComponent(mapping.groupId)}` : "";
  return { adUrl, groupUrl, groupId: mapping?.groupId || null };
}

function buildPortalGroups(items) {
  const portals = new Map();
  for (const item of items) {
    const portalKey = item.siteSigla || "SEM_PORTAL";
    const portal = portals.get(portalKey) || {
      key: portalKey,
      label: item.siteNome || sitesConfig[portalKey]?.label || portalKey,
      logo: siteLogoUrl(item),
      homeUrl: sitesConfig[portalKey]?.homeUrl || "",
      campaigns: new Map(),
      stats: { total: 0, active: 0, scheduled: 0, ended: 0, ok: 0, pending: 0, invalid: 0, not_published: 0, evidences: 0 },
    };
    portal.stats.total += 1;
    if (item.periodoInicio > targetDate) portal.stats.scheduled += 1;
    else if (item.periodoFim < targetDate) portal.stats.ended += 1;
    else portal.stats.active += 1;
    portal.stats[item.state] += 1;
    portal.stats.evidences += item.evidenceDays.filter((day) => day.status.startsWith("audited")).length;
    const campaignKey = `${item.campanhaId || "sem"}-${item.campanhaName || ""}`;
    const campaign = portal.campaigns.get(campaignKey) || {
      key: campaignKey,
      id: item.campanhaId,
      name: item.campanhaName || `Campanha ${item.campanhaId || "-"}`,
      pi: item.piCodigo || "",
      cliente: item.clienteNome || "",
      agencia: item.agenciaNome || "",
      items: [],
      value: 0,
    };
    campaign.items.push(item);
    campaign.value += Number(item.valorLiquido || 0);
    portal.campaigns.set(campaignKey, campaign);
    portals.set(portalKey, portal);
  }
  return Array.from(portals.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((portal) => ({ ...portal, campaigns: Array.from(portal.campaigns.values()).sort((a, b) => a.name.localeCompare(b.name)) }));
}

async function mapLimit(values, limit, fn) {
  const results = new Array(values.length);
  let index = 0;
  async function worker() {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= values.length) return;
      results[current] = await fn(values[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

async function waitForCompactJob(jobId, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const delays = [2_000, 4_000, 8_000, 15_000];
  let attempt = 0;
  for (;;) {
    const progress = await api(`/api/ops/jobs/${encodeURIComponent(jobId)}/progress`);
    if (progress.status === "completed") return progress;
    if (progress.status === "failed") throw new Error(`${label} falhou: ${progress.error || "erro sem detalhe"}.`);
    if (Date.now() >= deadline) throw new Error(`Timeout em ${label}.`);
    const baseDelay = delays[Math.min(attempt, delays.length - 1)];
    const jitter = Math.floor(Math.random() * Math.min(750, baseDelay / 4));
    await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    attempt += 1;
  }
}

async function materializeCampaignExports(items) {
  const preloaded = (() => {
    try {
      return JSON.parse(process.env.ADOPS_REPORT_EXPORTS_JSON || "{}");
    } catch {
      return {};
    }
  })();
  const groups = new Map();
  for (const item of items) {
    const canonicalPi = canonicalCommercialPi(item.piCodigo);
    if (!canonicalPi || !item.siteSigla) continue;
    const key = `${normalize(item.siteSigla)}:${normalize(canonicalPi)}`;
    const group = groups.get(key) || { key, piCodigo: canonicalPi, siteSigla: item.siteSigla, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const results = new Map();
  await mapLimit(Array.from(groups.values()), 3, async (group) => {
    const evidenceDays = group.items.flatMap((item) => item.evidenceDays.filter((day) => day.status.startsWith("audited") && day.url));
    const required = group.items.reduce((sum, item) => sum + item.requiredDays.length, 0);
    if (!required || evidenceDays.length !== required) return;
    if (preloaded[group.key]) {
      results.set(group.key, preloaded[group.key]);
      return;
    }
    if (process.env.ADOPS_REPORT_SKIP_EXPORTS === "1") return;
    const idempotencyKey = buildCampaignExportIdempotencyKey({
      piCodigo: group.piCodigo,
      siteSigla: group.siteSigla,
      competencia,
      evidences: evidenceDays,
    });
    const created = await api("/api/pi-site-exports/jobs", {
      method: "POST",
      body: JSON.stringify({
        piCodigo: group.piCodigo,
        siteSigla: group.siteSigla,
        mode: "prints-only",
        variant: "web",
        imageMaxWidth: 1600,
        imageQuality: 72,
        requestedBy: "evidence-monthly-report",
        source: "monthly-report",
      }),
      headers: { "idempotency-key": idempotencyKey },
      timeoutMs: MONTHLY_REPORT_EXPORT_CREATE_TIMEOUT_MS,
    });
    if (created.status !== "completed") {
      await waitForCompactJob(created.jobId, `exportação ${group.piCodigo}/${group.siteSigla}`, 20 * 60_000);
    }
    results.set(group.key, buildPiSiteExportDownloadUrl(apiBase, created.jobId));
  });
  return results;
}

async function materializeCompleteCampaignExports(items) {
  const groups = new Map();
  for (const item of items) {
    const piCodigo = canonicalCommercialPi(item.piCodigo);
    if (!piCodigo || !item.competencia) continue;
    const key = `${piCodigo}:${normalize(item.competencia)}`;
    const group = groups.get(key) || { key, piCodigo, competencia: item.competencia, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const results = new Map();
  const readyGroups = [];
  for (const group of groups.values()) {
    const evidenceDays = group.items.flatMap((item) => item.evidenceDays.filter((day) => day.status.startsWith("audited") && day.url));
    const required = group.items.reduce((sum, item) => sum + item.requiredDays.length, 0);
    if (!required || evidenceDays.length !== required || process.env.ADOPS_REPORT_SKIP_EXPORTS === "1") continue;
    readyGroups.push(group);
  }
  if (!readyGroups.length) return results;
  const batch = await api("/api/campaign-evidence-exports/jobs/batch", {
      method: "POST",
      body: JSON.stringify({
        competencia,
        asOfDate: targetDate,
        campaigns: readyGroups.map((group) => ({ piCodigo: group.piCodigo })),
        mode: "prints-only",
        variant: "web",
        imageMaxWidth: 1600,
        imageQuality: 72,
        requestedBy: "evidence-monthly-report",
        source: "monthly-report",
      }),
      timeoutMs: MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS,
    });
  const itemByPi = new Map((batch.items || []).map((item) => [String(item.piCodigo), item]));
  await Promise.all(readyGroups.map(async (group) => {
    const created = itemByPi.get(String(group.piCodigo));
    if (!created || !created.jobId || ![200, 202].includes(Number(created.httpStatus))) {
      throw new Error(`Exportação completa da PI ${group.piCodigo} foi bloqueada: ${created?.details || created?.error || "sem job"}.`);
    }
    if (created.status !== "completed") {
      await waitForCompactJob(created.jobId, `exportação completa da PI ${group.piCodigo}`, 30 * 60_000);
    }
    results.set(group.key, buildCampaignEvidenceExportDownloadUrl(apiBase, created.jobId));
  }));
  return results;
}

async function validateDeliveryUrl(url, label) {
  const response = await fetchDeliveryWithRetry(url, buildDeliveryProbeOptions(), 120_000);
  if (!response.ok) throw new Error(`${label} indisponível: HTTP ${response.status}.`);
}

async function fetchDeliveryWithRetry(url, options, timeoutMs, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (!shouldRetryDeliveryStatus(response.status) || attempt === attempts) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw lastError;
}

async function validateZipDelivery(url, { complete = false, expectedImages = null } = {}) {
  const response = await fetchDeliveryWithRetry(url, { redirect: "follow", headers: { "cache-control": "no-cache" } }, 10 * 60_000);
  if (!response.ok) throw new Error(`ZIP de amostra indisponível: HTTP ${response.status}.`);
  const tempDir = await mkdtemp(path.join(tmpdir(), "adops-zip-validation-"));
  const zipPath = path.join(tempDir, "sample.zip");
  try {
    await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
    const tested = spawnSync("python3", ["-c", EVIDENCE_ZIP_VALIDATION_PYTHON, zipPath, ...(complete ? ["complete", String(expectedImages ?? "")] : [])], { encoding: "utf8" });
    if (tested.status !== 0) throw new Error(`ZIP inválido: ${tested.error?.message || tested.stderr || tested.stdout || `exit ${tested.status}`}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function validateGeneratedReport({ data, reportManifest, insertions }) {
  const html = await readFile(outputPath, "utf8");
  if (!html.includes('<meta name="robots" content="noindex,nofollow">')) throw new Error("HTML sem noindex,nofollow.");
  if (reportManifest.visibility !== "unlisted") throw new Error("report.json precisa permanecer unlisted.");
  if (!Array.isArray(data.insertions) || data.insertions.length !== insertions.length) throw new Error("data.json inconsistente com as inserções renderizadas.");
  JSON.parse(await readFile(path.join(latestDir, "data.json"), "utf8"));
  JSON.parse(await readFile(path.join(latestDir, "report.json"), "utf8"));

  if (process.env.ADOPS_REPORT_SKIP_PUBLISH === "1") return;
  const individualSamples = takeDeliverySamples(insertions.flatMap((item) => item.evidenceDays.map((day) => day.downloadUrl)));
  const batchSamples = takeDeliverySamples(insertions.map((item) => item.batchDownloadUrl));
  const completeSamples = takeDeliverySamples(insertions.map((item) => item.completeCampaignDownloadUrl));
  for (const [index, url] of individualSamples.entries()) await validateDeliveryUrl(url, `JPEG individual ${index + 1}`);
  for (const [index, url] of batchSamples.entries()) await validateDeliveryUrl(url, `ZIP de campanha ${index + 1}`);
  for (const [index, url] of completeSamples.entries()) await validateDeliveryUrl(url, `ZIP completo da campanha ${index + 1}`);
  if (batchSamples[0]) await validateZipDelivery(batchSamples[0]);
  if (completeSamples[0]) {
    const expectedImages = insertions
      .filter((item) => item.completeCampaignDownloadUrl === completeSamples[0])
      .reduce((total, item) => total + item.evidenceDays.filter((day) => day.status.startsWith("audited")).length, 0);
    await validateZipDelivery(completeSamples[0], { complete: true, expectedImages });
  }
}

function dayTitle(day, item) {
  if (day.status.startsWith("audited")) return `${fullDatePt(day.date)}: evidência auditada.`;
  if (day.status === "missing") return `${fullDatePt(day.date)}: sem evidência auditada. ${item.state === "not_published" ? "Não cobrada porque a inserção não está publicada." : "Precisa gerar retroativo."}`;
  return `${fullDatePt(day.date)}: evidência com status ${day.status}. ${day.issues?.map((issue) => issue.label || issue.code || issue).join(", ") || ""}`;
}

function publicationGuidance(operation) {
  const actions = Array.isArray(operation?.requiredActions) ? operation.requiredActions : [];
  const blockers = Array.isArray(operation?.blockingIssues) ? operation.blockingIssues : [];
  const sourceReason = String(operation?.sourceIdentity?.reason || "").trim();
  const blocker = blockers.map((issue) => issue?.message || issue?.label || issue?.code || issue).find(Boolean)
    || sourceReason
    || (actions.includes("confirm_source_identity") ? "A identidade da campanha ainda precisa ser confirmada." : "A publicação ainda não passou pelo preflight operacional.");
  const action = actions.includes("confirm_source_identity")
    ? "Confirmar a PI no documento autoritativo e executar novo preflight."
    : actions.includes("review_site_divergence")
      ? "Revisar o portal com a PI, a planilha e a inserção canônica."
      : actions.includes("review_period_divergence") || actions.includes("review_format_divergence")
        ? "Corrigir a divergência indicada e executar novo preflight."
        : actions.includes("locate_or_upload_media")
          ? "Confirmar mídia e destino HTTPS e executar novo preflight."
          : actions.includes("publish_on_site")
            ? "Executar o preflight e publicar o banner no portal."
            : "Reconciliar a campanha antes de gerar evidências.";
  return { blocker, action };
}

function renderThumbs(item) {
  if (!item.evidenceDays.length) {
    return `<button class="thumb-empty" type="button" data-modal-id="${escapeHtml(item.modalId)}" title="${escapeHtml(evidenceDetails(item))}">${icon(item.state === "scheduled" ? "clock" : "warn")}<span>${escapeHtml(evidenceLabel(item.state))}</span></button>`;
  }
  return item.evidenceDays
    .map((day) => {
      const title = dayTitle(day, item);
      if (day.status.startsWith("audited") && day.url) {
        return `<button class="thumb audited" type="button" data-modal-id="${escapeHtml(item.modalId)}" data-date="${escapeHtml(day.date)}" title="${escapeHtml(title)}" aria-label="Abrir evidência ${escapeHtml(item.id)} ${escapeHtml(day.date)}"><img src="${escapeHtml(day.downloadUrl || day.url)}" alt="Evidência ${escapeHtml(item.id)} ${escapeHtml(day.date)}" loading="lazy" decoding="async"><span>${escapeHtml(datePt(day.date))}</span></button>`;
      }
      return `<button class="day-card ${escapeHtml(day.status)}" type="button" data-modal-id="${escapeHtml(item.modalId)}" data-date="${escapeHtml(day.date)}" title="${escapeHtml(title)}">${icon(day.status === "missing" ? "warn" : "warn")}<span>${escapeHtml(datePt(day.date))}</span><b>${escapeHtml(day.status === "missing" ? "sem evid." : "inválida")}</b></button>`;
    })
    .join("");
}

function renderInsertion(item) {
  const progress = item.requiredDays.length ? Math.round((item.auditedDays / item.requiredDays.length) * 100) : 100;
  const stateForBadge = item.state === "ok" ? "ok" : item.state === "scheduled" ? "scheduled" : item.state === "not_published" ? "not_published" : "warn";
  const retroactiveLabel = item.retroactiveMissingDates?.length === 1
    ? "1 retroativo pendente"
    : `${item.retroactiveMissingDates?.length || 0} retroativos pendentes`;
  const publicationPending = item.state === "not_published"
    ? `<div class="publication-pending" role="note">
        <strong>Banner não publicado</strong>
        <span>${escapeHtml(retroactiveLabel)}</span>
        ${item.retroactiveMissingDates?.length ? `<small>Datas: ${escapeHtml(item.retroactiveMissingDates.map(fullDatePt).join(", "))}</small>` : ""}
        ${item.publicationBlocker ? `<small><b>Motivo:</b> ${escapeHtml(item.publicationBlocker)}</small>` : ""}
        ${item.publicationAction ? `<small><b>Próxima ação:</b> ${escapeHtml(item.publicationAction)}</small>` : ""}
      </div>`
    : "";
  const endedBadge = item.periodoFim < targetDate
    ? statusBadge("scheduled", `Encerrada em ${fullDatePt(item.periodoFim)}`)
    : "";
  return `<article class="insertion ${escapeHtml(item.state)}">
    <div class="insert-main">
      <div class="insert-top">
        <span class="insert-id">#${escapeHtml(item.id)}</span>
        ${endedBadge}
        ${statusBadge(stateForBadge, evidenceDetails(item))}
      </div>
      <strong>${escapeHtml(item.localFormatoNormalizado || item.localFormato || "-")}</strong>
      <span>${escapeHtml(item.clienteNome || "-")} · ${escapeHtml(item.piCodigo || "sem PI")}</span>
      <small>${fullDatePt(item.periodoInicio)} → ${fullDatePt(item.periodoFim)} · ${item.auditedDays}/${item.requiredDays.length} dias</small>
      <small class="reason">${escapeHtml(evidenceDetails(item))}</small>
      ${publicationPending}
      <div class="bar"><i style="width:${progress}%"></i></div>
      <div class="links">
        ${linkButton(item.portalUrl, "portal", "link")}
        ${linkButton(item.adrotateAdUrl || item.adrotateGroupUrl, item.adrotateAdUrl ? "ad" : "grupo", "plugin")}
        ${linkButton(item.mediaUrl, "mídia", "image")}
        ${linkButton(`${adopsPanelBase}/insercoes/${item.id}`, "adops", "link")}
      </div>
    </div>
    <div class="thumbs">${renderThumbs(item)}</div>
  </article>`;
}

function renderCampaign(campaign, portalKey) {
  const ok = campaign.items.filter((item) => item.state === "ok").length;
  const pending = campaign.items.filter((item) => item.state === "pending").length;
  const scheduled = campaign.items.filter((item) => item.state === "scheduled").length;
  const invalid = campaign.items.filter((item) => item.state === "invalid").length;
  const notPublished = campaign.items.filter((item) => item.state === "not_published").length;
  const campaignAudited = campaign.items.reduce((sum, item) => sum + item.auditedDays, 0);
  const campaignRequired = campaign.items.reduce((sum, item) => sum + item.requiredDays.length, 0);
  const endingWindow = new Date(`${targetDate}T00:00:00.000Z`);
  endingWindow.setUTCDate(endingWindow.getUTCDate() + 7);
  const endingWindowDate = endingWindow.toISOString().slice(0, 10);
  const states = Array.from(new Set(campaign.items.flatMap((item) => [
    item.state,
    item.periodoInicio <= targetDate && item.periodoFim >= targetDate ? "active" : null,
    item.periodoFim > targetDate && item.periodoFim <= endingWindowDate ? "ending" : null,
  ].filter(Boolean)))).join(" ");
  const filterMetadata = buildCampaignFilterMetadata(campaign, targetDate);
  const search = normalize([
    campaign.name,
    campaign.pi,
    campaign.cliente,
    campaign.agencia,
    campaign.id,
    ...campaign.items.flatMap((item) => [item.siteSigla, item.campanhaId, item.id]),
  ].join(" "));
  const batchDownloadUrl = campaign.items.find((item) => item.batchDownloadUrl)?.batchDownloadUrl || "";
  const completeCampaignDownloadUrl = campaign.items.find((item) => item.completeCampaignDownloadUrl)?.completeCampaignDownloadUrl || "";
  const commercialExportBlocker = campaign.items.find((item) => item.commercialExportBlocker)?.commercialExportBlocker || "";
  return `<section class="campaign" data-portal="${escapeHtml(portalKey)}" data-search="${escapeHtml(search)}" data-states="${escapeHtml(states)}" data-publication-states="${escapeHtml(filterMetadata.publicationStates)}" data-evidence-states="${escapeHtml(filterMetadata.evidenceStates)}">
    <div class="campaign-head">
      <div>
        <h3>${escapeHtml(campaign.name)}</h3>
        <p>${escapeHtml(campaign.cliente || "-")} · ${escapeHtml(campaign.agencia || "-")} · ${escapeHtml(campaign.pi || "sem PI")}</p>
        ${completeCampaignDownloadUrl ? linkButton(completeCampaignDownloadUrl, "baixar todos os prints", "image") : ""}
        ${batchDownloadUrl ? linkButton(batchDownloadUrl, "ZIP deste portal", "image") : ""}
        ${commercialExportBlocker ? `<span class="note">${escapeHtml(commercialExportBlocker)}</span>` : ""}
      </div>
      <div class="mini-stats">
        <b>${campaign.items.length}</b><span>ins.</span>
        <b>${ok}</b><span>ok</span>
        <b>${pending}</b><span>pend.</span>
        <b>${scheduled}</b><span>ag.</span>
        <b>${invalid}</b><span>erro</span>
        <b>${notPublished}</b><span>s/pub</span>
        <b>${campaignAudited}/${campaignRequired}</b><span>evid.</span>
      </div>
    </div>
    <div class="insertions">${campaign.items.sort((a, b) => a.id - b.id).map(renderInsertion).join("")}</div>
  </section>`;
}

function renderPortal(portal) {
  return `<section class="portal" id="portal-${escapeHtml(portal.key)}" data-portal="${escapeHtml(portal.key)}">
    <div class="portal-head">
      <div class="brand">
        ${portal.logo ? `<img src="${escapeHtml(portal.logo)}" alt="${escapeHtml(portal.label)}" loading="lazy">` : `<span>${escapeHtml(portal.key)}</span>`}
        <div><h2>${escapeHtml(portal.label)}</h2><a href="${escapeHtml(portal.homeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sitesConfig[portal.key]?.domain || portal.key)}</a></div>
      </div>
      <div class="portal-stats">
        <span><b>${portal.stats.active}</b> ativas</span>
        <span><b>${portal.stats.scheduled}</b> agendadas</span>
        <span><b>${portal.stats.ended}</b> encerradas</span>
        <span><b>${portal.stats.ok}</b> em dia</span>
        <span><b>${portal.stats.pending}</b> pend.</span>
        <span><b>${portal.stats.invalid}</b> erro</span>
        <span><b>${portal.stats.not_published}</b> sem pub.</span>
      </div>
    </div>
    ${portal.campaigns.map((campaign) => renderCampaign(campaign, portal.key)).join("")}
  </section>`;
}

function renderForecast(items, dateField, emptyText) {
  if (!items.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li><b>${escapeHtml(item.campanhaName || item.campaignName || `Inserção #${item.id}`)}</b><span>${escapeHtml(item.siteSigla || "-")} · ${escapeHtml(item.piCodigo || "sem PI")} · ${fullDatePt(item[dateField])}</span></li>`).join("")}</ul>`;
}

function renderHtml({ insertions, portals, audits, summary, forecast, sources, dailyPrintStatus = null }) {
  const modalData = Object.fromEntries(insertions.map((item) => [item.modalId, item]));
  const portalOptions = buildPortalFilterOptions(portals);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>AdOps Evidências · ${escapeHtml(competencia)}</title>
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      --bg: oklch(0.955 0.006 170);
      --panel: oklch(0.988 0.004 170);
      --ink: oklch(0.205 0.026 180);
      --muted: oklch(0.485 0.018 180);
      --line: oklch(0.86 0.012 180);
      --ok: oklch(0.48 0.13 155);
      --warn: oklch(0.43 0.12 65);
      --bad: oklch(0.52 0.16 30);
      --steel: oklch(0.33 0.035 205);
      --paper: oklch(0.976 0.006 95);
    }
    * { box-sizing: border-box; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .skip-link:focus { position: fixed; z-index: 100; top: 8px; left: 8px; width: auto; height: auto; margin: 0; padding: 10px 12px; clip: auto; overflow: visible; border-radius: 4px; background: var(--ink); color: var(--panel); font-weight: 900; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    a { color: inherit; text-decoration: none; }
    svg { width: 16px; height: 16px; fill: currentColor; flex: 0 0 auto; }
    .wrap { width: min(1540px, calc(100% - 28px)); margin: 0 auto; }
    header { position: static; background: color-mix(in oklch, var(--panel) 90%, transparent); border-bottom: 1px solid var(--line); }
    .topbar { min-height: 74px; display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: center; }
    .title { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .mark { width: 42px; height: 42px; display: grid; place-items: center; background: var(--ink); color: var(--panel); border-radius: 8px; font-weight: 900; }
    h1 { margin: 0; font-size: clamp(19px, 2vw, 28px); line-height: 1.05; }
    .sub { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 12px; margin-top: 5px; }
    .snapshot { color: var(--muted); font-size: 12px; text-align: right; }
    .kpis { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; padding: 14px 0 18px; }
    .kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; min-width: 0; }
    .kpi span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; font-weight: 800; }
    .kpi b { display: block; margin-top: 5px; font-size: clamp(18px, 2vw, 28px); line-height: 1; }
    .tools { display: grid; gap: 10px; padding-bottom: 14px; }
    .daily-panel { margin: 16px auto 0; display: grid; gap: 12px; grid-template-columns: minmax(0, 1.5fr) minmax(220px, .7fr); }
    .daily-card, .source-card { padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
    .daily-card h2, .source-card h2 { font-size: 17px; margin-bottom: 8px; }
    .daily-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .daily-grid div { padding: 8px; border-radius: 4px; background: var(--bg); }
    .daily-grid span { display: block; color: var(--muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .daily-grid strong { display: block; margin-top: 4px; font-size: 14px; }
    .daily-summary { margin: 10px 0 0; font-size: 13px; line-height: 1.4; }
    .source-links { display: grid; gap: 8px; }
    .source-links a { min-height: 44px; display: flex; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 4px; color: var(--steel); font-size: 12px; font-weight: 850; }
    .mobile-toolbar { display: none; }
    .filter-panel { border: 0; padding: 0; background: var(--panel); color: var(--ink); }
    .filter-panel-inner { display: grid; gap: 12px; padding: 16px; }
    .filter-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .filter-panel-head h2 { font-size: 18px; }
    .filter-close, .clear-filters, .modal-nav { min-height: 44px; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); color: var(--ink); padding: 8px 12px; font: inherit; font-weight: 800; cursor: pointer; }
    .filter-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .tool-row { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(150px, 240px)); gap: 8px; align-items: end; }
    .filter-field { display: grid; gap: 4px; min-width: 0; }
    .filter-field label { color: var(--muted); font-size: 11px; font-weight: 800; }
    .search, .portal-filter, .publication-filter, .evidence-filter { width: 100%; min-height: 44px; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); color: var(--ink); padding: 10px 12px; font: inherit; }
    .filters { display: flex; gap: 8px; overflow: auto; }
    .filter { min-height: 44px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 4px; padding: 8px 11px; font-weight: 800; font-size: 12px; cursor: pointer; white-space: nowrap; }
    .filter.active { background: var(--ink); color: var(--panel); border-color: var(--ink); }
    .empty-results { margin: 0 0 22px; padding: 22px; border: 1px dashed var(--line); border-radius: 8px; background: var(--panel); text-align: center; }
    main { padding: 18px 0 42px; }
    .portal { margin: 0 0 22px; border: 1px solid var(--line); background: color-mix(in oklch, var(--panel) 78%, var(--paper)); border-radius: 8px; overflow: clip; }
    .portal-head { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 14px; border-bottom: 1px solid var(--line); background: var(--panel); }
    .brand { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .brand img, .brand > span { width: 48px; height: 48px; object-fit: contain; border: 1px solid var(--line); background: var(--bg); border-radius: 8px; padding: 5px; display: grid; place-items: center; font-size: 12px; font-weight: 900; }
    h2 { margin: 0; font-size: 22px; }
    .brand a { display: inline-block; color: var(--muted); font-size: 12px; margin-top: 4px; }
    .portal-stats, .mini-stats { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .portal-stats span, .mini-stats span, .mini-stats b { border: 1px solid var(--line); border-radius: 7px; background: var(--bg); padding: 6px 8px; font-size: 12px; }
    .portal-stats b { font-size: 16px; }
    .campaign { padding: 12px 14px 14px; border-top: 1px solid color-mix(in oklch, var(--line) 70%, transparent); }
    .campaign:first-of-type { border-top: 0; }
    .campaign-head { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; margin-bottom: 10px; }
    h3 { margin: 0; font-size: 17px; line-height: 1.15; }
    .campaign p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
    .insertions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .insertion { display: grid; grid-template-columns: minmax(250px, 0.95fr) minmax(160px, 1fr); gap: 10px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); min-width: 0; }
    .insertion.ok { border-color: color-mix(in oklch, var(--ok) 38%, var(--line)); }
    .insertion.pending { border-color: color-mix(in oklch, var(--warn) 50%, var(--line)); }
    .insertion.invalid { border-color: color-mix(in oklch, var(--bad) 52%, var(--line)); }
    .insertion.scheduled { opacity: .78; }
    .insert-main { min-width: 0; display: grid; gap: 6px; align-content: start; }
    .insert-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .insert-id { font-size: 13px; font-weight: 900; color: var(--steel); }
    .status { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 900; white-space: nowrap; }
    .status.ok { color: var(--ok); background: color-mix(in oklch, var(--ok) 12%, var(--panel)); }
    .status.warn { color: var(--warn); background: color-mix(in oklch, var(--warn) 15%, var(--panel)); }
    .status.scheduled { color: var(--steel); background: color-mix(in oklch, var(--steel) 12%, var(--panel)); }
    .status.not_published { color: var(--steel); background: color-mix(in oklch, var(--steel) 10%, var(--panel)); }
    .insert-main strong { font-size: 14px; line-height: 1.15; }
    .insert-main span, .insert-main small { color: var(--muted); font-size: 12px; line-height: 1.25; }
    .reason { color: var(--ink) !important; background: var(--bg); border-radius: 6px; padding: 6px 7px; }
    .publication-pending { display: grid; gap: 4px; padding: 9px; border: 1px solid color-mix(in oklch, var(--warn) 55%, var(--line)); border-radius: 6px; background: color-mix(in oklch, var(--warn) 9%, var(--panel)); }
    .publication-pending strong { color: var(--ink); }
    .publication-pending span { color: var(--warn); font-weight: 750; }
    .publication-pending small { color: var(--ink); overflow-wrap: anywhere; }
    .bar { height: 6px; border-radius: 999px; background: var(--bg); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--ok); border-radius: inherit; }
    .links { display: flex; flex-wrap: wrap; gap: 6px; }
    .icon-link { min-height: 44px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line); border-radius: 4px; padding: 7px 9px; font-size: 11px; font-weight: 800; color: var(--steel); background: var(--bg); }
    .thumbs { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(118px, 34%); gap: 6px; align-content: start; overflow-x: auto; padding-bottom: 4px; scroll-snap-type: x proximity; }
    .thumb { position: relative; min-width: 44px; min-height: 78px; border: 0; padding: 0; background: var(--bg); border-radius: 4px; overflow: hidden; cursor: pointer; aspect-ratio: 16 / 9; scroll-snap-align: start; }
    .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .thumb span { position: absolute; left: 5px; bottom: 5px; padding: 2px 5px; border-radius: 999px; background: rgba(6, 12, 12, .72); color: white; font-size: 10px; font-weight: 900; }
    .thumb-empty, .day-card { min-height: 78px; display: grid; place-items: center; gap: 3px; color: var(--muted); background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; scroll-snap-align: start; }
    .day-card.missing { color: var(--warn); border-color: color-mix(in oklch, var(--warn) 45%, var(--line)); background: color-mix(in oklch, var(--warn) 9%, var(--panel)); }
    .day-card.invalid_audit, .day-card.failed, .day-card.invalid_url { color: var(--bad); border-color: color-mix(in oklch, var(--bad) 45%, var(--line)); background: color-mix(in oklch, var(--bad) 8%, var(--panel)); }
    .day-card b { font-size: 10px; }
    dialog { width: min(1180px, calc(100% - 24px)); border: 0; padding: 0; border-radius: 8px; background: var(--panel); color: var(--ink); box-shadow: 0 20px 80px rgba(0,0,0,.4); }
    dialog::backdrop { background: rgba(8, 14, 15, .78); }
    .modal-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; max-height: 88vh; }
    .modal-image { background: oklch(0.12 0.01 180); display: grid; place-items: center; min-height: 420px; }
    .modal-image img { max-width: 100%; max-height: 88vh; object-fit: contain; }
    .modal-side { padding: 14px; border-left: 1px solid var(--line); overflow: auto; }
    .modal-side h2 { font-size: 18px; margin-bottom: 8px; padding-right: 72px; }
    .modal-date { display: block; color: var(--muted); font-size: 12px; font-weight: 800; margin: -2px 0 8px; }
    .modal-navigation { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
    .modal-nav:disabled { opacity: .45; cursor: not-allowed; }
    .modal-details summary { min-height: 44px; display: flex; align-items: center; font-weight: 900; cursor: pointer; }
    .modal-side dl { display: grid; grid-template-columns: 88px 1fr; gap: 8px; font-size: 12px; }
    .modal-side dt { color: var(--muted); }
    .modal-side dd { margin: 0; overflow-wrap: anywhere; }
    .modal-days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 12px 0; }
    .day-dot { min-height: 44px; border: 1px solid var(--line); border-radius: 6px; padding: 5px 2px; text-align: center; font-size: 10px; color: var(--muted); background: var(--panel); cursor: pointer; }
    .day-dot.audited { color: var(--ok); border-color: color-mix(in oklch, var(--ok) 40%, var(--line)); }
    .day-dot.missing { color: var(--warn); border-color: color-mix(in oklch, var(--warn) 45%, var(--line)); }
    .day-dot.invalid_audit, .day-dot.failed, .day-dot.invalid_url { color: var(--bad); border-color: color-mix(in oklch, var(--bad) 45%, var(--line)); }
    .day-dot.current { color: var(--panel); background: var(--steel); border-color: var(--steel); }
    .modal-close { position: absolute; min-width: 44px; min-height: 44px; top: 8px; right: 8px; border: 1px solid rgba(255,255,255,.25); border-radius: 4px; background: rgba(0,0,0,.66); color: white; padding: 8px 10px; cursor: pointer; font-weight: 900; }
    .forecast { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 18px; }
    .forecast article { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 12px; }
    .forecast h2 { font-size: 16px; }
    .forecast p, .forecast ul { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    .forecast ul { padding-left: 18px; }
    .forecast li { margin: 7px 0; }
    .forecast li span { display: block; }
    :focus-visible { outline: 3px solid #145da0; outline-offset: 2px; }
    [hidden] { display: none !important; }
    footer { padding: 20px 0 36px; color: var(--muted); font-size: 12px; }
    @media (max-width: 1180px) { .kpis { grid-template-columns: repeat(4, 1fr); } .insertions { grid-template-columns: 1fr; } }
    @media (max-width: 760px) {
      .topbar, .portal-head, .campaign-head, .insertion, .modal-grid, .forecast, .tool-row, .daily-panel { grid-template-columns: 1fr; }
      .daily-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .snapshot { text-align: left; }
      .kpis { grid-template-columns: repeat(2, 1fr); }
      .portal-stats, .mini-stats { justify-content: flex-start; }
      .modal-side { border-left: 0; border-top: 1px solid var(--line); }
      .desktop-tools { display: none; }
      .mobile-toolbar { position: sticky; top: 0; z-index: 20; min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px max(14px, env(safe-area-inset-right)) 6px max(14px, env(safe-area-inset-left)); background: color-mix(in oklch, var(--panel) 94%, transparent); border-bottom: 1px solid var(--line); backdrop-filter: blur(14px); }
      .mobile-toolbar strong { min-width: 0; font-size: 14px; }
      .mobile-toolbar span { display: block; color: var(--muted); font-size: 11px; font-weight: 700; }
      .mobile-toolbar button { min-width: 88px; min-height: 44px; border: 1px solid var(--line); border-radius: 4px; background: var(--ink); color: var(--panel); font: inherit; font-weight: 900; }
      .filter-panel { width: 100%; max-width: none; max-height: 85dvh; margin: auto 0 0; border-radius: 12px 12px 0 0; }
      .filter-panel::backdrop { background: rgba(8, 14, 15, .58); }
      .filter-panel-inner { max-height: 85dvh; overflow: auto; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
      .filter-panel .tool-row { display: grid; gap: 10px; }
      .filter-panel .filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: visible; }
      .filter-panel .filter { width: 100%; }
      #modal { width: 100%; max-width: none; height: 100dvh; max-height: none; margin: 0; border-radius: 0; }
      #modal .modal-grid { max-height: 100dvh; height: 100%; grid-template-rows: minmax(38dvh, 58dvh) minmax(0, 1fr); }
      #modal .modal-image { min-height: 0; }
      #modal .modal-image img { max-height: 58dvh; }
      #modal .modal-side { min-height: 0; overflow: auto; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
      .thumbs { grid-auto-columns: minmax(132px, 46%); }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <a class="visually-hidden skip-link" href="#mainContent">Ir para as campanhas</a>
  <header>
    <div class="wrap topbar">
      <div class="title">
        <div class="mark">A5</div>
        <div>
          <h1>Evidências AdOps · ${escapeHtml(competencia)}</h1>
          <div class="sub"><span>${fullDatePt(monthBounds(targetMonth).start)} → ${fullDatePt(targetDate)}</span><span>${escapeHtml(publicUrl)}</span></div>
        </div>
      </div>
      <div class="snapshot">Atualizado<br><strong>${escapeHtml(generatedAt.toLocaleString("pt-BR", { timeZone }))}</strong></div>
    </div>
    <div class="wrap">
      <section class="kpis">
        <div class="kpi"><span>inserções</span><b>${summary.total}</b></div>
        <div class="kpi"><span>ativas</span><b>${summary.active}</b></div>
        <div class="kpi"><span>agendadas</span><b>${summary.scheduled}</b></div>
        <div class="kpi"><span>encerradas</span><b>${summary.ended}</b></div>
        <div class="kpi"><span>em dia</span><b>${summary.ok}</b></div>
        <div class="kpi"><span>pendentes</span><b>${summary.pending}</b></div>
        <div class="kpi"><span>erro</span><b>${summary.invalid}</b></div>
        <div class="kpi"><span>sem pub.</span><b>${summary.notPublished}</b></div>
        <div class="kpi"><span>evidências</span><b>${summary.auditedDays}</b></div>
      </section>
      <div class="tools desktop-tools" aria-label="Filtros do relatório">
        <div class="tool-row">
          <div class="filter-field">
            <label for="campaignSearchDesktop">Buscar campanha, PI ou portal</label>
            <input class="search" id="campaignSearchDesktop" type="search" placeholder="Buscar campanha, PI ou portal" autocomplete="off">
          </div>
          <div class="filter-field">
            <label for="portalFilterDesktop">Portal</label>
            <select class="portal-filter" id="portalFilterDesktop">
              ${portalOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </div>
          <div class="filter-field">
            <label for="publicationFilterDesktop">Publicação</label>
            <select class="publication-filter" id="publicationFilterDesktop">
              <option value="all">Todas</option><option value="active">Ativas</option><option value="not_published">Não publicadas</option><option value="scheduled">Agendadas</option><option value="ending">Encerrando</option><option value="ended">Encerradas</option>
            </select>
          </div>
          <div class="filter-field">
            <label for="evidenceFilterDesktop">Evidências</label>
            <select class="evidence-filter" id="evidenceFilterDesktop">
              <option value="all">Todas</option><option value="complete">Completas</option><option value="retroactive_missing">Retroativos pendentes</option><option value="invalid">Com erro</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </header>
  <section class="wrap daily-panel" aria-labelledby="dailyRoutineTitle">
    <article class="daily-card">
      <h2 id="dailyRoutineTitle">Rotina diária</h2>
      <div class="daily-grid">
        <div><span>Última tentativa</span><strong>${escapeHtml(dailyPrintStatus?.lastAttempt?.targetDate ? datePt(dailyPrintStatus.lastAttempt.targetDate) : "Ainda não registrada")}</strong></div>
        <div><span>Situação</span><strong>${escapeHtml(dailyPrintStatus?.lastAttempt?.status === "completed" ? "Concluída" : dailyPrintStatus?.lastAttempt?.status === "partial" ? "Parcial" : dailyPrintStatus?.lastAttempt?.status === "running" ? "Em execução" : dailyPrintStatus?.lastAttempt?.status === "queued" ? "Na fila" : dailyPrintStatus?.lastAttempt ? "Falhou" : "Sem histórico")}</strong></div>
        <div><span>Início e fim</span><strong>${escapeHtml(dailyPrintStatus?.lastAttempt ? `${dateTimePt(dailyPrintStatus.lastAttempt.startedAt)} → ${dateTimePt(dailyPrintStatus.lastAttempt.finishedAt)}` : "—")}</strong></div>
        <div><span>Aprovadas</span><strong>${escapeHtml(dailyPrintStatus?.lastAttempt ? `${dailyPrintStatus.lastAttempt.approved}/${dailyPrintStatus.lastAttempt.expected}` : "—")}</strong></div>
        <div><span>Ausentes e inválidas</span><strong>${escapeHtml(dailyPrintStatus?.lastAttempt ? `${dailyPrintStatus.lastAttempt.missing} ausentes · ${dailyPrintStatus.lastAttempt.invalid} inválidas` : "—")}</strong></div>
        <div><span>Próxima execução</span><strong><time id="dailyCountdown" data-next-run="${escapeHtml(dailyPrintStatus?.nextRunAt || "")}" datetime="${escapeHtml(dailyPrintStatus?.nextRunAt || "")}">calculando</time></strong></div>
      </div>
      <p class="daily-summary">${escapeHtml(dailyPrintStatus?.lastAttempt?.summary || "A rotina diária ainda não possui uma tentativa registrada.")} ${dailyPrintStatus?.lastFullyApproved?.targetDate ? `Último dia 100% aprovado: ${escapeHtml(datePt(dailyPrintStatus.lastFullyApproved.targetDate))}.` : "Ainda não há um dia 100% aprovado no histórico compacto."}${dailyPrintStatus?.lastAttempt?.jobId ? ` Job: ${escapeHtml(dailyPrintStatus.lastAttempt.jobId)}.` : ""}</p>
    </article>
    <aside class="source-card" aria-labelledby="sourceTitle">
      <h2 id="sourceTitle">Fontes</h2>
      <div class="source-links">
        <a href="${escapeHtml(currentSheetUrl)}" target="_blank" rel="noreferrer">Planilha — aba ${escapeHtml(currentSheetName)}</a>
        <a href="${escapeHtml(driveMediaUrl)}" target="_blank" rel="noreferrer">Pasta de mídias no Google Drive</a>
      </div>
    </aside>
  </section>
  <div class="mobile-toolbar" aria-label="Controles móveis do relatório">
    <strong>Evidências AdOps<span id="resultCount" aria-live="polite">${summary.total} campanhas</span></strong>
    <button type="button" id="filterToggle" aria-controls="filterPanel" aria-expanded="false">Filtros</button>
  </div>
  <dialog class="filter-panel" id="filterPanel" aria-labelledby="filterPanelTitle">
    <div class="filter-panel-inner">
      <div class="filter-panel-head"><h2 id="filterPanelTitle">Filtrar campanhas</h2><button class="filter-close" type="button" id="filterClose">Fechar</button></div>
      <div class="tool-row">
        <div class="filter-field"><label for="campaignSearch">Buscar campanha, PI ou portal</label><input class="search" id="campaignSearch" type="search" placeholder="Buscar campanha, PI ou portal" autocomplete="off"></div>
        <div class="filter-field"><label for="portalFilter">Portal</label><select class="portal-filter" id="portalFilter">${portalOptions.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}</select></div>
        <div class="filter-field"><label for="publicationFilter">Publicação</label><select class="publication-filter" id="publicationFilter"><option value="all">Todas</option><option value="active">Ativas</option><option value="not_published">Não publicadas</option><option value="scheduled">Agendadas</option><option value="ending">Encerrando</option><option value="ended">Encerradas</option></select></div>
        <div class="filter-field"><label for="evidenceFilter">Evidências</label><select class="evidence-filter" id="evidenceFilter"><option value="all">Todas</option><option value="complete">Completas</option><option value="retroactive_missing">Retroativos pendentes</option><option value="invalid">Com erro</option></select></div>
      </div>
      <div class="filter-actions"><button class="clear-filters" type="button" id="clearFilters">Limpar filtros</button></div>
    </div>
  </dialog>
  <main class="wrap" id="mainContent" tabindex="-1">
    <section class="forecast" aria-label="Previsão dos próximos sete dias">
      <article><h2>Próximas a entrar no ar</h2>${renderForecast(forecast.starting, "periodoInicio", "Nenhuma entrada prevista na janela.")}</article>
      <article><h2>Próximas a vencer</h2>${renderForecast(forecast.ending, "periodoFim", "Nenhum vencimento previsto na janela.")}</article>
    </section>
    ${portals.map(renderPortal).join("") || '<section class="portal"><div class="portal-head"><h2>Sem inserções ativas ou agendadas</h2></div></section>'}
    <p class="empty-results" id="emptyResults" role="status" hidden>Nenhuma campanha encontrada.</p>
  </main>
  <footer class="wrap">Fonte: Planilha via API AdOps, Google Drive (${escapeHtml(sources?.driveInventory?.snapshotStatus || "indisponível")}, ${escapeHtml(String(sources?.driveInventory?.itemCount ?? 0))} itens), capture-proof/status, auditoria diária e AdRotate. Snapshot: ${escapeHtml(snapshotSlug)}.</footer>
  <dialog id="modal" aria-labelledby="modalTitle">
    <button class="modal-close" type="button" id="modalClose">fechar</button>
    <div class="modal-grid">
      <div class="modal-image"><img id="modalImg" alt="Evidência ampliada"></div>
      <aside class="modal-side">
        <h2 id="modalTitle">Evidência</h2>
        <span class="modal-date" id="modalDate" aria-live="polite"></span>
        <div class="modal-navigation"><button class="modal-nav" type="button" id="modalPrevious">Data anterior</button><button class="modal-nav" type="button" id="modalNext">Próxima data</button></div>
        <div class="modal-days" id="modalDays"></div>
        <details class="modal-details" open><summary>Detalhes da evidência</summary><dl id="modalMeta"></dl></details>
        <div class="links" id="modalLinks"></div>
      </aside>
    </div>
  </dialog>
  <script type="application/json" id="modal-data">${safeJson(modalData)}</script>
  <script>
    const data = JSON.parse(document.getElementById('modal-data').textContent);
    const dailyCountdown = document.getElementById('dailyCountdown');
    const updateCountdown = () => {
      if (!dailyCountdown || !dailyCountdown.dataset.nextRun) return;
      const remaining = Math.max(0, Date.parse(dailyCountdown.dataset.nextRun) - Date.now());
      const totalMinutes = Math.ceil(remaining / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      dailyCountdown.textContent = remaining === 0 ? 'em execução ou aguardando registro' : 'em ' + hours + 'h ' + String(minutes).padStart(2, '0') + 'min';
    };
    updateCountdown();
    setInterval(updateCountdown, 60000);
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modalImg');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const modalDays = document.getElementById('modalDays');
    const modalMeta = document.getElementById('modalMeta');
    const modalLinks = document.getElementById('modalLinks');
    const close = document.getElementById('modalClose');
    const previous = document.getElementById('modalPrevious');
    const next = document.getElementById('modalNext');
    let currentItem = null;
    let currentDayIndex = -1;
    let lastModalTrigger = null;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const iconLink = (href, label) => href ? '<a class="icon-link" target="_blank" rel="noreferrer" href="' + esc(href) + '">' + esc(label) + '</a>' : '';
    const renderModal = (item, requestedDate) => {
        currentItem = item;
        const requestedIndex = item.evidenceDays.findIndex((entry) => entry.date === requestedDate);
        const firstWithUrl = item.evidenceDays.findIndex((entry) => entry.url);
        currentDayIndex = requestedIndex >= 0 ? requestedIndex : firstWithUrl >= 0 ? firstWithUrl : 0;
        const day = item.evidenceDays[currentDayIndex] || null;
        modalImg.src = day?.url || '';
        modalImg.alt = day?.url
          ? 'Evidência de ' + item.campanhaName + ' no portal ' + item.siteSigla + ' em ' + day.date
          : 'Sem imagem de evidência para esta data';
        modalTitle.textContent = '#' + item.id + ' · ' + item.campanhaName;
        modalDate.textContent = day?.date ? 'Data selecionada: ' + day.date.split('-').reverse().join('/') : 'Sem data disponível';
        previous.disabled = currentDayIndex <= 0;
        next.disabled = currentDayIndex < 0 || currentDayIndex >= item.evidenceDays.length - 1;
        modalDays.innerHTML = item.evidenceDays.map((entry, index) => '<button type="button" class="day-dot ' + esc(entry.status) + (index === currentDayIndex ? ' current' : '') + '" data-modal-date="' + esc(entry.date) + '" title="' + esc(entry.statusDetail || entry.status) + '" aria-label="Abrir evidência de ' + esc(entry.date) + '"' + (index === currentDayIndex ? ' aria-current="date"' : '') + '>' + esc(entry.date.slice(8, 10)) + '</button>').join('');
        modalDays.querySelectorAll('[data-modal-date]').forEach((dayButton) => dayButton.addEventListener('click', () => renderModal(item, dayButton.dataset.modalDate)));
        modalMeta.innerHTML = [
          ['Portal', item.siteSigla],
          ['Cliente', item.clienteNome],
          ['Agência', item.agenciaNome],
          ['PI', item.piCodigo],
          ['Formato', item.localFormatoNormalizado || item.localFormato],
          ['Período', item.periodoInicio + ' a ' + item.periodoFim],
          ['Evidências', item.auditedDays + '/' + item.requiredDays.length],
          ['Status', item.statusDetail],
          ['ZIP por PI', item.commercialExportBlocker || 'disponível após auditoria'],
          ['Pendentes', item.missingDates.length ? item.missingDates.join(', ') : '-'],
          ['Inválidas', item.invalidDates.length ? item.invalidDates.join(', ') : '-'],
          ['Grupo', item.adrotateGroupId || '-']
        ].map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
        modalLinks.innerHTML = [
          iconLink(day?.downloadUrl, 'baixar JPEG'),
          iconLink(item.completeCampaignDownloadUrl, 'baixar todos os prints'),
          iconLink(item.batchDownloadUrl, 'ZIP deste portal'),
          iconLink(item.portalUrl, 'portal'),
          iconLink(item.adrotateAdUrl || item.adrotateGroupUrl, item.adrotateAdUrl ? 'adrotate ad' : 'adrotate grupo'),
          iconLink(item.mediaUrl, 'mídia'),
          iconLink('${adopsPanelBase}/insercoes/' + item.id, 'adops')
        ].join('');
    };
    document.querySelectorAll('.thumb, .day-card, .thumb-empty').forEach((button) => {
      button.addEventListener('click', () => {
        lastModalTrigger = button;
        const item = data[button.dataset.modalId];
        renderModal(item, button.dataset.date);
        modal.showModal();
      });
    });
    previous.addEventListener('click', () => currentItem && currentDayIndex > 0 && renderModal(currentItem, currentItem.evidenceDays[currentDayIndex - 1].date));
    next.addEventListener('click', () => currentItem && currentDayIndex < currentItem.evidenceDays.length - 1 && renderModal(currentItem, currentItem.evidenceDays[currentDayIndex + 1].date));
    close.addEventListener('click', () => modal.close());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
    modal.addEventListener('close', () => lastModalTrigger?.focus());
    const params = new URLSearchParams(window.location.search);
    const validPublications = new Set(['all', 'active', 'not_published', 'scheduled', 'ending', 'ended']);
    const validEvidenceStates = new Set(['all', 'complete', 'retroactive_missing', 'invalid']);
    const legacyState = String(params.get('state') || '').toLowerCase();
    const legacyPublication = ({ active: 'active', not_published: 'not_published', scheduled: 'scheduled', ending: 'ending' })[legacyState] || 'all';
    const legacyEvidence = ({ ok: 'complete', pending: 'retroactive_missing', invalid: 'invalid' })[legacyState] || 'all';
    let activePublication = validPublications.has(params.get('publication')) ? params.get('publication') : legacyPublication;
    let activeEvidence = validEvidenceStates.has(params.get('evidence')) ? params.get('evidence') : legacyEvidence;
    const search = document.getElementById('campaignSearch');
    const searchDesktop = document.getElementById('campaignSearchDesktop');
    const portalFilter = document.getElementById('portalFilter');
    const portalFilterDesktop = document.getElementById('portalFilterDesktop');
    const publicationFilter = document.getElementById('publicationFilter');
    const publicationFilterDesktop = document.getElementById('publicationFilterDesktop');
    const evidenceFilter = document.getElementById('evidenceFilter');
    const evidenceFilterDesktop = document.getElementById('evidenceFilterDesktop');
    const emptyResults = document.getElementById('emptyResults');
    const resultCount = document.getElementById('resultCount');
    const filterPanel = document.getElementById('filterPanel');
    const filterToggle = document.getElementById('filterToggle');
    const filterClose = document.getElementById('filterClose');
    const clearFilters = document.getElementById('clearFilters');
    search.value = params.get('q') || '';
    searchDesktop.value = search.value;
    const requestedPortal = String(params.get('portal') || 'ALL').toUpperCase();
    const validPortal = Array.from(portalFilter.options).some((option) => option.value === requestedPortal) ? requestedPortal : 'ALL';
    portalFilter.value = validPortal;
    portalFilterDesktop.value = validPortal;
    publicationFilter.value = activePublication;
    publicationFilterDesktop.value = activePublication;
    evidenceFilter.value = activeEvidence;
    evidenceFilterDesktop.value = activeEvidence;
    const persistFilters = () => {
      const nextParams = new URLSearchParams(window.location.search);
      search.value ? nextParams.set('q', search.value) : nextParams.delete('q');
      portalFilter.value !== 'ALL' ? nextParams.set('portal', portalFilter.value) : nextParams.delete('portal');
      activePublication !== 'all' ? nextParams.set('publication', activePublication) : nextParams.delete('publication');
      activeEvidence !== 'all' ? nextParams.set('evidence', activeEvidence) : nextParams.delete('evidence');
      nextParams.delete('state');
      const query = nextParams.toString();
      history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    };
    const applyFilters = () => {
      const needle = String(search.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      const selectedPortal = portalFilter.value || 'ALL';
      document.querySelectorAll('.campaign').forEach((campaign) => {
        const portalMatches = selectedPortal === 'ALL' || campaign.dataset.portal === selectedPortal;
        const publicationMatches = activePublication === 'all' || String(campaign.dataset.publicationStates || '').split(' ').includes(activePublication);
        const evidenceMatches = activeEvidence === 'all' || String(campaign.dataset.evidenceStates || '').split(' ').includes(activeEvidence);
        const searchMatches = !needle || String(campaign.dataset.search || '').includes(needle);
        campaign.hidden = !(portalMatches && publicationMatches && evidenceMatches && searchMatches);
      });
      document.querySelectorAll('.portal').forEach((portal) => {
        portal.hidden = !portal.querySelector('.campaign:not([hidden])');
      });
      const visibleCount = document.querySelectorAll('.campaign:not([hidden])').length;
      emptyResults.hidden = visibleCount > 0;
      resultCount.textContent = visibleCount + (visibleCount === 1 ? ' campanha' : ' campanhas');
      persistFilters();
    };
    search.addEventListener('input', () => { searchDesktop.value = search.value; applyFilters(); });
    searchDesktop.addEventListener('input', () => { search.value = searchDesktop.value; applyFilters(); });
    portalFilter.addEventListener('change', () => { portalFilterDesktop.value = portalFilter.value; applyFilters(); });
    portalFilterDesktop.addEventListener('change', () => { portalFilter.value = portalFilterDesktop.value; applyFilters(); });
    publicationFilter.addEventListener('change', () => { activePublication = publicationFilter.value; publicationFilterDesktop.value = activePublication; applyFilters(); });
    publicationFilterDesktop.addEventListener('change', () => { activePublication = publicationFilterDesktop.value; publicationFilter.value = activePublication; applyFilters(); });
    evidenceFilter.addEventListener('change', () => { activeEvidence = evidenceFilter.value; evidenceFilterDesktop.value = activeEvidence; applyFilters(); });
    evidenceFilterDesktop.addEventListener('change', () => { activeEvidence = evidenceFilterDesktop.value; evidenceFilter.value = activeEvidence; applyFilters(); });
    filterToggle.addEventListener('click', () => { filterToggle.setAttribute('aria-expanded', 'true'); filterPanel.showModal(); });
    filterClose.addEventListener('click', () => filterPanel.close());
    filterPanel.addEventListener('click', (event) => { if (event.target === filterPanel) filterPanel.close(); });
    filterPanel.addEventListener('close', () => { filterToggle.setAttribute('aria-expanded', 'false'); filterToggle.focus(); });
    clearFilters.addEventListener('click', () => {
      search.value = '';
      searchDesktop.value = '';
      portalFilter.value = 'ALL';
      portalFilterDesktop.value = 'ALL';
      activePublication = 'all';
      activeEvidence = 'all';
      publicationFilter.value = 'all';
      publicationFilterDesktop.value = 'all';
      evidenceFilter.value = 'all';
      evidenceFilterDesktop.value = 'all';
      applyFilters();
    });
    applyFilters();
  </script>
</body>
</html>`;
}

async function main() {
  const startedAtMs = Date.now();
  const timings = {};
  const bounds = monthBounds(targetMonth);
  const monthEndForEvidence = targetDate < bounds.end ? targetDate : bounds.end;
  await mkdir(latestDir, { recursive: true });
  await mkdir(snapshotDir, { recursive: true });

  const sourceStartedAtMs = Date.now();
  const operationsRaw = await api(`/api/campaign-operations/evidence-monthly-source?date=${encodeURIComponent(targetDate)}&competencia=${encodeURIComponent(competencia)}`, { timeoutMs: MONTHLY_REPORT_SOURCE_TIMEOUT_MS });
  const dailyPrintStatus = await api("/api/ops/daily-print-status", { timeoutMs: 30_000 }).catch(() => null);
  timings.sourceFetchMs = Date.now() - sourceStartedAtMs;
  const insertions = operationsRaw.insertions || [];
  const campaignMap = new Map();
  const canonicalOperationItems = [...(operationsRaw.items || []), ...(operationsRaw.upcomingItems || [])]
    .filter((item) => Number.isFinite(Number(item?.adops?.insertionId)))
    .map((item) => ({ ...item, id: Number(item.adops.insertionId) }));
  const operationByInsertionId = new Map(canonicalOperationItems.map((item) => [item.id, item]));
  const canonicalInsertions = selectCanonicalInsertions(canonicalOperationItems, insertions);
  if (canonicalInsertions.some((item) => item.id === 1826)) throw new Error("Gate canônico recusou a inserção duplicada #1826.");
  const eligible = canonicalInsertions
    .filter((item) => competenciaMatchesMonth(item.competencia, competencia, targetMonth))
    .filter((item) => !terminalStatuses.has(String(item.statusNormalizado || "").toLowerCase()))
    .filter((item) => item.periodoFim >= bounds.start && item.periodoInicio <= bounds.end)
    .sort((a, b) => String(a.siteSigla).localeCompare(String(b.siteSigla)) || String(a.campanhaName).localeCompare(String(b.campanhaName)) || a.id - b.id);

  const statusMap = new Map(eligible.flatMap((item) => (item.evidenceDays || []).map((day) => [
    `${item.id}:${day.date}`,
    adaptAggregatedEvidenceDay(day),
  ])));
  const relationMap = new Map();

  const enriched = eligible.map((item) => {
    const requiredDays = canonicalRequiredDates(item)
      .filter((date) => date >= bounds.start && date <= monthEndForEvidence);
    const evidenceDays = requiredDays.map((date) => {
      const status = statusMap.get(`${item.id}:${date}`) || { date, status: "missing" };
      const classification = classifyEvidenceStatus(status);
      const issueText = (status.audit?.issues || status.issues || [])
        .map((issue) => issue.label || issue.code || issue)
        .filter(Boolean)
        .join(", ");
      return {
        date,
        status: classification,
        url: status.arquivoUrl || status.url || "",
        downloadUrl: classification.startsWith("audited")
          ? `${deliveryApiBase}/api/insertions/${item.id}/evidences/${date}/download?variant=web&imageMaxWidth=1600&imageQuality=72`
          : "",
        evidenceId: status.evidenceId || null,
        issues: status.audit?.issues || status.issues || [],
        statusDetail:
          classification.startsWith("audited")
            ? "Evidência auditada e com URL."
            : classification === "missing"
              ? "Sem evidência auditada para este dia."
              : `Evidência não aprovada: ${issueText || status.status || "erro sem detalhe"}.`,
      };
    });
    const relation = relationMap.get(item.id);
    const links = adrotateLinks(item, relation);
    const campaign = campaignMap.get(item.campanhaId);
    const operation = operationByInsertionId.get(item.id);
    const publicConfirmed = operation?.adops?.publicConfirmation === "confirmed";
    const effectiveItem = {
      ...item,
      bannerPublicadoNoSite: item.bannerPublicadoNoSite === true || publicConfirmed,
    };
    const state = computeInsertionState(effectiveItem, evidenceDays, targetDate);
    const missingDates = evidenceDays.filter((day) => day.status === "missing").map((day) => day.date);
    const invalidDates = evidenceDays.filter((day) => !day.status.startsWith("audited") && day.status !== "missing").map((day) => day.date);
    const retroactiveMissingDates = missingDates.filter((date) => date < targetDate);
    const guidance = publicationGuidance(operation);
    return {
      ...effectiveItem,
      publicConfirmed,
      campanhaName: item.campanhaName || campaign?.name || `Campanha ${item.campanhaId || "-"}`,
      clienteNome: item.clienteNome || campaign?.clienteNome || "-",
      agenciaNome: item.agenciaNome || campaign?.agenciaNome || "-",
      portalUrl: sitesConfig[item.siteSigla]?.homeUrl || "",
      adrotateAdUrl: links.adUrl,
      adrotateGroupUrl: links.groupUrl,
      adrotateGroupId: links.groupId,
      state,
      requiredDays,
      evidenceDays,
      auditedDays: evidenceDays.filter((day) => day.status.startsWith("audited") && day.url).length,
      missingDates,
      retroactiveMissingDates,
      invalidDates,
      publicationBlocker: state === "not_published" ? guidance.blocker : "",
      publicationAction: state === "not_published" ? guidance.action : "",
      statusDetail: evidenceDetails({ ...item, state, missingDates, invalidDates }),
      modalId: `ins-${item.id}`,
    };
  });

  const exportsStartedAtMs = Date.now();
  const [exportLinks, completeExportLinks] = await Promise.all([
    materializeCampaignExports(enriched),
    materializeCompleteCampaignExports(enriched),
  ]);
  timings.exportsMs = Date.now() - exportsStartedAtMs;
  for (const item of enriched) {
    const canonicalPi = canonicalCommercialPi(item.piCodigo);
    item.batchDownloadUrl = canonicalPi ? exportLinks.get(`${normalize(item.siteSigla)}:${normalize(canonicalPi)}`) || "" : "";
    const completeKey = `${canonicalPi}:${normalize(item.competencia)}`;
    item.completeCampaignDownloadUrl = completeExportLinks.get(completeKey) || "";
    item.commercialExportBlocker = canonicalPi ? "" : "Aguardando PI/PDF para habilitar os ZIPs por PI.";
  }

  const summary = {
    total: enriched.length,
    active: enriched.filter((item) => item.periodoInicio <= targetDate && item.periodoFim >= targetDate).length,
    scheduled: enriched.filter((item) => item.state === "scheduled").length,
    ended: enriched.filter((item) => item.periodoFim < targetDate).length,
    ok: enriched.filter((item) => item.state === "ok").length,
    pending: enriched.filter((item) => item.state === "pending").length,
    invalid: enriched.filter((item) => item.state === "invalid").length,
    notPublished: enriched.filter((item) => item.state === "not_published").length,
    auditedDays: enriched.reduce((sum, item) => sum + item.auditedDays, 0),
    missingDates: enriched.reduce((sum, item) => sum + item.missingDates.length, 0),
    invalidDates: enriched.reduce((sum, item) => sum + item.invalidDates.length, 0),
    value: enriched.reduce((sum, item) => sum + Number(item.valorLiquido || 0), 0),
  };
  summary.publicationGate = buildMonthlyPublicationGate(enriched);
  const forecast = buildSevenDayForecast(enriched, targetDate);
  const portals = buildPortalGroups(enriched);
  const audits = {};
  const sources = {
    sheet: operationsRaw.sheet || null,
    driveInventory: operationsRaw.driveInventory || null,
    campaignOperationsGeneratedAt: operationsRaw.generatedAt || null,
    sheetUrl: currentSheetUrl,
    driveMediaUrl,
  };
  const html = renderHtml({ insertions: enriched, portals, audits, summary, forecast, sources, dailyPrintStatus });
  const data = {
    generatedAt: generatedAt.toISOString(),
    targetDate,
    targetMonth,
    competencia,
    publicUrl,
    sources,
    dailyPrintStatus,
    summary,
    forecast,
    audits,
    insertions: enriched,
  };
  const reportManifest = buildMonthlyReportManifest({
    slug,
    title: `Evidências AdOps · ${competencia}`,
    generatedAt: generatedAt.toISOString(),
  });
  reportManifest.sources = sources;
  const latestAssets = path.join(latestDir, "assets");
  const snapshotAssets = path.join(snapshotDir, "assets");
  await Promise.all([mkdir(latestAssets, { recursive: true }), mkdir(snapshotAssets, { recursive: true })]);

  await writeFile(outputPath, html, "utf8");
  await writeFile(snapshotPath, html, "utf8");
  await writeFile(path.join(latestDir, "data.json"), JSON.stringify(data, null, 2), "utf8");
  await writeFile(path.join(snapshotDir, "data.json"), JSON.stringify(data, null, 2), "utf8");
  await writeFile(path.join(latestDir, "report.json"), JSON.stringify(reportManifest, null, 2), "utf8");
  await writeFile(path.join(snapshotDir, "report.json"), JSON.stringify(reportManifest, null, 2), "utf8");
  await Promise.all([
    writeFile(path.join(latestAssets, "favicon.svg"), reportMarkSvg, "utf8"),
    writeFile(path.join(snapshotAssets, "favicon.svg"), reportMarkSvg, "utf8"),
  ]);
  const validationStartedAtMs = Date.now();
  await validateGeneratedReport({ data, reportManifest, insertions: enriched });
  timings.validationMs = Date.now() - validationStartedAtMs;

  if (process.env.ADOPS_REPORT_SKIP_PUBLISH !== "1") {
    const publishStartedAtMs = Date.now();
    if (!isMonthlyReportPublishable(summary.publicationGate)) {
      throw new Error(`Publicação bloqueada: missing=${summary.publicationGate.missing}, invalid=${summary.publicationGate.invalid}.`);
    }
    await publishReport();
    const cacheToken = encodeURIComponent(generatedAt.toISOString());
    const [htmlValidation, manifestValidation, catalogValidation] = await Promise.all([
      fetchWithTimeout(`${publicUrl}?v=${cacheToken}`, { redirect: "follow", headers: { "cache-control": "no-cache" } }, 20_000),
      fetchWithTimeout(`${publicUrl}report.json?v=${cacheToken}`, { redirect: "follow", headers: { "cache-control": "no-cache" } }, 20_000),
      fetchWithTimeout(`https://sites.codigo5.com.br/api/sites?v=${cacheToken}`, { redirect: "follow", headers: { "cache-control": "no-cache" } }, 20_000),
    ]);
    if (!htmlValidation.ok || !manifestValidation.ok) throw new Error(`Readback público falhou: HTML ${htmlValidation.status}, manifest ${manifestValidation.status}.`);
    const publishedManifest = await manifestValidation.json();
    if (publishedManifest.generatedAt !== reportManifest.generatedAt || publishedManifest.visibility !== "unlisted") {
      throw new Error("Readback público não corresponde ao manifest recém-publicado.");
    }
    if (catalogValidation.ok) {
      const catalogText = await catalogValidation.text();
      if (isJsonContentType(catalogValidation.headers.get("content-type"))) {
        const catalog = JSON.parse(catalogText);
        const entries = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.items) ? catalog.items : Array.isArray(catalog?.sites) ? catalog.sites : [];
        if (entries.some((item) => String(item?.slug || item?.path || item?.url || "").includes(slug))) {
          throw new Error("Relatório unlisted apareceu no catálogo público.");
        }
      } else if (catalogText.includes(slug)) {
        throw new Error("Relatório unlisted apareceu no catálogo público.");
      }
    }
    timings.publishMs = Date.now() - publishStartedAtMs;
  }

  timings.totalMs = Date.now() - startedAtMs;
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    snapshotPath,
    publicUrl,
    summary,
    timings,
    telemetry: { apiRequestCount, apiResponseBytes },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
