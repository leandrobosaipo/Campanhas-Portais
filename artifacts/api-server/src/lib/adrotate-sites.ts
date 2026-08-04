import { readFileSync } from "node:fs";
import path from "node:path";

export type SiteFormatMapping = {
  groupId: number;
  aliases: string[];
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
  requireSignedRetroPreview?: boolean;
  requireRetroContentProof?: boolean;
  minRetroContentMatches?: number;
  allowAuditedReconstruction?: boolean;
  retroContentCardSelectors?: string[];
  retroContentDateSelectors?: string[];
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
  pageDateSelectors?: string[];
  auditConfig?: SiteAuditConfig;
  consentConfig?: SiteConsentConfig;
  formatMappings: SiteFormatMapping[];
};

const CONFIG_PATH = path.resolve(process.env.ADOPS_PROJECT_ROOT ?? process.cwd(), "config/adrotate-sites.json");

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
  const normalized = normalizeLocalFormato(localFormato);
  return site.formatMappings.find((item) => item.aliases.some((alias) => normalizeLocalFormato(alias) === normalized)) ?? null;
}

type FormatMappingContext = {
  pageLabel?: string | null;
  pageUrl?: string | null;
  slotSelector?: string | null;
  contextSelector?: string | null;
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
  const normalized = normalizeLocalFormato(localFormato);
  const inferredPage = inferPageFromContext(context);
  const slotSelector = String(context.slotSelector ?? "").trim();
  const contextSelector = String(context.contextSelector ?? "").trim();

  let candidates = site.formatMappings.filter((item) =>
    item.aliases.some((alias) => normalizeLocalFormato(alias) === normalized),
  );
  if (!candidates.length && slotSelector) {
    candidates = site.formatMappings.filter((item) => item.slotSelector === slotSelector);
  }
  if (!candidates.length && contextSelector) {
    candidates = site.formatMappings.filter((item) => (item.contextSelector ?? item.slotSelector) === contextSelector);
  }
  if (!candidates.length) return null;

  if (inferredPage) {
    const pageMatched = candidates.filter((item) => item.page === inferredPage);
    if (pageMatched.length) candidates = pageMatched;
  }

  if (slotSelector) {
    const slotMatched = candidates.filter((item) => item.slotSelector === slotSelector);
    if (slotMatched.length) return slotMatched[0];
  }
  if (contextSelector) {
    const contextMatched = candidates.filter((item) => (item.contextSelector ?? item.slotSelector) === contextSelector);
    if (contextMatched.length) return contextMatched[0];
  }

  return candidates[0] ?? null;
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
