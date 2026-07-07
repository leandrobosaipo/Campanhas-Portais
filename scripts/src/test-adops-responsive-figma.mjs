import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.ADOPS_BASE_URL || "https://adops-campanhas-portais.pages.dev";
const outputDir = process.env.ADOPS_RESPONSIVE_ARTIFACTS_DIR
  ? path.resolve(process.env.ADOPS_RESPONSIVE_ARTIFACTS_DIR)
  : path.resolve(process.cwd(), "docs/harness-reports/adops-responsive-figma-v1/latest-artifacts");

const routes = [
  { id: "dashboard", path: "/" },
  { id: "insertions", path: "/insercoes" },
  { id: "insertion-detail", path: "/insercoes/865" },
  { id: "campaigns", path: "/campanhas" },
];

const viewports = [
  { id: "mobile", width: 360, height: 800 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1280, height: 800 },
];

function sanitize(input) {
  return String(input).replace(/[^a-z0-9_-]+/gi, "-");
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const summary = [];

  try {
    for (const route of routes) {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        const url = new URL(route.path, baseUrl).toString();

        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(1200);
          const status = response?.status() ?? 0;
          const title = await page.title();
          const hasHorizontalOverflow = await page.evaluate(() => {
            const root = document.documentElement;
            return root.scrollWidth > root.clientWidth + 1;
          });
          const screenshotName = `${sanitize(route.id)}__${viewport.id}.png`;
          const screenshotPath = path.join(outputDir, screenshotName);
          await page.screenshot({ path: screenshotPath, fullPage: true });

          const item = {
            route: route.path,
            viewport: viewport.id,
            status,
            title,
            hasHorizontalOverflow,
            screenshot: screenshotPath,
          };
          summary.push(item);

          if (status < 200 || status >= 400) {
            failures.push(`HTTP ${status} em ${route.path} (${viewport.id})`);
          }
          if (hasHorizontalOverflow) {
            failures.push(`Overflow horizontal em ${route.path} (${viewport.id})`);
          }
        } catch (error) {
          failures.push(`Falha em ${route.path} (${viewport.id}): ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const summaryPath = path.join(outputDir, "responsive-summary.json");
  await fs.writeFile(summaryPath, `${JSON.stringify({ baseUrl, routes, viewports, summary, failures }, null, 2)}\n`, "utf8");

  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  console.log(`Responsive smoke OK. Artifacts: ${outputDir}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
