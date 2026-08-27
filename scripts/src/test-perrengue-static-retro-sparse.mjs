import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  applyPerrengueStaticRetroPreview,
  collectRetroContentEvidence,
  normalizePerrengueWpRestBefore,
} = require("./capture-insertion-proof.cjs");

function makePost(day, title = `Post ${day}`, category = "Notícias", categorySlug = "noticias") {
  return {
    title,
    url: `/post-${day}/`,
    image: `https://perrenguematogrosso.com/app/uploads/2026/06/post-${day}.jpg`,
    date: `2026-06-${String(day).padStart(2, "0")}T12:00:00`,
    publishedAt: `2026-06-${String(day).padStart(2, "0")}T16:00:00Z`,
    category,
    categorySlug,
  };
}

function makeMemePost(day, title = `Meme ${day}`) {
  return makePost(day, title, "Memes do vovô", "memes-do-vovo");
}

function makeDocument(pageType = "home") {
  const attrs = new Map();
  const makeElement = () => Object.assign(new globalThis.HTMLElement(), {
    _attrs: new Map(),
    setAttribute(name, value) { this._attrs.set(name, String(value)); },
    getAttribute(name) { return this._attrs.get(name) ?? null; },
    getBoundingClientRect() { return { width: 320, height: 48 }; },
  });
  const title = Object.assign(makeElement(), {
    replaceChildren(...children) { this.children = children; },
  });
  const time = makeElement();
  const article = Object.assign(makeElement(), {
    querySelector(selector) {
      if (selector === "h1,.entry-title") return title;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "time" ? [time] : [];
    },
  });
  const emptyNode = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return {
    documentElement: {
      setAttribute(name, value) {
        attrs.set(`html:${name}`, String(value));
      },
      getAttribute(name) {
        return attrs.get(`html:${name}`) ?? null;
      },
    },
    body: {
      setAttribute(name, value) {
        attrs.set(`body:${name}`, String(value));
      },
      getAttribute(name) {
        return attrs.get(`body:${name}`) ?? null;
      },
    },
    createElement() {
      return makeElement();
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (pageType === "article" && (selector === "main article" || selector === "article")) return article;
      if (selector === "main") return emptyNode;
      return null;
    },
    _attrs: attrs,
  };
}

function makePage(indexPayload, pageType = "home") {
  return {
    lastDocument: null,
    async evaluate(fn, payload) {
      const previous = {
        document: globalThis.document,
        window: globalThis.window,
        HTMLElement: globalThis.HTMLElement,
        fetch: globalThis.fetch,
      };
      try {
        globalThis.HTMLElement = class HTMLElement {};
        const document = makeDocument(pageType);
        this.lastDocument = document;
        globalThis.document = document;
        globalThis.window = {
          location: { origin: "https://perrenguematogrosso.com", pathname: pageType === "article" ? "/post-1/" : "/" },
        };
        globalThis.fetch = async () => ({
          ok: true,
          async json() {
            return indexPayload;
          },
        });
        return await fn(payload);
      } finally {
        globalThis.document = previous.document;
        globalThis.window = previous.window;
        globalThis.HTMLElement = previous.HTMLElement;
        globalThis.fetch = previous.fetch;
      }
    },
  };
}

const mapping = { domain: "perrenguematogrosso.com", page: "home" };
const applyPreview = (posts, captureAt) => applyPerrengueStaticRetroPreview(
  makePage(posts),
  mapping,
  captureAt,
  { adminRetroPosts: posts, requireEditorialTargets: false },
);
const applyArticlePreview = (posts, captureAt) => applyPerrengueStaticRetroPreview(
  makePage(posts, "article"),
  { domain: "perrenguematogrosso.com", page: "article" },
  captureAt,
  { adminRetroPosts: posts },
);

{
  const posts = [makePost(1), makePost(2), makePost(3)];
  const page = makePage(posts);
  const expectedPosts = posts.map((post) => ({ slug: post.url.replace(/^\/+|\/+$/g, ""), date: post.date, url: `/arquivo/2026/06${post.url}`, title: post.title }));
  const expectedLeadSlugs = posts.map((post) => post.url.replace(/^\/+|\/+$/g, ""));
  const evidence = await collectRetroContentEvidence(
    page,
    { domain: mapping.domain, pageLabel: "Home", homeUrl: "https://perrenguematogrosso.com/", auditConfig: {} },
    "2026-06-10T18:30",
    { applied: true, editorialContentMatches: true, expectedPosts, expectedLeadSlugs, renderedLeadSlugs: expectedLeadSlugs },
  );
  assert.ok(evidence.editorialSamples.length > 0);
  assert.equal(evidence.editorialSamples[0].source, "audited_home_reconstruction");
  assert.equal(evidence.retroContentProof.status, "approved");

  const mismatch = await collectRetroContentEvidence(
    makePage(posts),
    { ...mapping, homeUrl: "https://perrenguematogrosso.com/", auditConfig: {} },
    "2026-06-10T18:30",
    { applied: true, editorialContentMatches: true, expectedPosts, expectedLeadSlugs, renderedLeadSlugs: [...expectedLeadSlugs].reverse() },
  );
  assert.equal(mismatch.editorialSamples.length, 0);
  assert.equal(mismatch.retroContentProof.status, "rejected");

  const conflictingMapping = await collectRetroContentEvidence(
    makePage(posts),
    { ...mapping, page: "article", pageLabel: "Home", homeUrl: "https://perrenguematogrosso.com/", auditConfig: {} },
    "2026-06-10T18:30",
    { applied: true, editorialContentMatches: true, expectedPosts, expectedLeadSlugs, renderedLeadSlugs: expectedLeadSlugs },
  );
  assert.equal(conflictingMapping.editorialSamples.length, 0);
  assert.equal(conflictingMapping.retroContentProof.status, "rejected");
}

assert.equal(normalizePerrengueWpRestBefore("2026-07-07T19:17"), "2026-07-07T19:17:00");
assert.equal(normalizePerrengueWpRestBefore("2026-07-07T19:17:32-04:00"), "2026-07-07T19:17:32");
assert.equal(normalizePerrengueWpRestBefore("2026-07-07"), "2026-07-07T23:59:59");
assert.equal(normalizePerrengueWpRestBefore("invalido"), "");

{
  const posts = [makePost(1)];
  const page = makePage(posts, "article");
  const articleMapping = {
    domain: "perrenguematogrosso.com",
    homeUrl: "https://perrenguematogrosso.com/",
    page: "article",
    auditConfig: {},
  };
  const result = await applyPerrengueStaticRetroPreview(
    page,
    articleMapping,
    "2026-06-01T18:30",
    { adminRetroPosts: posts },
  );
  assert.equal(result.applied, true);
  assert.equal(result.articleVerified, true);
  assert.equal(result.expectedPosts[0]?.url, "/post-1/");
  const article = page.lastDocument.querySelector("main article");
  assert.equal(article.getAttribute("data-adops-retro-primary-article"), "1");
  assert.equal(article.getAttribute("data-adops-retro-post-date"), posts[0].date);

  const evidence = await collectRetroContentEvidence(page, articleMapping, "2026-06-01T18:30", result);
  assert.equal(evidence.editorialSamples.length, 1);
  assert.equal(evidence.editorialSamples[0].title, posts[0].title);
  assert.equal(evidence.retroContentProof.status, "approved");
  assert.equal(evidence.retroContentProof.futureCount, 0);
  assert.match(evidence.manifestHash, /^[a-f0-9]{64}$/);
}

{
  const unsupportedPage = {
    async evaluate() {
      throw new Error("unsupported page must not be evaluated");
    },
  };
  assert.equal(await applyPerrengueStaticRetroPreview(
    unsupportedPage,
    { domain: "perrenguematogrosso.com", page: "category" },
    "2026-06-01T18:30",
    { adminRetroPosts: [makePost(1)] },
  ), false);
}

{
  const result = await applyPreview([makePost(1)], "2026-06-01T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, true);
  assert.equal(result.postsAvailable, 1);
  assert.equal(result.postsRequired, 4);
}

{
  const result = await applyPreview([makePost(1), makePost(2), makePost(3)], "2026-06-03T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, true);
  assert.equal(result.postsAvailable, 3);
  assert.equal(result.postsRequired, 4);
}

{
  const result = await applyPreview([makePost(1), makePost(2), makePost(3), makePost(4)], "2026-06-04T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, false);
  assert.equal(result.postsAvailable, 4);
  assert.equal(result.postsRequired, 4);
}

{
  const result = await applyPreview(
    [makeMemePost(4), makePost(3), makeMemePost(2), makePost(1)],
    "2026-06-04T18:30",
  );
  assert.equal(result.applied, true);
  assert.equal(result.postsAvailable, 2);
  assert.equal(result.totalPostsAvailable, 4);
  assert.equal(result.excludedMemePosts, 2);
  assert.deepEqual(result.editorialMemeLeaks, []);
}

{
  await assert.rejects(
    () => applyPreview([makeMemePost(1)], "2026-06-01T18:30"),
    /perrengue_static_retro_preview_failed: not_enough_editorial_retro_posts/,
  );
}

{
  await assert.rejects(
    () => applyPreview([makePost(2)], "2026-06-01T18:30"),
    /perrengue_static_retro_preview_failed: not_enough_retro_posts/,
  );
}

console.log("ok: perrengue static retro sparse harness");
