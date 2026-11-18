import assert from "node:assert/strict";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { validatePublishedAdHtml } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const originalFetch = global.fetch;
const requestedUrls = [];
global.fetch = async (input) => {
  const url = String(input);
  requestedUrls.push(url);
  if (url === "https://perrenguematogrosso.com/") {
    return { ok: true, status: 200, url, text: async () => '<a href="/noticia-de-hoje/">Notícia de hoje</a>' };
  }
  if (url === "https://perrenguematogrosso.com/noticia-de-hoje/") {
    return { ok: true, status: 200, url, text: async () => '<div class="g g-11"><a class="a-219"><img src="https://cdn.example.test/entregas.gif"></a></div>' };
  }
  return { ok: false, status: 404, url, text: async () => "" };
};

try {
  const input = { site: { domain: "perrenguematogrosso.com" }, insertionId: 3083, adId: 219,
    mediaBasename: "entregas.gif", page: "article", slotSelector: ".g.g-11", maxAttempts: 1 };
  const result = await validatePublishedAdHtml(input);
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://perrenguematogrosso.com/noticia-de-hoje/");
  assert.equal(result.mediaFound, true);
  assert.equal(result.slotFound, true);
  assert.deepEqual(requestedUrls, ["https://perrenguematogrosso.com/", "https://perrenguematogrosso.com/noticia-de-hoje/"]);

  global.fetch = async (request) => {
    const url = String(request);
    return { ok: true, status: 200, url, text: async () => url.endsWith("/noticia-de-hoje/")
      ? '<div class="g g-11"></div><div class="g g-6"><img src="https://cdn.example.test/entregas.gif"></div>'
      : '<a href="/noticia-de-hoje/">Notícia de hoje</a>' };
  };
  assert.equal((await validatePublishedAdHtml(input)).ok, false);

  global.fetch = async (request) => {
    const url = String(request);
    return { ok: true, status: 200, url, text: async () => url.endsWith("/noticia-de-hoje/")
      ? '<div class="g g-11"></div><div class="g g-11"><img src="https://cdn.example.test/entregas.gif"></div>'
      : '<a href="/noticia-de-hoje/">Notícia de hoje</a>' };
  };
  assert.equal((await validatePublishedAdHtml({ ...input, mediaUrl: "https://cdn.example.test/entregas.gif" })).ok, true);
  assert.equal((await validatePublishedAdHtml({ ...input, mediaUrl: "https://other.example.test/entregas.gif" })).ok, false);
} finally {
  global.fetch = originalFetch;
}
