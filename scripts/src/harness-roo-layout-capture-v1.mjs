import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const reportDir = path.join(repoRoot, "docs", "harness-reports", "roo-layout-capture-v1", new Date().toISOString().replace(/[:.]/g, "-"));
const configPath = path.join(repoRoot, "config", "adrotate-sites.json");

async function inspectSelector(page, selector) {
  return page.evaluate((selectorValue) => {
    function visible(rect, style) {
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 32 &&
        rect.height > 16;
    }
    return Array.from(document.querySelectorAll(selectorValue)).map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const img = node.querySelector("img");
      const link = node.querySelector("a");
      const adNode = node.querySelector("[class*='a-']") || node;
      return {
        index,
        className: node.className,
        adClass: Array.from(adNode.classList || []).find((item) => /^a-/.test(item)) || null,
        visible: visible(rect, style),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        image: img?.currentSrc || img?.src || img?.getAttribute("data-lazy-src") || null,
        lazyImage: img?.getAttribute("data-lazy-src") || null,
        href: link?.href || null,
      };
    });
  }, selector);
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const roo = config.ROO;
  if (!roo?.formatMappings?.length) throw new Error("ROO sem formatMappings em config/adrotate-sites.json.");

  const browser = await chromium.launch({ headless: true });
  const pages = {
    home: roo.homeUrl,
    article: roo.articleFallbackUrl || "https://roonoticias.com/horoscopo/",
  };
  const pageData = {};
  const findings = [];

  for (const [pageKey, url] of Object.entries(pages)) {
    const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(reportDir, `${pageKey}-1660.png`), fullPage: true });
    pageData[pageKey] = { url, selectors: {} };

    for (const mapping of roo.formatMappings.filter((item) => item.page === pageKey)) {
      const nodes = await inspectSelector(page, mapping.slotSelector);
      pageData[pageKey].selectors[mapping.slotSelector] = nodes;
      const visibleNodes = nodes.filter((item) => item.visible);
      const activeCreativeNodes = nodes.filter((item) => item.image || item.lazyImage || item.adClass);
      const severity = nodes.length === 0
        ? "warning"
        : visibleNodes.length === 0 && activeCreativeNodes.length > 0
          ? "error"
          : "ok";
      findings.push({
        severity,
        page: pageKey,
        groupId: mapping.groupId,
        selector: mapping.slotSelector,
        nodes: nodes.length,
        visible: visibleNodes.length,
        activeCreativeNodes: activeCreativeNodes.length,
        firstVisible: visibleNodes[0] || null,
      });
    }
    await page.close();
  }

  await browser.close();
  const errors = findings.filter((item) => item.severity === "error");
  const warnings = findings.filter((item) => item.severity === "warning");
  const result = {
    ok: errors.length === 0,
    reportDir,
    generatedAt: new Date().toISOString(),
    site: "ROO",
    totals: {
      rules: findings.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    findings,
    pageData,
  };
  await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(result, null, 2));
  await fs.writeFile(path.join(reportDir, "summary.md"), [
    "# Harness ROO layout capture v1",
    "",
    `- OK: ${result.ok}`,
    `- Regras: ${result.totals.rules}`,
    `- Erros: ${result.totals.errors}`,
    `- Avisos: ${result.totals.warnings}`,
    "",
    ...findings.map((item) => `- ${item.severity.toUpperCase()} ROO:${item.groupId} ${item.page} ${item.selector} nodes=${item.nodes} visible=${item.visible}`),
    "",
  ].join("\n"));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
