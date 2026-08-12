import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const reportPath = new URL("../../docs/reports/adops-manual-operacional/index.html", import.meta.url);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewportSize: viewport, reducedMotion: "reduce" });
    await page.goto(pathToFileURL(reportPath.pathname).href);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,nofollow");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `overflow em ${viewport.width}`);
    const sizes = await page.locator(".filter").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.ok(sizes.every((height) => height >= 44), `alvo menor que 44px em ${viewport.width}`);
    await page.locator('[data-filter="api"]').click();
    assert.equal(await page.locator(".manual-card:not(.hidden)").count(), 1);
    await page.locator("#manual-search").fill("healthz");
    assert.equal(await page.locator(".manual-card:not(.hidden)").count(), 1);
    await page.locator("#manual-search").fill("termo inexistente");
    await page.locator("#empty").waitFor({ state: "visible" });
    await page.close();
  }
} finally {
  await browser.close();
}
