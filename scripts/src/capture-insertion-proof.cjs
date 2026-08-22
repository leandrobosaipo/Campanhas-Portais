const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");
const { getSiteIntegration, getFormatMapping, normalizeFormat } = require("./adrotate-sites.cjs");

const CAPTURE_PYTHON_BIN = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const WINDOWS_FRAME_KIT_DIR = process.env.ADOPS_WINDOWS_FRAME_TEMPLATE_DIR
  ? path.resolve(process.env.ADOPS_WINDOWS_FRAME_TEMPLATE_DIR)
  : path.resolve(__dirname, "../assets/desktop-frame/windows11-chrome-light");
const WINDOWS_FRAME_FONT = process.env.ADOPS_WINDOWS_FRAME_FONT
  ? path.resolve(process.env.ADOPS_WINDOWS_FRAME_FONT)
  : path.resolve(__dirname, "../assets/desktop-frame/fonts/selawik.ttf");
const SITE_LOGOS_DIR = path.resolve(__dirname, "../../artifacts/adops/public/site-logos");
const runtimeRuleL1Cache = new Map();
const runtimeRuleL1TtlMs = Number(process.env.ADOPS_CAPTURE_RULE_L1_TTL_MS || 45_000);

function buildApiHeaders(extra = {}) {
  const token = process.env.ADOPS_CAPTURE_API_TOKEN || process.env.ADOPS_INTERNAL_API_TOKEN || "";
  const trimmedToken = String(token || "").trim();
  return {
    ...(trimmedToken ? { Authorization: `Bearer ${trimmedToken}` } : {}),
    ...(trimmedToken ? { "x-adops-api-token": trimmedToken } : {}),
    ...extra,
  };
}

function parseArgs(argv) {
  const options = {
    apiBase: process.env.ADOPS_CAPTURE_API_BASE || "http://127.0.0.1:4011/api",
    spacesBucket: process.env.ADOPS_SPACES_BUCKET || "cod5",
    spacesBasePath: process.env.ADOPS_SPACES_BASE_PATH || "adops-prints",
    upload: true,
    saveEvidence: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }

  if (!options.insertionId) {
    throw new Error("Use --insertionId <id>.");
  }

  return {
    insertionId: Number(options.insertionId),
    apiBase: String(options.apiBase),
    spacesEnv: options.spacesEnv ? String(options.spacesEnv) : null,
    spacesBucket: String(options.spacesBucket),
    spacesBasePath: String(options.spacesBasePath),
    upload: options.upload !== "false" && options.upload !== false,
    saveEvidence: options.saveEvidence !== "false" && options.saveEvidence !== false,
    candidateOnly: options.candidateOnly === true || options.candidateOnly === "true",
    replaceExisting: options.replaceExisting === true || options.replaceExisting === "true",
    captureAt: options.captureAt ? String(options.captureAt) : null,
    reconstructionReason: options.reconstructionReason === "late_publication_recovery"
      ? "late_publication_recovery"
      : null,
    previewSignature: options.previewSignature ? String(options.previewSignature) : null,
    jobId: options.jobId ? String(options.jobId) : null,
    runnerJobId: options.runnerJobId ? String(options.runnerJobId) : null,
    diagnosticMode: options.diagnosticMode === true || options.diagnosticMode === "true",
    captureAttempt: Math.max(1, Number(options.captureAttempt || 1)),
  };
}

function appendCaptureRetryQuery(value, attempt) {
  if (!value || Number(attempt) <= 1) return value;
  try {
    const parsed = new URL(value);
    parsed.searchParams.set("_adops_capture_retry", String(attempt));
    return parsed.toString();
  } catch {
    return value;
  }
}

function loadPlaywright() {
  const requireLocal = createRequire(__filename);
  try {
    return requireLocal("playwright");
  } catch {
    const candidateRoots = [
      process.cwd(),
      path.resolve(__dirname, ".."),
      path.resolve(__dirname, "../.."),
    ];
    for (const root of candidateRoots) {
      try {
        return require(path.join(root, "node_modules/playwright"));
      } catch {
        // tenta o próximo caminho
      }
    }
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  }
}

function parseEnvFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  }
  const accessKeyId = map.get("DO_SPACES_ACCESS_KEY_ID");
  const secretAccessKey = map.get("DO_SPACES_SECRET_ACCESS_KEY");
  const endpoint = map.get("DO_SPACES_ENDPOINT");
  const region = map.get("DO_SPACES_REGION");
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new Error(`Arquivo de Spaces incompleto: ${filePath}`);
  }
  return { accessKeyId, secretAccessKey, endpoint, region };
}

async function fetchRuntimeMappingFromApi(apiBase, insertion) {
  if (process.env.ADOPS_CAPTURE_DISABLE_RUNTIME_RULES === "1") return null;
  if (!apiBase || !insertion?.siteSigla) return null;
  const format = insertion.localFormatoNormalizado || insertion.localFormato || "";
  const groupHint = getFormatMapping(insertion.siteSigla, format)?.groupId ?? null;
  const cacheKey = `${String(insertion.siteSigla).toUpperCase()}:${groupHint ?? "na"}:${normalizeFormat(format)}`;
  const cached = runtimeRuleL1Cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const query = new URLSearchParams({
    siteSigla: String(insertion.siteSigla).toUpperCase(),
    localFormato: String(format),
  });
  if (groupHint) query.set("groupId", String(groupHint));

  try {
    const response = await fetch(`${apiBase}/capture-rules/runtime?${query.toString()}`, {
      headers: buildApiHeaders(),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const rule = payload && payload.rule ? payload.rule : null;
    if (!rule || typeof rule !== "object") return null;
    runtimeRuleL1Cache.set(cacheKey, {
      expiresAt: Date.now() + runtimeRuleL1TtlMs,
      payload: rule,
    });
    return rule;
  } catch {
    return null;
  }
}

async function getMapping(insertion, apiBase) {
  const runtimeRule = await fetchRuntimeMappingFromApi(apiBase, insertion);
  const site = getSiteIntegration(insertion.siteSigla);
  const localMapping = getFormatMapping(insertion.siteSigla, insertion.localFormatoNormalizado || insertion.localFormato);
  if (runtimeRule) {
    const auditConfig = {
      ...((site && site.auditConfig) || {}),
      ...((localMapping && localMapping.auditOverrides) || {}),
      ...((runtimeRule && runtimeRule.auditConfig) || {}),
    };
    return {
      ...runtimeRule,
      disableOriginOverride: Boolean(runtimeRule.disableOriginOverride || site?.disableOriginOverride),
      auditConfig,
      positionLabel: runtimeRule.aliases?.[0] || insertion.localFormatoNormalizado || insertion.localFormato || null,
      pageLabel: runtimeRule.page === "article" ? "Página interna" : "Home",
    };
  }

  const mapping = localMapping;
  if (!site || !mapping) {
    throw new Error(`Não há mapping configurado para ${insertion.siteSigla} / ${insertion.localFormatoNormalizado || insertion.localFormato}.`);
  }
  const auditConfig = {
    ...(site.auditConfig || {}),
    ...((mapping && mapping.auditOverrides) || {}),
  };
  return {
    ...mapping,
    pageUrl: mapping.page === "article" ? "__LATEST_ARTICLE__" : site.homeUrl,
    homeUrl: site.homeUrl,
    adminBaseUrl: site.adminBaseUrl || null,
    domain: site.domain,
    originIp: site.originIp || null,
    disableOriginOverride: Boolean(site.disableOriginOverride),
    articleFallbackUrl: site.articleFallbackUrl,
    browserTitle: site.browserTitle,
    hostLabel: site.hostLabel,
    previewSecret: site.previewSecret || null,
    pageDateSelectors: site.pageDateSelectors || null,
    auditConfig,
    positionLabel: mapping.aliases?.[0] || insertion.localFormatoNormalizado || insertion.localFormato || null,
    pageLabel: mapping.page === "article" ? "Página interna" : "Home",
  };
}

function getMediaBasename(urlString) {
  const raw = String(urlString || "");
  const embeddedFilename = raw.match(/(?:[?&#]|^)filename=([^&#]+)/i)?.[1] || raw.match(/(?:[?&#]|^)name=([^&#]+)/i)?.[1];
  if (embeddedFilename) return path.basename(decodeURIComponent(embeddedFilename));
  const url = new URL(urlString);
  const explicitFilename = url.searchParams.get("filename") || url.searchParams.get("name");
  return path.basename(explicitFilename || url.pathname);
}

function normalizeMediaIdentityUrl(value, baseUrl = "https://adops.invalid/") {
  const raw = String(value || "").trim().split(",")[0].trim().split(/\s+/)[0].trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, baseUrl);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`.toLowerCase();
  } catch {
    return raw.split(/[?#]/)[0].toLowerCase();
  }
}

function isGifUrl(value) {
  const raw = String(value || "");
  return /^data:image\/gif/i.test(raw) || /(?:[?&#]|^)filename=[^&#]+\.gif/i.test(raw) || /\.gif(?:[?#].*)?$/i.test(raw);
}

function resolveReachableMediaUrl(value) {
  if (!value) return value;
  try {
    const url = new URL(String(value).startsWith("//") ? `https:${value}` : String(value));
    if (url.hostname === "perrenguematogrosso.com" && url.pathname.startsWith("/app/uploads/")) {
      url.hostname = "admin.perrenguematogrosso.com";
      return url.toString();
    }
  } catch {}
  return value;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildStableNumber(seed, modulo) {
  let hash = 0;
  for (let index = 0; index < String(seed).length; index += 1) {
    hash = (hash * 33 + String(seed).charCodeAt(index)) % 2147483647;
  }
  return modulo > 0 ? hash % modulo : hash;
}

function chooseStableCandidate(items, seed) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = buildStableNumber(seed, items.length);
  return items[index] || items[0] || null;
}

function getDateLabel(date = new Date()) {
  const isoDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const titleDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).format(date);
  return { isoDate, titleDate };
}

function formatCaptureAtForPreview(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const take = (type) => parts.find((item) => item.type === type)?.value || "00";
  return `${take("year")}-${take("month")}-${take("day")}T${take("hour")}:${take("minute")}`;
}

function requiresRetroEditorialProof(captureIsoDate, now = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(captureIsoDate || ""))
    && captureIsoDate < getDateLabel(now).isoDate;
}

function parseCaptureDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const normalized = value.length === 16 ? `${value}:00-04:00` : `${value}-04:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(`${value}:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function appendPreviewParams(urlString, captureAt, previewSignature) {
  if (!captureAt) return urlString;
  const url = new URL(urlString);
  url.searchParams.set("adops_preview_at", captureAt);
  if (previewSignature) {
    url.searchParams.set("adops_preview_sig", previewSignature);
  }
  url.searchParams.set("adops_preview_bust", `${Date.now()}`);
  return url.toString();
}

function appendCacheVersion(urlString, version) {
  if (!urlString || !version) return urlString;
  const url = new URL(urlString);
  url.searchParams.set("v", String(version));
  return url.toString();
}

function buildAddressText(urlString, fallbackHost) {
  if (!urlString) return fallbackHost || "";
  try {
    const url = new URL(urlString);
    const pathname = url.pathname && url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "";
    const compactPath = pathname.length > 58 ? `...${pathname.slice(-55)}` : pathname;
    return `${url.host}${compactPath}`;
  } catch {
    return fallbackHost || urlString;
  }
}

function isPlaceholderCreativeEntry(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("placehold.co") ||
    normalized.includes("anuncie+aqui") ||
    normalized.includes("anuncie aqui") ||
    normalized.includes("placeholder")
  );
}

async function dismissCookieConsent(page, mapping) {
  const selectors = [
    ...(mapping.consentConfig?.selectors || []),
    "#onetrust-accept-btn-handler",
    ".cky-btn-accept",
    ".cmplz-btn.cmplz-accept",
    ".fc-cta-consent",
    ".cc-btn.cc-allow",
    ".cookie-notice-container .cn-button",
  ];
  const textPatterns = (mapping.consentConfig?.textPatterns || ["aceitar", "aceito", "concordo", "entendi", "fechar", "ok", "prosseguir", "continuar"])
    .map((item) => String(item).toLowerCase());

  await page.evaluate(({ selectors, textPatterns }) => {
    const isConsentContainer = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const text = (node.textContent || "").toLowerCase();
      const marker = [node.id, node.className, node.getAttribute("aria-label"), node.getAttribute("data-nosnippet")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        text.includes("cookie") ||
        text.includes("privacidade") ||
        text.includes("consent") ||
        marker.includes("cookie") ||
        marker.includes("consent") ||
        marker.includes("privacy") ||
        marker.includes("privacidade")
      );
    };
    const maybeClick = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      if (rect.width < 12 || rect.height < 12) return false;
      if (element instanceof HTMLAnchorElement && element.href && !isConsentContainer(element.closest("div, section, aside, form, dialog"))) {
        return false;
      }
      element.click();
      return true;
    };

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (maybeClick(element)) return;
    }

    const overlayCandidates = Array.from(document.querySelectorAll("div, section, aside, form, dialog")).filter((node) => isConsentContainer(node));
    for (const overlay of overlayCandidates) {
      const buttons = Array.from(overlay.querySelectorAll("button, a, [role='button']")).filter((node) => node instanceof HTMLElement);
      for (const candidate of buttons) {
        const text = (candidate.textContent || candidate.getAttribute("aria-label") || "").trim().toLowerCase();
        if (!text) continue;
        if (textPatterns.some((pattern) => text.includes(pattern)) && maybeClick(candidate)) return;
      }
    }
  }, { selectors, textPatterns });

  await page.waitForTimeout(250);
}

async function dismissBlockingOverlays(page, options = {}) {
  const preserveBottomPopup = options.preserveBottomPopup === true;
  try {
    if (!preserveBottomPopup) {
      await page.keyboard.press("Escape");
    }
  } catch {}

  await page.evaluate(({ preserveBottomPopup }) => {
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const markerPattern = /(modal|popup|lightbox|fancybox|magnific|mfp-|overlay|backdrop|dialog|newsletter|share|cookie|consent|privacy|privacidade|lgpd)/i;
    const shouldPreserve = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (preserveBottomPopup && node.closest("#cod5-bottom-popup-ad")) return true;
      if (node.matches("header, #site-header, .site-header, .omt-sticky-shell, .omt-header")) return true;
      const marker = `${node.id || ""} ${node.className || ""}`.toLowerCase();
      const looksLikeSiteChrome = /(site-header|header-menu|omt-header|omt-sticky|navbar|main-header)/i.test(marker);
      if (looksLikeSiteChrome && node.querySelector("nav, [class*='menu'], img")) return true;
      return false;
    };

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 24 &&
        rect.height > 24;
    };

    const clickClose = (node) => {
      const candidates = Array.from(node.querySelectorAll("button, a, [role='button'], .close, .modal-close, .mfp-close, [aria-label*='close' i], [aria-label*='fechar' i]"));
      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement) || !isVisible(candidate)) continue;
        const text = `${candidate.textContent || ""} ${candidate.getAttribute("aria-label") || ""}`.trim().toLowerCase();
        if (!text || text === "x" || text === "×" || text.includes("close") || text.includes("fechar")) {
          candidate.click();
          return true;
        }
      }
      return false;
    };

    for (const node of Array.from(document.querySelectorAll("dialog, [role='dialog'], [aria-modal='true'], .modal, .modal-backdrop, .mfp-wrap, .mfp-bg, .fancybox-container, .popup, .lightbox, .overlay"))) {
      if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
      if (shouldPreserve(node)) continue;
      if (clickClose(node)) continue;
      const rect = node.getBoundingClientRect();
      if ((rect.width * rect.height) / viewportArea > 0.12) node.remove();
    }

    for (const node of Array.from(document.body.querySelectorAll("body > div, body > section, body > aside"))) {
      if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
      if (shouldPreserve(node)) continue;
      const marker = `${node.id || ""} ${node.className || ""}`.toLowerCase();
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const areaRatio = (rect.width * rect.height) / viewportArea;
      const zIndex = Number.parseInt(style.zIndex || "0", 10);
      const fixedOverlay = ["fixed", "sticky"].includes(style.position) && areaRatio > 0.18 && zIndex >= 10;
      const consentBar = ["fixed", "sticky"].includes(style.position) && markerPattern.test(marker) && areaRatio > 0.025 && zIndex >= 1;
      if ((markerPattern.test(marker) && areaRatio > 0.08) || fixedOverlay || consentBar) {
        if (!clickClose(node)) node.remove();
      }
    }

    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.body.classList.remove("modal-open", "mfp-zoom-out-cur", "fancybox-active");
  }, { preserveBottomPopup });

  await page.waitForTimeout(250);
}

function shouldPreserveBottomPopupForCapture(mapping, resolvedSlotSelector = null, resolvedContextSelector = null) {
  const target = [
    mapping?.slotSelector,
    mapping?.contextSelector,
    resolvedSlotSelector,
    resolvedContextSelector,
  ].filter(Boolean).join(" ");
  return /#cod5-bottom-popup-ad|\bg\.g-9\b|\.g-9\b/.test(target);
}

function signPreviewCapture(captureAt, secret) {
  if (!captureAt || !secret) return null;
  return crypto.createHmac("sha256", secret).update(captureAt).digest("hex");
}

function normalizeAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function compactCampaignName(value) {
  return normalizeAscii(value).slice(0, 24) || "CAMPANHA";
}

function compactClientName(value) {
  const normalized = normalizeAscii(value);
  if (normalized.includes("PREFEITURADECUIABA")) return "PREFCBA";
  if (normalized.includes("PREFEITURAPVA") || normalized.includes("PRIMAVERADOOESTE") || normalized.includes("PRIMAVERADLESTE")) return "PREFPVA";
  if (normalized.includes("GOVERNODOESTADO")) return "GOVMT";
  if (normalized.includes("SECOM")) return "SECOM";
  return normalized.slice(0, 12) || "CLIENTE";
}

function compactPiCode(value) {
  const normalized = normalizeAscii(value);
  const match = normalized.match(/PI?(\d{3,})/);
  if (match) return `PI${match[1]}`;
  return normalized.slice(0, 16) || "PI";
}

function compactPosition(value) {
  const normalized = normalizeAscii(value);
  if (normalized.includes("MEGABANNERTOPO")) return "MEGA_TOPO";
  if (normalized.includes("BANNERINTERNONOTICIAS")) return "INTERNO_NOTICIAS";
  if (normalized.includes("INSTAGRAM")) return "INSTAGRAM";
  return normalized.slice(0, 18) || "POSICAO";
}

async function fetchInsertion(apiBase, insertionId) {
  const response = await fetch(`${apiBase}/insertions/${insertionId}`, { headers: buildApiHeaders() });
  if (!response.ok) {
    throw new Error(`Falha ao buscar inserção ${insertionId}: ${response.status}`);
  }
  return response.json();
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8220;|&ldquo;/g, "\"")
    .replace(/&#8221;|&rdquo;/g, "\"")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryClassFromSlug(slug) {
  const normalized = String(slug || "").toLowerCase();
  if (normalized.includes("esporte")) return "badge-cat badge-cat--esportes";
  if (normalized.includes("politica")) return "badge-cat badge-cat--politica";
  if (normalized.includes("meme")) return "badge-cat badge-cat--memes-do-vovo";
  if (normalized.includes("vovo")) return "badge-cat badge-cat--vovo-de-olho";
  return "badge-cat";
}

function normalizePerrengueWpRestBefore(captureAt) {
  const raw = String(captureAt || "").trim();
  if (!raw) return "";
  const withoutZone = raw
    .replace(/[zZ]$/, "")
    .replace(/[+-]\d{2}:?\d{2}$/, "")
    .replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(withoutZone)) return `${withoutZone}T23:59:59`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(withoutZone)) return `${withoutZone}:00`;
  const match = withoutZone.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return match?.[1] || "";
}

const perrengueAdminRetroPostsCache = new Map();
const aflRetroPostsCache = new Map();
const omtRetroPostsCache = new Map();

async function fetchPerrengueAdminRetroPosts(captureAt) {
  const cutoff = parseIsoLikeDate(captureAt);
  if (!cutoff) return [];
  const monthStart = new Date(cutoff);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const after = `${monthStart.toISOString().slice(0, 10)}T00:00:00`;
  const before = normalizePerrengueWpRestBefore(captureAt);
  if (!before) throw new Error(`perrengue_admin_retro_posts_failed: invalid_capture_at=${captureAt}`);
  const host = process.env.ADOPS_PERRENGUE_ADMIN_WP_API_BASE || "https://admin.perrenguematogrosso.com/wp-json/wp/v2/posts";
  const cacheKey = `${host}|${after}|${before}`;
  const cachedPosts = perrengueAdminRetroPostsCache.get(cacheKey);
  if (Array.isArray(cachedPosts)) return cachedPosts;
  const posts = [];
  for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
    const url = new URL(host);
    url.searchParams.set("after", after);
    url.searchParams.set("before", before);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(pageNo));
    url.searchParams.set("_embed", "1");
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": "adops-capture-retro-preview/1.0" },
      });
    } catch (error) {
      if (pageNo === 1) {
        throw new Error(`perrengue_admin_retro_posts_failed: request_error=${error instanceof Error ? error.message : String(error)}`);
      }
      break;
    }
    if ((response.status === 400 || response.status === 404) && pageNo > 1) break;
    if (!response.ok) {
      throw new Error(`perrengue_admin_retro_posts_failed: http_${response.status}; before=${before}`);
    }
    const items = await response.json().catch(() => null);
    if (!Array.isArray(items)) {
      throw new Error(`perrengue_admin_retro_posts_failed: invalid_json; before=${before}`);
    }
    if (!Array.isArray(items) || items.length === 0) break;
    for (const item of items) {
      const embedded = item?._embedded || {};
      const media = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"][0] : null;
      const terms = Array.isArray(embedded["wp:term"]) ? embedded["wp:term"].flat() : [];
      const category = terms.find((term) => term?.taxonomy === "category") || null;
      const link = String(item.link || "");
      let pathname = "/";
      try {
        pathname = new URL(link).pathname;
      } catch {}
      posts.push({
        title: stripHtml(item?.title?.rendered || item?.title || ""),
        slug: item.slug || pathname.replace(/^\/|\/$/g, ""),
        url: pathname,
        category: stripHtml(category?.name || "Notícias"),
        categorySlug: category?.slug || "",
        categoryClass: categoryClassFromSlug(category?.slug),
        hasVideo: /vídeo|video/i.test(stripHtml(item?.title?.rendered || "")),
        date: item.date || item.date_gmt || "",
        localDate: item.date || item.date_gmt || "",
        publishedAt: item.date || item.date_gmt || "",
        modified: item.modified || "",
        modifiedAt: item.modified || "",
        image: media?.source_url || "",
        excerpt: stripHtml(item?.excerpt?.rendered || ""),
      });
    }
    const editorialPosts = posts.filter((post) => post.categorySlug !== "memes-do-vovo");
    const editorialPostsWithImage = editorialPosts.filter((post) => post.image);
    if (editorialPosts.length >= 24 && editorialPostsWithImage.length >= 6) break;
    if (items.length < 100) break;
  }
  perrengueAdminRetroPostsCache.set(cacheKey, posts);
  return posts;
}

async function fetchAflRetroPosts(captureAt) {
  const before = normalizePerrengueWpRestBefore(captureAt);
  if (!before) throw new Error(`afl_retro_posts_failed: invalid_capture_at=${captureAt}`);
  const host = process.env.ADOPS_AFL_WP_API_BASE || "https://afolhalivre.com/wp-json/wp/v2/posts";
  const cacheKey = `${host}|${before}`;
  const cachedPosts = aflRetroPostsCache.get(cacheKey);
  if (Array.isArray(cachedPosts)) return cachedPosts;

  const url = new URL(host);
  url.searchParams.set("before", before);
  url.searchParams.set("per_page", "20");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("_embed", "1");
  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "adops-capture-retro-preview/1.0" },
    });
  } catch (error) {
    throw new Error(`afl_retro_posts_failed: request_error=${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`afl_retro_posts_failed: http_${response.status}; before=${before}`);
  const items = await response.json().catch(() => null);
  if (!Array.isArray(items)) throw new Error(`afl_retro_posts_failed: invalid_json; before=${before}`);

  const posts = normalizeRetroEditorialPosts(items.map((item) => {
    const embedded = item?._embedded || {};
    const media = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"][0] : null;
    const terms = Array.isArray(embedded["wp:term"]) ? embedded["wp:term"].flat() : [];
    const category = terms.find((term) => term?.taxonomy === "category") || null;
    return {
      title: stripHtml(item?.title?.rendered || item?.title || ""),
      excerpt: stripHtml(item?.excerpt?.rendered || ""),
      slug: String(item?.slug || ""),
      url: String(item?.link || ""),
      image: String(media?.source_url || ""),
      date: String(item?.date || item?.date_gmt || ""),
      modified: String(item?.modified || item?.modified_gmt || ""),
      category: stripHtml(category?.name || "Notícias"),
      categorySlug: String(category?.slug || "noticias"),
    };
  }), captureAt);
  aflRetroPostsCache.set(cacheKey, posts);
  return posts;
}

function normalizeRetroEditorialPosts(items, captureAt) {
  const cutoff = parseIsoLikeDate(captureAt);
  if (!cutoff || !Array.isArray(items)) return [];
  return items
    .map((item) => ({
      ...item,
      _date: parseIsoLikeDate(String(item?.date || item?.localDate || item?.publishedAt || "")),
      _modified: item?.modified ? parseIsoLikeDate(String(item.modified)) : null,
    }))
    .filter((item) => item._date && item._date.getTime() <= cutoff.getTime() && item._modified && item._modified.getTime() <= cutoff.getTime() && item.slug && item.title)
    .sort((left, right) => right._date.getTime() - left._date.getTime());
}

async function fetchOmtRetroPosts(captureAt) {
  const before = normalizePerrengueWpRestBefore(captureAt);
  if (!before) throw new Error(`omt_retro_posts_failed: invalid_capture_at=${captureAt}`);
  const host = process.env.ADOPS_OMT_WP_API_BASE || "https://omatogrossense.com/wp-json/wp/v2/posts";
  const cacheKey = `${host}|${before}`;
  const cachedPosts = omtRetroPostsCache.get(cacheKey);
  if (Array.isArray(cachedPosts)) return cachedPosts;

  const url = new URL(host);
  url.searchParams.set("before", before);
  url.searchParams.set("per_page", "25");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("_embed", "1");
  let response;
  try {
    response = await fetch(url, { headers: { "user-agent": "adops-capture-retro-preview/1.0" } });
  } catch (error) {
    throw new Error(`omt_retro_posts_failed: request_error=${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`omt_retro_posts_failed: http_${response.status}; before=${before}`);
  const items = await response.json().catch(() => null);
  if (!Array.isArray(items)) throw new Error(`omt_retro_posts_failed: invalid_json; before=${before}`);

  const posts = normalizeRetroEditorialPosts(items.map((item) => {
    const embedded = item?._embedded || {};
    const media = Array.isArray(embedded["wp:featuredmedia"]) ? embedded["wp:featuredmedia"][0] : null;
    const terms = Array.isArray(embedded["wp:term"]) ? embedded["wp:term"].flat() : [];
    const category = terms.find((term) => term?.taxonomy === "category") || null;
    return {
      id: Number(item?.id || 0),
      title: stripHtml(item?.title?.rendered || item?.title || ""),
      excerpt: stripHtml(item?.excerpt?.rendered || ""),
      slug: String(item?.slug || ""),
      url: String(item?.link || ""),
      image: String(media?.source_url || ""),
      date: String(item?.date || item?.date_gmt || ""),
      modified: String(item?.modified || item?.modified_gmt || ""),
      category: stripHtml(category?.name || "Notícias"),
      categorySlug: String(category?.slug || "noticias"),
    };
  }), captureAt);
  omtRetroPostsCache.set(cacheKey, posts);
  return posts;
}

function buildWordPressArticleApiUrl(mapping, captureAt) {
  if (!mapping?.homeUrl) return null;
  let apiUrl;
  try {
    apiUrl = new URL(mapping.articleApiUrl || "/wp-json/wp/v2/posts", mapping.homeUrl);
  } catch {
    return null;
  }
  const rawCaptureAt = String(captureAt || "").trim();
  if (rawCaptureAt) {
    const before = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawCaptureAt)
      ? `${rawCaptureAt}:59`
      : rawCaptureAt;
    apiUrl.searchParams.set("before", before);
  }
  apiUrl.searchParams.set("per_page", "12");
  apiUrl.searchParams.set("order", "desc");
  apiUrl.searchParams.set("orderby", "date");
  apiUrl.searchParams.set("status", "publish");
  apiUrl.searchParams.set("_fields", "link,date,status");
  return apiUrl.toString();
}

async function fetchWordPressArticleCandidates(mapping, captureAt, previewSignature, fetchImpl = fetch) {
  const apiUrl = buildWordPressArticleApiUrl(mapping, captureAt);
  if (!apiUrl) return [];
  try {
    const response = await fetchImpl(apiUrl, {
      headers: { "user-agent": "adops-capture-article-resolver/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [];
    const items = await response.json().catch(() => []);
    if (!Array.isArray(items)) return [];
    const portalOrigin = new URL(mapping.homeUrl).origin;
    return items
      .filter((item) => item?.status === "publish" && item?.link)
      .map((item) => {
        try {
          const articleUrl = new URL(item.link, mapping.homeUrl);
          return articleUrl.origin === portalOrigin ? articleUrl.toString() : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .map((url) => appendPreviewParams(url, captureAt, previewSignature));
  } catch {
    return [];
  }
}

function isRejectedArticleCandidateUrl(candidateUrl, mapping) {
  try {
    const current = new URL(candidateUrl);
    const expected = new URL(mapping.homeUrl);
    if (current.origin !== expected.origin) return true;
    return /\/cgi-sys\/|suspendedpage\.cgi|\/wp-login\.php|\/wp-admin\//i.test(current.pathname);
  } catch {
    return true;
  }
}

async function auditArticleCandidatePage(page, mapping) {
  if (mapping?.page !== "article" && mapping?.pageUrl !== "__LATEST_ARTICLE__") {
    return { ok: true, skipped: true };
  }
  const currentUrl = page.url();
  if (isRejectedArticleCandidateUrl(currentUrl, mapping)) {
    return { ok: false, reason: "invalid_article_url", currentUrl };
  }
  const audit = await page.evaluate(() => {
    const title = String(document.title || "").trim();
    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    const hasEditorialContent = Boolean(document.querySelector(
      "main article, article, .entry-content, [itemtype*='Article'], [itemtype*='NewsArticle']",
    ));
    const suspended = /account suspended|suspended page|conta suspensa|site suspenso/i.test(`${title} ${bodyText}`);
    return { title, hasEditorialContent, suspended };
  });
  if (audit.suspended) return { ok: false, reason: "suspended_article_page", currentUrl, ...audit };
  if (!audit.hasEditorialContent) return { ok: false, reason: "article_content_missing", currentUrl, ...audit };
  return { ok: true, currentUrl, ...audit };
}

async function resolvePageUrls(page, mapping, previewOptions) {
  if (mapping.domain === "perrenguematogrosso.com" && mapping.page === "article" && previewOptions.captureAt) {
    const retroPosts = await fetchPerrengueAdminRetroPosts(previewOptions.captureAt);
    const historicalUrls = retroPosts
      .map((post) => {
        try {
          return new URL(post.url || `/${post.slug || ""}/`, mapping.homeUrl).toString();
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(0, 12);
    if (historicalUrls.length > 0) {
      return historicalUrls.map((url) => appendPreviewParams(url, previewOptions.captureAt, previewOptions.previewSignature));
    }
  }
  if (mapping.auditConfig?.preferArticleFallbackForRetro === true && mapping.articleFallbackUrl) {
    return [appendPreviewParams(mapping.articleFallbackUrl, previewOptions.captureAt, previewOptions.previewSignature)];
  }
  if (mapping.pageUrl !== "__LATEST_ARTICLE__") {
    return [appendPreviewParams(mapping.pageUrl, previewOptions.captureAt, previewOptions.previewSignature)];
  }

  const apiCandidates = await fetchWordPressArticleCandidates(
    mapping,
    previewOptions.captureAt,
    previewOptions.previewSignature,
  );
  if (apiCandidates.length > 0) return apiCandidates;

  await page.goto(appendPreviewParams(mapping.homeUrl, previewOptions.captureAt, previewOptions.previewSignature), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const articleCandidates = await page.evaluate((domain) => {
    const selectors = [
      "main article h1 a[href]",
      "main article h2 a[href]",
      "main article h3 a[href]",
      "article a[href]",
    ];
    const urls = [];
    const results = [];
    const extractDateText = (node) => {
      const article = node.closest("article, .post, .entry, .card, .archive-item") || node.parentElement;
      const scope = article instanceof HTMLElement ? article : document;
      const dateNode = scope.querySelector("time[datetime], [datetime], .entry-date, .posted-on time, .meta-date, [data-date], [data-datetime]");
      if (!(dateNode instanceof HTMLElement)) return "";
      return dateNode.getAttribute("datetime") ||
        dateNode.getAttribute("data-datetime") ||
        dateNode.getAttribute("data-date") ||
        dateNode.textContent?.trim() ||
        "";
    };
    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      for (const node of candidates) {
        const href = node.getAttribute("href");
        if (!href) continue;
        if (!href.startsWith("http")) continue;
        if (!href.includes(domain)) continue;
        if (href === `https://${domain}/` || href === `https://${domain}`) continue;
        if (href.includes("/category/") || href.includes("/tag/") || href.includes("/author/") || href.includes("/wp-json/")) continue;
        if (!urls.includes(href)) urls.push(href);
        results.push({ url: href, dateText: extractDateText(node) });
        if (urls.length >= 12) return results;
      }
    }
    return results;
  }, mapping.domain);

  if (Array.isArray(articleCandidates) && articleCandidates.length > 0) {
    const captureAtDate = parseIsoLikeDate(previewOptions.captureAt);
    const sortedCandidates = articleCandidates
      .map((item, index) => ({
        url: item.url,
        date: parseIsoLikeDate(item.dateText),
        index,
      }))
      .sort((left, right) => {
        if (captureAtDate) {
          const leftOk = left.date ? left.date.getTime() <= captureAtDate.getTime() + 90 * 1000 : false;
          const rightOk = right.date ? right.date.getTime() <= captureAtDate.getTime() + 90 * 1000 : false;
          if (Number(rightOk) !== Number(leftOk)) return Number(rightOk) - Number(leftOk);
        }
        return left.index - right.index;
      });
    return sortedCandidates.map((item) => appendPreviewParams(item.url, previewOptions.captureAt, previewOptions.previewSignature));
  }
  if (mapping.articleFallbackUrl) return [appendPreviewParams(mapping.articleFallbackUrl, previewOptions.captureAt, previewOptions.previewSignature)];
  throw new Error("Não foi possível localizar uma matéria para capturar o banner interno.");
}

async function findCreativeMatch(page, slotSelector, mediaBasename, expectedMediaUrl = null) {
  const expectedMediaKey = normalizeMediaIdentityUrl(expectedMediaUrl);
  return await page.evaluate(function (payload) {
    var slotSelector = payload.slotSelector;
    var mediaBasename = payload.mediaBasename;
    var expectedMediaKey = payload.expectedMediaKey;
    function normalizeMediaKey(value) {
      var raw = String(value || "").trim().split(",")[0].trim().split(/\s+/)[0].trim();
      if (!raw) return "";
      try {
        var parsed = new URL(raw, window.location.href);
        return (parsed.origin + decodeURIComponent(parsed.pathname)).toLowerCase();
      } catch {
        return raw.split(/[?#]/)[0].toLowerCase();
      }
    }
    function mediaMatch(value) {
      var normalized = normalizeMediaKey(value);
      return {
        exact: Boolean(expectedMediaKey && normalized === expectedMediaKey),
        basename: Boolean(mediaBasename && String(value || "").toLowerCase().indexOf(String(mediaBasename).toLowerCase()) !== -1),
      };
    }
    function visibilityMetrics(node) {
      if (!(node instanceof HTMLElement)) {
        return {
          isVisible: false,
          visibleRatio: 0,
          top: 99999,
          area: 0,
          inFooter: false,
        };
      }
      var rect = node.getBoundingClientRect();
      var style = window.getComputedStyle(node);
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      var visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      var visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      var area = Math.max(rect.width * rect.height, 1);
      var visibleRatio = (visibleWidth * visibleHeight) / area;
      var inFooter = Boolean(node.closest("footer, #footer, .footer, [id*='footer' i], [class*='footer' i], [id*='rodape' i], [class*='rodape' i]"));
      return {
        isVisible: style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 48 &&
          rect.height > 24,
        visibleRatio: visibleRatio,
        top: rect.top,
        area: area,
        inFooter: inFooter,
      };
    }
    function scoreMatch(slot, item) {
      var slotMetrics = visibilityMetrics(slot);
      var itemMetrics = visibilityMetrics(item);
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      var score = 0;
      if (slotMetrics.isVisible) score += 240;
      if (itemMetrics.isVisible) score += 120;
      score += slotMetrics.visibleRatio * 120;
      score += itemMetrics.visibleRatio * 80;
      score += Math.min(slotMetrics.area, 220000) / 3000;
      if (slotMetrics.top >= -120 && slotMetrics.top <= viewportHeight * 1.4) score += 45;
      if (slotMetrics.top < -200) score -= 90;
      if (slotMetrics.top > viewportHeight * 1.8) score -= 120;
      if (slotMetrics.inFooter || itemMetrics.inFooter) score -= 240;
      score -= Math.min(Math.abs(slotMetrics.top - 140), 2500) / 14;
      return {
        score: score,
        slotMetrics: slotMetrics,
        itemMetrics: itemMetrics,
      };
    }
    function collect(element) {
      var values = [];
      var nested = [element].concat(Array.prototype.slice.call(element.querySelectorAll("*")));
      for (var i = 0; i < nested.length; i += 1) {
        var node = nested[i];
        if (!(node instanceof HTMLElement)) continue;
        var style = node.getAttribute("style");
        if (style) values.push(style);
        var attrs = ["src", "data-lazy-src", "data-src", "srcset", "data-lazy-srcset", "href"];
        for (var j = 0; j < attrs.length; j += 1) {
          var value = node.getAttribute(attrs[j]);
          if (value) values.push(value);
        }
      }
      return values.join(" | ");
    }
    function collectMediaValues(element) {
      var values = [];
      var mediaNodes = [element].concat(Array.prototype.slice.call(element.querySelectorAll("img, source, video, [style*='url(']")));
      for (var i = 0; i < mediaNodes.length; i += 1) {
        var node = mediaNodes[i];
        if (!(node instanceof HTMLElement)) continue;
        var attrs = ["src", "data-src", "data-lazy-src", "srcset", "data-lazy-srcset", "poster"];
        for (var j = 0; j < attrs.length; j += 1) {
          var value = node.getAttribute(attrs[j]);
          if (value) values.push(value);
        }
        var inlineStyle = node.getAttribute("style");
        if (inlineStyle) values.push(inlineStyle);
      }
      return values;
    }
    function hasAdClass(node) {
      if (!(node instanceof HTMLElement)) return false;
      for (var i = 0; i < node.classList.length; i += 1) {
        var className = node.classList[i];
        if (className && className.indexOf("a-") === 0) return true;
      }
      return false;
    }
    function hasVisibleMediaMatch(node, basename) {
      if (!(node instanceof HTMLElement)) return false;
      var mediaNodes = Array.prototype.slice.call(node.querySelectorAll("img, video"));
      for (var i = 0; i < mediaNodes.length; i += 1) {
        var mediaNode = mediaNodes[i];
        if (!(mediaNode instanceof HTMLElement)) continue;
        var value =
          mediaNode.getAttribute("src") ||
          mediaNode.getAttribute("data-src") ||
          mediaNode.getAttribute("data-lazy-src") ||
          mediaNode.getAttribute("srcset") ||
          mediaNode.getAttribute("data-lazy-srcset") ||
          mediaNode.getAttribute("poster") ||
          "";
        if (!value || String(value).indexOf(basename) === -1) continue;
        var rect = mediaNode.getBoundingClientRect();
        if (rect.width >= 220 && rect.height >= 48) return true;
      }
      return false;
    }

    var slots = Array.prototype.slice.call(document.querySelectorAll(slotSelector)).filter(function (node) {
      return node instanceof HTMLElement;
    });
    if (!slots.length) return { ok: false, reason: "slot_not_found" };

    var slotMatch = null;
    var matched = null;
    var available = [];
    var matchedCandidates = [];

    for (var slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      var slot = slots[slotIndex];
      var mediaNodes = Array.prototype.slice.call(slot.querySelectorAll("img, source, video"));
      for (var mediaIndex = 0; mediaIndex < mediaNodes.length; mediaIndex += 1) {
        var mediaNode = mediaNodes[mediaIndex];
        if (!(mediaNode instanceof HTMLElement)) continue;
        var mediaValue =
          mediaNode.getAttribute("src") ||
          mediaNode.getAttribute("data-src") ||
          mediaNode.getAttribute("data-lazy-src") ||
          mediaNode.getAttribute("srcset") ||
          mediaNode.getAttribute("data-lazy-srcset") ||
          mediaNode.getAttribute("poster") ||
          "";
        var directMatch = mediaMatch(mediaValue);
        if (!mediaValue || (expectedMediaKey ? !directMatch.exact : !directMatch.basename)) continue;
        var carrier = mediaNode.closest(".g-dyn, .g-single") || mediaNode.closest(".g") || mediaNode;
        if (!(carrier instanceof HTMLElement)) continue;
        var mediaRect = mediaNode.getBoundingClientRect();
        var mediaVisibleArea = Math.max(0, mediaRect.width) * Math.max(0, mediaRect.height);
        var scoreInfo = scoreMatch(slot, carrier);
        var scoreBoost = 0;
        if (mediaRect.width >= 220 && mediaRect.height >= 48) scoreBoost += 80;
        scoreBoost += Math.min(mediaVisibleArea, 260000) / 5000;
        matchedCandidates.push({
          slot: slot,
          item: carrier,
          mediaMatched: true,
          exactMediaMatched: directMatch.exact,
          hasAdClass: hasAdClass(carrier),
          score: scoreInfo.score + scoreBoost,
          slotMetrics: scoreInfo.slotMetrics,
          itemMetrics: scoreInfo.itemMetrics,
        });
      }
      var items = Array.prototype.slice.call(slot.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var content = collect(item);
        var mediaValues = collectMediaValues(item);
        var exactMediaMatched = mediaValues.some(function(value) {
          return mediaMatch(value).exact;
        });
        var mediaMatched = expectedMediaKey
          ? exactMediaMatched
          : mediaValues.some(function(value) {
              return mediaMatch(value).basename;
            });
        var adClassCandidate = hasAdClass(item);
        available.push(content);
        if ((mediaMatched || (!expectedMediaKey && adClassCandidate && content.indexOf(mediaBasename) !== -1))
        ) {
          var candidateScore = scoreMatch(slot, item);
          matchedCandidates.push({
            slot: slot,
            item: item,
            mediaMatched: mediaMatched,
            exactMediaMatched: exactMediaMatched,
            hasAdClass: adClassCandidate,
            score: candidateScore.score,
            slotMetrics: candidateScore.slotMetrics,
            itemMetrics: candidateScore.itemMetrics,
          });
        }
      }
    }

    if (matchedCandidates.length === 0) {
      var placeholderOnly = available.length > 0 && available.every(function(entry) {
        var normalized = String(entry || "").toLowerCase();
        return normalized.indexOf("placehold.co") !== -1 || normalized.indexOf("anuncie+aqui") !== -1 || normalized.indexOf("anuncie aqui") !== -1 || normalized.indexOf("placeholder") !== -1;
      });
      return { ok: false, reason: placeholderOnly ? "placeholder_only" : "creative_not_found", available: available };
    }
    matchedCandidates.sort(function (a, b) {
      if (Number(b.exactMediaMatched) !== Number(a.exactMediaMatched)) {
        return Number(b.exactMediaMatched) - Number(a.exactMediaMatched);
      }
      if (Number(b.mediaMatched) !== Number(a.mediaMatched)) {
        return Number(b.mediaMatched) - Number(a.mediaMatched);
      }
      if (Number(b.hasAdClass) !== Number(a.hasAdClass)) {
        return Number(b.hasAdClass) - Number(a.hasAdClass);
      }
      return b.score - a.score;
    });
    slotMatch = matchedCandidates[0].slot;
    matched = matchedCandidates[0].item;

    var items = Array.prototype.slice.call(slotMatch.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
    if (items.indexOf(matched) !== -1) {
      for (var k = 0; k < items.length; k += 1) {
        var current = items[k];
        var isMatch = current === matched;
        current.style.display = isMatch ? "block" : "none";
        current.style.opacity = isMatch ? "1" : "0";
        current.style.visibility = isMatch ? "visible" : "hidden";
        current.style.position = isMatch ? "relative" : "absolute";
        current.style.inset = isMatch ? "auto" : "0";
        current.classList.toggle("is-active", isMatch);
      }
    }

    slotMatch.style.overflow = "visible";
    slotMatch.style.height = (matched.getBoundingClientRect().height || 120) + "px";

    var images = matched.querySelectorAll("img");
    for (var imgIndex = 0; imgIndex < images.length; imgIndex += 1) {
      var image = images[imgIndex];
      var lazySrc = image.getAttribute("data-lazy-src");
      var lazySrcSet = image.getAttribute("data-lazy-srcset");
      if (lazySrc) image.setAttribute("src", lazySrc);
      if (lazySrcSet) image.setAttribute("srcset", lazySrcSet);
      image.removeAttribute("loading");
      image.removeAttribute("decoding");
    }

    var adClass = null;
    for (var c = 0; c < matched.classList.length; c += 1) {
      var className = matched.classList[c];
      if (className && className.indexOf("a-") === 0) {
        adClass = className;
        break;
      }
    }

    var normalizeMediaUrl = function (value) {
      if (!value) return null;
      var normalized = String(value).trim();
      if (normalized && normalized.indexOf(",") !== -1 && normalized.indexOf(" ") !== -1) {
        normalized = normalized.split(",")[0].trim().split(" ")[0].trim();
      }
      return normalized || null;
    };
    var collectMediaUrls = function (node) {
      if (!(node instanceof HTMLElement)) return [];
      var values = [];
      if (node instanceof HTMLVideoElement) {
        values.push(node.currentSrc);
        values.push(node.getAttribute("src"));
        values.push(node.getAttribute("data-src"));
        values.push(node.getAttribute("data-lazy-src"));
        var sources = Array.prototype.slice.call(node.querySelectorAll("source"));
        for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
          var source = sources[sourceIndex];
          values.push(source.getAttribute("src"));
          values.push(source.getAttribute("data-src"));
          values.push(source.getAttribute("data-lazy-src"));
        }
        values.push(node.getAttribute("poster"));
      } else {
        values.push(node.getAttribute("src"));
        values.push(node.getAttribute("data-src"));
        values.push(node.getAttribute("data-lazy-src"));
        values.push(node.getAttribute("srcset"));
        values.push(node.getAttribute("data-lazy-srcset"));
        if (node.tagName.toLowerCase() === "source" && node.parentElement instanceof HTMLVideoElement) {
          values.push(node.parentElement.currentSrc);
        }
      }
      return values.map(normalizeMediaUrl).filter(Boolean);
    };
    var mediaUrl = null;
    var mediaNodes = Array.prototype.slice.call(matched.querySelectorAll("video, source, img"));
    for (var mediaIndex = 0; mediaIndex < mediaNodes.length; mediaIndex += 1) {
      var urls = collectMediaUrls(mediaNodes[mediaIndex]);
      for (var urlIndex = 0; urlIndex < urls.length; urlIndex += 1) {
        if (!mediaUrl) mediaUrl = urls[urlIndex];
        var currentMatch = mediaMatch(urls[urlIndex]);
        if ((expectedMediaKey && currentMatch.exact) || (!expectedMediaKey && currentMatch.basename)) {
          mediaUrl = urls[urlIndex];
          break;
        }
      }
      if (mediaUrl) {
        var selectedMatch = mediaMatch(mediaUrl);
        if ((expectedMediaKey && selectedMatch.exact) || (!expectedMediaKey && selectedMatch.basename)) break;
      }
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-adops-capture-slot]")).forEach(function (node) {
      node.removeAttribute("data-adops-capture-slot");
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-adops-capture-context]")).forEach(function (node) {
      node.removeAttribute("data-adops-capture-context");
    });
    slotMatch.setAttribute("data-adops-capture-slot", "1");
    slotMatch.setAttribute("data-adops-capture-context", "1");
    matched.setAttribute("data-adops-capture-ad", "1");
    return {
      ok: true,
      adClass: adClass,
      matchedSelector: '[data-adops-capture-ad="1"]',
      slotSelector: '[data-adops-capture-slot="1"]',
      contextSelector: '[data-adops-capture-context="1"]',
      mediaUrl: mediaUrl,
      exactMediaMatched: matchedCandidates[0].exactMediaMatched === true,
      matchScore: matchedCandidates[0].score,
      slotTop: matchedCandidates[0].slotMetrics.top,
      slotVisibleRatio: matchedCandidates[0].slotMetrics.visibleRatio,
      slotInFooter: matchedCandidates[0].slotMetrics.inFooter,
    };
  }, { slotSelector, mediaBasename, expectedMediaKey });
}

async function forceMatchedAdVisible(page) {
  return await page.evaluate(() => {
    const matched = document.querySelector('[data-adops-capture-ad="1"]');
    if (!(matched instanceof HTMLElement)) {
      return { ok: false, reason: "matched_ad_not_found" };
    }
    const slot = matched.closest('[data-adops-capture-slot="1"]') || matched.closest(".g");
    if (!(slot instanceof HTMLElement)) {
      return { ok: false, reason: "matched_slot_not_found" };
    }

    let style = document.getElementById("adops-capture-locked-rotator-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "adops-capture-locked-rotator-style";
      style.textContent = `
        [data-adops-capture-slot="1"][data-adops-capture-locked="1"] > .g-dyn:not([data-adops-capture-active-ad="1"]),
        [data-adops-capture-slot="1"][data-adops-capture-locked="1"] > .g-single:not([data-adops-capture-active-ad="1"]) {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        [data-adops-capture-slot="1"][data-adops-capture-locked="1"] [data-adops-capture-active-ad="1"] {
          display: block !important;
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          transition: none !important;
          animation: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    slot.setAttribute("data-adops-capture-locked", "1");

    const items = Array.from(slot.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
    const activeItem = items.includes(matched)
      ? matched
      : items.find((item) => item instanceof HTMLElement && item.contains(matched));
    if (activeItem instanceof HTMLElement) {
      for (const item of items) {
        if (!(item instanceof HTMLElement)) continue;
        const isMatch = item === activeItem;
        item.toggleAttribute("data-adops-capture-active-ad", isMatch);
        item.style.setProperty("display", isMatch ? "block" : "none", "important");
        item.style.setProperty("opacity", isMatch ? "1" : "0", "important");
        item.style.setProperty("visibility", isMatch ? "visible" : "hidden", "important");
        item.style.setProperty("position", isMatch ? "relative" : "absolute", "important");
        item.style.setProperty("inset", isMatch ? "auto" : "0", "important");
        item.style.setProperty("transform", "none", "important");
        item.style.setProperty("transition", "none", "important");
        item.style.setProperty("animation", "none", "important");
        item.classList.toggle("is-active", isMatch);
      }
    } else {
      matched.setAttribute("data-adops-capture-active-ad", "1");
      matched.style.setProperty("display", "block", "important");
      matched.style.setProperty("opacity", "1", "important");
      matched.style.setProperty("visibility", "visible", "important");
      matched.style.setProperty("transform", "none", "important");
      matched.style.setProperty("transition", "none", "important");
      matched.style.setProperty("animation", "none", "important");
    }

    slot.style.overflow = "visible";
    const matchedRect = matched.getBoundingClientRect();
    if (matchedRect.width > 0) slot.style.width = `${Math.ceil(matchedRect.width)}px`;
    if (matchedRect.height > 0) slot.style.height = `${Math.ceil(matchedRect.height)}px`;

    const applyLock = () => {
      const currentMatched = document.querySelector('[data-adops-capture-ad="1"]');
      const currentSlot = currentMatched instanceof HTMLElement
        ? (currentMatched.closest('[data-adops-capture-slot="1"]') || currentMatched.closest(".g"))
        : null;
      if (!(currentMatched instanceof HTMLElement) || !(currentSlot instanceof HTMLElement)) return;
      const currentItems = Array.from(currentSlot.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
      const currentActive = currentItems.includes(currentMatched)
        ? currentMatched
        : currentItems.find((item) => item instanceof HTMLElement && item.contains(currentMatched));
      for (const item of currentItems) {
        if (!(item instanceof HTMLElement)) continue;
        const isMatch = item === currentActive;
        item.toggleAttribute("data-adops-capture-active-ad", isMatch);
        item.style.setProperty("display", isMatch ? "block" : "none", "important");
        item.style.setProperty("opacity", isMatch ? "1" : "0", "important");
        item.style.setProperty("visibility", isMatch ? "visible" : "hidden", "important");
        item.style.setProperty("position", isMatch ? "relative" : "absolute", "important");
        item.style.setProperty("inset", isMatch ? "auto" : "0", "important");
        item.style.setProperty("transform", "none", "important");
        item.style.setProperty("transition", "none", "important");
        item.style.setProperty("animation", "none", "important");
      }
      currentMatched.style.setProperty("display", "block", "important");
      currentMatched.style.setProperty("opacity", "1", "important");
      currentMatched.style.setProperty("visibility", "visible", "important");
      for (const mediaNode of Array.from(currentMatched.querySelectorAll("img, video"))) {
        if (!(mediaNode instanceof HTMLElement)) continue;
        mediaNode.style.setProperty("display", "block", "important");
        mediaNode.style.setProperty("opacity", "1", "important");
        mediaNode.style.setProperty("visibility", "visible", "important");
        mediaNode.style.setProperty("transform", "none", "important");
      }
    };
    applyLock();
    if (window.__adopsCaptureLockInterval) {
      window.clearInterval(window.__adopsCaptureLockInterval);
    }
    window.__adopsCaptureLockInterval = window.setInterval(applyLock, 120);

    for (const image of Array.from(matched.querySelectorAll("img"))) {
      if (!(image instanceof HTMLImageElement)) continue;
      const lazySrc = image.getAttribute("data-lazy-src") || image.getAttribute("data-src");
      const lazySrcSet = image.getAttribute("data-lazy-srcset") || image.getAttribute("data-srcset");
      if (lazySrc && (!image.getAttribute("src") || /placeholder|blank/i.test(image.getAttribute("src") || ""))) {
        image.setAttribute("src", lazySrc);
      }
      if (lazySrcSet && !image.getAttribute("srcset")) {
        image.setAttribute("srcset", lazySrcSet);
      }
      const src = image.getAttribute("src");
      if (src && /^https?:\/\//i.test(src) && !/[?&]adops_capture_bust=/.test(src)) {
        const separator = src.includes("?") ? "&" : "?";
        image.setAttribute("src", `${src}${separator}adops_capture_bust=${Date.now()}`);
      }
      image.removeAttribute("loading");
      image.removeAttribute("decoding");
      image.setAttribute("fetchpriority", "high");
    }

    const rect = matched.getBoundingClientRect();
    const media = matched.querySelector("img, video");
    const mediaRect = media instanceof HTMLElement ? media.getBoundingClientRect() : null;
    return {
      ok: true,
      matchedClass: matched.className,
      slotClass: slot.className,
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      mediaRect: mediaRect ? { width: mediaRect.width, height: mediaRect.height, top: mediaRect.top, left: mediaRect.left } : null,
    };
  });
}

async function auditMatchedCreativePlacement(page, slotSelector, mediaBasename, expectedMediaUrl = null) {
  const allowSameMediaOutsideSlot = process.env.ADOPS_CAPTURE_ALLOW_SAME_MEDIA_OUTSIDE_SLOT === "1";
  const expectedMediaKey = normalizeMediaIdentityUrl(expectedMediaUrl);
  return await page.evaluate(({ slotSelector, mediaBasename, expectedMediaKey, allowSameMediaOutsideSlot }) => {
    const basename = String(mediaBasename || "").toLowerCase();
    const issues = [];
    const toBox = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.tagName.toLowerCase() === "source" && node.parentElement instanceof HTMLVideoElement) {
        return isVisible(node.parentElement);
      }
	      const rect = node.getBoundingClientRect();
	      const style = window.getComputedStyle(node);
	      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width >= 48 &&
        rect.height >= 24;
    };
    const viewportVisibleRatio = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const area = Math.max(1, rect.width * rect.height);
      return (visibleWidth * visibleHeight) / area;
    };
	    const mediaValue = (node) => {
	      if (!(node instanceof HTMLElement)) return "";
	      const values = [
	        node.currentSrc,
	        node.getAttribute("src"),
	        node.getAttribute("data-src"),
	        node.getAttribute("data-lazy-src"),
	        node.getAttribute("srcset"),
	        node.getAttribute("data-lazy-srcset"),
	        node.getAttribute("poster"),
	      ];
	      if (node instanceof HTMLVideoElement) {
	        for (const source of Array.from(node.querySelectorAll("source"))) {
	          values.push(
	            source.getAttribute("src"),
	            source.getAttribute("data-src"),
	            source.getAttribute("data-lazy-src"),
	            source.getAttribute("srcset"),
	            source.getAttribute("data-lazy-srcset"),
	          );
	        }
	      }
	      return String(
	        values.filter(Boolean).join(" ") ||
	        ""
	      );
	    };
    const normalizeMediaKey = (value) => {
      const raw = String(value || "").trim().split(",")[0].trim().split(/\s+/)[0].trim();
      if (!raw) return "";
      try {
        const parsed = new URL(raw, window.location.href);
        return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`.toLowerCase();
      } catch {
        return raw.split(/[?#]/)[0].toLowerCase();
      }
    };
    const isTargetMedia = (node) => {
      const value = mediaValue(node);
      if (expectedMediaKey) return normalizeMediaKey(value) === expectedMediaKey;
      return value.toLowerCase().includes(basename);
    };
    const isPerrengueInstitutionalSublogo = (node) => {
      const value = mediaValue(node).toLowerCase();
      const rect = node.getBoundingClientRect();
      return value.includes("/assets/perrengue-sublogo.png") && rect.width <= 100 && rect.height <= 100;
    };
    const slot = document.querySelector(slotSelector);
    if (!(slot instanceof HTMLElement)) {
      return {
        ok: false,
        issues: [{ code: "slot_not_found", detail: slotSelector }],
        slotSelector,
        mediaBasename,
      };
    }
    const slotBox = toBox(slot);
    // Only rendered media elements count as visual evidence. A <source> node is
    // not independently visible; for videos its URL is folded into mediaValue().
    const allMedia = Array.from(document.querySelectorAll("img, video")).filter((node) => node instanceof HTMLElement);
    const slotMedia = allMedia.filter((node) => slot.contains(node));
    const visibleSlotMedia = slotMedia.filter(isVisible);
    const visibleTargetsInside = visibleSlotMedia.filter(isTargetMedia);
    const visibleConflictsInside = visibleSlotMedia.filter((node) => !isTargetMedia(node) && !isPerrengueInstitutionalSublogo(node));
    const visibleTargetsOutside = allMedia.filter((node) => !slot.contains(node) && isVisible(node) && viewportVisibleRatio(node) >= 0.25 && isTargetMedia(node));

    if (visibleTargetsInside.length !== 1) {
      issues.push({
        code: "target_media_not_unique_in_slot",
        detail: `inside=${visibleTargetsInside.length}`,
      });
    }
    if (visibleConflictsInside.length > 0) {
      issues.push({
        code: "conflicting_media_visible_in_slot",
        detail: `conflicts=${visibleConflictsInside.length}`,
      });
    }
    if (visibleTargetsOutside.length > 0 && !allowSameMediaOutsideSlot) {
      issues.push({
        code: "target_media_visible_outside_slot",
        detail: `outside=${visibleTargetsOutside.length}`,
      });
    }

    return {
      ok: issues.length === 0,
      issues,
      slotSelector,
      mediaBasename,
      expectedMediaKey,
      slotBox,
      targetInsideCount: visibleTargetsInside.length,
      conflictInsideCount: visibleConflictsInside.length,
      targetOutsideCount: visibleTargetsOutside.length,
      allowSameMediaOutsideSlot,
      targetInsideBoxes: visibleTargetsInside.map(toBox).filter(Boolean),
      conflictInsideBoxes: visibleConflictsInside.map(toBox).filter(Boolean).slice(0, 5),
      targetOutsideBoxes: visibleTargetsOutside.map(toBox).filter(Boolean).slice(0, 5),
      matchedMediaUrls: visibleTargetsInside.map(mediaValue).filter(Boolean).slice(0, 5),
      visibleSlotMedia: visibleSlotMedia.map((node) => ({
        tag: node.tagName.toLowerCase(),
        box: toBox(node),
        mediaValue: mediaValue(node).slice(0, 500),
      })).slice(0, 8),
    };
  }, { slotSelector, mediaBasename, expectedMediaKey, allowSameMediaOutsideSlot });
}

async function auditMatchedCreativePlacementWithRetry(page, slotSelector, mediaBasename, expectedMediaUrl = null, options = {}) {
  const attempts = Math.max(1, Number(options.attempts ?? 4));
  const waitMs = Math.max(0, Number(options.waitMs ?? 550));
  let audit = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await forceMatchedAdVisible(page);
    audit = await auditMatchedCreativePlacement(page, slotSelector, mediaBasename, expectedMediaUrl);
    audit.attempts = attempt;
    if (audit.ok) return audit;
    if (attempt < attempts) {
      await page.waitForTimeout(waitMs);
    }
  }
  return audit;
}

function summarizeCreativePlacementAudit(audit) {
  const issues = Array.isArray(audit?.issues) ? audit.issues : [];
  const details = issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
  const media = Array.isArray(audit?.visibleSlotMedia)
    ? audit.visibleSlotMedia
        .map((item) => `${item.tag || "media"}:${item.box?.width || 0}x${item.box?.height || 0}:${String(item.mediaValue || "").slice(0, 160)}`)
        .join(" | ")
    : "";
  const boxes = {
    slotBox: audit?.slotBox || null,
    targetInsideBoxes: Array.isArray(audit?.targetInsideBoxes) ? audit.targetInsideBoxes.slice(0, 3) : [],
    targetOutsideBoxes: Array.isArray(audit?.targetOutsideBoxes) ? audit.targetOutsideBoxes.slice(0, 3) : [],
  };
  const boxDetails = `boxes=${JSON.stringify(boxes)}`;
  return media ? `${details}; ${boxDetails}; visibleSlotMedia=${media}` : `${details}; ${boxDetails}`;
}

async function upsertEvidence(apiBase, insertion, arquivoUrl, title, replaceExisting = false) {
  const titleKey = title.split(" - ")[0] || title;
  const existing = (insertion.evidences || []).find((item) => item.titulo && item.titulo.includes(titleKey));
  if (existing && existing.id) {
    if (replaceExisting) {
      const response = await fetch(`${apiBase}/evidences/${existing.id}`, {
        method: "PATCH",
        headers: buildApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo: "print", titulo: title, arquivoUrl }),
      });
      if (!response.ok) {
        throw new Error(`Falha ao substituir evidência: ${response.status}`);
      }
      return {
        replaced: true,
        evidenceId: existing.id,
        previousUrl: existing.arquivoUrl || null,
        nextUrl: arquivoUrl,
      };
    }
    return {
      skipped: true,
      existingEvidenceId: existing.id,
      existingUrl: existing.arquivoUrl || null,
      reason: "Print do dia já existe e não deve ser sobrescrito automaticamente.",
    };
  }

  const response = await fetch(`${apiBase}/insertions/${insertion.id}/evidences`, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tipo: "print", titulo: title, arquivoUrl }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar evidência: ${response.status}`);
  }
  return response.json();
}

async function persistCaptureMetadata(apiBase, insertionId, targetDate, metadata) {
  const response = await fetch(`${apiBase}/insertions/${insertionId}/capture-proof/metadata`, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      date: targetDate,
      metadata,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.details || payload?.error || `Falha ao persistir metadata da captura: ${response.status}`);
  }
  return response.json();
}

function uploadToSpaces(env, bucket, key, localFile) {
  const ext = path.extname(localFile).toLowerCase();
  const contentType = ext === ".json"
    ? "application/json"
    : ext === ".png"
      ? "image/png"
      : "application/octet-stream";
  execFileSync("aws", [
    "--endpoint-url",
    env.endpoint,
    "s3",
    "cp",
    localFile,
    `s3://${bucket}/${key}`,
    "--acl",
    "public-read",
    "--content-type",
    contentType,
  ], {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: env.accessKeyId,
      AWS_SECRET_ACCESS_KEY: env.secretAccessKey,
      AWS_DEFAULT_REGION: env.region,
    },
    stdio: "pipe",
  });

  return `https://${bucket}.${env.region}.digitaloceanspaces.com/${key}`;
}

function buildEvidenceReplacementArchivePlan({ evidenceUrl, bucket, competencia, campaignId, insertionId, targetDate }) {
  if (!evidenceUrl || !bucket) return null;
  let url;
  try {
    url = new URL(evidenceUrl);
  } catch {
    return null;
  }
  if (!url.hostname.startsWith(`${bucket}.`)) return null;
  const sourceKey = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!sourceKey || sourceKey.includes("..")) return null;
  const fileName = path.basename(sourceKey);
  const version = String(url.searchParams.get("v") || "unversioned").replace(/[^A-Za-z0-9._-]/g, "");
  const archiveKey = [
    "adops-evidence-originals",
    slugify(competencia || "sem-competencia").toUpperCase(),
    String(campaignId),
    String(insertionId),
    targetDate,
    `${version}-${fileName}`,
  ].join("/");
  return { sourceKey, archiveKey };
}

function archiveEvidenceBeforeReplacement(env, bucket, plan) {
  execFileSync("aws", [
    "--endpoint-url",
    env.endpoint,
    "s3",
    "cp",
    `s3://${bucket}/${plan.sourceKey}`,
    `s3://${bucket}/${plan.archiveKey}`,
    "--acl",
    "private",
  ], {
    env: {
      ...process.env,
      AWS_ACCESS_KEY_ID: env.accessKeyId,
      AWS_SECRET_ACCESS_KEY: env.secretAccessKey,
      AWS_DEFAULT_REGION: env.region,
    },
    stdio: "pipe",
  });
  return plan;
}

async function persistCaptureLog(apiBase, insertionId, payload) {
  const response = await fetch(`${apiBase}/insertions/${insertionId}/capture-proof/logs`, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const parsed = await response.json().catch(() => null);
    throw new Error(parsed?.details || parsed?.error || `Falha ao persistir log da captura: ${response.status}`);
  }
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistCaptureLogWithRetry(apiBase, insertionId, payload, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  const baseBackoffMs = Math.max(100, Number(options.baseBackoffMs ?? 450));
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await persistCaptureLog(apiBase, insertionId, payload);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(baseBackoffMs * attempt);
      }
    }
  }
  throw lastError || new Error("Falha ao persistir log estruturado após retry.");
}

function getPendingCaptureLogQueuePath() {
  const explicitPath = process.env.ADOPS_CAPTURE_PENDING_LOGS_PATH;
  if (explicitPath) return explicitPath;
  return path.join(process.cwd(), "tmp/generated-prints", "pending-capture-logs.jsonl");
}

function enqueuePendingCaptureLog(entry) {
  const queuePath = getPendingCaptureLogQueuePath();
  mkdirSync(path.dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, `${JSON.stringify(entry)}\n`, { flag: "a" });
}

async function flushPendingCaptureLogs() {
  const queuePath = getPendingCaptureLogQueuePath();
  if (!existsSync(queuePath)) {
    return { flushed: 0, kept: 0 };
  }
  const raw = readFileSync(queuePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { flushed: 0, kept: 0 };
  }

  const pending = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  let flushed = 0;
  const kept = [];

  for (const item of pending) {
    try {
      await persistCaptureLogWithRetry(item.apiBase, Number(item.insertionId), item.payload, {
        maxAttempts: 2,
        baseBackoffMs: 300,
      });
      flushed += 1;
    } catch (error) {
      kept.push({
        ...item,
        lastError: error instanceof Error ? error.message : String(error),
        lastTriedAt: new Date().toISOString(),
      });
    }
  }

  if (kept.length > 0) {
    writeFileSync(queuePath, `${kept.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  } else {
    rmSync(queuePath, { force: true });
  }
  return { flushed, kept: kept.length };
}

async function fetchCaptureAuditStatus(apiBase, insertionId, targetDate) {
  const response = await fetch(`${apiBase}/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(targetDate)}`, {
    headers: buildApiHeaders(),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function validateCaptureChecklist(apiBase, insertionId, targetDate, metadata) {
  const response = await fetch(`${apiBase}/audit-checklists/validate-proof`, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ insertionId, date: targetDate, metadata }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.approved !== true) {
    const details = payload?.blockingIssues || payload?.issues || payload?.error || `HTTP ${response.status}`;
    throw new Error(`capture_audit_failed: checklist_pre_upload_failed: ${JSON.stringify(details)}`);
  }
  return payload;
}

function createStageRecorder() {
  const stages = [];
  return {
    stages,
    start(name) {
      const entry = {
        stage: name,
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        summary: {},
        errorCode: null,
        errorDetail: null,
      };
      stages.push(entry);
      return entry;
    },
    finish(entry, status, summary = {}, errorCode = null, errorDetail = null) {
      entry.status = status;
      entry.finishedAt = new Date().toISOString();
      entry.durationMs = Math.max(0, new Date(entry.finishedAt).getTime() - new Date(entry.startedAt).getTime());
      entry.summary = summary;
      entry.errorCode = errorCode;
      entry.errorDetail = errorDetail;
      return entry;
    },
  };
}

function normalizePtText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractPageDateParts(value) {
  const normalized = normalizePtText(value);
  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] };
  const numeric = normalized.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (numeric) return { day: numeric[1], month: numeric[2], year: numeric[3] };
  const longForm = normalized.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/);
  if (!longForm) return null;
  const monthMap = {
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
  return {
    day: String(longForm[1]).padStart(2, "0"),
    month: monthMap[longForm[2]] ?? "00",
    year: longForm[3],
  };
}

function extractPageTimeParts(value) {
  const normalized = normalizePtText(value);
  const iso = normalized.match(/\b\d{4}-\d{2}-\d{2}[t\s](\d{2}):(\d{2})(?::(\d{2}))?\b/);
  if (iso) {
    return {
      hour: Number(iso[1]),
      minute: Number(iso[2]),
      second: Number(iso[3] ?? 0),
    };
  }
  const match = normalized.match(/\b(?:as|às)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };
}

function pageTextMatchesRequestedCaptureAt(pageDateText, requestedCaptureAt) {
  const normalizedPageText = normalizePtText(pageDateText);
  const normalizedCaptureAt = normalizePtText(requestedCaptureAt);
  if (normalizedPageText.startsWith(normalizedCaptureAt)) return true;

  const parts = extractPageDateParts(pageDateText);
  const [targetDate, targetTimeRaw = ""] = String(requestedCaptureAt || "").split("T");
  const [year, month, day] = targetDate.split("-");
  if (!parts || !(parts.year === year && parts.month === month && parts.day === day)) return false;

  const [hourRaw = "", minuteRaw = ""] = targetTimeRaw.split(":");
  const expectedHour = Number(hourRaw);
  const expectedMinute = Number(minuteRaw);
  if (!Number.isFinite(expectedHour) || !Number.isFinite(expectedMinute)) return false;

  const timeParts = extractPageTimeParts(pageDateText);
  if (!timeParts) {
    const expectedTime = requestedCaptureAt.slice(11, 16);
    return expectedTime ? normalizedPageText.includes(expectedTime) : false;
  }

  const expectedSeconds = expectedHour * 3600 + expectedMinute * 60;
  const actualSeconds = timeParts.hour * 3600 + timeParts.minute * 60 + timeParts.second;
  return Math.abs(actualSeconds - expectedSeconds) <= 90;
}

function buildFrozenPageDateLabels(captureAt) {
  const raw = String(captureAt || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${raw}:00-04:00`
    : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Cuiaba" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "numeric", timeZone: "America/Cuiaba" }).format(date);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Cuiaba" }).format(date);
  const year = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Cuiaba" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date);
  const long = `${weekday}, ${day} de ${month} de ${year}, às ${time}`;
  const shortWeekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Cuiaba" }).format(date).replace(".", "");
  const shortWeekdayTitle = shortWeekday.charAt(0).toUpperCase() + shortWeekday.slice(1);
  const day2 = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Cuiaba" }).format(date);
  const month2 = new Intl.DateTimeFormat("pt-BR", { month: "2-digit", timeZone: "America/Cuiaba" }).format(date);
  const year4 = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Cuiaba" }).format(date);
  const timeNoSeconds = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date);
  const shortDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date).replace(",", "");
  return {
    iso: `${raw.length === 16 ? `${raw}:00` : raw}-04:00`.replace(/([+-]\d{2}:?\d{2})-04:00$/, "$1"),
    full: long,
    short: `${shortWeekday}, ${shortDate}`,
    perrengueShort: `${day2}/${month2} ${timeNoSeconds}`,
    omtShort: `${shortWeekdayTitle}, ${day2}/${month2}/${year4}, ${timeNoSeconds}`,
  };
}

const DEFAULT_PAGE_DATE_SELECTORS = [
  ".header-datestamp-full",
  ".header-datestamp-short",
  "time[data-omt-live-datestamp='1']",
  "time.js-topbar-datetime",
  "[data-omt-localtime]",
  "[data-omt-localtime-el]",
  "[data-omt-localtime-full]",
  "[data-omt-localtime-short]",
];

function mergePageDateSelectors(selectors) {
  const merged = [];
  for (const selector of DEFAULT_PAGE_DATE_SELECTORS.concat(Array.isArray(selectors) ? selectors : [])) {
    const normalized = String(selector || "").trim();
    if (normalized && !merged.includes(normalized)) merged.push(normalized);
  }
  return merged;
}

async function freezePreviewDatestamp(page, selectors, captureAt, siteDomain = "") {
  const labels = buildFrozenPageDateLabels(captureAt);
  if (!labels) return false;
  const mergedSelectors = mergePageDateSelectors(selectors);
  return await page.evaluate(({ selectors, labels: frozen, siteDomain: rawSiteDomain }) => {
    const siteDomain = String(rawSiteDomain || "");
    const shortLabel = siteDomain.includes("perrenguematogrosso.com")
      ? frozen.perrengueShort
      : siteDomain.includes("omatogrossense.com")
        ? frozen.omtShort
        : frozen.short;
    const apply = () => {
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (!el) continue;
          if (el.tagName === "TIME") {
            el.setAttribute("datetime", frozen.iso);
            el.setAttribute("data-preview-active", "1");
          }
          el.setAttribute("data-omt-preview-at", frozen.iso);
          const attrText = `${el.className || ""} ${Array.from(el.attributes || []).map((attr) => `${attr.name}=${attr.value || ""}`).join(" ")}`;
          if (/short/i.test(attrText)) {
            el.textContent = shortLabel;
          } else if (!el.children?.length || /full|datestamp|localtime|datetime|time/i.test(attrText)) {
            el.textContent = frozen.full;
          }
        }
      }
    };
    apply();
    if (window.__adopsFreezeDatestampInterval) window.clearInterval(window.__adopsFreezeDatestampInterval);
    window.__adopsFreezeDatestampInterval = window.setInterval(apply, 120);
    return true;
  }, { selectors: mergedSelectors, labels, siteDomain });
}

async function assertVisiblePageDateTextMatchesRequestedCaptureAt(page, mapping, captureAt) {
  if (!captureAt || !String(mapping?.domain || "").includes("omatogrossense.com")) {
    return { ok: true, skipped: true };
  }
  const [targetDate] = String(captureAt).split("T");
  const [year, month, day] = targetDate.split("-");
  const expectedDate = `${day}/${month}/${year}`;
  const labels = buildFrozenPageDateLabels(captureAt);
  const expectedTexts = [expectedDate, labels?.full, labels?.omtShort].filter(Boolean);
  const selectors = mergePageDateSelectors(mapping.pageDateSelectors);
  const audit = await page.evaluate(({ selectors: rawSelectors, expectedDate: rawExpectedDate, expectedTexts: rawExpectedTexts }) => {
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const values = [];
    for (const selector of rawSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (!isVisible(el)) continue;
        const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        values.push({ selector, text: text.slice(0, 180), ok: rawExpectedTexts.some((expected) => text.includes(expected)) });
      }
    }
    return {
      ok: values.some((item) => item.ok),
      expectedDate: rawExpectedDate,
      expectedTexts: rawExpectedTexts,
      values: values.slice(0, 20),
    };
  }, { selectors, expectedDate, expectedTexts });
  if (!audit.ok) {
    throw new Error(`capture_audit_failed: omt_visible_page_time_mismatch: expected=${(audit.expectedTexts || [audit.expectedDate]).join(" | ")}; visible=${JSON.stringify(audit.values || []).slice(0, 900)}`);
  }
  return audit;
}

async function applyPerrengueStaticRetroPreview(page, mapping, captureAt, options = {}) {
  if (!captureAt || mapping?.domain !== "perrenguematogrosso.com") return false;
  if (mapping?.page !== "home" && mapping?.pageLabel !== "Home") return false;
  const adminRetroPosts = Array.isArray(options.adminRetroPosts)
    ? options.adminRetroPosts
    : await fetchPerrengueAdminRetroPosts(captureAt);
  if (adminRetroPosts.length < 1 && options.requireAdminPosts !== false) {
    throw new Error(`perrengue_static_retro_preview_failed: admin_retro_posts_unavailable; captureAt=${captureAt}`);
  }
  const requireEditorialTargets = options.requireEditorialTargets !== false;
  const result = await page.evaluate(async ({ captureAt: rawCaptureAt, adminRetroPosts, requireEditorialTargets, pageType }) => {
    const parseLocalDate = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const normalized = raw.includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
        ? `${raw}-04:00`
        : raw;
      const date = new Date(normalized);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const cutoff = parseLocalDate(rawCaptureAt);
    if (!cutoff) return { applied: false, reason: "invalid_capture_at" };

    const response = await fetch(`/assets/search-index.json?adops_retro=${encodeURIComponent(rawCaptureAt)}`, {
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => null);
    const index = response?.ok ? await response.json().catch(() => null) : [];
    if (!Array.isArray(index)) return { applied: false, reason: "invalid_search_index" };
    if (!index.length && (!Array.isArray(adminRetroPosts) || !adminRetroPosts.length)) {
      return { applied: false, reason: "search_index_unavailable" };
    }

    const combinedIndex = [];
    const seen = new Set();
    const pushUnique = (post) => {
      const key = String(post.url || post.slug || post.title || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      combinedIndex.push(post);
    };
    for (const post of Array.isArray(adminRetroPosts) ? adminRetroPosts : []) pushUnique(post);
    for (const post of index) pushUnique(post);

    const allPosts = combinedIndex
      .map((post) => ({ ...post, _date: parseLocalDate(post.date || post.localDate || post.publishedAt) }))
      .filter((post) => post._date && post._date.getTime() <= cutoff.getTime())
      .sort((left, right) => right._date.getTime() - left._date.getTime());
    if (allPosts.length < 1) return { applied: false, reason: "not_enough_retro_posts", posts: 0 };
    const normalizeCategory = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const isMemePost = (post) => {
      const categorySlugs = [post.categorySlug, ...(Array.isArray(post.categorySlugs) ? post.categorySlugs : [])]
        .map(normalizeCategory);
      const categoryName = normalizeCategory(post.category || post.categoryName);
      const categoryClass = normalizeCategory(post.categoryClass);
      return categorySlugs.includes("memes-do-vovo")
        || categoryName === "memes-do-vovo"
        || categoryName.startsWith("memes-do-vovo-")
        || categoryClass.includes("memes-do-vovo");
    };
    const posts = allPosts.filter((post) => !isMemePost(post));
    const excludedMemePosts = allPosts.length - posts.length;
    const minRequiredPosts = 4;
    if (posts.length < 1) {
      return {
        applied: false,
        reason: "not_enough_editorial_retro_posts",
        posts: posts.length,
        totalPosts: allPosts.length,
        excludedMemePosts,
      };
    }
    const sparseMode = posts.length < minRequiredPosts;
    const pickPost = (index) => posts[index] || posts[index % posts.length] || null;

    const formatParts = (post) => {
      const date = post._date;
      const dateText = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Cuiaba",
      }).format(date);
      const timeText = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Cuiaba",
      }).format(date);
      return { dateText, timeText, label: `${dateText} ${timeText}` };
    };
    const categoryClass = (post) => post.categoryClass || "badge-cat";
    const text = (value) => String(value || "").trim();
    const postSlug = (post) => text(post.slug || post.url)
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+|\/+$/g, "");
    const absoluteUrl = (url) => {
      const raw = text(url);
      if (!raw) return "/";
      try {
        return new URL(raw, window.location.origin).pathname;
      } catch {
        return raw;
      }
    };

    const updateArticle = (article, post, { hero = false } = {}) => {
      if (!article || !post) return false;
      const link = article.querySelector("a[href]");
      if (link) link.setAttribute("href", absoluteUrl(post.url || `/${post.slug || ""}/`));

      const title = article.querySelector("h1,h2,h3,h4,.entry-title");
      if (title) title.textContent = text(post.title);

      const img = article.querySelector("img");
      if (img && post.image) {
        img.src = post.image;
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.alt = text(post.title);
        img.loading = hero ? "eager" : "lazy";
      }

      const badge = article.querySelector(".badge-cat");
      if (badge) {
        badge.className = categoryClass(post);
        badge.textContent = text(post.category || "Notícias");
      }

      const parts = formatParts(post);
      for (const time of Array.from(article.querySelectorAll("time"))) {
        time.setAttribute("datetime", post.publishedAt || post.date || "");
        time.setAttribute("data-date", post.date || post.localDate || post.publishedAt || "");
        time.setAttribute("data-datetime", post.publishedAt || post.date || "");
        time.setAttribute("title", parts.label);
        time.textContent = `${parts.dateText} • ${parts.timeText}`;
      }
      article.setAttribute("data-adops-retro-post-date", post.date || post.localDate || post.publishedAt || "");
      article.setAttribute("data-adops-retro-post-slug", postSlug(post));
      article.setAttribute("data-adops-retro-category-slug", normalizeCategory(post.categorySlug || post.category));
      article.setAttribute("data-date", post.date || post.localDate || post.publishedAt || "");
      article.setAttribute("data-datetime", post.publishedAt || post.date || "");
      return true;
    };

    if (pageType === "article") {
      const post = posts[0] || null;
      const article = document.querySelector("main article") || document.querySelector("article") || document.querySelector("main");
      if (!post || !article) return { applied: false, reason: "article_reconstruction_unavailable", posts: posts.length };

      const title = article.querySelector("h1,.entry-title") || document.querySelector("main h1,h1.entry-title");
      if (title) {
        const link = document.createElement("a");
        link.setAttribute("href", absoluteUrl(post.url || `/${post.slug || ""}/`));
        link.setAttribute("data-adops-retro-article-link", "1");
        link.textContent = text(post.title);
        title.replaceChildren(link);
      }
      const parts = formatParts(post);
      const timeNodes = Array.from(article.querySelectorAll("time"));
      if (timeNodes.length === 0) {
        const time = document.createElement("time");
        time.setAttribute("data-adops-retro-generated", "1");
        article.insertBefore(time, article.firstChild);
        timeNodes.push(time);
      }
      for (const time of timeNodes) {
        time.setAttribute("datetime", post.publishedAt || post.date || "");
        time.setAttribute("data-date", post.date || post.localDate || post.publishedAt || "");
        time.setAttribute("data-datetime", post.publishedAt || post.date || "");
        time.textContent = `${parts.dateText} • ${parts.timeText}`;
      }
      article.setAttribute("data-adops-retro-post-date", post.date || post.localDate || post.publishedAt || "");
      article.setAttribute("data-date", post.date || post.localDate || post.publishedAt || "");
      article.setAttribute("data-datetime", post.publishedAt || post.date || "");
      article.setAttribute("data-adops-retro-primary-article", "1");
      document.documentElement.setAttribute("data-adops-static-retro-preview", rawCaptureAt);
      document.documentElement.setAttribute("data-adops-static-retro-posts-available", String(posts.length));
      document.body?.setAttribute("data-adops-static-retro-preview", rawCaptureAt);
      const expectedPath = absoluteUrl(post.url || `/${post.slug || ""}/`).replace(/\/+$/, "") || "/";
      const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
      const visibleTitle = title instanceof HTMLElement && title.getBoundingClientRect().width > 8 && title.getBoundingClientRect().height > 8;
      const visibleTime = timeNodes.some((time) => time instanceof HTMLElement && time.getBoundingClientRect().width > 8 && time.getBoundingClientRect().height > 8);
      return {
        applied: true,
        articleVerified: currentPath === expectedPath && visibleTitle && visibleTime,
        articlePath: currentPath,
        expectedArticlePath: expectedPath,
        cutoff: rawCaptureAt,
        posts: posts.length,
        sparse: posts.length < minRequiredPosts,
        postsAvailable: posts.length,
        postsRequired: 1,
        adminPosts: Array.isArray(adminRetroPosts) ? adminRetroPosts.length : 0,
        expectedPosts: [post].map((item) => ({
          id: Number(item.id || 0),
          date: String(item.date || item.localDate || item.publishedAt || ""),
          url: String(item.url || `/${item.slug || ""}/`),
          title: String(item.title || "").slice(0, 240),
        })),
      };
    }

    const homeSections = Array.from(document.querySelectorAll("main section"));
    const leadSection = homeSections.find((section) => section.querySelector("article.group a[href]")) || document.querySelector("main");
    const leadArticles = leadSection
      ? Array.from(leadSection.querySelectorAll("article.group")).slice(0, 6)
      : [];
    const imageLoadCache = new Map();
    const imageLoads = async (value) => {
      const source = text(value);
      if (!source) return false;
      if (typeof Image !== "function") return true;
      if (imageLoadCache.has(source)) return imageLoadCache.get(source);
      const promise = new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const done = (loaded) => {
          if (settled) return;
          settled = true;
          resolve(loaded === true && image.naturalWidth > 1 && image.naturalHeight > 1);
        };
        image.onload = () => done(true);
        image.onerror = () => done(false);
        window.setTimeout(() => done(false), 5000);
        image.src = source;
      });
      imageLoadCache.set(source, promise);
      return promise;
    };
    const leadPosts = [];
    const invalidImagePosts = [];
    for (const post of posts.filter((candidate) => candidate.image)) {
      if (await imageLoads(post.image)) leadPosts.push(post);
      else invalidImagePosts.push(postSlug(post));
      if (leadPosts.length >= Math.max(leadArticles.length, 6)) break;
    }
    if (leadPosts.length < 1) {
      return {
        applied: false,
        reason: "retro_editorial_images_unavailable",
        invalidImagePosts: invalidImagePosts.slice(0, 12),
        posts: posts.length,
      };
    }
    leadArticles.forEach((article, index) => updateArticle(article, leadPosts[index] || pickPost(index), { hero: index === 0 }));

    const nowList = document.querySelector(".cod5-home-now-list ol");
    const nowPostCount = sparseMode ? Math.min(6, Math.max(posts.length, 1)) : Math.min(6, posts.length);
    const nowPosts = Array.from({ length: nowPostCount }, (_, index) => pickPost(6 + index)).filter(Boolean);
    if (nowList && nowPosts.length > 0) {
      nowList.innerHTML = nowPosts.map((post) => {
        const parts = formatParts(post);
        return `<li data-adops-retro-post-date="${String(post.date || post.publishedAt || "").replace(/"/g, "&quot;")}" data-adops-retro-post-slug="${postSlug(post)}" data-adops-retro-category-slug="${normalizeCategory(post.categorySlug || post.category)}">
          <a class="group flex min-h-[44px] items-center gap-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white" href="${absoluteUrl(post.url || `/${post.slug || ""}/`)}">
            <span class="w-14 shrink-0 text-xs font-semibold text-secondary-500 tabular-nums" title="Atualizado em ${parts.label}">${parts.timeText}</span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2"><span class="${categoryClass(post)}">${text(post.category || "Notícias")}</span></span>
              <span class="mt-1 block truncate text-sm font-semibold leading-snug text-primary-900 group-hover:underline">${text(post.title)}</span>
            </span>
            <span class="shrink-0" style="color: var(--color-ink-subtle);">→</span>
          </a>
        </li>`;
      }).join("");
    }

    const usedLeadCount = leadArticles.length;
    const remainingArticles = Array.from(document.querySelectorAll("main article.group")).slice(usedLeadCount);
    let offset = usedLeadCount + nowPosts.length;
    remainingArticles.forEach((article) => {
      const currentBadge = article.querySelector(".badge-cat")?.textContent?.trim();
      const remainingPool = posts.slice(offset);
      const candidate = remainingPool.find((post) => !currentBadge || post.category === currentBadge) || pickPost(offset);
      if (candidate && updateArticle(article, candidate)) offset += 1;
    });

    const editorialMemeLeaks = [];
    const findMemeLeaks = (root, area) => {
      if (!root) return;
      const candidates = root.matches?.("article,li")
        ? [root]
        : Array.from(root.querySelectorAll("article,li"));
      for (const candidate of candidates) {
        const badgeText = normalizeCategory(candidate.querySelector(".badge-cat")?.textContent);
        const categorySlug = normalizeCategory(candidate.getAttribute("data-adops-retro-category-slug"));
        const memeClass = candidate.querySelector(".badge-cat--memes-do-vovo");
        const memeCategoryLink = candidate.querySelector('a[href*="/categoria/memes-do-vovo/"]');
        if (categorySlug === "memes-do-vovo" || badgeText === "memes-do-vovo" || memeClass || memeCategoryLink) {
          editorialMemeLeaks.push({
            area,
            categorySlug,
            badgeText,
            href: candidate.querySelector("a[href]")?.getAttribute("href") || "",
          });
        }
      }
    };
    leadArticles.forEach((article) => findMemeLeaks(article, "destaques"));
    findMemeLeaks(nowList, "agora");
    if (editorialMemeLeaks.length > 0) {
      return {
        applied: false,
        reason: "retro_editorial_meme_leak",
        editorialMemeLeaks: editorialMemeLeaks.slice(0, 12),
        posts: posts.length,
        totalPosts: allPosts.length,
        excludedMemePosts,
      };
    }

    if (requireEditorialTargets && (leadArticles.length < 1 || !nowList)) {
      return {
        applied: false,
        reason: "retro_editorial_targets_missing",
        leadArticles: leadArticles.length,
        nowListFound: Boolean(nowList),
      };
    }
    const expectedLeadSlugs = leadArticles
      .map((_, index) => leadPosts[index] || pickPost(index))
      .filter(Boolean)
      .map(postSlug);
    const renderedLeadSlugs = leadArticles.map((article) => text(article.getAttribute("data-adops-retro-post-slug")));
    const expectedNowSlugs = nowPosts.map(postSlug);
    const renderedNowSlugs = nowList
      ? Array.from(nowList.querySelectorAll("li")).map((item) => text(item.getAttribute("data-adops-retro-post-slug")))
      : [];
    const editorialContentMatches = JSON.stringify(expectedLeadSlugs) === JSON.stringify(renderedLeadSlugs)
      && JSON.stringify(expectedNowSlugs) === JSON.stringify(renderedNowSlugs);
    if (requireEditorialTargets && !editorialContentMatches) {
      return {
        applied: false,
        reason: "retro_editorial_content_mismatch",
        expectedLeadSlugs,
        renderedLeadSlugs,
        expectedNowSlugs,
        renderedNowSlugs,
      };
    }

    document.documentElement.setAttribute("data-adops-static-retro-preview", rawCaptureAt);
    document.documentElement.setAttribute("data-adops-static-retro-preview-sparse", sparseMode ? "1" : "0");
    document.documentElement.setAttribute("data-adops-static-retro-posts-available", String(posts.length));
    document.documentElement.setAttribute("data-adops-static-retro-memes-excluded", String(excludedMemePosts));
    document.body?.setAttribute("data-adops-static-retro-preview", rawCaptureAt);
    document.body?.setAttribute("data-adops-static-retro-preview-sparse", sparseMode ? "1" : "0");
    document.body?.setAttribute("data-adops-static-retro-posts-available", String(posts.length));
    document.body?.setAttribute("data-adops-static-retro-memes-excluded", String(excludedMemePosts));
    return {
      applied: true,
      cutoff: rawCaptureAt,
      posts: posts.length,
      sparse: sparseMode,
      postsAvailable: posts.length,
      totalPostsAvailable: allPosts.length,
      excludedMemePosts,
      editorialMemeLeaks: [],
      source: "admin-wp+search-index",
      expectedLeadSlugs,
      renderedLeadSlugs,
      expectedNowSlugs,
      renderedNowSlugs,
      editorialContentMatches,
      postsRequired: minRequiredPosts,
      adminPosts: Array.isArray(adminRetroPosts) ? adminRetroPosts.length : 0,
      invalidImagePosts: invalidImagePosts.slice(0, 12),
      expectedPosts: posts.slice(0, 25).map((post) => ({
        id: Number(post.id || 0),
        date: String(post.date || post.localDate || post.publishedAt || ""),
        url: String(post.url || `/${post.slug || ""}/`),
        title: String(post.title || "").slice(0, 240),
      })),
    };
  }, {
    captureAt,
    adminRetroPosts,
    requireEditorialTargets,
    pageType: mapping?.page === "article" ? "article" : "home",
  });

  if (!result || result.applied !== true) {
    const reason = result && typeof result === "object" ? result.reason || JSON.stringify(result) : "unknown";
    throw new Error(`perrengue_static_retro_preview_failed: ${reason}`);
  }

  return result;
}

async function applyAflRetroPreview(page, mapping, captureAt, options = {}) {
  if (!captureAt || mapping?.domain !== "afolhalivre.com") return false;
  if (mapping?.page !== "home" && mapping?.pageLabel !== "Home") return false;
  const posts = Array.isArray(options.posts) ? options.posts : await fetchAflRetroPosts(captureAt);
  if (!posts.length) throw new Error(`afl_retro_preview_failed: posts_unavailable; captureAt=${captureAt}`);

  const result = await page.evaluate(({ captureAt: rawCaptureAt, retroPosts }) => {
    const text = (value) => String(value || "").trim();
    const absoluteUrl = (value) => {
      try { return new URL(text(value), window.location.origin).href; } catch { return text(value) || "/"; }
    };
    const setImage = (container, post, eager = false) => {
      if (!container || !post?.image) return;
      const picture = container.querySelector("picture");
      const img = container.querySelector("img");
      if (!img) return;
      picture?.querySelectorAll("source").forEach((source) => source.remove());
      img.src = post.image;
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.removeAttribute("data-src");
      img.removeAttribute("data-lazy-src");
      img.alt = post.title;
      img.loading = eager ? "eager" : "lazy";
    };
    const setLink = (article, post) => {
      const link = article?.querySelector("a[href]");
      if (link) link.href = absoluteUrl(post.url || `/${post.slug}/`);
    };
    const setCategory = (article, post) => {
      const badge = article?.querySelector(".tp-cat-pill, [style*='background-color']");
      if (badge) badge.textContent = post.category || "Notícias";
    };
    const formatDate = (value) => {
      const date = new Date(`${String(value || "").replace(/Z$/, "")}-04:00`);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "America/Cuiaba",
      }).format(date).replace(",", "");
    };

    const hero = document.querySelector("main .hero-section article.hero-post");
    const heroPost = retroPosts.find((post) => post.image) || retroPosts[0];
    if (!hero || !heroPost) return { applied: false, reason: "hero_target_missing" };
    setLink(hero, heroPost);
    setImage(hero, heroPost, true);
    const heroTitle = hero.querySelector("h1,h2,h3");
    if (heroTitle) heroTitle.textContent = heroPost.title;
    const heroExcerpt = hero.querySelector("p");
    if (heroExcerpt) heroExcerpt.textContent = heroPost.excerpt || "";
    setCategory(hero, heroPost);
    hero.setAttribute("data-adops-retro-post-slug", heroPost.slug);
    hero.setAttribute("data-adops-retro-post-date", heroPost.date);

    const latest = Array.from(document.querySelectorAll("main .hero-section aside article.post-card-compact"));
    const sidebarPosts = retroPosts.filter((post) => post.slug !== heroPost.slug).slice(0, latest.length);
    latest.forEach((article, index) => {
      const post = sidebarPosts[index];
      if (!post) return;
      setLink(article, post);
      setImage(article, post);
      const title = article.querySelector("h1,h2,h3,h4");
      if (title) title.textContent = post.title;
      setCategory(article, post);
      const dateNode = article.querySelector(".text-xs span, time");
      if (dateNode) dateNode.textContent = formatDate(post.date);
      article.setAttribute("data-adops-retro-post-slug", post.slug);
      article.setAttribute("data-adops-retro-post-date", post.date);
    });

    const reservedArticles = new Set([hero, ...latest]);
    const remainingArticles = Array.from(document.querySelectorAll("main article"))
      .filter((article) => !reservedArticles.has(article));
    let remainingOffset = 1 + sidebarPosts.length;
    remainingArticles.forEach((article) => {
      const post = retroPosts[remainingOffset % retroPosts.length];
      remainingOffset += 1;
      if (!post) return;
      setLink(article, post);
      setImage(article, post);
      const title = article.querySelector("h1,h2,h3,h4,.entry-title");
      if (title) title.textContent = post.title;
      const excerpt = article.querySelector("p");
      if (excerpt && post.excerpt) excerpt.textContent = post.excerpt;
      setCategory(article, post);
      const dateNodes = article.querySelectorAll("time, .text-xs span, .post-date, .entry-date");
      dateNodes.forEach((dateNode) => { dateNode.textContent = formatDate(post.date); });
      article.setAttribute("data-adops-retro-post-slug", post.slug);
      article.setAttribute("data-adops-retro-post-date", post.date);
    });

    const renderedHeroSlug = hero.getAttribute("data-adops-retro-post-slug") || "";
    const renderedLatestSlugs = latest.map((article) => article.getAttribute("data-adops-retro-post-slug") || "").filter(Boolean);
    const expectedLatestSlugs = sidebarPosts.map((post) => post.slug);
    const editorialContentMatches = renderedHeroSlug === heroPost.slug
      && JSON.stringify(renderedLatestSlugs) === JSON.stringify(expectedLatestSlugs);
    if (!editorialContentMatches) {
      return {
        applied: false,
        reason: "retro_editorial_content_mismatch",
        expectedHeroSlug: heroPost.slug,
        renderedHeroSlug,
        expectedLatestSlugs,
        renderedLatestSlugs,
      };
    }
    document.documentElement.setAttribute("data-adops-afl-retro-preview", rawCaptureAt);
    return {
      applied: true,
      source: "afl-wp-rest",
      posts: retroPosts.length,
      expectedHeroSlug: heroPost.slug,
      renderedHeroSlug,
      expectedLatestSlugs,
      renderedLatestSlugs,
      rewrittenArticles: 1 + latest.length + remainingArticles.length,
      editorialContentMatches,
    };
  }, { captureAt, retroPosts: posts });

  if (!result || result.applied !== true) {
    const reason = result && typeof result === "object" ? result.reason || JSON.stringify(result) : "unknown";
    throw new Error(`afl_retro_preview_failed: ${reason}`);
  }
  return result;
}

async function applyOmtRetroPreview(page, mapping, captureAt, options = {}) {
  if (!captureAt || mapping?.domain !== "omatogrossense.com") return false;
  if (mapping?.page !== "home" && mapping?.pageLabel !== "Home") return false;
  if (options.allowReconstruction !== true) return false;
  const posts = normalizeRetroEditorialPosts(
    Array.isArray(options.posts) ? options.posts : await fetchOmtRetroPosts(captureAt),
    captureAt,
  );
  if (posts.length < 3) throw new Error(`omt_retro_preview_failed: not_enough_retro_posts; captureAt=${captureAt}`);

  const result = await page.evaluate(async ({ captureAt: rawCaptureAt, retroPosts }) => {
    const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const absoluteUrl = (value) => {
      try { return new URL(text(value), window.location.origin).href; } catch { return text(value) || "/"; }
    };
    const cards = Array.from(document.querySelectorAll([
      ".omt-home-lead-card",
      ".omt-home-side-card",
      ".omt-home-latest-list li",
      ".omt-home-editoria article",
    ].join(","))).filter((card, index, all) => all.indexOf(card) === index);
    if (cards.length < 3) return { applied: false, reason: "editorial_targets_missing", cards: cards.length };

    const formatDate = (value) => {
      const normalized = String(value || "").includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(value || ""))
        ? `${value}-04:00`
        : value;
      const date = new Date(normalized);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "America/Cuiaba",
      }).format(date).replace(",", "");
    };
    const chooseContentLink = (card) => {
      const title = card.querySelector(".omt-home-lead-title,.omt-home-side-title,.omt-home-latest-copy > a:not(.omt-home-cat-pill),h1,h2,h3,h4");
      return title?.closest("a[href]") || title?.querySelector("a[href]") || card.querySelector("a[href]:not(.omt-home-cat-pill)");
    };
    const rendered = [];
    for (let index = 0; index < cards.length && index < retroPosts.length; index += 1) {
      const card = cards[index];
      const post = retroPosts[index];
      const href = absoluteUrl(post.url || `/${post.slug}/`);
      const contentLink = chooseContentLink(card);
      if (contentLink) contentLink.href = href;
      const image = card.querySelector("img");
      if (image && post.image) {
        image.src = post.image;
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.removeAttribute("data-lazy-src");
        image.removeAttribute("data-lazy-src-webp");
        image.loading = index === 0 ? "eager" : "lazy";
        image.alt = post.title;
        const imageLink = image.closest("a[href]");
        if (imageLink) imageLink.href = href;
      }
      const title = card.querySelector(".omt-home-lead-title,.omt-home-side-title,.omt-home-latest-copy > a:not(.omt-home-cat-pill),h1,h2,h3,h4");
      const titleTarget = title?.matches?.("a") ? title : title?.querySelector?.("a") || title;
      if (titleTarget) titleTarget.textContent = post.title;
      const time = card.querySelector("time");
      if (time) {
        time.setAttribute("datetime", post.date);
        time.setAttribute("data-date", post.date);
        time.textContent = formatDate(post.date);
      }
      card.setAttribute("data-adops-retro-post-slug", post.slug);
      card.setAttribute("data-adops-retro-post-date", post.date);
      rendered.push(post.slug);
    }
    const expected = retroPosts.slice(0, rendered.length).map((post) => post.slug);
    if (rendered.length < 3 || JSON.stringify(rendered) !== JSON.stringify(expected)) {
      return { applied: false, reason: "retro_editorial_content_mismatch", expected, rendered };
    }
    document.documentElement.setAttribute("data-adops-omt-retro-preview", rawCaptureAt);
    document.body?.setAttribute("data-adops-omt-retro-preview", rawCaptureAt);
    return {
      applied: true,
      source: "omt-wp-rest-reconstruction",
      posts: retroPosts.length,
      postsAvailable: retroPosts.length,
      postsRequired: 3,
      expectedPosts: retroPosts.slice(0, 25).map((post) => ({
        id: Number(post.id || 0),
        date: post.date,
        modified: post.modified || null,
        url: post.url,
        title: post.title,
      })),
      expectedLeadSlugs: expected,
      renderedLeadSlugs: rendered,
      editorialContentMatches: true,
    };
  }, { captureAt, retroPosts: posts });

  if (!result || result.applied !== true) {
    const reason = result && typeof result === "object" ? result.reason || JSON.stringify(result) : "unknown";
    throw new Error(`omt_retro_preview_failed: ${reason}`);
  }
  return result;
}

async function applyPortalRetroPreview(page, mapping, captureAt, options = {}) {
  return await applyPerrengueStaticRetroPreview(page, mapping, captureAt)
    || await applyOmtRetroPreview(page, mapping, captureAt, options)
    || await applyAflRetroPreview(page, mapping, captureAt)
    || false;
}

function buildStaticRetroSlotPlan(mapping) {
  const domain = String(mapping?.domain || "").toLowerCase();
  if (!new Set(["omatogrossense.com", "afolhalivre.com", "portalnortemt.com"]).has(domain)) return null;
  if (mapping?.page !== "home" && mapping?.pageLabel !== "Home") return null;
  const slotSelector = String(mapping?.slotSelector || "").trim();
  const configuredContextSelector = String(mapping?.contextSelector || "").trim();
  const contextSelector = new Set(["afolhalivre.com", "portalnortemt.com"]).has(domain) && slotSelector === ".g.g-2"
    ? "#block-9"
    : configuredContextSelector;
  if (!slotSelector || !contextSelector || slotSelector === contextSelector) return null;
  const matches = Array.from(slotSelector.matchAll(/\.g-(\d+)\b/g));
  if (matches.length !== 1) return null;
  const groupId = Number(matches[0][1]);
  if (!Number.isInteger(groupId) || groupId < 1) return null;
  if (domain === "omatogrossense.com" && groupId !== 1) return null;
  if (domain === "afolhalivre.com" && groupId !== 2) return null;
  if (domain === "portalnortemt.com" && groupId !== 2) return null;
  return { contextSelector, groupClass: `g g-${groupId}`, groupId };
}

function currentDateInCuiaba(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function shouldAllowConfiguredRetroSlotReconstruction({ captureDate, periodStart, periodEnd, currentDate = currentDateInCuiaba(), explicitCaptureAt = false, reconstructionReason = null }) {
  const capture = String(captureDate || "").slice(0, 10);
  const start = String(periodStart || "").slice(0, 10);
  const end = String(periodEnd || "").slice(0, 10);
  const today = String(currentDate || "").slice(0, 10);
  if (explicitCaptureAt !== true || ![capture, start, end, today].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return false;
  const authorizedLateRecovery = reconstructionReason === "late_publication_recovery";
  return capture < today && start <= capture && capture <= end && (end < today || authorizedLateRecovery);
}

async function applyPerrengueStaticRetroAd(page, mapping, mediaUrl, mediaBasename, options = {}) {
  const allowExplicitStaticInjection = process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION === "1";
  if (!allowExplicitStaticInjection) return false;
  if (options.reconstructionReason !== "late_publication_recovery") return false;
  const domain = String(mapping?.domain || "").toLowerCase();
  if (options.allowConfiguredSlotReconstruction !== true) return false;
  if (mapping?.domain !== "perrenguematogrosso.com" && !allowExplicitStaticInjection) return false;
  if (!allowExplicitStaticInjection && mapping?.page !== "home" && mapping?.pageLabel !== "Home") return false;
  const url = String(mediaUrl || "").trim();
  if (!url) return false;

  const missingSlotPlan = options.allowConfiguredSlotReconstruction === true
    ? buildStaticRetroSlotPlan(mapping)
    : null;
  return await page.evaluate(async ({ mediaUrl: targetUrl, mediaBasename: targetBasename, slotSelector, missingSlotPlan }) => {
    const normalizeSelector = (value) => String(value || "").trim();
    const createMissingInternalSlot = () => {
      const selector = normalizeSelector(slotSelector);
      if (selector !== ".g.g-11" && selector !== ".g.g-14") return null;
      const groupClass = selector === ".g.g-14" ? "g g-14" : "g g-11";
      const groupId = selector === ".g.g-14" ? "14" : "11";
      const content = document.querySelector(".entry-content, article .entry-content, main article, main");
      if (!(content instanceof HTMLElement)) return null;
      const host = document.createElement("div");
      host.className = "cod5-internal-news-ad";
      host.setAttribute("data-cod5-internal-news-ad", `adrotate-${groupId}`);
      host.style.margin = "18px 0";
      host.style.width = "100%";
      const slot = document.createElement("div");
      slot.className = groupClass;
      slot.style.display = "block";
      slot.style.width = "100%";
      host.appendChild(slot);
      const firstParagraph = content.querySelector("p");
      if (firstParagraph && firstParagraph.parentElement === content) {
        firstParagraph.insertAdjacentElement("afterend", host);
      } else {
        content.insertBefore(host, content.firstChild);
      }
      return slot;
    };
    const createMissingPopupSlot = () => {
      const selector = normalizeSelector(slotSelector);
      if (selector !== "#cod5-bottom-popup-ad .g.g-9") return null;
      let host = document.querySelector("#cod5-bottom-popup-ad");
      if (!(host instanceof HTMLElement)) {
        host = document.createElement("div");
        host.id = "cod5-bottom-popup-ad";
        host.setAttribute("data-cod5-popup-retro-ad", "1");
        document.body.appendChild(host);
      }
      host.style.position = "fixed";
      host.style.left = "50%";
      host.style.bottom = "18px";
      host.style.transform = "translateX(-50%)";
      host.style.zIndex = "2147483000";
      host.style.width = "min(970px, calc(100vw - 64px))";
      host.style.maxWidth = "970px";
      host.style.display = "block";
      host.style.visibility = "visible";
      host.style.opacity = "1";
      host.style.pointerEvents = "auto";
      host.style.background = "transparent";
      let slot = host.querySelector(".g.g-9");
      if (!(slot instanceof HTMLElement)) {
        slot = document.createElement("div");
        slot.className = "g g-9";
        host.appendChild(slot);
      }
      slot.style.display = "block";
      slot.style.visibility = "visible";
      slot.style.opacity = "1";
      slot.style.width = "100%";
      slot.style.minHeight = "90px";
      return slot;
    };
    const createConfiguredHomeSlot = () => {
      if (!missingSlotPlan) return null;
      const hosts = Array.from(document.querySelectorAll(missingSlotPlan.contextSelector));
      if (hosts.length !== 1 || !(hosts[0] instanceof HTMLElement)) return null;
      const host = hosts[0];
      const slot = document.createElement("div");
      slot.className = missingSlotPlan.groupClass;
      slot.setAttribute("data-adops-reconstructed-slot", String(missingSlotPlan.groupId));
      slot.style.display = "block";
      slot.style.visibility = "visible";
      slot.style.opacity = "1";
      slot.style.width = "100%";
      slot.style.minHeight = "48px";
      host.appendChild(slot);
      return slot;
    };
    const isUsableSlot = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width >= 48 &&
        rect.height >= 24;
    };
    const slots = Array.from(document.querySelectorAll(slotSelector || ".g.g-1"));
    const slot = slots.find(isUsableSlot) || slots[0] || createMissingInternalSlot() || createMissingPopupSlot() || createConfiguredHomeSlot();
    if (!slot) return { applied: false, reason: "slot_missing" };
    const basename = String(targetBasename || targetUrl.split("/").pop() || "").toLowerCase();
    if (slot.querySelector("[data-adops-static-retro-ad='1']")) {
      return { applied: false, reason: "static_retro_ad_already_present" };
    }
    const hasTarget = Array.from(slot.querySelectorAll("img,video,source")).some((node) => {
      const src = String(node.currentSrc || node.src || node.getAttribute("src") || "").toLowerCase();
      return src.includes(basename) || src === targetUrl.toLowerCase();
    });
    if (hasTarget) return { applied: false, reason: "already_present" };

    const visibleChildren = Array.from(slot.children).filter((child) => {
      const style = window.getComputedStyle(child);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    for (const child of Array.from(slot.children)) {
      child.style.display = "none";
    }

    const wrapper = visibleChildren[0]?.cloneNode(false) || document.createElement("div");
    wrapper.removeAttribute("id");
    wrapper.style.display = "block";
    wrapper.style.visibility = "visible";
    wrapper.style.opacity = "1";
    wrapper.setAttribute("data-adops-static-retro-ad", "1");

    const link = document.createElement("a");
    link.href = "/";
    link.target = "_blank";
    link.rel = "noopener";
    link.style.display = "block";

    const isVideo = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(targetUrl);
    if (isVideo) {
      const video = document.createElement("video");
      video.src = targetUrl;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.style.width = "100%";
      video.style.height = "auto";
      video.style.display = "block";
      link.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = targetUrl;
      img.alt = "Publicidade";
      img.decoding = "sync";
      img.loading = "eager";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      link.appendChild(img);
      await new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
        window.setTimeout(resolve, 5000);
      });
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch {}
    }

    wrapper.textContent = "";
    wrapper.appendChild(link);
    slot.insertBefore(wrapper, slot.firstChild);
    const rect = slot.getBoundingClientRect();
    const media = wrapper.querySelector("img,video");
    const mediaRect = media instanceof HTMLElement ? media.getBoundingClientRect() : null;
    return {
      applied: true,
      slotWidth: Math.round(rect.width),
      slotHeight: Math.round(rect.height),
      mediaWidth: mediaRect ? Math.round(mediaRect.width) : null,
      mediaHeight: mediaRect ? Math.round(mediaRect.height) : null,
    };
  }, { mediaUrl: url, mediaBasename, slotSelector: mapping?.slotSelector || ".g.g-1", missingSlotPlan });
}

function parseIsoLikeDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  const ptNumeric = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b.*?\b(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (ptNumeric) {
    const day = String(ptNumeric[1]).padStart(2, "0");
    const month = String(ptNumeric[2]).padStart(2, "0");
    const hour = String(ptNumeric[4]).padStart(2, "0");
    const candidate = new Date(`${ptNumeric[3]}-${month}-${day}T${hour}:${ptNumeric[5]}:${ptNumeric[6] ?? "00"}-04:00`);
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }

  const cod5PtDateOnly = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (cod5PtDateOnly) {
    const cod5DayNumber = Number(cod5PtDateOnly[1]);
    const cod5MonthNumber = Number(cod5PtDateOnly[2]);
    const cod5YearNumber = Number(cod5PtDateOnly[3]);
    const cod5MaxDay = cod5MonthNumber >= 1 && cod5MonthNumber <= 12
      ? new Date(Date.UTC(cod5YearNumber, cod5MonthNumber, 0)).getUTCDate()
      : 0;
    if (cod5DayNumber >= 1 && cod5DayNumber <= cod5MaxDay) {
      const cod5Day = String(cod5DayNumber).padStart(2, "0");
      const cod5Month = String(cod5MonthNumber).padStart(2, "0");
      const cod5Candidate = new Date(`${cod5YearNumber}-${cod5Month}-${cod5Day}T00:00:00-04:00`);
      if (!Number.isNaN(cod5Candidate.getTime())) return cod5Candidate;
    }
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const ptLong = raw.match(/\b(\d{1,2})\s+de\s+([a-zA-ZçÇãõáéíóúâêô]+)(?:\s+de)?\s+(\d{4})(?:.*?\b(\d{2}):(\d{2})(?::(\d{2}))?)?/i);
  if (ptLong) {
    const monthMap = {
      janeiro: "01",
      fevereiro: "02",
      marco: "03",
      março: "03",
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
    const month = monthMap[ptLong[2].normalize("NFC").toLowerCase()];
    if (month) {
      const day = String(ptLong[1]).padStart(2, "0");
      const hour = ptLong[4] || "00";
      const minute = ptLong[5] || "00";
      const second = ptLong[6] || "00";
      const candidate = new Date(`${ptLong[3]}-${month}-${day}T${hour}:${minute}:${second}-04:00`);
      if (!Number.isNaN(candidate.getTime())) return candidate;
    }
  }
  return null;
}

function evaluateContentTimeline(contentDateSamples, requestedCaptureAt) {
  const captureAtDate = parseIsoLikeDate(requestedCaptureAt);
  if (!captureAtDate) {
    return { ok: false, maxObserved: null, futureSamples: [], parsedCount: 0, sampleCount: 0, reason: "invalid_capture_at" };
  }
  if (!Array.isArray(contentDateSamples) || contentDateSamples.length === 0) {
    return { ok: false, maxObserved: null, futureSamples: [], parsedCount: 0, sampleCount: 0, reason: "empty_samples" };
  }
  const maxAllowed = captureAtDate.getTime() + 90 * 1000;
  const parsedSamples = contentDateSamples
    .map((value) => ({ raw: value, parsed: parseIsoLikeDate(value) }))
    .filter((item) => item.parsed);
  if (parsedSamples.length === 0) {
    return { ok: false, maxObserved: null, futureSamples: [], parsedCount: 0, sampleCount: contentDateSamples.length, reason: "unparseable_samples" };
  }
  const futureSamples = parsedSamples.filter((item) => item.parsed.getTime() > maxAllowed);
  const maxObserved = parsedSamples.reduce((acc, item) => (
    !acc || item.parsed.getTime() > acc.getTime() ? item.parsed : acc
  ), null);
  return {
    ok: futureSamples.length === 0,
    maxObserved: maxObserved ? maxObserved.toISOString() : null,
    futureSamples: futureSamples.slice(0, 5).map((item) => item.raw),
    parsedCount: parsedSamples.length,
    sampleCount: contentDateSamples.length,
    reason: futureSamples.length ? "future_samples" : null,
  };
}

function normalizeEditorialUrl(value) {
  try {
    const parsed = new URL(String(value || ""), "https://adops.invalid");
    return parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

function evaluateRetroContentProof(payload) {
  const requestedCaptureAt = payload.requestedCaptureAt || null;
  const editorialSamples = Array.isArray(payload.editorialSamples) ? payload.editorialSamples.slice(0, 25) : [];
  const expectedPosts = Array.isArray(payload.expectedPosts) ? payload.expectedPosts.slice(0, 25) : [];
  const minimumConfigured = Math.max(1, Math.min(25, Number(payload.minimumRequired || (payload.pageType === "article" ? 1 : 3))));
  const minimumRequired = expectedPosts.length > 0 ? Math.min(minimumConfigured, expectedPosts.length) : minimumConfigured;
  const contentTimeline = evaluateContentTimeline(editorialSamples.map((item) => item.date).filter(Boolean), requestedCaptureAt);
  const expectedPaths = new Set(expectedPosts.map((item) => normalizeEditorialUrl(item.url || item.link)).filter(Boolean));
  const visiblePaths = new Set(editorialSamples.map((item) => normalizeEditorialUrl(item.url)).filter(Boolean));
  const visibleMatchCount = Array.from(expectedPaths).filter((item) => visiblePaths.has(item)).length;
  const reconstructed = payload.reconstructed === true;
  const previewActive = payload.previewActive === true;
  const manifestHash = typeof payload.manifestHash === "string" && payload.manifestHash ? payload.manifestHash : null;
  const issues = [];

  if (payload.requireSignedPreview !== false && !previewActive && !reconstructed) {
    issues.push({ code: "retro_preview_not_active", detail: "signed retro preview marker was not confirmed" });
  }
  if (!contentTimeline.ok) {
    issues.push({
      code: contentTimeline.reason === "future_samples" ? "content_time_mismatch" : "retro_content_unverified",
      detail: `reason=${contentTimeline.reason || "unknown"} parsed=${contentTimeline.parsedCount || 0}`,
    });
  }
  if (expectedPosts.length === 0 || visibleMatchCount < minimumRequired) {
    issues.push({
      code: "retro_content_expected_mismatch",
      detail: `expected=${expectedPosts.length} visibleMatches=${visibleMatchCount} minimum=${minimumRequired}`,
    });
  }
  if (reconstructed && !manifestHash) {
    issues.push({ code: "retro_reconstruction_failed", detail: "reconstruction has no manifest hash" });
  }

  return {
    status: issues.length === 0 ? "approved" : "rejected",
    sourceMode: reconstructed ? "audited_reconstruction" : "signed_preview",
    previewActive,
    expectedCount: expectedPosts.length,
    visibleMatchCount,
    minimumRequired,
    maxObserved: contentTimeline.maxObserved,
    futureCount: contentTimeline.futureSamples.length,
    reconstructed,
    manifestHash,
    issues,
  };
}

function evaluateRetroCaptureGate(payload) {
  const requestedCaptureAt = payload.requestedCaptureAt;
  if (!requestedCaptureAt) {
    return {
      ok: true,
      issues: [],
      codes: [],
      contentTimeline: { ok: true, maxObserved: null, futureSamples: [] },
      retroContentProof: payload.retroContentProof || null,
    };
  }
  const issues = [];
  const desktopMatches = pageTextMatchesRequestedCaptureAt(payload.systemDateTime || "", requestedCaptureAt);
  if (!desktopMatches) {
    issues.push({
      code: "desktop_time_mismatch",
      detail: `desktop=${payload.systemDateTime || "n/a"}`,
    });
  }
  const pageReference = payload.pageDateObserved || payload.pageDateText || "";
  const pageMatches = pageTextMatchesRequestedCaptureAt(pageReference, requestedCaptureAt);
  if (!pageMatches) {
    issues.push({
      code: "page_time_mismatch",
      detail: `page=${pageReference || "n/a"}`,
    });
  }
  const contentTimeline = evaluateContentTimeline(payload.contentDateSamples, requestedCaptureAt);
  if (!contentTimeline.ok && (payload.requireRetroContentProof || contentTimeline.reason === "future_samples")) {
    issues.push({
      code: "content_time_mismatch",
      detail: `maxObserved=${contentTimeline.maxObserved || "n/a"} futureSamples=${contentTimeline.futureSamples.join(" | ") || "n/a"}`,
    });
  }
  if (payload.requireRetroContentProof && payload.retroContentProof?.status !== "approved") {
    const proofIssues = Array.isArray(payload.retroContentProof?.issues) ? payload.retroContentProof.issues : [];
    if (!proofIssues.length) {
      issues.push({ code: "retro_content_unverified", detail: "retroContentProof is missing or not approved" });
    } else {
      for (const issue of proofIssues) issues.push(issue);
    }
  }
  if (payload.requireSlotVisibleInViewport && !payload.slotVisibility?.mostlyVisible) {
    issues.push({
      code: "slot_position_mismatch",
      detail: `visibleRatio=${Number(payload.slotVisibility?.visibleRatio ?? 0).toFixed(3)}`,
    });
  }
  if (payload.requireDomFrameSimilarity && payload.domFrameSimilarityOk !== true) {
    issues.push({
      code: "slot_position_mismatch",
      detail: `domFrameSimilarity=${Number(payload.domFrameSimilarityScore ?? 0).toFixed(4)} min=${Number(payload.domFrameMinSimilarity ?? 0).toFixed(4)}`,
    });
  }
  if (payload.requireDomUsefulContent && payload.domFrameHasUsefulContent !== true) {
    issues.push({
      code: "slot_position_mismatch",
      detail: `domNonBgRatio=${Number(payload.domFrameNonBgRatio ?? 0).toFixed(5)} min=${Number(payload.domFrameMinNonBgRatio ?? 0).toFixed(5)}`,
    });
  }
  return {
    ok: issues.length === 0,
    issues,
    codes: issues.map((item) => item.code),
    contentTimeline,
    retroContentProof: payload.retroContentProof || null,
  };
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

function describeLocalImage(filePath, cropBox = null) {
  if (!filePath) return null;
  const payload = Buffer.from(JSON.stringify({ filePath, cropBox }), "utf8").toString("base64");
  const py = `
import base64, json, os
from PIL import Image, ImageChops, ImageStat

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
file_path = payload["filePath"]
crop_box = payload.get("cropBox")
if not os.path.exists(file_path):
    print(json.dumps({"exists": False}))
    raise SystemExit(0)

img = Image.open(file_path).convert("RGB")
if crop_box and len(crop_box) == 4:
    left, top, right, bottom = [max(0, int(v)) for v in crop_box]
    right = min(right, img.size[0])
    bottom = min(bottom, img.size[1])
    if right > left and bottom > top:
        img = img.crop((left, top, right, bottom))

gray = img.convert("L")
contrast = ImageStat.Stat(gray).stddev[0]
mean_brightness = ImageStat.Stat(gray).mean[0]
bg_color = img.getpixel((0, 0))
bg = Image.new("RGB", img.size, bg_color)
diff = ImageChops.difference(img, bg).convert("L")
mask = diff.point(lambda px: 255 if px > 12 else 0)
hist = mask.histogram()
non_bg = hist[255] if len(hist) > 255 else 0
total = img.size[0] * img.size[1]
print(json.dumps({
  "exists": True,
  "width": img.size[0],
  "height": img.size[1],
  "contrast": round(contrast, 3),
  "meanBrightness": round(mean_brightness, 3),
  "nonBgRatio": round((non_bg / total) if total else 0.0, 5),
}))
`;
  return JSON.parse(execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim());
}

function resolveFinalCustomerProofStyle(requestedProofStyle) {
  const normalized = String(requestedProofStyle || "viewport_only").trim() || "viewport_only";
  if (normalized === "viewport_with_slot_inset") {
    return {
      requestedProofStyle: normalized,
      finalProofStyle: "viewport_only",
      auditInsetSuppressed: true,
      proofStyleDowngradeReason: "client_png_must_not_include_audit_inset",
    };
  }
  return {
    requestedProofStyle: normalized,
    finalProofStyle: normalized,
    auditInsetSuppressed: false,
    proofStyleDowngradeReason: null,
  };
}

function evaluateFinalPngSlotAuditResult(payload = {}) {
  const issues = [];
  const finalProofStyle = String(payload.finalProofStyle || "").trim();
  const similarityScore = Number(payload.similarityScore);
  const minSimilarity = Number(payload.minSimilarity ?? 0.82);
  const slotBox = payload.slotBox && typeof payload.slotBox === "object" ? payload.slotBox : null;
  const cropBox = payload.cropBox && typeof payload.cropBox === "object" ? payload.cropBox : null;

  if (finalProofStyle === "viewport_with_slot_inset") {
    issues.push({
      code: "client_png_audit_inset_forbidden",
      detail: "PNG final de cliente nao pode conter inset artificial de auditoria.",
    });
  }
  if (!slotBox || Number(slotBox.width ?? 0) <= 0 || Number(slotBox.height ?? 0) <= 0) {
    issues.push({
      code: "final_png_slot_box_missing",
      detail: "Nao foi possivel localizar a caixa do slot real para auditar o PNG final.",
    });
  }
  if (!cropBox || Number(cropBox.width ?? 0) <= 0 || Number(cropBox.height ?? 0) <= 0) {
    issues.push({
      code: "final_png_slot_crop_missing",
      detail: "Nao foi possivel recortar o slot real dentro do PNG final.",
    });
  }
  if (!Number.isFinite(similarityScore) || similarityScore < minSimilarity) {
    issues.push({
      code: "final_png_slot_pixels_mismatch",
      detail: `similarity=${Number.isFinite(similarityScore) ? similarityScore.toFixed(4) : "n/a"} min=${minSimilarity.toFixed(4)}`,
    });
  }
  return {
    ok: issues.length === 0,
    issues,
    finalProofStyle,
    similarityScore: Number.isFinite(similarityScore) ? Number(similarityScore.toFixed(5)) : null,
    minSimilarity,
    slotBox,
    cropBox,
    comparedTo: payload.comparedTo || "slotPng",
    pixelScale: Number.isFinite(Number(payload.pixelScale)) ? Number(payload.pixelScale) : null,
  };
}

function selectBestFinalPngCreativeIdentityAudit(audits = []) {
  const candidates = (Array.isArray(audits) ? audits : [])
    .filter((audit) => audit && typeof audit === "object")
    .map((audit) => ({
      ...audit,
      referenceFrameIndex: Number.isFinite(Number(audit.referenceFrameIndex))
        ? Number(audit.referenceFrameIndex)
        : null,
    }));
  if (!candidates.length) return null;

  const best = [...candidates].sort((left, right) => {
    if (left.ok === true && right.ok !== true) return -1;
    if (left.ok !== true && right.ok === true) return 1;
    return Number(right.similarityScore ?? -1) - Number(left.similarityScore ?? -1);
  })[0];

  return {
    ...best,
    matchedReferenceFrameIndex: best.referenceFrameIndex,
    referenceCandidates: candidates.map((candidate) => ({
      ok: candidate.ok === true,
      similarityScore: Number.isFinite(Number(candidate.similarityScore))
        ? Number(candidate.similarityScore)
        : null,
      referenceFrameIndex: candidate.referenceFrameIndex,
      issues: Array.isArray(candidate.issues) ? candidate.issues : [],
    })),
  };
}

function buildFinalPngCreativeReferenceFrames(frameSelection = null) {
  if (!frameSelection || typeof frameSelection !== "object") return [];
  const strongFrames = Array.isArray(frameSelection.gifFrameCandidates)
    ? frameSelection.gifFrameCandidates.filter((frame) => frame?.strongCandidate === true && typeof frame?.pngPath === "string")
    : [];
  if (strongFrames.length) return strongFrames;

  const explicitFallbackAllowed = frameSelection.captureOnly === true || frameSelection.frameSelectionDowngraded === true;
  if (!explicitFallbackAllowed || typeof frameSelection.chosenPngPath !== "string") return [];
  return [{
    frameIndex: frameSelection.gifChosenFrameIndex,
    pngPath: frameSelection.chosenPngPath,
  }];
}

function resolveFinalPngSlotAuditBox(finalViewportTargetAudit, creativePlacementAudit) {
  if (finalViewportTargetAudit?.box) return finalViewportTargetAudit.box;
  if (Array.isArray(creativePlacementAudit?.targetInsideBoxes) && creativePlacementAudit.targetInsideBoxes[0]) {
    return creativePlacementAudit.targetInsideBoxes[0];
  }
  return creativePlacementAudit?.slotBox || null;
}

function auditFinalPngSlotPixels(finalPng, referencePng, slotBox, desktopFrameMetadata, options = {}) {
  const chromeFrameHeight = Number(desktopFrameMetadata?.chromeFrameHeight ?? 0);
  const frameWidth = Number(desktopFrameMetadata?.frameTemplateSize?.width ?? 0);
  const viewportWidthCss = Number(options.viewportWidthCss ?? 0);
  const pixelScale = frameWidth > 0 && viewportWidthCss > 0
    ? frameWidth / viewportWidthCss
    : Number(options.pixelScale ?? 1);
  const slotLeft = Number(slotBox?.left ?? NaN);
  const slotTop = Number(slotBox?.top ?? NaN);
  const slotWidth = Number(slotBox?.width ?? NaN);
  const slotHeight = Number(slotBox?.height ?? NaN);
  const minSimilarity = Number(options.minSimilarity ?? 0.82);

  if (![slotLeft, slotTop, slotWidth, slotHeight].every(Number.isFinite) || slotWidth <= 0 || slotHeight <= 0) {
    return evaluateFinalPngSlotAuditResult({
      finalProofStyle: options.finalProofStyle,
      similarityScore: null,
      minSimilarity,
      slotBox,
      cropBox: null,
    });
  }

  const cropBox = {
    left: Math.max(0, Math.round(slotLeft * pixelScale)),
    top: Math.max(0, Math.round(chromeFrameHeight + (slotTop * pixelScale))),
    width: Math.max(1, Math.round(slotWidth * pixelScale)),
    height: Math.max(1, Math.round(slotHeight * pixelScale)),
  };
  const referenceCropBox = options.referenceIsViewport === true
    ? {
        left: cropBox.left,
        top: Math.max(0, Math.round(slotTop * pixelScale)),
        width: cropBox.width,
        height: cropBox.height,
      }
    : null;
  if (frameWidth > 0 && cropBox.left >= frameWidth) {
    return evaluateFinalPngSlotAuditResult({
      finalProofStyle: options.finalProofStyle,
      similarityScore: null,
      minSimilarity,
      slotBox,
      cropBox,
    });
  }

  const payload = Buffer.from(JSON.stringify({ finalPng, referencePng, cropBox, referenceCropBox }), "utf8").toString("base64");
  const py = `
import base64, json, os
from PIL import Image, ImageChops, ImageStat

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
final_path = payload["finalPng"]
reference_path = payload["referencePng"]
crop = payload["cropBox"]
reference_crop = payload.get("referenceCropBox")
if not os.path.exists(final_path) or not os.path.exists(reference_path):
    print(json.dumps({"similarityScore": None, "error": "missing_file"}))
    raise SystemExit(0)

final_img = Image.open(final_path).convert("RGB")
reference_img = Image.open(reference_path).convert("RGB")
left = max(0, int(crop["left"]))
top = max(0, int(crop["top"]))
right = min(final_img.size[0], left + max(1, int(crop["width"])))
bottom = min(final_img.size[1], top + max(1, int(crop["height"])))
if right <= left or bottom <= top:
    print(json.dumps({"similarityScore": None, "error": "empty_crop"}))
    raise SystemExit(0)

final_crop = final_img.crop((left, top, right, bottom))
if reference_crop:
    ref_left = max(0, int(reference_crop["left"]))
    ref_top = max(0, int(reference_crop["top"]))
    ref_right = min(reference_img.size[0], ref_left + max(1, int(reference_crop["width"])))
    ref_bottom = min(reference_img.size[1], ref_top + max(1, int(reference_crop["height"])))
    reference_ref = reference_img.crop((ref_left, ref_top, ref_right, ref_bottom)).resize(final_crop.size)
else:
    reference_ref = reference_img.resize(final_crop.size)
diff = ImageChops.difference(final_crop, reference_ref)
stat = ImageStat.Stat(diff)
mean = sum(stat.mean) / len(stat.mean)
score = max(0.0, 1.0 - (mean / 255.0))
print(json.dumps({
  "similarityScore": round(score, 5),
  "meanAbsDiff": round(mean, 5),
  "finalCropMeanStddev": round(sum(ImageStat.Stat(final_crop).stddev) / 3, 5),
  "finalCropMeanBrightness": round(sum(ImageStat.Stat(final_crop).mean) / 3, 5),
  "cropSize": {"width": final_crop.size[0], "height": final_crop.size[1]},
}))
`;
  let result = {};
  try {
    result = JSON.parse(execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim() || "{}");
  } catch (error) {
    result = {
      similarityScore: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const audit = evaluateFinalPngSlotAuditResult({
    finalProofStyle: options.finalProofStyle,
    similarityScore: result.similarityScore,
    minSimilarity,
    slotBox,
    cropBox,
    comparedTo: options.comparedTo || "referencePng",
    pixelScale,
  });
  const minContentStddev = Number(options.minContentStddev ?? 4);
  const finalCropMeanStddev = Number(result.finalCropMeanStddev ?? NaN);
  if (options.requireUsefulContent !== false && (!Number.isFinite(finalCropMeanStddev) || finalCropMeanStddev < minContentStddev)) {
    audit.issues.push({
      code: "final_png_slot_flat_or_blank",
      detail: `stddev=${Number.isFinite(finalCropMeanStddev) ? finalCropMeanStddev.toFixed(4) : "n/a"} min=${minContentStddev.toFixed(4)}`,
    });
    audit.ok = false;
  }
  return {
    ...audit,
    finalCropMeanStddev: Number.isFinite(finalCropMeanStddev) ? Number(finalCropMeanStddev.toFixed(5)) : null,
    finalCropMeanBrightness: Number.isFinite(Number(result.finalCropMeanBrightness)) ? Number(Number(result.finalCropMeanBrightness).toFixed(5)) : null,
    finalCropMinContentStddev: minContentStddev,
    meanAbsDiff: typeof result.meanAbsDiff === "number" ? result.meanAbsDiff : null,
    cropSize: result.cropSize || null,
    error: result.error || null,
  };
}

function auditFinalPngCreativeIdentityAgainstFrames(finalPng, referenceFrames, slotBox, desktopFrameMetadata, options = {}) {
  const uniqueFrames = [];
  const seenPaths = new Set();
  for (const frame of Array.isArray(referenceFrames) ? referenceFrames : []) {
    const pngPath = typeof frame?.pngPath === "string" ? frame.pngPath : null;
    if (!pngPath || seenPaths.has(pngPath)) continue;
    seenPaths.add(pngPath);
    uniqueFrames.push(frame);
  }
  const missingFrames = uniqueFrames.filter((frame) => !existsSync(frame.pngPath));
  if (missingFrames.length) {
    return {
      ok: false,
      issues: [{
        code: "final_png_creative_reference_missing",
        detail: `Referência(s) forte(s) ausente(s): ${missingFrames.map((frame) => frame.frameIndex ?? "unknown").join(", ")}.`,
      }],
      similarityScore: null,
      matchedReferenceFrameIndex: null,
      referenceCandidates: uniqueFrames.map((frame) => ({
        ok: false,
        similarityScore: null,
        referenceFrameIndex: Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : null,
        missing: !existsSync(frame.pngPath),
        issues: !existsSync(frame.pngPath)
          ? [{ code: "final_png_creative_reference_missing" }]
          : [],
      })),
    };
  }
  const audits = uniqueFrames.map((frame) => ({
    ...auditFinalPngSlotPixels(finalPng, frame.pngPath, slotBox, desktopFrameMetadata, options),
    referenceFrameIndex: Number.isFinite(Number(frame.frameIndex)) ? Number(frame.frameIndex) : null,
  }));
  return selectBestFinalPngCreativeIdentityAudit(audits);
}

function auditFinalPngStickyHeaderPixels(finalPng, desktopFrameMetadata, options = {}) {
  const chromeFrameHeight = Number(desktopFrameMetadata?.chromeFrameHeight ?? 0);
  const frameWidth = Number(desktopFrameMetadata?.frameTemplateSize?.width ?? 0);
  const viewportWidthCss = Number(options.viewportWidthCss ?? 0);
  const pixelScale = frameWidth > 0 && viewportWidthCss > 0
    ? frameWidth / viewportWidthCss
    : Number(options.pixelScale ?? 1);
  const cropHeightCss = Number(options.cropHeightCss ?? 130);
  const minContentStddev = Number(options.minContentStddev ?? 8);
  const cropBox = {
    left: 0,
    top: Math.max(0, Math.round(chromeFrameHeight)),
    width: Math.max(1, Math.round(frameWidth || (viewportWidthCss * pixelScale))),
    height: Math.max(1, Math.round(cropHeightCss * pixelScale)),
  };
  const payload = Buffer.from(JSON.stringify({ finalPng, cropBox }), "utf8").toString("base64");
  const py = `
import base64, json, os
from PIL import Image, ImageStat

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
final_path = payload["finalPng"]
crop = payload["cropBox"]
if not os.path.exists(final_path):
    print(json.dumps({"ok": False, "error": "missing_file"}))
    raise SystemExit(0)
img = Image.open(final_path).convert("RGB")
left = max(0, int(crop["left"]))
top = max(0, int(crop["top"]))
right = min(img.size[0], left + max(1, int(crop["width"])))
bottom = min(img.size[1], top + max(1, int(crop["height"])))
if right <= left or bottom <= top:
    print(json.dumps({"ok": False, "error": "empty_crop"}))
    raise SystemExit(0)
region = img.crop((left, top, right, bottom))
stat = ImageStat.Stat(region)
print(json.dumps({
  "meanStddev": round(sum(stat.stddev) / 3, 5),
  "meanBrightness": round(sum(stat.mean) / 3, 5),
  "cropSize": {"width": region.size[0], "height": region.size[1]},
}))
`;
  let result = {};
  try {
    result = JSON.parse(execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim() || "{}");
  } catch (error) {
    result = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const meanStddev = Number(result.meanStddev ?? NaN);
  const issues = [];
  if (!Number.isFinite(meanStddev) || meanStddev < minContentStddev) {
    issues.push({
      code: "final_png_sticky_header_flat_or_missing",
      detail: `stddev=${Number.isFinite(meanStddev) ? meanStddev.toFixed(4) : "n/a"} min=${minContentStddev.toFixed(4)}`,
    });
  }
  return {
    ok: issues.length === 0,
    skipped: false,
    issues,
    cropBox,
    meanStddev: Number.isFinite(meanStddev) ? Number(meanStddev.toFixed(5)) : null,
    meanBrightness: Number.isFinite(Number(result.meanBrightness)) ? Number(Number(result.meanBrightness).toFixed(5)) : null,
    cropSize: result.cropSize || null,
    error: result.error || null,
  };
}

function auditFinalPngHeaderAdPolicy(finalPng, options = {}) {
  const minBannerCountBeforeLogo = Number(options.minBannerCountBeforeLogo ?? 2);
  const mainHeaderBox = options.headerAdPolicyAudit?.mainHeaderBox || null;
  const frameWidth = Number(options.desktopFrameMetadata?.frameTemplateSize?.width ?? 0);
  const viewportWidthCss = Number(options.viewportWidthCss ?? 0);
  const pixelScale = frameWidth > 0 && viewportWidthCss > 0
    ? frameWidth / viewportWidthCss
    : Number(options.pixelScale ?? 1);
  const chromeFrameHeight = Number(options.desktopFrameMetadata?.chromeFrameHeight ?? 0);
  const searchTop = Number.isFinite(chromeFrameHeight) && chromeFrameHeight > 0
    ? Math.max(0, Math.round(chromeFrameHeight))
    : null;
  const searchBottom = mainHeaderBox && Number.isFinite(Number(mainHeaderBox.top))
    ? Math.max(0, Math.round(chromeFrameHeight + (Number(mainHeaderBox.top) * pixelScale)))
    : null;
  const payload = Buffer.from(JSON.stringify({
    finalPng,
    searchTop,
    searchBottom,
  }), "utf8").toString("base64");
  const py = `
import base64, json, os
from PIL import Image

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
path = payload["finalPng"]
search_top = payload.get("searchTop")
search_bottom = payload.get("searchBottom")
if not os.path.exists(path):
    print(json.dumps({"error": "missing_file", "bannerBands": []}))
    raise SystemExit(0)

img = Image.open(path).convert("RGB")
w, h = img.size
x1 = int(w * 0.06)
x2 = int(w * 0.94)
y1 = int(search_top) if isinstance(search_top, int) and search_top >= 0 else int(h * 0.12)
y2 = int(search_bottom) if isinstance(search_bottom, int) and search_bottom > y1 else min(int(h * 0.44), h)
y2 = min(y2, h)
rows = []
for y in range(y1, y2):
    total = max(1, x2 - x1)
    colored = 0
    for x in range(x1, x2, 3):
        r, g, b = img.getpixel((x, y))
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx < 245 and mx > 35 and (mx - mn) > 26:
            colored += 3
    ratio = colored / total
    if ratio >= 0.055:
        rows.append(y)

bands = []
if rows:
    start = prev = rows[0]
    for y in rows[1:]:
        if y <= prev + 2:
            prev = y
            continue
        bands.append((start, prev))
        start = prev = y
    bands.append((start, prev))

banner_bands = []
for top, bottom in bands:
    if bottom - top < 34:
        continue
    xs = []
    step_y = max(1, (bottom - top) // 12)
    for y in range(top, bottom + 1, step_y):
        for x in range(x1, x2, 3):
            r, g, b = img.getpixel((x, y))
            mx = max(r, g, b)
            mn = min(r, g, b)
            if mx < 245 and mx > 35 and (mx - mn) > 26:
                xs.append(x)
    if not xs:
        continue
    left = min(xs)
    right = max(xs)
    width = right - left + 1
    height = bottom - top + 1
    if width >= max(420, int(w * 0.22)) and height >= 40:
        banner_bands.append({
            "top": top,
            "bottom": bottom,
            "left": left,
            "right": right,
            "width": width,
            "height": height,
        })

print(json.dumps({
    "width": w,
    "height": h,
    "searchTop": y1,
    "searchBottom": y2,
    "bannerBands": banner_bands,
}))
`;
  let result = {};
  try {
    result = JSON.parse(execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim() || "{}");
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error), bannerBands: [] };
  }
  const rawBannerBands = Array.isArray(result.bannerBands) ? result.bannerBands : [];
  const bannerBands = rawBannerBands
    .slice()
    .sort((a, b) => Number(a.top || 0) - Number(b.top || 0))
    .reduce((merged, band) => {
      const current = {
        top: Number(band.top || 0),
        bottom: Number(band.bottom || 0),
        left: Number(band.left || 0),
        right: Number(band.right || 0),
        width: Number(band.width || 0),
        height: Number(band.height || 0),
      };
      const previous = merged[merged.length - 1];
      if (!previous) {
        merged.push(current);
        return merged;
      }
      const verticalGap = current.top - previous.bottom;
      const overlap = Math.max(0, Math.min(previous.right, current.right) - Math.max(previous.left, current.left));
      const minWidth = Math.max(1, Math.min(previous.width, current.width));
      const overlapRatio = overlap / minWidth;
      if (verticalGap <= 120 && overlapRatio >= 0.65) {
        previous.top = Math.min(previous.top, current.top);
        previous.bottom = Math.max(previous.bottom, current.bottom);
        previous.left = Math.min(previous.left, current.left);
        previous.right = Math.max(previous.right, current.right);
        previous.width = previous.right - previous.left + 1;
        previous.height = previous.bottom - previous.top + 1;
        previous.mergedSegments = Number(previous.mergedSegments || 1) + 1;
        return merged;
      }
      merged.push(current);
      return merged;
    }, []);
  const issues = [];
  if (result.error) {
    issues.push({ code: "header_ad_policy_png_error", detail: String(result.error) });
  }
  if (bannerBands.length >= minBannerCountBeforeLogo) {
    issues.push({
      code: "multiple_header_ads_before_logo",
      detail: `visibleHeaderAdBands=${bannerBands.length}`,
    });
  }
  return {
    ok: issues.length === 0,
    issues,
    bannerBands,
    searchRegion: {
      top: Number(result.searchTop ?? 0) || null,
      bottom: Number(result.searchBottom ?? 0) || null,
    },
    imageSize: {
      width: Number(result.width ?? 0) || null,
      height: Number(result.height ?? 0) || null,
    },
  };
}

async function auditHeaderAdPolicy(page, mapping = {}) {
  if (mapping?.domain !== "perrenguematogrosso.com") {
    return { ok: true, issues: [], skipped: true, reason: "not_perrengue" };
  }
  const selectorText = [
    mapping?.slotSelector,
    mapping?.contextSelector,
  ].filter(Boolean).join(" ");
  const groupId = Number(mapping?.groupId || 0);
  const isHeaderSlot = groupId === 1 || groupId === 10 || selectorText.includes("#header-ads-row");
  if (!isHeaderSlot) {
    return { ok: true, issues: [], skipped: true, reason: "not_header_slot" };
  }
  const allowStaticRetroAdInjection = process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION === "1";
  return await page.evaluate(({ allowStaticRetroAdInjection }) => {
    const issues = [];
    const toBox = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
      };
    };
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width >= 48 &&
        rect.height >= 24;
    };
    const isPlaceholderGroup = (node) => node instanceof HTMLElement && (
      node.classList.contains("g-placeholder") ||
      node.matches('[data-cod5-ad-placeholder="1"]') ||
      !!node.closest('[data-cod5-ad-placeholder="1"]')
    );
    const mediaSource = (node) => {
      if (!(node instanceof HTMLElement)) return "";
      if (node instanceof HTMLVideoElement) {
        return node.currentSrc || node.getAttribute("src") || node.querySelector("source")?.getAttribute("src") || "";
      }
      if (node instanceof HTMLIFrameElement) return node.getAttribute("src") || "";
      if (node instanceof HTMLPictureElement) node = node.querySelector("img") || node;
      if (node instanceof HTMLImageElement) {
        return node.getAttribute("data-lazy-src") || node.currentSrc || node.getAttribute("src") || "";
      }
      return "";
    };
    const isRealAdMedia = (node) => {
      if (!isVisible(node)) return false;
      const source = mediaSource(node).trim().toLowerCase();
      if (!source) return false;
      if (source.includes("/assets/perrengue-sublogo.png")) return false;
      if (source.startsWith("data:image/svg+xml")) return false;
      if (/\/(?:transparent|placeholder|spacer)(?:[-_.\/]|$)/.test(source)) return false;
      if (/\.(?:svg)(?:[?#]|$)/.test(source) && /(?:transparent|placeholder|spacer)/.test(source)) return false;
      return true;
    };
    const hasVisibleMedia = (node) => !isPlaceholderGroup(node) && Array.from(node.querySelectorAll("img,video,picture,iframe")).some(isRealAdMedia);
    const mainHeader = document.querySelector("header.perrengue-header") || document.querySelector("#site-header header") || document.querySelector("header");
    if (!(mainHeader instanceof HTMLElement)) {
      return {
        ok: false,
        issues: [{ code: "main_header_not_found", detail: "Nao foi possivel localizar o header principal do Perrengue." }],
      };
    }
    const mainHeaderBox = toBox(mainHeader);
    const headerTop = Number(mainHeaderBox?.top ?? 0);
    const beforeHeaderGroups = Array.from(document.querySelectorAll(".g"))
      .filter((node) => node instanceof HTMLElement && isVisible(node) && hasVisibleMedia(node))
      .map((node) => ({
        node,
        box: toBox(node),
        className: node.className,
        inHeaderAdsRow: !!node.closest("#header-ads-row"),
        inPopupRow: !!node.closest(".perrengue-popup-ads-row"),
        isStaticRetroAd: !!node.closest("[data-adops-static-retro-ad]"),
        isTopGroup: node.classList.contains("g-1"),
        isPopupGroup: node.classList.contains("g-9"),
      }))
      .filter((entry) => entry.inHeaderAdsRow || entry.inPopupRow || entry.isStaticRetroAd)
      .filter((entry) => Number(entry.box?.top ?? 999999) < headerTop);

    const popupRowsBeforeHeader = Array.from(document.querySelectorAll(".perrengue-popup-ads-row"))
      .filter((node) => node instanceof HTMLElement && isVisible(node) && hasVisibleMedia(node) && Number(toBox(node)?.top ?? 999999) < headerTop);
    if (popupRowsBeforeHeader.length > 0) {
      issues.push({
        code: "popup_row_before_header",
        detail: `rows=${popupRowsBeforeHeader.length}`,
      });
    }

    const popupGroupsBeforeHeader = beforeHeaderGroups.filter((entry) => entry.isPopupGroup);
    if (popupGroupsBeforeHeader.length > 0) {
      issues.push({
        code: "popup_group_before_header",
        detail: `groups=${popupGroupsBeforeHeader.length}`,
      });
    }

    if (beforeHeaderGroups.length > 1) {
      issues.push({
        code: "multiple_header_ad_groups_before_logo",
        detail: `groups=${beforeHeaderGroups.length}`,
      });
    }

    const invalidBeforeHeaderGroups = beforeHeaderGroups.filter((entry) => !entry.inHeaderAdsRow || !entry.isTopGroup);
    if (invalidBeforeHeaderGroups.length > 0) {
      issues.push({
        code: "invalid_ad_group_before_logo",
        detail: invalidBeforeHeaderGroups.map((entry) => String(entry.className || "")).join("|"),
      });
    }

    const topGroup = document.querySelector("#header-ads-row .g.g-1");
    if (topGroup instanceof HTMLElement) {
      const visibleChildren = Array.from(topGroup.querySelectorAll(":scope > .g-dyn, :scope > .g-single"))
        .filter((node) => node instanceof HTMLElement && isVisible(node) && hasVisibleMedia(node));
      if (visibleChildren.length > 1) {
        issues.push({
          code: "multiple_top_group_children_visible",
          detail: `visibleChildren=${visibleChildren.length}`,
        });
      }
    }

    const injectedStaticAds = Array.from(document.querySelectorAll("[data-adops-static-retro-ad]"))
      .filter((node) => node instanceof HTMLElement && isVisible(node));
    if (injectedStaticAds.length > 0 && !allowStaticRetroAdInjection) {
      issues.push({
        code: "static_retro_ad_injection_visible",
        detail: `injected=${injectedStaticAds.length}`,
      });
    }

    return {
      ok: issues.length === 0,
      issues,
      mainHeaderBox,
      beforeHeaderGroups: beforeHeaderGroups.map((entry) => ({
        className: String(entry.className || ""),
        box: entry.box,
        inHeaderAdsRow: entry.inHeaderAdsRow,
        isTopGroup: entry.isTopGroup,
        isPopupGroup: entry.isPopupGroup,
      })),
      popupRowsBeforeHeader: popupRowsBeforeHeader.map(toBox).filter(Boolean),
      staticRetroAdInjection: {
        visible: injectedStaticAds.length,
        allowed: allowStaticRetroAdInjection,
      },
    };
  }, { allowStaticRetroAdInjection });
}

async function describeRemoteArtifact(url) {
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") || null,
    sizeBytes: buffer.length,
    sha256: response.ok ? sha256Buffer(buffer) : null,
  };
}

function shouldPersistDiagnosticArtifacts(payload) {
  return payload.diagnosticMode === true ||
    payload.frameSelectionDowngraded === true ||
    payload.errorCode != null ||
    payload.auditStatus === "invalid_audit" ||
    payload.auditStatus === "invalid_url" ||
    payload.probableCause === "compose_mismatch" ||
    payload.probableCause === "upload_or_cache_mismatch" ||
    Number(payload.slotVisibility?.visibleRatio ?? 1) < 0.8;
}

function buildDiagnosticKey(basePath, insertion, isoDate, filePath) {
  const competenciaSlug = slugify(insertion.competencia || "sem-competencia").toUpperCase();
  return `${basePath}/_diagnostics/${competenciaSlug}/${insertion.campanhaId}/${insertion.id}/${isoDate}/${path.basename(filePath)}`;
}

function uploadDiagnosticArtifacts(spacesEnv, args, insertion, isoDate, artifactRecords) {
  const uploaded = {};
  for (const record of Object.values(artifactRecords || {})) {
    if (!record || !record.exists || !record.filePath) continue;
    const key = buildDiagnosticKey(args.spacesBasePath, insertion, isoDate, record.filePath);
    uploaded[record.kind] = uploadToSpaces(spacesEnv, args.spacesBucket, key, record.filePath);
  }
  return uploaded;
}

function buildProofInsetCrop(viewportInfo, slotInfo, viewportTrimBottomPx) {
  if (!viewportInfo?.exists || !slotInfo?.exists) return null;
  const viewportWidth = Number(viewportInfo.width || 0);
  const viewportHeight = Math.max(1, Number(viewportInfo.height || 0) - Number(viewportTrimBottomPx || 0));
  const slotWidth = Number(slotInfo.width || 0);
  const slotHeight = Number(slotInfo.height || 0);
  if (viewportWidth < 1 || viewportHeight < 1 || slotWidth < 1 || slotHeight < 1) return null;
  const frameHeight = 118;
  const insetMaxWidth = Math.floor(viewportWidth * 0.28);
  const insetScale = Math.min(insetMaxWidth / slotWidth, 220 / slotHeight);
  const insetWidth = Math.max(1, Math.floor(slotWidth * insetScale));
  const insetHeight = Math.max(1, Math.floor(slotHeight * insetScale));
  const cardPad = 10;
  const labelHeight = 28;
  const cardWidth = insetWidth + cardPad * 2;
  const cardHeight = insetHeight + cardPad * 2 + labelHeight;
  const cardX = viewportWidth - cardWidth - 22;
  const cardY = viewportHeight + frameHeight - cardHeight - 22;
  return [cardX, cardY, cardX + cardWidth, cardY + cardHeight];
}

function buildArtifactRecord(kind, filePath, metrics, extra = {}) {
  if (!filePath) return null;
  try {
    const buffer = readFileSync(filePath);
    return {
      kind,
      filePath,
      exists: true,
      sizeBytes: buffer.length,
      sha256: sha256Buffer(buffer),
      ...metrics,
      ...extra,
    };
  } catch {
    return {
      kind,
      filePath,
      exists: false,
      ...extra,
    };
  }
}

function determineProbableCause(payload) {
  const errorCode = String(payload.errorCode || "").trim();
  const slot = payload.artifacts?.slot || {};
  const final = payload.artifacts?.final || {};
  const finalInset = payload.artifacts?.finalInset || {};
  const remoteFinal = payload.artifacts?.remoteFinal || {};
  const finalProofStyle = String(payload.finalProofStyle || "").trim();
  const slotVisibleRatio = Number(payload.slotVisibility?.visibleRatio ?? 0);

  if (errorCode === "creative_not_found") {
    return { probableCause: "creative_not_found", confidence: 95, nextAction: "Revisar o mapeamento do slot e confirmar se o criativo correto estava publicado no AdRotate." };
  }
  if (errorCode === "placeholder_only") {
    return { probableCause: "placeholder_only", confidence: 97, nextAction: "O site exibiu placeholder/modelo. Revisar publicação ativa do anúncio antes de recapturar." };
  }
  if (["critical_image_not_loaded", "critical_image_not_painted", "critical_background_not_loaded", "resource_request_failed", "readiness_timeout", "layout_not_stable", "final_viewport_changed"].includes(errorCode)) {
    return { probableCause: "critical_content_not_ready", confidence: 96, nextAction: "Revisar a mídia crítica indicada no readinessAudit e recapturar somente depois que o frame final estiver carregado e pintado." };
  }
  if (errorCode === "capture_legibility_failed" && Number(slot.nonBgRatio ?? 0) < 0.02) {
    return { probableCause: "slot_without_useful_content", confidence: 88, nextAction: "Aguardar um frame melhor ou revisar o criativo/slot porque o banner capturado ficou sem conteúdo útil." };
  }
  if (remoteFinal.ok && remoteFinal.sha256 && final.sha256 && remoteFinal.sha256 !== final.sha256) {
    return { probableCause: "upload_or_cache_mismatch", confidence: 96, nextAction: "Comparar o arquivo local com o objeto publicado no Spaces e invalidar cache antes de reenviar." };
  }
  if (finalProofStyle === "viewport_with_slot_inset" && Number(slot.nonBgRatio ?? 0) >= 0.02 && Number(finalInset.nonBgRatio ?? 0) < 0.01) {
    return { probableCause: "compose_mismatch", confidence: 90, nextAction: "Revisar a composição final do proof; o slot tinha conteúdo, mas a área do inset no PNG final não reteve esse conteúdo." };
  }
  if (slotVisibleRatio > 0 && slotVisibleRatio < 0.8) {
    return { probableCause: "slot_visibility_partial", confidence: 74, nextAction: "Ajustar scroll/crop porque o slot ficou parcialmente visível no viewport final." };
  }
  return { probableCause: null, confidence: 0, nextAction: null };
}

function detectErrorCode(error) {
  const message = String(error?.message || error || "");
  for (const code of ["critical_image_not_loaded", "critical_image_not_painted", "critical_background_not_loaded", "resource_request_failed", "readiness_timeout", "layout_not_stable", "final_viewport_changed"]) {
    if (message.includes(code)) return code;
  }
  if (message.includes("placeholder")) return "placeholder_only";
  if (message.includes("capture_legibility_failed")) return "capture_legibility_failed";
  if (message.includes("capture_audit_failed")) return "capture_audit_failed";
  if (message.includes("slot_position_mismatch")) return "slot_position_mismatch";
  if (message.includes("content_time_mismatch")) return "content_time_mismatch";
  if (message.includes("log_persist_failed")) return "log_persist_failed";
  if (message.includes("Não foi possível identificar o criativo correto")) return "creative_not_found";
  if (message.includes("slot válido")) return "slot_not_found";
  return "capture_failed";
}

function composeDesktopProof(viewportPng, finalPng, opts) {
  const payload = Buffer.from(JSON.stringify({
    viewportPng,
    finalPng,
    opts,
    frameKitDir: WINDOWS_FRAME_KIT_DIR,
    frameFontPath: WINDOWS_FRAME_FONT,
    siteLogosDir: SITE_LOGOS_DIR,
  }), "utf8").toString("base64");
  const py = `
import base64, json
from PIL import Image, ImageDraw, ImageFont

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
viewport_path = payload["viewportPng"]
final_path = payload["finalPng"]
opts = payload["opts"]
frame_kit_dir = payload.get("frameKitDir")
frame_font_path = payload.get("frameFontPath") or ""
site_logos_dir = payload.get("siteLogosDir") or ""

img = Image.open(viewport_path).convert("RGBA")
trim_bottom = int(opts.get("viewportTrimBottomPx") or 0)
if trim_bottom > 0 and trim_bottom < img.size[1]:
    img = img.crop((0, 0, img.size[0], img.size[1] - trim_bottom))
w, h = img.size

chrome_top_path = f"{frame_kit_dir}/chrome-top.png"
taskbar_path = f"{frame_kit_dir}/taskbar.png"
layout_path = f"{frame_kit_dir}/layout.json"
for code, candidate in [
    ("windows_frame_chrome_top_missing", chrome_top_path),
    ("windows_frame_taskbar_missing", taskbar_path),
    ("windows_frame_layout_missing", layout_path),
]:
    try:
        open(candidate, "rb").close()
    except FileNotFoundError:
        raise RuntimeError(f"{code}: {candidate}")
if not frame_font_path:
    raise RuntimeError("windows_frame_font_missing: defina ADOPS_WINDOWS_FRAME_FONT ou mantenha selawik.ttf no kit")
try:
    open(frame_font_path, "rb").close()
except FileNotFoundError:
    raise RuntimeError(f"windows_frame_font_missing: {frame_font_path}")

with open(layout_path, "r", encoding="utf-8") as handle:
    layout = json.load(handle)

frame_theme = "windows11_chrome_real_template"
frame_template_version = str(layout.get("version") or "unknown")
reference_w = int(layout.get("referenceWidth") or 1280)
scale = w / reference_w
chrome_h = max(1, int(round(float(layout.get("chromeTopHeight") or 0) * scale)))
taskbar_h = max(1, int(round(float(layout.get("taskbarHeight") or 0) * scale)))

chrome_top = Image.open(chrome_top_path).convert("RGBA").resize((w, chrome_h))
taskbar = Image.open(taskbar_path).convert("RGBA").resize((w, taskbar_h))
canvas = Image.new("RGBA", (w, h + chrome_h + taskbar_h), (255, 255, 255, 255))
canvas.alpha_composite(chrome_top, (0, 0))
canvas.alpha_composite(img, (0, chrome_h))
canvas.alpha_composite(taskbar, (0, chrome_h + h))
draw = ImageDraw.Draw(canvas)

def text_fit(text, max_w, font):
    text = str(text or "")
    if draw.textlength(text, font=font) <= max_w:
        return text
    ellipsis = "..."
    while text and draw.textlength(text + ellipsis, font=font) > max_w:
        text = text[:-1]
    return text + ellipsis if text else ellipsis

def scaled_rect(rect, y_offset=0):
    return [
        int(round(float(rect[0]) * scale)),
        int(round(float(rect[1]) * scale)) + y_offset,
        int(round(float(rect[2]) * scale)),
        int(round(float(rect[3]) * scale)) + y_offset,
    ]

def draw_dynamic_field(field_name, value):
    field = (layout.get("dynamicFields") or {}).get(field_name) or {}
    if field.get("disabled"):
        return
    rect = field.get("rect")
    if not rect or len(rect) != 4:
        return
    target = field.get("target") or "chrome-top"
    y_offset = chrome_h + h if target == "taskbar" else 0
    x0, y0, x1, y1 = scaled_rect(rect, y_offset)
    clear = tuple(field.get("clearFill") or [255, 255, 255, 255])
    fill = tuple(field.get("fill") or [31, 41, 55, 255])
    font_size = max(8, int(round(float(field.get("fontSize") or 12) * scale)))
    font = ImageFont.truetype(frame_font_path, font_size)
    pad_x = int(round(float(field.get("paddingX") or 0) * scale))
    pad_y = int(round(float(field.get("paddingY") or 0) * scale))
    draw.rectangle([x0, y0, x1, y1], fill=clear)
    draw.text((x0 + pad_x, y0 + pad_y), text_fit(value, max(1, x1 - x0 - pad_x * 2), font), fill=fill, font=font)

def find_site_logo(site_sigla):
    slug = str(site_sigla or "").strip().lower()
    if not slug or not site_logos_dir:
        return None
    for ext in ["png", "webp", "jpg", "jpeg"]:
        candidate = f"{site_logos_dir}/{slug}.{ext}"
        try:
            open(candidate, "rb").close()
            return candidate
        except FileNotFoundError:
            pass
    return None

def draw_tab_identity():
    surface_field = (layout.get("dynamicFields") or {}).get("tabSurface") or {}
    icon_field = (layout.get("dynamicFields") or {}).get("tabIcon") or {}
    title_field = (layout.get("dynamicFields") or {}).get("tabTitle") or {}
    site_sigla = opts.get("siteSigla", "")
    tab_title = str(opts.get("tabTitle") or opts.get("hostLabel") or site_sigla or "").strip()
    title_rendered = bool(tab_title)
    icon_rendered = False
    icon_fallback = False
    surface_rendered = False

    if surface_field.get("rect"):
        sx0, sy0, sx1, sy1 = scaled_rect(surface_field.get("rect"))
        clear = tuple(surface_field.get("clearFill") or [255, 255, 255, 255])
        outline = tuple(surface_field.get("outlineFill") or [218, 224, 232, 255])
        radius = max(4, int(round(float(surface_field.get("radius") or 10) * scale)))
        draw.rounded_rectangle([sx0, sy0, sx1, sy1], radius=radius, fill=clear, outline=outline, width=max(1, int(round(scale))))
        surface_rendered = True

    if icon_field.get("rect"):
        ix0, iy0, ix1, iy1 = scaled_rect(icon_field.get("rect"))
        clear = tuple(icon_field.get("clearFill") or [255, 255, 255, 255])
        draw.rectangle([ix0, iy0, ix1, iy1], fill=clear)
        logo_path = find_site_logo(site_sigla)
        if logo_path:
            try:
                logo = Image.open(logo_path).convert("RGBA")
                logo.thumbnail((max(1, ix1 - ix0), max(1, iy1 - iy0)))
                lx = ix0 + max(0, int(((ix1 - ix0) - logo.size[0]) / 2))
                ly = iy0 + max(0, int(((iy1 - iy0) - logo.size[1]) / 2))
                canvas.alpha_composite(logo, (lx, ly))
                icon_rendered = True
            except Exception:
                icon_rendered = False
        if not icon_rendered:
            icon_fallback = True
            icon_rendered = True
            fill = tuple(icon_field.get("fallbackFill") or [66, 133, 244, 255])
            text_fill = tuple(icon_field.get("fallbackTextFill") or [255, 255, 255, 255])
            font_size = max(8, int(round(float(icon_field.get("fontSize") or 11) * scale)))
            font = ImageFont.truetype(frame_font_path, font_size)
            draw.rounded_rectangle([ix0, iy0, ix1, iy1], radius=max(3, int((ix1 - ix0) / 5)), fill=fill)
            initial = str(site_sigla or tab_title or "?").strip()[:1].upper() or "?"
            bbox = draw.textbbox((0, 0), initial, font=font)
            draw.text((ix0 + ((ix1 - ix0) - (bbox[2] - bbox[0])) / 2, iy0 + ((iy1 - iy0) - (bbox[3] - bbox[1])) / 2 - 1), initial, fill=text_fill, font=font)

    if title_field.get("rect"):
        tx0, ty0, tx1, ty1 = scaled_rect(title_field.get("rect"))
        clear = tuple(title_field.get("clearFill") or [255, 255, 255, 255])
        fill = tuple(title_field.get("fill") or [42, 48, 56, 255])
        font_size = max(8, int(round(float(title_field.get("fontSize") or 14) * scale)))
        font = ImageFont.truetype(frame_font_path, font_size)
        pad_x = int(round(float(title_field.get("paddingX") or 0) * scale))
        pad_y = int(round(float(title_field.get("paddingY") or 0) * scale))
        draw.rectangle([tx0, ty0, tx1, ty1], fill=clear)
        draw.text((tx0 + pad_x, ty0 + pad_y), text_fit(tab_title, max(1, tx1 - tx0 - pad_x * 2), font), fill=fill, font=font)

    return {
        "tabTitleRendered": title_rendered,
        "tabIconRendered": icon_rendered,
        "tabIconFallback": icon_fallback,
        "tabSurfaceRendered": surface_rendered,
    }

date_text = opts.get("systemDateTime", "")
tab_identity = draw_tab_identity()

draw_dynamic_field("addressText", opts.get("addressText", opts.get("hostLabel", "")))
draw_dynamic_field("systemDateTimeInline", date_text)

scroll_metrics = opts.get("scrollMetrics") or {}
try:
    viewport_height_css = float(scroll_metrics.get("viewportHeight") or 0)
    viewport_width_css = float(scroll_metrics.get("viewportWidth") or 0)
    document_height_css = float(scroll_metrics.get("documentHeight") or 0)
    scroll_y_css = max(0.0, float(scroll_metrics.get("scrollY") or 0))
    max_scroll_y_css = max(0.0, float(scroll_metrics.get("maxScrollY") or (document_height_css - viewport_height_css)))
except:
    viewport_height_css = 0.0
    viewport_width_css = 0.0
    document_height_css = 0.0
    scroll_y_css = 0.0
    max_scroll_y_css = 0.0

scrollbar_rendered = False
scrollbar_thumb_top = None
scrollbar_thumb_height = None
if viewport_height_css > 0 and document_height_css > viewport_height_css + 1 and max_scroll_y_css > 0:
    scrollbar = layout.get("scrollbar") or {}
    scale_y = h / viewport_height_css
    scale_x = (w / viewport_width_css) if viewport_width_css > 0 else scale_y
    scrollbar_w = max(8, int(round(float(scrollbar.get("width") or 12) * scale_x)))
    right_inset = max(0, int(round(float(scrollbar.get("rightInset") or 0) * scale_x)))
    track_x0 = max(0, w - scrollbar_w - right_inset)
    track_x1 = w - 1
    track_y0 = chrome_h
    track_y1 = chrome_h + h
    thumb_h = max(int(float(scrollbar.get("minThumbHeight") or 44) * scale_y), int(h * (viewport_height_css / document_height_css)))
    thumb_h = min(thumb_h, max(1, h))
    thumb_y0 = track_y0 + int((h - thumb_h) * min(1.0, scroll_y_css / max_scroll_y_css))
    thumb_y1 = min(track_y1, thumb_y0 + thumb_h)
    scrollbar_rendered = True
    scrollbar_thumb_top = int(thumb_y0)
    scrollbar_thumb_height = int(thumb_y1 - thumb_y0)
    draw.rectangle([track_x0, track_y0, track_x1, track_y1], fill=tuple(scrollbar.get("trackFill") or [246, 247, 249, 230]))
    draw.rounded_rectangle(
        [track_x0 + 2, thumb_y0 + 2, track_x1 - 2, thumb_y1 - 2],
        radius=max(3, int(scrollbar_w / 2)),
        fill=tuple(scrollbar.get("thumbFill") or [127, 132, 142, 235]),
    )

if opts.get("proofStyle") == "viewport_with_slot_inset" and opts.get("slotPng"):
    try:
        slot = Image.open(opts.get("slotPng")).convert("RGBA")
        max_inset_w = max(260, int(w * 0.32))
        max_inset_h = max(120, int(h * 0.22))
        slot.thumbnail((max_inset_w, max_inset_h))
        pad = max(10, int(round(10 * scale)))
        label_h = max(28, int(round(24 * scale)))
        card_w = slot.size[0] + pad * 2
        card_h = slot.size[1] + pad * 2 + label_h
        x0 = max(0, w - card_w - max(18, int(round(18 * scale))))
        y0 = max(chrome_h, chrome_h + h - card_h - max(18, int(round(18 * scale))))
        x1 = x0 + card_w
        y1 = y0 + card_h
        draw.rounded_rectangle([x0, y0, x1, y1], radius=max(8, int(round(8 * scale))), fill=(255,255,255,245), outline=(176, 139, 91, 255), width=max(2, int(round(2 * scale))))
        label_font = ImageFont.truetype(frame_font_path, max(10, int(round(12 * scale))))
        draw.text((x0 + pad, y0 + max(6, int(round(5 * scale)))), "Frame auditado do banner", fill=(90, 64, 37, 255), font=label_font)
        canvas.alpha_composite(slot, (x0 + pad, y0 + label_h + pad // 2))
    except Exception:
        pass

canvas.convert("RGB").save(final_path, "PNG")
print(json.dumps({
    "frameTheme": frame_theme,
    "frameTemplateVersion": frame_template_version,
    "frameTemplateSize": {"width": w, "chromeTopHeight": chrome_h, "taskbarHeight": taskbar_h},
    "frameStrictAssetsOk": True,
    "dynamicFields": ["addressText", "tabSurface", "tabTitle", "tabIcon", "systemDateTimeInline"],
    "chromeTopTheme": "light",
    "tabSurfaceRendered": bool(tab_identity.get("tabSurfaceRendered")),
    "tabTitleRendered": bool(tab_identity.get("tabTitleRendered")),
    "tabIconRendered": bool(tab_identity.get("tabIconRendered")),
    "tabIconFallback": bool(tab_identity.get("tabIconFallback")),
    "chromeFrameHeight": chrome_h,
    "taskbarHeight": taskbar_h,
    "scrollbarRendered": scrollbar_rendered,
    "scrollbarThumbTop": scrollbar_thumb_top,
    "scrollbarThumbHeight": scrollbar_thumb_height,
}, ensure_ascii=True))
`;
  const stdout = execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" });
  try {
    return JSON.parse(stdout.trim() || "{}");
  } catch {
    return {
      frameTheme: "windows11_chrome_real_template",
      frameTemplateVersion: null,
      frameTemplateSize: null,
      frameStrictAssetsOk: null,
      dynamicFields: ["addressText", "tabSurface", "tabTitle", "tabIcon", "systemDateTimeInline"],
      chromeTopTheme: null,
      tabSurfaceRendered: null,
      tabTitleRendered: null,
      tabIconRendered: null,
      tabIconFallback: null,
      chromeFrameHeight: null,
      taskbarHeight: null,
      scrollbarRendered: null,
      scrollbarThumbTop: null,
      scrollbarThumbHeight: null,
    };
  }
}

async function waitForAnimatedBanner(page, selector, waitMs) {
  if (!waitMs || waitMs < 1) return;
  try {
    const box = await page.locator(selector).boundingBox();
    if (box) {
      await page.mouse.move(box.x + Math.min(box.width / 2, 220), box.y + Math.min(box.height / 2, 80));
    }
  } catch {}
  await page.waitForTimeout(waitMs);
}

function analyzeSlotFrameSamples(samplePaths, options = {}) {
  if (!Array.isArray(samplePaths) || !samplePaths.length) {
    return {
      slotStableFrameOk: false,
      slotLegibilityOk: false,
      slotFrameSamples: [],
      slotChosenSampleIndex: null,
      slotMotionScore: null,
      slotTransitionRejected: true,
      slotLegibilityScore: null,
      slotLegibilityReasons: ["Nenhuma amostra do banner foi gerada."],
    };
  }

  const payload = Buffer.from(JSON.stringify({
    samplePaths,
    motionThreshold: Number(options.motionThreshold ?? 7.5),
    minStablePairsAtEnd: Math.max(1, Number(options.minStablePairsAtEnd ?? 2)),
    minStddev: Number(options.minStddev ?? 22),
    minEdgeMean: Number(options.minEdgeMean ?? 12),
    minMidtoneRatio: Number(options.minMidtoneRatio ?? 0.18),
    minIdentityFrameScore: Number(options.minIdentityFrameScore ?? 36),
    minTextEdgeRatio: Number(options.minTextEdgeRatio ?? 0.012),
    preferBestLegibleFrame: options.preferBestLegibleFrame === true,
    resizeWidth: Number(options.resizeWidth ?? 180),
    resizeHeight: Number(options.resizeHeight ?? 96),
  }), "utf8").toString("base64");

  const py = `
import base64, json
from PIL import Image, ImageStat, ImageFilter

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
sample_paths = payload["samplePaths"]
motion_threshold = float(payload["motionThreshold"])
min_stable_pairs_at_end = int(payload["minStablePairsAtEnd"])
min_stddev = float(payload["minStddev"])
min_edge_mean = float(payload["minEdgeMean"])
min_midtone_ratio = float(payload["minMidtoneRatio"])
min_identity_frame_score = float(payload["minIdentityFrameScore"])
min_text_edge_ratio = float(payload["minTextEdgeRatio"])
prefer_best_legible_frame = bool(payload.get("preferBestLegibleFrame"))
resize_width = int(payload["resizeWidth"])
resize_height = int(payload["resizeHeight"])

def frame_info(file_path):
    image = Image.open(file_path).convert("L").resize((resize_width, resize_height))
    stat = ImageStat.Stat(image)
    edge_image = image.filter(ImageFilter.FIND_EDGES)
    edge_mean = ImageStat.Stat(edge_image).mean[0]
    edge_pixels = list(edge_image.getdata())
    text_edge_ratio = sum(1 for px in edge_pixels if px >= 42) / max(len(edge_pixels), 1)
    pixels = list(image.getdata())
    midtones = sum(1 for px in pixels if 28 <= px <= 227)
    identity_frame_score = (
        stat.stddev[0] * 0.55 +
        edge_mean * 1.15 +
        (midtones / max(len(pixels), 1)) * 90.0 +
        text_edge_ratio * 650.0
    )
    return {
        "filePath": file_path,
        "meanBrightness": round(stat.mean[0], 3),
        "stddev": round(stat.stddev[0], 3),
        "edgeMean": round(edge_mean, 3),
        "textEdgeRatio": round(text_edge_ratio, 5),
        "midtoneRatio": round(midtones / max(len(pixels), 1), 5),
        "identityFrameScore": round(identity_frame_score, 3),
        "pixels": pixels,
    }

frames = [frame_info(path) for path in sample_paths]
samples = []
motion_scores = []
for idx, frame in enumerate(frames):
    sample = {
        "index": idx,
        "filePath": frame["filePath"],
        "meanBrightness": frame["meanBrightness"],
        "stddev": frame["stddev"],
        "edgeMean": frame["edgeMean"],
        "textEdgeRatio": frame["textEdgeRatio"],
        "midtoneRatio": frame["midtoneRatio"],
        "identityFrameScore": frame["identityFrameScore"],
    }
    if idx > 0:
        previous = frames[idx - 1]["pixels"]
        current = frame["pixels"]
        diff = sum(abs(a - b) for a, b in zip(previous, current)) / max(len(current), 1)
        stable = diff <= motion_threshold
        motion_scores.append(diff)
        sample["motionFromPrevious"] = round(diff, 4)
        sample["stableFromPrevious"] = stable
    samples.append(sample)

stable_pairs_at_end = 0
for sample in reversed(samples[1:]):
    if sample.get("stableFromPrevious"):
        stable_pairs_at_end += 1
    else:
        break

stable_tail_start = max(0, len(samples) - (stable_pairs_at_end + 1))
stable_tail = samples[stable_tail_start:] if stable_pairs_at_end > 0 else [samples[-1]]
candidate_pool = samples if prefer_best_legible_frame else stable_tail

def legibility_rank(sample):
    return (
        sample["stddev"] * 1.2 +
        sample["edgeMean"] * 1.0 +
        sample["midtoneRatio"] * 100.0
    )

chosen = max(candidate_pool, key=legibility_rank)
legibility_reasons = []
legibility_ok = True
if chosen["stddev"] < min_stddev:
    legibility_ok = False
    legibility_reasons.append(f"stddev baixo: {chosen['stddev']} < {min_stddev}")
if chosen["edgeMean"] < min_edge_mean:
    legibility_ok = False
    legibility_reasons.append(f"edgeMean baixo: {chosen['edgeMean']} < {min_edge_mean}")
if chosen["midtoneRatio"] < min_midtone_ratio:
    legibility_ok = False
    legibility_reasons.append(f"midtoneRatio baixo: {chosen['midtoneRatio']} < {min_midtone_ratio}")
identity_reasons = []
identity_ok = True
if chosen["identityFrameScore"] < min_identity_frame_score:
    identity_ok = False
    identity_reasons.append(f"identityFrameScore baixo: {chosen['identityFrameScore']} < {min_identity_frame_score}")
if chosen["textEdgeRatio"] < min_text_edge_ratio:
    identity_ok = False
    identity_reasons.append(f"textEdgeRatio baixo: {chosen['textEdgeRatio']} < {min_text_edge_ratio}")

stable_ok = stable_pairs_at_end >= min_stable_pairs_at_end
result = {
    "slotStableFrameOk": stable_ok,
    "slotLegibilityOk": legibility_ok and identity_ok,
    "slotFrameSamples": samples,
    "slotChosenSampleIndex": chosen["index"],
    "slotMotionScore": round(motion_scores[-1], 4) if motion_scores else 0.0,
    "slotTransitionRejected": not stable_ok,
    "slotLegibilityScore": {
        "stddev": chosen["stddev"],
        "edgeMean": chosen["edgeMean"],
        "midtoneRatio": chosen["midtoneRatio"],
        "textEdgeRatio": chosen["textEdgeRatio"],
        "identityFrameScore": chosen["identityFrameScore"],
    },
    "identityFrameOk": identity_ok,
    "identityFrameScore": chosen["identityFrameScore"],
    "identityFrameReasons": identity_reasons,
    "slotStableTailStartIndex": stable_tail_start,
    "slotLegibilityReasons": legibility_reasons + identity_reasons,
    "stablePairsAtEnd": stable_pairs_at_end,
    "requiredStablePairsAtEnd": min_stable_pairs_at_end,
    "frameSelectionPolicy": "best_legible_sample" if prefer_best_legible_frame else "stable_tail",
  }
print(json.dumps(result))
`;

  const raw = execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim();
  return JSON.parse(raw);
}

async function captureStableSlotFrame(page, selector, outputPath, options = {}) {
  const sampleCount = Math.max(3, Number(options.sampleCount ?? 4));
  const sampleIntervalMs = Math.max(120, Number(options.sampleIntervalMs ?? 420));
  const samplePaths = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const samplePath = index === sampleCount - 1
      ? outputPath
      : outputPath.replace(/\.png$/i, `-sample-${String(index + 1).padStart(2, "0")}.png`);
    const locator = page.locator(selector).first();
    let captured = false;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await forceMatchedAdVisible(page);
      try {
        await locator.waitFor({ state: "visible", timeout: 4000 });
        await locator.screenshot({ path: samplePath });
        captured = true;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await page.waitForTimeout(250);
      }
    }
    if (!captured) {
      throw new Error(`slot_frame_not_visible: selector=${selector}; ${lastError instanceof Error ? lastError.message : String(lastError || "unknown")}`);
    }
    samplePaths.push(samplePath);
    if (index < sampleCount - 1) {
      await page.waitForTimeout(sampleIntervalMs);
    }
  }

  const analysis = analyzeSlotFrameSamples(samplePaths, options);
  const chosenIndex = Number.isFinite(Number(analysis.slotChosenSampleIndex)) ? Number(analysis.slotChosenSampleIndex) : samplePaths.length - 1;
  const chosenPath = samplePaths[Math.min(Math.max(chosenIndex, 0), samplePaths.length - 1)];

  if (chosenPath && chosenPath !== outputPath) {
    copyFileSync(chosenPath, outputPath);
  }

  for (const samplePath of samplePaths) {
    if (samplePath === outputPath || samplePath === chosenPath) continue;
    try {
      rmSync(samplePath, { force: true });
    } catch {}
  }

  return analysis;
}

function uniqSelectors(selectors = []) {
  return Array.from(new Set(
    selectors
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

async function captureVisibleSelectorScreenshot(page, selectors, outputPath, options = {}) {
  const selectorCandidates = uniqSelectors(selectors);
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  const retryWaitMs = Math.max(80, Number(options.retryWaitMs ?? 260));
  const minVisibleRatio = Number(options.minVisibleRatio ?? 0.05);
  let lastErrorMessage = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const selector of selectorCandidates) {
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (!count) continue;
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 1500 });
      } catch {}

      let isVisibleEnough = false;
      try {
        isVisibleEnough = await locator.evaluate((element, payload) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
          const area = Math.max(rect.width * rect.height, 1);
          const visibleRatio = (visibleWidth * visibleHeight) / area;
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || "1") > 0 &&
            rect.width > 20 &&
            rect.height > 12 &&
            visibleRatio >= Number(payload.minVisibleRatio ?? 0.05);
        }, { minVisibleRatio });
      } catch {
        isVisibleEnough = false;
      }

      if (!isVisibleEnough) continue;
      try {
        await locator.screenshot({ path: outputPath });
        return {
          ok: true,
          selector,
          attempt,
          selectorCandidates,
        };
      } catch (error) {
        lastErrorMessage = String(error?.message || error || "unknown_screenshot_error");
      }
    }

    await page.evaluate(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      window.scrollBy({ top: 140, behavior: "auto" });
      window.scrollBy({ top: -140, behavior: "auto" });
    });
    await page.waitForTimeout(retryWaitMs);
  }

  return {
    ok: false,
    reason: "dom_target_not_visible",
    selectorCandidates,
    lastErrorMessage,
  };
}

function analyzeDomFrameAgainstReference(samplePaths, referencePath, options = {}) {
  if (!Array.isArray(samplePaths) || samplePaths.length === 0) {
    return {
      ok: false,
      reason: "no_dom_samples",
      chosenIndex: null,
      similarityScore: 0,
      similarityOk: false,
      hasUsefulContent: false,
      nonBgRatio: 0,
      minSimilarity: Number(options.minSimilarity ?? 0.82),
      minNonBgRatio: Number(options.minNonBgRatio ?? 0.02),
      samples: [],
    };
  }
  const payload = Buffer.from(JSON.stringify({
    samplePaths,
    referencePath,
    minSimilarity: Number(options.minSimilarity ?? 0.82),
    minNonBgRatio: Number(options.minNonBgRatio ?? 0.02),
    resizeWidth: Number(options.resizeWidth ?? 360),
    resizeHeight: Number(options.resizeHeight ?? 96),
  }), "utf8").toString("base64");

  const py = `
import base64, json
from PIL import Image, ImageStat, ImageChops

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
sample_paths = payload["samplePaths"]
reference_path = payload["referencePath"]
min_similarity = float(payload["minSimilarity"])
min_non_bg_ratio = float(payload["minNonBgRatio"])
resize_width = int(payload["resizeWidth"])
resize_height = int(payload["resizeHeight"])

reference = Image.open(reference_path).convert("RGB").resize((resize_width, resize_height))
ref_gray = reference.convert("L")
ref_pixels = list(ref_gray.getdata())

def non_bg_ratio(rgb):
    bg_color = rgb.getpixel((0, 0))
    bg = Image.new("RGB", rgb.size, bg_color)
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda px: 255 if px > 12 else 0)
    hist = mask.histogram()
    non_bg = hist[255] if len(hist) > 255 else 0
    total = rgb.size[0] * rgb.size[1]
    return (non_bg / total) if total else 0.0

samples = []
for index, file_path in enumerate(sample_paths):
    rgb = Image.open(file_path).convert("RGB").resize((resize_width, resize_height))
    gray = rgb.convert("L")
    pixels = list(gray.getdata())
    mad = sum(abs(a - b) for a, b in zip(ref_pixels, pixels)) / max(len(ref_pixels), 1)
    similarity = max(0.0, 1.0 - (mad / 255.0))
    ratio = non_bg_ratio(rgb)
    stddev = ImageStat.Stat(gray).stddev[0]
    samples.append({
        "index": index,
        "filePath": file_path,
        "similarityScore": round(similarity, 6),
        "nonBgRatio": round(ratio, 6),
        "stddev": round(stddev, 6),
        "passesSimilarity": similarity >= min_similarity,
        "hasUsefulContent": ratio >= min_non_bg_ratio,
    })

strong = [sample for sample in samples if sample["passesSimilarity"] and sample["hasUsefulContent"]]
if strong:
    chosen = max(strong, key=lambda item: (item["similarityScore"], item["nonBgRatio"], item["stddev"]))
else:
    chosen = max(samples, key=lambda item: (item["similarityScore"], item["nonBgRatio"], item["stddev"]))

result = {
    "ok": len(strong) > 0,
    "reason": None if len(strong) > 0 else "dom_reference_mismatch",
    "chosenIndex": chosen["index"],
    "similarityScore": chosen["similarityScore"],
    "similarityOk": chosen["passesSimilarity"],
    "hasUsefulContent": chosen["hasUsefulContent"],
    "nonBgRatio": chosen["nonBgRatio"],
    "minSimilarity": min_similarity,
    "minNonBgRatio": min_non_bg_ratio,
    "samples": samples,
}
print(json.dumps(result))
`;

  const raw = execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim();
  return JSON.parse(raw);
}

async function captureDomSlotFrameAlignedWithReference(page, selector, outputPath, referenceFramePath, options = {}) {
  const sampleCount = Math.max(3, Number(options.sampleCount ?? 6));
  const sampleIntervalMs = Math.max(120, Number(options.sampleIntervalMs ?? 280));
  const samplePaths = [];
  const selectorCandidates = uniqSelectors([
    selector,
    ...(Array.isArray(options.selectorCandidates) ? options.selectorCandidates : []),
  ]);
  for (let index = 0; index < sampleCount; index += 1) {
    const samplePath = outputPath.replace(/\.png$/i, `-dom-sample-${String(index + 1).padStart(2, "0")}.png`);
    const screenshotResult = await captureVisibleSelectorScreenshot(page, selectorCandidates, samplePath, {
      maxAttempts: Number(options.sampleScreenshotMaxAttempts ?? 3),
      retryWaitMs: Number(options.sampleScreenshotRetryWaitMs ?? 240),
      minVisibleRatio: Number(options.minVisibleRatio ?? 0.05),
    });
    if (!screenshotResult.ok) {
      for (const generatedPath of samplePaths) {
        try {
          rmSync(generatedPath, { force: true });
        } catch {}
      }
      return {
        ok: false,
        reason: screenshotResult.reason || "dom_target_not_visible",
        chosenIndex: null,
        similarityScore: null,
        similarityOk: false,
        hasUsefulContent: false,
        nonBgRatio: null,
        minSimilarity: Number(options.minSimilarity ?? 0.82),
        minNonBgRatio: Number(options.minNonBgRatio ?? 0.02),
        selectorCandidates: screenshotResult.selectorCandidates || selectorCandidates,
        lastErrorMessage: screenshotResult.lastErrorMessage || null,
      };
    }
    samplePaths.push(samplePath);
    if (index < sampleCount - 1) {
      await page.waitForTimeout(sampleIntervalMs);
    }
  }
  const existingSamplePaths = samplePaths.filter((samplePath) => existsSync(samplePath));
  if (!existingSamplePaths.length) {
    return {
      ok: false,
      reason: "dom_samples_missing",
      chosenIndex: null,
      similarityScore: null,
      similarityOk: false,
      hasUsefulContent: false,
      nonBgRatio: null,
      minSimilarity: Number(options.minSimilarity ?? 0.82),
      minNonBgRatio: Number(options.minNonBgRatio ?? 0.02),
      selectorCandidates,
      lastErrorMessage: "Nenhuma amostra DOM foi gravada para comparar com o frame de referência.",
    };
  }
  const analysis = analyzeDomFrameAgainstReference(existingSamplePaths, referenceFramePath, options);
  const chosenIndex = Number.isFinite(Number(analysis.chosenIndex)) ? Number(analysis.chosenIndex) : existingSamplePaths.length - 1;
  const chosenPath = existingSamplePaths[Math.min(Math.max(chosenIndex, 0), existingSamplePaths.length - 1)];
  if (chosenPath) {
    copyFileSync(chosenPath, outputPath);
  }
  for (const samplePath of samplePaths) {
    if (samplePath === chosenPath) continue;
    try {
      rmSync(samplePath, { force: true });
    } catch {}
  }
  return analysis;
}

function analyzeGifSourceFrames(gifUrl, outputDir, options = {}) {
  mkdirSync(outputDir, { recursive: true });
  const allowedFrameRanges = Array.isArray(options.allowedFrameRanges)
    ? options.allowedFrameRanges
      .map((range) => Array.isArray(range) ? range.map((value) => Number(value)) : [])
      .filter((range) => range.length === 2 && Number.isFinite(range[0]) && Number.isFinite(range[1]))
      .map(([start, end]) => [Math.max(0, Math.floor(Math.min(start, end))), Math.max(0, Math.floor(Math.max(start, end)))])
    : [];
  const payload = Buffer.from(JSON.stringify({
    gifUrl,
    outputDir,
    minHoldMs: Number(options.minHoldMs ?? 1200),
    bgThreshold: Number(options.bgThreshold ?? 12),
    minNonBgRatio: Number(options.minNonBgRatio ?? 0.02),
    minContrast: Number(options.minContrast ?? 20),
    minIdentityFrameScore: Number(options.minIdentityFrameScore ?? 52),
    minTextEdgeRatio: Number(options.minTextEdgeRatio ?? 0.012),
    sceneTargetOffset: Number(options.sceneTargetOffset ?? 0),
    bestEffortAllowed: options.bestEffortAllowed === true,
    captureOnlyFallbackAllowed: options.captureOnlyFallbackAllowed !== false,
    captureOnlyMinNonBgRatio: Number(options.captureOnlyMinNonBgRatio ?? options.minNonBgRatio ?? 0.02),
    captureOnlyMinContrast: Number(options.captureOnlyMinContrast ?? Math.max(12, Number(options.minContrast ?? 20) * 0.55)),
    syntheticHoldMs: Number(options.syntheticHoldMs ?? options.minHoldMs ?? 1200),
    allowedFrameRanges,
  })).toString("base64");

  const py = `
import base64, json, os, shutil, tempfile, urllib.request, time
from PIL import Image, ImageChops, ImageStat, ImageFile, ImageFilter

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
gif_url = payload["gifUrl"]
output_dir = payload["outputDir"]
min_hold_ms = int(payload["minHoldMs"])
bg_threshold = int(payload["bgThreshold"])
min_non_bg_ratio = float(payload["minNonBgRatio"])
min_contrast = float(payload["minContrast"])
min_identity_frame_score = float(payload["minIdentityFrameScore"])
min_text_edge_ratio = float(payload["minTextEdgeRatio"])
scene_target_offset = int(payload["sceneTargetOffset"])
best_effort_allowed = bool(payload["bestEffortAllowed"])
capture_only_fallback_allowed = bool(payload["captureOnlyFallbackAllowed"])
capture_only_min_non_bg_ratio = float(payload["captureOnlyMinNonBgRatio"])
capture_only_min_contrast = float(payload["captureOnlyMinContrast"])
synthetic_hold_ms = int(payload["syntheticHoldMs"])
allowed_frame_ranges = payload.get("allowedFrameRanges") or []

def frame_is_allowed(index):
    if not allowed_frame_ranges:
        return True
    for start, end in allowed_frame_ranges:
        try:
            if int(start) <= index <= int(end):
                return True
        except Exception:
            pass
    return False

os.makedirs(output_dir, exist_ok=True)
frames_dir = os.path.join(output_dir, "frames")
os.makedirs(frames_dir, exist_ok=True)
gif_path = os.path.join(output_dir, "source.gif")

ImageFile.LOAD_TRUNCATED_IMAGES = True
last_download_error = None
for _attempt in range(3):
    try:
        req = urllib.request.Request(gif_url, headers={
            "User-Agent": "Mozilla/5.0 (AdOpsCapture/1.0)",
            "Accept": "image/gif,*/*;q=0.8",
            "Connection": "close",
            "Cache-Control": "no-cache",
        })
        with urllib.request.urlopen(req, timeout=30) as response:
            payload_bytes = response.read()
        if not payload_bytes or len(payload_bytes) < 1024:
            raise RuntimeError("gif_download_too_small")
        with open(gif_path, "wb") as handle:
            handle.write(payload_bytes)
        break
    except Exception as exc:
        last_download_error = exc
        time.sleep(0.35)
else:
    raise SystemExit(json.dumps({
        "ok": False,
        "error": "gif_download_failed",
        "details": str(last_download_error) if last_download_error else "download_failed"
    }))

image = Image.open(gif_path)
frame_count = getattr(image, "n_frames", 1)
if frame_count <= 1:
    raise SystemExit(json.dumps({
        "ok": False,
        "error": "gif_not_animated",
        "details": "O arquivo encontrado nao possui mais de um frame animado."
    }))

def calc_non_bg_ratio(rgb, threshold):
    bg_color = rgb.getpixel((0, 0))
    bg = Image.new("RGB", rgb.size, bg_color)
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda px: 255 if px > threshold else 0)
    non_bg_pixels = mask.histogram()[255]
    total_pixels = rgb.size[0] * rgb.size[1]
    return non_bg_pixels / total_pixels if total_pixels else 0.0

def avg_hash(rgb, size=8):
    tiny = rgb.convert("L").resize((size, size))
    pixels = list(tiny.getdata())
    avg = sum(pixels) / len(pixels) if pixels else 0
    return "".join("1" if px >= avg else "0" for px in pixels)

def hamming(left, right):
    return sum(1 for a, b in zip(left, right) if a != b)

def calc_identity_metrics(rgb):
    gray = rgb.convert("L")
    stat = ImageStat.Stat(gray)
    edge_image = gray.filter(ImageFilter.FIND_EDGES)
    edge_stat = ImageStat.Stat(edge_image)
    edge_pixels = list(edge_image.getdata())
    text_edge_ratio = sum(1 for px in edge_pixels if px >= 42) / max(len(edge_pixels), 1)
    pixels = list(gray.getdata())
    midtone_ratio = sum(1 for px in pixels if 28 <= px <= 227) / max(len(pixels), 1)
    identity_frame_score = (
        stat.stddev[0] * 0.55 +
        edge_stat.mean[0] * 1.15 +
        midtone_ratio * 90.0 +
        text_edge_ratio * 650.0
    )
    return {
        "edgeMean": edge_stat.mean[0],
        "textEdgeRatio": text_edge_ratio,
        "midtoneRatio": midtone_ratio,
        "identityFrameScore": identity_frame_score,
    }

rows = []
for index in range(frame_count):
    image.seek(index)
    duration_ms = int(image.info.get("duration", 0) or 0)
    rgb = image.convert("RGBA").convert("RGB")
    frame_path = os.path.join(frames_dir, f"frame-{index:03d}.png")
    rgb.save(frame_path)
    gray = rgb.convert("L")
    contrast = ImageStat.Stat(gray).stddev[0]
    non_bg_ratio = calc_non_bg_ratio(rgb, bg_threshold)
    identity_metrics = calc_identity_metrics(rgb)
    identity_ok = (
        identity_metrics["identityFrameScore"] >= min_identity_frame_score and
        identity_metrics["textEdgeRatio"] >= min_text_edge_ratio
    )
    strong = duration_ms >= min_hold_ms and non_bg_ratio >= min_non_bg_ratio and contrast >= min_contrast and identity_ok
    approved = frame_is_allowed(index)
    scene_hash = avg_hash(rgb)
    rows.append({
        "frameIndex": index,
        "durationMs": duration_ms,
        "contrast": round(contrast, 3),
        "nonBgRatio": round(non_bg_ratio, 5),
        "edgeMean": round(identity_metrics["edgeMean"], 3),
        "textEdgeRatio": round(identity_metrics["textEdgeRatio"], 5),
        "midtoneRatio": round(identity_metrics["midtoneRatio"], 5),
        "identityFrameScore": round(identity_metrics["identityFrameScore"], 3),
        "identityFrameOk": identity_ok,
        "approvedFrame": approved,
        "strongCandidate": strong and approved,
        "captureOnlyCandidate": approved and non_bg_ratio >= capture_only_min_non_bg_ratio and contrast >= capture_only_min_contrast and identity_ok,
        "sceneHash": scene_hash,
        "pngPath": frame_path,
        "size": list(rgb.size),
    })

strong_rows = [row for row in rows if row["strongCandidate"]]
capture_only_rows = [row for row in rows if row["captureOnlyCandidate"]]
chosen = None
downgraded = False
downgrade_reason = None
capture_only = False
synthetic_hold_value = None
frame_selection_reason = "strong_hold_frame"
useful_frame_count = len(strong_rows)

if allowed_frame_ranges and len(capture_only_rows) > 1:
    varied = sorted(capture_only_rows, key=lambda row: row["frameIndex"])
    chosen = varied[scene_target_offset % len(varied)]
    capture_only = True
    synthetic_hold_value = synthetic_hold_ms
    frame_selection_reason = "allowed_range_varied_frame_sequence"
    useful_frame_count = len(varied)
elif strong_rows:
    chosen = strong_rows[scene_target_offset % len(strong_rows)]
elif capture_only_fallback_allowed and capture_only_rows:
    ranked = sorted(capture_only_rows, key=lambda row: (
        row["contrast"] * 1.0 +
        row["nonBgRatio"] * 1000.0 +
        min(row["durationMs"], max(min_hold_ms, 1)) / 100.0,
        row["frameIndex"],
    ), reverse=True)
    deduped = []
    for row in ranked:
        if all(hamming(row["sceneHash"], existing["sceneHash"]) >= 8 for existing in deduped):
            deduped.append(row)
    if not deduped:
        deduped = [ranked[0]]
    deduped = sorted(deduped, key=lambda row: row["frameIndex"])
    chosen = deduped[scene_target_offset % len(deduped)]
    capture_only = True
    synthetic_hold_value = synthetic_hold_ms
    frame_selection_reason = "capture_only_short_frame_sequence"
    useful_frame_count = len(deduped)
elif best_effort_allowed and rows:
    chosen = max(rows, key=lambda row: (
        row["contrast"] * 1.0 +
        row["nonBgRatio"] * 1000.0 +
        min(row["durationMs"], max(min_hold_ms, 1)) / 100.0,
        row["frameIndex"],
    ))
    downgraded = True
    downgrade_reason = "no_strong_gif_frame"
    frame_selection_reason = "best_effort_no_strong_frame"
    useful_frame_count = 1
else:
    error_code = "no_capture_only_gif_frame" if capture_only_fallback_allowed else "no_strong_gif_frame"
    raise SystemExit(json.dumps({
        "ok": False,
        "error": error_code,
        "details": "Nenhum frame do GIF passou nos criterios de conteudo visivel e contraste para captura auditavel."
    }))

chosen_output = os.path.join(output_dir, "chosen-frame.png")
shutil.copy2(chosen["pngPath"], chosen_output)

print(json.dumps({
    "ok": True,
    "frameSelectionMode": "gif_source",
    "gifSourceUrl": gif_url,
    "originalGifUrl": gif_url,
    "gifFrameCount": frame_count,
    "gifFrameCandidates": rows,
    "gifAllowedFrameRanges": allowed_frame_ranges,
    "gifStrongFrameCount": len(strong_rows),
    "gifUsefulFrameCount": useful_frame_count,
    "gifChosenFrameIndex": chosen["frameIndex"],
    "gifChosenDurationMs": chosen["durationMs"],
    "gifChosenContrast": chosen["contrast"],
    "gifChosenNonBgRatio": chosen["nonBgRatio"],
    "identityFrameOk": chosen.get("identityFrameOk") is True,
    "identityFrameScore": chosen.get("identityFrameScore"),
    "identityFrameReasons": [] if chosen.get("identityFrameOk") is True else [
        f"identityFrameScore baixo: {chosen.get('identityFrameScore')} < {min_identity_frame_score}",
        f"textEdgeRatio baixo: {chosen.get('textEdgeRatio')} < {min_text_edge_ratio}",
    ],
    "chosenPngPath": chosen_output,
    "captureOnly": capture_only,
    "syntheticHoldMs": synthetic_hold_value,
    "frameSelectionReason": frame_selection_reason,
    "frameSelectionDowngraded": downgraded,
    "frameSelectionDowngradeReason": downgrade_reason,
  }))
`;

  const raw = execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], { stdio: "pipe", encoding: "utf8" }).trim();
  const parsed = JSON.parse(raw);
  if (!parsed.ok) {
    throw new Error(`capture_legibility_failed: GIF sem frame forte suficiente. ${parsed.details || parsed.error || "sem detalhes"}`);
  }
  return parsed;
}

function compactGifFrameCandidates(candidates, chosenIndex, maxItems = 36) {
  if (!Array.isArray(candidates)) return [];
  const chosen = Number.isFinite(Number(chosenIndex)) ? Number(chosenIndex) : null;
  const important = candidates.filter((item) => {
    const index = Number(item?.frameIndex);
    if (!Number.isFinite(index)) return false;
    return index === chosen || index === 0 || index === candidates.length - 1 || index % 30 === 0 || item?.strongCandidate === true;
  });
  const seen = new Set();
  return important
    .filter((item) => {
      const index = Number(item?.frameIndex);
      if (seen.has(index)) return false;
      seen.add(index);
      return true;
    })
    .slice(0, maxItems)
    .map((item) => ({
      frameIndex: item.frameIndex,
          durationMs: item.durationMs,
          contrast: item.contrast,
          nonBgRatio: item.nonBgRatio,
          edgeMean: item.edgeMean,
          textEdgeRatio: item.textEdgeRatio,
          midtoneRatio: item.midtoneRatio,
          identityFrameScore: item.identityFrameScore,
          identityFrameOk: item.identityFrameOk === true,
          approvedFrame: item.approvedFrame === true,
          strongCandidate: item.strongCandidate === true,
          captureOnlyCandidate: item.captureOnlyCandidate === true,
          size: item.size,
    }));
}

function compactMetadataForPersistence(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const readinessAudit = metadata.readinessAudit && typeof metadata.readinessAudit === "object"
    ? metadata.readinessAudit
    : null;
  const compactPixelAudit = (audit) => audit && typeof audit === "object"
    ? {
        ok: audit.ok === true,
        pixelScale: audit.pixelScale ?? null,
        failedElements: Array.isArray(audit.elements)
          ? audit.elements.filter((item) => item?.painted !== true).slice(0, 8)
          : [],
        error: audit.error || null,
      }
    : null;
  return {
    ...metadata,
    contentDateSamples: Array.isArray(metadata.contentDateSamples) ? metadata.contentDateSamples.slice(0, 25) : [],
    editorialSamples: Array.isArray(metadata.editorialSamples) ? metadata.editorialSamples.slice(0, 25) : [],
    dynamicFields: [],
    gifFrameCandidates: [],
    domFrameSamples: [],
    slotFrameSamples: Array.isArray(metadata.slotFrameSamples) ? metadata.slotFrameSamples.slice(0, 8) : [],
    visualAudit: metadata.visualAudit && typeof metadata.visualAudit === "object"
      ? {
          ...metadata.visualAudit,
          slotFrameSamples: Array.isArray(metadata.visualAudit.slotFrameSamples) ? metadata.visualAudit.slotFrameSamples.slice(0, 8) : [],
          gifFrameCandidates: [],
          domFrameSamples: [],
        }
      : metadata.visualAudit,
    readinessAudit: readinessAudit
      ? {
          ...readinessAudit,
          elements: [],
          ignoredLoadedResourceFailures: Array.isArray(readinessAudit.ignoredLoadedResourceFailures)
            ? readinessAudit.ignoredLoadedResourceFailures.slice(0, 8)
            : [],
          pixelAudit: compactPixelAudit(readinessAudit.pixelAudit),
          finalPixelAudit: compactPixelAudit(readinessAudit.finalPixelAudit),
        }
      : readinessAudit,
  };
}

async function collectRetroContentEvidence(page, mapping, captureAt, retroPreview) {
  const configuredCardSelectors = Array.isArray(mapping.auditConfig?.retroContentCardSelectors)
    ? mapping.auditConfig.retroContentCardSelectors
    : [];
  const configuredDateSelectors = Array.isArray(mapping.auditConfig?.retroContentDateSelectors)
    ? mapping.auditConfig.retroContentDateSelectors
    : [];
  const collected = await page.evaluate(async ({ captureAt: cutoff, configuredCardSelectors, configuredDateSelectors, pageType }) => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
    };
    const excluded = (element) => Boolean(element.closest("header,footer,nav,aside [class*='weather'],aside [class*='clima'],[class*='adrotate'],[class*='publicidade'],[data-adops-capture-slot],[role='banner']"));
    const ownEditorialLink = (card) => {
      const links = Array.from(card.querySelectorAll("a[href]"));
      return links.find((link) => {
        try {
          const url = new URL(link.href, window.location.href);
          return url.origin === window.location.origin && !/\/(tag|category|autor|author|wp-admin|wp-json)\//i.test(url.pathname) && url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).length >= 1;
        } catch {
          return false;
        }
      }) || null;
    };
    const dateSelectors = Array.from(new Set([
      ...configuredDateSelectors,
      "[data-adops-retro-post-date]",
      "time[datetime]",
      "[data-datetime]",
      "[data-date]",
      ".entry-date",
      ".posted-on time",
      ".meta-date",
      "time",
    ]));
    const readDate = (card) => {
      for (const selector of dateSelectors) {
        let nodes = [];
        try { nodes = Array.from(card.matches(selector) ? [card] : card.querySelectorAll(selector)); } catch { continue; }
        for (const node of nodes) {
          const values = [
            node.getAttribute?.("data-adops-retro-post-date"),
            node.getAttribute?.("datetime"),
            node.getAttribute?.("data-datetime"),
            node.getAttribute?.("data-date"),
            node.textContent,
          ];
          const value = values.map((item) => String(item || "").trim()).find((item) => /(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})|(\d{1,2}\s+de\s+[a-zA-ZçÇãõáéíóúâêô]+(\s+de)?\s+\d{4})/i.test(item));
          if (value) return value;
        }
      }
      if (pageType !== "article") {
        const cardText = String(card.textContent || "").replace(/\s+/g, " ").trim();
        const textualDate = cardText.match(/(?:\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?|\d{2}\/\d{2}\/\d{4}(?:\s+(?:às\s+)?\d{2}:\d{2})?|\d{1,2}\s+de\s+[a-zA-ZçÇãõáéíóúâêô]+(?:\s+de)?\s+\d{4}(?:\s+(?:às\s+)?\d{2}:\d{2})?)/i);
        if (textualDate) return textualDate[0];
      }
      return null;
    };
    const cardSelectors = pageType === "article"
      ? Array.from(new Set([...configuredCardSelectors, "[data-adops-retro-primary-article='1']"]))
      : Array.from(new Set([
          ...configuredCardSelectors,
          "article",
          "[data-adops-retro-post-date]",
          "[class*='post-card']",
          "[class*='news-card']",
          "[class*='noticia']",
          "[class*='latest'] li",
          "[class*='ultima'] li",
        ]));
    const samples = [];
    const seen = new Set();
    for (const selector of cardSelectors) {
      let cards = [];
      try { cards = Array.from(document.querySelectorAll(selector)); } catch { continue; }
      for (const card of cards) {
        if (!(card instanceof HTMLElement) || !isVisible(card) || excluded(card)) continue;
        const link = ownEditorialLink(card);
        if (!link) continue;
        const url = new URL(link.href, window.location.href).toString();
        const key = new URL(url).pathname.replace(/\/+$/, "") || "/";
        if (seen.has(key)) continue;
        const date = readDate(card);
        if (!date) continue;
        const titleNode = card.querySelector("h1,h2,h3,h4,.entry-title,[class*='title']");
        const title = String(titleNode?.textContent || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240);
        seen.add(key);
        samples.push({ title, url, date, source: selector });
        if (samples.length >= 25) break;
      }
      if (samples.length >= 25) break;
    }

    let expectedPosts = [];
    let expectedSource = null;
    try {
      const before = new Date(cutoff).toISOString();
      const endpoint = new URL("/wp-json/wp/v2/posts", window.location.origin);
      endpoint.searchParams.set("per_page", "25");
      endpoint.searchParams.set("before", before);
      endpoint.searchParams.set("orderby", "date");
      endpoint.searchParams.set("order", "desc");
      endpoint.searchParams.set("_fields", "id,date,link,title");
      const response = await fetch(endpoint.toString(), { cache: "no-store", credentials: "same-origin" });
      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows)) {
          expectedPosts = rows.map((row) => ({
            id: Number(row.id),
            date: String(row.date || ""),
            url: String(row.link || ""),
            title: String(row.title?.rendered || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240),
          })).filter((row) => row.id > 0 && row.url && row.date);
          expectedSource = "wordpress_rest";
        }
      }
    } catch {
      expectedPosts = [];
    }

    const marker = document.querySelector('meta[name="cod5-adops-retro-preview"][content="active"]');
    return {
      editorialSamples: samples,
      expectedPosts,
      expectedSource,
      previewActive: Boolean(marker),
      previewCutoff: marker?.getAttribute("data-cutoff") || null,
    };
  }, {
    captureAt,
    configuredCardSelectors,
    configuredDateSelectors,
    pageType: mapping.page === "article" ? "article" : "home",
  });

  const reconstructed = Boolean(retroPreview && typeof retroPreview === "object" && retroPreview.applied === true);
  if (collected.expectedPosts.length === 0 && reconstructed && Array.isArray(retroPreview.expectedPosts)) {
    collected.expectedPosts = retroPreview.expectedPosts.slice(0, 25);
    collected.expectedSource = "wordpress_admin_api_reconstruction";
  }
  if (
    reconstructed &&
    mapping.page === "article" &&
    retroPreview.articleVerified === true &&
    Array.isArray(retroPreview.expectedPosts) &&
    retroPreview.expectedPosts[0]
  ) {
    const primary = retroPreview.expectedPosts[0];
    collected.editorialSamples = [{
      title: String(primary.title || "").slice(0, 240),
      url: new URL(primary.url || retroPreview.expectedArticlePath, mapping.homeUrl).toString(),
      date: String(primary.date || ""),
      source: "audited_article_reconstruction",
    }];
  }
  const manifest = {
    cutoff: captureAt,
    source: collected.expectedSource,
    reconstructed,
    expectedPosts: collected.expectedPosts,
    visiblePosts: collected.editorialSamples,
  };
  const manifestHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const retroContentProof = evaluateRetroContentProof({
    requestedCaptureAt: captureAt,
    pageType: mapping.page,
    minimumRequired: mapping.page === "article" ? 1 : mapping.auditConfig?.minRetroContentMatches,
    requireSignedPreview: mapping.auditConfig?.requireSignedRetroPreview !== false,
    previewActive: collected.previewActive,
    reconstructed,
    manifestHash,
    editorialSamples: collected.editorialSamples,
    expectedPosts: collected.expectedPosts,
  });
  return { ...collected, manifest, manifestHash, retroContentProof };
}

async function measureSlotVisibility(page, selector) {
  return await page.evaluate((resolvedSelector) => {
    const slot = document.querySelector(resolvedSelector);
    if (!(slot instanceof HTMLElement)) {
      return {
        fullyVisible: false,
        mostlyVisible: false,
        visibleRatio: 0,
      };
    }

    const rect = slot.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const totalArea = Math.max(rect.width * rect.height, 1);
    const visibleArea = visibleWidth * visibleHeight;
    const visibleRatio = visibleArea / totalArea;
    return {
      fullyVisible: visibleRatio >= 0.98,
      mostlyVisible: visibleRatio >= 0.8,
      visibleRatio,
    };
  }, selector);
}

async function measurePageScrollMetrics(page) {
  return await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth || doc.clientWidth || 0;
    const viewportHeight = window.innerHeight || doc.clientHeight || 0;
    const documentHeight = Math.max(
      doc.scrollHeight || 0,
      body?.scrollHeight || 0,
      doc.offsetHeight || 0,
      body?.offsetHeight || 0,
      doc.clientHeight || 0,
    );
    const documentWidth = Math.max(
      doc.scrollWidth || 0,
      body?.scrollWidth || 0,
      doc.offsetWidth || 0,
      body?.offsetWidth || 0,
      doc.clientWidth || 0,
    );
    const scrollY = window.scrollY || doc.scrollTop || body?.scrollTop || 0;
    const scrollX = window.scrollX || doc.scrollLeft || body?.scrollLeft || 0;
    return {
      scrollX,
      scrollY,
      viewportWidth,
      viewportHeight,
      documentWidth,
      documentHeight,
      maxScrollY: Math.max(0, documentHeight - viewportHeight),
      scrollRatioY: documentHeight > viewportHeight
        ? Math.min(1, Math.max(0, scrollY / Math.max(1, documentHeight - viewportHeight)))
        : 0,
    };
  });
}

async function waitForViewportVisuals(page, slotSelector) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 });
  } catch {}

  const stats = await page.evaluate(async (selector) => {
    function isInsideFirstFold(element) {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight + 120;
    }

    function imageReady(img) {
      const absolutize = (value) => {
        if (!value) return value;
        if (value.startsWith("//")) return `${window.location.protocol}${value}`;
        return value;
      };
      const attrs = ["data-lazy-src", "data-src", "data-original", "data-thumb", "data-medium-file", "data-large-file"];
      for (const attr of attrs) {
        const candidate = img.getAttribute(attr);
        if (candidate && (!img.getAttribute("src") || img.getAttribute("src")?.startsWith("data:") || /placeholder|blank/i.test(img.getAttribute("src") || ""))) {
          img.setAttribute("src", absolutize(candidate));
          break;
        }
      }
      const lazySrc = img.getAttribute("data-lazy-src");
      const lazySrcSet = img.getAttribute("data-lazy-srcset");
      const dataSrc = img.getAttribute("data-src");
      const dataSrcSet = img.getAttribute("data-srcset");
      if (lazySrc && (!img.currentSrc || img.currentSrc.startsWith("data:"))) {
        img.setAttribute("src", absolutize(lazySrc));
      }
      if (lazySrcSet && !img.getAttribute("srcset")) {
        img.setAttribute("srcset", absolutize(lazySrcSet).replaceAll(", //", ", https://"));
      }
      if (dataSrc && (!img.getAttribute("src") || img.getAttribute("src")?.startsWith("data:"))) {
        img.setAttribute("src", absolutize(dataSrc));
      }
      if (dataSrcSet && !img.getAttribute("srcset")) {
        img.setAttribute("srcset", absolutize(dataSrcSet).replaceAll(", //", ", https://"));
      }
      const picture = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
      if (picture) {
        picture.querySelectorAll("source").forEach((source) => {
          if (!(source instanceof HTMLSourceElement)) return;
          const candidateSrcset = source.getAttribute("data-srcset") || source.getAttribute("data-lazy-srcset");
          if (candidateSrcset && !source.getAttribute("srcset")) {
            source.setAttribute("srcset", absolutize(candidateSrcset).replaceAll(", //", ", https://"));
          }
        });
      }
      img.setAttribute("loading", "eager");
      img.setAttribute("fetchpriority", "high");
      if (img.closest("[data-src],[data-lazy-src],.lazyload,.lazyloaded") instanceof HTMLElement) {
        img.closest("[data-src],[data-lazy-src],.lazyload,.lazyloaded")?.dispatchEvent(new Event("mouseenter", { bubbles: true }));
      }
      return Boolean(img.complete && img.naturalWidth > 24);
    }

    async function warmImage(img) {
      if (!(img instanceof HTMLImageElement)) return false;
      imageReady(img);
      const src = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-src");
      if (!src) return false;
      const resolved = src.startsWith("//") ? `${window.location.protocol}${src}` : src;
      const srcset = img.getAttribute("srcset") || img.getAttribute("data-lazy-srcset") || img.getAttribute("data-srcset") || "";
      return await new Promise((resolve) => {
        const loader = new Image();
        loader.decoding = "async";
        loader.onload = () => {
          try {
            img.setAttribute("src", resolved);
            if (srcset) img.setAttribute("srcset", srcset.replaceAll(", //", ", https://"));
          } catch {}
          resolve(true);
        };
        loader.onerror = () => resolve(false);
        if (srcset) loader.srcset = srcset.replaceAll(", //", ", https://");
        loader.src = resolved;
      });
    }

    async function backgroundReady(element) {
      const style = window.getComputedStyle(element);
      const match = style.backgroundImage && style.backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/i);
      if (!match?.[1]) return true;
      const src = match[1];
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });
    }

    async function videoReady(video) {
      if (!(video instanceof HTMLVideoElement)) return true;
      try {
        video.preload = "auto";
        video.muted = true;
        if (video.readyState < 2 && video.currentTime < 0.1) {
          video.load();
        }
      } catch {}
      if (video.readyState >= 2) return true;
      if (video.currentTime > 0.2) return true;
      if (!video.paused && video.readyState >= 1) return true;
      const poster = video.getAttribute("poster");
      if (!poster) return false;
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = poster;
      });
    }

    const deadline = Date.now() + 28000;
    while (Date.now() < deadline) {
      const slot = document.querySelector(selector);
      const candidates = Array.from(document.images).filter((img) => {
        if (!(img instanceof HTMLImageElement)) return false;
        if (!isInsideFirstFold(img)) return false;
        return true;
      });
      for (const img of candidates) {
        imageReady(img);
      }

      const slotImages = slot ? Array.from(slot.querySelectorAll("img")) : [];
      slotImages.forEach((img) => {
        if (img instanceof HTMLImageElement) imageReady(img);
      });
      const backgroundCandidates = Array.from(document.querySelectorAll("body *")).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (!isInsideFirstFold(element)) return false;
        const style = window.getComputedStyle(element);
        return Boolean(style.backgroundImage && style.backgroundImage !== "none");
      });
      const pendingViewport = [];
      for (const img of candidates) {
        if (!imageReady(img)) {
          await warmImage(img);
          if (!imageReady(img)) pendingViewport.push(img);
        }
      }
      const pendingSlot = [];
      for (const img of slotImages) {
        if (img instanceof HTMLImageElement && !imageReady(img)) {
          await warmImage(img);
          if (!imageReady(img)) pendingSlot.push(img);
        }
      }
      const pendingBackground = [];
      for (const element of backgroundCandidates) {
        const ok = await backgroundReady(element);
        if (!ok) pendingBackground.push(element);
      }
      const videoCandidates = Array.from(document.querySelectorAll("video")).filter((video) => {
        if (!(video instanceof HTMLVideoElement)) return false;
        if (!isInsideFirstFold(video)) return false;
        return true;
      });
      const pendingVideos = [];
      for (const video of videoCandidates) {
        const ok = await videoReady(video);
        if (!ok) pendingVideos.push(video);
      }

      if (pendingViewport.length === 0 && pendingSlot.length === 0 && pendingBackground.length === 0 && pendingVideos.length === 0) {
        return {
          ok: true,
          viewportImagesTotal: candidates.length,
          viewportImagesLoaded: candidates.length,
          slotImagesTotal: slotImages.length,
          slotImagesLoaded: slotImages.length,
          viewportBackgroundsTotal: backgroundCandidates.length,
          viewportBackgroundsLoaded: backgroundCandidates.length,
          viewportVideosTotal: videoCandidates.length,
          viewportVideosLoaded: videoCandidates.length,
        };
      }

      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      window.scrollBy({ top: 160, behavior: "auto" });
      window.scrollBy({ top: -160, behavior: "auto" });
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
    const candidates = Array.from(document.images).filter((img) => img instanceof HTMLImageElement && isInsideFirstFold(img));
    const slot = document.querySelector(selector);
    const slotImages = slot ? Array.from(slot.querySelectorAll("img")) : [];
    const backgroundCandidates = Array.from(document.querySelectorAll("body *")).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (!isInsideFirstFold(element)) return false;
      const style = window.getComputedStyle(element);
      return Boolean(style.backgroundImage && style.backgroundImage !== "none");
    });
    const videoCandidates = Array.from(document.querySelectorAll("video")).filter((video) => video instanceof HTMLVideoElement && isInsideFirstFold(video));
    const loadedBackgrounds = [];
    for (const element of backgroundCandidates) {
      const ok = await backgroundReady(element);
      if (ok) loadedBackgrounds.push(element);
    }
    const loadedVideos = [];
    for (const video of videoCandidates) {
      const ok = await videoReady(video);
      if (ok) loadedVideos.push(video);
    }
    return {
      ok: false,
      viewportImagesTotal: candidates.length,
      viewportImagesLoaded: candidates.filter((img) => imageReady(img)).length,
      slotImagesTotal: slotImages.length,
      slotImagesLoaded: slotImages.filter((img) => img instanceof HTMLImageElement && imageReady(img)).length,
      viewportBackgroundsTotal: backgroundCandidates.length,
      viewportBackgroundsLoaded: loadedBackgrounds.length,
      viewportVideosTotal: videoCandidates.length,
      viewportVideosLoaded: loadedVideos.length,
    };
  }, slotSelector);

  await page.waitForTimeout(1600);
  return stats;
}

function normalizeStrictReadinessConfig(auditConfig = {}) {
  const selectors = Array.isArray(auditConfig.criticalContentSelectors)
    ? auditConfig.criticalContentSelectors
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => value.trim())
        .slice(0, 12)
    : [];
  return {
    mode: String(auditConfig.readinessMode || "legacy").trim().toLowerCase(),
    criticalContentSelectors: selectors,
    timeoutMs: Math.min(90_000, Math.max(5_000, Number(auditConfig.readinessTimeoutMs ?? 45_000))),
    layoutStableSamples: Math.min(8, Math.max(2, Number(auditConfig.layoutStableSamples ?? 3))),
    layoutStableIntervalMs: Math.min(2_000, Math.max(100, Number(auditConfig.layoutStableIntervalMs ?? 350))),
    captureRetryCount: Math.min(3, Math.max(0, Number(auditConfig.captureRetryCount ?? 2))),
    requirePainted: auditConfig.requireCriticalContentPainted !== false,
    minContentStddev: Math.max(1, Number(auditConfig.criticalContentMinStddev ?? 4)),
  };
}

function auditVisibleMediaPixels(pngPath, elements, options = {}) {
  const payload = JSON.stringify({
    pngPath,
    elements,
    viewportWidthCss: Number(options.viewportWidthCss || 0),
    topOffsetPx: Number(options.topOffsetPx || 0),
    minContentStddev: Number(options.minContentStddev ?? 4),
  });
  const py = `
import json, os, sys
from PIL import Image, ImageStat

payload = json.load(sys.stdin)
path = payload["pngPath"]
if not os.path.exists(path):
    print(json.dumps({"ok": False, "error": "missing_file", "elements": []}))
    raise SystemExit(0)
img = Image.open(path).convert("RGB")
viewport_width = max(1.0, float(payload.get("viewportWidthCss") or img.size[0]))
scale = img.size[0] / viewport_width
top_offset = float(payload.get("topOffsetPx") or 0)
minimum = float(payload.get("minContentStddev") or 4)
results = []
for item in payload.get("elements") or []:
    box = item.get("box") or {}
    left = max(0, int(round(float(box.get("left") or 0) * scale)))
    top = max(0, int(round(float(box.get("top") or 0) * scale + top_offset)))
    width = max(1, int(round(float(box.get("width") or 0) * scale)))
    height = max(1, int(round(float(box.get("height") or 0) * scale)))
    right = min(img.size[0], left + width)
    bottom = min(img.size[1], top + height)
    if right <= left or bottom <= top:
        results.append({**item, "painted": False, "reason": "empty_crop"})
        continue
    crop = img.crop((left, top, right, bottom))
    stat = ImageStat.Stat(crop)
    stddev = sum(stat.stddev) / max(1, len(stat.stddev))
    brightness = sum(stat.mean) / max(1, len(stat.mean))
    painted = stddev >= minimum
    results.append({
      **item,
      "painted": painted,
      "meanStddev": round(stddev, 5),
      "meanBrightness": round(brightness, 5),
      "cropSize": {"width": crop.size[0], "height": crop.size[1]},
      "reason": None if painted else "flat_or_blank",
    })
print(json.dumps({
  "ok": all(item.get("painted") is True for item in results),
  "pixelScale": round(scale, 5),
  "elements": results,
}))
`;
  try {
    return JSON.parse(execFileSync(CAPTURE_PYTHON_BIN, ["-c", py], {
      input: payload,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    }).trim() || "{}");
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elements: [],
    };
  }
}

async function waitForFinalViewportReadiness(page, slotSelector, auditConfig, resourceFailures = []) {
  const config = normalizeStrictReadinessConfig(auditConfig);
  const startedAt = Date.now();
  const deadline = startedAt + config.timeoutMs;
  let lastSnapshot = null;
  let stableCount = 0;
  let attempts = 0;
  const signatureHistory = [];

  while (Date.now() < deadline) {
    attempts += 1;
    const snapshot = await page.evaluate(async ({ selector, criticalSelectors }) => {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const visibleBox = (node) => {
        if (!(node instanceof Element)) return null;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(viewportWidth, rect.right);
        const bottom = Math.min(viewportHeight, rect.bottom);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0) return null;
        if (right - left < 16 || bottom - top < 16) return null;
        return { left, top, width: right - left, height: bottom - top };
      };
      const safeUrl = (value) => {
        try {
          const parsed = new URL(String(value || ""), window.location.href);
          return `${parsed.origin}${parsed.pathname}`;
        } catch {
          return String(value || "").split(/[?#]/)[0];
        }
      };
      const activateImage = async (img) => {
        if (!(img instanceof HTMLImageElement)) return false;
        const current = img.getAttribute("src") || "";
        const lazySrc = img.getAttribute("data-lazy-src") || img.getAttribute("data-src") || img.getAttribute("data-original");
        const lazySrcset = img.getAttribute("data-lazy-srcset") || img.getAttribute("data-srcset");
        img.loading = "eager";
        img.fetchPriority = "high";
        if (lazySrc && (!current || current.startsWith("data:") || /placeholder|blank/i.test(current))) img.src = lazySrc;
        if (lazySrcset && !img.srcset) img.srcset = lazySrcset;
        const picture = img.closest("picture");
        picture?.querySelectorAll("source").forEach((source) => {
          const candidate = source.getAttribute("data-srcset") || source.getAttribute("data-lazy-srcset");
          if (candidate && !source.getAttribute("srcset")) source.setAttribute("srcset", candidate);
        });
        try {
          if (typeof img.decode === "function") await img.decode();
        } catch {}
        if (img.complete && img.naturalWidth > 1 && img.naturalHeight > 1) return true;
        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 1400);
        });
        return Boolean(img.complete && img.naturalWidth > 1 && img.naturalHeight > 1);
      };
      const loadUrl = async (url) => {
        if (!url) return false;
        return await new Promise((resolve) => {
          const image = new Image();
          const done = (value) => resolve(value);
          image.onload = () => done(true);
          image.onerror = () => done(false);
          window.setTimeout(() => done(false), 1800);
          image.src = url;
        });
      };

      let fontsReady = true;
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        fontsReady = document.fonts ? document.fonts.status === "loaded" : true;
      } catch {
        fontsReady = false;
      }

      const explicit = new Set();
      const criticalSelectorAudit = [];
      for (const criticalSelector of criticalSelectors) {
        try {
          const matches = Array.from(document.querySelectorAll(criticalSelector));
          matches.forEach((node) => explicit.add(node));
          criticalSelectorAudit.push({
            selector: criticalSelector,
            matches: matches.length,
            visibleMatches: matches.filter((node) => visibleBox(node)).length,
          });
        } catch {
          criticalSelectorAudit.push({ selector: criticalSelector, matches: 0, visibleMatches: 0 });
        }
      }
      try {
        const slot = document.querySelector(selector);
        if (slot) {
          explicit.add(slot);
          slot.querySelectorAll("img,video,picture,[style*='background-image']").forEach((node) => explicit.add(node));
        }
      } catch {}

      const nodes = new Set(Array.from(document.querySelectorAll("img,video,canvas,iframe,main [class],aside [class],header [class],[style*='background-image']")));
      explicit.forEach((node) => nodes.add(node));
      const elements = [];
      for (const node of nodes) {
        const box = visibleBox(node);
        if (!box) continue;
        const isExplicit = explicit.has(node);
        if (node instanceof HTMLImageElement) {
          const loaded = await activateImage(node);
          const source = safeUrl(node.currentSrc || node.getAttribute("src") || node.getAttribute("data-lazy-src") || node.getAttribute("data-src"));
          if (!source || /perrengue-sublogo\.png$|transparent|spacer/i.test(source)) continue;
          elements.push({ kind: "image", selector: isExplicit ? "critical" : "visible", source, box, loaded, paintRequired: isExplicit || box.width * box.height >= 10000 });
          continue;
        }
        if (node instanceof HTMLVideoElement) {
          node.preload = "auto";
          try { if (node.readyState < 2) node.load(); } catch {}
          const poster = safeUrl(node.poster || "");
          const loaded = node.readyState >= 2 || node.currentTime > 0.2 || (poster ? await loadUrl(poster) : false);
          elements.push({ kind: "video", selector: isExplicit ? "critical" : "visible", source: safeUrl(node.currentSrc || node.querySelector("source")?.getAttribute("src") || poster), box, loaded, paintRequired: false });
          continue;
        }
        if (node instanceof HTMLCanvasElement || node instanceof HTMLIFrameElement) {
          elements.push({
            kind: node instanceof HTMLCanvasElement ? "canvas" : "iframe",
            selector: isExplicit ? "critical" : "visible",
            source: node instanceof HTMLIFrameElement ? safeUrl(node.src) : "canvas",
            box,
            loaded: node instanceof HTMLCanvasElement ? node.width > 1 && node.height > 1 : true,
            paintRequired: isExplicit || box.width * box.height >= 10000,
          });
          continue;
        }
        if (node instanceof HTMLElement) {
          const match = window.getComputedStyle(node).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/i);
          if (!match?.[1]) continue;
          const source = safeUrl(match[1]);
          const loaded = await loadUrl(match[1]);
          elements.push({ kind: "background", selector: isExplicit ? "critical" : "visible", source, box, loaded, paintRequired: isExplicit || box.width * box.height >= 10000 });
        }
      }
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const stableElements = elements.filter((item) => item.selector === "critical");
      const signature = JSON.stringify({
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        viewportWidth,
        viewportHeight,
        boxes: stableElements.map((item) => [item.kind, Math.round(item.box.left), Math.round(item.box.top), Math.round(item.box.width), Math.round(item.box.height)]),
      });
      const viewportSignature = JSON.stringify({
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        viewportWidth,
        viewportHeight,
      });
      const missingCriticalSelectors = criticalSelectorAudit
        .filter((item) => item.matches < 1 || item.visibleMatches < 1)
        .map((item) => item.selector);
      return {
        fontsReady,
        elements,
        signature,
        viewportSignature,
        viewportWidth,
        viewportHeight,
        documentHeight,
        criticalSelectorAudit,
        missingCriticalSelectors,
      };
    }, { selector: slotSelector, criticalSelectors: config.criticalContentSelectors });

    const blockingElements = snapshot.elements.filter((item) => item.paintRequired === true || item.selector === "critical");
    const allLoaded = snapshot.fontsReady &&
      snapshot.missingCriticalSelectors.length === 0 &&
      blockingElements.every((item) => item.loaded === true);
    stableCount = snapshot.signature === lastSnapshot?.signature ? stableCount + 1 : 1;
    signatureHistory.push(snapshot.signature);
    if (signatureHistory.length > 8) signatureHistory.shift();
    lastSnapshot = snapshot;
    if (allLoaded && stableCount >= config.layoutStableSamples) {
      const failedSources = new Set(resourceFailures.map((item) => item.url));
      const criticalFailures = blockingElements.filter((item) => failedSources.has(item.source) && item.loaded !== true);
      const ignoredLoadedResourceFailures = snapshot.elements.filter((item) => failedSources.has(item.source) && item.loaded === true);
      return {
        mode: config.mode,
        attempts,
        elapsedMs: Date.now() - startedAt,
        fontsReady: snapshot.fontsReady,
        layoutStable: true,
        criticalElementsTotal: snapshot.elements.length,
        criticalElementsLoaded: snapshot.elements.filter((item) => item.loaded).length,
        criticalElementsPainted: 0,
        failedResources: criticalFailures,
        ignoredLoadedResourceFailures,
        elements: snapshot.elements,
        viewportWidth: snapshot.viewportWidth,
        signature: snapshot.signature,
        viewportSignature: snapshot.viewportSignature,
        criticalSelectorAudit: snapshot.criticalSelectorAudit,
        missingCriticalSelectors: snapshot.missingCriticalSelectors,
        approved: criticalFailures.length === 0,
      };
    }
    await page.waitForTimeout(config.layoutStableIntervalMs);
  }

  return {
    mode: config.mode,
    attempts,
    elapsedMs: Date.now() - startedAt,
    fontsReady: lastSnapshot?.fontsReady === true,
    layoutStable: false,
    criticalElementsTotal: lastSnapshot?.elements?.length ?? 0,
    criticalElementsLoaded: lastSnapshot?.elements?.filter((item) => item.loaded).length ?? 0,
    criticalElementsPainted: 0,
    failedResources: (lastSnapshot?.elements ?? [])
      .filter((item) => (item.paintRequired === true || item.selector === "critical") && item.loaded !== true)
      .filter((item) => resourceFailures.some((failure) => failure.url === item.source)),
    elements: lastSnapshot?.elements ?? [],
    viewportWidth: lastSnapshot?.viewportWidth ?? 0,
    signature: lastSnapshot?.signature ?? null,
    viewportSignature: lastSnapshot?.viewportSignature ?? null,
    criticalSelectorAudit: lastSnapshot?.criticalSelectorAudit ?? [],
    missingCriticalSelectors: lastSnapshot?.missingCriticalSelectors ?? config.criticalContentSelectors,
    signatureHistory,
    approved: false,
  };
}

async function captureStrictReadinessCandidate(page, viewportPng, slotSelector, auditConfig, resourceFailures = []) {
  const config = normalizeStrictReadinessConfig(auditConfig);
  if (config.mode !== "strict-visible") return null;
  const totalAttempts = config.captureRetryCount + 1;
  const perAttemptTimeoutMs = Math.max(5_000, Math.floor(config.timeoutMs / totalAttempts));
  const attemptAuditConfig = {
    ...auditConfig,
    readinessTimeoutMs: perAttemptTimeoutMs,
  };
  let latest = null;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    latest = await waitForFinalViewportReadiness(page, slotSelector, attemptAuditConfig, resourceFailures);
    latest.attempts = attempt;
    if (latest.approved === true && latest.layoutStable && latest.fontsReady && latest.failedResources.length === 0) {
      await page.screenshot({ path: viewportPng });
      const paintTargets = latest.elements.filter((item) => item.paintRequired === true);
      const pixelAudit = auditVisibleMediaPixels(viewportPng, paintTargets, {
        viewportWidthCss: latest.viewportWidth,
        minContentStddev: config.minContentStddev,
      });
      const after = await page.evaluate(() => JSON.stringify({
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
      latest.pixelAudit = pixelAudit;
      latest.criticalElementsPainted = Array.isArray(pixelAudit.elements)
        ? pixelAudit.elements.filter((item) => item.painted === true).length
        : 0;
      latest.finalViewportChanged = latest.viewportSignature !== after;
      latest.approved = !latest.finalViewportChanged && (!config.requirePainted || pixelAudit.ok === true);
      if (latest.approved) return latest;
    }
    if (attempt <= config.captureRetryCount) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("scroll"));
      });
      await page.waitForTimeout(config.layoutStableIntervalMs * attempt);
    }
  }
  return latest;
}

async function assertStickyHeaderInViewport(page, mapping) {
  if (mapping.auditConfig?.requireStickyHeaderInViewport !== true) {
    return { ok: true, skipped: true };
  }
  await page.evaluate(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(120);
  const audit = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll(
      ".omt-sticky-shell, #site-header, header, .site-header, .main-header, [class*='sticky'][class*='header'], [class*='sticky']",
    ));
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 160 &&
        rect.height >= 36 &&
        rect.bottom > 0 &&
        rect.top < 120;
    };
    const describe = (node) => {
      const rect = node.getBoundingClientRect();
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const hasLogo = !!node.querySelector("img, picture, svg");
      const hasMenu = !!node.querySelector("nav, [class*='menu']");
      const hasDate = /\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}|segunda|terça|quarta|quinta|sexta|sábado|domingo/i.test(text);
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        className: String(node.className || ""),
        id: String(node.id || ""),
        hasLogo,
        hasMenu,
        hasDate,
        text: text.slice(0, 160),
      };
    };
    const allCandidates = candidates.slice(0, 20).map(describe);
    const headers = candidates.filter(visible).map(describe);
    const best = headers.find((header) => header.top <= 4 && (header.hasLogo || header.hasMenu || header.hasDate)) || null;
    return {
      ok: !!best,
      headers,
      allCandidates,
      best,
      scrollY: Math.round(window.scrollY || 0),
      url: window.location.href,
      bodyClass: String(document.body?.className || "").slice(0, 240),
    };
  });
  if (!audit.ok) {
    throw new Error(`capture_audit_failed: sticky_header_not_visible: scrollY=${audit.scrollY}; visibleCandidates=${audit.headers.length}; allCandidates=${JSON.stringify(audit.allCandidates || []).slice(0, 900)}; url=${audit.url}`);
  }
  return audit;
}

async function scrollProofTargetIntoViewport(page, selector, options = {}) {
  if (!selector) return { ok: false, reason: "selector_missing" };
  const viewportOffsetRatio = Number(options.viewportOffsetRatio ?? 0.42);
  try {
    await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 10000 });
  } catch (error) {
    return {
      ok: false,
      reason: "scroll_into_view_failed",
      error: error instanceof Error ? error.message : String(error),
      selector,
    };
  }
  await page.evaluate(({ selector: targetSelector, viewportOffsetRatio: offsetRatio }) => {
    const node = document.querySelector(targetSelector);
    if (!(node instanceof HTMLElement)) return;
    const rect = node.getBoundingClientRect();
    const viewportOffset = Math.round((window.innerHeight || 768) * offsetRatio);
    const top = rect.top + window.scrollY - viewportOffset;
    window.scrollTo({ top: Math.max(top, 0), behavior: "auto" });
  }, { selector, viewportOffsetRatio });
  await page.waitForTimeout(350);
  return await page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector);
    if (!(node instanceof HTMLElement)) return { ok: false, reason: "target_missing", selector: targetSelector };
    const rect = node.getBoundingClientRect();
    return {
      ok: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < (window.innerHeight || 0),
      selector: targetSelector,
      box: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
      },
      scrollY: Math.round(window.scrollY || 0),
    };
  }, selector);
}

async function resolveCaptureSelector(page, selector, attrName, options = {}) {
  const resolved = await page.evaluate(({ selector, attrName, mediaBasename, anchorSelector }) => {
    const nodes = Array.from(document.querySelectorAll(selector)).filter((node) => node instanceof HTMLElement);
    if (!nodes.length) return null;
    const anchor = anchorSelector ? document.querySelector(anchorSelector) : null;

    function collect(node) {
      const values = [];
      const nested = [node].concat(Array.from(node.querySelectorAll("*")));
      for (const current of nested) {
        if (!(current instanceof HTMLElement)) continue;
        const style = current.getAttribute("style");
        if (style) values.push(style);
        const attrs = ["src", "data-lazy-src", "data-src", "srcset", "data-lazy-srcset", "href"];
        for (const attr of attrs) {
          const value = current.getAttribute(attr);
          if (value) values.push(value);
        }
      }
      return values.join(" | ");
    }

    const visible = nodes
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const content = mediaBasename ? collect(node) : "";
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const area = Math.max(rect.width * rect.height, 1);
        const visibleRatio = (visibleWidth * visibleHeight) / area;
        const isVisible = style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 32 &&
          rect.height > 16;
        return {
          index,
          containsMediaBasename: mediaBasename ? content.indexOf(mediaBasename) !== -1 : false,
          containsAnchor: anchor instanceof HTMLElement ? (node === anchor || node.contains(anchor)) : false,
          isVisible,
          visibleRatio,
          area,
          topDistance: Math.abs(rect.top),
        };
      })
      .sort((a, b) => {
        if (Number(b.containsAnchor) !== Number(a.containsAnchor)) {
          return Number(b.containsAnchor) - Number(a.containsAnchor);
        }
        if (Number(b.containsMediaBasename) !== Number(a.containsMediaBasename)) {
          return Number(b.containsMediaBasename) - Number(a.containsMediaBasename);
        }
        if (Number(b.isVisible) !== Number(a.isVisible)) return Number(b.isVisible) - Number(a.isVisible);
        if (b.visibleRatio !== a.visibleRatio) return b.visibleRatio - a.visibleRatio;
        if (b.area !== a.area) return b.area - a.area;
        return a.topDistance - b.topDistance;
      });

    const chosen = visible[0];
    if (!chosen) return null;

    nodes.forEach((node) => node.removeAttribute(attrName));
    nodes[chosen.index].setAttribute(attrName, "1");
    return `[${attrName}="1"]`;
  }, { selector, attrName, mediaBasename: options.mediaBasename || null, anchorSelector: options.anchorSelector || null });

  if (!resolved) {
    throw new Error(`Não foi possível resolver um seletor único para ${selector}.`);
  }

  return resolved;
}

async function resolveVisibleMediaSelector(page, mediaBasename, options = {}) {
  if (!mediaBasename) return null;
  return await page.evaluate(({ basename, anchorSelector }) => {
    Array.from(document.querySelectorAll("[data-adops-capture-media]")).forEach((node) => {
      node.removeAttribute("data-adops-capture-media");
    });
    const anchor = anchorSelector ? document.querySelector(anchorSelector) : null;
    const root = anchor instanceof HTMLElement ? anchor : document;
    const nodes = Array.from(root.querySelectorAll("img, video")).filter((node) => node instanceof HTMLElement);
    const candidates = nodes
      .map((node) => {
        const value =
          node.getAttribute("src") ||
          node.getAttribute("data-src") ||
          node.getAttribute("data-lazy-src") ||
          node.getAttribute("srcset") ||
          node.getAttribute("data-lazy-srcset") ||
          node.getAttribute("poster") ||
          "";
        if (!value || String(value).indexOf(basename) === -1) return null;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const inFooter = Boolean(node.closest("footer, #footer, .footer, [id*='footer' i], [class*='footer' i], [id*='rodape' i], [class*='rodape' i]"));
        const insideMatchedAd = anchor instanceof HTMLElement && (node === anchor || anchor.contains(node));
        const isVisible = style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          (
            insideMatchedAd ||
            (rect.width >= 220 && rect.height >= 48)
          );
        if (!isVisible) return null;
        const area = Math.max(rect.width * rect.height, 1);
        const aspectRatio = rect.height > 0 ? rect.width / rect.height : 0;
        let score = area;
        if (insideMatchedAd) score += 2000000;
        if (inFooter) score -= 900000;
        score -= Math.abs(rect.top - 160) * 180;
        score -= Math.abs(aspectRatio - 7.4) * 1800;
        if (!insideMatchedAd && rect.height > 140) score -= 600000;
        if (!insideMatchedAd && rect.height < 48) score -= 400000;
        if (rect.width > 1200) score -= 180000;
        return { node, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    candidates[0].node.setAttribute("data-adops-capture-media", "1");
    return '[data-adops-capture-media="1"]';
  }, { basename: mediaBasename, anchorSelector: options.anchorSelector || null });
}

function buildReferenceFrameOverlayLayout() {
  return {
    anchor: {
      position: "relative",
      overflow: "hidden",
    },
    overlay: {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
    },
    image: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      objectPosition: "center center",
    },
  };
}

async function applyReferenceFrameToDomMediaInPage({ selector, dataUrl, overlayLayout, lockIntervalMs = 60 }) {
    let node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) {
      return { ok: false, reason: "selector_not_found" };
    }
    const shouldReplaceContainer =
      !(node instanceof HTMLImageElement) &&
      !(node instanceof HTMLVideoElement) &&
      (
        node.classList.contains("g") ||
        node.classList.contains("g-dyn") ||
        node.hasAttribute("data-adops-force-reference-frame")
      );
    if (shouldReplaceContainer) {
      const img = document.createElement("img");
      img.alt = "Publicidade";
      img.decoding = "sync";
      img.loading = "eager";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.opacity = "1";
      img.style.visibility = "visible";
      img.style.filter = "none";
      img.style.transition = "none";
      img.style.animation = "none";
      img.style.transform = "none";
      node.textContent = "";
      node.appendChild(img);
      node = img;
    }
    if (!(node instanceof HTMLImageElement) && !(node instanceof HTMLVideoElement)) {
      const nested = node.querySelector("img, video");
      if (nested instanceof HTMLElement) {
        node = nested;
      } else {
        const img = document.createElement("img");
        img.alt = "Publicidade";
        img.decoding = "sync";
        img.loading = "eager";
        img.style.display = "block";
        img.style.width = "100%";
        img.style.height = "auto";
        node.textContent = "";
        node.appendChild(img);
        node = img;
      }
    }

    const adWrapper = node.closest(".g-dyn");
    let adGroup = null;
    if (adWrapper instanceof HTMLElement) {
      const group = adWrapper.parentElement;
      if (group instanceof HTMLElement) {
        adGroup = group;
        Array.from(group.children).forEach((child) => {
          if (!(child instanceof HTMLElement) || !child.classList.contains("g-dyn")) return;
          if (child === adWrapper) {
            child.style.display = "block";
            child.style.visibility = "visible";
            child.style.opacity = "1";
            child.style.position = "relative";
            child.style.left = "auto";
            child.style.top = "auto";
            child.style.zIndex = "2";
          } else {
            child.style.display = "none";
            child.style.visibility = "hidden";
            child.style.opacity = "0";
          }
        });
      }
    }

    if (node instanceof HTMLImageElement && adGroup instanceof HTMLElement) {
      adGroup.style.setProperty("position", overlayLayout.anchor.position, "important");
      adGroup.style.setProperty("overflow", overlayLayout.anchor.overflow, "important");
      const previousOverlay = adGroup.querySelector(':scope > [data-adops-reference-frame-overlay="1"]');
      if (previousOverlay) previousOverlay.remove();
      const overlay = document.createElement("div");
      overlay.setAttribute("data-adops-reference-frame-overlay", "1");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.setProperty("position", overlayLayout.overlay.position, "important");
      overlay.style.setProperty("inset", overlayLayout.overlay.inset, "important");
      overlay.style.setProperty("z-index", "20", "important");
      overlay.style.setProperty("display", "block", "important");
      overlay.style.setProperty("overflow", overlayLayout.overlay.overflow, "important");
      overlay.style.setProperty("pointer-events", "none", "important");
      const overlayImage = document.createElement("img");
      overlayImage.setAttribute("data-adops-reference-frame-overlay-image", "1");
      overlayImage.alt = "Publicidade";
      overlayImage.decoding = "sync";
      overlayImage.loading = "eager";
      overlayImage.style.setProperty("display", "block", "important");
      overlayImage.style.setProperty("width", overlayLayout.image.width, "important");
      overlayImage.style.setProperty("height", overlayLayout.image.height, "important");
      overlayImage.style.setProperty("object-fit", overlayLayout.image.objectFit, "important");
      overlayImage.style.setProperty("object-position", overlayLayout.image.objectPosition, "important");
      overlay.appendChild(overlayImage);
      adGroup.appendChild(overlay);
      node = overlayImage;
    }

    const referenceFrameAnchor =
      adGroup ||
      node.closest('[data-adops-capture-ad="1"]') ||
      node.parentElement ||
      node;
    const installReferenceFrameLock = (mediaKind) => {
      const enforceReferenceFrame = () => {
        if (!(referenceFrameAnchor instanceof HTMLElement) || !referenceFrameAnchor.isConnected) return;
        let target = referenceFrameAnchor.querySelector('[data-adops-reference-frame-locked="1"]');
        if (!(target instanceof HTMLElement)) {
          target = mediaKind === "video" && node instanceof HTMLVideoElement
            ? node
            : mediaKind === "image" && node instanceof HTMLImageElement
              ? node
              : mediaKind === "video"
                ? referenceFrameAnchor.querySelector("video")
                : referenceFrameAnchor.querySelector("img");
        }
        if (mediaKind === "image" && target instanceof HTMLImageElement) {
          target.setAttribute("data-adops-reference-frame-locked", "1");
          if (target.getAttribute("src") !== dataUrl) target.setAttribute("src", dataUrl);
          target.removeAttribute("srcset");
          target.removeAttribute("data-src");
          target.removeAttribute("data-lazy-src");
          target.removeAttribute("data-srcset");
          target.removeAttribute("data-lazy-srcset");
          target.removeAttribute("loading");
          target.style.setProperty("display", "block", "important");
          target.style.setProperty("opacity", "1", "important");
          target.style.setProperty("visibility", "visible", "important");
          target.style.setProperty("width", overlayLayout.image.width, "important");
          target.style.setProperty("height", overlayLayout.image.height, "important");
          target.style.setProperty("object-fit", overlayLayout.image.objectFit, "important");
          target.style.setProperty("object-position", overlayLayout.image.objectPosition, "important");
          target.style.setProperty("transform", "none", "important");
          target.style.setProperty("transition", "none", "important");
          target.style.setProperty("animation", "none", "important");
        } else if (mediaKind === "video" && target instanceof HTMLVideoElement) {
          target.setAttribute("data-adops-reference-frame-locked", "1");
          if (target.getAttribute("poster") !== dataUrl) target.setAttribute("poster", dataUrl);
          target.style.setProperty("display", "block", "important");
          target.style.setProperty("opacity", "1", "important");
          target.style.setProperty("visibility", "visible", "important");
          target.style.setProperty("transform", "none", "important");
          target.style.setProperty("transition", "none", "important");
          target.style.setProperty("animation", "none", "important");
        }
      };
      enforceReferenceFrame();
      if (window.__adopsReferenceFrameLockInterval) {
        window.clearInterval(window.__adopsReferenceFrameLockInterval);
      }
      window.__adopsReferenceFrameLockInterval = window.setInterval(enforceReferenceFrame, lockIntervalMs);
      return true;
    };

    if (node instanceof HTMLImageElement) {
      node.setAttribute("src", dataUrl);
      node.removeAttribute("srcset");
      node.removeAttribute("data-src");
      node.removeAttribute("data-lazy-src");
      node.removeAttribute("data-srcset");
      node.removeAttribute("data-lazy-srcset");
      node.removeAttribute("loading");
      node.style.opacity = "1";
      node.style.visibility = "visible";
      node.style.display = "block";
      if (node.hasAttribute("data-adops-reference-frame-overlay-image")) {
        node.style.setProperty("width", overlayLayout.image.width, "important");
        node.style.setProperty("height", overlayLayout.image.height, "important");
        node.style.setProperty("object-fit", overlayLayout.image.objectFit, "important");
        node.style.setProperty("object-position", overlayLayout.image.objectPosition, "important");
      } else {
        node.style.width = "100%";
        node.style.height = "auto";
      }
      node.style.filter = "none";
      node.style.transition = "none";
      node.style.animation = "none";
      node.style.transform = "none";
      const referenceFrameLocked = installReferenceFrameLock("image");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = node.getBoundingClientRect();
      return {
        ok: true,
        tag: "IMG",
        width: rect.width,
        height: rect.height,
        adRotateItemFrozen: Boolean(adWrapper instanceof HTMLElement),
        referenceFrameLocked,
      };
    }
    if (node instanceof HTMLVideoElement) {
      node.setAttribute("poster", dataUrl);
      node.style.opacity = "1";
      node.style.visibility = "visible";
      node.style.display = "block";
      node.style.filter = "none";
      node.style.transition = "none";
      node.style.animation = "none";
      const referenceFrameLocked = installReferenceFrameLock("video");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = node.getBoundingClientRect();
      return {
        ok: true,
        tag: "VIDEO",
        width: rect.width,
        height: rect.height,
        adRotateItemFrozen: Boolean(adWrapper instanceof HTMLElement),
        referenceFrameLocked,
      };
    }
    return { ok: false, reason: "unsupported_media_tag", tag: node.tagName };
}

async function applyReferenceFrameToDomMedia(page, selector, pngPath) {
  if (!selector || !pngPath || !existsSync(pngPath)) {
    return { ok: false, reason: "missing_selector_or_frame" };
  }
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
  return await page.evaluate(applyReferenceFrameToDomMediaInPage, {
    selector,
    dataUrl,
    overlayLayout: buildReferenceFrameOverlayLayout(),
  });
}

function isVideoFormat(insertion) {
  const normalized = normalizeFormat(insertion.localFormatoNormalizado || insertion.localFormato || "");
  return normalized.includes("VIDEO") || normalized.includes("PUBLI VIDEO");
}

function isVideoUrl(value) {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(resolveReachableMediaUrl(value) || ""));
}

function isVideoMedia(insertion, mediaUrl = null) {
  return isVideoFormat(insertion) || isVideoUrl(mediaUrl || insertion.mediaUrl || "");
}

function isAnimatedBanner(insertion) {
  return /\.gif(\?|$)/i.test(String(resolveReachableMediaUrl(insertion.mediaUrl) || ""));
}

async function prepareVideoProof(page, adSelector, seed) {
  const result = await page.evaluate(async ({ selector, seed }) => {
    const ad = document.querySelector(selector);
    if (!(ad instanceof HTMLElement)) {
      return { ok: false, reason: "ad_not_found" };
    }

    const video = ad.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      return { ok: false, reason: "video_not_found" };
    }

    const formatTime = (seconds) => {
      const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
      const minutes = Math.floor(safeSeconds / 60);
      const remainder = String(safeSeconds % 60).padStart(2, "0");
      return `${minutes}:${remainder}`;
    };
    const injectProgressOverlay = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration) : 0;
      const currentTime = Number(video.currentTime || 0);
      const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
      const previousOverlay = ad.querySelector("[data-adops-video-overlay='1']");
      if (previousOverlay) previousOverlay.remove();
      const overlay = document.createElement("div");
      overlay.setAttribute("data-adops-video-overlay", "1");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.position = "absolute";
      overlay.style.left = "10px";
      overlay.style.right = "10px";
      overlay.style.bottom = "10px";
      overlay.style.zIndex = "2147483647";
      overlay.style.pointerEvents = "none";
      overlay.style.background = "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.74))";
      overlay.style.color = "#fff";
      overlay.style.font = "600 13px Arial, sans-serif";
      overlay.style.textShadow = "0 1px 2px rgba(0,0,0,.8)";
      overlay.style.padding = "18px 8px 6px";
      overlay.style.borderRadius = "0 0 4px 4px";
      overlay.innerHTML = `
        <div style="height:5px;background:rgba(255,255,255,.42);border-radius:999px;overflow:hidden;margin-bottom:6px;">
          <div style="width:${Math.round(ratio * 100)}%;height:100%;background:#ffffff;border-radius:999px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;gap:6px;"><span style="font-size:14px;">&#9658;</span> ${formatTime(currentTime)}</span>
          <span>${formatTime(duration)}</span>
        </div>
      `;
      const adStyle = window.getComputedStyle(ad);
      if (adStyle.position === "static") ad.style.position = "relative";
      ad.appendChild(overlay);
      return { ratio, overlayInjected: true, progressVisible: true };
    };

    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.muted = true;
    video.volume = 0;
    video.controls = true;
    video.setAttribute("controls", "");
    video.preload = "auto";

    try {
      video.load();
    } catch {}

    const waitForReady = async () => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (video.readyState >= 2) return true;
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      return video.readyState >= 2;
    };

    const ready = await waitForReady();
    let playResolved = false;
    try {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        await Promise.race([
          playAttempt.then(() => {
            playResolved = true;
          }),
          new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
      } else {
        playResolved = true;
      }
    } catch {}

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration) : 0;
    const seedRatio = Math.min(0.92, Math.max(0.08, (Number(seed || 0) % 1000) / 1000));
    const targetSecond = duration > 4
      ? Math.min(duration - 0.75, Math.max(1.5, 1.2 + ((duration - 2.4) * seedRatio)))
      : duration > 0
        ? Math.min(duration - 0.25, Math.max(0.8, duration * seedRatio))
        : 1.8;
    if (ready) {
      try {
        video.currentTime = Math.max(0.5, targetSecond);
      } catch {}
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (Math.abs(Number(video.currentTime || 0) - targetSecond) < 0.35 || video.readyState >= 3) break;
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    try {
      video.pause();
    } catch {}

    const rect = video.getBoundingClientRect();
    const hoverX = rect.left + rect.width / 2;
    const hoverY = rect.top + rect.height / 2;

    const progressState = injectProgressOverlay();

    video.setAttribute("data-adops-video-proof", "1");
    ad.classList.add("adops-video-proof");

    return {
      ok: true,
      hoverX,
      hoverY,
      currentTime: Number(video.currentTime || 0),
      duration: Number(video.duration || 0),
      readyState: Number(video.readyState || 0),
      paused: video.paused,
      playResolved,
      controls: video.controls === true,
      overlayInjected: progressState.overlayInjected === true,
      progressVisible: progressState.progressVisible === true,
      targetTime: Number(targetSecond || 0),
      randomSeed: Number(seed),
      progressRatio: video.duration > 0 ? Number((video.currentTime / video.duration).toFixed(4)) : 0,
    };
  }, { selector: adSelector, seed });

  if (!result.ok) return result;

  await page.mouse.move(result.hoverX, result.hoverY);
  await page.waitForTimeout(300);
  await page.mouse.move(result.hoverX + 1, result.hoverY + 1);
  await page.waitForTimeout(500);

  return result;
}

async function seekVideoProofFrame(page, adSelector, seed, attempt) {
  const result = await page.evaluate(async ({ selector, seed, attempt }) => {
    const ad = document.querySelector(selector);
    if (!(ad instanceof HTMLElement)) return { ok: false, reason: "ad_not_found" };
    const video = ad.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return { ok: false, reason: "video_not_found" };
    const formatTime = (seconds) => {
      const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
      const minutes = Math.floor(safeSeconds / 60);
      const remainder = String(safeSeconds % 60).padStart(2, "0");
      return `${minutes}:${remainder}`;
    };
    const injectProgressOverlay = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration) : 0;
      const currentTime = Number(video.currentTime || 0);
      const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
      const previousOverlay = ad.querySelector("[data-adops-video-overlay='1']");
      if (previousOverlay) previousOverlay.remove();
      const overlay = document.createElement("div");
      overlay.setAttribute("data-adops-video-overlay", "1");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.position = "absolute";
      overlay.style.left = "10px";
      overlay.style.right = "10px";
      overlay.style.bottom = "10px";
      overlay.style.zIndex = "2147483647";
      overlay.style.pointerEvents = "none";
      overlay.style.background = "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.74))";
      overlay.style.color = "#fff";
      overlay.style.font = "600 13px Arial, sans-serif";
      overlay.style.textShadow = "0 1px 2px rgba(0,0,0,.8)";
      overlay.style.padding = "18px 8px 6px";
      overlay.style.borderRadius = "0 0 4px 4px";
      overlay.innerHTML = `
        <div style="height:5px;background:rgba(255,255,255,.42);border-radius:999px;overflow:hidden;margin-bottom:6px;">
          <div style="width:${Math.round(ratio * 100)}%;height:100%;background:#ffffff;border-radius:999px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;gap:6px;"><span style="font-size:14px;">&#9658;</span> ${formatTime(currentTime)}</span>
          <span>${formatTime(duration)}</span>
        </div>
      `;
      const adStyle = window.getComputedStyle(ad);
      if (adStyle.position === "static") ad.style.position = "relative";
      ad.appendChild(overlay);
      return { ratio, overlayInjected: true, progressVisible: true };
    };

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration) : 0;
    if (!duration) return { ok: false, reason: "duration_unavailable" };
    const seedRatio = (Number(seed || 0) % 1000) / 1000;
    const offsets = [0.18, 0.34, 0.52, 0.68, 0.82];
    const ratio = offsets[(Number(attempt || 0) + Math.floor(seedRatio * offsets.length)) % offsets.length] || 0.52;
    const targetSecond = duration > 4
      ? Math.min(duration - 0.75, Math.max(1.25, duration * ratio))
      : Math.min(duration - 0.25, Math.max(0.5, duration * ratio));

    video.controls = true;
    video.setAttribute("controls", "");
    video.muted = true;
    video.pause();
    try {
      video.currentTime = targetSecond;
    } catch {}
    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      if (Math.abs(Number(video.currentTime || 0) - targetSecond) < 0.25 && video.readyState >= 2) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    try {
      video.pause();
    } catch {}
    const progressState = injectProgressOverlay();
    const rect = video.getBoundingClientRect();
    return {
      ok: true,
      hoverX: rect.left + rect.width / 2,
      hoverY: rect.top + rect.height / 2,
      currentTime: Number(video.currentTime || 0),
      duration: Number(video.duration || 0),
      targetTime: Number(targetSecond || 0),
      randomSeed: Number(seed),
      attempt: Number(attempt),
      controls: video.controls === true,
      overlayInjected: progressState.overlayInjected === true,
      progressVisible: progressState.progressVisible === true,
    };
  }, { selector: adSelector, seed, attempt });

  if (result.ok) {
    await page.mouse.move(result.hoverX, result.hoverY);
    await page.waitForTimeout(220);
    await page.mouse.move(result.hoverX + 2, result.hoverY + 2);
    await page.waitForTimeout(260);
  }

  return result;
}

async function main() {
  const { chromium } = loadPlaywright();
  const args = parseArgs(process.argv.slice(2));
  const insertion = await fetchInsertion(args.apiBase, args.insertionId);
  const captureDate = parseCaptureDate(args.captureAt) ?? new Date();

  if (!insertion.mediaUrl) {
    throw new Error(`A inserção ${insertion.id} não tem mediaUrl configurada.`);
  }

  const mapping = await getMapping(insertion, args.apiBase);
  const previewSupported = Boolean(mapping.originIp && mapping.domain && mapping.previewSecret);
  const effectiveCaptureAt = previewSupported ? (args.captureAt || formatCaptureAtForPreview(captureDate)) : args.captureAt;
  const mediaBasename = getMediaBasename(insertion.mediaUrl);
  const { isoDate, titleDate } = getDateLabel(captureDate);
  const allowConfiguredRetroSlotReconstruction = shouldAllowConfiguredRetroSlotReconstruction({
    captureDate: isoDate,
    periodStart: insertion.periodoInicio,
    periodEnd: insertion.periodoFim,
    explicitCaptureAt: Boolean(args.captureAt),
    reconstructionReason: args.reconstructionReason,
  });
  const portalRetroPreviewOptions = {
    allowReconstruction: allowConfiguredRetroSlotReconstruction,
  };
  const staticRetroAdOptions = {
    allowConfiguredSlotReconstruction: allowConfiguredRetroSlotReconstruction,
    reconstructionReason: args.reconstructionReason,
  };
  const reconstruction = args.reconstructionReason === "late_publication_recovery"
    ? {
        reason: "late_publication_recovery",
        contractedDate: isoDate,
        reconstructedAt: new Date().toISOString(),
        mediaUrl: insertion.mediaUrl,
        mediaSha256: (mediaBasename.match(/(?:^|[-_])([a-f0-9]{64})(?:\.|[-_]|$)/i) || [])[1]?.toLowerCase() || null,
      }
    : null;

  const generatedPrintsRoot = process.env.ADOPS_GENERATED_PRINTS_ROOT || path.join(process.cwd(), "tmp/generated-prints");
  const outDir = args.candidateOnly
    ? path.join(
        generatedPrintsRoot,
        "candidates",
        slugify(args.runnerJobId || args.jobId || String(Date.now())),
        isoDate,
        String(insertion.id),
      )
    : path.join(generatedPrintsRoot, isoDate, String(insertion.id));
  mkdirSync(outDir, { recursive: true });

  const slotPng = path.join(outDir, `${isoDate}-slot.png`);
  const contextPng = path.join(outDir, `${isoDate}-context.png`);
  const viewportPng = path.join(outDir, `${isoDate}-viewport.png`);
  const finalPng = path.join(outDir, `${isoDate}-proof.png`);
  const metaJson = path.join(outDir, `${isoDate}-meta.json`);
  for (const artifactPath of [slotPng, contextPng, viewportPng, finalPng, metaJson]) {
    rmSync(artifactPath, { force: true });
  }
  const trace = createStageRecorder();
  const artifactRecords = {};
  let logId = null;
  let finalProofStyle = null;
  let publicUrl = null;
  let remoteFinal = null;
  let auditStatus = null;
  let spacesEnv = null;
  let resolvedSlotSelector = null;
  let resolvedContextSelector = null;
  let resolvedMediaSelector = null;
  let match = null;
  let targetUrl = null;
  let lastMatchFailure = null;
  let lastSelectorFailure = null;
  let frameSelection = null;
  let visualAudit = null;
  let readinessAudit = null;
  let finalReadinessAudit = null;
  let creativePlacementAudit = null;
  let headerAdPolicyAudit = null;
  let finalPngHeaderAdPolicyAudit = null;
  let finalPngStickyHeaderAudit = null;
  let finalViewportTargetAudit = null;
  let stickyHeaderViewportAudit = null;
  let slotVisibility = null;
  let pageScrollMetrics = null;
  let domMediaPatch = null;
  let pageDateObserved = null;
  let pageDateText = null;
  let systemDateTime = null;
  let metadata = null;
  let contentDateSamples = [];
  let editorialSamples = [];
  let retroContentManifest = null;
  let retroContentProof = null;
  let retroGate = null;
  let retroPreview = null;
  let pendingLogFlush = { flushed: 0, kept: 0 };
  let logPersistence = { status: "skipped", queued: false, error: null };

  const launchOptions = { headless: true };
  const chromeExecutable = process.env.ADOPS_CHROME_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "";
  if (chromeExecutable) {
    launchOptions.executablePath = chromeExecutable;
  }
  const disableOriginOverride = process.env.ADOPS_CAPTURE_DISABLE_ORIGIN_OVERRIDE === "1" || Boolean(mapping.disableOriginOverride);
  if (effectiveCaptureAt && mapping.originIp && mapping.domain && !disableOriginOverride) {
    launchOptions.args = [
      `--host-resolver-rules=MAP ${mapping.domain} ${mapping.originIp}`,
    ];
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 2 });
  const resourceFailures = [];
  const recordResourceFailure = (url, resourceType, status, reason) => {
    if (!url || !["image", "media", "font"].includes(resourceType)) return;
    let sanitizedUrl = String(url).split(/[?#]/)[0];
    try {
      const parsed = new URL(url);
      sanitizedUrl = `${parsed.origin}${parsed.pathname}`;
    } catch {}
    if (resourceFailures.some((item) => item.url === sanitizedUrl && item.status === status && item.reason === reason)) return;
    resourceFailures.push({ url: sanitizedUrl, resourceType, status, reason });
  };
  page.on("requestfailed", (request) => {
    recordResourceFailure(request.url(), request.resourceType(), null, request.failure()?.errorText || "request_failed");
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    recordResourceFailure(response.url(), request.resourceType(), response.status(), `http_${response.status()}`);
  });

  try {
    const internalCaptureToken = process.env.ADOPS_CAPTURE_API_TOKEN || process.env.ADOPS_INTERNAL_API_TOKEN || "";
    if (args.saveEvidence && args.apiBase && internalCaptureToken) {
      try {
        pendingLogFlush = await flushPendingCaptureLogs();
      } catch (error) {
        pendingLogFlush = {
          flushed: 0,
          kept: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const signedRetroPreviewRequired = Boolean(effectiveCaptureAt && mapping.auditConfig?.requireSignedRetroPreview !== false);
    const previewSignature = args.previewSignature || signPreviewCapture(effectiveCaptureAt, mapping.previewSecret);
    if (signedRetroPreviewRequired && !previewSignature) {
      throw new Error("retro_preview_not_active: não foi possível assinar a captura retroativa");
    }
    const pageResolvedStage = trace.start("page_resolved");
    const candidateUrls = await resolvePageUrls(page, mapping, { captureAt: effectiveCaptureAt, previewSignature });
    trace.finish(pageResolvedStage, "ok", {
      candidateCount: candidateUrls.length,
      captureAt: effectiveCaptureAt,
      previewSupported,
      signedPreviewRequired: signedRetroPreviewRequired,
    });
    await page.setExtraHTTPHeaders({
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    });

    for (const originalCandidateUrl of candidateUrls) {
      const candidateUrl = appendCaptureRetryQuery(originalCandidateUrl, args.captureAttempt);
      try {
        await page.goto(candidateUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        const articleCandidateAudit = await auditArticleCandidatePage(page, mapping);
        if (!articleCandidateAudit.ok) {
          throw new Error(`article_candidate_rejected:${articleCandidateAudit.reason}:${articleCandidateAudit.currentUrl}`);
        }
        await dismissCookieConsent(page, mapping);
        await dismissBlockingOverlays(page, { preserveBottomPopup: shouldPreserveBottomPopupForCapture(mapping) });
        await freezePreviewDatestamp(page, mapping.pageDateSelectors, effectiveCaptureAt, mapping.domain);
        retroPreview = await applyPortalRetroPreview(page, mapping, effectiveCaptureAt, portalRetroPreviewOptions) || retroPreview;
        await applyPerrengueStaticRetroAd(page, mapping, insertion.mediaUrl, mediaBasename, staticRetroAdOptions);
        await page.waitForSelector(mapping.slotSelector, { state: "attached", timeout: 12000 });
        await page.waitForTimeout(2500);
        await dismissCookieConsent(page, mapping);
        await dismissBlockingOverlays(page, { preserveBottomPopup: shouldPreserveBottomPopupForCapture(mapping, resolvedSlotSelector, resolvedContextSelector) });
        await freezePreviewDatestamp(page, mapping.pageDateSelectors, effectiveCaptureAt, mapping.domain);
        retroPreview = await applyPortalRetroPreview(page, mapping, effectiveCaptureAt, portalRetroPreviewOptions) || retroPreview;
        await applyPerrengueStaticRetroAd(page, mapping, insertion.mediaUrl, mediaBasename, staticRetroAdOptions);
        const candidateMatch = await findCreativeMatch(page, mapping.slotSelector, mediaBasename, insertion.mediaUrl);
        if (candidateMatch.ok) {
          targetUrl = candidateUrl;
          resolvedMediaSelector = await resolveVisibleMediaSelector(page, mediaBasename, {
            anchorSelector: candidateMatch.matchedSelector || null,
          });
          resolvedSlotSelector = candidateMatch.slotSelector || await resolveCaptureSelector(page, mapping.slotSelector, "data-adops-capture-slot", { mediaBasename });
          if (candidateMatch.contextSelector) {
            resolvedContextSelector = candidateMatch.contextSelector;
          }
          const anchorSelector = candidateMatch.matchedSelector || resolvedSlotSelector;
          if (!resolvedContextSelector) {
            resolvedContextSelector = !mapping.contextSelector || mapping.contextSelector === mapping.slotSelector
              ? resolvedSlotSelector
              : await resolveCaptureSelector(page, mapping.contextSelector, "data-adops-capture-context", { mediaBasename, anchorSelector });
          }
          match = candidateMatch;
          break;
        }
        lastMatchFailure = candidateMatch;
      } catch (error) {
        lastSelectorFailure = error instanceof Error ? error.message : String(error);
      }
    }

    if (!match || !resolvedSlotSelector) {
      if (lastMatchFailure) {
        match = lastMatchFailure;
      } else {
        throw new Error(`Não foi possível localizar um slot válido em páginas internas candidatas. Último erro: ${lastSelectorFailure || "slot não encontrado"}`);
      }
    }

    const slotFoundStage = trace.start("slot_found");
    if (!match.ok) {
      trace.finish(slotFoundStage, "error", {
        targetUrl,
        resolvedSlotSelector,
      }, match.reason || "slot_not_found", JSON.stringify(match));
      const insertionExpired = !!insertion.periodoFim && new Date(`${insertion.periodoFim}T23:59:59-04:00`).getTime() < captureDate.getTime();
      if (match.reason === "placeholder_only" || (Array.isArray(match.available) && match.available.length > 0 && match.available.every((entry) => isPlaceholderCreativeEntry(entry)))) {
        if (insertionExpired) {
          throw new Error(`O anúncio da inserção ${insertion.id} já expirou para a data capturada e o AdRotate está exibindo apenas o banner modelo/placeholder. Gere um print retroativo dentro do período (${insertion.periodoInicio} a ${insertion.periodoFim}) ou revise o vínculo histórico no admin.`);
        }
        throw new Error(`O slot da inserção ${insertion.id} está exibindo apenas banner modelo/placeholder no site público. Revise o anúncio no AdRotate antes de capturar. Detalhes: ${JSON.stringify(match.available)}`);
      }
      throw new Error(`Não foi possível identificar o criativo correto: ${JSON.stringify(match)}`);
    }
    trace.finish(slotFoundStage, "ok", {
      targetUrl,
      resolvedSlotSelector,
      resolvedContextSelector,
      matchedMediaUrl: match.mediaUrl || null,
      adClass: match.adClass || null,
      matchScore: Number(match.matchScore ?? 0),
      slotTop: Number(match.slotTop ?? 0),
      slotVisibleRatio: Number(match.slotVisibleRatio ?? 0),
      slotInFooter: match.slotInFooter === true,
      resolvedMediaSelector: resolvedMediaSelector || null,
    });

    const animatedBannerDelayMs = Number(mapping.auditConfig?.animatedBannerDelayMs ?? 0);
    await page.waitForTimeout(1200);
    if (mapping.scrollMode === "slot") {
      const scrollTargetSelector = resolvedMediaSelector || resolvedSlotSelector;
      await page.locator(scrollTargetSelector).scrollIntoViewIfNeeded();
      const slotScrollViewportOffsetRatio = Number(mapping.auditConfig?.slotScrollViewportOffsetRatio ?? 0.35);
      await page.evaluate(({ selector, viewportOffsetRatio }) => {
        const slot = document.querySelector(selector);
        if (!slot) return;
        const viewportOffset = Math.round((window.innerHeight || 768) * viewportOffsetRatio);
        const top = slot.getBoundingClientRect().top + window.scrollY - viewportOffset;
        window.scrollTo({ top: Math.max(top, 0), behavior: "auto" });
      }, { selector: scrollTargetSelector, viewportOffsetRatio: slotScrollViewportOffsetRatio });
      await page.waitForTimeout(400);
      await dismissCookieConsent(page, mapping);
    } else {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }

    const matchedAdSelector = match.matchedSelector || resolvedSlotSelector;
    let slotFrameSelector = resolvedContextSelector || resolvedSlotSelector;
    const domReferenceSelector = resolvedMediaSelector || matchedAdSelector || resolvedSlotSelector;
    const gifFrameSelectionMode = String(mapping.auditConfig?.gifFrameSelection || "source_preferred").trim().toLowerCase();
    const gifSourceUrl = match.mediaUrl && isGifUrl(match.mediaUrl) ? resolveReachableMediaUrl(match.mediaUrl) : null;
    const videoMedia = isVideoMedia(insertion, match.mediaUrl);
    if (videoMedia) {
      // For AdRotate rotators, the <video> can be temporarily hidden while the
      // wrapper is being activated. Capture the locked ad wrapper so Playwright
      // does not race the carousel state.
      slotFrameSelector = matchedAdSelector || slotFrameSelector;
    }
    const gifSourceAllowed = !videoMedia && gifFrameSelectionMode !== "dom_only" && gifSourceUrl;
    let videoProof = null;
    if (videoMedia) {
      const videoSeed = buildStableNumber(`${insertion.id}:${effectiveCaptureAt || isoDate}:${insertion.mediaUrl}`, 1000);
      videoProof = await prepareVideoProof(page, matchedAdSelector, videoSeed);
      await page.waitForTimeout(700);
    } else if (isAnimatedBanner(insertion) && !gifSourceAllowed) {
      await waitForAnimatedBanner(page, matchedAdSelector, animatedBannerDelayMs || 1800);
    }

    const creativeMatchedStage = trace.start("creative_matched");
    trace.finish(creativeMatchedStage, "ok", {
      matchedAdSelector,
      resolvedMediaSelector: resolvedMediaSelector || null,
      matchedMediaUrl: match.mediaUrl || null,
      gifSourceAllowed,
      slotFrameSelector,
    });

    const postVisualWaitMs = Number(mapping.auditConfig?.postVisualWaitMs ?? 0);
    if (postVisualWaitMs > 0) {
      await page.waitForTimeout(postVisualWaitMs);
    }
    await forceMatchedAdVisible(page);
    await freezePreviewDatestamp(page, mapping.pageDateSelectors, effectiveCaptureAt, mapping.domain);
    retroPreview = await applyPortalRetroPreview(page, mapping, effectiveCaptureAt, portalRetroPreviewOptions) || retroPreview;
    await applyPerrengueStaticRetroAd(page, mapping, insertion.mediaUrl, mediaBasename, staticRetroAdOptions);
    await dismissBlockingOverlays(page, { preserveBottomPopup: shouldPreserveBottomPopupForCapture(mapping, resolvedSlotSelector, resolvedContextSelector) });
    creativePlacementAudit = await auditMatchedCreativePlacementWithRetry(page, resolvedSlotSelector, mediaBasename, insertion.mediaUrl, {
      attempts: Number(mapping.auditConfig?.creativePlacementAuditAttempts ?? 4),
      waitMs: Number(mapping.auditConfig?.creativePlacementAuditRetryWaitMs ?? 550),
    });
    if (!creativePlacementAudit.ok) {
      const details = summarizeCreativePlacementAudit(creativePlacementAudit);
      throw new Error(`capture_audit_failed: visual_slot_integrity_failed: ${details}`);
    }
    headerAdPolicyAudit = await auditHeaderAdPolicy(page, mapping);
    if (!headerAdPolicyAudit.ok) {
      const details = headerAdPolicyAudit.issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
      throw new Error(`capture_audit_failed: header_ad_policy_failed: ${details}`);
    }
    visualAudit = await waitForViewportVisuals(page, resolvedSlotSelector);
    await forceMatchedAdVisible(page);
    await dismissBlockingOverlays(page, { preserveBottomPopup: shouldPreserveBottomPopupForCapture(mapping, resolvedSlotSelector, resolvedContextSelector) });

    if (videoMedia) {
      const hoverPoint = videoProof?.hoverX && videoProof?.hoverY
        ? { x: videoProof.hoverX, y: videoProof.hoverY }
        : { x: 830, y: 360 };
      await page.mouse.move(hoverPoint.x, hoverPoint.y);
      await page.waitForTimeout(250);
    } else {
      await page.waitForTimeout(400);
    }

    // The audit gate must validate the real AdRotate slot position in the page.
    // AdRotate sliders can clone or temporarily hide inner media/context nodes,
    // so use the resolved slot container instead of img/context selectors.
    slotVisibility = await measureSlotVisibility(page, resolvedSlotSelector);
    if (!slotVisibility?.mostlyVisible && mapping.slotSelector && mapping.slotSelector !== resolvedSlotSelector) {
      const fallbackSlotVisibility = await measureSlotVisibility(page, mapping.slotSelector);
      if (fallbackSlotVisibility?.mostlyVisible) {
        slotVisibility = {
          ...fallbackSlotVisibility,
          measuredSelector: mapping.slotSelector,
          fallbackFromSelector: resolvedSlotSelector,
        };
      }
    }
    let slotFrameAudit = null;
    const frameSelectedStage = trace.start("frame_selected");
    if (gifSourceAllowed) {
      const sceneTargetOffset = buildStableNumber(
        `${effectiveCaptureAt || isoDate}:${insertion.id}:${isoDate}:${gifSourceUrl}`,
        1024,
      );
      let forcedGifAllowedFrameRanges = null;
      if (process.env.ADOPS_CAPTURE_GIF_ALLOWED_FRAME_RANGES) {
        try {
          const parsedRanges = JSON.parse(process.env.ADOPS_CAPTURE_GIF_ALLOWED_FRAME_RANGES);
          if (Array.isArray(parsedRanges)) forcedGifAllowedFrameRanges = parsedRanges;
        } catch {}
      }
      frameSelection = analyzeGifSourceFrames(gifSourceUrl, path.join(outDir, "gif-source"), {
        minHoldMs: Number(mapping.auditConfig?.gifMinHoldMs ?? 1200),
        minNonBgRatio: Number(mapping.auditConfig?.gifMinNonBgRatio ?? 0.02),
        minContrast: Number(mapping.auditConfig?.gifMinContrast ?? 20),
        minIdentityFrameScore: Number(mapping.auditConfig?.gifMinIdentityFrameScore ?? mapping.auditConfig?.minIdentityFrameScore ?? 52),
        minTextEdgeRatio: Number(mapping.auditConfig?.gifMinTextEdgeRatio ?? mapping.auditConfig?.minTextEdgeRatio ?? 0.012),
        bestEffortAllowed: mapping.auditConfig?.bestEffortAllowed === true,
        captureOnlyFallbackAllowed: mapping.auditConfig?.gifCaptureOnlyFallback !== false,
        syntheticHoldMs: Number(mapping.auditConfig?.gifSyntheticHoldMs ?? mapping.auditConfig?.gifMinHoldMs ?? 1200),
        allowedFrameRanges: forcedGifAllowedFrameRanges || mapping.auditConfig?.gifAllowedFrameRanges,
        sceneTargetOffset,
      });
      if (resolvedMediaSelector) {
        domMediaPatch = await applyReferenceFrameToDomMedia(page, resolvedMediaSelector, frameSelection.chosenPngPath);
        await page.waitForTimeout(180);
        await forceMatchedAdVisible(page);
      }
      const domSimilarityOptions = {
        sampleCount: Number(mapping.auditConfig?.domGuidedSampleCount ?? 8),
        sampleIntervalMs: Number(mapping.auditConfig?.domGuidedSampleIntervalMs ?? 280),
        minSimilarity: Number(mapping.auditConfig?.domFrameMinSimilarity ?? 0.82),
        minNonBgRatio: Number(mapping.auditConfig?.domFrameMinNonBgRatio ?? 0.02),
        minVisibleRatio: Number(mapping.auditConfig?.domFrameMinVisibleRatio ?? 0.05),
        sampleScreenshotMaxAttempts: Number(mapping.auditConfig?.domSampleScreenshotMaxAttempts ?? 3),
        sampleScreenshotRetryWaitMs: Number(mapping.auditConfig?.domSampleScreenshotRetryWaitMs ?? 240),
        selectorCandidates: uniqSelectors([
          resolvedContextSelector,
          resolvedMediaSelector,
          resolvedSlotSelector,
          matchedAdSelector,
          slotFrameSelector,
        ]),
      };
      let domFrameAnalysis = null;
      const maxAttempts = Math.max(1, Number(mapping.auditConfig?.domGuidedMaxAttempts ?? 2));
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        domFrameAnalysis = await captureDomSlotFrameAlignedWithReference(
          page,
          domReferenceSelector,
          slotPng,
          frameSelection.chosenPngPath,
          domSimilarityOptions,
        );
        if (domFrameAnalysis.ok && domFrameAnalysis.similarityOk && domFrameAnalysis.hasUsefulContent) break;
        if (attempt < maxAttempts) {
          await page.waitForTimeout(Number(mapping.auditConfig?.domGuidedRetryWaitMs ?? 380));
        }
      }
      if (!domFrameAnalysis || !domFrameAnalysis.ok || !domFrameAnalysis.similarityOk || !domFrameAnalysis.hasUsefulContent) {
        trace.finish(frameSelectedStage, "error", {
          frameSelectionMode: "gif_source",
          domFrameSimilarityScore: domFrameAnalysis?.similarityScore ?? null,
          domFrameMinSimilarity: domFrameAnalysis?.minSimilarity ?? null,
          domFrameNonBgRatio: domFrameAnalysis?.nonBgRatio ?? null,
          domFrameMinNonBgRatio: domFrameAnalysis?.minNonBgRatio ?? null,
          domMediaPatch,
        }, "slot_position_mismatch", domFrameAnalysis?.reason || "dom_reference_mismatch");
        throw new Error(`slot_position_mismatch: frame do GIF não convergiu com posição real no DOM. similarity=${Number(domFrameAnalysis?.similarityScore ?? 0).toFixed(4)} min=${Number(domFrameAnalysis?.minSimilarity ?? 0).toFixed(4)} nonBg=${Number(domFrameAnalysis?.nonBgRatio ?? 0).toFixed(5)}`);
      }
      slotFrameAudit = {
        slotStableFrameOk: true,
        slotLegibilityOk: true,
        slotFrameSamples: compactGifFrameCandidates(frameSelection.gifFrameCandidates, frameSelection.gifChosenFrameIndex),
        slotChosenSampleIndex: Number(frameSelection.gifChosenFrameIndex),
        slotMotionScore: 0,
        slotTransitionRejected: false,
        slotLegibilityScore: {
          contrast: frameSelection.gifChosenContrast,
          nonBgRatio: frameSelection.gifChosenNonBgRatio,
          durationMs: frameSelection.gifChosenDurationMs,
          identityFrameScore: frameSelection.identityFrameScore ?? null,
        },
        identityFrameOk: frameSelection.identityFrameOk === true,
        identityFrameScore: frameSelection.identityFrameScore ?? null,
        identityFrameReasons: Array.isArray(frameSelection.identityFrameReasons) ? frameSelection.identityFrameReasons : [],
        slotLegibilityReasons: Array.isArray(frameSelection.identityFrameReasons) ? frameSelection.identityFrameReasons : [],
        domFrameSimilarityScore: domFrameAnalysis.similarityScore,
        domFrameSimilarityOk: domFrameAnalysis.similarityOk,
        domFrameChosenSampleIndex: domFrameAnalysis.chosenIndex,
        domFrameSamples: Array.isArray(domFrameAnalysis.samples) ? domFrameAnalysis.samples : [],
        domFrameHasUsefulContent: domFrameAnalysis.hasUsefulContent,
        domFrameNonBgRatio: domFrameAnalysis.nonBgRatio,
        domFrameMinSimilarity: domFrameAnalysis.minSimilarity,
        domFrameMinNonBgRatio: domFrameAnalysis.minNonBgRatio,
        captureOnly: frameSelection.captureOnly === true,
        originalGifUrl: frameSelection.originalGifUrl || frameSelection.gifSourceUrl || null,
        syntheticHoldMs: frameSelection.syntheticHoldMs ?? null,
        frameSelectionReason: frameSelection.frameSelectionReason || null,
      };
      trace.finish(frameSelectedStage, "ok", {
        frameSelectionMode: frameSelection.frameSelectionMode,
        gifChosenFrameIndex: frameSelection.gifChosenFrameIndex ?? null,
        captureOnly: frameSelection.captureOnly === true,
        frameSelectionReason: frameSelection.frameSelectionReason || null,
        syntheticHoldMs: frameSelection.syntheticHoldMs ?? null,
        gifStrongFrameCount: Array.isArray(frameSelection.gifFrameCandidates)
          ? frameSelection.gifFrameCandidates.filter((item) => item.strongCandidate).length
          : 0,
        gifUsefulFrameCount: frameSelection.gifUsefulFrameCount ?? null,
        frameSelectionDowngraded: frameSelection.frameSelectionDowngraded === true,
        domFrameSimilarityScore: domFrameAnalysis.similarityScore,
        domFrameChosenSampleIndex: domFrameAnalysis.chosenIndex,
        domMediaPatch,
      });
    } else {
      frameSelection = {
        frameSelectionMode: "dom_sampling",
        gifSourceUrl: null,
        gifFrameCandidates: [],
        gifChosenFrameIndex: null,
        gifChosenDurationMs: null,
        frameSelectionDowngraded: false,
        frameSelectionDowngradeReason: null,
      };
      const stableSlotFrameOptions = {
        sampleCount: Number(mapping.auditConfig?.stableFrameSampleCount ?? (videoMedia ? 8 : (isAnimatedBanner(insertion) ? 8 : 4))),
        sampleIntervalMs: Number(mapping.auditConfig?.stableFrameSampleIntervalMs ?? (videoMedia ? 320 : (isAnimatedBanner(insertion) ? 320 : 420))),
        motionThreshold: Number(mapping.auditConfig?.stableFrameMotionThreshold ?? 7.5),
        minStablePairsAtEnd: Number(mapping.auditConfig?.stableFrameMinStablePairsAtEnd ?? (videoMedia || isAnimatedBanner(insertion) ? 2 : 1)),
        minStddev: Number(mapping.auditConfig?.stableFrameMinStddev ?? 22),
        minEdgeMean: Number(mapping.auditConfig?.stableFrameMinEdgeMean ?? 12),
        minMidtoneRatio: Number(mapping.auditConfig?.stableFrameMinMidtoneRatio ?? 0.18),
        minIdentityFrameScore: Number(mapping.auditConfig?.minIdentityFrameScore ?? 36),
        minTextEdgeRatio: Number(mapping.auditConfig?.minTextEdgeRatio ?? 0.012),
        preferBestLegibleFrame: mapping.auditConfig?.preferBestLegibleFrame === true || videoMedia,
      };
      slotFrameAudit = await captureStableSlotFrame(page, slotFrameSelector, slotPng, stableSlotFrameOptions);
      if (videoMedia && !slotFrameAudit.slotLegibilityOk) {
        const videoSeed = buildStableNumber(`${insertion.id}:${effectiveCaptureAt || isoDate}:${insertion.mediaUrl}`, 1000);
        const attempts = Math.max(2, Number(mapping.auditConfig?.videoLegibleFrameAttempts ?? 5));
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const seekResult = await seekVideoProofFrame(page, matchedAdSelector, videoSeed, attempt);
          if (seekResult?.ok) {
            videoProof = {
              ...videoProof,
              ...seekResult,
              legibilityFallbackAttempt: attempt,
              legibilityFallbackReason: Array.isArray(slotFrameAudit.slotLegibilityReasons)
                ? slotFrameAudit.slotLegibilityReasons.join("; ")
                : "slot_legibility_failed",
            };
          }
          slotFrameAudit = await captureStableSlotFrame(page, slotFrameSelector, slotPng, stableSlotFrameOptions);
          if (slotFrameAudit.slotLegibilityOk) break;
        }
      }
      const requireStableSlotFrame = !videoMedia && mapping.auditConfig?.requireStableFrame !== false;
      const requireLegibleSlotFrame = mapping.auditConfig?.requireLegibleFrame !== false;
      if (requireStableSlotFrame && !slotFrameAudit.slotStableFrameOk) {
        trace.finish(frameSelectedStage, "error", {
          frameSelectionMode: "dom_sampling",
        }, "capture_legibility_failed", `frame instável no slot ${slotFrameSelector}`);
        throw new Error(`capture_legibility_failed: frame instável no slot ${slotFrameSelector}. motion=${slotFrameAudit.slotMotionScore ?? "n/a"} samples=${Array.isArray(slotFrameAudit.slotFrameSamples) ? slotFrameAudit.slotFrameSamples.length : 0}`);
      }
      if (requireLegibleSlotFrame && !slotFrameAudit.slotLegibilityOk) {
        trace.finish(frameSelectedStage, "error", {
          frameSelectionMode: "dom_sampling",
          reasons: slotFrameAudit.slotLegibilityReasons || [],
        }, "capture_legibility_failed", (slotFrameAudit.slotLegibilityReasons || []).join("; ") || "sem detalhes");
        throw new Error(`capture_legibility_failed: banner ilegível no slot ${slotFrameSelector}. Detalhes: ${(slotFrameAudit.slotLegibilityReasons || []).join("; ") || "sem detalhes"}`);
      }
      trace.finish(frameSelectedStage, "ok", {
        frameSelectionMode: "dom_sampling",
        slotChosenSampleIndex: slotFrameAudit.slotChosenSampleIndex,
        frameSelectionDowngraded: false,
      });
    }

    const slotCapturedStage = trace.start("slot_captured");
    await forceMatchedAdVisible(page);
    await freezePreviewDatestamp(page, mapping.pageDateSelectors, effectiveCaptureAt, mapping.domain);
    retroPreview = await applyPortalRetroPreview(page, mapping, effectiveCaptureAt, portalRetroPreviewOptions) || retroPreview;
    await applyPerrengueStaticRetroAd(page, mapping, insertion.mediaUrl, mediaBasename, staticRetroAdOptions);
    await dismissBlockingOverlays(page, { preserveBottomPopup: shouldPreserveBottomPopupForCapture(mapping, resolvedSlotSelector, resolvedContextSelector) });
    await forceMatchedAdVisible(page);
    if (gifSourceAllowed && frameSelection?.chosenPngPath) {
      const finalFrameSelector = mapping.auditConfig?.forceReferenceFrameOnSlot === true
        ? resolvedSlotSelector
        : (resolvedMediaSelector || matchedAdSelector || resolvedSlotSelector);
      domMediaPatch = await applyReferenceFrameToDomMedia(page, finalFrameSelector, frameSelection.chosenPngPath);
      await forceMatchedAdVisible(page);
    }
    const finalViewportTargetSelector = slotFrameSelector || resolvedMediaSelector || matchedAdSelector || resolvedSlotSelector;
    finalViewportTargetAudit = await scrollProofTargetIntoViewport(page, finalViewportTargetSelector, {
      viewportOffsetRatio: Number(mapping.auditConfig?.finalViewportTargetOffsetRatio ?? 0.42),
    });
    if (!finalViewportTargetAudit.ok) {
      throw new Error(`capture_audit_failed: final_viewport_target_not_visible: ${finalViewportTargetAudit.reason || "unknown"} selector=${finalViewportTargetSelector}`);
    }
    stickyHeaderViewportAudit = await assertStickyHeaderInViewport(page, mapping);
    const readinessStage = trace.start("critical_assets");
    readinessAudit = await captureStrictReadinessCandidate(
      page,
      viewportPng,
      resolvedSlotSelector,
      mapping.auditConfig,
      resourceFailures,
    );
    if (readinessAudit && readinessAudit.approved !== true) {
      const failedPixel = readinessAudit.pixelAudit?.elements?.find((item) => item.painted !== true);
      const notLoaded = readinessAudit.elements?.find((item) => item.loaded !== true);
      const code = !readinessAudit.fontsReady
        ? "readiness_timeout"
        : notLoaded?.kind === "background"
          ? "critical_background_not_loaded"
          : notLoaded
            ? "critical_image_not_loaded"
            : !readinessAudit.layoutStable
              ? "layout_not_stable"
              : readinessAudit.finalViewportChanged
                ? "final_viewport_changed"
        : readinessAudit.failedResources?.length
          ? "resource_request_failed"
          : failedPixel?.kind === "background"
            ? "critical_background_not_loaded"
            : "critical_image_not_painted";
      const failedSource = notLoaded?.source || failedPixel?.source || (
        code === "layout_not_stable"
          ? JSON.stringify({
              signatures: readinessAudit.signatureHistory || [],
              missingCriticalSelectors: readinessAudit.missingCriticalSelectors || [],
            })
          : JSON.stringify(readinessAudit.failedResources || [])
      );
      trace.finish(readinessStage, "error", readinessAudit, code, failedSource || "readiness gate failed");
      throw new Error(`${code}: ${failedSource}`);
    }
    trace.finish(readinessStage, "ok", readinessAudit || { mode: "legacy" });
    pageScrollMetrics = await measurePageScrollMetrics(page);
    const contextScreenshotSelector = videoMedia
      ? (slotFrameSelector || resolvedMediaSelector || matchedAdSelector || resolvedContextSelector || resolvedSlotSelector)
      : (resolvedContextSelector || resolvedSlotSelector);
    try {
      await page.locator(contextScreenshotSelector).screenshot({ path: contextPng });
    } catch (contextScreenshotError) {
      if (!existsSync(slotPng)) throw contextScreenshotError;
      copyFileSync(slotPng, contextPng);
      artifactRecords.contextScreenshotFallback = {
        from: slotPng,
        selector: contextScreenshotSelector,
        error: contextScreenshotError instanceof Error ? contextScreenshotError.message : String(contextScreenshotError),
      };
    }
    if (!readinessAudit) {
      await page.screenshot({ path: viewportPng });
    }
    trace.finish(slotCapturedStage, "ok", {
      slotVisibility,
      viewportImagesLoaded: visualAudit?.viewportImagesLoaded ?? null,
      slotImagesLoaded: visualAudit?.slotImagesLoaded ?? null,
    });

    const finalPageUrl = targetUrl || page.url();

    const pageDateSelectors = mergePageDateSelectors(mapping.pageDateSelectors);
    const visiblePageDateAudit = await assertVisiblePageDateTextMatchesRequestedCaptureAt(page, mapping, effectiveCaptureAt);
    pageDateObserved = await page.evaluate((selectors) => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const readValue = (el) => {
        const attrCandidates = [
          el.getAttribute?.("datetime"),
          el.getAttribute?.("data-datetime"),
          el.getAttribute?.("data-date"),
          el.getAttribute?.("data-omt-preview-at"),
          el.getAttribute?.("data-omt-live-datetime"),
        ].filter(Boolean);
        if (attrCandidates.length > 0) return attrCandidates[0];
        if (el.textContent && el.textContent.trim()) return el.textContent.trim();
        return null;
      };
      const visibleCandidates = [];
      const hiddenCandidates = [];
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (!el) continue;
          const value = readValue(el);
          if (!value) continue;
          if (isVisible(el)) visibleCandidates.push(value);
          else hiddenCandidates.push(value);
        }
      }
      return visibleCandidates[0] || hiddenCandidates[0] || null;
    }, pageDateSelectors);

    // A prova editorial assinada protege reconstruções históricas. Para a
    // captura do próprio dia, o portal está no estado público atual; exigir
    // cards de um snapshot retroativo vazio reprova uma evidência visualmente
    // válida sem aumentar a garantia de veiculação.
    const isHistoricalCapture = requiresRetroEditorialProof(isoDate);
    const retroContentEvidence = isHistoricalCapture
      ? await collectRetroContentEvidence(page, mapping, effectiveCaptureAt, retroPreview)
      : {
          editorialSamples: [],
          manifest: null,
          retroContentProof: null,
        };
    editorialSamples = retroContentEvidence.editorialSamples;
    contentDateSamples = editorialSamples.map((item) => item.date).filter(Boolean).slice(0, 25);
    retroContentManifest = retroContentEvidence.manifest;
    retroContentProof = retroContentEvidence.retroContentProof;

    systemDateTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Cuiaba",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(captureDate);
    pageDateText = pageDateObserved;

    retroGate = evaluateRetroCaptureGate({
      requestedCaptureAt: effectiveCaptureAt,
      systemDateTime,
      pageDateObserved,
      pageDateText,
      contentDateSamples,
      retroContentProof,
      requireRetroContentProof: isHistoricalCapture && mapping.auditConfig?.requireRetroContentProof === true,
      slotVisibility,
      requireSlotVisibleInViewport: mapping.auditConfig?.requireSlotVisibleInViewport === true || mapping.requireSlotVisibleInViewport === true,
      requireDomFrameSimilarity: frameSelection?.frameSelectionMode === "gif_source",
      requireDomUsefulContent: frameSelection?.frameSelectionMode === "gif_source",
      domFrameSimilarityOk: slotFrameAudit?.domFrameSimilarityOk === true,
      domFrameSimilarityScore: slotFrameAudit?.domFrameSimilarityScore ?? null,
      domFrameMinSimilarity: slotFrameAudit?.domFrameMinSimilarity ?? Number(mapping.auditConfig?.domFrameMinSimilarity ?? 0.82),
      domFrameHasUsefulContent: slotFrameAudit?.domFrameHasUsefulContent === true,
      domFrameNonBgRatio: slotFrameAudit?.domFrameNonBgRatio ?? null,
      domFrameMinNonBgRatio: slotFrameAudit?.domFrameMinNonBgRatio ?? Number(mapping.auditConfig?.domFrameMinNonBgRatio ?? 0.02),
    });
    if (retroPreview && typeof retroPreview === "object") {
      retroGate = {
        ...retroGate,
        sparse: retroPreview.sparse === true,
        postsAvailable: Number.isFinite(Number(retroPreview.postsAvailable ?? retroPreview.posts)) ? Number(retroPreview.postsAvailable ?? retroPreview.posts) : null,
        totalPostsAvailable: Number.isFinite(Number(retroPreview.totalPostsAvailable)) ? Number(retroPreview.totalPostsAvailable) : null,
        excludedMemePosts: Number.isFinite(Number(retroPreview.excludedMemePosts)) ? Number(retroPreview.excludedMemePosts) : 0,
        editorialMemeLeaks: Array.isArray(retroPreview.editorialMemeLeaks) ? retroPreview.editorialMemeLeaks : [],
        retroContentSource: retroPreview.source || null,
        adminPosts: Number.isFinite(Number(retroPreview.adminPosts)) ? Number(retroPreview.adminPosts) : 0,
        expectedLeadSlugs: Array.isArray(retroPreview.expectedLeadSlugs) ? retroPreview.expectedLeadSlugs : [],
        renderedLeadSlugs: Array.isArray(retroPreview.renderedLeadSlugs) ? retroPreview.renderedLeadSlugs : [],
        expectedNowSlugs: Array.isArray(retroPreview.expectedNowSlugs) ? retroPreview.expectedNowSlugs : [],
        renderedNowSlugs: Array.isArray(retroPreview.renderedNowSlugs) ? retroPreview.renderedNowSlugs : [],
        editorialContentMatches: retroPreview.editorialContentMatches === true,
        postsRequired: Number.isFinite(Number(retroPreview.postsRequired)) ? Number(retroPreview.postsRequired) : null,
      };
    }
    if (!retroGate.ok && process.env.ADOPS_CAPTURE_ALLOW_RECONSTRUCTED_RETRO_MISMATCH !== "1") {
      const details = retroGate.issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
      throw new Error(`capture_audit_failed: ${details}; pageDateObserved=${pageDateObserved || "n/a"}; requestedCaptureAt=${effectiveCaptureAt || "n/a"}`);
    }

    const requestedProofStyle = mapping.proofStyle || "viewport_only";
    const proofStyleContract = resolveFinalCustomerProofStyle(requestedProofStyle);
    const proofStyleDowngradeReason = proofStyleContract.proofStyleDowngradeReason;
    const effectiveProofStyle = proofStyleContract.finalProofStyle;
    finalProofStyle = effectiveProofStyle;

    if (!existsSync(viewportPng)) {
      await page.screenshot({ path: viewportPng });
      artifactRecords.viewportRecapturedBeforeCompose = {
        reason: "approved_viewport_artifact_missing",
        capturedAt: new Date().toISOString(),
      };
    }

    const finalComposedStage = trace.start("final_composed");
    const desktopFrameMetadata = composeDesktopProof(viewportPng, finalPng, {
      osLabel: "Google Chrome",
      systemDateTime,
      siteSigla: insertion.siteSigla,
      tabTitle: mapping.browserTitle,
      hostLabel: mapping.hostLabel,
      addressText: buildAddressText(finalPageUrl, mapping.hostLabel),
      slotPng,
      proofStyle: effectiveProofStyle,
      scrollMetrics: pageScrollMetrics,
      viewportTrimBottomPx: Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0),
    });
    trace.finish(finalComposedStage, "ok", {
      requestedProofStyle,
      finalProofStyle,
      proofStyleDowngradeReason,
      auditInsetSuppressed: proofStyleContract.auditInsetSuppressed,
      viewportTrimBottomPx: Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0),
      pageScrollMetrics,
      ...desktopFrameMetadata,
    });

    const finalPngSlotAuditBox = resolveFinalPngSlotAuditBox(finalViewportTargetAudit, creativePlacementAudit);
    const finalPngSlotAudit = auditFinalPngSlotPixels(
      finalPng,
      viewportPng,
      finalPngSlotAuditBox,
      desktopFrameMetadata,
      {
        finalProofStyle,
        minSimilarity: Number(mapping.auditConfig?.finalPngSlotMinSimilarity ?? 0.82),
        minContentStddev: Number(mapping.auditConfig?.finalPngSlotMinContentStddev ?? 4),
        comparedTo: "viewportPng",
        referenceIsViewport: true,
        viewportWidthCss: Number(pageScrollMetrics?.viewportWidth ?? 0),
      },
    );
    if (!finalPngSlotAudit.ok) {
      const details = finalPngSlotAudit.issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
      throw new Error(`capture_audit_failed: final_png_slot_audit_failed: ${details}`);
    }
    const finalPngCreativeReferenceFrames = gifSourceAllowed
      ? buildFinalPngCreativeReferenceFrames(frameSelection)
      : [];
    const finalPngCreativeIdentityAudit = finalPngCreativeReferenceFrames.length
      ? auditFinalPngCreativeIdentityAgainstFrames(
          finalPng,
          finalPngCreativeReferenceFrames,
          finalPngSlotAuditBox,
          desktopFrameMetadata,
          {
            finalProofStyle,
            minSimilarity: Number(mapping.auditConfig?.finalPngCreativeMinSimilarity ?? 0.82),
            minContentStddev: Number(mapping.auditConfig?.finalPngSlotMinContentStddev ?? 4),
            comparedTo: "approvedGifFrames",
            viewportWidthCss: Number(pageScrollMetrics?.viewportWidth ?? 0),
          },
        )
      : null;
    if (finalPngCreativeIdentityAudit && !finalPngCreativeIdentityAudit.ok) {
      const details = finalPngCreativeIdentityAudit.issues
        .map((item) => `${item.code}: ${item.detail}`)
        .join("; ");
      throw new Error(`capture_audit_failed: final_png_creative_identity_failed: ${details}`);
    }
    if (readinessAudit) {
      const config = normalizeStrictReadinessConfig(mapping.auditConfig);
      const paintTargets = readinessAudit.elements.filter((item) => item.paintRequired === true);
      const finalPixelAudit = auditVisibleMediaPixels(finalPng, paintTargets, {
        viewportWidthCss: readinessAudit.viewportWidth,
        topOffsetPx: Number(desktopFrameMetadata.chromeFrameHeight ?? 0),
        minContentStddev: config.minContentStddev,
      });
      finalReadinessAudit = {
        ...readinessAudit,
        finalPixelAudit,
        approved: readinessAudit.approved === true && (!config.requirePainted || finalPixelAudit.ok === true),
      };
      if (!finalReadinessAudit.approved) {
        const failed = finalPixelAudit.elements?.find((item) => item.painted !== true);
        throw new Error(`critical_image_not_painted: final_png ${failed?.source || finalPixelAudit.error || "unknown"}`);
      }
    }
    const shouldAuditPerrengueHeaderAdPolicy = mapping.domain === "perrenguematogrosso.com" &&
      mapping.scrollMode === "top" &&
      mapping.slotSelector !== "#cod5-bottom-popup-ad .g.g-9";
    if (shouldAuditPerrengueHeaderAdPolicy) {
      finalPngHeaderAdPolicyAudit = auditFinalPngHeaderAdPolicy(finalPng, {
        siteSigla: insertion.siteSigla,
        headerAdPolicyAudit,
        desktopFrameMetadata,
        viewportWidthCss: Number(pageScrollMetrics?.viewportWidth ?? 0),
      });
      if (!finalPngHeaderAdPolicyAudit.ok) {
        const details = finalPngHeaderAdPolicyAudit.issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
        throw new Error(`capture_audit_failed: final_png_header_ad_policy_failed: ${details}`);
      }
    }
    if (mapping.auditConfig?.requireStickyHeaderInViewport === true) {
      finalPngStickyHeaderAudit = auditFinalPngStickyHeaderPixels(finalPng, desktopFrameMetadata, {
        viewportWidthCss: Number(pageScrollMetrics?.viewportWidth ?? 0),
        minContentStddev: Number(mapping.auditConfig?.finalPngStickyHeaderMinContentStddev ?? 8),
      });
      if (!finalPngStickyHeaderAudit.ok) {
        const details = finalPngStickyHeaderAudit.issues.map((item) => `${item.code}: ${item.detail}`).join("; ");
        throw new Error(`capture_audit_failed: final_png_sticky_header_failed: ${details}`);
      }
    }

    const evidenceFilename = [
      normalizeAscii(insertion.siteSigla || "SITE"),
      compactCampaignName(insertion.campanhaName || "CAMPANHA"),
      compactClientName(insertion.clienteNome || ""),
      compactPiCode(insertion.piCodigo || ""),
      isoDate,
      compactPosition(insertion.localFormatoNormalizado || insertion.localFormato || ""),
    ].filter(Boolean).join("_") + ".png";

    metadata = {
      auditContractVersion: "audit-checklist-v1",
      resolvedRuleVersionHash: mapping.ruleVersionHash || null,
      requiredGates: {
        requireSlotVisibleInViewport: mapping.auditConfig?.requireSlotVisibleInViewport === true,
        requireStickyHeaderInViewport: mapping.auditConfig?.requireStickyHeaderInViewport === true,
        stickyHeaderExpected: mapping.auditConfig?.stickyHeaderExpected || null,
        requireScrollbar: mapping.auditConfig?.requireScrollbar !== false,
        requireFrameV4: mapping.auditConfig?.requireFrameV4 !== false,
        requireIdentityFrame: mapping.auditConfig?.requireIdentityFrame !== false,
        requireFinalPngSlotAudit: mapping.auditConfig?.requireFinalPngSlotAudit !== false,
        requireNoOverlay: mapping.auditConfig?.requireNoOverlay !== false,
        requireNo404: mapping.auditConfig?.requireNo404 !== false,
        requireVideoControls: /VIDEO/i.test(insertion.localFormatoNormalizado || insertion.localFormato || ""),
        requireReadinessAudit: normalizeStrictReadinessConfig(mapping.auditConfig).mode === "strict-visible",
        gifAllowedFrameRanges: Array.isArray(mapping.auditConfig?.gifAllowedFrameRanges) ? mapping.auditConfig.gifAllowedFrameRanges : [],
      },
      checklistValidation: null,
      insertionId: insertion.id,
      campaignId: insertion.campanhaId,
      campaignName: insertion.campanhaName,
      siteSigla: insertion.siteSigla,
      format: insertion.localFormatoNormalizado,
      pageUrl: finalPageUrl,
      adminBaseUrl: mapping.adminBaseUrl,
      pageLabel: mapping.pageLabel,
      positionLabel: mapping.positionLabel,
      canonicalSlotSelector: mapping.slotSelector,
      canonicalContextSelector: mapping.contextSelector || mapping.slotSelector,
      slotSelector: resolvedSlotSelector,
      contextSelector: resolvedContextSelector || resolvedSlotSelector,
      slotFrameSelector,
      auditConfig: mapping.auditConfig,
      mediaUrl: insertion.mediaUrl,
      mediaBasename,
      requestedCaptureAt: effectiveCaptureAt,
      systemDateTime,
      pageDateText,
      pageDateObserved,
      contentDateSamples,
      editorialSamples,
      retroContentManifest,
      retroContentProof,
      retroGate,
      reconstruction,
      visiblePageDateAudit,
      creativePlacementAudit,
      headerAdPolicyAudit,
      stickyHeaderViewportAudit,
      finalPngStickyHeaderAudit,
      finalViewportTargetAudit,
      capturedAt: new Date().toISOString(),
      pageScrollMetrics,
      frameTheme: desktopFrameMetadata.frameTheme,
      frameTemplateVersion: desktopFrameMetadata.frameTemplateVersion ?? null,
      frameTemplateSize: desktopFrameMetadata.frameTemplateSize ?? null,
      frameStrictAssetsOk: desktopFrameMetadata.frameStrictAssetsOk === true,
      dynamicFields: Array.isArray(desktopFrameMetadata.dynamicFields) ? desktopFrameMetadata.dynamicFields : [],
      chromeTopTheme: desktopFrameMetadata.chromeTopTheme ?? null,
      tabSurfaceRendered: desktopFrameMetadata.tabSurfaceRendered === true,
      tabTitleRendered: desktopFrameMetadata.tabTitleRendered === true,
      tabIconRendered: desktopFrameMetadata.tabIconRendered === true,
      tabIconFallback: desktopFrameMetadata.tabIconFallback === true,
      chromeFrameHeight: desktopFrameMetadata.chromeFrameHeight,
      taskbarHeight: desktopFrameMetadata.taskbarHeight,
      scrollbarRendered: desktopFrameMetadata.scrollbarRendered,
      scrollbarThumbTop: desktopFrameMetadata.scrollbarThumbTop,
      scrollbarThumbHeight: desktopFrameMetadata.scrollbarThumbHeight,
      isoDate,
      requestedProofStyle,
      finalProofStyle,
      proofStyleDowngradeReason,
      auditInsetSuppressed: proofStyleContract.auditInsetSuppressed,
      finalPngSlotAudit,
      finalPngCreativeIdentityAudit,
      finalPngHeaderAdPolicyAudit,
      adClass: match.adClass || null,
      matchedAdSelector,
      matchedMediaUrl: match.mediaUrl || null,
      slotVisibility,
      slotStableFrameOk: slotFrameAudit.slotStableFrameOk,
      slotLegibilityOk: slotFrameAudit.slotLegibilityOk,
      slotFrameSamples: slotFrameAudit.slotFrameSamples,
      slotChosenSampleIndex: slotFrameAudit.slotChosenSampleIndex,
      slotMotionScore: slotFrameAudit.slotMotionScore,
      slotTransitionRejected: slotFrameAudit.slotTransitionRejected,
      slotLegibilityScore: slotFrameAudit.slotLegibilityScore,
      slotLegibilityReasons: slotFrameAudit.slotLegibilityReasons,
      identityFrameOk: slotFrameAudit.identityFrameOk === true,
      identityFrameScore: typeof slotFrameAudit.identityFrameScore === "number" ? slotFrameAudit.identityFrameScore : null,
      identityFrameReasons: Array.isArray(slotFrameAudit.identityFrameReasons) ? slotFrameAudit.identityFrameReasons : [],
      domFrameSimilarityScore: typeof slotFrameAudit.domFrameSimilarityScore === "number" ? slotFrameAudit.domFrameSimilarityScore : null,
      domFrameSimilarityOk: slotFrameAudit.domFrameSimilarityOk === true,
      domFrameChosenSampleIndex: typeof slotFrameAudit.domFrameChosenSampleIndex === "number" ? slotFrameAudit.domFrameChosenSampleIndex : null,
      domFrameSamples: Array.isArray(slotFrameAudit.domFrameSamples) ? slotFrameAudit.domFrameSamples : [],
      domFrameHasUsefulContent: slotFrameAudit.domFrameHasUsefulContent === true,
      domFrameNonBgRatio: typeof slotFrameAudit.domFrameNonBgRatio === "number" ? slotFrameAudit.domFrameNonBgRatio : null,
      domFrameMinSimilarity: typeof slotFrameAudit.domFrameMinSimilarity === "number" ? slotFrameAudit.domFrameMinSimilarity : null,
      domFrameMinNonBgRatio: typeof slotFrameAudit.domFrameMinNonBgRatio === "number" ? slotFrameAudit.domFrameMinNonBgRatio : null,
      frameSelectionMode: frameSelection.frameSelectionMode,
      gifSourceUrl: frameSelection.gifSourceUrl || null,
      originalGifUrl: frameSelection.originalGifUrl || frameSelection.gifSourceUrl || null,
      gifFrameCandidates: compactGifFrameCandidates(frameSelection.gifFrameCandidates, frameSelection.gifChosenFrameIndex),
      gifFrameCandidateTotal: Array.isArray(frameSelection.gifFrameCandidates) ? frameSelection.gifFrameCandidates.length : 0,
      gifAllowedFrameRanges: videoMedia ? [] : (Array.isArray(frameSelection.gifAllowedFrameRanges) ? frameSelection.gifAllowedFrameRanges : []),
      gifChosenFrameIndex: frameSelection.gifChosenFrameIndex ?? null,
      gifChosenDurationMs: frameSelection.gifChosenDurationMs ?? null,
      gifUsefulFrameCount: frameSelection.gifUsefulFrameCount ?? null,
      captureOnly: frameSelection.captureOnly === true,
      syntheticHoldMs: frameSelection.syntheticHoldMs ?? null,
      frameSelectionReason: frameSelection.frameSelectionReason || null,
      frameSelectionDowngraded: frameSelection.frameSelectionDowngraded === true,
      frameSelectionDowngradeReason: frameSelection.frameSelectionDowngradeReason || null,
      videoProof,
      visualAudit,
      readinessAudit: finalReadinessAudit || readinessAudit,
      pendingLogFlush,
      slotPng,
      contextPng,
      viewportPng,
      finalPng,
      evidenceFilename,
    };
    writeFileSync(metaJson, JSON.stringify(metadata, null, 2));

    if (args.saveEvidence && args.apiBase && internalCaptureToken) {
      metadata.checklistValidation = await validateCaptureChecklist(args.apiBase, insertion.id, isoDate, compactMetadataForPersistence(metadata));
      writeFileSync(metaJson, JSON.stringify(metadata, null, 2));
    }

    const uploadedStage = trace.start("uploaded");
    if (args.upload) {
      if (!args.spacesEnv) throw new Error("Use --spacesEnv para subir o print ao Spaces.");
      spacesEnv = parseEnvFile(args.spacesEnv);
      if (args.replaceExisting) {
        const titleKey = `Print ${isoDate}`;
        const existingEvidence = (insertion.evidences || []).find((item) => item.titulo && item.titulo.includes(titleKey));
        const archivePlan = buildEvidenceReplacementArchivePlan({
          evidenceUrl: existingEvidence?.arquivoUrl || null,
          bucket: args.spacesBucket,
          competencia: insertion.competencia,
          campaignId: insertion.campanhaId,
          insertionId: insertion.id,
          targetDate: isoDate,
        });
        if (existingEvidence?.arquivoUrl && !archivePlan) {
          throw new Error("evidence_replacement_archive_failed: URL anterior não pertence ao bucket configurado.");
        }
        if (archivePlan) metadata.replacementArchive = archiveEvidenceBeforeReplacement(spacesEnv, args.spacesBucket, archivePlan);
      }
      const competenciaSlug = slugify(insertion.competencia || "sem-competencia").toUpperCase();
      const candidateSegment = args.candidateOnly
        ? `candidates/${slugify(args.runnerJobId || args.jobId || String(Date.now()))}/`
        : "";
      const key = `${args.spacesBasePath}/${competenciaSlug}/${insertion.campanhaId}/${insertion.id}/${candidateSegment}${evidenceFilename}`;
      const uploadedUrl = uploadToSpaces(spacesEnv, args.spacesBucket, key, finalPng);
      publicUrl = appendCacheVersion(uploadedUrl, Date.now());
      remoteFinal = await describeRemoteArtifact(publicUrl);
    }
    trace.finish(uploadedStage, "ok", {
      uploadedUrl: publicUrl,
      remoteStatus: remoteFinal?.status ?? null,
    });

    if (args.saveEvidence && publicUrl) {
      const title = `Print ${isoDate} - ${titleDate} [semi-auto]`;
      await upsertEvidence(args.apiBase, insertion, publicUrl, title, args.replaceExisting);
    }
    if (args.apiBase && internalCaptureToken) {
      await persistCaptureMetadata(args.apiBase, insertion.id, isoDate, compactMetadataForPersistence(metadata));
    }

    const slotInfo = describeLocalImage(slotPng);
    const contextInfo = describeLocalImage(contextPng);
    const viewportInfo = describeLocalImage(viewportPng);
    const finalInfo = describeLocalImage(finalPng);
    const finalInsetInfo = finalProofStyle === "viewport_with_slot_inset"
      ? describeLocalImage(finalPng, buildProofInsetCrop(viewportInfo, slotInfo, Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0)))
      : null;

    artifactRecords.slot = buildArtifactRecord("slot", slotPng, slotInfo);
    artifactRecords.context = buildArtifactRecord("context", contextPng, contextInfo);
    artifactRecords.viewport = buildArtifactRecord("viewport", viewportPng, viewportInfo, {
      trimBottomPx: Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0),
    });
    artifactRecords.final = buildArtifactRecord("final", finalPng, finalInfo, {
      uploadedUrl: publicUrl,
    });
    artifactRecords.finalInset = finalInsetInfo
      ? buildArtifactRecord("finalInset", finalPng, finalInsetInfo)
      : null;
    artifactRecords.metadata = buildArtifactRecord("metadata", metaJson, null);
    if (Array.isArray(frameSelection?.gifFrameCandidates) && frameSelection.gifFrameCandidates.length > 0) {
      const gifSummaryPath = path.join(outDir, `${isoDate}-gif-summary.json`);
      writeFileSync(gifSummaryPath, JSON.stringify({
        frameSelectionMode: frameSelection.frameSelectionMode,
        gifChosenFrameIndex: frameSelection.gifChosenFrameIndex ?? null,
        gifChosenDurationMs: frameSelection.gifChosenDurationMs ?? null,
        gifStrongFrameCount: frameSelection.gifFrameCandidates.filter((item) => item.strongCandidate).length,
        gifFrameCandidates: compactGifFrameCandidates(frameSelection.gifFrameCandidates, frameSelection.gifChosenFrameIndex),
        gifFrameCandidateTotal: frameSelection.gifFrameCandidates.length,
        gifAllowedFrameRanges: Array.isArray(frameSelection.gifAllowedFrameRanges) ? frameSelection.gifAllowedFrameRanges : [],
      }, null, 2));
      artifactRecords.gifSummary = buildArtifactRecord("gifSummary", gifSummaryPath, null);
    }
    if (remoteFinal) {
      artifactRecords.remoteFinal = { kind: "remoteFinal", url: publicUrl, ...remoteFinal };
    }

    const analysis = determineProbableCause({
      errorCode: null,
      artifacts: artifactRecords,
      finalProofStyle,
      slotVisibility,
    });
    const shouldUploadDiagnostics = spacesEnv && shouldPersistDiagnosticArtifacts({
      diagnosticMode: args.diagnosticMode,
      frameSelectionDowngraded: frameSelection.frameSelectionDowngraded === true,
      probableCause: analysis.probableCause,
      slotVisibility,
    });
    const diagnosticUploads = shouldUploadDiagnostics
      ? uploadDiagnosticArtifacts(spacesEnv, args, insertion, isoDate, artifactRecords)
      : {};

    const auditStage = trace.start("audit_evaluated");
    const shouldFetchRemoteAuditStatus = args.apiBase && internalCaptureToken && args.upload && args.saveEvidence;
    const auditPayload = shouldFetchRemoteAuditStatus
      ? await fetchCaptureAuditStatus(args.apiBase, insertion.id, isoDate)
      : null;
    auditStatus = auditPayload?.status || null;
    trace.finish(auditStage, "ok", {
      auditStatus,
      probableCause: analysis.probableCause,
    });
    if (auditStatus === "invalid_audit" || auditStatus === "invalid_url") {
      throw new Error(`capture_audit_failed: status=${auditStatus}; pageDateObserved=${pageDateObserved || "n/a"}; requestedCaptureAt=${effectiveCaptureAt || "n/a"}`);
    }

    if (args.saveEvidence && args.apiBase && internalCaptureToken) {
      const logPayload = {
        date: isoDate,
        log: {
          jobId: args.jobId || null,
          runnerJobId: args.runnerJobId || null,
          captureAt: effectiveCaptureAt,
          reconstruction,
          siteSigla: insertion.siteSigla,
          status: "ok",
          uploadedUrl: publicUrl,
          cacheBustedUrl: publicUrl,
          frameSelectionMode: frameSelection.frameSelectionMode,
          frameSelectionDowngraded: frameSelection.frameSelectionDowngraded === true,
          probableCause: analysis.probableCause,
          confidence: analysis.confidence,
          nextAction: analysis.nextAction,
          summary: {
            gifChosenFrameIndex: frameSelection.gifChosenFrameIndex ?? null,
            gifStrongFrameCount: Array.isArray(frameSelection.gifFrameCandidates) ? frameSelection.gifFrameCandidates.filter((item) => item.strongCandidate).length : 0,
            slotSelector: resolvedSlotSelector,
            contextSelector: resolvedContextSelector || resolvedSlotSelector,
            matchedAdSelector,
            matchedMediaUrl: match.mediaUrl || null,
            pageDateObserved,
            pageDateCanonical: effectiveCaptureAt,
            contentDateSamples,
            retroGate,
            slotVisibility,
            pageScrollMetrics,
            frameTheme: desktopFrameMetadata.frameTheme,
            frameTemplateVersion: desktopFrameMetadata.frameTemplateVersion ?? null,
            frameTemplateSize: desktopFrameMetadata.frameTemplateSize ?? null,
            frameStrictAssetsOk: desktopFrameMetadata.frameStrictAssetsOk === true,
            dynamicFields: Array.isArray(desktopFrameMetadata.dynamicFields) ? desktopFrameMetadata.dynamicFields : [],
            chromeTopTheme: desktopFrameMetadata.chromeTopTheme ?? null,
            tabSurfaceRendered: desktopFrameMetadata.tabSurfaceRendered === true,
            tabTitleRendered: desktopFrameMetadata.tabTitleRendered === true,
            tabIconRendered: desktopFrameMetadata.tabIconRendered === true,
            tabIconFallback: desktopFrameMetadata.tabIconFallback === true,
            chromeFrameHeight: desktopFrameMetadata.chromeFrameHeight,
            taskbarHeight: desktopFrameMetadata.taskbarHeight,
            scrollbarRendered: desktopFrameMetadata.scrollbarRendered,
            scrollbarThumbTop: desktopFrameMetadata.scrollbarThumbTop,
            scrollbarThumbHeight: desktopFrameMetadata.scrollbarThumbHeight,
            finalProofStyle,
            auditStatus,
            artifactHashes: {
              slot: artifactRecords.slot?.sha256 ?? null,
              context: artifactRecords.context?.sha256 ?? null,
              viewport: artifactRecords.viewport?.sha256 ?? null,
              final: artifactRecords.final?.sha256 ?? null,
              remoteFinal: artifactRecords.remoteFinal?.sha256 ?? null,
            },
          },
          stages: trace.stages,
          logPersistence,
          artifacts: {
            ...artifactRecords,
            diagnosticUploads,
          },
          metadata,
        },
      };
      try {
        const logResult = await persistCaptureLogWithRetry(args.apiBase, insertion.id, logPayload, {
          maxAttempts: 3,
          baseBackoffMs: 450,
        });
        logId = logResult?.logId || null;
        logPersistence = { status: "persisted", queued: false, error: null };
      } catch (persistError) {
        const persistErrorMessage = persistError instanceof Error ? persistError.message : String(persistError);
        try {
          enqueuePendingCaptureLog({
            queuedAt: new Date().toISOString(),
            apiBase: args.apiBase,
            insertionId: insertion.id,
            payload: logPayload,
          });
          logPersistence = { status: "pending_queue", queued: true, error: persistErrorMessage };
        } catch (queueError) {
          logPersistence = {
            status: "failed",
            queued: false,
            error: `${persistErrorMessage}; queue=${queueError instanceof Error ? queueError.message : String(queueError)}`,
          };
        }
      }
    } else if (args.apiBase && !internalCaptureToken) {
      logPersistence = { status: "skipped_no_token", queued: false, error: null };
    }

    console.log(JSON.stringify({
      ok: true,
      insertionId: insertion.id,
      slotPng,
      contextPng,
      viewportPng,
      finalPng,
      uploadedUrl: publicUrl,
      metadata: metaJson,
      captureLogId: logId,
      readinessAudit: finalReadinessAudit || readinessAudit,
      logPersistence,
      pendingLogFlush,
      retroGate,
      retroContentProof,
      reconstruction,
      manifestHash: retroContentManifest ? crypto.createHash("sha256").update(JSON.stringify(retroContentManifest)).digest("hex") : null,
      probableCause: analysis.probableCause,
    }, null, 2));
  } catch (error) {
    const internalCaptureToken = process.env.ADOPS_CAPTURE_API_TOKEN || process.env.ADOPS_INTERNAL_API_TOKEN || "";
    const errorCode = detectErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const slotInfo = describeLocalImage(slotPng);
      const contextInfo = describeLocalImage(contextPng);
      const viewportInfo = describeLocalImage(viewportPng);
      const finalInfo = describeLocalImage(finalPng);
      const finalInsetInfo = finalProofStyle === "viewport_with_slot_inset" && slotInfo && viewportInfo
        ? describeLocalImage(finalPng, buildProofInsetCrop(viewportInfo, slotInfo, Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0)))
        : null;

      artifactRecords.slot = artifactRecords.slot ?? buildArtifactRecord("slot", slotPng, slotInfo);
      artifactRecords.context = artifactRecords.context ?? buildArtifactRecord("context", contextPng, contextInfo);
      artifactRecords.viewport = artifactRecords.viewport ?? buildArtifactRecord("viewport", viewportPng, viewportInfo, {
        trimBottomPx: Number(mapping.auditConfig?.viewportTrimBottomPx ?? 0),
      });
      artifactRecords.final = artifactRecords.final ?? buildArtifactRecord("final", finalPng, finalInfo, {
        uploadedUrl: publicUrl,
      });
      artifactRecords.finalInset = artifactRecords.finalInset ?? (finalInsetInfo
        ? buildArtifactRecord("finalInset", finalPng, finalInsetInfo)
        : null);
      artifactRecords.metadata = artifactRecords.metadata ?? buildArtifactRecord("metadata", metaJson, null);
      if (remoteFinal) {
        artifactRecords.remoteFinal = artifactRecords.remoteFinal ?? { kind: "remoteFinal", url: publicUrl, ...remoteFinal };
      }

      const analysis = determineProbableCause({
        errorCode,
        artifacts: artifactRecords,
        finalProofStyle,
        slotVisibility,
      });

      if (!spacesEnv && args.spacesEnv) {
        try {
          spacesEnv = parseEnvFile(args.spacesEnv);
        } catch {}
      }

      const shouldUploadDiagnostics = spacesEnv && shouldPersistDiagnosticArtifacts({
        diagnosticMode: args.diagnosticMode,
        frameSelectionDowngraded: frameSelection?.frameSelectionDowngraded === true,
        probableCause: analysis.probableCause,
        errorCode,
        auditStatus,
        slotVisibility,
      });
      const diagnosticUploads = shouldUploadDiagnostics
        ? uploadDiagnosticArtifacts(spacesEnv, args, insertion, isoDate, artifactRecords)
        : {};

      const runningStage = trace.stages.at(-1);
      if (runningStage && runningStage.status === "running") {
        trace.finish(runningStage, "error", {
          targetUrl,
          resolvedSlotSelector,
          resolvedContextSelector,
          finalProofStyle,
        }, errorCode, errorMessage);
      }

      if (args.apiBase && internalCaptureToken) {
        const logResult = await persistCaptureLogWithRetry(args.apiBase, insertion.id, {
          date: isoDate,
          log: {
            jobId: args.jobId || null,
            runnerJobId: args.runnerJobId || null,
            captureAt: effectiveCaptureAt,
            reconstruction,
            siteSigla: insertion.siteSigla,
            status: "failed",
            uploadedUrl: publicUrl,
            cacheBustedUrl: publicUrl,
            frameSelectionMode: frameSelection?.frameSelectionMode || null,
            frameSelectionDowngraded: frameSelection?.frameSelectionDowngraded === true,
            probableCause: analysis.probableCause,
            confidence: analysis.confidence,
            nextAction: analysis.nextAction,
            summary: {
              gifChosenFrameIndex: frameSelection?.gifChosenFrameIndex ?? null,
              gifStrongFrameCount: Array.isArray(frameSelection?.gifFrameCandidates)
                ? frameSelection.gifFrameCandidates.filter((item) => item.strongCandidate).length
                : 0,
              slotSelector: resolvedSlotSelector,
              contextSelector: resolvedContextSelector || resolvedSlotSelector,
              matchedAdSelector: match?.matchedSelector || null,
              matchedMediaUrl: match?.mediaUrl || null,
              pageDateObserved,
              pageDateCanonical: effectiveCaptureAt,
              contentDateSamples,
              retroGate,
              slotVisibility,
              pageScrollMetrics,
              finalProofStyle,
              auditStatus,
              artifactHashes: {
                slot: artifactRecords.slot?.sha256 ?? null,
                context: artifactRecords.context?.sha256 ?? null,
                viewport: artifactRecords.viewport?.sha256 ?? null,
                final: artifactRecords.final?.sha256 ?? null,
                remoteFinal: artifactRecords.remoteFinal?.sha256 ?? null,
              },
            },
            stages: trace.stages,
            logPersistence,
            artifacts: {
              ...artifactRecords,
              diagnosticUploads,
            },
            metadata: metadata || {
              insertionId: insertion.id,
              requestedCaptureAt: effectiveCaptureAt,
              isoDate,
              slotSelector: resolvedSlotSelector,
              contextSelector: resolvedContextSelector || resolvedSlotSelector,
              matchedMediaUrl: match?.mediaUrl || null,
            },
          },
        }, {
          maxAttempts: 3,
          baseBackoffMs: 450,
        });
        logId = logResult?.logId || null;
        logPersistence = { status: "persisted", queued: false, error: null };
      } else if (args.apiBase && !internalCaptureToken) {
        logPersistence = { status: "skipped_no_token", queued: false, error: null };
      }
    } catch (persistError) {
      const persistErrorMessage = persistError instanceof Error ? persistError.message : String(persistError);
      console.error(`Falha ao persistir log estruturado: ${persistErrorMessage}`);
      if (args.apiBase && internalCaptureToken) {
        try {
          enqueuePendingCaptureLog({
            queuedAt: new Date().toISOString(),
            apiBase: args.apiBase,
            insertionId: insertion.id,
            payload: {
              date: isoDate,
              log: {
                jobId: args.jobId || null,
                runnerJobId: args.runnerJobId || null,
                  captureAt: effectiveCaptureAt,
                  reconstruction,
                siteSigla: insertion.siteSigla,
                status: "failed",
                errorCode,
                errorMessage,
                summary: {
                  pageDateObserved,
                  pageDateCanonical: effectiveCaptureAt,
                  contentDateSamples,
                  retroGate,
                  slotVisibility,
                  finalProofStyle,
                },
                stages: trace.stages,
                metadata: metadata || {
                  insertionId: insertion.id,
                  requestedCaptureAt: effectiveCaptureAt,
                  isoDate,
                  slotSelector: resolvedSlotSelector,
                  contextSelector: resolvedContextSelector || resolvedSlotSelector,
                  matchedMediaUrl: match?.mediaUrl || null,
                },
              },
            },
          });
          logPersistence = { status: "pending_queue", queued: true, error: persistErrorMessage };
        } catch (queueError) {
          logPersistence = {
            status: "failed",
            queued: false,
            error: `${persistErrorMessage}; queue=${queueError instanceof Error ? queueError.message : String(queueError)}`,
          };
        }
      } else {
        logPersistence = { status: "failed", queued: false, error: persistErrorMessage };
      }
    }

    throw error;
  } finally {
    await page.close();
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
} else {
  module.exports = {
    applyAflRetroPreview,
    applyOmtRetroPreview,
    applyPerrengueStaticRetroPreview,
    applyPerrengueStaticRetroAd,
    buildStaticRetroSlotPlan,
    shouldAllowConfiguredRetroSlotReconstruction,
    normalizeRetroEditorialPosts,
    buildWordPressArticleApiUrl,
    fetchWordPressArticleCandidates,
    isRejectedArticleCandidateUrl,
    auditArticleCandidatePage,
    normalizePerrengueWpRestBefore,
    resolveFinalCustomerProofStyle,
    evaluateFinalPngSlotAuditResult,
    selectBestFinalPngCreativeIdentityAudit,
    buildFinalPngCreativeReferenceFrames,
    buildReferenceFrameOverlayLayout,
    applyReferenceFrameToDomMediaInPage,
    resolveFinalPngSlotAuditBox,
    auditFinalPngSlotPixels,
    auditFinalPngCreativeIdentityAgainstFrames,
    auditVisibleMediaPixels,
    captureStrictReadinessCandidate,
    normalizeStrictReadinessConfig,
    auditFinalPngHeaderAdPolicy,
    auditHeaderAdPolicy,
    normalizeMediaIdentityUrl,
    parseIsoLikeDate,
    evaluateContentTimeline,
    evaluateRetroContentProof,
    evaluateRetroCaptureGate,
    requiresRetroEditorialProof,
    buildEvidenceReplacementArchivePlan,
  };
}
