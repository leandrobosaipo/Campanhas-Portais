const FRAME_V5 = "windows11-chrome-light-similar-v5";

export function parsePromotionRequestBody(rawBody) {
  if (rawBody === undefined) return { ok: true, expectation: undefined };
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return { ok: false, error: "promotion_request_invalid" };
  const body = rawBody;
  if (Object.keys(body).some((key) => key !== "replaceHistoricalPresentation")) return { ok: false, error: "promotion_request_invalid" };
  const expectation = body.replaceHistoricalPresentation;
  if (expectation === undefined) return { ok: true, expectation: undefined };
  if (!expectation || typeof expectation !== "object" || Array.isArray(expectation)) return { ok: false, error: "historical_presentation_expectation_invalid" };
  const keys = Object.keys(expectation).sort().join(",");
  let validHttpsUrl = false;
  try { validHttpsUrl = typeof expectation.arquivoUrl === "string" && new URL(expectation.arquivoUrl).protocol === "https:"; } catch { /* invalid */ }
  if (keys !== "arquivoUrl,bytes,evidenceId,sha256"
    || !Number.isSafeInteger(expectation.evidenceId) || expectation.evidenceId < 1
    || !validHttpsUrl || typeof expectation.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectation.sha256)
    || !Number.isSafeInteger(expectation.bytes) || expectation.bytes < 1) {
    return { ok: false, error: "historical_presentation_expectation_invalid" };
  }
  return { ok: true, expectation };
}

export function decideHistoricalPresentationUpgrade({ request, original, candidate, reviewApproved, canonicalApproved }) {
  if (!canonicalApproved) return { ok: false, code: "canonical_not_approved" };
  if (!request) return { ok: false, code: "canonical_already_approved" };
  const keys = Object.keys(request).sort();
  let validHttpsUrl = false;
  try { validHttpsUrl = new URL(request.arquivoUrl).protocol === "https:"; } catch { /* invalid */ }
  if (keys.join(",") !== "arquivoUrl,bytes,evidenceId,sha256"
    || !Number.isSafeInteger(request.evidenceId) || request.evidenceId < 1
    || typeof request.arquivoUrl !== "string" || !validHttpsUrl
    || typeof request.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(request.sha256)
    || !Number.isSafeInteger(request.bytes) || request.bytes < 1) {
    return { ok: false, code: "historical_presentation_expectation_invalid" };
  }
  if (!original || original.id !== request.evidenceId || original.arquivoUrl !== request.arquivoUrl
    || original.sha256 !== request.sha256 || original.bytes !== request.bytes
    || original.captureClass !== "historical_recovery"
    || original.auditCaptureClass !== "historical_recovery"
    || original.canonicalUrl !== request.arquivoUrl
    || original.auditApproved !== true
    || (original.provenanceVersion === 4 && original.frameTemplateVersion === FRAME_V5)) {
    return { ok: false, code: "historical_original_identity_or_legacy_proof_required" };
  }
  if (!reviewApproved || !candidate || candidate.captureClass !== "historical_recovery"
    || candidate.provenanceVersion !== 4 || candidate.frameTemplateVersion !== FRAME_V5
    || candidate.historicalDisplayConfirmed !== false) {
    return { ok: false, code: "approved_v4_frame_v5_candidate_required" };
  }
  return { ok: true, reason: "presentation_upgrade", expectedOriginal: {
    evidenceId: request.evidenceId, arquivoUrl: request.arquivoUrl, sha256: request.sha256, bytes: request.bytes,
  } };
}
