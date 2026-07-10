import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { auditFinalPngHeaderAdPolicy } = require("./capture-insertion-proof.cjs");

const tmp = mkdtempSync(join(tmpdir(), "perrengue-header-policy-"));
const rejectedPng = join(tmp, "two-header-ads.png");

try {
  const py = `
from PIL import Image, ImageDraw
img = Image.new("RGB", (1600, 1000), "#ffffff")
draw = ImageDraw.Draw(img)
draw.rectangle([100, 180, 1450, 260], fill="#10c8d4")
draw.rectangle([100, 430, 1450, 510], fill="#d45522")
img.save(${JSON.stringify(rejectedPng)})
`;
  const generated = spawnSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", py], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const result = auditFinalPngHeaderAdPolicy(rejectedPng, {
    siteSigla: "PERRENGUE",
    minBannerCountBeforeLogo: 2,
    headerAdPolicyAudit: { mainHeaderBox: { top: 650 } },
    desktopFrameMetadata: { chromeFrameHeight: 0 },
    viewportWidthCss: 1600,
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "multiple_header_ads_before_logo"));
  assert(result.bannerBands.length >= 2);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("ok: perrengue header ad policy rejects double header ads");
