import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildWordPressArticleApiUrl,
  fetchWordPressArticleCandidates,
} = require("./capture-insertion-proof.cjs");

const mapping = {
  homeUrl: "https://afolhalivre.com/",
};

const apiUrl = new URL(buildWordPressArticleApiUrl(mapping, "2026-07-20T20:41"));
assert.equal(apiUrl.origin, "https://afolhalivre.com");
assert.equal(apiUrl.pathname, "/wp-json/wp/v2/posts");
assert.equal(apiUrl.searchParams.get("before"), "2026-07-20T20:41:59");
assert.equal(apiUrl.searchParams.get("status"), "publish");
assert.equal(apiUrl.searchParams.get("_fields"), "link,date,status");

const requestedUrls = [];
const candidates = await fetchWordPressArticleCandidates(
  mapping,
  "2026-07-20T20:41",
  "signed-preview",
  async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      async json() {
        return [
          {
            status: "publish",
            date: "2026-07-20T17:04:31",
            link: "https://afolhalivre.com/materia-correta/",
          },
          {
            status: "publish",
            date: "2026-07-20T16:00:00",
            link: "https://externo.example/materia/",
          },
          {
            status: "draft",
            date: "2026-07-20T15:00:00",
            link: "https://afolhalivre.com/rascunho/",
          },
        ];
      },
    };
  },
);

assert.equal(requestedUrls.length, 1);
assert.equal(candidates.length, 1);
const articleUrl = new URL(candidates[0]);
assert.equal(articleUrl.pathname, "/materia-correta/");
assert.equal(articleUrl.searchParams.get("adops_preview_at"), "2026-07-20T20:41");
assert.equal(articleUrl.searchParams.get("adops_preview_sig"), "signed-preview");

const fallback = await fetchWordPressArticleCandidates(
  mapping,
  "2026-07-20T20:41",
  null,
  async () => ({ ok: false }),
);
assert.deepEqual(fallback, []);

console.log("ok: WordPress article capture fallback preserves date and same-origin safety");
