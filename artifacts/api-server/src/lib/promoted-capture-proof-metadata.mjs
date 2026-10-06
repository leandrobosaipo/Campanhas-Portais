function exactIso(value) {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * Resolves final checklist metadata only when the approved promotion receipt,
 * candidate row, final log and canonical evidence all name the same artifact.
 * Returns null for legacy/unverifiable records; callers must keep them unknown.
 */
export function resolvePromotedCaptureProofMetadata({ promotion, candidate, finalLog, canonicalEvidenceUrl }) {
  const audit = asObject(promotion?.audit);
  const candidateMetadata = asObject(candidate?.metadata);
  const logArtifacts = asObject(finalLog?.artifacts);
  const auditTimestamp = exactIso(candidate?.capturedAt);
  const metadataTimestamp = exactIso(candidateMetadata?.capturedAt);
  const logTimestamp = exactIso(finalLog?.createdAt);
  const sourceJobId = candidate?.sourceJobId;

  const identityMatches = promotion?.status === "approved"
    && typeof promotion?.finalLogId === "string" && promotion.finalLogId === finalLog?.id
    && typeof promotion?.candidateId === "string" && promotion.candidateId === candidate?.id
    && Number.isInteger(candidate?.insertionId)
    && promotion?.insertionId === candidate.insertionId && finalLog?.insertionId === candidate.insertionId
    && typeof candidate?.targetDate === "string"
    && promotion?.targetDate === candidate.targetDate && finalLog?.targetDate === candidate.targetDate
    && typeof sourceJobId === "string" && sourceJobId.length > 0
    && promotion?.sourceJobId === sourceJobId
    && finalLog?.jobId === sourceJobId && finalLog?.runnerJobId === sourceJobId
    && typeof canonicalEvidenceUrl === "string" && canonicalEvidenceUrl.length > 0
    && candidate?.artifactUrl === canonicalEvidenceUrl
    && promotion?.candidateUrl === canonicalEvidenceUrl
    && finalLog?.uploadedUrl === canonicalEvidenceUrl
    && logArtifacts?.candidateId === candidate?.id
    && typeof candidate?.artifactSha256 === "string" && /^[a-f0-9]{64}$/i.test(candidate.artifactSha256)
    && promotion?.candidateSha256 === candidate.artifactSha256
    && Number.isInteger(candidate?.artifactBytes) && candidate.artifactBytes > 0
    && promotion?.candidateBytes === candidate.artifactBytes
    && auditTimestamp !== null && metadataTimestamp === auditTimestamp && logTimestamp === auditTimestamp
    && candidateMetadata?.insertionId === candidate.insertionId
    && candidateMetadata?.targetDate === candidate.targetDate
    && candidateMetadata?.sourceJobId === sourceJobId
    && (!candidateMetadata?.uploadedUrl || candidateMetadata.uploadedUrl === canonicalEvidenceUrl)
    && (!candidateMetadata?.evidenceUrl || candidateMetadata.evidenceUrl === canonicalEvidenceUrl)
    && finalLog?.status === "ok"
    && audit?.approved === true && audit?.preliminary === false
    && audit?.insertionId === candidate.insertionId
    && audit?.date === candidate.targetDate
    && Array.isArray(audit?.blockingIssues) && audit.blockingIssues.length === 0
    && asObject(audit?.audit)?.ok === true;

  if (!identityMatches) return null;
  return { ...candidateMetadata, checklistValidation: audit };
}
