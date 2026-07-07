import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveFinalCustomerProofStyle,
  evaluateFinalPngSlotAuditResult,
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

console.log(JSON.stringify({ ok: true }));
