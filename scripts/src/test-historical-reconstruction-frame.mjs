import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { composeDesktopProof } = require("./capture-insertion-proof.cjs");
try {
  execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", "from PIL import Image"], { stdio: "pipe" });
} catch {
  console.log("ok: historical reconstruction frame skipped (Pillow unavailable)");
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), "adops-reconstruction-frame-"));
const viewport = path.join(dir, "viewport.png");
const output = path.join(dir, "output.png");
try {
  const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
  execFileSync(python, ["-c", "from PIL import Image; Image.new('RGB',(1280,720),(240,240,240)).save(__import__('sys').argv[1])", viewport]);
  const result = composeDesktopProof(viewport, output, {
    systemDateTime: "segunda-feira, 15/09/2026, 02:30",
    reconstruction: { contractedDate: "2026-09-14", reconstructedAt: "2026-09-15T02:30:00.000Z" },
  });
  assert.equal(result.reconstructionLabelRendered, true);
  assert(result.reconstructionFooterHeight > 0);
  const dimensions = JSON.parse(execFileSync(python, ["-c", "from PIL import Image; import json,sys; print(json.dumps(Image.open(sys.argv[1]).size))", output], { encoding: "utf8" }));
  assert(dimensions[1] > 720 + result.chromeFrameHeight + result.taskbarHeight, "rótulo deve ficar após a taskbar, sem deslocar viewport");
  assert(readFileSync(output).length > 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("ok: historical reconstruction frame adds explicit footer after taskbar");
