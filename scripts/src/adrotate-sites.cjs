const { readFileSync } = require("node:fs");
const path = require("node:path");

const CONFIG_PATH = path.resolve(__dirname, "../../config/adrotate-sites.json");

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function normalizeFormat(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function getSiteIntegration(siteSigla) {
  if (!siteSigla) return null;
  const site = loadConfig()[String(siteSigla).toUpperCase()] || null;
  if (!site) return null;
  return {
    ...site,
    adminBaseUrl: site.adminBaseUrl || `https://${site.domain}/wp/wp-admin`,
    pageDateSelectors: Array.isArray(site.pageDateSelectors) && site.pageDateSelectors.length
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
      ...(site.auditConfig || {}),
    },
    consentConfig: {
      selectors: (site.consentConfig && Array.isArray(site.consentConfig.selectors)) ? site.consentConfig.selectors : [],
      textPatterns: (site.consentConfig && Array.isArray(site.consentConfig.textPatterns)) ? site.consentConfig.textPatterns : [],
    },
  };
}

function getFormatMapping(siteSigla, localFormato) {
  const site = getSiteIntegration(siteSigla);
  if (!site) return null;
  const normalized = normalizeFormat(localFormato);
  return site.formatMappings.find((item) => item.aliases.some((alias) => normalizeFormat(alias) === normalized)) || null;
}

module.exports = {
  normalizeFormat,
  getSiteIntegration,
  getFormatMapping,
};
