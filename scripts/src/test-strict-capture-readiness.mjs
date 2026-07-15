import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const bundledPython = "/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const pythonBin = process.env.ADOPS_CAPTURE_PYTHON || (existsSync(bundledPython) ? bundledPython : "python3");
process.env.ADOPS_CAPTURE_PYTHON = pythonBin;
const { captureStrictReadinessCandidate } = require("./capture-insertion-proof.cjs");
const workDir = mkdtempSync(path.join(tmpdir(), "adops-readiness-"));
const colorPng = path.join(workDir, "color.png");
const blankPng = path.join(workDir, "blank.png");

execFileSync(pythonBin, ["-c", `
from PIL import Image, ImageDraw
color = Image.new("RGB", (320, 180), "#b51f34")
draw = ImageDraw.Draw(color)
for x in range(0, 320, 16):
    draw.rectangle((x, 0, x + 7, 179), fill=(20 + x % 180, 80, 170))
draw.rectangle((40, 40, 280, 140), fill="#f4d35e")
color.save(${JSON.stringify(colorPng)})
Image.new("RGB", (320, 180), "#eeeeee").save(${JSON.stringify(blankPng)})
`]);

const colorBuffer = readFileSync(colorPng);
const blankBuffer = readFileSync(blankPng);
const pages = {
  delayed: `<!doctype html><main><div class="hero"><img class="featured" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="/color.png" /></div><div id="slot"><img src="/color.png"></div><div class="background-proof"></div><video class="video-proof" poster="/color.png" muted></video><img class="offscreen" loading="lazy" src="/never.png"></main>`,
  blank: `<!doctype html><main><div class="hero"><img class="featured" src="/blank.png" /></div><div id="slot"><img src="/color.png"></div></main>`,
  broken: `<!doctype html><main><div class="hero"><img class="featured" src="/missing.png" /></div><div id="slot"><img src="/color.png"></div></main>`,
};

const server = createServer((req, res) => {
  if (req.url === "/color.png") {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": colorBuffer.length });
      res.end(colorBuffer);
    }, 350);
    return;
  }
  if (req.url === "/blank.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": blankBuffer.length });
    res.end(blankBuffer);
    return;
  }
  if (req.url === "/missing.png") {
    res.writeHead(404).end("missing");
    return;
  }
  if (req.url === "/never.png") return;
  const key = String(req.url || "").slice(1);
  if (pages[key]) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<style>body{margin:0}.hero,#slot,.background-proof,.video-proof{display:block;width:320px;height:180px}.hero img,#slot img{display:block;width:100%;height:100%;object-fit:cover}.background-proof{background-image:url('/color.png');background-size:cover}.offscreen{display:block;margin-top:2200px;width:320px;height:180px}</style>${pages[key]}`);
    return;
  }
  res.writeHead(404).end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

const config = {
  readinessMode: "strict-visible",
  criticalContentSelectors: [".hero img.featured"],
  readinessTimeoutMs: 5000,
  layoutStableSamples: 2,
  layoutStableIntervalMs: 120,
  captureRetryCount: 0,
  requireCriticalContentPainted: true,
};

async function runFixture(name) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`${baseUrl}/${name}`, { waitUntil: "domcontentloaded" });
    return await captureStrictReadinessCandidate(page, path.join(workDir, `${name}.png`), "#slot", config, []);
  } finally {
    await page.close();
  }
}

try {
  const delayed = await runFixture("delayed");
  assert.equal(delayed.approved, true, "imagem lazy atrasada e mídia fora da tela devem ser aceitas");
  assert.equal(delayed.layoutStable, true);
  assert.equal(delayed.criticalElementsLoaded, delayed.criticalElementsTotal);
  assert.ok(delayed.elements.some((item) => item.kind === "background" && item.loaded));
  assert.ok(delayed.elements.some((item) => item.kind === "video" && item.loaded));

  const blank = await runFixture("blank");
  assert.equal(blank.approved, false, "imagem carregada no DOM, mas visualmente vazia, deve ser reprovada");
  assert.ok(blank.pixelAudit.elements.some((item) => item.painted === false));

  const broken = await runFixture("broken");
  assert.equal(broken.approved, false, "imagem crítica quebrada deve ser reprovada");
  assert.ok(broken.criticalElementsLoaded < broken.criticalElementsTotal || broken.layoutStable === false);

  console.log(JSON.stringify({ ok: true, cases: ["delayed_lazy", "background", "video_poster", "blank_painted", "broken_visible", "offscreen_ignored"] }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  rmSync(workDir, { recursive: true, force: true });
}
