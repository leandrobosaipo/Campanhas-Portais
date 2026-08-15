import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveFinalCustomerProofStyle,
  evaluateFinalPngSlotAuditResult,
  selectBestFinalPngCreativeIdentityAudit,
  buildFinalPngCreativeReferenceFrames,
  auditFinalPngCreativeIdentityAgainstFrames,
} = require("./capture-insertion-proof.cjs");

const insetStyle = resolveFinalCustomerProofStyle("viewport_with_slot_inset");
assert.equal(insetStyle.finalProofStyle, "viewport_only");
assert.equal(insetStyle.auditInsetSuppressed, true);
assert.equal(insetStyle.proofStyleDowngradeReason, "client_png_must_not_include_audit_inset");

const viewportStyle = resolveFinalCustomerProofStyle("viewport_only");
assert.equal(viewportStyle.finalProofStyle, "viewport_only");
assert.equal(viewportStyle.auditInsetSuppressed, false);
assert.equal(viewportStyle.proofStyleDowngradeReason, null);

const okAudit = evaluateFinalPngSlotAuditResult({
  finalProofStyle: "viewport_only",
  similarityScore: 0.96,
  minSimilarity: 0.82,
  slotBox: { left: 10, top: 20, width: 300, height: 90 },
  cropBox: { left: 10, top: 116, width: 300, height: 90 },
});
assert.equal(okAudit.ok, true);

const insetAudit = evaluateFinalPngSlotAuditResult({
  finalProofStyle: "viewport_with_slot_inset",
  similarityScore: 0.96,
  minSimilarity: 0.82,
  slotBox: { left: 10, top: 20, width: 300, height: 90 },
  cropBox: { left: 10, top: 116, width: 300, height: 90 },
});
assert.equal(insetAudit.ok, false);
assert(insetAudit.issues.some((issue) => issue.code === "client_png_audit_inset_forbidden"));

const mismatchAudit = evaluateFinalPngSlotAuditResult({
  finalProofStyle: "viewport_only",
  similarityScore: 0.41,
  minSimilarity: 0.82,
  slotBox: { left: 10, top: 20, width: 300, height: 90 },
  cropBox: { left: 10, top: 116, width: 300, height: 90 },
});
assert.equal(mismatchAudit.ok, false);
assert(mismatchAudit.issues.some((issue) => issue.code === "final_png_slot_pixels_mismatch"));

const multiFrameAudit = selectBestFinalPngCreativeIdentityAudit([
  { ok: false, similarityScore: 0.7735, referenceFrameIndex: 1, issues: [{ code: "final_png_slot_pixels_mismatch" }] },
  { ok: true, similarityScore: 0.9631, referenceFrameIndex: 2, issues: [] },
  { ok: false, similarityScore: 0.6112, referenceFrameIndex: 3, issues: [{ code: "final_png_slot_pixels_mismatch" }] },
]);
assert.equal(multiFrameAudit.ok, true);
assert.equal(multiFrameAudit.matchedReferenceFrameIndex, 2);
assert.equal(multiFrameAudit.referenceCandidates.length, 3);

const rejectedMultiFrameAudit = selectBestFinalPngCreativeIdentityAudit([
  { ok: false, similarityScore: 0.7735, referenceFrameIndex: 1, issues: [{ code: "final_png_slot_pixels_mismatch" }] },
  { ok: false, similarityScore: 0.801, referenceFrameIndex: 2, issues: [{ code: "final_png_slot_pixels_mismatch" }] },
]);
assert.equal(rejectedMultiFrameAudit.ok, false);
assert.equal(rejectedMultiFrameAudit.matchedReferenceFrameIndex, 2);

const approvedStrongReferences = buildFinalPngCreativeReferenceFrames({
  gifChosenFrameIndex: 9,
  chosenPngPath: "/tmp/weak-chosen.png",
  captureOnly: true,
  frameSelectionDowngraded: false,
  gifFrameCandidates: [
    { frameIndex: 2, pngPath: "/tmp/strong-2.png", strongCandidate: true },
    { frameIndex: 9, pngPath: "/tmp/weak-chosen.png", strongCandidate: false, captureOnlyCandidate: true },
  ],
});
assert.deepEqual(approvedStrongReferences.map((frame) => frame.frameIndex), [2]);

const explicitBestEffortFallback = buildFinalPngCreativeReferenceFrames({
  gifChosenFrameIndex: 9,
  chosenPngPath: "/tmp/weak-chosen.png",
  captureOnly: false,
  frameSelectionDowngraded: true,
  gifFrameCandidates: [],
});
assert.deepEqual(explicitBestEffortFallback.map((frame) => frame.frameIndex), [9]);

const missingStrongReferenceAudit = auditFinalPngCreativeIdentityAgainstFrames(
  "/tmp/final-proof-does-not-need-to-exist.png",
  [{ frameIndex: 2, pngPath: "/tmp/adops-missing-strong-frame.png" }],
  { left: 1, top: 1, width: 10, height: 10 },
  { chromeFrameHeight: 0, frameTemplateSize: { width: 10 } },
  { finalProofStyle: "viewport_only", minSimilarity: 0.82, viewportWidthCss: 10 },
);
assert.equal(missingStrongReferenceAudit.ok, false);
assert(missingStrongReferenceAudit.issues.some((issue) => issue.code === "final_png_creative_reference_missing"));

console.log(JSON.stringify({ ok: true }));
