import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const {
  collectRetroContentEvidence,
  evaluateContentTimeline,
  evaluateRetroCaptureGate,
  shouldAllowLiveArticleEditorialEvidenceForCapture,
} = require("./capture-insertion-proof.cjs");

const articleUrl = "https://perrenguematogrosso.com/tio-douglas-tenta-impressionar-com-manobras-de-quadriciclo/";
const captureAt = "2026-10-10T21:31:00-04:00";
const publishedAt = "2026-10-11T01:00:00Z";
const title = "Tio Douglas tenta impressionar com manobras de quadriciclo, mas acaba capotando em Cuiabá; veja vídeo";
const mapping = {
  domain: "perrenguematogrosso.com",
  page: "article",
  homeUrl: "https://perrenguematogrosso.com/",
  auditConfig: {
    requireAbsoluteEditorialDates: true,
    requireEditorialDateMatchTarget: true,
  },
};

const liveCapturePolicy = { isHistoricalCapture: false, page: "article", requireEditorialDateMatchTarget: true };
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "scheduled" }), true);
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "same_day_retry" }), true);
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "historical_recovery" }), false);
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "unknown" }), false);
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "scheduled", page: "home" }), false);
assert.equal(shouldAllowLiveArticleEditorialEvidenceForCapture({ ...liveCapturePolicy, captureClass: "scheduled", requireEditorialDateMatchTarget: false }), false);

function articleHtml({
  canonical = articleUrl,
  published = publishedAt,
  publishedLabel = "",
  modified = "2026-10-10T22:28:23Z",
  jsonLdUrl = articleUrl,
  jsonLdPublished = published,
  jsonLdHeadline = title,
  includeJsonLd = true,
  sidebar = false,
  secondArticle = false,
  secondPublished = null,
} = {}) {
  // The positive fixture follows the observed live article subtree: one main
  // article/h1, its byline time, canonical URL, and same-URL NewsArticle JSON-LD.
  const jsonLd = includeJsonLd
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        mainEntityOfPage: jsonLdUrl,
        headline: jsonLdHeadline,
        datePublished: jsonLdPublished,
        dateModified: modified,
      })}</script>`
    : "";
  const visibleDate = published
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Cuiaba", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(published))
    : "10/10/2026";
  const publishedTime = published
    ? `<time datetime="${published}">${publishedLabel ? `<span class="sr-only">${publishedLabel}</span>` : ""}${visibleDate} 21:00</time>`
    : "";
  const sidebarHtml = sidebar
    ? `<aside><section class="sidebar-box sidebar-box--popular">${["2026-10-11T16:00:00-04:00", "2026-10-11T15:22:36-04:00", "2026-10-11T15:00:00-04:00", "2026-10-11T14:56:25-04:00", "2026-10-11T14:00:00-04:00"].map((date, index) => `<article><h2>Notícia relacionada ${index + 1}</h2><a href="/relacionada-${index + 1}/">Notícia relacionada</a><time datetime="${date}"><span class="sr-only">Publicado em</span>11/10/2026</time></article>`).join("")}</section></aside>`
    : "";
  const modifiedTime = !published
    ? `<time class="updated" datetime="${modified}"><span class="sr-only">Atualizado em</span>11/10/2026</time>`
    : "";
  const primary = `<main><div class="container mx-auto px-4 single-post-layout"><div class="grid grid-cols-1 gap-8 py-0 lg:grid-cols-[minmax(0,1fr)_340px]"><article class="min-w-0 w-full"><div class="section-head perr-single-title-head"><div class="min-w-0"><h1 class="headline-1 post-title">${title}</h1></div></div><section class="perr-video-watch perr-video-watch--vertical"><div class="perr-video-watch__summary cod5-static-video-summary"><div class="perr-video-watch__byline">${publishedTime}</div></div></section>${modifiedTime}<p>Texto da notícia.</p></article>${secondArticle ? `<article><h1>Outra matéria</h1><time datetime="${secondPublished || published}"><span class="sr-only">Publicado em</span>11/10/2026</time></article>` : ""}${sidebarHtml}</div></div></main>`;
  return `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="${canonical}">${jsonLd}</head><body>${primary}</body></html>`;
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.ADOPS_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.ADOPS_TEST_BROWSER_EXECUTABLE } : {}),
});
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  let fixture = articleHtml();
  let wpRestRequests = 0;
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl === articleUrl) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixture });
      return;
    }
    try {
      if (new URL(requestUrl).pathname === "/wp-json/wp/v2/posts") {
        wpRestRequests += 1;
        await route.fulfill({ status: 410, body: "" });
        return;
      }
    } catch {}
    await route.abort();
  });

  const read = async (options = {}) => {
    fixture = options.html || articleHtml(options);
    await page.goto(articleUrl, { waitUntil: "domcontentloaded" });
    const requestedCaptureAt = Object.hasOwn(options, "captureAt") ? options.captureAt : captureAt;
    return collectRetroContentEvidence(page, mapping, requestedCaptureAt, null, {
      allowLiveArticleEvidence: options.allowLiveArticleEvidence !== false,
    });
  };

  const valid = await read({ sidebar: true });
  assert.equal(valid.editorialSamples.length, 1);
  assert.equal(valid.editorialSamples[0].url, articleUrl);
  assert.equal(valid.editorialSamples[0].title, title);
  assert.equal(valid.editorialSamples[0].date, publishedAt);
  assert.equal(valid.editorialSamples[0].source, "live_article_visible_published_time");
  assert.equal(valid.liveArticleEvidence, true);
  assert.equal(wpRestRequests, 0, "live article evidence skips historical WordPress REST expected-post lookup");
  assert.equal(valid.retroContentProof, null, "live DOM observation is not mislabeled as signed preview or historical proof");
  const validTimeline = evaluateContentTimeline(valid.editorialSamples.map((sample) => sample.date), captureAt);
  assert.equal(validTimeline.ok, true);
  const validGate = evaluateRetroCaptureGate({
    requestedCaptureAt: captureAt,
    systemDateTime: "sábado, 10/10/2026, 21:31",
    pageDateObserved: "10/10/2026 21:31",
    contentDateSamples: valid.editorialSamples.map((sample) => sample.date),
    requireAbsoluteEditorialDates: true,
    requireEditorialDateMatchTarget: true,
  });
  assert.equal(validGate.ok, true, JSON.stringify(validGate.issues));

  const liveTemplateFragment = await read({ publishedLabel: "" });
  assert.equal(liveTemplateFragment.editorialSamples.length, 1,
    "one time in the unique main article is accepted when same-URL NewsArticle datePublished corroborates it");
  const unlabeledWithoutJsonLd = await read({ publishedLabel: "", includeJsonLd: false });
  assert.equal(unlabeledWithoutJsonLd.editorialSamples.length, 0,
    "an unlabeled time without same-URL JSON-LD corroboration is ambiguous and rejected");

  if (process.env.ADOPS_LIVE_ARTICLE_FIXTURE) {
    const observedHtml = readFileSync(process.env.ADOPS_LIVE_ARTICLE_FIXTURE, "utf8");
    const observed = await read({ html: observedHtml });
    assert.equal(observed.editorialSamples.length, 1, "the captured live HTML fixture should resolve one article publication timestamp");
    assert.equal(observed.editorialSamples[0].url, articleUrl);
    assert.equal(observed.editorialSamples[0].date, publishedAt);
    assert.equal(observed.editorialSamples[0].title, title);
  }

  const modifiedOnly = await read({ published: null, includeJsonLd: false });
  assert.equal(modifiedOnly.editorialSamples.length, 0, "dateModified is never used as publication evidence");

  const wrongHeadline = await read({ jsonLdHeadline: "Outra notícia" });
  assert.equal(wrongHeadline.editorialSamples.length, 0, "a different JSON-LD headline cannot be attached to this visible article");

  const visibleDateConflict = await read({
    html: articleHtml({ published: publishedAt }).replace("10/10/2026 21:00", "11/10/2026 21:00"),
  });
  assert.equal(visibleDateConflict.editorialSamples.length, 0,
    "a visible DD/MM/YYYY that conflicts with datetime in America/Cuiaba is rejected");

  const sidebarOnly = await read({ html: `<!doctype html><html><head><link rel="canonical" href="${articleUrl}"></head><body><aside><article><h1>${title}</h1><time datetime="${publishedAt}"><span class="sr-only">Publicado em</span>10/10/2026</time></article></aside></body></html>` });
  assert.equal(sidebarOnly.editorialSamples.length, 0, "sidebar cards cannot supply the article date");

  const nestedSidebarOnly = await read({
    html: articleHtml({ published: null, jsonLdPublished: publishedAt }).replace(
      "<p>Texto da notícia.</p>",
      `<aside class="article-sidebar"><article><h2>Matéria relacionada</h2><time datetime="${publishedAt}"><span class="sr-only">Publicado em</span>10/10/2026</time></article></aside><p>Texto da notícia.</p>`,
    ),
  });
  assert.equal(nestedSidebarOnly.editorialSamples.length, 0,
    "a correlated JSON-LD record cannot make a nested sidebar article time the primary article publication date");

  const future = await read({ published: "2026-10-11T05:00:00Z", jsonLdPublished: "2026-10-11T05:00:00Z" });
  assert.equal(future.editorialSamples.length, 1);
  assert.equal(evaluateContentTimeline(future.editorialSamples.map((sample) => sample.date), captureAt).ok, false);
  const futureGate = evaluateRetroCaptureGate({
    requestedCaptureAt: captureAt,
    systemDateTime: "sábado, 10/10/2026, 21:31",
    pageDateObserved: "10/10/2026 21:31",
    contentDateSamples: future.editorialSamples.map((sample) => sample.date),
    requireAbsoluteEditorialDates: true,
    requireEditorialDateMatchTarget: true,
  });
  assert.equal(futureGate.ok, false, "future publication time remains blocked by the existing audit gate");

  const divergent = await read({ published: "2026-10-12T01:00:00Z", jsonLdPublished: "2026-10-12T01:00:00Z" });
  assert.equal(divergent.editorialSamples.length, 1);
  const divergentGate = evaluateRetroCaptureGate({
    requestedCaptureAt: captureAt,
    systemDateTime: "sábado, 10/10/2026, 21:31",
    pageDateObserved: "10/10/2026 21:31",
    contentDateSamples: divergent.editorialSamples.map((sample) => sample.date),
    requireAbsoluteEditorialDates: true,
    requireEditorialDateMatchTarget: true,
  });
  assert.equal(divergentGate.ok, false, "publication date outside target day remains blocked");

  const ambiguous = await read({ secondArticle: true, secondPublished: "2026-10-11T02:00:00Z" });
  assert.equal(ambiguous.editorialSamples.length, 0, "multiple visible main articles are ambiguous");

  const jsonLdMismatch = await read({ jsonLdUrl: "https://perrenguematogrosso.com/outra-materia/" });
  assert.equal(jsonLdMismatch.editorialSamples.length, 0, "article JSON-LD must identify this exact article URL");

  const jsonLdDateMismatch = await read({ jsonLdPublished: "2026-10-11T02:00:00Z" });
  assert.equal(jsonLdDateMismatch.editorialSamples.length, 0, "conflicting JSON-LD publication date fails closed");

  const historical = await read({ allowLiveArticleEvidence: false });
  assert.equal(historical.editorialSamples.length, 0, "historical capture without signed/reconstruction evidence remains unapproved");
  assert.notEqual(historical.retroContentProof?.status, "approved");

  const wpRequestsBeforeNoCutoff = wpRestRequests;
  const noCutoff = await read({ captureAt: null, canonical: "https://perrenguematogrosso.com/outro-artigo/" });
  assert.equal(noCutoff.editorialSamples.length, 0);
  assert.equal(wpRestRequests, wpRequestsBeforeNoCutoff, "invalid live identity with no cutoff does not query WordPress before the Unix epoch");

  // PNMT's signed preview retains its normal article markup, without a
  // data-adops-retro-primary-article attribute. Correlate that primary article
  // while retaining all historical gates and the independent REST lookup.
  const pnmtUrl = "https://portalnortemt.com/materia-confirmada/";
  const pnmtMapping = { ...mapping, domain: "portalnortemt.com", homeUrl: "https://portalnortemt.com/" };
  let pnmtFixture;
  let expectedPosts = [{ id: 123, date: publishedAt, link: pnmtUrl, title: { rendered: title } }];
  await page.route("https://portalnortemt.com/**", async route => {
    if (new URL(route.request().url()).pathname === "/wp-json/wp/v2/posts") {
      await route.fulfill({ json: expectedPosts });
    } else await route.fulfill({ contentType: "text/html", body: pnmtFixture });
  });
  const readSigned = async ({ marker = captureAt, html, cutoff = captureAt } = {}) => {
    pnmtFixture = (html || articleHtml({ canonical: pnmtUrl, jsonLdUrl: pnmtUrl }))
      .replace("</head>", `${marker ? `<meta name="cod5-adops-retro-preview" content="active" data-cutoff="${marker}">` : ""}</head>`);
    await page.goto(pnmtUrl);
    return collectRetroContentEvidence(page, pnmtMapping, cutoff, null);
  };
  const signed = await readSigned();
  assert.equal(signed.editorialSamples.length, 1);
  assert.equal(signed.editorialSamples[0].source, "signed_preview_primary_article");
  assert.equal(signed.liveArticleEvidence, false);
  assert.equal(signed.retroContentProof.status, "approved");
  assert.equal(signed.retroContentProof.sourceMode, "signed_preview");
  assert.equal(signed.retroContentProof.reconstructed, false);
  const sidebarLayout = await readSigned({ html: articleHtml({ canonical: pnmtUrl, jsonLdUrl: pnmtUrl, sidebar: true })
    .replace('<div class="perr-video-watch__byline">', '<div class="perr-video-watch__byline cod5-content-sidebar-layout">') });
  assert.equal(sidebarLayout.retroContentProof.status, "approved", "PNMT's content/sidebar layout wrapper is not a sidebar date");
  assert.notEqual((await readSigned({ marker: null })).retroContentProof.status, "approved");
  assert.notEqual((await readSigned({ marker: "2026-10-09T21:31:00-04:00" })).retroContentProof.status, "approved");
  assert.notEqual((await readSigned({ cutoff: "2026-10-10T20:00:00-04:00", marker: "2026-10-10T20:00:00-04:00" })).retroContentProof.status, "approved");
  assert.notEqual((await readSigned({ html: articleHtml({ canonical: pnmtUrl, jsonLdUrl: pnmtUrl, jsonLdHeadline: "Outra matéria" }) })).retroContentProof.status, "approved");
  expectedPosts = [{ ...expectedPosts[0], link: "https://portalnortemt.com/outra-materia/" }];
  assert.notEqual((await readSigned()).retroContentProof.status, "approved");

  console.log("ok: current article publication evidence is uniquely scoped, correlated, and historical fallback remains closed");
} finally {
  await browser.close();
}
