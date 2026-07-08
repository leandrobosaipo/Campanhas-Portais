import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applyPerrengueStaticRetroPreview } = require("./capture-insertion-proof.cjs");

function makePost(day, title = `Post ${day}`) {
  return {
    title,
    url: `/post-${day}/`,
    image: `https://perrenguematogrosso.com/app/uploads/2026/06/post-${day}.jpg`,
    date: `2026-06-${String(day).padStart(2, "0")}T12:00:00`,
    publishedAt: `2026-06-${String(day).padStart(2, "0")}T16:00:00Z`,
    category: "Notícias",
  };
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

{
  const result = await applyPerrengueStaticRetroPreview(makePage([makePost(1)]), mapping, "2026-06-01T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, true);
  assert.equal(result.postsAvailable, 1);
  assert.equal(result.postsRequired, 4);
}

{
  const result = await applyPerrengueStaticRetroPreview(makePage([makePost(1), makePost(2), makePost(3)]), mapping, "2026-06-03T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, true);
  assert.equal(result.postsAvailable, 3);
  assert.equal(result.postsRequired, 4);
}

{
  const result = await applyPerrengueStaticRetroPreview(makePage([makePost(1), makePost(2), makePost(3), makePost(4)]), mapping, "2026-06-04T18:30");
  assert.equal(result.applied, true);
  assert.equal(result.sparse, false);
  assert.equal(result.postsAvailable, 4);
  assert.equal(result.postsRequired, 4);
}

{
  await assert.rejects(
    () => applyPerrengueStaticRetroPreview(makePage([makePost(2)]), mapping, "2026-06-01T18:30"),
    /perrengue_static_retro_preview_failed: not_enough_retro_posts/,
  );
}

console.log("ok: perrengue static retro sparse harness");
