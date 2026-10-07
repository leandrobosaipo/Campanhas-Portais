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
const { auditNativeVideoProgress, auditFinalPngVideoProgress, composeDesktopProof } = require("./capture-insertion-proof.cjs");
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
  const hidden = req.url === "/hidden";
  const noControls = req.url === "/no-controls";
  const overlay = req.url === "/overlay";
  const occluded = req.url === "/occluded";
  const clipped = req.url === "/clipped";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><style>body{margin:0}#clip{width:480px;height:${clipped ? "258px" : "270px"};overflow:${clipped ? "hidden" : "visible"}}#ad{position:relative;width:480px;height:270px;${hidden ? "opacity:0" : ""}}video{width:480px;height:270px;display:block}.cover{position:absolute;left:0;right:0;bottom:0;height:28px;background:#fff}</style><div id="clip"><div id="ad"><video ${noControls ? "" : "controls"} muted playsinline src="/fixture.mp4"></video>${overlay ? '<div data-adops-video-overlay="1"></div>' : ""}${occluded ? '<div class="cover"></div>' : ""}</div></div>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ headless: true, ...(existsSync(chromePath) ? { executablePath: chromePath } : {}) });

async function auditFixture(route, screenshotPath = null) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
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
  const positive = await auditFixture("/positive");
  assert.equal(positive.ok, true, `native Chromium timeline should pass: ${JSON.stringify(positive)}`);
  assert.equal(positive.source, "chromium_ua_shadow_timeline");
  assert.equal(positive.pseudo, "-webkit-media-controls-timeline");
  assert.equal(positive.tag, "INPUT");
  assert.equal(positive.valuesMatch, true);
  assert.ok(Math.abs(positive.value - positive.currentTime) <= 0.25);
  assert.ok(Math.abs(positive.max - positive.duration) <= 0.25);
  assert.equal(positive.artificialOverlayCount, 0);

  const noControls = await auditFixture("/no-controls");
  assert.equal(noControls.ok, false, "missing native controls must fail closed");
  const screenshotCases = [
    { route: "/positive", key: "positive" },
    { route: "/hidden", key: "hidden" },
    { route: "/occluded", key: "occluded" },
    { route: "/clipped", key: "clipped" },
  ];
  const screenshotAudits = {};
  const frameMetas = {};
  for (const { route, key } of screenshotCases) {
    const viewportPath = path.join(workDir, `${key}-viewport.png`);
    const finalPath = path.join(workDir, `${key}-final.png`);
    screenshotAudits[key] = await auditFixture(route, viewportPath);
    frameMetas[key] = composeDesktopProof(viewportPath, finalPath, {
      osLabel: "Google Chrome",
      systemDateTime: "06/10/2026 12:00:00",
      siteSigla: "TEST",
      tabTitle: "Native video controls fixture",
      hostLabel: "127.0.0.1",
      addressText: "127.0.0.1/native-video-controls",
      proofStyle: "viewport_only",
      scrollMetrics: { viewportWidth: 640, viewportHeight: 400, scrollbarRendered: false },
    });
    screenshotAudits[key].viewportPath = viewportPath;
    screenshotAudits[key].finalPath = finalPath;
  }
  assert.deepEqual(screenshotAudits.positive.box, positive.box, "screenshot and CDP audit must describe the same player geometry");
  const actualFinalRoi = auditFinalPngVideoProgress(
    screenshotAudits.positive.finalPath,
    screenshotAudits.positive.viewportPath,
    screenshotAudits.positive,
    frameMetas.positive,
    { viewportWidthCss: 640 },
  );
  assert.equal(actualFinalRoi.ok, true, `actual native-control screenshot ROI must pass production defaults: ${JSON.stringify(actualFinalRoi)}`);
  const actualMetadata = {
    reconstruction: { provenanceVersion: 4 },
    chromeFrameHeight: frameMetas.positive.chromeFrameHeight,
    nativeProgressAudit: screenshotAudits.positive,
    finalPngProgressAudit: actualFinalRoi,
    videoProof: {
      ok: true,
      controls: screenshotAudits.positive.controls,
      paused: screenshotAudits.positive.paused,
      currentTime: screenshotAudits.positive.currentTime,
      duration: screenshotAudits.positive.duration,
      overlayInjected: false,
      artificialOverlayCount: screenshotAudits.positive.artificialOverlayCount,
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
final = Image.open(${JSON.stringify(screenshotAudits.positive.finalPath)}).convert('RGB')
ImageDraw.Draw(final).rectangle((${crop.left}, ${crop.top}, ${crop.left + crop.width - 1}, ${crop.top + crop.height - 1}), fill='#000000')
final.save(${JSON.stringify(damagedPng)})
`]);
const changedRoi = auditFinalPngVideoProgress(
  damagedPng,
  screenshotAudits.positive.viewportPath,
  screenshotAudits.positive,
  frameMetas.positive,
  { viewportWidthCss: 640 },
);
assert.equal(changedRoi.ok, false, "changed native timeline pixels in resized final ROI must fail");

  console.log(JSON.stringify({ ok: true, positive: { pseudo: screenshotAudits.positive.pseudo, box: screenshotAudits.positive.box, value: screenshotAudits.positive.value, max: screenshotAudits.positive.max, occlusion: screenshotAudits.positive.occlusion, visibleRatio: screenshotAudits.positive.visibleRatio, finalRoiSimilarity: actualFinalRoi.similarityScore, finalRoiSize: actualFinalRoi.cropSize, apiProgressSource: JSON.parse(apiCrossLayer).progressSource }, cases: ["native_timeline", "missing_controls", "hidden_ancestor", "clipped_timeline", "occluded_timeline", "artificial_overlay", "actual_screenshot_final_roi", "api_cross_layer_gate", "actual_hidden_occluded_clipped_roi_rejected", "actual_final_roi_changed"] }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(workDir, { recursive: true, force: true });
}
