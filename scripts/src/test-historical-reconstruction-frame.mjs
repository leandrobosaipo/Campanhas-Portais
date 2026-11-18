import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { composeDesktopProof, evaluateRetroCaptureGate, resolveDesktopFrameDateTime } = require("./capture-insertion-proof.cjs");
const { hashImageRegion } = require("./pixel-date-proof.cjs");
const reconstructedAt = "2026-09-15T01:30:00.000Z";
assert.equal(typeof resolveDesktopFrameDateTime, "function");
assert.equal(
  resolveDesktopFrameDateTime("2026-09-14T21:30:00-04:00", {
    provenanceVersion: 3,
    reconstructedAt: "2026-09-15T01:30:00.000Z",
  }),
  "segunda-feira, 14/09/2026, 21:30",
  "the historical frame clock must show the real reconstruction instant in Cuiaba",
);
const requestedCaptureAt = "2026-09-14T21:30";
const requestedClock = "segunda-feira, 14/09/2026, 21:30";
assert.equal(
  resolveDesktopFrameDateTime("terça-feira, 15/09/2026, 02:30", {
    provenanceVersion: 4,
    reconstructedAt,
  }, requestedCaptureAt),
  requestedClock,
  "v4 presentation clock must show the requested visual reference",
);
assert.equal(resolveDesktopFrameDateTime("legacy-clock", { provenanceVersion: 2, reconstructedAt: "2026-09-15T01:30:00.000Z" }), "legacy-clock");
const retroGate = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-09-14T21:30:00-04:00",
  systemDateTime: resolveDesktopFrameDateTime("contradictory-historical-clock", { provenanceVersion: 3, reconstructedAt }),
  reconstruction: { provenanceVersion: 3, reconstructedAt },
  pageDateObserved: "2026-09-14T21:30:00-04:00",
  contentDateSamples: [],
});
assert.equal(retroGate.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
assert.equal(retroGate.issues.some((issue) => issue.code === "page_time_mismatch"), false);
const v4Gate = evaluateRetroCaptureGate({
  requestedCaptureAt: `${requestedCaptureAt}:00-04:00`,
  systemDateTime: requestedClock,
  reconstruction: { provenanceVersion: 4, reconstructedAt },
  pageDateObserved: `${requestedCaptureAt}:00-04:00`,
  contentDateSamples: [],
});
assert.equal(v4Gate.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
const v4RealClockGate = evaluateRetroCaptureGate({
  requestedCaptureAt: `${requestedCaptureAt}:00-04:00`,
  systemDateTime: "terça-feira, 15/09/2026, 02:30",
  reconstruction: { provenanceVersion: 4, reconstructedAt },
  pageDateObserved: `${requestedCaptureAt}:00-04:00`,
  contentDateSamples: [],
});
assert.equal(v4RealClockGate.issues.some((issue) => issue.code === "desktop_time_mismatch"), true);
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
const v4Output = path.join(dir, "v4-output.png");
const v4RealClock = path.join(dir, "v4-real-clock.png");
const v4Reference = path.join(dir, "v4-reference.png");
try {
  const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
  execFileSync(python, ["-c", "from PIL import Image; Image.new('RGB',(1280,720),(240,240,240)).save(__import__('sys').argv[1])", viewport]);
  const actualClock = resolveDesktopFrameDateTime("domingo, 14/09/2026, 21:30", { provenanceVersion: 3, reconstructedAt });
  const commonOptions = { systemDateTime: actualClock, siteSigla: "omt", tabTitle: "Portal OMT", hostLabel: "omt.com.br", addressText: "https://omt.com.br/" };
  const result = composeDesktopProof(viewport, output, {
    ...commonOptions,
    reconstruction: { provenanceVersion: 3, contractedDate: "2026-09-14", reconstructedAt },
  });
  composeDesktopProof(viewport, reference, commonOptions);
  composeDesktopProof(viewport, syntheticClock, { ...commonOptions, systemDateTime: "terça-feira, 15/09/2026, 02:30" });
  const v4ReconstructedAt = "2026-09-17T02:30:00.000Z";
  const v4ReferenceClock = resolveDesktopFrameDateTime("quarta-feira, 16/09/2026, 22:30", {
    provenanceVersion: 4,
    reconstructedAt: v4ReconstructedAt,
  }, requestedCaptureAt);
  const v4Options = {
    ...commonOptions,
    systemDateTime: v4ReferenceClock,
    reconstruction: { provenanceVersion: 4, contractedDate: "2026-09-14", reconstructedAt: v4ReconstructedAt },
  };
  const v4Result = composeDesktopProof(viewport, v4Output, v4Options);
  composeDesktopProof(viewport, v4RealClock, { ...v4Options, systemDateTime: "quarta-feira, 16/09/2026, 22:30" });
  composeDesktopProof(viewport, v4Reference, { ...commonOptions, systemDateTime: requestedClock });
  assert.equal(v4Result.reconstructionLabelRendered, undefined);
  assert.equal(v4Result.reconstructionFooterHeight, undefined);
  const v4Dimensions = JSON.parse(execFileSync(python, ["-c", "from PIL import Image; import json,sys; print(json.dumps(Image.open(sys.argv[1]).size))", v4Output], { encoding: "utf8" }));
  assert.deepEqual(v4Dimensions, [1280, 720 + v4Result.chromeFrameHeight + v4Result.taskbarHeight], "v4 reconstruction must not add a banner strip");
  assert.equal(result.reconstructionLabelRendered, undefined);
  assert.equal(result.reconstructionFooterHeight, undefined);
  const dimensions = JSON.parse(execFileSync(python, ["-c", "from PIL import Image; import json,sys; print(json.dumps(Image.open(sys.argv[1]).size))", output], { encoding: "utf8" }));
  assert.deepEqual(dimensions, [1280, 720 + result.chromeFrameHeight + result.taskbarHeight], "reconstrução não deve adicionar faixa ao PNG");
  execFileSync(python, ["-c", "from PIL import Image, ImageChops; import sys; actual, reference, synthetic = [Image.open(path).convert('RGB') for path in sys.argv[1:4]]; assert ImageChops.difference(actual, reference).getbbox() is None, 'reconstruction banner changed pixels outside the normal proof frame'; taskbar_top = actual.height - int(sys.argv[4]); assert ImageChops.difference(actual.crop((0, taskbar_top, actual.width, actual.height)), synthetic.crop((0, taskbar_top, synthetic.width, synthetic.height))).getbbox() is not None, 'the taskbar clock still renders the contracted historical time'", output, reference, syntheticClock, String(result.taskbarHeight)], { stdio: "pipe" });
  execFileSync(python, ["-c", "from PIL import Image, ImageChops; import sys; actual, reference, real = [Image.open(path).convert('RGB') for path in sys.argv[1:4]]; top = actual.height - int(sys.argv[4]); actual_taskbar=actual.crop((0,top,actual.width,actual.height)); ref_taskbar=reference.crop((0,top,reference.width,reference.height)); real_taskbar=real.crop((0,top,real.width,real.height)); assert ImageChops.difference(actual.crop((0,0,actual.width,top)),reference.crop((0,0,reference.width,top))).getbbox() is None, 'v4 changed pixels outside the standard taskbar'; assert ImageChops.difference(actual_taskbar,ref_taskbar).getbbox() is None, 'v4 taskbar does not show requested historical presentation'; assert ImageChops.difference(actual_taskbar,real_taskbar).getbbox() is not None, 'v4 taskbar incorrectly shows actual reconstruction time'", v4Output, v4Reference, v4RealClock, String(v4Result.taskbarHeight)], { stdio: "pipe" });
  const v4TaskbarRegion = { left: 0, top: v4Dimensions[1] - v4Result.taskbarHeight, width: v4Dimensions[0], height: v4Result.taskbarHeight };
  assert.equal(hashImageRegion(v4Output, v4TaskbarRegion), hashImageRegion(v4Reference, v4TaskbarRegion), "pixel hash confirms the v4 taskbar uses the requested date/time");
  assert.notEqual(hashImageRegion(v4Output, v4TaskbarRegion), hashImageRegion(v4RealClock, v4TaskbarRegion), "pixel hash distinguishes visual reference from real reconstruction time");
  assert(readFileSync(output).length > 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("ok: historical reconstruction frame keeps the standard frame without a footer");
