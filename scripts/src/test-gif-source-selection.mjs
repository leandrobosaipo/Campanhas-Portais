import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/src/capture-insertion-proof.cjs");
const metadataPath = path.join(repoRoot, "scripts/tmp/generated-prints/2026-04-13/1179/2026-04-13-meta.json");
const captureAt = "2026-04-13T19:17";

execFileSync("node", [
  scriptPath,
  "--insertionId", "1179",
  "--apiBase", "https://adops-api-public.leandro471.workers.dev/api",
  "--upload", "false",
  "--saveEvidence", "false",
  "--captureAt", captureAt,
], {
  cwd: path.join(repoRoot, "scripts"),
  stdio: "pipe",
});

const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const failures = [];

if (metadata.frameSelectionMode !== "gif_source") {
  failures.push(`Esperado frameSelectionMode=gif_source, recebido ${metadata.frameSelectionMode ?? "null"}.`);
}
if (metadata.frameSelectionDowngraded === true) {
  failures.push(`Esperado sem downgrade operacional, recebido ${metadata.frameSelectionDowngraded}.`);
}
if (typeof metadata.gifChosenFrameIndex !== "number") {
  failures.push("gifChosenFrameIndex ausente.");
}
if (metadata.slotStableFrameOk !== true) {
  failures.push(`slotStableFrameOk deveria ser true, recebido ${metadata.slotStableFrameOk}.`);
}
if (metadata.slotLegibilityOk !== true) {
  failures.push(`slotLegibilityOk deveria ser true, recebido ${metadata.slotLegibilityOk}.`);
}
if (metadata.pageDateText !== captureAt && metadata.pageDateText !== `${captureAt}:00-04:00`) {
  failures.push(`pageDateText deveria usar o preview canônico ${captureAt}, recebeu ${metadata.pageDateText ?? "null"}.`);
}
if (!Array.isArray(metadata.gifFrameCandidates) || metadata.gifFrameCandidates.filter((item) => item?.strongCandidate === true).length === 0) {
  failures.push("Nenhum frame forte foi encontrado no GIF.");
}

if (failures.length > 0) {
  throw new Error(failures.join(" "));
}

console.log(JSON.stringify({
  ok: true,
  insertionId: metadata.insertionId,
  frameSelectionMode: metadata.frameSelectionMode,
  gifChosenFrameIndex: metadata.gifChosenFrameIndex,
  strongFrames: metadata.gifFrameCandidates.filter((item) => item?.strongCandidate === true).map((item) => item.frameIndex),
  pageDateText: metadata.pageDateText,
}, null, 2));
