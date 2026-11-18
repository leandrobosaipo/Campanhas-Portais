import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  buildWordPressArticleApiUrl,
  fetchWordPressArticleCandidates,
  isRejectedArticleCandidateUrl,
  auditArticleCandidatePage,
  normalizeMediaIdentityUrl,
} = require("./capture-insertion-proof.cjs");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const siteConfig = JSON.parse(await readFile(path.join(projectRoot, "config/adrotate-sites.json"), "utf8"));
const captureSource = await readFile(path.join(projectRoot, "scripts/src/capture-insertion-proof.cjs"), "utf8");
assert.equal(siteConfig.AFL.disableOriginOverride, true);
assert.equal(siteConfig.OMT.disableOriginOverride, true);
assert.match(
  captureSource,
  /captureStrictReadinessCandidate\(\s*page,\s*viewportPng,/,
  "strict readiness must write the current viewport artifact",
);
assert.doesNotMatch(
  captureSource,
  /captureStrictReadinessCandidate\(\s*page,\s*slotPng,/,
  "strict readiness must not overwrite the slot artifact",
);
assert.equal(
  normalizeMediaIdentityUrl("https://cdn.perrenguematogrosso.com/app/uploads/2026/07/825x120.gif?v=1"),
  normalizeMediaIdentityUrl("https://cdn.perrenguematogrosso.com/app/uploads/2026/07/825x120.gif?v=2"),
);
assert.notEqual(
  normalizeMediaIdentityUrl("https://cdn.perrenguematogrosso.com/app/uploads/2026/07/825x120.gif"),
  normalizeMediaIdentityUrl("https://cdn.perrenguematogrosso.com/app/uploads/2026/07/govmt_mt_e_tolerancia_zero_nos_crimes_ambientais_banner_825x120.gif"),
);

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

assert.equal(
  isRejectedArticleCandidateUrl(
    "https://afolhalivre.com/cgi-sys/suspendedpage.cgi",
    mapping,
  ),
  true,
);
assert.equal(
  isRejectedArticleCandidateUrl(
    "https://externo.example/materia/",
    mapping,
  ),
  true,
);
assert.equal(
  isRejectedArticleCandidateUrl(
    "https://afolhalivre.com/materia-valida/",
    mapping,
  ),
  false,
);

const rejectedPage = {
  url: () => "https://afolhalivre.com/cgi-sys/suspendedpage.cgi",
  evaluate: async () => {
    throw new Error("evaluate should not run for rejected URL");
  },
};
assert.deepEqual(
  await auditArticleCandidatePage(rejectedPage, { ...mapping, page: "article" }),
  {
    ok: false,
    reason: "invalid_article_url",
    currentUrl: "https://afolhalivre.com/cgi-sys/suspendedpage.cgi",
  },
);

const validPage = {
  url: () => "https://afolhalivre.com/materia-valida/",
  evaluate: async () => ({
    title: "Matéria válida",
    hasEditorialContent: true,
    suspended: false,
  }),
};
assert.equal(
  (await auditArticleCandidatePage(validPage, { ...mapping, page: "article" })).ok,
  true,
);

console.log("ok: WordPress article capture fallback preserves date and same-origin safety");
