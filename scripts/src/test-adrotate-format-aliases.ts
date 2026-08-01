import assert from "node:assert/strict";
import test from "node:test";
import { getAdRotateGroupId, getSiteFormatMapping, getSiteIntegrations, resolveSiteFormat } from "../../artifacts/api-server/src/lib/adrotate-sites";

test("TOPO is resolved per portal without changing the canonical published alias", () => {
  for (const siteSigla of ["PERRENGUE", "OMT", "ROO", "AFL", "PNMT", "PPMT"]) {
    const resolution = resolveSiteFormat(siteSigla, "TOPO");
    assert.equal(resolution.status, "resolved", `${siteSigla} did not resolve TOPO`);
    assert.equal(resolution.groupId, 1, `${siteSigla} resolved TOPO to another group`);
  }
  const perrengue = getSiteFormatMapping("PERRENGUE", "TOPO");
  assert.equal(perrengue?.aliases[0], "MEGABANNER TOPO");
  assert.equal(perrengue?.aliases.includes("TOPO"), false);
  assert.equal(perrengue?.inputAliases?.includes("TOPO"), true);
});

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
