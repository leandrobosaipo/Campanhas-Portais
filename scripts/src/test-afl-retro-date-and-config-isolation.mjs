#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import {
  getPositionAuditConfig,
  mergePortalPositionAuditConfig,
} from "../../artifacts/api-server/src/lib/adrotate-sites.ts";
import captureModule from "./capture-insertion-proof.cjs";

const { applyAflRetroPreview, stabilizeVisibleRetroDatesBeforeCapture } = captureModule;

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
  await page.waitForFunction(() => document.querySelector(".late-relative-date")?.textContent !== "há 6 dias");
  assert.match(await page.locator(".late-relative-date").textContent() ?? "", /^29\/07\/2026\s+15:29$/);

  await page.evaluate(() => {
    const date = document.querySelector("article.hero-post [data-adops-retro-date-node='1']");
    if (date) date.textContent = "29/18:24";
  });
  await page.waitForFunction(() => document.querySelector("article.hero-post [data-adops-retro-date-node='1']")?.textContent === "29/07/2026 15:29");
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
  assert.equal(
    await page.locator("article.hero-post [data-adops-retro-date-node='1']").first().textContent(),
    "29/07/2026 15:29",
  );
} finally {
  await browser.close();
}

console.log("afl_retro_date_and_config_isolation_ok");
