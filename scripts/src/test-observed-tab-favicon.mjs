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
const { captureObservedTabFavicon, resolveAllowedExternalFaviconHosts, isAllowedFaviconUrl, composeDesktopProof } = require("./capture-insertion-proof.cjs");
const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const tempDir = mkdtempSync(path.join(os.tmpdir(), "adops-observed-favicon-"));
const faviconPath = path.join(tempDir, "favicon.png");
execFileSync(python, ["-c", "from PIL import Image; import sys; Image.new('RGBA',(24,24),(15,90,180,255)).save(sys.argv[1])", faviconPath]);
const faviconBytes = readFileSync(faviconPath);
let firstPort = 0;
let secondPort = 0;
let faviconFetchCookieHeader = null;
let faviconFetchHeaders = null;
let externalRequests = 0;
let cdnFetchCookieHeader = null;
let cdnFetchHeaders = null;
let portalFaviconRequests = 0;
const originalGlobalFetch = globalThis.fetch;
const nodeFallbackCalls = [];
const portalFaviconHeaders = new Map();
const portalFaviconHostsBySite = {
  AFL: { domain: "afolhalivre.com", host: "afolhalivre.nyc3.digitaloceanspaces.com" },
  ROO: { domain: "roonoticias.com", host: "roonoticias.nyc3.digitaloceanspaces.com" },
  PNMT: { domain: "portalnortemt.com", host: "portalnortemt.nyc3.digitaloceanspaces.com" },
  PPMT: { domain: "portalpantanalmt.com", host: "portalpantanalmt.nyc3.digitaloceanspaces.com" },
};

const external = createServer((req, res) => { externalRequests += 1; res.writeHead(200, { "content-type": "image/png" }); res.end(faviconBytes); });
const server = createServer((req, res) => {
  if (req.url === "/header-echo") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ cacheControl: req.headers["cache-control"] || null, pragma: req.headers.pragma || null, acceptLanguage: req.headers["accept-language"] || null }));
    return;
  }
  if (req.url === "/empty-title") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>   </title><p>empty title fixture</p>");
    return;
  }
  if (req.url === "/perrengue-cdn") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><link rel="icon" href="https://cdn.perrenguematogrosso.com/app/uploads/favicon.png"><title>Perrengue</title>`);
    return;
  }
  if (req.url.startsWith("/portal-favicon/")) {
    const siteSigla = req.url.split("/")[2];
    const target = portalFaviconHostsBySite[siteSigla];
    if (!target) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><link rel="icon" href="https://${target.host}/app/uploads/favicon.png"><title>${siteSigla}</title>`);
    return;
  }
  if (req.url === "/cross-nyc3") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><link rel="icon" href="https://afolhalivre.nyc3.digitaloceanspaces.com/app/uploads/favicon.png"><title>Cross site</title>`);
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
    faviconFetchCookieHeader = req.headers.cookie || null;
    faviconFetchHeaders = { cacheControl: req.headers["cache-control"] || null, pragma: req.headers.pragma || null, acceptLanguage: req.headers["accept-language"] || null };
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
  const mappedHosts = [
    "perrenguematogrosso.com", "cdn.perrenguematogrosso.com",
    ...Object.values(portalFaviconHostsBySite).flatMap(({ domain, host }) => [domain, host]),
    "afolhalivre.nyc3.digitaloceanspaces.com",
  ];
  browser = await chromium.launch({ headless: true, args: [`--host-resolver-rules=${mappedHosts.map((host) => `MAP ${host} 127.0.0.1`).join(",")}`] });
  const context = await browser.newContext();
  await context.addCookies([{ name: "private_test_cookie", value: "must-not-leak", domain: "perrenguematogrosso.com", path: "/", httpOnly: true }]);
  const page = await context.newPage();
  await page.route("https://cdn.perrenguematogrosso.com/**", async (route) => {
    cdnFetchCookieHeader = route.request().headers().cookie || null;
    const headers = route.request().headers();
    cdnFetchHeaders = { cacheControl: headers["cache-control"] || null, pragma: headers.pragma || null, acceptLanguage: headers["accept-language"] || null };
    const carriesCaptureCacheHeaders = Boolean(cdnFetchHeaders.cacheControl || cdnFetchHeaders.pragma);
    await route.fulfill({ status: carriesCaptureCacheHeaders ? 403 : 200, contentType: "image/png", headers: { "access-control-allow-origin": `http://perrenguematogrosso.com:${firstPort}` }, body: faviconBytes });
  });
  for (const { host } of Object.values(portalFaviconHostsBySite)) {
    await page.route(`https://${host}/**`, async (route) => {
      portalFaviconRequests += 1;
      const headers = route.request().headers();
      const summary = {
        cacheControl: headers["cache-control"] || null,
        pragma: headers.pragma || null,
        cookie: headers.cookie || null,
        authorization: headers.authorization || null,
      };
      portalFaviconHeaders.set(host, summary);
      const carriesCaptureCacheHeaders = Boolean(summary.cacheControl || summary.pragma);
      if (host.startsWith("roonoticias.") || host.startsWith("portalnortemt.")) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: carriesCaptureCacheHeaders ? 403 : 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": headers.origin || "null" },
        body: faviconBytes,
      });
    });
  }
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (!url.hostname.endsWith(".nyc3.digitaloceanspaces.com")) return originalGlobalFetch(input, options);
    nodeFallbackCalls.push({ url: url.href, options: { method: options.method, credentials: options.credentials, cache: options.cache, redirect: options.redirect, hasSignal: Boolean(options.signal), headers: options.headers || null } });
    if (url.searchParams.has("redirect")) return new Response("", { status: 302, headers: { location: "https://elsewhere.example/icon.png", "content-type": "image/png" } });
    if (url.searchParams.has("oversized")) return new Response(new Uint8Array(1048577), { status: 200, headers: { "content-type": "image/png" } });
    return new Response(faviconBytes, { status: 200, headers: { "content-type": "image/png" } });
  };
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/`, { waitUntil: "domcontentloaded" });
  const captureHeaders = { "Cache-Control": "no-cache", Pragma: "no-cache", "Accept-Language": "pt-BR" };
  await page.setExtraHTTPHeaders(captureHeaders);
  const observed = await captureObservedTabFavicon(page, "perrenguematogrosso.com", captureHeaders);
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
  const configuredTitle = "Título do mapping";
  const actualPageTitle = (await page.title()).trim();
  assert.equal(actualPageTitle, "Perrengue");
  const unfiltered = await page.evaluate(async () => {
    try { return (await fetch(document.querySelector('link[rel="icon"]').href, { credentials: "omit", cache: "no-store" })).ok; }
    catch { return false; }
  });
  assert.equal(unfiltered, false, "fixture CDN rejects favicon GET carrying the global capture cache headers");
  const cdnObserved = await captureObservedTabFavicon(page, "perrenguematogrosso.com", captureHeaders);
  assert.equal(cdnObserved?.sourceUrl, "https://cdn.perrenguematogrosso.com/app/uploads/favicon.png");
  assert.match(cdnObserved?.dataUrl || "", /^data:image\/png;base64,/);
  assert.equal(cdnFetchCookieHeader, null, "approved CDN fetch must omit page cookies");
  assert.deepEqual(cdnFetchHeaders, { cacheControl: null, pragma: null, acceptLanguage: "pt-BR" });
  const restoredHeaders = await page.evaluate(async () => fetch("/header-echo").then((response) => response.json()));
  assert.deepEqual(restoredHeaders, { cacheControl: "no-cache", pragma: "no-cache", acceptLanguage: "pt-BR" }, "capture headers are restored after favicon fetch");

  for (const [siteSigla, { domain, host }] of Object.entries(portalFaviconHostsBySite)) {
    const allowedHostsForSite = resolveAllowedExternalFaviconHosts(domain, domain);
    assert.deepEqual(allowedHostsForSite, [host], `${siteSigla} must allow only its confirmed exact favicon host`);
    assert.equal(isAllowedFaviconUrl(`https://${domain}`, `https://${host}/app/uploads/favicon.png`, allowedHostsForSite), true);
    assert.equal(isAllowedFaviconUrl(`https://${domain}`, `https://evil-${host}/app/uploads/favicon.png`, allowedHostsForSite), false);
    assert.deepEqual(resolveAllowedExternalFaviconHosts(domain, "different.example"), [], `${siteSigla} host mapping must stay bound to its configured page host`);
    await page.goto(`http://${domain}:${firstPort}/portal-favicon/${siteSigla}`, { waitUntil: "domcontentloaded" });
    await page.setExtraHTTPHeaders(captureHeaders);
    const portalIcon = await captureObservedTabFavicon(page, domain, captureHeaders);
    assert.equal(portalIcon?.source, "observed_page_icon_link", `${siteSigla} real Chromium fixture should observe its mapped favicon`);
    assert.equal(new URL(portalIcon.sourceUrl).hostname, host);
    assert.deepEqual(portalFaviconHeaders.get(host), { cacheControl: null, pragma: null, cookie: null, authorization: null }, `${siteSigla} favicon request must omit global cache headers and credentials`);
    const restoredPortalHeaders = await page.evaluate(async () => fetch("/header-echo").then((response) => response.json()));
    assert.deepEqual(restoredPortalHeaders, { cacheControl: "no-cache", pragma: "no-cache", acceptLanguage: "pt-BR" });
  }
  assert.equal(nodeFallbackCalls.length, 2, "ROO and PNMT use the credential-free Node fallback after Chromium blocks their cross-origin fetches");
  assert(nodeFallbackCalls.every(({ options }) => options.method === "GET" && options.credentials === "omit" && options.cache === "no-store" && options.redirect === "error" && options.hasSignal && options.headers === null));
  assert(nodeFallbackCalls.every(({ url }) => url.endsWith("/app/uploads/favicon.png")));

  const portalFaviconRequestsBeforeWrongSite = portalFaviconRequests;
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/cross-nyc3`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com", captureHeaders), null, "another portal's confirmed exact host remains blocked for this site");
  assert.equal(portalFaviconRequests, portalFaviconRequestsBeforeWrongSite, "wrong-site host is rejected before network fetch");

  execFileSync(python, ["-c", "from PIL import Image; import sys; Image.new('RGB',(1280,720),(250,251,253)).save(sys.argv[1])", path.join(tempDir, "title-viewport.png")]);
  const titleActualPng = path.join(tempDir, "title-actual.png");
  const titleFallbackPng = path.join(tempDir, "title-fallback.png");
  const titleOpts = { siteSigla: "PERRENGUE", hostLabel: "perrenguematogrosso.com", systemDateTime: "terça-feira, 06/10/2026, 14:22", addressText: "https://perrenguematogrosso.com/" };
  assert.equal(composeDesktopProof(path.join(tempDir, "title-viewport.png"), titleActualPng, { ...titleOpts, tabTitle: actualPageTitle }).tabTitleRendered, true);
  composeDesktopProof(path.join(tempDir, "title-viewport.png"), titleFallbackPng, { ...titleOpts, tabTitle: configuredTitle });
  assert.notDeepEqual(readFileSync(titleActualPng), readFileSync(titleFallbackPng), "actual page title reaches the composed tab instead of configured fallback");
  const longTitlePng = path.join(tempDir, "title-long.png");
  composeDesktopProof(path.join(tempDir, "title-viewport.png"), longTitlePng, { ...titleOpts, tabTitle: "Título muito comprido ".repeat(20) });
  const clippedCropCheck = `from PIL import Image,ImageChops; import sys; a=Image.open(sys.argv[1]).convert('RGB').crop((288,77,326,106)); b=Image.open(sys.argv[2]).convert('RGB').crop((288,77,326,106)); assert ImageChops.difference(a,b).getbbox() is None`;
  execFileSync(python, ["-c", clippedCropCheck, titleFallbackPng, longTitlePng], { stdio: "pipe" });
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/empty-title`, { waitUntil: "domcontentloaded" });
  const emptyActualTitle = (await page.title()).trim();
  assert.equal(emptyActualTitle, "");
  const emptyFallbackPng = path.join(tempDir, "title-empty-fallback.png");
  composeDesktopProof(path.join(tempDir, "title-viewport.png"), emptyFallbackPng, { ...titleOpts, tabTitle: emptyActualTitle || configuredTitle });
  assert.deepEqual(readFileSync(emptyFallbackPng), readFileSync(titleFallbackPng), "empty actual title falls back to mapping title");

  await page.goto(`http://perrenguematogrosso.com:${firstPort}/cross`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "arbitrary cross-origin favicon must use explicit fallback");
  assert.equal(externalRequests, 0, "cross-origin favicon host must not be contacted");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/oversized-page`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "oversized response must be rejected");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/data-oversized`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "oversized data URI must be rejected before fetch/decode");
  await page.goto(`http://perrenguematogrosso.com:${firstPort}/wrong-type-page`, { waitUntil: "domcontentloaded" });
  assert.equal(await captureObservedTabFavicon(page, "perrenguematogrosso.com"), null, "non-image response must be rejected");
  const fallbackPage = async (href) => {
    await page.goto(`http://afolhalivre.com:${firstPort}/fallback-fixture`, { waitUntil: "domcontentloaded" });
    await page.setContent(`<!doctype html><link rel="icon" href="${href}"><title>Fallback gate</title>`, { waitUntil: "domcontentloaded" });
  };
  const callsBeforeBlocked = nodeFallbackCalls.length;
  for (const href of [
    "https://user:pass@afolhalivre.nyc3.digitaloceanspaces.com/icon.png",
    "https://afolhalivre.nyc3.digitaloceanspaces.com:444/icon.png",
    "https://evil-afolhalivre.nyc3.digitaloceanspaces.com/icon.png",
  ]) {
    await fallbackPage(href);
    assert.equal(await captureObservedTabFavicon(page, "afolhalivre.com"), null, `unsafe URL rejected: ${href.split("@").at(-1)}`);
  }
  assert.equal(nodeFallbackCalls.length, callsBeforeBlocked, "userinfo, nonstandard port, and unlisted hosts never reach Node fetch");
  await fallbackPage("https://afolhalivre.nyc3.digitaloceanspaces.com/icon.png?redirect");
  assert.equal(await captureObservedTabFavicon(page, "afolhalivre.com"), null, "Node fallback rejects redirect responses");
  await fallbackPage("https://afolhalivre.nyc3.digitaloceanspaces.com/icon.png?oversized");
  assert.equal(await captureObservedTabFavicon(page, "afolhalivre.com"), null, "Node fallback rejects an oversized streamed image");
  const timeoutHeaderCalls = [];
  const timedOutPage = {
    url: () => "https://perrenguematogrosso.com/timeout",
    setExtraHTTPHeaders: async (headers) => timeoutHeaderCalls.push({ ...headers }),
    evaluate: async () => { const error = new Error("fixture fetch timeout"); error.name = "TimeoutError"; throw error; },
  };
  assert.equal(await captureObservedTabFavicon(timedOutPage, "perrenguematogrosso.com", captureHeaders), null);
  assert.deepEqual(timeoutHeaderCalls, [{ "Accept-Language": "pt-BR" }, captureHeaders], "headers restore in finally after timeout/error");
  let restoreAttempts = 0;
  const restoreFailurePage = {
    url: () => "https://perrenguematogrosso.com/restore-failure",
    setExtraHTTPHeaders: async () => { restoreAttempts += 1; if (restoreAttempts === 2) throw new Error("restore failed"); },
    evaluate: async () => null,
  };
  await assert.rejects(captureObservedTabFavicon(restoreFailurePage, "perrenguematogrosso.com", captureHeaders), /restore failed/);
  assert.equal(restoreAttempts, 2, "a failed header restore is surfaced instead of swallowed");
  let omittedArgHeaderCalls = 0;
  const omittedArgPage = {
    url: () => "https://perrenguematogrosso.com/omitted-headers",
    setExtraHTTPHeaders: async () => { omittedArgHeaderCalls += 1; },
    evaluate: async () => null,
  };
  await captureObservedTabFavicon(omittedArgPage, "perrenguematogrosso.com");
  assert.equal(omittedArgHeaderCalls, 0, "two-argument calls leave unknown preexisting page headers untouched");
  await context.close();
  console.log(JSON.stringify({ ok: true, sameOriginObserved: true, perrengueCdnAllowed: true, fourExactPortalHostsAllowed: true, corsMissingFallbackSites: 2, wrongPortalHostBlockedBeforeFetch: true, captureCacheHeadersScoped: true, innocentHeaderPreserved: true, headersRestored: true, actualPageTitleComposed: true, credentialsOmitted: true, arbitraryCrossOriginBlocked: true, fallbackRejectsRedirectUserinfoPortOversize: true, oversizedDataAndNetworkImagesRejected: true }));
} finally {
  globalThis.fetch = originalGlobalFetch;
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => external.close(resolve));
  rmSync(tempDir, { recursive: true, force: true });
}
