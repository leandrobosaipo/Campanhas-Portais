import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type SiteFormatMapping = {
  groupId: number;
  aliases: string[];
  inputAliases?: string[];
  page: "home" | "article";
  slotSelector: string;
  contextSelector?: string;
  scrollMode?: "top" | "slot";
  proofStyle?: "viewport_only" | "viewport_with_slot_inset";
  auditOverrides?: Partial<SiteAuditConfig>;
};

export type SiteAuditConfig = {
  animatedBannerDelayMs?: number;
  postVisualWaitMs?: number;
  viewportTrimBottomPx?: number;
  allowViewportImageMisses?: number;
};

export type SiteConsentConfig = {
  selectors?: string[];
  textPatterns?: string[];
};

export type SiteIntegration = {
  sigla: string;
  label: string;
  domain: string;
  homeUrl: string;
  adminBaseUrl?: string;
  originIp?: string | null;
  disableOriginOverride?: boolean;
  previewSecret?: string | null;
  articleFallbackUrl: string | null;
  browserTitle: string;
  hostLabel: string;
  drivePathAliases?: string[];
  pageDateSelectors?: string[];
  auditConfig?: SiteAuditConfig;
  consentConfig?: SiteConsentConfig;
  formatMappings: SiteFormatMapping[];
};

export type SiteFormatResolutionCandidate = {
  groupId: number;
  canonicalFormat: string;
  aliases: string[];
  page: "home" | "article";
  slotSelector: string;
  contextSelector: string;
};

export type SiteFormatResolution = {
  status: "resolved" | "ambiguous" | "unresolved";
  method: "exact_alias" | "normalized_alias" | "context" | "dimension" | "none";
  siteSigla: string | null;
  rawFormat: string;
  lexicalKey: string;
  canonicalFormat: string | null;
  groupId: number | null;
  page: "home" | "article" | null;
  candidates: SiteFormatResolutionCandidate[];
  safeToApply: boolean;
};

function resolveConfigPath() {
  const candidates = [
    process.env.ADOPS_PROJECT_ROOT ? path.resolve(process.env.ADOPS_PROJECT_ROOT, "config/adrotate-sites.json") : null,
    path.resolve(process.cwd(), "config/adrotate-sites.json"),
    path.resolve(process.cwd(), "../config/adrotate-sites.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const CONFIG_PATH = resolveConfigPath();

function loadRawConfig(): Record<string, SiteIntegration> {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, SiteIntegration>;
}

export function normalizeLocalFormato(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function canonicalFormatKey(value: string | null | undefined) {
  const normalized = normalizeLocalFormato(value).replace(/\bMEGA BANNER\b/g, "MEGABANNER");
  if (["INTERNO", "INTERNO NOTICIA", "INTERNO NOTICIAS", "BANNER INTERNO NOTICIA", "BANNER INTERNO NOTICIAS"].includes(normalized)) {
    return "INTERNO DE NOTICIAS";
  }
  return normalized;
}

function rawFormatKey(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function extractDimensions(value: string | null | undefined) {
  const match = normalizeLocalFormato(value).match(/\b(\d{2,4})\s*X\s*(\d{2,4})\b/);
  if (!match) return null;
  return `${Number.parseInt(match[1]!, 10)}x${Number.parseInt(match[2]!, 10)}`;
}

function candidateFromMapping(mapping: SiteFormatMapping): SiteFormatResolutionCandidate {
  return {
    groupId: mapping.groupId,
    canonicalFormat: mapping.aliases[0] ?? `GRUPO ${mapping.groupId}`,
    aliases: [...new Set([...mapping.aliases, ...(mapping.inputAliases ?? [])])],
    page: mapping.page,
    slotSelector: mapping.slotSelector,
    contextSelector: mapping.contextSelector ?? mapping.slotSelector,
  };
}

export function getSiteIntegrations() {
  return loadRawConfig();
}

export function getSiteIntegration(siteSigla: string | null | undefined): SiteIntegration | null {
  if (!siteSigla) return null;
  const site = loadRawConfig()[siteSigla.toUpperCase()] ?? null;
  if (!site) return null;
  return {
    ...site,
    adminBaseUrl: site.adminBaseUrl || `https://${site.domain}/wp/wp-admin`,
    pageDateSelectors: site.pageDateSelectors?.length
      ? site.pageDateSelectors
      : [
          ".header-datestamp-full",
          ".header-datestamp-short",
          "time.js-topbar-datetime",
          "[data-omt-localtime-full]",
          "[data-omt-localtime-short]",
        ],
    auditConfig: {
      animatedBannerDelayMs: 1800,
      postVisualWaitMs: 1200,
      viewportTrimBottomPx: 0,
      ...(site.auditConfig ?? {}),
    },
    consentConfig: {
      selectors: site.consentConfig?.selectors ?? [],
      textPatterns: site.consentConfig?.textPatterns ?? [],
    },
  };
}

export function getSiteFormatMapping(siteSigla: string | null | undefined, localFormato: string | null | undefined): SiteFormatMapping | null {
  const site = getSiteIntegration(siteSigla);
  if (!site) return null;
  const resolution = resolveSiteFormat(siteSigla, localFormato);
  if (resolution.status !== "resolved" || resolution.groupId == null) return null;
  return site.formatMappings.find((item) => item.groupId === resolution.groupId) ?? null;
}

type FormatMappingContext = {
  pageLabel?: string | null;
  pageUrl?: string | null;
  slotSelector?: string | null;
  contextSelector?: string | null;
  mediaKind?: "image" | "video" | null;
  dimensions?: { width: number; height: number } | null;
};

function inferPageFromContext(context: FormatMappingContext): "home" | "article" | null {
  const label = String(context.pageLabel ?? "").toLowerCase();
  if (label.includes("interna") || label.includes("article")) return "article";
  if (label.includes("home")) return "home";
  const pageUrl = String(context.pageUrl ?? "");
  if (!pageUrl) return null;
  try {
    const parsed = new URL(pageUrl);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return pathname === "" ? "home" : "article";
  } catch {
    return null;
  }
}

export function getSiteFormatMappingByContext(
  siteSigla: string | null | undefined,
  localFormato: string | null | undefined,
  context: FormatMappingContext = {},
): SiteFormatMapping | null {
  const site = getSiteIntegration(siteSigla);
  if (!site) return null;
  const resolution = resolveSiteFormat(siteSigla, localFormato, context);
  if (resolution.status !== "resolved" || resolution.groupId == null) return null;
  return site.formatMappings.find((item) => item.groupId === resolution.groupId) ?? null;
}

export function resolveSiteFormat(
  siteSigla: string | null | undefined,
  localFormato: string | null | undefined,
  context: FormatMappingContext = {},
): SiteFormatResolution {
  const site = getSiteIntegration(siteSigla);
  const rawFormat = String(localFormato ?? "").trim();
  const lexicalKey = normalizeLocalFormato(rawFormat);
  if (!site) {
    return {
      status: "unresolved",
      method: "none",
      siteSigla: siteSigla ? siteSigla.toUpperCase() : null,
      rawFormat,
      lexicalKey,
      canonicalFormat: null,
      groupId: null,
      page: null,
      candidates: [],
      safeToApply: false,
    };
  }

  const inferredPage = inferPageFromContext(context);
  const slotSelector = String(context.slotSelector ?? "").trim();
  const contextSelector = String(context.contextSelector ?? "").trim();
  const requestedDimensions = context.dimensions
    ? `${context.dimensions.width}x${context.dimensions.height}`
    : extractDimensions(rawFormat);
  let method: SiteFormatResolution["method"] = "none";
  let candidates = site.formatMappings.filter((item) =>
    [...item.aliases, ...(item.inputAliases ?? [])].some((alias) => canonicalFormatKey(alias) === canonicalFormatKey(rawFormat)),
  );
  if (candidates.length) {
    const rawKey = rawFormatKey(rawFormat);
    method = candidates.some((item) => [...item.aliases, ...(item.inputAliases ?? [])].some((alias) => rawFormatKey(alias) === rawKey))
      ? "exact_alias"
      : "normalized_alias";
  }

  if (!candidates.length && slotSelector) {
    candidates = site.formatMappings.filter((item) => item.slotSelector === slotSelector);
    if (candidates.length) method = "context";
  }
  if (!candidates.length && contextSelector) {
    candidates = site.formatMappings.filter((item) => (item.contextSelector ?? item.slotSelector) === contextSelector);
    if (candidates.length) method = "context";
  }
  if (!candidates.length && requestedDimensions) {
    candidates = site.formatMappings.filter((item) =>
      [...item.aliases, ...(item.inputAliases ?? [])].some((alias) => extractDimensions(alias) === requestedDimensions),
    );
    if (candidates.length) method = "dimension";
  }

  if (inferredPage && candidates.length > 1) {
    const pageMatched = candidates.filter((item) => item.page === inferredPage);
    if (pageMatched.length) candidates = pageMatched;
  }
  if (context.mediaKind === "video" && candidates.length > 1) {
    const videoMatched = candidates.filter((item) => item.aliases.some((alias) => /\bVIDEO\b/.test(normalizeLocalFormato(alias))));
    if (videoMatched.length) candidates = videoMatched;
  }
  if (slotSelector && candidates.length > 1) {
    const slotMatched = candidates.filter((item) => item.slotSelector === slotSelector);
    if (slotMatched.length) candidates = slotMatched;
  }
  if (contextSelector && candidates.length > 1) {
    const contextMatched = candidates.filter((item) => (item.contextSelector ?? item.slotSelector) === contextSelector);
    if (contextMatched.length) candidates = contextMatched;
  }

  const publicCandidates = candidates.map(candidateFromMapping);
  const resolved = candidates.length === 1 ? candidates[0]! : null;
  return {
    status: resolved ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved",
    method: candidates.length ? method : "none",
    siteSigla: site.sigla,
    rawFormat,
    lexicalKey,
    canonicalFormat: resolved?.aliases[0] ?? null,
    groupId: resolved?.groupId ?? null,
    page: resolved?.page ?? null,
    candidates: publicCandidates,
    safeToApply: Boolean(resolved),
  };
}

export function getAdRotateGroupId(siteSigla: string | null | undefined, localFormato: string | null | undefined): number | null {
  return getSiteFormatMapping(siteSigla, localFormato)?.groupId ?? null;
}

export function getSupportedGroupIds(siteSigla: string | null | undefined) {
  const site = getSiteIntegration(siteSigla);
  return [...new Set((site?.formatMappings ?? []).map((item) => item.groupId))];
}

export function extractFirstArticleUrl(html: string, domain: string) {
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...html.matchAll(new RegExp(`href="((?:https://${escapedDomain})?\\/[^"#?]+\\/)"`, "gi"))];
  for (const match of matches) {
    const raw = match[1];
    if (!raw) continue;
    const candidate = raw.startsWith("https://")
      ? raw
      : raw.startsWith("//")
        ? `https:${raw}`
        : `https://${domain}${raw}`;
    if (/\/(categoria|category|tag|author|page|app|wp-content|feed|wp-json)\//i.test(candidate)) continue;
    const pathValue = candidate.replace(new RegExp(`^https://${escapedDomain}/`, "i"), "");
    if (pathValue.split("/").filter(Boolean).length >= 1) return candidate;
  }
  return null;
}

export function normalizeSiteMediaUrl(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith("//") ? `https:${value}` : value;
}
