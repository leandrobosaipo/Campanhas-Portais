import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  buildVerifiedEditorialDateReplacements,
  compactMetadataForPersistence,
  normalizeVerifiedPnmtHeroRelativeDates,
} = require("./capture-insertion-proof.cjs");

const captureAt = "2026-09-12T21:53:00-04:00";
const url = "https://portalnortemt.com/rotatoria-sera-substituida-por-semaforo-em-cruzamento-movimentado-de-sinop/";
const rows = [{ id: 71659, date: "2026-09-12T15:26:00", link: url }];
assert.deepEqual(buildVerifiedEditorialDateReplacements(rows, captureAt), {
  "/rotatoria-sera-substituida-por-semaforo-em-cruzamento-movimentado-de-sinop": {
    date: "2026-09-12T15:26:00", label: "12/09/2026 15:26", postId: 71659, source: "wordpress_rest_verified",
  },
});
assert.deepEqual(buildVerifiedEditorialDateReplacements([{ ...rows[0], date: "2026-09-13T00:01:00" }], captureAt), {});
assert.deepEqual(buildVerifiedEditorialDateReplacements([...rows, { ...rows[0], id: 99 }], captureAt), {});

class Element {
  constructor(text = "") { this.textContent = text; this.attrs = new Map(); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) || null; }
}
const relative = new Element("há 2 dias");
const link = { href: url };
const card = {
  querySelector(selector) { return selector === "a[href]" ? link : null; },
  querySelectorAll() { return [relative]; },
  setAttribute(key, value) { this.attrs ??= new Map(); this.attrs.set(key, String(value)); },
};
const page = {
  async evaluate(fn, arg) {
    const before = { document: global.document, window: global.window, fetch: global.fetch };
    global.window = { location: { origin: "https://portalnortemt.com", href: "https://portalnortemt.com/" } };
    global.document = { querySelectorAll: () => [card] };
    global.fetch = async () => ({ ok: true, json: async () => rows });
    try { return await fn(arg); } finally { global.document = before.document; global.window = before.window; global.fetch = before.fetch; }
  },
};
const result = await normalizeVerifiedPnmtHeroRelativeDates(page, { domain: "portalnortemt.com", page: "home" }, captureAt);
assert.equal(result.applied, 1);
assert.equal(relative.textContent, "12/09/2026 15:26");
assert.equal(relative.getAttribute("data-adops-retro-original-relative-date"), "há 2 dias");
assert.equal(relative.getAttribute("data-adops-retro-date-source"), "wordpress_rest_verified");
assert.equal(result.replacements[0].url, url);
assert.deepEqual(
  compactMetadataForPersistence({ verifiedEditorialDateReplacements: result.replacements }).verifiedEditorialDateReplacements,
  result.replacements,
);
const source = await readFile(new URL("./capture-insertion-proof.cjs", import.meta.url), "utf8");
assert.ok(source.indexOf("normalizeVerifiedPnmtHeroRelativeDates(page, mapping, effectiveCaptureAt)") < source.indexOf('trace.start("critical_assets")'));
assert.match(source, /verifiedEditorialDateReplacements,/);
console.log("ok: PNMT hero relative date requires one verified, non-future WP permalink");
