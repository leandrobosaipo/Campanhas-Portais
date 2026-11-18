import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const { forceMatchedAdVisible, auditNativeVideoProgress, waitForViewportVisuals, auditFinalPngVideoProgress, auditFinalPngSlotPixels, auditVisiblePageDateClock, ensureFinalPageClockViewport, composeDesktopProof } = require("./capture-insertion-proof.cjs");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const captureSourcePath = path.join(projectRoot, "scripts/src/capture-insertion-proof.cjs");
const captureProgram = ts.createProgram([captureSourcePath], {
  allowJs: true,
  checkJs: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  skipLibCheck: true,
});
const captureSource = captureProgram.getSourceFile(captureSourcePath);
const captureChecker = captureProgram.getTypeChecker();
let captureMain = null;
function findCaptureMain(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "main") captureMain = node;
  ts.forEachChild(node, findCaptureMain);
}
findCaptureMain(captureSource);
assert.ok(captureMain, "capture main function must exist");
const captureTry = captureMain.body.statements.find(ts.isTryStatement);
assert.ok(captureTry?.catchClause, "capture main failure path must exist");
for (const name of ["nativeProgressAudit", "finalPngProgressAudit"]) {
  const references = [];
  function findCatchReferences(node) {
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === name) references.push(node);
    ts.forEachChild(node, findCatchReferences);
  }
  findCatchReferences(captureTry.catchClause.block);
  assert.ok(references.length > 0, `${name} must be consumed by the failure diagnostics`);
  const referenceSymbols = references.map((reference) => captureChecker.getShorthandAssignmentValueSymbol(reference));
  assert.ok(referenceSymbols.every(Boolean), `${name} references in catch must bind to an in-scope variable`);
  assert.ok(referenceSymbols.every((symbol) => symbol === referenceSymbols[0]), `${name} catch references must resolve consistently`);
  const declaration = referenceSymbols[0].valueDeclaration || referenceSymbols[0].declarations?.[0];
  assert.ok(declaration && ts.isVariableDeclaration(declaration), `${name} must have a variable declaration visible to catch`);
  assert.equal(declaration.parent?.parent?.parent, captureMain.body,
    `${name} must be declared in main scope outside the protected try block`);
}
const clockGeometryDeclaration = captureTry.catchClause.block.statements
  .filter(ts.isVariableStatement).flatMap((statement) => Array.from(statement.declarationList.declarations))
  .find((declaration) => declaration.name.getText(captureSource) === "pageClockViewportGeometry");
assert.ok(clockGeometryDeclaration?.initializer, "failure diagnostics must project clock viewport geometry");
const projectFailureGeometry = new Function("pageClockViewportAudit", "return (" + clockGeometryDeclaration.initializer.getText(captureSource) + ");");
let clockGeometryFallbacks = 0;
function countClockGeometryFallbacks(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(captureSource) === "pageClockViewportAudit"
    && node.initializer.getText(captureSource) === "pageClockViewportGeometry") clockGeometryFallbacks += 1;
  ts.forEachChild(node, countClockGeometryFallbacks);
}
countClockGeometryFallbacks(captureTry.catchClause.block);
assert.equal(clockGeometryFallbacks, 2, "API failure persistence and outbox must both retain geometry");
function findCallsIn(node, methodName) {
  const found = [];
  function visit(current) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : "";
      if (name === methodName) found.push(current);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}
let videoFinalCaptureBranch = null;
let nonVideoFinalCaptureBranch = null;
function findFinalCaptureBranches(node) {
  if (ts.isIfStatement(node)) {
    const conditionText = node.expression.getText(captureSource);
    if (conditionText === "videoMedia" && findCallsIn(node.thenStatement, "auditNativeVideoProgress").length) {
      videoFinalCaptureBranch = node.thenStatement;
    }
    if (conditionText.includes("requiresFinalPageClockProof")
      && findCallsIn(node.thenStatement, "screenshot").length
      && findCallsIn(node.thenStatement, "stampCaptureInstant").length
      && node.thenStatement.getText(captureSource).includes("viewportPngWasMissingBeforeFinalCapture")) {
      nonVideoFinalCaptureBranch = node.thenStatement;
    }
  }
  ts.forEachChild(node, findFinalCaptureBranches);
}
findFinalCaptureBranches(captureMain);
assert.ok(videoFinalCaptureBranch, "video final screenshot branch must remain testable");
assert.ok(nonVideoFinalCaptureBranch, "non-video strict final screenshot branch must remain testable");
for (const [label, branch] of [["video", videoFinalCaptureBranch], ["non-video", nonVideoFinalCaptureBranch]]) {
  const screenshotCalls = findCallsIn(branch, "screenshot");
  const stampCalls = findCallsIn(branch, "stampCaptureInstant");
  assert.ok(screenshotCalls.length && stampCalls.length, `${label} strict branch must capture and timestamp`);
  assert.ok(screenshotCalls.at(-1).getStart(captureSource) < stampCalls.at(-1).getStart(captureSource),
    `${label} real capturedAt/reconstructedAt must be stamped after its last screenshot`);
}
const nonVideoBranchText = nonVideoFinalCaptureBranch.getText(captureSource);
assert.ok(nonVideoBranchText.indexOf("viewportPngWasMissingBeforeFinalCapture") < nonVideoBranchText.indexOf("page.screenshot"),
  "non-video fallback must record whether the viewport artifact was missing before recapture");
const workDir = mkdtempSync(path.join(tmpdir(), "adops-native-progress-"));
const videoPath = path.join(workDir, "fixture.mp4");
const damagedPng = path.join(workDir, "damaged.png");

execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=480x270:rate=12", "-t", "3", "-pix_fmt", "yuv420p", videoPath], { stdio: "ignore" });
const videoBytes = readFileSync(videoPath);
const server = createServer((req, res) => {
  if (req.url === "/fixture.mp4") {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": videoBytes.length, "Accept-Ranges": "bytes" });
    res.end(videoBytes);
    return;
  }
  if (req.url?.startsWith("/viewport-")) {
    const route = req.url.split("?")[0];
    const top = route === "/viewport-offscreen" ? "1277px" : route === "/viewport-contact" ? "1200px" : "1199px";
    const left = route === "/viewport-edge" ? "1660px" : "0";
    const videoDisplay = route === "/viewport-zero-area" ? "none" : "block";
    const source = route === "/viewport-unloaded-bottom" ? "/missing.mp4" : "/fixture.mp4";
    const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><rect width='32' height='32' fill='blue'/></svg>";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><style>body{margin:0}#visual-img{position:absolute;top:20px;left:20px;width:32px;height:32px}#visual-bg{position:absolute;top:60px;left:20px;width:32px;height:32px;background-image:url("${svg}");background-size:32px 32px}video{position:absolute;top:${top};left:${left};width:184px;height:150px;display:${videoDisplay}}</style><img id="visual-img" src="${svg}"><div id="visual-bg"></div><video controls muted playsinline preload="auto" src="${source}"></video>`);
    return;
  }
  const hidden = req.url === "/hidden";
  const noControls = req.url === "/no-controls";
  const overlay = req.url === "/overlay";
  const occluded = req.url === "/occluded";
  const clipped = req.url === "/clipped";
  const scrolled = req.url === "/scrolled" || req.url === "/scrolled-occluded";
  const scrolledOccluded = req.url === "/scrolled-occluded";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><style>body{margin:0}#clip{width:480px;height:${clipped ? "258px" : "270px"};overflow:${clipped ? "hidden" : "visible"}}#ad{position:relative;width:480px;height:270px;${hidden ? "opacity:0" : ""}}video{width:480px;height:270px;display:block}.cover{position:absolute;left:0;right:0;bottom:0;height:28px;background:#fff}</style>${scrolled ? '<div style="height:2012px"></div>' : ""}<div id="clip"><div id="ad"><video ${noControls ? "" : "controls"} muted playsinline src="/fixture.mp4"></video>${overlay ? '<div data-adops-video-overlay="1"></div>' : ""}${occluded || scrolledOccluded ? '<div class="cover"></div>' : ""}</div></div>${scrolled ? '<div style="height:500px"></div>' : ""}`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) });

async function auditFixture(route, screenshotPath = null, options = {}) {
  const viewport = options.viewport || { width: 640, height: 400 };
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.locator("video").evaluate((video) => new Promise((resolve) => {
      if (video.readyState >= 1) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    }));
    await page.locator("video").evaluate(async (video) => {
      video.currentTime = 1;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
      video.pause();
    });
    if (Number.isFinite(options.scrollY)) await page.evaluate((scrollY) => window.scrollTo(0, scrollY), options.scrollY);
    const box = await page.locator("video").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    if (screenshotPath) await page.screenshot({ path: screenshotPath });
    const audit = await auditNativeVideoProgress(page, "#ad");
    return audit;
  } finally {
    await page.close();
  }
}

try {
  async function viewportVisualsFixture(route) {
    const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 2 });
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      return await waitForViewportVisuals(page, "#visual-slot");
    } finally {
      await page.close();
    }
  }
  const belowFoldVisuals = await viewportVisualsFixture("/viewport-offscreen");
  assert.equal(belowFoldVisuals.viewportVideosTotal, 0, "a video starting below the viewport (at y=1277) is not a viewport visual");
  assert.equal(belowFoldVisuals.viewportVideosLoaded, 0);
  assert.equal(belowFoldVisuals.viewportImagesTotal, 1, "visible images remain included");
  assert.equal(belowFoldVisuals.viewportImagesLoaded, 1);
  assert.equal(belowFoldVisuals.viewportBackgroundsTotal, 1, "visible background images remain included");
  assert.equal(belowFoldVisuals.viewportBackgroundsLoaded, 1);
  const bottomEdgeVisuals = await viewportVisualsFixture("/viewport-bottom");
  assert.equal(bottomEdgeVisuals.viewportVideosTotal, 1, "an intersecting video at y=1199 is included");
  assert.equal(bottomEdgeVisuals.viewportVideosLoaded, 1);
  const viewportContactVisuals = await viewportVisualsFixture("/viewport-contact");
  assert.equal(viewportContactVisuals.viewportVideosTotal, 0, "a video starting exactly at viewport height is outside the viewport");
  const edgeVisuals = await viewportVisualsFixture("/viewport-edge");
  assert.equal(edgeVisuals.viewportVideosTotal, 0, "a video beginning at the right viewport edge is excluded");
  const zeroAreaVisuals = await viewportVisualsFixture("/viewport-zero-area");
  assert.equal(zeroAreaVisuals.viewportVideosTotal, 0, "zero-area video elements are excluded");
  const unloadedBottomVisuals = await viewportVisualsFixture("/viewport-unloaded-bottom");
  assert.equal(unloadedBottomVisuals.viewportVideosTotal, 1, "an intersecting unloaded video remains subject to readiness");
  assert.equal(unloadedBottomVisuals.viewportVideosLoaded, 0);
  assert.equal(unloadedBottomVisuals.ok, false, "an intersecting unloaded video must continue to block readiness");

  const positive = await auditFixture("/positive");
  assert.equal(positive.ok, true, `native Chromium timeline should pass: ${JSON.stringify(positive)}`);
  assert.equal(positive.source, "chromium_ua_shadow_timeline");
  assert.equal(positive.pseudo, "-webkit-media-controls-timeline");
  assert.equal(positive.tag, "INPUT");
  assert.equal(positive.valuesMatch, true);
  assert.ok(Math.abs(positive.value - positive.currentTime) <= 0.25);
  assert.ok(Math.abs(positive.max - positive.duration) <= 0.25);
  assert.equal(positive.artificialOverlayCount, 0);

  const activeAdPage = await browser.newPage({ viewport: { width: 640, height: 400 } });
  try {
    await activeAdPage.goto(`${baseUrl}/positive`, { waitUntil: "domcontentloaded" });
    await activeAdPage.locator("video").evaluate((video) => new Promise((resolve) => {
      if (video.readyState >= 1) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    }));
    await activeAdPage.locator("#ad").evaluate((ad) => {
      ad.innerHTML = `<div data-adops-capture-slot="1" data-adops-capture-locked="1">
        <div class="g-dyn" data-adops-capture-ad="1">${ad.querySelector("video").outerHTML}</div>
        <div class="g-dyn" data-inactive="1"><img alt="other creative"></div>
      </div>`;
    });
    const locked = await forceMatchedAdVisible(activeAdPage);
    assert.equal(locked.ok, true);
    const activeState = await activeAdPage.locator("[data-adops-capture-ad='1']").evaluate((node) => ({
      activeAttribute: node.getAttribute("data-adops-capture-active-ad"),
      pointerEvents: getComputedStyle(node).pointerEvents,
      display: getComputedStyle(node).display,
      inactivePointerEvents: getComputedStyle(document.querySelector("[data-inactive='1']")).pointerEvents,
    }));
    assert.equal(activeState.activeAttribute, "1");
    assert.notEqual(activeState.pointerEvents, "none", "the selected creative must not match the inactive AdRotate CSS rule");
    assert.equal(activeState.inactivePointerEvents, "none", "the sibling creative must remain inactive");
    await activeAdPage.waitForTimeout(150);
    assert.equal(await activeAdPage.locator("[data-adops-capture-ad='1']").getAttribute("data-adops-capture-active-ad"), "1",
      "the periodic lock must reapply the value-form active marker");
    await activeAdPage.locator("video").evaluate(async (video) => {
      video.currentTime = 1;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
      video.pause();
    });
    const videoBox = await activeAdPage.locator("video").boundingBox();
    await activeAdPage.mouse.move(videoBox.x + videoBox.width / 2, videoBox.y + videoBox.height / 2);
    await activeAdPage.waitForTimeout(100);
    const activeNativeAudit = await auditNativeVideoProgress(activeAdPage, "#ad");
    assert.equal(activeNativeAudit.ok, true, `native audit must remain clear on the active creative: ${JSON.stringify(activeNativeAudit)}`);
    assert.equal(activeNativeAudit.artificialOverlayCount, 0);
  } finally {
    await activeAdPage.close();
  }

  const noControls = await auditFixture("/no-controls");
  assert.equal(noControls.ok, false, "missing native controls must fail closed");
  const screenshotCases = [
    { route: "/positive", key: "positive" },
    { route: "/scrolled", key: "scrolled", options: { viewport: { width: 640, height: 1200 }, scrollY: 1579 } },
    { route: "/hidden", key: "hidden" },
    { route: "/occluded", key: "occluded" },
    { route: "/clipped", key: "clipped" },
  ];
  const screenshotAudits = {};
  const frameMetas = {};
  for (const { route, key, options = {} } of screenshotCases) {
    const viewportPath = path.join(workDir, `${key}-viewport.png`);
    const finalPath = path.join(workDir, `${key}-final.png`);
    screenshotAudits[key] = await auditFixture(route, viewportPath, options);
    frameMetas[key] = composeDesktopProof(viewportPath, finalPath, {
      osLabel: "Google Chrome",
      systemDateTime: "06/10/2026 12:00:00",
      siteSigla: "TEST",
      tabTitle: "Native video controls fixture",
      hostLabel: "127.0.0.1",
      addressText: "127.0.0.1/native-video-controls",
      proofStyle: "viewport_only",
      scrollMetrics: { viewportWidth: 640, viewportHeight: options.viewport?.height || 400, scrollbarRendered: false },
    });
    screenshotAudits[key].viewportPath = viewportPath;
    screenshotAudits[key].finalPath = finalPath;
  }
  assert.deepEqual(screenshotAudits.positive.box, positive.box, "screenshot and CDP audit must describe the same player geometry");
  assert.equal(screenshotAudits.positive.scrollY, 0, "top-of-page player remains a zero-scroll regression case");
  assert.equal(screenshotAudits.scrolled.scrollY, 1579, "scrolled fixture must preserve the actual page scroll offset");
  assert.equal(screenshotAudits.scrolled.box.y, 679, "scrolled timeline remains in viewport coordinates for final-PNG ROI mapping");
  assert.equal(screenshotAudits.scrolled.ok, true, `native timeline must pass when hit-tested at document coordinates: ${JSON.stringify(screenshotAudits.scrolled)}`);
  const scrolledOccluded = await auditFixture("/scrolled-occluded", null, { viewport: { width: 640, height: 1200 }, scrollY: 1579 });
  assert.equal(scrolledOccluded.ok, false, "page element overlay must remain blocked on scrolled pages");
  const actualFinalRoi = auditFinalPngVideoProgress(
    screenshotAudits.scrolled.finalPath,
    screenshotAudits.scrolled.viewportPath,
    screenshotAudits.scrolled,
    frameMetas.scrolled,
    { viewportWidthCss: 640, minSimilarity: 0.48 },
  );
  assert.equal(actualFinalRoi.ok, true, `actual native-control screenshot ROI must pass production defaults: ${JSON.stringify(actualFinalRoi)}`);
  assert.equal(actualFinalRoi.minSimilarity, 0.82, "native progress ROI must not inherit the lower generic slot threshold");
  const stricterFinalRoi = auditFinalPngVideoProgress(
    screenshotAudits.scrolled.finalPath,
    screenshotAudits.scrolled.viewportPath,
    screenshotAudits.scrolled,
    frameMetas.scrolled,
    { viewportWidthCss: 640, minSimilarity: 0.91 },
  );
  assert.equal(stricterFinalRoi.ok, true, `native progress ROI must retain a stricter configured threshold: ${JSON.stringify(stricterFinalRoi)}`);
  assert.equal(stricterFinalRoi.minSimilarity, 0.91);
  const actualMetadata = {
    reconstruction: { provenanceVersion: 4 },
    chromeFrameHeight: frameMetas.scrolled.chromeFrameHeight,
    nativeProgressAudit: screenshotAudits.scrolled,
    finalPngProgressAudit: actualFinalRoi,
    videoProof: {
      ok: true,
      controls: screenshotAudits.scrolled.controls,
      paused: screenshotAudits.scrolled.paused,
      currentTime: screenshotAudits.scrolled.currentTime,
      duration: screenshotAudits.scrolled.duration,
      overlayInjected: false,
      artificialOverlayCount: screenshotAudits.scrolled.artificialOverlayCount,
      progressVisible: true,
    },
  };
  const apiCrossLayer = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e",
    `import { evaluateVideoPlayerProof } from "../artifacts/api-server/src/lib/capture-audit.ts"; let raw=""; for await (const chunk of process.stdin) raw += chunk; const m=JSON.parse(raw); const r=evaluateVideoPlayerProof(m,true); if (!r.ok || r.progressSource !== "chromium_ua_shadow_timeline") throw new Error(JSON.stringify(r)); console.log(JSON.stringify({ok:r.ok,progressSource:r.progressSource}));`,
  ], {
    cwd: path.join(projectRoot, "scripts"),
    input: JSON.stringify(actualMetadata),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.deepEqual(JSON.parse(apiCrossLayer.trim()), { ok: true, progressSource: "chromium_ua_shadow_timeline" });

  async function auditPageClockFixture(options = {}) {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    const nonce = Date.now() + "-" + Math.random();
    const viewportPath = path.join(workDir, "page-clock-" + nonce + ".png");
    const finalPath = path.join(workDir, "page-clock-final-" + nonce + ".png");
    const text = options.text || "quinta-feira, 1 de outubro de 2026, às 20:00:00";
    const position = options.offscreen ? "position:absolute;left:-500px;top:80px" : "position:absolute;left:40px;top:80px";
    const visibility = options.hidden ? "visibility:hidden" : "";
    const cover = options.covered ? '<div id="cover"></div>' : "";
    try {
      await page.setContent(
        '<!doctype html><style>body{margin:0;font:18px Arial,sans-serif}.spacer{height:1600px}' +
        '#clock{' + position + ';display:inline-block;padding:5px 8px;color:#fff;background:#102030;' + visibility + '}' +
        '#cover{position:absolute;left:35px;top:75px;width:340px;height:42px;background:#f00;z-index:4}</style>' +
        '<div class="spacer"></div><time id="clock">' + text + '</time>' + cover,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: viewportPath });
      if (options.lateScroll) await page.evaluate(() => window.scrollTo(0, 1579));
      const frameMeta = composeDesktopProof(viewportPath, finalPath, {
        osLabel: "Google Chrome",
        systemDateTime: "01/10/2026 20:00:00",
        siteSigla: "TEST",
        tabTitle: "Visible page clock fixture",
        hostLabel: "127.0.0.1",
        addressText: "127.0.0.1/page-clock",
        proofStyle: "viewport_only",
        scrollMetrics: { viewportWidth: 640, viewportHeight: 400, scrollbarRendered: false },
      });
      const proof = await auditVisiblePageDateClock(
        page,
        { pageDateSelectors: ["#clock"] },
        "2026-10-01T20:00",
        viewportPath,
        finalPath,
        frameMeta,
      );
      return { proof, frameMeta };
    } finally {
      await page.close();
    }
  }
  const pageClockPositive = await auditPageClockFixture();
  assert.equal(pageClockPositive.proof.ok, true, "visible page clock and final PNG ROI must pass: " + JSON.stringify(pageClockPositive.proof));
  assert.equal(pageClockPositive.proof.version, 2);
  assert.equal(pageClockPositive.proof.source, "final_viewport_page_clock");
  assert.equal(pageClockPositive.proof.requestedCaptureAt, "2026-10-01T20:00");
  assert.equal(pageClockPositive.proof.pixelAudit.source, "auditFinalPngSlotPixels_page_clock_roi");
  assert.equal(pageClockPositive.proof.pixelAudit.comparedTo, "viewportPng_page_clock_roi");
  assert.equal(pageClockPositive.proof.pixelAudit.minSimilarity, 0.82);
  const pageClockMetadata = {
    requestedCaptureAt: "2026-10-01T20:00",
    chromeFrameHeight: pageClockPositive.frameMeta.chromeFrameHeight,
    visiblePageDateAudit: pageClockPositive.proof,
  };
  const pageClockApi = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e",
    'import { attachServerCaptureProvenance, evaluateCaptureMetadata, evaluateFinalPageClockProof } from "../artifacts/api-server/src/lib/capture-audit.ts"; let raw=""; for await (const chunk of process.stdin) raw += chunk; const clock = JSON.parse(raw); const direct = evaluateFinalPageClockProof(clock); if (!direct.ok) throw new Error(JSON.stringify(direct)); const targetDate = "2026-10-01", sourceJobId = "native-clock-fixture", capturedAt = "2026-10-07T04:00:00.000Z"; const candidate = attachServerCaptureProvenance({ ...clock, captureClass: "historical_recovery", targetDate, auditPolicyVersion: "audit-policy-v1", capturedAt, sourceJobId, auditContractVersion: "audit-checklist-v1", systemDateTime: "01/10/2026 20:00", pageDateText: clock.visiblePageDateAudit.renderedText, pageDateObserved: clock.visiblePageDateAudit.renderedText, format: "BANNER", contentDateSamples: [], reconstruction: { provenanceVersion: 4, reason: "late_publication_recovery", contractedDate: targetDate, mediaUrl: "https://cdn.example.com/creative.jpg", reconstructedAt: capturedAt }, mediaBasename: "creative.jpg", matchedMediaUrl: "https://cdn.example.com/creative.jpg", slotStableFrameOk: true, slotLegibilityOk: true, identityFrameOk: true, visualAudit: { viewportImagesTotal: 0, viewportImagesLoaded: 0, slotImagesTotal: 0, slotImagesLoaded: 0, viewportBackgroundsTotal: 0, viewportBackgroundsLoaded: 0, viewportVideosTotal: 0, viewportVideosLoaded: 0 }, slotVisibility: { mostlyVisible: true, visibleRatio: 1 } }, { targetDate, sourceJobId, capturedAt, uploadedUrl: "https://cdn.example.com/evidence.png" }); const audit = evaluateCaptureMetadata(candidate, targetDate, new Date("2026-10-07T04:01:00.000Z"), { finalPageClockRequired: true }); if (audit.issues.some(issue => issue.code === "final_page_clock_unverified")) throw new Error(JSON.stringify(audit)); console.log(JSON.stringify({ direct, captureClockIssues: audit.issues.filter(issue => issue.code === "final_page_clock_unverified") }));',
  ], {
    cwd: path.join(projectRoot, "scripts"),
    input: JSON.stringify(pageClockMetadata),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.deepEqual(JSON.parse(pageClockApi.trim()), { direct: { ok: true }, captureClockIssues: [] });
  const rejectedPageClockProofs = [];
  for (const [label, options, expectedIssue] of [
    ["offscreen", { offscreen: true }, "page_clock_outside_viewport"],
    ["occluded", { covered: true }, "page_clock_occluded"],
    ["hidden", { hidden: true }, "page_clock_not_visible"],
    ["wrong-date-or-time", { text: "terça-feira, 2 de outubro de 2026, às 20:00:00" }, "page_clock_text_mismatch"],
    ["late-scroll", { lateScroll: true }, "page_clock_outside_viewport"],
  ]) {
    const rejected = await auditPageClockFixture(options);
    assert.equal(rejected.proof.ok, false, label + " page clock must fail closed");
    assert.ok(rejected.proof.issues.some((item) => item.code === expectedIssue), label + " must report " + expectedIssue + ": " + JSON.stringify(rejected.proof.issues));
    if (label === "offscreen" || label === "late-scroll") rejectedPageClockProofs.push({ label, proof: rejected.proof });
  }
  const changedClockRoi = structuredClone(pageClockPositive.proof);
  changedClockRoi.pixelAudit.similarityScore = 0.4;
  rejectedPageClockProofs.push({ label: "changed-roi", proof: changedClockRoi });
  const rejectedClockApi = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e",
    'import { attachServerCaptureProvenance, evaluateCaptureMetadata } from "../artifacts/api-server/src/lib/capture-audit.ts"; let raw=""; for await (const chunk of process.stdin) raw += chunk; const cases = JSON.parse(raw); const results = cases.map(({label,proof}) => { const targetDate="2026-10-01", sourceJobId="native-clock-fixture", capturedAt="2026-10-07T04:00:00.000Z"; const candidate=attachServerCaptureProvenance({captureClass:"historical_recovery",targetDate,auditPolicyVersion:"audit-policy-v1",capturedAt,sourceJobId,auditContractVersion:"audit-checklist-v1",requestedCaptureAt:"2026-10-01T20:00",systemDateTime:"01/10/2026 20:00",pageDateText:proof.renderedText,pageDateObserved:proof.renderedText,format:"BANNER",siteSigla:"ROO",contentDateSamples:[],reconstruction:{provenanceVersion:4,reason:"late_publication_recovery",contractedDate:targetDate,mediaUrl:"https://cdn.example.com/creative.jpg",reconstructedAt:capturedAt},mediaBasename:"creative.jpg",matchedMediaUrl:"https://cdn.example.com/creative.jpg",slotStableFrameOk:true,slotLegibilityOk:true,identityFrameOk:true,visualAudit:{viewportImagesTotal:0,viewportImagesLoaded:0,slotImagesTotal:0,slotImagesLoaded:0,viewportBackgroundsTotal:0,viewportBackgroundsLoaded:0,viewportVideosTotal:0,viewportVideosLoaded:0},slotVisibility:{mostlyVisible:true,visibleRatio:1},visiblePageDateAudit:proof},{targetDate,sourceJobId,capturedAt,uploadedUrl:"https://cdn.example.com/evidence.png"}); const audit=evaluateCaptureMetadata(candidate,targetDate,new Date("2026-10-07T04:01:00.000Z"),{finalPageClockRequired:true}); return {label,blocked:audit.issues.some(issue=>issue.code==="final_page_clock_unverified")}; }); if(results.some(result=>!result.blocked)) throw new Error(JSON.stringify(results)); console.log(JSON.stringify(results));',
  ], {
    cwd: path.join(projectRoot, "scripts"),
    input: JSON.stringify(rejectedPageClockProofs),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.deepEqual(JSON.parse(rejectedClockApi.trim()).map((item) => item.blocked), [true, true, true]);
  let tallViewportSummary = null;
  let tallCombinedAuditSummary = null;
  let budgetBlockReason = null;
  const tallClockPage = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  try {
    const tallViewportPng = path.join(workDir, "page-clock-tall-viewport.png");
    const tallFinalPng = path.join(workDir, "page-clock-tall-final.png");
    await tallClockPage.setContent(
      '<!doctype html><style>body{margin:0;font:18px Arial,sans-serif}.spacer{height:1600px}' +
      '#clock{position:absolute;left:40px;top:80px;display:inline-block;padding:5px 8px;color:#fff;background:#102030}' +
      '#ad{width:480px;height:270px}video{display:block;width:480px;height:270px}</style>' +
      '<time id="clock">quinta-feira, 1 de outubro de 2026, às 20:00:00</time><div class="spacer"></div>' +
      '<div id="ad"><video controls muted playsinline src="' + baseUrl + '/fixture.mp4"></video></div>',
    );
    await tallClockPage.locator("video").evaluate((video) => new Promise((resolve) => {
      if (video.readyState >= 1) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    }));
    await tallClockPage.locator("video").evaluate(async (video) => {
      video.currentTime = 1;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
      video.pause();
    });
    const tallViewport = await ensureFinalPageClockViewport(
      tallClockPage,
      { pageDateSelectors: ["#clock"] },
      "2026-10-01T20:00",
      "#ad",
    );
    assert.equal(tallViewport.ok, true, "clock and lower proof slot must fit in a genuine tall viewport: " + JSON.stringify(tallViewport));
    assert.equal(tallViewport.resized, true);
    assert.equal(tallViewport.resizedFromHeight, 400);
    assert.equal(tallViewport.finalHeight, 1874);
    assert.equal(tallViewport.scrollY, 0);
    assert.ok(tallViewport.estimatedFinalPixelCount <= 40_000_000);
    const tallMetrics = await tallClockPage.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight, scrollY },
      clock: document.querySelector("#clock").getBoundingClientRect().toJSON(),
      slot: document.querySelector("#ad").getBoundingClientRect().toJSON(),
    }));
    assert.equal(tallMetrics.viewport.scrollY, 0);
    assert.ok(tallMetrics.clock.bottom < tallMetrics.viewport.height);
    assert.ok(tallMetrics.slot.bottom < tallMetrics.viewport.height);
    const tallVideoBox = await tallClockPage.locator("video").boundingBox();
    await tallClockPage.mouse.move(tallVideoBox.x + tallVideoBox.width / 2, tallVideoBox.y + tallVideoBox.height / 2);
    await tallClockPage.waitForTimeout(120);
    await tallClockPage.screenshot({ path: tallViewportPng });
    const tallNativeAudit = await auditNativeVideoProgress(tallClockPage, "#ad");
    assert.equal(tallNativeAudit.ok, true, "the deep native player must be auditable in the tall final viewport: " + JSON.stringify(tallNativeAudit));
    assert.equal(tallNativeAudit.paused, true);
    assert.ok(Math.abs(tallNativeAudit.currentTime - 1) <= 0.25);
    const tallFrameMeta = composeDesktopProof(tallViewportPng, tallFinalPng, {
      osLabel: "Google Chrome",
      systemDateTime: "01/10/2026 20:00:00",
      siteSigla: "TEST",
      tabTitle: "Tall viewport clock fixture",
      hostLabel: "127.0.0.1",
      addressText: "127.0.0.1/page-clock-tall",
      proofStyle: "viewport_only",
      scrollMetrics: { viewportWidth: 640, viewportHeight: 1664, scrollbarRendered: false },
    });
    const tallClockProof = await auditVisiblePageDateClock(
      tallClockPage,
      { pageDateSelectors: ["#clock"] },
      "2026-10-01T20:00",
      tallViewportPng,
      tallFinalPng,
      tallFrameMeta,
    );
    assert.equal(tallClockProof.ok, true, "tall viewport PNG must retain the actual page clock: " + JSON.stringify(tallClockProof));
    const tallNativeRoi = auditFinalPngVideoProgress(
      tallFinalPng,
      tallViewportPng,
      tallNativeAudit,
      tallFrameMeta,
      { viewportWidthCss: 640, minSimilarity: 0.82 },
    );
    assert.equal(tallNativeRoi.ok, true, "native video ROI must remain in the same composed tall PNG as the page clock: " + JSON.stringify(tallNativeRoi));
    assert.equal(tallNativeRoi.minSimilarity, 0.82);
    const tallCombinedMetadata = {
      requestedCaptureAt: "2026-10-01T20:00",
      targetDate: "2026-10-01",
      chromeFrameHeight: tallFrameMeta.chromeFrameHeight,
      visiblePageDateAudit: tallClockProof,
      reconstruction: { provenanceVersion: 4 },
      nativeProgressAudit: tallNativeAudit,
      finalPngProgressAudit: tallNativeRoi,
      videoProof: {
        ok: true,
        controls: tallNativeAudit.controls,
        paused: tallNativeAudit.paused,
        currentTime: tallNativeAudit.currentTime,
        duration: tallNativeAudit.duration,
        overlayInjected: false,
        artificialOverlayCount: tallNativeAudit.artificialOverlayCount,
        progressVisible: true,
      },
    };
    const tallApiCrossLayer = execFileSync(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e",
      'import { attachServerCaptureProvenance, evaluateCaptureMetadata, evaluateVideoPlayerProof } from "../artifacts/api-server/src/lib/capture-audit.ts"; let raw=""; for await (const chunk of process.stdin) raw += chunk; const m=JSON.parse(raw); const video=evaluateVideoPlayerProof(m,true); if(!video.ok || video.progressSource!=="chromium_ua_shadow_timeline") throw new Error(JSON.stringify(video)); const sourceJobId="tall-clock-native-fixture",capturedAt="2026-10-07T04:00:00.000Z"; const candidate=attachServerCaptureProvenance({...m,captureClass:"historical_recovery",auditPolicyVersion:"audit-policy-v1",capturedAt,sourceJobId,auditContractVersion:"audit-checklist-v1",systemDateTime:"01/10/2026 20:00",pageDateText:m.visiblePageDateAudit.renderedText,pageDateObserved:m.visiblePageDateAudit.renderedText,format:"BANNER",siteSigla:"ROO",contentDateSamples:[],reconstruction:{provenanceVersion:4,reason:"late_publication_recovery",contractedDate:m.targetDate,mediaUrl:"https://cdn.example.com/creative.jpg",reconstructedAt:capturedAt},mediaBasename:"creative.jpg",matchedMediaUrl:"https://cdn.example.com/creative.jpg",slotStableFrameOk:true,slotLegibilityOk:true,identityFrameOk:true,visualAudit:{viewportImagesTotal:0,viewportImagesLoaded:0,slotImagesTotal:0,slotImagesLoaded:0,viewportBackgroundsTotal:0,viewportBackgroundsLoaded:0,viewportVideosTotal:0,viewportVideosLoaded:0},slotVisibility:{mostlyVisible:true,visibleRatio:1}},{targetDate:m.targetDate,sourceJobId,capturedAt,uploadedUrl:"https://cdn.example.com/evidence.png"}); const audit=evaluateCaptureMetadata(candidate,m.targetDate,new Date("2026-10-07T04:01:00.000Z"),{finalPageClockRequired:true}); if(audit.issues.some(issue=>issue.code==="final_page_clock_unverified")) throw new Error(JSON.stringify(audit)); console.log(JSON.stringify({videoOk:video.ok,videoSource:video.progressSource,finalPageClockBlocked:audit.issues.some(issue=>issue.code==="final_page_clock_unverified")}));',
    ], {
      cwd: path.join(projectRoot, "scripts"),
      input: JSON.stringify(tallCombinedMetadata),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.deepEqual(JSON.parse(tallApiCrossLayer.trim()), {
      videoOk: true,
      videoSource: "chromium_ua_shadow_timeline",
      finalPageClockBlocked: false,
    });
    tallCombinedAuditSummary = { nativeBox: tallNativeAudit.box, clockBox: tallClockProof.box, videoRoiSimilarity: tallNativeRoi.similarityScore };
    tallViewportSummary = { height: tallMetrics.viewport.height, scrollY: tallMetrics.viewport.scrollY };
  } finally {
    await tallClockPage.close();
  }
  const resizeRegressionSummaries = [];
  for (const mode of ["responsive", "async_resize", "never_fits"]) {
    const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 2 });
    try {
      await page.setContent(
        '<!doctype html><style>body{margin:0;font:18px Arial}#clock{position:absolute;top:80px;left:40px;padding:8px;background:#123;color:white}' +
        '.spacer{height:2214.171875px}#ad{height:270px;width:480px;color:white;background:linear-gradient(45deg,#123,#c60)}' +
        (mode === "responsive" ? '@media(min-height:1400px){.spacer{height:2600.171875px}}' : '') +
        '</style><time id="clock">segunda-feira, 24 de agosto de 2026, às 21:15:00</time><div class="spacer"></div><div id="ad">Resize regression creative</div>',
      );
      if (mode !== "responsive") await page.evaluate((fixtureMode) => {
        addEventListener("resize", () => requestAnimationFrame(() => {
          document.querySelector(".spacer").style.height = fixtureMode === "never_fits"
            ? (innerHeight + 100) + "px" : "2600.171875px";
        }));
      }, mode);
      const audit = await ensureFinalPageClockViewport(page, { pageDateSelectors: ["#clock"] }, "2026-08-24T21:15", "#ad");
      assert.ok(audit.measurements.length <= 5, "initial measurement plus at most four passes");
      assert.ok(audit.measurements.every((item) => item.viewport.width === 1660
        && item.viewport.deviceScaleFactor === 2 && item.viewport.scrollX === 0 && item.viewport.scrollY === 0));
      if (mode === "never_fits") {
        assert.equal(audit.ok, false);
        assert.equal(audit.reason, "page_clock_and_target_do_not_fit_final_viewport");
        assert.equal(audit.measurements.length, 5, "non-convergent layout must stop at the bounded limit");
        const failure = projectFailureGeometry({ ...audit,
          initial: { ...audit.initial, clocks: [{ text: "PRIVATE_CLOCK_TEXT" }], url: "PRIVATE_URL" },
          final: { ...audit.final, clocks: [{ text: "PRIVATE_CLOCK_TEXT" }], url: "PRIVATE_URL" },
        });
        assert.deepEqual(failure.measurements, audit.measurements);
        assert.equal(JSON.stringify(failure).includes("PRIVATE_"), false, "failed geometry must omit text and URLs");
      } else {
        assert.equal(audit.ok, true, "resize reflow must converge: " + JSON.stringify(audit));
        assert.equal(audit.layoutStable, true);
        assert.equal(audit.finalHeight, 2875);
        const viewportPng = path.join(workDir, mode + "-viewport.png");
        const finalPng = path.join(workDir, mode + "-final.png");
        await page.screenshot({ path: viewportPng });
        const frame = composeDesktopProof(viewportPng, finalPng, {
          systemDateTime: "24/08/2026 21:15:00", siteSigla: "TEST", tabTitle: "Resize fixture",
          hostLabel: "127.0.0.1", addressText: "127.0.0.1/resize-fixture", proofStyle: "viewport_only",
          scrollMetrics: { viewportWidth: 1660, viewportHeight: audit.finalHeight, scrollbarRendered: false },
        });
        const clock = await auditVisiblePageDateClock(page, { pageDateSelectors: ["#clock"] }, "2026-08-24T21:15", viewportPng, finalPng, frame);
        assert.equal(clock.ok, true, "the resized final PNG must still prove its real clock pixels");
        const slot = auditFinalPngSlotPixels(finalPng, viewportPng, audit.targetAudit.box, frame, {
          minSimilarity: 0.82, minContentStddev: 4, comparedTo: "viewportPng", referenceIsViewport: true, viewportWidthCss: 1660,
        });
        assert.equal(slot.ok, true, "the same final PNG must also preserve target pixels");
      }
      resizeRegressionSummaries.push({ mode, ok: audit.ok, reason: audit.reason ?? null,
        finalHeight: audit.finalHeight ?? audit.final?.viewport.height, measurements: audit.measurements.length });
    } finally {
      await page.close();
    }
  }
  const overBudgetPage = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  try {
    await overBudgetPage.setContent(
      '<!doctype html><style>body{margin:0}.spacer{height:16000px}#clock{position:absolute;top:5px}#slot{height:30px}</style>' +
      '<time id="clock">quinta-feira, 1 de outubro de 2026, às 20:00:00</time><div class="spacer"></div><div id="slot"></div>',
    );
    const blockedTallViewport = await ensureFinalPageClockViewport(
      overBudgetPage,
      { pageDateSelectors: ["#clock"] },
      "2026-10-01T20:00",
      "#slot",
    );
    assert.equal(blockedTallViewport.ok, false);
    assert.equal(blockedTallViewport.reason, "page_clock_viewport_exceeds_pixel_budget");
    assert.equal((await overBudgetPage.evaluate(() => innerHeight)), 400, "over-budget sizing must not resize the browser viewport");
    budgetBlockReason = blockedTallViewport.reason;
  } finally {
    await overBudgetPage.close();
  }

  const hidden = await auditFixture("/hidden");
  assert.equal(hidden.ok, false, "hidden ancestor must fail effective visibility");
  const overlay = await auditFixture("/overlay");
  assert.equal(overlay.ok, false, "artificial overlay must fail the native-only proof");
  const occluded = await auditFixture("/occluded");
  assert.equal(occluded.ok, false, `page overlay over native timeline must fail: ${JSON.stringify(occluded)}`);
  const clipped = await auditFixture("/clipped");
  assert.equal(clipped.ok, false, `ancestor clipping of more than 5% must fail: ${JSON.stringify(clipped)}`);
  assert.ok(clipped.visibleRatio < 0.95);

  for (const key of ["hidden", "occluded", "clipped"]) {
    const rejectedRoi = auditFinalPngVideoProgress(
      screenshotAudits[key].finalPath,
      screenshotAudits[key].viewportPath,
      screenshotAudits[key],
      frameMetas[key],
      { viewportWidthCss: 640 },
    );
    assert.equal(rejectedRoi.ok, false, `${key} native UI must not be accepted as final-PNG progress proof`);
  }

  const crop = actualFinalRoi.cropBox;
  assert.ok(crop?.width > 0 && crop?.height > 0, "actual native ROI must expose its scaled final crop");
  execFileSync(python, ["-c", `
from PIL import Image, ImageDraw
final = Image.open(${JSON.stringify(screenshotAudits.scrolled.finalPath)}).convert('RGB')
ImageDraw.Draw(final).rectangle((${crop.left}, ${crop.top}, ${crop.left + crop.width - 1}, ${crop.top + crop.height - 1}), fill='#000000')
final.save(${JSON.stringify(damagedPng)})
`]);
const changedRoi = auditFinalPngVideoProgress(
  damagedPng,
  screenshotAudits.scrolled.viewportPath,
  screenshotAudits.scrolled,
  frameMetas.scrolled,
  { viewportWidthCss: 640, minSimilarity: 0.48 },
);
assert.equal(changedRoi.ok, false, "changed native timeline pixels in resized final ROI must fail");
assert.equal(changedRoi.minSimilarity, 0.82, "tampered ROI must still be judged against the native threshold");

  console.log(JSON.stringify({ ok: true, viewportVisualReadiness: { offscreenVideo1277: [belowFoldVisuals.viewportVideosTotal, belowFoldVisuals.viewportVideosLoaded], contactAt1200: viewportContactVisuals.viewportVideosTotal, intersecting1199: [bottomEdgeVisuals.viewportVideosTotal, bottomEdgeVisuals.viewportVideosLoaded], unloaded1199Blocks: unloadedBottomVisuals.ok === false, edgeExcluded: edgeVisuals.viewportVideosTotal === 0, zeroAreaExcluded: zeroAreaVisuals.viewportVideosTotal === 0, visibleImageLoaded: belowFoldVisuals.viewportImagesLoaded, visibleBackgroundLoaded: belowFoldVisuals.viewportBackgroundsLoaded }, positive: { pseudo: screenshotAudits.positive.pseudo, box: screenshotAudits.positive.box, value: screenshotAudits.positive.value, max: screenshotAudits.positive.max, occlusion: screenshotAudits.positive.occlusion, visibleRatio: screenshotAudits.positive.visibleRatio }, pageClock: { box: pageClockPositive.proof.box, viewport: pageClockPositive.proof.viewport, similarity: pageClockPositive.proof.pixelAudit.similarityScore, apiProof: JSON.parse(pageClockApi).direct.ok, captureAuditRejections: JSON.parse(rejectedClockApi).map((item) => item.label), tallViewport: tallViewportSummary, tallNativeAndClock: tallCombinedAuditSummary, overBudgetRejected: budgetBlockReason }, scrolled: { scrollY: screenshotAudits.scrolled.scrollY, box: screenshotAudits.scrolled.box, occlusion: screenshotAudits.scrolled.occlusion, finalRoiSimilarity: actualFinalRoi.similarityScore, finalRoiSize: actualFinalRoi.cropSize, apiProgressSource: JSON.parse(apiCrossLayer).progressSource }, cases: ["zero_scroll_regression", "scrolled_native_hit_test", "scrolled_page_overlay_still_rejected", "missing_controls", "hidden_ancestor", "clipped_timeline", "occluded_timeline", "artificial_overlay", "actual_screenshot_final_roi", "api_cross_layer_gate", "actual_hidden_occluded_clipped_roi_rejected", "actual_final_roi_changed", "page_clock_final_roi_api_positive", "page_clock_offscreen_rejected", "page_clock_occlusion_rejected", "page_clock_hidden_rejected", "page_clock_wrong_date_or_time_rejected", "page_clock_late_scroll_rejected", "page_clock_and_lower_slot_tall_viewport", "page_clock_tall_viewport_pixel_budget", "capture_audit_blocks_offscreen_late_scroll_and_changed_roi", "tall_page_clock_plus_native_video_same_png_api_positive", "viewport_offscreen_video_excluded", "viewport_boundary_contact_excluded", "viewport_intersecting_video_counted", "viewport_intersecting_unloaded_video_blocks", "viewport_horizontal_edge_excluded", "viewport_zero_area_excluded", "viewport_images_and_backgrounds_counted"] }, null, 2));
  console.log(JSON.stringify({ ok: true, resizeRegressions: resizeRegressionSummaries,
    newCases: ["responsive_resize_reflow_final_pixels", "async_resize_reflow_final_pixels", "non_convergent_layout_bounded_failure"],
    failureGeometryFallbacks: clockGeometryFallbacks }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(workDir, { recursive: true, force: true });
}
