import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  applyPerrengueStaticRetroPreview,
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

function makeDocument() {
  const attrs = new Map();
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
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === "main") return emptyNode;
      return null;
    },
    _attrs: attrs,
  };
}

function makePage(indexPayload) {
  return {
    async evaluate(fn, payload) {
      const previous = {
        document: globalThis.document,
        window: globalThis.window,
        HTMLElement: globalThis.HTMLElement,
        fetch: globalThis.fetch,
      };
      const document = makeDocument();
      try {
        globalThis.document = document;
        globalThis.HTMLElement = class HTMLElement {};
        globalThis.window = {
          location: { origin: "https://perrenguematogrosso.com" },
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

assert.equal(normalizePerrengueWpRestBefore("2026-07-07T19:17"), "2026-07-07T19:17:00");
assert.equal(normalizePerrengueWpRestBefore("2026-07-07T19:17:32-04:00"), "2026-07-07T19:17:32");
assert.equal(normalizePerrengueWpRestBefore("2026-07-07"), "2026-07-07T23:59:59");
assert.equal(normalizePerrengueWpRestBefore("invalido"), "");

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
