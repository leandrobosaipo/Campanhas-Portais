import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { evaluatePixelDateText, hashImageRegion } = require("./pixel-date-proof.cjs");

const ok = evaluatePixelDateText({
  targetDate: "2026-07-29",
  topbarText: "29/07/2026 18:44",
  editorialText: "29/07/2026 3 mins de leitura",
  topbarConfidence: 92,
  editorialConfidence: 88,
  requireEditorialDate: true,
});
assert.equal(ok.ok, true);

for (const sample of [
  { topbarText: "27/07/2026", editorialText: "27/07/2026", code: "pixel_date_mismatch" },
  { topbarText: "29/18/2026", editorialText: "29/07/2026", code: "pixel_date_malformed" },
  { topbarText: "29/07/2026", editorialText: "ha 4 dias", code: "pixel_relative_date_visible" },
  { topbarText: "", editorialText: "29/07/2026", code: "pixel_date_unreadable" },
]) {
  const result = evaluatePixelDateText({
    targetDate: "2026-07-29",
    topbarText: sample.topbarText,
    editorialText: sample.editorialText,
    topbarConfidence: sample.topbarText ? 90 : 0,
    editorialConfidence: 80,
    requireEditorialDate: true,
  });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === sample.code), `${sample.code} ausente`);
}

const tempDir = await mkdtemp(join(tmpdir(), "adops-pixel-date-proof-"));
try {
  const pngPath = join(tempDir, "one-pixel.png");
  await writeFile(pngPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  assert.match(hashImageRegion(pngPath, { left: 0, top: 0, width: 1, height: 1 }), /^[a-f0-9]{64}$/);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("ok: pixel date proof parser and gates");
