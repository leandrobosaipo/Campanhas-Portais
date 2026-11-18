import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const {
  captureStrictReadinessCandidate,
  collectCapturePageHealthMetadata,
  compactMetadataForPersistence,
  trackMainFrameNavigationResponses,
  validateCaptureChecklist,
} = require("./capture-insertion-proof.cjs");

const html = (body, title = "Campaign") => `<!doctype html><html><head><title>${title}</title><style>
  body{margin:0;font:16px sans-serif}#ad{position:absolute;top:160px;left:300px;width:400px;height:100px;background:#09c}
  .blocker{position:fixed;inset:0;z-index:9999;background:#fff9;display:grid;place-items:center}
  .small-overlay{position:absolute;left:2px;top:2px;width:40px;height:20px;z-index:2;background:#eee}
  .hidden-overlay{display:none}
</style></head><body><main><h1>Campaign page</h1><div id="ad">banner</div>${body}</main></body></html>`;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/audit-checklists/validate-proof") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const metadata = body.metadata || {};
      const blockingIssues = [];
      if (Number(metadata.pageStatus) >= 400 || metadata.pageLooks404 === true) blockingIssues.push({ code: "page_404_detected" });
      if (metadata.overlayAudit?.ok === false) blockingIssues.push({ code: "overlay_detected" });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ approved: blockingIssues.length === 0, blockingIssues }));
    });
    return;
  }
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (pathname === "/http-404") res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  else res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  const body = pathname === "/soft-404"
    ? "<h1>Página não encontrada</h1>"
    : pathname === "/editorial-404-people"
      ? "<h1>404 pessoas acompanharam a notícia</h1>"
      : pathname === "/editorial-not-found"
        ? "<h1>Homem não encontrado após acidente</h1>"
    : pathname === "/overlay"
      ? '<div role="dialog" class="blocker">Aviso</div>'
      : pathname === "/anonymous-fixed"
        ? '<div style="position:fixed;inset:0;z-index:9999;background:#fff9">Aviso</div>'
        : pathname === "/bottom-popup"
          ? '<div id="cod5-bottom-popup-ad" class="popup blocker">Anúncio permitido</div>'
          : pathname === "/native-video-overlay"
            ? '<div data-adops-video-overlay="1" class="blocker">Controles nativos do vídeo</div>'
      : pathname === "/small-overlay"
        ? '<div class="small-overlay">Badge</div>'
        : pathname === "/hidden-overlay"
          ? '<div role="dialog" class="hidden-overlay">Oculto</div>'
          : "";
  const pageTitle = pathname === "/soft-404" ? "404 — Página não encontrada" : "Campaign";
  res.end(pathname === "/anonymous-fixed"
    ? `<!doctype html><html><head><title>${pageTitle}</title><style>body{margin:0}#ad{position:absolute;top:160px;left:300px;width:400px;height:100px;background:#09c}</style></head><body><main><h1>Campaign page</h1><div id="ad">banner</div></main><div style="position:fixed;inset:0;z-index:9999;background:#fff9">Aviso</div></body></html>`
    : html(body, pageTitle));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const workDir = mkdtempSync(path.join(tmpdir(), "adops-capture-health-"));
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  let mainFrameResponse = null;
  trackMainFrameNavigationResponses(page, (response) => { mainFrameResponse = response; });

  async function readHealth(pathname) {
    const response = await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded" });
    return collectCapturePageHealthMetadata(page, response || mainFrameResponse, { slotSelector: "#ad" });
  }

  const normal = await readHealth("/ok");
  assert.equal(normal.pageStatus, 200);
  assert.equal(normal.pageLooks404, false);
  assert.equal(normal.overlayAudit.checked, true);
  assert.equal(normal.overlayAudit.ok, true);
  assert.equal((await validateCaptureChecklist(base, 123, "2026-10-13", normal)).approved, true);

  const http404 = await readHealth("/http-404");
  assert.equal(http404.pageStatus, 404);
  assert.equal(http404.pageLooks404, false, "the HTTP response status independently reports the 404");
  await assert.rejects(
    () => validateCaptureChecklist(base, 123, "2026-10-13", http404),
    /page_404_detected/,
    "HTTP error metadata must reach and fail the pre-upload checklist",
  );

  const soft404 = await readHealth("/soft-404");
  assert.equal(soft404.pageStatus, 200);
  assert.equal(soft404.pageLooks404, true);
  assert.equal((await readHealth("/editorial-404-people")).pageLooks404, false, "editorial references to 404 are not a soft-404");
  assert.equal((await readHealth("/editorial-not-found")).pageLooks404, false, "editorial wording about a person not found is not a soft-404");

  const blocked = await readHealth("/overlay");
  assert.equal(blocked.pageStatus, 200);
  assert.equal(blocked.overlayAudit.checked, true);
  assert.equal(blocked.overlayAudit.ok, false);
  assert.equal(blocked.overlayAudit.blockingCount, 1);
  await assert.rejects(
    () => validateCaptureChecklist(base, 123, "2026-10-13", blocked),
    /overlay_detected/,
    "a blocking overlay in the final DOM must fail the pre-upload checklist",
  );

  const anonymousFixed = await readHealth("/anonymous-fixed");
  assert.equal(anonymousFixed.overlayAudit.ok, false, "an anonymous fixed layer covering the slot is detected");

  const small = await readHealth("/small-overlay");
  assert.equal(small.overlayAudit.ok, true, "small non-obstructing overlay is not a blocker");
  const hidden = await readHealth("/hidden-overlay");
  assert.equal(hidden.overlayAudit.ok, true, "hidden overlay is not a blocker");
  const bottomPopup = await page.goto(`${base}/bottom-popup`, { waitUntil: "domcontentloaded" });
  const allowedBottomPopup = await collectCapturePageHealthMetadata(page, bottomPopup, { slotSelector: "#ad", preserveBottomPopup: true });
  assert.equal(allowedBottomPopup.overlayAudit.ok, true, "the configured AdRotate bottom popup is preserved");
  const nativeVideoOverlay = await readHealth("/native-video-overlay");
  assert.equal(nativeVideoOverlay.overlayAudit.ok, true, "the native video progress overlay marker is not treated as a blocker");
  await page.goto(`${base}/hidden-overlay`, { waitUntil: "domcontentloaded" });
  await page.locator('[role="dialog"]').evaluate((node) => { node.className = "blocker"; });
  const overlayAfterCleanup = await collectCapturePageHealthMetadata(page, mainFrameResponse, { slotSelector: "#ad" });
  assert.equal(overlayAfterCleanup.overlayAudit.ok, false, "a blocking overlay appearing after cleanup remains visible to the final audit");

  await page.goto(`${base}/overlay`, { waitUntil: "domcontentloaded" });
  const cleanViewportPath = path.join(workDir, "clean-viewport.png");
  await page.goto(`${base}/ok`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: cleanViewportPath });
  await page.goto(`${base}/overlay`, { waitUntil: "domcontentloaded" });
  let readinessFrameHealth = null;
  const strictScreenshotPath = path.join(workDir, "strict-viewport.png");
  const strictReadiness = await captureStrictReadinessCandidate(page, strictScreenshotPath, "#ad", {
    readinessMode: "strict-visible",
    criticalContentSelectors: ["#ad"],
    layoutStableSamples: 2,
    layoutStableIntervalMs: 100,
    captureRetryCount: 0,
    requireCriticalContentPainted: false,
  }, [], async () => {
    readinessFrameHealth = await collectCapturePageHealthMetadata(page, mainFrameResponse, { slotSelector: "#ad" });
  });
  assert.equal(strictReadiness.approved, true);
  assert.equal(readinessFrameHealth.overlayAudit.ok, false, "health audit runs immediately before the strict-mode proof screenshot");
  const strictScreenshot = readFileSync(strictScreenshotPath);
  assert.ok(strictScreenshot.length > 0, "strict-mode viewport proof was created after health audit");
  assert.notDeepEqual(strictScreenshot, readFileSync(cleanViewportPath), "strict proof contains the blocker that the adjacent DOM audit detected");
  await assert.rejects(
    () => validateCaptureChecklist(base, 123, "2026-10-13", readinessFrameHealth),
    /overlay_detected/,
    "strict-mode final DOM blocker reaches and fails the existing checklist gate",
  );

  const signedPreview = await readHealth("/ok?captureAt=2026-10-13T18%3A00%3A00-04%3A00&sig=fixture");
  assert.equal(signedPreview.pageStatus, 200);
  assert.equal(signedPreview.pageLooks404, false, "signed preview query does not create a false positive");
  assert.equal(signedPreview.overlayAudit.ok, true);

  await assert.rejects(
    () => collectCapturePageHealthMetadata(page, null, { slotSelector: "#ad" }),
    /page_status_unavailable/,
    "unknown navigation status must fail closed rather than become HTTP 200",
  );
  await assert.rejects(
    () => collectCapturePageHealthMetadata({ evaluate: async () => { throw new Error("fixture evaluation failure"); } }, { status: () => 200 }, { slotSelector: "#ad" }),
    /page_health_unavailable/,
    "unknown DOM measurement must fail closed rather than become an unobstructed page",
  );

  const metadata = compactMetadataForPersistence({ insertionId: 123, ...(await readHealth("/http-404")) });
  const metadataPath = path.join(workDir, "metadata.json");
  writeFileSync(metadataPath, JSON.stringify(metadata));
  const persisted = JSON.parse(readFileSync(metadataPath, "utf8"));
  assert.equal(persisted.pageStatus, 404);
  assert.equal(persisted.pageLooks404, false);
  assert.equal(persisted.overlayAudit.checked, true);

  await page.goto(`${base}/ok`, { waitUntil: "domcontentloaded" });
  await page.evaluate((url) => { window.location.href = url; }, `${base}/http-404`);
  await page.waitForURL(`${base}/http-404`);
  await page.waitForLoadState("domcontentloaded");
  const finalNavigationHealth = await collectCapturePageHealthMetadata(page, mainFrameResponse, { slotSelector: "#ad" });
  assert.equal(finalNavigationHealth.pageStatus, 404, "latest main-frame response wins over an earlier HTTP 200");
  console.log(JSON.stringify({ ok: true, cases: ["http_200", "http_404", "soft_404", "editorial_404_number", "editorial_not_found_phrase", "blocking_overlay", "anonymous_fixed_overlay", "small_overlay", "hidden_overlay", "allowed_bottom_popup", "native_video_overlay", "overlay_after_cleanup", "strict_screenshot_audited_before_capture", "signed_preview", "unknown_status_fail_closed", "metadata_persisted", "latest_main_navigation_status"] }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(workDir, { recursive: true, force: true });
}
