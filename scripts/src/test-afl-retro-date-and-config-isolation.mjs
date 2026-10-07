#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import {
  getPositionAuditConfig,
  mergePortalPositionAuditConfig,
} from "../../artifacts/api-server/src/lib/adrotate-sites.ts";
import captureModule from "./capture-insertion-proof.cjs";

const {
  applyAflRetroPreview,
  collectRetroContentEvidence,
  applyPerrengueStaticRetroAd,
  stabilizeVisibleRetroDatesBeforeCapture,
} = captureModule;

const portalDefaults = {
  requireSignedRetroPreview: true,
  minRetroContentMatches: 3,
  postVisualWaitMs: 2000,
};
const mapping = {
  groupId: 1,
  aliases: ["MEGABANNER TOPO"],
  page: "home",
  slotSelector: ".g.g-1",
  auditOverrides: {
    postVisualWaitMs: 3800,
    requireSlotVisibleInViewport: true,
  },
};

const stored = getPositionAuditConfig(mapping);
assert.deepEqual(stored, {
  postVisualWaitMs: 3800,
  requireSlotVisibleInViewport: true,
});
assert.equal("requireSignedRetroPreview" in stored, false, "portal default leaked into stored position config");
assert.deepEqual(mergePortalPositionAuditConfig(portalDefaults, stored), {
  requireSignedRetroPreview: true,
  minRetroContentMatches: 3,
  postVisualWaitMs: 3800,
  requireSlotVisibleInViewport: true,
});

const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(fs.existsSync(localChrome) ? { executablePath: localChrome } : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent(`
    <main>
      <section class="hero-section">
        <article class="hero-post">
          <a href="/atual"><img src="https://example.test/atual.jpg"></a>
          <h2>Atual</h2>
          <p>Resumo atual</p>
          <div class="text-xs"><span>há 2 dias</span></div>
        </article>
        <aside>
          <article class="post-card-compact">
            <a href="/lateral"><img src="https://example.test/lateral.jpg"></a>
            <h3>Lateral atual</h3>
            <div class="text-xs"><span>há 4 dias</span></div>
          </article>
        </aside>
      </section>
    </main>
  `);

  const result = await applyAflRetroPreview(page, {
    domain: "afolhalivre.com",
    page: "home",
  }, "2026-07-29T21:50:00-04:00", {
    posts: [
      {
        slug: "idosa-morre",
        url: "https://afolhalivre.com/idosa-morre/",
        title: "Idosa morre após atropelamento",
        excerpt: "Uma idosa morreu nesta quarta-feira (29).",
        image: "https://cdn.example.test/idosa.jpg",
        category: "Primavera",
        date: "2026-07-29T15:29:00",
      },
      {
        slug: "tangara",
        url: "https://afolhalivre.com/tangara/",
        title: "Tangará passa a exigir curso",
        excerpt: "",
        image: "https://cdn.example.test/tangara.jpg",
        category: "Primavera",
        date: "2026-07-29T15:20:00",
      },
    ],
  });

  const rendered = await page.evaluate(() => ({
    title: document.querySelector("article.hero-post h2")?.textContent,
    excerpt: document.querySelector("article.hero-post p")?.textContent,
    date: document.querySelector("article.hero-post .text-xs span")?.textContent,
    sourceDate: document.querySelector("article.hero-post")?.getAttribute("data-adops-retro-post-date"),
  }));

  assert.equal(result.applied, true);
  assert.equal(result.heroDateNodesUpdated, 1);
  assert.equal(rendered.title, "Idosa morre após atropelamento");
  assert.equal(rendered.excerpt, "Uma idosa morreu nesta quarta-feira (29).");
  assert.match(rendered.date ?? "", /^29\/07\/2026\s+15:29$/);
  assert.equal(rendered.sourceDate, "2026-07-29T15:29:00");
  assert.equal(/há\s+\d+\s+dias?/i.test(rendered.date ?? ""), false);

  await page.evaluate(() => {
    const hero = document.querySelector("article.hero-post");
    const lateDate = document.createElement("span");
    lateDate.className = "late-relative-date";
    lateDate.textContent = "há 6 dias";
    hero?.appendChild(lateDate);
  });
  await page.evaluate(() => window.__cod5NormalizeAflRetroDates?.());
  assert.match(await page.locator(".late-relative-date").textContent() ?? "", /^29\/07\/2026\s+15:29$/);

  await page.evaluate(() => {
    const date = document.querySelector("article.hero-post [data-adops-retro-date-node='1']");
    if (date) date.textContent = "29/18:24";
  });
  await page.evaluate(() => window.__cod5NormalizeAflRetroDates?.());
  assert.equal(
    await page.locator("article.hero-post [data-adops-retro-date-node='1']").first().textContent(),
    "29/07/2026 15:29",
  );

  await page.evaluate(() => {
    const topbar = document.createElement("time");
    topbar.className = "js-topbar-datetime";
    topbar.textContent = "quarta-feira, 29 de junho de 2026, às 20:00:00";
    document.body.prepend(topbar);
    const date = document.querySelector("article.hero-post [data-adops-retro-date-node='1']");
    if (date) date.textContent = "29/18:44";
  });
  const visibleDateAudit = await stabilizeVisibleRetroDatesBeforeCapture(page, {
    domain: "afolhalivre.com",
    pageDateSelectors: ["time.js-topbar-datetime"],
    auditConfig: { requireVisiblePageDate: true },
  }, "2026-07-29T20:00:00-04:00");
  assert.equal(visibleDateAudit.ok, true);
  assert.match(await page.locator("time.js-topbar-datetime").textContent() ?? "", /29 de julho de 2026/);
  assert.match(
    await page.locator("time.js-topbar-datetime").getAttribute("data-adops-frozen-visible-label") ?? "",
    /29 de julho de 2026/,
  );
  assert.equal(await page.locator("time.js-topbar-datetime").evaluate((el) => getComputedStyle(el).display), "none");
  assert.match(await page.locator(".cod5-adops-frozen-datestamp").textContent() ?? "", /29 de julho de 2026/);
  assert.equal(
    await page.locator("article.hero-post [data-adops-retro-date-node='1']").first().textContent(),
    "29/07/2026 15:29",
  );

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const belowFoldDateAudit = await stabilizeVisibleRetroDatesBeforeCapture(page, {
    domain: "afolhalivre.com",
    pageDateSelectors: ["time.js-topbar-datetime"],
    auditConfig: { requireVisiblePageDate: true },
  }, "2026-07-29T20:00:00-04:00");
  assert.equal(belowFoldDateAudit.ok, true);

  await page.setContent("<main>Portal ao vivo sem datestamp visível</main>");
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const liveDateAudit = await stabilizeVisibleRetroDatesBeforeCapture(page, {
    domain: "afolhalivre.com",
    pageDateSelectors: ["time.js-topbar-datetime"],
    auditConfig: { requireVisiblePageDate: true },
  }, `${today}T12:00:00-04:00`);
  assert.deepEqual(liveDateAudit, { ok: true, skipped: true, reason: "live_same_day" });

  const expoUrl = "https://afolhalivre.com/expo-primavera/";
  const expoTitle = "Expo Primavera terá espaço exclusivo para pessoas com deficiência";
  const expoBody = "A Expo Primavera contará com uma estrutura exclusiva para pessoas com deficiência.";
  const articleImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6z0AAAAASUVORK5CYII=";
  await page.route(expoUrl + "**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: `
    <title>${expoTitle} - A Folha Livre</title>
    <main><article>
      <a class="category-link" href="https://afolhalivre.com/categoria/primavera/">Primavera</a>
      <a class="article-hero" href="${expoUrl}"><img src="${articleImage}"></a>
      <h1>${expoTitle}</h1>
      <time datetime="2026-08-21T14:00:00">há 2 horas</time>
      <div class="entry-content"><p>${expoBody}</p></div>
    </article></main>
  ` }));
  await page.goto(expoUrl + "?adops_preview=fixture", { waitUntil: "domcontentloaded" });
  const articlePosts = [{
    id: 123, slug: "acidente-cruzamento", url: "https://afolhalivre.com/acidente-cruzamento/",
    title: "Acidente entre carro e motocicleta no cruzamento", image: articleImage + "#accident",
    category: "Primavera", date: "2026-08-21T15:38:00",
  }, {
    id: 124, slug: "expo-primavera", url: expoUrl, title: expoTitle, image: articleImage,
    category: "Primavera", date: "2026-08-21T14:00:00",
  }];
  const articleResult = await applyAflRetroPreview(page, {
    domain: "afolhalivre.com",
    homeUrl: "https://afolhalivre.com/",
    page: "article",
  }, "2026-08-21T18:14:00-04:00", {
    posts: articlePosts,
  });
  assert.equal(articleResult.applied, true);
  assert.equal(articleResult.articleVerified, true);
  assert.equal(articleResult.expectedPosts[0].id, 124, "article reconstruction must select the opened URL, not the newest post");
  assert.equal(await page.locator("main article h1").textContent(), expoTitle);
  assert.equal(await page.locator("a.article-hero").getAttribute("href"), expoUrl);
  assert.equal(await page.locator("a.category-link").getAttribute("href"), "https://afolhalivre.com/categoria/primavera/", "reconstruction must preserve original article links");
  assert.equal(await page.locator("main article img").getAttribute("src"), articleImage);
  assert.equal(await page.locator(".entry-content").textContent(), expoBody);
  assert.equal(await page.title(), expoTitle + " - A Folha Livre");
  assert.equal(new URL(page.url()).pathname, "/expo-primavera/");
  await page.route("https://afolhalivre.com/wp-json/wp/v2/posts**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      { id: 123, date: articlePosts[0].date, link: articlePosts[0].url, title: { rendered: articlePosts[0].title } },
      { id: 124, date: articlePosts[1].date, link: articlePosts[1].url, title: { rendered: articlePosts[1].title } },
    ]),
  }));
  const collectedArticle = await collectRetroContentEvidence(page, {
    domain: "afolhalivre.com",
    homeUrl: "https://afolhalivre.com/",
    page: "article",
    auditConfig: {},
  }, "2026-08-21T18:14:00-04:00", articleResult);
  assert.deepEqual(collectedArticle.expectedPosts.map((post) => post.id), [124],
    "article manifest expectedPosts must select the opened URL rather than the first REST post");
  assert.equal(collectedArticle.editorialSamples[0].url, expoUrl);
  assert.equal(collectedArticle.manifest.expectedPosts[0].url, expoUrl);
  assert.equal(collectedArticle.manifest.visiblePosts[0].url, expoUrl);
  assert.equal(collectedArticle.retroContentProof.visibleMatchCount, 1);

  const rawWpRows = articlePosts.map((post) => ({
    id: post.url === expoUrl ? 69702 : post.id,
    date: post.date,
    modified: post.date,
    link: post.url,
    slug: post.slug,
    title: { rendered: post.title },
    excerpt: { rendered: "" },
    _embedded: {
      "wp:featuredmedia": [{ source_url: post.image }],
      "wp:term": [[{ taxonomy: "category", name: post.category, slug: "primavera" }]],
    },
  }));
  const originalFetch = globalThis.fetch;
  let defaultFetchUrl = "";
  let defaultFetchedArticle;
  try {
    globalThis.fetch = async (input) => {
      defaultFetchUrl = String(input);
      return { ok: true, json: async () => rawWpRows };
    };
    defaultFetchedArticle = await applyAflRetroPreview(page, {
      domain: "afolhalivre.com",
      homeUrl: "https://afolhalivre.com/",
      page: "article",
    }, "2026-08-21T18:14:00-04:00");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(defaultFetchUrl, /\/wp-json\/wp\/v2\/posts\?/);
  assert.equal(defaultFetchedArticle.applied, true);
  assert.equal(defaultFetchedArticle.expectedPosts[0].id, 69702,
    "the default WordPress REST fetch must preserve the raw post ID through normalization");
  const collectedDefaultFetch = await collectRetroContentEvidence(page, {
    domain: "afolhalivre.com",
    homeUrl: "https://afolhalivre.com/",
    page: "article",
    auditConfig: {},
  }, "2026-08-21T18:14:00-04:00", defaultFetchedArticle);
  assert.equal(collectedDefaultFetch.expectedPosts[0].id, 69702,
    "the collector must accept the identity produced by the default raw-WordPress fetch path");

  await assert.rejects(collectRetroContentEvidence(page, {
    domain: "afolhalivre.com", homeUrl: "https://afolhalivre.com/", page: "article", auditConfig: {},
  }, "2026-08-21T18:14:00-04:00", { ...articleResult, expectedPosts: [] }), /retro_content_article_identity_unverified/);
  await assert.rejects(collectRetroContentEvidence(page, {
    domain: "afolhalivre.com", homeUrl: "https://afolhalivre.com/", page: "article", auditConfig: {},
  }, "2026-08-21T18:14:00-04:00", {
    ...articleResult,
    expectedPosts: [{ ...articleResult.expectedPosts[0], url: "https://other.example/expo-primavera/" }],
  }), /retro_content_article_identity_unverified/);
  const reconstructedHtml = await page.locator("main article").innerHTML();
  await assert.rejects(applyAflRetroPreview(page, { domain: "afolhalivre.com", page: "article" }, "2026-08-21T18:14:00-04:00", { posts: [articlePosts[0]] }), /article_identity_mismatch/);
  assert.equal(await page.locator("main article").innerHTML(), reconstructedHtml, "unknown article identity must fail before mutation");
  await assert.rejects(applyAflRetroPreview(page, { domain: "afolhalivre.com", page: "article" }, "2026-08-21T18:14:00-04:00", { posts: [{ ...articlePosts[1], url: "https://other.example/expo-primavera/" }] }), /article_identity_mismatch/);
  await page.evaluate(() => { document.title = "Acidente no cruzamento - A Folha Livre"; });
  await assert.rejects(applyAflRetroPreview(page, { domain: "afolhalivre.com", page: "article" }, "2026-08-21T18:14:00-04:00", { posts: articlePosts }), /article_content_mismatch/);
  await page.evaluate(title => { document.title = title; }, expoTitle + " - A Folha Livre");
  await page.locator("main article h1").evaluate(node => { node.textContent = "Another article headline"; });
  await assert.rejects(applyAflRetroPreview(page, { domain: "afolhalivre.com", page: "article" }, "2026-08-21T18:14:00-04:00", { posts: articlePosts }), /article_content_mismatch/);
  assert.equal(await page.locator(".entry-content").textContent(), expoBody);

  await page.setContent(`
    <header><div class="omt-header-top"><div id="block-8"><!-- anúncio encerrado --></div></div></header>
  `);
  const slotResult = await applyPerrengueStaticRetroAd(page, {
    domain: "afolhalivre.com",
    page: "home",
    slotSelector: ".g.g-1",
    contextSelector: ".g.g-1",
    auditConfig: { allowAuditedReconstruction: true },
  }, "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='825' height='120'/>", "banner.svg", {
    allowConfiguredSlotReconstruction: true,
    reconstructionReason: "late_publication_recovery",
  });
  assert.equal(slotResult.applied, true);
  assert.equal(await page.locator("header .omt-header-top #block-8 > .g.g-1").count(), 1);
  assert.equal(await page.locator(".g.g-1").getAttribute("data-adops-reconstructed-slot"), "1");
} finally {
  await browser.close();
}

console.log("afl_retro_date_and_config_isolation_ok");
