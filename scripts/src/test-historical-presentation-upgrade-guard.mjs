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
test("approved v4/frame-v5 stays protected without a verified footer correction", () => {
  assert.equal(run({ original: { ...original, provenanceVersion: 4, frameTemplateVersion: candidate.frameTemplateVersion } }).code, "historical_original_identity_or_legacy_proof_required");
  assert.equal(run({ original: { ...original, provenanceVersion: 4, frameTemplateVersion: "windows11-chrome-light-similar-v4" } }).ok, true);
  assert.equal(run({ original: { ...original, provenanceVersion: 3, frameTemplateVersion: candidate.frameTemplateVersion } }).ok, true);
});
test("a recorded ordinary campaign footer can be replaced by a clean reviewed candidate", () => {
  const presentation = { historicalDisplayConfirmed: false, presentationLabel: "Reconstrução histórica gerada em 20/11/2026. Referência: 19/11/2026. Não comprova exibição original." };
  const old = { ...original, provenanceVersion: 4, frameTemplateVersion: candidate.frameTemplateVersion, presentation };
  const next = { ...candidate, presentation: { presentationMode: "clean_portal" } };
  assert.equal(run({ original: old, candidate: next }).ok, true);
  for (const edit of [{ sourceKind: "registered_adrotate_schedule" }, { presentationLabel: "Outro texto" }, { historicalDisplayConfirmed: true }]) {
    assert.equal(run({ original: { ...old, presentation: { ...presentation, ...edit } }, candidate: next }).ok, false);
  }
  for (const edit of [{}, { presentationMode: "clean_portal", presentationLabel: "Rodapé" }, { presentationMode: "clean_portal", sourceKind: "registered_adrotate_schedule" }]) {
    assert.equal(run({ original: old, candidate: { ...next, presentation: edit } }).ok, false);
  }
});
test("approved v4/frame-v5 candidate can upgrade only the exact legacy presentation", () => {
  assert.equal(run().ok, true);
  for (const change of [
    { evidenceId: 42 }, { arquivoUrl: "https://cdn.example/other.png" }, { sha256: "b".repeat(64) }, { bytes: 1025 },
  ]) assert.notEqual(run({ request: { ...request, ...change } }).ok, true);
  assert.equal(run({ reviewApproved: false }).code, "approved_v4_frame_v5_candidate_required");
  assert.equal(run({ canonicalApproved: false }).code, "canonical_not_approved");
});
