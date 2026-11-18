import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveEffectiveCaptureAt, resolvePageUrls } = require("./capture-insertion-proof.cjs");

const currentArticle = "https://perrenguematogrosso.com/teto-de-aviao-desaba-durante-pouso-de-emergencia-veja-video/";
const oldFallback = "https://perrenguematogrosso.com/festa-celebracao-307-anos-cuiaba-parque-das-aguas-video/";
const mapping = {
  domain: "perrenguematogrosso.com",
  page: "article",
  pageUrl: "__LATEST_ARTICLE__",
  homeUrl: "https://perrenguematogrosso.com/",
  articleFallbackUrl: oldFallback,
  auditConfig: { preferArticleFallbackForRetro: true },
};

function fakePage(articleLinks = [], pageUrl = "https://perrenguematogrosso.com/") {
  return {
    navigations: [],
    async goto(url) { this.navigations.push(url); },
    async waitForTimeout() {},
    async evaluate(callback, domain) {
      const previousWindow = globalThis.window;
      const previousDocument = globalThis.document;
      const previousHTMLElement = globalThis.HTMLElement;
      class FakeHTMLElement {}
      const nodes = articleLinks.map((href) => ({
        getAttribute(name) { return name === "href" ? href : null; },
        closest() { return null; },
        parentElement: null,
      }));
      globalThis.window = { location: new URL(pageUrl) };
      globalThis.document = {
        querySelectorAll() { return nodes; },
        querySelector() { return null; },
      };
      globalThis.HTMLElement = FakeHTMLElement;
      try {
        return await callback(domain);
      } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
        else globalThis.HTMLElement = previousHTMLElement;
      }
    },
  };
}

test("captura do dia escolhe notícia atual mesmo com fallback retro configurado", async () => {
  const effectiveCaptureAt = resolveEffectiveCaptureAt({
    captureClass: "scheduled", previewSupported: true,
    requestedCaptureAt: "2026-10-10T18:00:00-04:00", captureDate: new Date("2026-10-10T22:00:00Z"),
  });
  assert.equal(effectiveCaptureAt, null);
  const page = fakePage();
  const urls = await resolvePageUrls(page, mapping, { captureAt: effectiveCaptureAt, previewSignature: null },
    async () => [currentArticle]);
  assert.deepEqual(urls, [currentArticle]);
  assert.deepEqual(page.navigations, []);
});

test("sem notícia atual, captura do dia bloqueia em vez de abrir notícia retro antiga", async () => {
  const page = fakePage();
  await assert.rejects(
    resolvePageUrls(page, mapping, { captureAt: null, previewSignature: null }, async () => []),
    /Não foi possível localizar uma matéria/,
  );
  assert.deepEqual(page.navigations, [mapping.homeUrl]);
});

test("captura do dia resolve links relativos e absolutos same-origin, deduplica e rejeita destinos inseguros", async () => {
  const page = fakePage([
    "/materia-relativa/",
    "https://perrenguematogrosso.com/materia-absoluta/",
    "//perrenguematogrosso.com/materia-protocolo-relativo/",
    "https://user:pass@perrenguematogrosso.com/credenciais/",
    "https://evil.example/perrenguematogrosso.com/materia/",
    "javascript:alert(1)",
    "/category/noticias/",
    "/tag/noticias/",
    "/author/editor/",
    "/wp-json/wp/v2/posts",
    "/wp-login.php",
    "/wp-admin/edit.php",
    "/cgi-sys/suspendedpage.cgi",
    "/",
    "https://perrenguematogrosso.com/materia-relativa/",
    "",
  ]);
  const urls = await resolvePageUrls(page, mapping, { captureAt: null, previewSignature: null }, async () => []);
  assert.deepEqual(urls, [
    "https://perrenguematogrosso.com/materia-relativa/",
    "https://perrenguematogrosso.com/materia-absoluta/",
    "https://perrenguematogrosso.com/materia-protocolo-relativo/",
  ]);
  assert.deepEqual(page.navigations, [mapping.homeUrl]);
});

test("resolver exige a origem exata da página, inclusive quando protocolo difere", async () => {
  const page = fakePage([
    "http://perrenguematogrosso.com/materia-http/",
    "https://www.perrenguematogrosso.com/materia-www/",
    "https://perrenguematogrosso.com:444/materia-porta/",
  ]);
  await assert.rejects(
    resolvePageUrls(page, mapping, { captureAt: null, previewSignature: null }, async () => []),
    /Não foi possível localizar uma matéria/,
  );
});

test("rejeita domínio configurado apenas no path após redirecionamento para host estranho", async () => {
  const redirectedPage = fakePage(
    ["/perrenguematogrosso.com/materia-falsa/"],
    "https://evil.example/perrenguematogrosso.com/",
  );
  await assert.rejects(
    resolvePageUrls(redirectedPage, mapping, { captureAt: null, previewSignature: null }, async () => []),
    /Não foi possível localizar uma matéria/,
  );
});

test("aceita www somente quando o hostname canônico da origem configurada usa www", async () => {
  const wwwMapping = { ...mapping, homeUrl: "https://www.perrenguematogrosso.com/" };
  const page = fakePage(["/materia-canonica/"], wwwMapping.homeUrl);
  const urls = await resolvePageUrls(page, wwwMapping, { captureAt: null, previewSignature: null }, async () => []);
  assert.deepEqual(urls, ["https://www.perrenguematogrosso.com/materia-canonica/"]);
});

test("captura histórica conserva o fallback retro e cutoff assinado", async () => {
  const page = fakePage();
  const historicalMapping = { ...mapping, domain: "portal.example" };
  const captureAt = "2026-10-09T18:30:00-04:00";
  const urls = await resolvePageUrls(page, historicalMapping, { captureAt, previewSignature: "fixture-signature" },
    async () => { throw new Error("não deve buscar notícia atual"); });
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).origin + new URL(urls[0]).pathname, oldFallback);
  assert.equal(new URL(urls[0]).searchParams.get("adops_preview_at"), captureAt);
  assert.deepEqual(page.navigations, []);
});
