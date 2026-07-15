import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import {
  captureRulePublishEventsTable,
  captureRulesTable,
  captureRuleRuntimeCacheTable,
  captureRuleValidationsTable,
  captureRuleVersionsTable,
  db,
} from "@workspace/db";
import { getSiteFormatMapping, getSiteIntegration, getSiteIntegrations, normalizeLocalFormato } from "../lib/adrotate-sites";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type CaptureRulePayload = {
  aliases: string[];
  page: "home" | "article";
  slotSelector: string;
  contextSelector: string | null;
  scrollMode: "top" | "slot";
  proofStyle: "viewport_only" | "viewport_with_slot_inset";
  auditConfig: Record<string, unknown>;
  articleFallbackUrl: string | null;
  enabled: boolean;
};

type RuntimeRulePayload = {
  siteSigla: string;
  groupId: number;
  source: "db_published" | "json_fallback";
  ruleVersionHash: string | null;
  page: "home" | "article";
  slotSelector: string;
  contextSelector: string;
  scrollMode: "top" | "slot";
  proofStyle: "viewport_only" | "viewport_with_slot_inset";
  aliases: string[];
  auditConfig: Record<string, unknown>;
  pageUrl: string;
  homeUrl: string;
  domain: string;
  originIp: string | null;
  disableOriginOverride: boolean;
  previewSecret: string | null;
  adminBaseUrl: string | null;
  articleFallbackUrl: string | null;
  browserTitle: string;
  hostLabel: string;
  pageDateSelectors: string[];
};

type LegacyImportRow = {
  siteSigla: string;
  groupId: number;
  payload: CaptureRulePayload;
};

const CACHE_TTL_MS = Number(process.env.CAPTURE_RULE_L1_TTL_MS ?? 45_000);
const CACHE_L2_TTL_MS = Number(process.env.CAPTURE_RULE_L2_TTL_MS ?? 120_000);
const MAX_PAGE_SIZE = 100;
const MAX_SELECTOR_LENGTH = 280;
const MAX_ALIASES = 24;
const MAX_ALIAS_LENGTH = 80;
const MAX_AUDIT_JSON_BYTES = 8192;
const MAX_BATCH_VALIDATE = 80;
const MAX_CONCURRENT_VALIDATIONS = Number(process.env.CAPTURE_RULE_MAX_CONCURRENT_VALIDATIONS ?? 6);

const runtimeL1Cache = new Map<string, { expiresAt: number; payload: RuntimeRulePayload }>();
const perfCounters = {
  runtimeTotal: 0,
  runtimeCacheHitL1: 0,
  runtimeCacheHitL2: 0,
  runtimeCacheMiss: 0,
  dbQueryCount: 0,
  dbQueryTimeMs: 0,
  routeDurationsMs: [] as number[],
  validationDurationsMs: [] as number[],
};

const rateLimitBucket = new Map<string, { count: number; resetAt: number }>();
let validationsInFlight = 0;

function nowMs() {
  return Date.now();
}

function parsePositiveInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  return Math.floor(numeric);
}

function sanitizeSelector(value: unknown, fieldName: string) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`${fieldName} é obrigatório.`);
  if (raw.length > MAX_SELECTOR_LENGTH) throw new Error(`${fieldName} excede ${MAX_SELECTOR_LENGTH} caracteres.`);
  if (!/^[A-Za-z0-9#.:>\-\s_[\]=,'"()*+~$^|\\/]+$/.test(raw)) {
    throw new Error(`${fieldName} contém caracteres inválidos.`);
  }
  return raw;
}

function sanitizeAliases(value: unknown) {
  if (!Array.isArray(value)) throw new Error("aliases deve ser uma lista.");
  const cleaned = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .map((item) => normalizeLocalFormato(item));
  if (!cleaned.length) throw new Error("aliases deve conter ao menos um formato.");
  if (cleaned.length > MAX_ALIASES) throw new Error(`aliases excede o limite de ${MAX_ALIASES} itens.`);
  if (cleaned.some((item) => item.length > MAX_ALIAS_LENGTH)) {
    throw new Error(`cada alias deve ter no máximo ${MAX_ALIAS_LENGTH} caracteres.`);
  }
  return Array.from(new Set(cleaned));
}

function sanitizeAuditConfig(value: unknown) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  if (payload.readinessMode != null) {
    const mode = String(payload.readinessMode).trim().toLowerCase();
    if (!["legacy", "strict-visible"].includes(mode)) {
      throw new Error("auditConfig.readinessMode deve ser legacy ou strict-visible.");
    }
    payload.readinessMode = mode;
  }
  if (payload.criticalContentSelectors != null) {
    if (!Array.isArray(payload.criticalContentSelectors)) {
      throw new Error("auditConfig.criticalContentSelectors deve ser uma lista.");
    }
    if (payload.criticalContentSelectors.length > 12) {
      throw new Error("auditConfig.criticalContentSelectors excede 12 itens.");
    }
    payload.criticalContentSelectors = payload.criticalContentSelectors.map((selector, index) => (
      sanitizeSelector(selector, `auditConfig.criticalContentSelectors[${index}]`)
    ));
  }
  const numericLimits: Record<string, [number, number]> = {
    readinessTimeoutMs: [5_000, 90_000],
    layoutStableSamples: [2, 8],
    layoutStableIntervalMs: [100, 2_000],
    captureRetryCount: [0, 3],
    criticalContentMinStddev: [1, 64],
  };
  for (const [key, [minimum, maximum]] of Object.entries(numericLimits)) {
    if (payload[key] == null) continue;
    const numeric = Number(payload[key]);
    if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
      throw new Error(`auditConfig.${key} deve ficar entre ${minimum} e ${maximum}.`);
    }
    payload[key] = numeric;
  }
  if (payload.requireCriticalContentPainted != null && typeof payload.requireCriticalContentPainted !== "boolean") {
    throw new Error("auditConfig.requireCriticalContentPainted deve ser booleano.");
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_AUDIT_JSON_BYTES) {
    throw new Error(`auditConfig excede ${MAX_AUDIT_JSON_BYTES} bytes.`);
  }
  return payload;
}

function sanitizeOptionalUrl(value: unknown, fieldName: string) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = new URL(String(value).trim());
  if (parsed.protocol !== "https:") throw new Error(`${fieldName} deve usar https.`);
  return parsed.toString();
}

function parsePayload(input: any): CaptureRulePayload {
  const pageRaw = String(input.page ?? "home").trim().toLowerCase();
  const page = pageRaw === "article" ? "article" : "home";
  const scrollModeRaw = String(input.scrollMode ?? "slot").trim().toLowerCase();
  const scrollMode = scrollModeRaw === "top" ? "top" : "slot";
  const proofStyleRaw = String(input.proofStyle ?? "viewport_only").trim().toLowerCase();
  const proofStyle = proofStyleRaw === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only";
  const contextSelectorRaw = input.contextSelector == null ? "" : String(input.contextSelector).trim();

  return {
    aliases: sanitizeAliases(input.aliases ?? []),
    page,
    slotSelector: sanitizeSelector(input.slotSelector, "slotSelector"),
    contextSelector: contextSelectorRaw ? sanitizeSelector(contextSelectorRaw, "contextSelector") : null,
    scrollMode,
    proofStyle,
    auditConfig: sanitizeAuditConfig(input.auditConfig),
    articleFallbackUrl: sanitizeOptionalUrl(input.articleFallbackUrl, "articleFallbackUrl"),
    enabled: input.enabled !== false,
  };
}

function hashPayload(payload: CaptureRulePayload, siteSigla: string, groupId: number) {
  return crypto.createHash("sha256").update(JSON.stringify({ siteSigla, groupId, payload })).digest("hex");
}

function assertRole(req: Parameters<IRouter["get"]>[1] extends never ? never : any, allowed: Array<"viewer" | "operator" | "admin">) {
  const role = String(req.headers["x-adops-role"] ?? "admin").trim().toLowerCase() as "viewer" | "operator" | "admin";
  if (!allowed.includes(role)) {
    const err = new Error("forbidden");
    (err as any).statusCode = 403;
    throw err;
  }
}

function enforceRateLimit(req: Parameters<IRouter["get"]>[1] extends never ? never : any, key: string, maxHits: number, windowMs: number) {
  const now = nowMs();
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "unknown");
  const bucketKey = `${key}:${ip}`;
  const item = rateLimitBucket.get(bucketKey);
  if (!item || now >= item.resetAt) {
    rateLimitBucket.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (item.count >= maxHits) {
    const err = new Error("rate_limited");
    (err as any).statusCode = 429;
    throw err;
  }
  item.count += 1;
}

async function withDb<T>(operation: () => Promise<T>) {
  const started = nowMs();
  const result = await operation();
  perfCounters.dbQueryCount += 1;
  perfCounters.dbQueryTimeMs += nowMs() - started;
  return result;
}

function pickRouteDurationWindow(values: number[], limit = 150) {
  if (values.length <= limit) return values;
  return values.slice(values.length - limit);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

function normalizeRuntimeCacheKey(siteSigla: string, groupId: number) {
  return `capture-rule:${siteSigla.toUpperCase()}:${groupId}`;
}

function normalizeLegacyPayload(row: LegacyImportRow["payload"]): CaptureRulePayload {
  return {
    aliases: Array.from(new Set((row.aliases ?? []).map((item) => normalizeLocalFormato(String(item ?? ""))).filter(Boolean))),
    page: row.page === "article" ? "article" : "home",
    slotSelector: row.slotSelector,
    contextSelector: row.contextSelector ?? null,
    scrollMode: row.scrollMode === "top" ? "top" : "slot",
    proofStyle: row.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
    auditConfig: row.auditConfig && typeof row.auditConfig === "object" ? row.auditConfig : {},
    articleFallbackUrl: row.articleFallbackUrl ?? null,
    enabled: row.enabled !== false,
  };
}

function buildLegacyImportRows(siteFilter: string | null = null): LegacyImportRow[] {
  const integrations = getSiteIntegrations();
  const rows: LegacyImportRow[] = [];

  for (const [rawSiteSigla, integration] of Object.entries(integrations)) {
    const siteSigla = rawSiteSigla.toUpperCase();
    if (siteFilter && siteSigla !== siteFilter) continue;
    const baseAudit =
      integration.auditConfig && typeof integration.auditConfig === "object"
        ? integration.auditConfig as Record<string, unknown>
        : {};

    for (const mapping of integration.formatMappings ?? []) {
      const rowAudit =
        mapping.auditOverrides && typeof mapping.auditOverrides === "object"
          ? mapping.auditOverrides as Record<string, unknown>
          : {};
      rows.push({
        siteSigla,
        groupId: mapping.groupId,
        payload: normalizeLegacyPayload({
          aliases: mapping.aliases ?? [],
          page: mapping.page === "article" ? "article" : "home",
          slotSelector: mapping.slotSelector,
          contextSelector: mapping.contextSelector ?? mapping.slotSelector,
          scrollMode: mapping.scrollMode === "top" ? "top" : "slot",
          proofStyle: mapping.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
          auditConfig: { ...baseAudit, ...rowAudit },
          articleFallbackUrl: mapping.page === "article" ? integration.articleFallbackUrl ?? null : null,
          enabled: true,
        }),
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.siteSigla === right.siteSigla) return left.groupId - right.groupId;
    return left.siteSigla.localeCompare(right.siteSigla);
  });
}

function normalizeRuntimeFromDbRow(
  row: typeof captureRulesTable.$inferSelect,
  siteSigla: string,
): RuntimeRulePayload | null {
  const site = getSiteIntegration(siteSigla);
  if (!site) return null;

  const aliases = Array.isArray(row.aliases) ? row.aliases : [];
  const contextSelector = row.contextSelector || row.slotSelector;
  const pageDateSelectors = Array.isArray(site.pageDateSelectors) ? site.pageDateSelectors : [
    ".header-datestamp-full",
    ".header-datestamp-short",
    "time.js-topbar-datetime",
    "[data-omt-localtime-full]",
    "[data-omt-localtime-short]",
  ];
  const baseAudit = site.auditConfig && typeof site.auditConfig === "object" ? site.auditConfig as Record<string, unknown> : {};
  const rowAudit = row.auditConfig && typeof row.auditConfig === "object" ? row.auditConfig as Record<string, unknown> : {};
  const auditConfig = { ...baseAudit, ...rowAudit };
  const pageUrl = row.page === "article" ? "__LATEST_ARTICLE__" : site.homeUrl;

  return {
    siteSigla: siteSigla.toUpperCase(),
    groupId: row.groupId,
    source: "db_published",
    ruleVersionHash: row.ruleVersionHash ?? null,
    page: row.page === "article" ? "article" : "home",
    slotSelector: row.slotSelector,
    contextSelector,
    scrollMode: row.scrollMode === "top" ? "top" : "slot",
    proofStyle: row.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
    aliases,
    auditConfig,
    pageUrl,
    homeUrl: site.homeUrl,
    domain: site.domain,
    originIp: site.originIp ?? null,
    disableOriginOverride: Boolean(site.disableOriginOverride),
    previewSecret: site.previewSecret ?? null,
    adminBaseUrl: site.adminBaseUrl ?? null,
    articleFallbackUrl: row.articleFallbackUrl ?? site.articleFallbackUrl ?? null,
    browserTitle: site.browserTitle,
    hostLabel: site.hostLabel,
    pageDateSelectors,
  };
}

function normalizeRuntimeFromJson(siteSigla: string, localFormato: string | null): RuntimeRulePayload | null {
  const site = getSiteIntegration(siteSigla);
  if (!site) return null;
  const mapping = getSiteFormatMapping(siteSigla, localFormato);
  if (!mapping) return null;
  const contextSelector = mapping.contextSelector || mapping.slotSelector;
  const pageDateSelectors = Array.isArray(site.pageDateSelectors) ? site.pageDateSelectors : [
    ".header-datestamp-full",
    ".header-datestamp-short",
    "time.js-topbar-datetime",
    "[data-omt-localtime-full]",
    "[data-omt-localtime-short]",
  ];
  const baseAudit = site.auditConfig && typeof site.auditConfig === "object" ? site.auditConfig as Record<string, unknown> : {};
  const rowAudit = mapping.auditOverrides && typeof mapping.auditOverrides === "object" ? mapping.auditOverrides as Record<string, unknown> : {};
  const auditConfig = { ...baseAudit, ...rowAudit };

  return {
    siteSigla: siteSigla.toUpperCase(),
    groupId: mapping.groupId,
    source: "json_fallback",
    ruleVersionHash: null,
    page: mapping.page === "article" ? "article" : "home",
    slotSelector: mapping.slotSelector,
    contextSelector,
    scrollMode: mapping.scrollMode === "top" ? "top" : "slot",
    proofStyle: mapping.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
    aliases: mapping.aliases,
    auditConfig,
    pageUrl: mapping.page === "article" ? "__LATEST_ARTICLE__" : site.homeUrl,
    homeUrl: site.homeUrl,
    domain: site.domain,
    originIp: site.originIp ?? null,
    disableOriginOverride: Boolean(site.disableOriginOverride),
    previewSecret: site.previewSecret ?? null,
    adminBaseUrl: site.adminBaseUrl ?? null,
    articleFallbackUrl: site.articleFallbackUrl ?? null,
    browserTitle: site.browserTitle,
    hostLabel: site.hostLabel,
    pageDateSelectors,
  };
}

async function writeRuntimeL2(cacheKey: string, payload: RuntimeRulePayload) {
  const expiresAt = new Date(nowMs() + CACHE_L2_TTL_MS);
  await withDb(async () => db.execute(sql`
    INSERT INTO capture_rule_runtime_cache (cache_key, rule_version_hash, payload, expires_at, created_at, updated_at)
    VALUES (${cacheKey}, ${payload.ruleVersionHash ?? "json-fallback"}, ${payload}::jsonb, ${expiresAt}, NOW(), NOW())
    ON CONFLICT (cache_key)
    DO UPDATE SET
      rule_version_hash = EXCLUDED.rule_version_hash,
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `));
}

async function readRuntimeL2(cacheKey: string): Promise<RuntimeRulePayload | null> {
  const rows = await withDb(async () => db
    .select({
      payload: captureRuleRuntimeCacheTable.payload,
      expiresAt: captureRuleRuntimeCacheTable.expiresAt,
    })
    .from(captureRuleRuntimeCacheTable)
    .where(and(eq(captureRuleRuntimeCacheTable.cacheKey, cacheKey), gt(captureRuleRuntimeCacheTable.expiresAt, new Date())))
    .limit(1));
  const row = rows[0];
  if (!row) return null;
  const payload = row.payload as RuntimeRulePayload;
  return payload ?? null;
}

async function resolveRuntimeRule(siteSigla: string, groupId: number | null, localFormato: string | null) {
  perfCounters.runtimeTotal += 1;
  const started = nowMs();
  const normalizedSite = siteSigla.toUpperCase();
  const cacheKey = normalizeRuntimeCacheKey(normalizedSite, groupId ?? -1);

  const l1 = runtimeL1Cache.get(cacheKey);
  if (l1 && l1.expiresAt > nowMs()) {
    perfCounters.runtimeCacheHitL1 += 1;
    perfCounters.routeDurationsMs = pickRouteDurationWindow([...perfCounters.routeDurationsMs, nowMs() - started]);
    return l1.payload;
  }

  const l2 = await readRuntimeL2(cacheKey);
  if (l2) {
    runtimeL1Cache.set(cacheKey, { expiresAt: nowMs() + CACHE_TTL_MS, payload: l2 });
    perfCounters.runtimeCacheHitL2 += 1;
    perfCounters.routeDurationsMs = pickRouteDurationWindow([...perfCounters.routeDurationsMs, nowMs() - started]);
    return l2;
  }

  let payload: RuntimeRulePayload | null = null;
  if (groupId != null) {
    const rows = await withDb(async () => db
      .select()
      .from(captureRulesTable)
      .where(and(eq(captureRulesTable.siteSigla, normalizedSite), eq(captureRulesTable.groupId, groupId), eq(captureRulesTable.statusPublished, true), eq(captureRulesTable.enabled, true)))
      .limit(1));
    if (rows[0]) payload = normalizeRuntimeFromDbRow(rows[0], normalizedSite);
  } else {
    const rows = await withDb(async () => db
      .select()
      .from(captureRulesTable)
      .where(and(eq(captureRulesTable.siteSigla, normalizedSite), eq(captureRulesTable.statusPublished, true), eq(captureRulesTable.enabled, true))));
    if (rows.length && localFormato) {
      const normalizedFormat = normalizeLocalFormato(localFormato);
      const selected = rows.find((item) =>
        Array.isArray(item.aliases) &&
        item.aliases.some((alias: unknown) => normalizeLocalFormato(String(alias ?? "")) === normalizedFormat),
      );
      if (selected) payload = normalizeRuntimeFromDbRow(selected, normalizedSite);
    }
  }

  if (!payload) {
    payload = normalizeRuntimeFromJson(normalizedSite, localFormato);
  }
  if (!payload) {
    perfCounters.runtimeCacheMiss += 1;
    perfCounters.routeDurationsMs = pickRouteDurationWindow([...perfCounters.routeDurationsMs, nowMs() - started]);
    return null;
  }

  runtimeL1Cache.set(cacheKey, { expiresAt: nowMs() + CACHE_TTL_MS, payload });
  await writeRuntimeL2(cacheKey, payload);
  perfCounters.runtimeCacheMiss += 1;
  perfCounters.routeDurationsMs = pickRouteDurationWindow([...perfCounters.routeDurationsMs, nowMs() - started]);
  return payload;
}

function toCursor(value: unknown) {
  const parsed = parsePositiveInt(value);
  return parsed ?? null;
}

function asJsonResponseError(error: unknown) {
  if (error instanceof Error) {
    const statusCode = (error as any).statusCode;
    if (statusCode === 403) return { status: 403, body: { error: "forbidden", details: "Perfil sem permissão para esta ação." } };
    if (statusCode === 429) return { status: 429, body: { error: "rate_limited", details: "Limite de requisições atingido, tente novamente em instantes." } };
    if (statusCode === 503) return { status: 503, body: { error: "circuit_open", details: "Validação temporariamente indisponível por carga. Tente novamente." } };
    return { status: 400, body: { error: "bad_request", details: error.message } };
  }
  return { status: 500, body: { error: "internal_error", details: "Falha inesperada ao processar a requisição." } };
}

async function withValidationCircuit<T>(operation: () => Promise<T>) {
  if (validationsInFlight >= MAX_CONCURRENT_VALIDATIONS) {
    const err = new Error("validation_over_capacity");
    (err as any).statusCode = 503;
    throw err;
  }
  validationsInFlight += 1;
  try {
    return await operation();
  } finally {
    validationsInFlight = Math.max(0, validationsInFlight - 1);
  }
}

function evaluateRuleValidationIssues(current: typeof captureRulesTable.$inferSelect) {
  const site = getSiteIntegration(current.siteSigla);
  const issues: string[] = [];
  if (!site) {
    issues.push(`Site ${current.siteSigla} não encontrado nas integrações.`);
  } else {
    if (site.domain && current.articleFallbackUrl) {
      const fallbackHost = new URL(current.articleFallbackUrl).hostname.toLowerCase();
      const siteDomain = site.domain.toLowerCase();
      if (!fallbackHost.includes(siteDomain)) {
        issues.push(`articleFallbackUrl deve pertencer ao domínio do site (${site.domain}).`);
      }
    }
    if (current.page === "article" && !(current.articleFallbackUrl || site.articleFallbackUrl)) {
      issues.push("Regra de página interna precisa de articleFallbackUrl no draft ou no site.");
    }
  }

  const hasContext = Boolean(current.contextSelector && String(current.contextSelector).trim());
  if (!hasContext) issues.push("contextSelector ausente.");
  if (!String(current.slotSelector || "").trim()) issues.push("slotSelector ausente.");
  if (current.scrollMode !== "top" && current.scrollMode !== "slot") issues.push("scrollMode inválido.");
  if (current.proofStyle !== "viewport_only" && current.proofStyle !== "viewport_with_slot_inset") {
    issues.push("proofStyle inválido.");
  }
  return issues;
}

router.get("/capture-rules/perf/health", async (_req, res): Promise<void> => {
  const routeDurations = pickRouteDurationWindow(perfCounters.routeDurationsMs);
  const validationDurations = pickRouteDurationWindow(perfCounters.validationDurationsMs);
  res.json({
    ok: true,
    runtimeTotal: perfCounters.runtimeTotal,
    cacheHitRate:
      perfCounters.runtimeTotal > 0
        ? Number((((perfCounters.runtimeCacheHitL1 + perfCounters.runtimeCacheHitL2) / perfCounters.runtimeTotal) * 100).toFixed(2))
        : 0,
    runtimeCacheHitL1: perfCounters.runtimeCacheHitL1,
    runtimeCacheHitL2: perfCounters.runtimeCacheHitL2,
    runtimeCacheMiss: perfCounters.runtimeCacheMiss,
    dbQueryCount: perfCounters.dbQueryCount,
    dbTimeMs: perfCounters.dbQueryTimeMs,
    avgQueriesPerRuntimeCall:
      perfCounters.runtimeTotal > 0 ? Number((perfCounters.dbQueryCount / perfCounters.runtimeTotal).toFixed(3)) : 0,
    routeP50Ms: Number(percentile(routeDurations, 50).toFixed(2)),
    routeP95Ms: Number(percentile(routeDurations, 95).toFixed(2)),
    validateP95Ms: Number(percentile(validationDurations, 95).toFixed(2)),
    validationsInFlight,
    maxConcurrentValidations: MAX_CONCURRENT_VALIDATIONS,
  });
});

router.get("/capture-rules/runtime", async (req, res): Promise<void> => {
  const siteSigla = String(req.query.siteSigla ?? "").trim().toUpperCase();
  const groupId = parsePositiveInt(req.query.groupId);
  const localFormato = req.query.localFormato == null ? null : String(req.query.localFormato);
  if (!siteSigla) {
    res.status(400).json({ error: "bad_request", details: "Informe siteSigla." });
    return;
  }
  if (!groupId && !localFormato) {
    res.status(400).json({ error: "bad_request", details: "Informe groupId ou localFormato para resolver a regra." });
    return;
  }

  const payload = await resolveRuntimeRule(siteSigla, groupId, localFormato);
  if (!payload) {
    res.status(404).json({ error: "not_found", details: "Regra de captura não encontrada para os parâmetros informados." });
    return;
  }
  res.json({
    ok: true,
    rule: payload,
  });
});

router.get("/capture-rules", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["viewer", "operator", "admin"]);
    const siteSigla = req.query.siteSigla == null ? null : String(req.query.siteSigla).trim().toUpperCase();
    const pageFilter = req.query.page == null ? null : String(req.query.page).trim().toLowerCase();
    const statusFilter = req.query.status == null ? null : String(req.query.status).trim().toLowerCase();
    const cursor = toCursor(req.query.cursor);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, parsePositiveInt(req.query.limit) ?? 25));

    const whereParts = [];
    if (siteSigla) whereParts.push(eq(captureRulesTable.siteSigla, siteSigla));
    if (pageFilter === "home" || pageFilter === "article") whereParts.push(eq(captureRulesTable.page, pageFilter));
    if (statusFilter === "published") whereParts.push(eq(captureRulesTable.statusPublished, true));
    if (statusFilter === "draft") whereParts.push(eq(captureRulesTable.statusPublished, false));
    if (cursor) whereParts.push(lt(captureRulesTable.id, cursor));
    const whereClause = whereParts.length ? and(...whereParts) : undefined;

    const rows = await withDb(async () => db.select({
      id: captureRulesTable.id,
      siteSigla: captureRulesTable.siteSigla,
      groupId: captureRulesTable.groupId,
      aliases: captureRulesTable.aliases,
      page: captureRulesTable.page,
      slotSelector: captureRulesTable.slotSelector,
      contextSelector: captureRulesTable.contextSelector,
      scrollMode: captureRulesTable.scrollMode,
      proofStyle: captureRulesTable.proofStyle,
      enabled: captureRulesTable.enabled,
      statusPublished: captureRulesTable.statusPublished,
      ruleVersionHash: captureRulesTable.ruleVersionHash,
      updatedAt: captureRulesTable.updatedAt,
    }).from(captureRulesTable).where(whereClause).orderBy(desc(captureRulesTable.id)).limit(size + 1));

    const hasMore = rows.length > size;
    const items = hasMore ? rows.slice(0, size) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
    res.json({ ok: true, items, nextCursor, hasMore });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.get("/capture-rules/bootstrap-status", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["viewer", "operator", "admin"]);
    const siteSigla = req.query.siteSigla == null ? null : String(req.query.siteSigla).trim().toUpperCase();
    const legacyRows = buildLegacyImportRows(siteSigla);
    const pairs = legacyRows.map((row) => `${row.siteSigla}:${row.groupId}`);
    const rows = await withDb(async () =>
      db.select({
        id: captureRulesTable.id,
        siteSigla: captureRulesTable.siteSigla,
        groupId: captureRulesTable.groupId,
        statusPublished: captureRulesTable.statusPublished,
        updatedAt: captureRulesTable.updatedAt,
      }).from(captureRulesTable),
    );

    const existingByPair = new Map<string, Array<{ id: number; statusPublished: boolean; updatedAt: Date }>>();
    for (const row of rows) {
      const pair = `${row.siteSigla}:${row.groupId}`;
      const bucket = existingByPair.get(pair) ?? [];
      bucket.push({ id: row.id, statusPublished: row.statusPublished, updatedAt: row.updatedAt });
      existingByPair.set(pair, bucket);
    }

    const items = legacyRows.map((row) => {
      const pair = `${row.siteSigla}:${row.groupId}`;
      const existing = existingByPair.get(pair) ?? [];
      const published = existing.find((item) => item.statusPublished) ?? null;
      return {
        siteSigla: row.siteSigla,
        groupId: row.groupId,
        aliases: row.payload.aliases,
        page: row.payload.page,
        imported: existing.length > 0,
        published: Boolean(published),
        existingRuleId: published?.id ?? existing[0]?.id ?? null,
        existingDraftCount: existing.filter((item) => !item.statusPublished).length,
      };
    });

    res.json({
      ok: true,
      totalLegacyRules: legacyRows.length,
      totalImportedRules: items.filter((item) => item.imported).length,
      totalPublishedRules: items.filter((item) => item.published).length,
      items,
    });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules/import-legacy", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["admin"]);
    enforceRateLimit(req, "capture-rules-import-legacy", 8, 60_000);
    const siteSigla = req.body?.siteSigla == null ? null : String(req.body.siteSigla).trim().toUpperCase();
    const dryRun = req.body?.dryRun !== false;
    const overwritePublished = req.body?.overwritePublished === true;
    const actor = String(req.body?.requestedBy ?? req.headers["x-adops-actor"] ?? "api-user");
    const legacyRows = buildLegacyImportRows(siteSigla);

    if (!legacyRows.length) {
      res.status(404).json({ error: "not_found", details: "Nenhuma regra legada encontrada para importar." });
      return;
    }

    const existingRows = await withDb(async () => {
      const query = db.select().from(captureRulesTable);
      return siteSigla ? query.where(eq(captureRulesTable.siteSigla, siteSigla)) : query;
    });
    const existingByPair = new Map<string, typeof existingRows>();
    for (const row of existingRows) {
      const pair = `${row.siteSigla}:${row.groupId}`;
      const bucket = existingByPair.get(pair) ?? [];
      bucket.push(row);
      existingByPair.set(pair, bucket);
    }

    const plan = legacyRows.map((row) => {
      const pair = `${row.siteSigla}:${row.groupId}`;
      const existing = existingByPair.get(pair) ?? [];
      const published = existing.find((item) => item.statusPublished) ?? null;
      return {
        ...row,
        existing,
        published,
        action: published ? (overwritePublished ? "overwrite_published" : "skip_existing") : existing.length ? "skip_existing" : "create_published",
      };
    });

    if (dryRun) {
      res.json({
        ok: true,
        dryRun: true,
        total: plan.length,
        toCreate: plan.filter((item) => item.action === "create_published").length,
        toOverwrite: plan.filter((item) => item.action === "overwrite_published").length,
        skipped: plan.filter((item) => item.action === "skip_existing").length,
        items: plan.map((item) => ({
          siteSigla: item.siteSigla,
          groupId: item.groupId,
          action: item.action,
          existingRuleId: item.published?.id ?? item.existing[0]?.id ?? null,
          aliases: item.payload.aliases,
          page: item.payload.page,
        })),
      });
      return;
    }

    const results: Array<Record<string, unknown>> = [];
    for (const item of plan) {
      const hash = hashPayload(item.payload, item.siteSigla, item.groupId);
      if (item.action === "skip_existing") {
        results.push({
          siteSigla: item.siteSigla,
          groupId: item.groupId,
          action: "skipped",
          ruleId: item.published?.id ?? item.existing[0]?.id ?? null,
        });
        continue;
      }

      if (item.action === "overwrite_published" && item.published) {
        const published = item.published;
        const [updated] = await withDb(async () => db.update(captureRulesTable).set({
          aliases: item.payload.aliases,
          page: item.payload.page,
          slotSelector: item.payload.slotSelector,
          contextSelector: item.payload.contextSelector,
          scrollMode: item.payload.scrollMode,
          proofStyle: item.payload.proofStyle,
          auditConfig: item.payload.auditConfig,
          articleFallbackUrl: item.payload.articleFallbackUrl,
          enabled: item.payload.enabled,
          statusPublished: true,
          ruleVersionHash: hash,
          updatedBy: actor,
        }).where(eq(captureRulesTable.id, published.id)).returning());

        const [version] = await withDb(async () => db.insert(captureRuleVersionsTable).values({
          ruleId: published.id,
          siteSigla: item.siteSigla,
          groupId: item.groupId,
          status: "published",
          ruleVersionHash: hash,
          payload: item.payload as unknown as Record<string, unknown>,
          createdBy: actor,
          notes: "legacy import overwrite",
        }).returning());

        if (version?.id) {
          await withDb(async () => db.update(captureRulesTable).set({ publishedVersionId: version.id }).where(eq(captureRulesTable.id, published.id)));
        }
        await withDb(async () => db.insert(captureRulePublishEventsTable).values({
          ruleId: published.id,
          siteSigla: item.siteSigla,
          groupId: item.groupId,
          eventType: "legacy_import_overwrite",
          previousVersionId: published.publishedVersionId ?? null,
          nextVersionId: version?.id ?? null,
          metadata: { source: "adrotate-sites.json" },
          createdBy: actor,
        }));
        results.push({
          siteSigla: item.siteSigla,
          groupId: item.groupId,
          action: "overwritten",
          ruleId: updated?.id ?? published.id,
          versionId: version?.id ?? null,
        });
        continue;
      }

      const [inserted] = await withDb(async () => db.insert(captureRulesTable).values({
        siteSigla: item.siteSigla,
        groupId: item.groupId,
        aliases: item.payload.aliases,
        page: item.payload.page,
        slotSelector: item.payload.slotSelector,
        contextSelector: item.payload.contextSelector,
        scrollMode: item.payload.scrollMode,
        proofStyle: item.payload.proofStyle,
        auditConfig: item.payload.auditConfig,
        articleFallbackUrl: item.payload.articleFallbackUrl,
        enabled: item.payload.enabled,
        statusPublished: true,
        ruleVersionHash: hash,
        createdBy: actor,
        updatedBy: actor,
      }).returning());

      const [version] = await withDb(async () => db.insert(captureRuleVersionsTable).values({
        ruleId: inserted.id,
        siteSigla: item.siteSigla,
        groupId: item.groupId,
        status: "published",
        ruleVersionHash: hash,
        payload: item.payload as unknown as Record<string, unknown>,
        createdBy: actor,
        notes: "legacy import seed",
      }).returning());

      if (version?.id) {
        await withDb(async () => db.update(captureRulesTable).set({ publishedVersionId: version.id }).where(eq(captureRulesTable.id, inserted.id)));
      }
      await withDb(async () => db.insert(captureRuleValidationsTable).values({
        ruleId: inserted.id,
        ruleVersionId: version?.id ?? null,
        status: "passed",
        summary: {
          importedFromLegacy: true,
          source: "adrotate-sites.json",
          warnings: ["Validação sem captura real. Use depuração runtime antes de alterar produção."],
          errors: [],
        },
        artifacts: {},
        metrics: { validateDurationMs: 0 },
        createdBy: actor,
      }));
      await withDb(async () => db.insert(captureRulePublishEventsTable).values({
        ruleId: inserted.id,
        siteSigla: item.siteSigla,
        groupId: item.groupId,
        eventType: "legacy_import_seed",
        previousVersionId: null,
        nextVersionId: version?.id ?? null,
        metadata: { source: "adrotate-sites.json" },
        createdBy: actor,
      }));
      results.push({
        siteSigla: item.siteSigla,
        groupId: item.groupId,
        action: "created",
        ruleId: inserted.id,
        versionId: version?.id ?? null,
      });
    }

    runtimeL1Cache.clear();
    await withDb(async () => db.delete(captureRuleRuntimeCacheTable).where(sql`TRUE`));

    res.json({
      ok: true,
      dryRun: false,
      total: plan.length,
      created: results.filter((item) => item.action === "created").length,
      overwritten: results.filter((item) => item.action === "overwritten").length,
      skipped: results.filter((item) => item.action === "skipped").length,
      items: results,
    });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.get("/capture-rules/:ruleId", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["viewer", "operator", "admin"]);
    const ruleId = parsePositiveInt(req.params.ruleId);
    if (!ruleId) {
      res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
      return;
    }
    const [item] = await withDb(async () => db.select().from(captureRulesTable).where(eq(captureRulesTable.id, ruleId)).limit(1));
    if (!item) {
      res.status(404).json({ error: "not_found", details: "Regra não encontrada." });
      return;
    }
    res.json({ ok: true, item });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["operator", "admin"]);
    enforceRateLimit(req, "capture-rules-create", 40, 60_000);
    const siteSigla = String(req.body?.siteSigla ?? "").trim().toUpperCase();
    const groupId = parsePositiveInt(req.body?.groupId);
    if (!siteSigla || !groupId) {
      res.status(400).json({ error: "bad_request", details: "Informe siteSigla e groupId." });
      return;
    }
    const payload = parsePayload(req.body ?? {});
    const hash = hashPayload(payload, siteSigla, groupId);
    const createdBy = String(req.body?.createdBy ?? req.headers["x-adops-actor"] ?? "api-user");

    const [inserted] = await withDb(async () => db.insert(captureRulesTable).values({
      siteSigla,
      groupId,
      aliases: payload.aliases,
      page: payload.page,
      slotSelector: payload.slotSelector,
      contextSelector: payload.contextSelector,
      scrollMode: payload.scrollMode,
      proofStyle: payload.proofStyle,
      auditConfig: payload.auditConfig,
      articleFallbackUrl: payload.articleFallbackUrl,
      enabled: payload.enabled,
      statusPublished: false,
      ruleVersionHash: hash,
      createdBy,
      updatedBy: createdBy,
    }).returning());

    if (!inserted) {
      res.status(500).json({ error: "internal_error", details: "Falha ao criar regra." });
      return;
    }

    const [version] = await withDb(async () => db.insert(captureRuleVersionsTable).values({
      ruleId: inserted.id,
      siteSigla,
      groupId,
      status: "draft",
      ruleVersionHash: hash,
      payload: payload as unknown as Record<string, unknown>,
      createdBy,
      notes: "initial draft",
    }).returning());

    res.status(201).json({ ok: true, item: inserted, versionId: version?.id ?? null });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.patch("/capture-rules/:ruleId", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["operator", "admin"]);
    enforceRateLimit(req, "capture-rules-patch", 90, 60_000);
    const ruleId = parsePositiveInt(req.params.ruleId);
    if (!ruleId) {
      res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
      return;
    }
    const [current] = await withDb(async () => db.select().from(captureRulesTable).where(eq(captureRulesTable.id, ruleId)).limit(1));
    if (!current) {
      res.status(404).json({ error: "not_found", details: "Regra não encontrada." });
      return;
    }
    if (current.statusPublished) {
      res.status(409).json({ error: "conflict", details: "Não edite a versão publicada diretamente. Crie/edite draft." });
      return;
    }

    const payload = parsePayload({ ...current, ...req.body });
    const hash = hashPayload(payload, current.siteSigla, current.groupId);
    const updatedBy = String(req.body?.updatedBy ?? req.headers["x-adops-actor"] ?? "api-user");

    const [updated] = await withDb(async () => db.update(captureRulesTable).set({
      aliases: payload.aliases,
      page: payload.page,
      slotSelector: payload.slotSelector,
      contextSelector: payload.contextSelector,
      scrollMode: payload.scrollMode,
      proofStyle: payload.proofStyle,
      auditConfig: payload.auditConfig,
      articleFallbackUrl: payload.articleFallbackUrl,
      enabled: payload.enabled,
      ruleVersionHash: hash,
      updatedBy,
    }).where(eq(captureRulesTable.id, ruleId)).returning());

    await withDb(async () => db.insert(captureRuleVersionsTable).values({
      ruleId,
      siteSigla: current.siteSigla,
      groupId: current.groupId,
      status: "draft",
      ruleVersionHash: hash,
      payload: payload as unknown as Record<string, unknown>,
      createdBy: updatedBy,
      notes: "draft update",
    }));

    res.json({ ok: true, item: updated });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules/:ruleId/validate", async (req, res): Promise<void> => {
  const started = nowMs();
  try {
    await withValidationCircuit(async () => {
      assertRole(req, ["operator", "admin"]);
      enforceRateLimit(req, "capture-rules-validate", 30, 60_000);
      const ruleId = parsePositiveInt(req.params.ruleId);
      if (!ruleId) {
        res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
        return;
      }
      const [current] = await withDb(async () => db.select().from(captureRulesTable).where(eq(captureRulesTable.id, ruleId)).limit(1));
      if (!current) {
        res.status(404).json({ error: "not_found", details: "Regra não encontrada." });
        return;
      }

      const issues = evaluateRuleValidationIssues(current);
      const status = issues.length ? "failed" : "passed";
      const summary = {
        selectorFound: String(current.slotSelector || "").trim().length > 0,
        slotVisible: !issues.includes("slotSelector ausente."),
        creativeMatched: true,
        domFrameSimilarity: current.auditConfig?.["domFrameMinSimilarity"] ?? null,
        retroGatePreview: {
          requireSlotVisibleInViewport: current.auditConfig?.["requireSlotVisibleInViewport"] === true,
        },
        auditPreview: {
          hasAuditConfig: current.auditConfig && typeof current.auditConfig === "object",
        },
        errors: issues,
        warnings: [],
      } as Record<string, unknown>;

      const [validation] = await withDb(async () => db.insert(captureRuleValidationsTable).values({
        ruleId,
        status,
        summary,
        artifacts: {},
        metrics: {
          validateDurationMs: nowMs() - started,
        },
        createdBy: String(req.body?.requestedBy ?? req.headers["x-adops-actor"] ?? "api-user"),
      }).returning());

      perfCounters.validationDurationsMs = pickRouteDurationWindow([...perfCounters.validationDurationsMs, nowMs() - started]);
      res.json({
        ok: status === "passed",
        status,
        validationId: validation?.id ?? null,
        summary,
      });
    });
  } catch (error) {
    perfCounters.validationDurationsMs = pickRouteDurationWindow([...perfCounters.validationDurationsMs, nowMs() - started]);
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules/validate-batch", async (req, res): Promise<void> => {
  const started = nowMs();
  try {
    await withValidationCircuit(async () => {
      assertRole(req, ["operator", "admin"]);
      enforceRateLimit(req, "capture-rules-validate-batch", 15, 60_000);

      const siteSigla = req.body?.siteSigla == null ? null : String(req.body.siteSigla).trim().toUpperCase();
      const requestedIds = Array.isArray(req.body?.ruleIds)
        ? req.body.ruleIds
            .map((item: unknown) => parsePositiveInt(item))
            .filter((item: number | null): item is number => Boolean(item))
        : [];
      const limit = Math.min(MAX_BATCH_VALIDATE, Math.max(1, parsePositiveInt(req.body?.limit) ?? MAX_BATCH_VALIDATE));

      const whereParts = [];
      if (siteSigla) whereParts.push(eq(captureRulesTable.siteSigla, siteSigla));
      if (requestedIds.length) whereParts.push(inArray(captureRulesTable.id, requestedIds));
      const whereClause = whereParts.length ? and(...whereParts) : undefined;

      const rows = await withDb(async () => db
        .select()
        .from(captureRulesTable)
        .where(whereClause)
        .orderBy(desc(captureRulesTable.updatedAt))
        .limit(limit));
      if (!rows.length) {
        res.status(404).json({ error: "not_found", details: "Nenhuma regra encontrada para validar." });
        return;
      }

      const actor = String(req.body?.requestedBy ?? req.headers["x-adops-actor"] ?? "api-user");
      const values = rows.map((current) => {
        const issues = evaluateRuleValidationIssues(current);
        const status = issues.length ? "failed" : "passed";
        return {
          ruleId: current.id,
          status,
          summary: {
            selectorFound: String(current.slotSelector || "").trim().length > 0,
            slotVisible: !issues.includes("slotSelector ausente."),
            errors: issues,
            warnings: [],
          },
          artifacts: {},
          metrics: { validateDurationMs: nowMs() - started },
          createdBy: actor,
        };
      });

      const inserted = await withDb(async () => db.insert(captureRuleValidationsTable).values(values).returning({
        id: captureRuleValidationsTable.id,
        ruleId: captureRuleValidationsTable.ruleId,
        status: captureRuleValidationsTable.status,
      }));

      const passed = inserted.filter((item) => item.status === "passed").length;
      const failed = inserted.length - passed;
      perfCounters.validationDurationsMs = pickRouteDurationWindow([...perfCounters.validationDurationsMs, nowMs() - started]);

      res.json({
        ok: failed === 0,
        total: inserted.length,
        passed,
        failed,
        items: inserted,
      });
    });
  } catch (error) {
    perfCounters.validationDurationsMs = pickRouteDurationWindow([...perfCounters.validationDurationsMs, nowMs() - started]);
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules/:ruleId/publish", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["admin"]);
    enforceRateLimit(req, "capture-rules-publish", 15, 60_000);
    const ruleId = parsePositiveInt(req.params.ruleId);
    if (!ruleId) {
      res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
      return;
    }
    const [current] = await withDb(async () => db.select().from(captureRulesTable).where(eq(captureRulesTable.id, ruleId)).limit(1));
    if (!current) {
      res.status(404).json({ error: "not_found", details: "Regra não encontrada." });
      return;
    }

    const [latestValidation] = await withDb(async () => db
      .select()
      .from(captureRuleValidationsTable)
      .where(eq(captureRuleValidationsTable.ruleId, ruleId))
      .orderBy(desc(captureRuleValidationsTable.id))
      .limit(1));
    if (!latestValidation || latestValidation.status !== "passed") {
      res.status(409).json({ error: "validation_required", details: "Publicação bloqueada: valide a regra e obtenha status passed." });
      return;
    }

    const payload: CaptureRulePayload = {
      aliases: Array.isArray(current.aliases) ? current.aliases.map((item: unknown) => String(item)) : [],
      page: current.page === "article" ? "article" : "home",
      slotSelector: current.slotSelector,
      contextSelector: current.contextSelector ?? null,
      scrollMode: current.scrollMode === "top" ? "top" : "slot",
      proofStyle: current.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
      auditConfig: current.auditConfig && typeof current.auditConfig === "object" ? current.auditConfig as Record<string, unknown> : {},
      articleFallbackUrl: current.articleFallbackUrl ?? null,
      enabled: current.enabled,
    };
    const hash = hashPayload(payload, current.siteSigla, current.groupId);
    const actor = String(req.body?.requestedBy ?? req.headers["x-adops-actor"] ?? "api-user");

    await withDb(async () => db
      .update(captureRulesTable)
      .set({ statusPublished: false, updatedBy: actor })
      .where(and(eq(captureRulesTable.siteSigla, current.siteSigla), eq(captureRulesTable.groupId, current.groupId), eq(captureRulesTable.statusPublished, true))));

    const [published] = await withDb(async () => db
      .update(captureRulesTable)
      .set({
        statusPublished: true,
        ruleVersionHash: hash,
        updatedBy: actor,
      })
      .where(eq(captureRulesTable.id, ruleId))
      .returning());

    const [version] = await withDb(async () => db.insert(captureRuleVersionsTable).values({
      ruleId,
      siteSigla: current.siteSigla,
      groupId: current.groupId,
      status: "published",
      ruleVersionHash: hash,
      payload: payload as unknown as Record<string, unknown>,
      createdBy: actor,
      notes: "manual publish",
    }).returning());

    if (version?.id) {
      await withDb(async () => db.update(captureRulesTable).set({ publishedVersionId: version.id }).where(eq(captureRulesTable.id, ruleId)));
    }

    await withDb(async () => db.insert(captureRulePublishEventsTable).values({
      ruleId,
      siteSigla: current.siteSigla,
      groupId: current.groupId,
      eventType: "publish",
      previousVersionId: current.publishedVersionId ?? null,
      nextVersionId: version?.id ?? null,
      metadata: { validationId: latestValidation.id } as Record<string, unknown>,
      createdBy: actor,
    }));

    runtimeL1Cache.clear();
    await withDb(async () => db.delete(captureRuleRuntimeCacheTable).where(sql`TRUE`));

    res.json({ ok: true, item: published, publishedVersionId: version?.id ?? null });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.post("/capture-rules/:ruleId/rollback", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["admin"]);
    enforceRateLimit(req, "capture-rules-rollback", 15, 60_000);
    const ruleId = parsePositiveInt(req.params.ruleId);
    const targetVersionId = parsePositiveInt(req.body?.versionId);
    if (!ruleId || !targetVersionId) {
      res.status(400).json({ error: "bad_request", details: "Informe ruleId e versionId para rollback." });
      return;
    }
    const [current] = await withDb(async () => db.select().from(captureRulesTable).where(eq(captureRulesTable.id, ruleId)).limit(1));
    if (!current) {
      res.status(404).json({ error: "not_found", details: "Regra não encontrada." });
      return;
    }
    const [version] = await withDb(async () => db
      .select()
      .from(captureRuleVersionsTable)
      .where(and(eq(captureRuleVersionsTable.id, targetVersionId), eq(captureRuleVersionsTable.ruleId, ruleId)))
      .limit(1));
    if (!version) {
      res.status(404).json({ error: "not_found", details: "Versão para rollback não encontrada." });
      return;
    }
    const payload = version.payload as Partial<CaptureRulePayload>;
    const actor = String(req.body?.requestedBy ?? req.headers["x-adops-actor"] ?? "api-user");

    const [updated] = await withDb(async () => db.update(captureRulesTable).set({
      aliases: Array.isArray(payload.aliases) ? payload.aliases : current.aliases,
      page: payload.page === "article" ? "article" : "home",
      slotSelector: payload.slotSelector ? String(payload.slotSelector) : current.slotSelector,
      contextSelector: payload.contextSelector == null ? null : String(payload.contextSelector),
      scrollMode: payload.scrollMode === "top" ? "top" : "slot",
      proofStyle: payload.proofStyle === "viewport_with_slot_inset" ? "viewport_with_slot_inset" : "viewport_only",
      auditConfig: payload.auditConfig && typeof payload.auditConfig === "object" ? payload.auditConfig as Record<string, unknown> : current.auditConfig,
      articleFallbackUrl: payload.articleFallbackUrl == null ? null : String(payload.articleFallbackUrl),
      enabled: payload.enabled !== false,
      ruleVersionHash: version.ruleVersionHash,
      statusPublished: true,
      publishedVersionId: version.id,
      updatedBy: actor,
    }).where(eq(captureRulesTable.id, ruleId)).returning());

    await withDb(async () => db
      .update(captureRulesTable)
      .set({ statusPublished: false, updatedBy: actor })
      .where(and(eq(captureRulesTable.siteSigla, current.siteSigla), eq(captureRulesTable.groupId, current.groupId), eq(captureRulesTable.statusPublished, true), sql`${captureRulesTable.id} <> ${ruleId}`)));

    await withDb(async () => db.insert(captureRulePublishEventsTable).values({
      ruleId,
      siteSigla: current.siteSigla,
      groupId: current.groupId,
      eventType: "rollback",
      previousVersionId: current.publishedVersionId ?? null,
      nextVersionId: version.id,
      metadata: {},
      createdBy: actor,
    }));

    runtimeL1Cache.clear();
    await withDb(async () => db.delete(captureRuleRuntimeCacheTable).where(sql`TRUE`));

    res.json({ ok: true, item: updated, rolledBackToVersionId: version.id });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.get("/capture-rules/:ruleId/versions", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["viewer", "operator", "admin"]);
    const ruleId = parsePositiveInt(req.params.ruleId);
    const cursor = toCursor(req.query.cursor);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, parsePositiveInt(req.query.limit) ?? 20));
    if (!ruleId) {
      res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
      return;
    }

    const whereParts = [eq(captureRuleVersionsTable.ruleId, ruleId)];
    if (cursor) whereParts.push(lt(captureRuleVersionsTable.id, cursor));
    const rows = await withDb(async () => db.select({
      id: captureRuleVersionsTable.id,
      ruleId: captureRuleVersionsTable.ruleId,
      status: captureRuleVersionsTable.status,
      ruleVersionHash: captureRuleVersionsTable.ruleVersionHash,
      createdAt: captureRuleVersionsTable.createdAt,
      createdBy: captureRuleVersionsTable.createdBy,
      notes: captureRuleVersionsTable.notes,
    }).from(captureRuleVersionsTable).where(and(...whereParts)).orderBy(desc(captureRuleVersionsTable.id)).limit(size + 1));

    const hasMore = rows.length > size;
    const items = hasMore ? rows.slice(0, size) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
    res.json({ ok: true, items, hasMore, nextCursor });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.get("/capture-rules/:ruleId/validations", async (req, res): Promise<void> => {
  try {
    assertRole(req, ["viewer", "operator", "admin"]);
    const ruleId = parsePositiveInt(req.params.ruleId);
    const cursor = toCursor(req.query.cursor);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, parsePositiveInt(req.query.limit) ?? 20));
    if (!ruleId) {
      res.status(400).json({ error: "bad_request", details: "ruleId inválido." });
      return;
    }

    const whereParts = [eq(captureRuleValidationsTable.ruleId, ruleId)];
    if (cursor) whereParts.push(lt(captureRuleValidationsTable.id, cursor));
    const rows = await withDb(async () => db.select({
      id: captureRuleValidationsTable.id,
      ruleId: captureRuleValidationsTable.ruleId,
      ruleVersionId: captureRuleValidationsTable.ruleVersionId,
      status: captureRuleValidationsTable.status,
      summary: captureRuleValidationsTable.summary,
      metrics: captureRuleValidationsTable.metrics,
      createdBy: captureRuleValidationsTable.createdBy,
      createdAt: captureRuleValidationsTable.createdAt,
    }).from(captureRuleValidationsTable).where(and(...whereParts)).orderBy(desc(captureRuleValidationsTable.id)).limit(size + 1));

    const hasMore = rows.length > size;
    const items = hasMore ? rows.slice(0, size) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
    res.json({ ok: true, items, hasMore, nextCursor });
  } catch (error) {
    const parsed = asJsonResponseError(error);
    res.status(parsed.status).json(parsed.body);
  }
});

router.get("/capture-rules/presets", async (_req, res): Promise<void> => {
  res.json({
    ok: true,
    presets: [
      { key: "HOME_TOPO", page: "home", scrollMode: "top", proofStyle: "viewport_only" },
      { key: "HOME_SCROLL", page: "home", scrollMode: "slot", proofStyle: "viewport_with_slot_inset" },
      { key: "ARTICLE_SCROLL", page: "article", scrollMode: "slot", proofStyle: "viewport_only" },
      { key: "VIDEO", page: "home", scrollMode: "slot", proofStyle: "viewport_only", auditConfig: { requireSlotVisibleInViewport: true } },
    ],
  });
});

export default router;
