import assert from "node:assert/strict";
import { test } from "node:test";
import { decideHistoricalPresentationUpgrade as decide, parsePromotionRequestBody } from "../../artifacts/api-server/src/lib/historical-presentation-upgrade-guard.mjs";

const request = { evidenceId: 41, arquivoUrl: "https://cdn.example/old.png", sha256: "a".repeat(64), bytes: 1024 };
const original = { ...request, id: 41, captureClass: "historical_recovery", auditCaptureClass: "historical_recovery", canonicalUrl: request.arquivoUrl, auditApproved: true, provenanceVersion: 3, frameTemplateVersion: "windows11-chrome-light-similar-v4" };
const candidate = { captureClass: "historical_recovery", provenanceVersion: 4, frameTemplateVersion: "windows11-chrome-light-similar-v5", historicalDisplayConfirmed: false };
const run = (overrides = {}) => decide({ request, original, candidate, reviewApproved: true, canonicalApproved: true, ...overrides });

test("promotion body parser preserves default only for absent or empty object bodies", () => {
  assert.deepEqual(parsePromotionRequestBody(undefined), { ok: true, expectation: undefined });
  assert.deepEqual(parsePromotionRequestBody({}), { ok: true, expectation: undefined });
  assert.deepEqual(parsePromotionRequestBody(null), { ok: false, error: "promotion_request_invalid" });
  assert.deepEqual(parsePromotionRequestBody([]), { ok: false, error: "promotion_request_invalid" });
  assert.deepEqual(parsePromotionRequestBody("{}"), { ok: false, error: "promotion_request_invalid" });
  assert.deepEqual(parsePromotionRequestBody({ other: true }), { ok: false, error: "promotion_request_invalid" });
  assert.equal(parsePromotionRequestBody({ replaceHistoricalPresentation: request }).ok, true);
  assert.deepEqual(parsePromotionRequestBody({ replaceHistoricalPresentation: { ...request, extra: true } }), {
    ok: false, error: "historical_presentation_expectation_invalid",
  });
});

test("default keeps approved canonical evidence blocked", () => {
  assert.equal(decide({ original, candidate, reviewApproved: true, canonicalApproved: true }).code, "canonical_already_approved");
});
test("daily and same-day retry captures cannot use the explicit bypass", () => {
  for (const captureClass of ["scheduled", "same_day_retry"]) {
    assert.equal(run({ original: { ...original, captureClass } }).code, "historical_original_identity_or_legacy_proof_required");
    assert.equal(run({ candidate: { ...candidate, captureClass } }).code, "approved_v4_frame_v5_candidate_required");
  }
});
test("original with both v4 and frame-v5 is never eligible, partial pairs remain eligible", () => {
  assert.equal(run({ original: { ...original, provenanceVersion: 4, frameTemplateVersion: candidate.frameTemplateVersion } }).code, "historical_original_identity_or_legacy_proof_required");
  assert.equal(run({ original: { ...original, provenanceVersion: 4, frameTemplateVersion: "windows11-chrome-light-similar-v4" } }).ok, true);
  assert.equal(run({ original: { ...original, provenanceVersion: 3, frameTemplateVersion: candidate.frameTemplateVersion } }).ok, true);
});
test("approved v4/frame-v5 candidate can upgrade only the exact legacy presentation", () => {
  assert.equal(run().ok, true);
  for (const change of [
    { evidenceId: 42 }, { arquivoUrl: "https://cdn.example/other.png" }, { sha256: "b".repeat(64) }, { bytes: 1025 },
  ]) assert.notEqual(run({ request: { ...request, ...change } }).ok, true);
  assert.equal(run({ reviewApproved: false }).code, "approved_v4_frame_v5_candidate_required");
  assert.equal(run({ canonicalApproved: false }).code, "canonical_not_approved");
});
