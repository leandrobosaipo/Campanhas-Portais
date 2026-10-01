import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { composeDesktopProof, evaluateRetroCaptureGate, resolveDesktopFrameDateTime } = require("./capture-insertion-proof.cjs");
assert.equal(typeof resolveDesktopFrameDateTime, "function");
assert.equal(
  resolveDesktopFrameDateTime("2026-09-14T21:30:00-04:00", {
    provenanceVersion: 3,
    reconstructedAt: "2026-09-15T01:30:00.000Z",
  }),
  "segunda-feira, 14/09/2026, 21:30",
  "the historical frame clock must show the real reconstruction instant in Cuiaba",
);
assert.equal(resolveDesktopFrameDateTime("legacy-clock", { provenanceVersion: 2, reconstructedAt: "2026-09-15T01:30:00.000Z" }), "legacy-clock");
const reconstructedAt = "2026-09-15T01:30:00.000Z";
const retroGate = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-09-14T21:30:00-04:00",
  systemDateTime: resolveDesktopFrameDateTime("contradictory-historical-clock", { provenanceVersion: 3, reconstructedAt }),
  reconstruction: { provenanceVersion: 3, reconstructedAt },
  pageDateObserved: "2026-09-14T21:30:00-04:00",
  contentDateSamples: [],
});
assert.equal(retroGate.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
assert.equal(retroGate.issues.some((issue) => issue.code === "page_time_mismatch"), false);
try {
  execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", "from PIL import Image"], { stdio: "pipe" });
} catch {
  console.log("ok: historical reconstruction frame skipped (Pillow unavailable)");
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), "adops-reconstruction-frame-"));
const viewport = path.join(dir, "viewport.png");
const output = path.join(dir, "output.png");
const reference = path.join(dir, "reference.png");
const syntheticClock = path.join(dir, "synthetic-clock.png");
try {
  const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
  execFileSync(python, ["-c", "from PIL import Image; Image.new('RGB',(1280,720),(240,240,240)).save(__import__('sys').argv[1])", viewport]);
  const actualClock = resolveDesktopFrameDateTime("domingo, 14/09/2026, 21:30", { provenanceVersion: 3, reconstructedAt });
  const commonOptions = { systemDateTime: actualClock, siteSigla: "TEST", tabTitle: "Teste", hostLabel: "example.test", addressText: "https://example.test" };
  const result = composeDesktopProof(viewport, output, {
    ...commonOptions,
    reconstruction: { provenanceVersion: 3, contractedDate: "2026-09-14", reconstructedAt },
  });
  composeDesktopProof(viewport, reference, commonOptions);
  composeDesktopProof(viewport, syntheticClock, { ...commonOptions, systemDateTime: "domingo, 14/09/2026, 21:30" });
  assert.equal(result.reconstructionLabelRendered, undefined);
  assert.equal(result.reconstructionFooterHeight, undefined);
  const dimensions = JSON.parse(execFileSync(python, ["-c", "from PIL import Image; import json,sys; print(json.dumps(Image.open(sys.argv[1]).size))", output], { encoding: "utf8" }));
  assert.deepEqual(dimensions, [1280, 720 + result.chromeFrameHeight + result.taskbarHeight], "reconstrução não deve adicionar faixa ao PNG");
  execFileSync(python, ["-c", "from PIL import Image, ImageChops; import sys; actual, reference, synthetic = [Image.open(path).convert('RGB') for path in sys.argv[1:4]]; assert ImageChops.difference(actual, reference).getbbox() is None, 'reconstruction banner changed pixels outside the normal proof frame'; taskbar_top = actual.height - int(sys.argv[4]); assert ImageChops.difference(actual.crop((0, taskbar_top, actual.width, actual.height)), synthetic.crop((0, taskbar_top, synthetic.width, synthetic.height))).getbbox() is not None, 'the taskbar clock still renders the contracted historical time'", output, reference, syntheticClock, String(result.taskbarHeight)], { stdio: "pipe" });
  assert(readFileSync(output).length > 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("ok: historical reconstruction frame keeps the standard frame without a footer");
