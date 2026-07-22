import assert from "node:assert/strict";
import test from "node:test";
import { getAdRotateGroupId, getSiteFormatMapping, getSiteIntegrations } from "../../artifacts/api-server/src/lib/adrotate-sites";

test("INTERNO resolves to the canonical internal-news group", () => {
  assert.equal(getAdRotateGroupId("AFL", "INTERNO"), 14);
  assert.equal(getAdRotateGroupId("PNMT", "INTERNO NOTICIAS"), 14);
  assert.equal(getSiteFormatMapping("AFL", "BANNER INTERNO NOTICIA")?.page, "article");
});

test("article fallback URLs stay on the configured portal domain", () => {
  for (const [siteSigla, site] of Object.entries(getSiteIntegrations())) {
    if (!site.articleFallbackUrl) continue;
    const fallbackHost = new URL(site.articleFallbackUrl).hostname.replace(/^www\./, "");
    const expectedHost = site.domain.replace(/^www\./, "");
    assert.ok(
      fallbackHost === expectedHost || fallbackHost.endsWith(`.${expectedHost}`),
      `${siteSigla} points articleFallbackUrl to another portal: ${fallbackHost}`,
    );
  }
});
