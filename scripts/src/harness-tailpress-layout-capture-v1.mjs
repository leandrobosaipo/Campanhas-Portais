import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const reportDir = path.join(repoRoot, "docs", "harness-reports", "tailpress-layout-capture-v1", new Date().toISOString().replace(/[:.]/g, "-"));
const config = JSON.parse(await fs.readFile(path.join(repoRoot, "config", "adrotate-sites.json"), "utf8"));
const targetSites = ["ROO", "PNMT", "PPMT", "AFL"];

await fs.mkdir(reportDir, { recursive: true });

async function inspectPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4500);
  return page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
    };
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const selectors = Array.from(document.querySelectorAll("[class~='g']"))
      .filter((element) => Array.from(element.classList).some((item) => /^g-\d+$/.test(item)))
      .map((element, index) => {
        const image = element.querySelector("img");
        const link = element.querySelector("a[href]");
        return {
          index,
          className: Array.from(element.classList).join(" "),
          groupId: Number((Array.from(element.classList).find((item) => /^g-\d+$/.test(item)) || "").replace("g-", "")),
          visible: isVisible(element),
          rect: rectFor(element),
          image: image?.currentSrc || image?.src || image?.dataset?.src || null,
          href: link?.href || null,
          text: element.textContent?.trim().slice(0, 100) || "",
        };
      });
    const articleCandidate = Array.from(document.querySelectorAll("a[href]"))
      .map((link) => ({ href: link.href, text: link.textContent?.trim() || "" }))
      .find((link) => {
        if (!link.text || link.text.length < 18) return false;
        const url = new URL(link.href, location.href);
        return url.origin === location.origin
          && !url.pathname.includes("/wp/")
          && !url.pathname.includes("/tag/")
          && !url.pathname.includes("/category/")
          && !url.pathname.includes("/author/")
          && !url.pathname.includes("/fale-conosco");
      })?.href || null;
    return { url: location.href, title: document.title, selectors, articleCandidate };
  });
}

async function inspectSelector(browser, url, selector) {
  const page = await browser.newPage({ viewport: { width: 1660, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const selected = await page.$$eval(selector, (elements) => elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const image = element.querySelector("img");
    const link = element.querySelector("a[href]");
    return {
      index,
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      image: image?.currentSrc || image?.src || image?.dataset?.src || null,
      href: link?.href || null,
      text: element.textContent?.trim().slice(0, 100) || "",
    };
  }));
  await page.close();
  return selected;
}

const browser = await chromium.launch({ headless: true });
const results = {};
const findings = [];

for (const sigla of targetSites) {
  const site = config[sigla];
  if (!site) throw new Error(`Site ${sigla} ausente em adrotate-sites.json.`);
  const page = await browser.newPage({ viewport: { width: 1660, height: 1100 }, deviceScaleFactor: 1 });
  const home = await inspectPage(page, site.homeUrl);
  await page.screenshot({ path: path.join(reportDir, `${sigla}-home.png`), fullPage: true });
  const articleUrl = site.articleFallbackUrl || home.articleCandidate || site.homeUrl;
  const article = await inspectPage(page, articleUrl);
  await page.screenshot({ path: path.join(reportDir, `${sigla}-article.png`), fullPage: true });
  await page.close();
  results[sigla] = { home, article, mappings: site.formatMappings };

  for (const mapping of site.formatMappings) {
    const pageData = mapping.page === "article" ? article : home;
    const nodes = await inspectSelector(browser, pageData.url, mapping.slotSelector);
    const visible = nodes.filter((item) => item.visible).length;
    const creativeCount = nodes.filter((item) => item.image || item.href).length;
    const severity = visible > 0 ? "ok" : creativeCount > 0 ? "error" : "warning";
    findings.push({
      severity,
      site: sigla,
      groupId: mapping.groupId,
      page: mapping.page,
      selector: mapping.slotSelector,
      nodes: nodes.length,
      visible,
      creativeCount,
      firstVisible: nodes.find((item) => item.visible) || null,
    });
  }
}

await browser.close();

const errors = findings.filter((item) => item.severity === "error");
const summary = {
  ok: errors.length === 0,
  generatedAt: new Date().toISOString(),
  reportDir,
  totals: {
    sites: targetSites.length,
    rules: findings.length,
    errors: errors.length,
    warnings: findings.filter((item) => item.severity === "warning").length,
  },
  findings,
  results,
};

await fs.writeFile(path.join(reportDir, "summary.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(path.join(reportDir, "README.md"), [
  "# Harness Tailpress layout capture v1",
  "",
  `Gerado em ${summary.generatedAt}.`,
  "",
  "## Totais",
  "",
  `- Sites: ${summary.totals.sites}`,
  `- Regras: ${summary.totals.rules}`,
  `- Erros: ${summary.totals.errors}`,
  `- Warnings: ${summary.totals.warnings}`,
  "",
  "## Achados",
  "",
  ...findings.map((item) => `- ${item.severity.toUpperCase()} ${item.site}:${item.groupId} ${item.page} ${item.selector} nodes=${item.nodes} visible=${item.visible}`),
  "",
].join("\n"));

console.log(JSON.stringify({
  ok: summary.ok,
  reportDir,
  totals: summary.totals,
  findings: findings.map(({ severity, site, groupId, page, selector, nodes, visible, firstVisible }) => ({ severity, site, groupId, page, selector, nodes, visible, firstVisible })),
}, null, 2));

if (!summary.ok) process.exit(1);
