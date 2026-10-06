import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { captureObservedTabFavicon, resolveAllowedExternalFaviconHosts, isAllowedFaviconUrl } = require("./capture-insertion-proof.cjs");
const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const tempDir = mkdtempSync(path.join(os.tmpdir(), "adops-observed-favicon-"));
const faviconPath = path.join(tempDir, "favicon.png");
execFileSync(python, ["-c", "from PIL import Image; import sys; Image.new('RGBA',(24,24),(15,90,180,255)).save(sys.argv[1])", faviconPath]);
const faviconBytes = readFileSync(faviconPath);
let firstPort = 0;
let secondPort = 0;
let faviconFetchCookieHeader = null;
let externalRequests = 0;
let cdnFetchCookieHeader = null;

const external = createServer((req, res) => { externalRequests += 1; res.writeHead(200, { "content-type": "image/png" }); res.end(faviconBytes); });
const server = createServer((req, res) => {
  if (req.url === "/perrengue-cdn") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><link rel="icon" href="https://cdn.perrenguematogrosso.com/app/uploads/favicon.png"><title>Perrengue</title>`);
    return;
  }
  if (req.url === "/oversized") {
    res.writeHead(200, { "content-type": "image/png", "content-length": 1048577 });
    res.end(Buffer.alloc(1048577));
    return;
  }
  if (req.url === "/wrong-type") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("not an image");
    return;
  }
  if (req.url === "/favicon.png?tracking=discard-me") {
    if (req.headers["sec-fetch-dest"] === "empty") faviconFetchCookieHeader = req.headers.cookie || null;
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
    res.end(faviconBytes);
    return;
  }
  const iconHref = req.url === "/cross" ? `http://127.0.0.1:${secondPort}/icon.png` : req.url === "/oversized-page" ? "/oversized" : req.url === "/wrong-type-page" ? "/wrong-type" : req.url === "/data-oversized" ? `data:image/png;base64,${"A".repeat(1400001)}` : "/favicon.png?tracking=discard-me";
  res.writeHead(200, { "content-type": "text/html" });
  const rel = req.url === "/cross" ? "apple-touch-icon" : "icon";
  res.end(`<!doctype html><link rel="${rel}" href="${iconHref}"><title>Test</title>`);
});

let browser;
try {
  await new Promise((resolve) => external.listen(0, "127.0.0.1", resolve));
  secondPort = external.address().port;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  firstPort = server.address().port;
  browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP perrenguematogrosso.com 127.0.0.1"] });
  const context = await browser.newContext();
  await context.addCookies([{ name: "private_test_cookie", value: "must-not-leak", domain: "perrenguematogrosso.com", path: "/", httpOnly: true }]);
  const page = await context.newPage();
  await page.route("https://cdn.perrenguematogrosso.com/**", async (route) => {
    cdnFetchCookieHeader = route.request().headers().cookie || null;
    await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": `http://perrenguematogrosso.com:${firstPort}` }, body: faviconBytes });
  });
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/`, { waitUntil: "domcontentloaded" });
  const observed = await captureObservedTabFavicon(page, "perrenguematogrosso.com");
  assert.equal(observed?.source, "observed_page_icon_link");
  assert.equal(observed?.sourceUrl, `http://perrenguematogrosso.com:${firstPort}/favicon.png`);
  assert.match(observed?.dataUrl || "", /^data:image\/png;base64,/);
  assert.equal(faviconFetchCookieHeader, null, "favicon fetch must omit page cookies");

  const allowedHosts = resolveAllowedExternalFaviconHosts("perrenguematogrosso.com", "perrenguematogrosso.com");
  assert.deepEqual(allowedHosts, ["cdn.perrenguematogrosso.com"]);
  assert.equal(isAllowedFaviconUrl("https://perrenguematogrosso.com", "https://cdn.perrenguematogrosso.com/app/uploads/favicon.png", allowedHosts), true);
  assert.equal(isAllowedFaviconUrl("https://perrenguematogrosso.com", "https://evil-cdn.perrenguematogrosso.com/app/uploads/favicon.png", allowedHosts), false);
  assert.deepEqual(resolveAllowedExternalFaviconHosts("evil-perrenguematogrosso.com", "evil-perrenguematogrosso.com"), []);
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/perrengue-cdn`, { waitUntil: "domcontentloaded" });
  const cdnObserved = await captureObservedTabFavicon(page, "perrenguematogrosso.com");
  assert.equal(cdnObserved?.sourceUrl, "https://cdn.perrenguematogrosso.com/app/uploads/favicon.png");
  assert.match(cdnObserved?.dataUrl || "", /^data:image\/png;base64,/);
  assert.equal(cdnFetchCookieHeader, null, "approved CDN fetch must omit page cookies");

  await page.goto(`http://perrenguematogrosso.com:${firstPort}/cross`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "arbitrary cross-origin favicon must use explicit fallback");
  assert.equal(externalRequests, 0, "cross-origin favicon host must not be contacted");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/oversized-page`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "oversized response must be rejected");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/data-oversized`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "oversized data URI must be rejected before fetch/decode");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/wrong-type-page`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "non-image response must be rejected");
  await context.close();
  console.log(JSON.stringify({ ok: true, sameOriginObserved: true, perrengueCdnAllowed: true, credentialsOmitted: true, arbitraryCrossOriginBlocked: true, oversizedDataAndNetworkImagesRejected: true }));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => external.close(resolve));
  rmSync(tempDir, { recursive: true, force: true });
}
