const SAFE_ID = /^[-a-zA-Z0-9_]{1,100}$/;

function normalizedIso(value) {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inspectCandidateJob(job, insertionId, targetDate) {
  if (!job || !SAFE_ID.test(String(job.id ?? "")) || job.status !== "completed"
    || !["capture-proof-single", "capture-proof-backfill"].includes(job.kind)) return { ok: false, reason: "job_invalid" };
  const payload = asObject(job.payload) ?? {};
  const targets = Array.isArray(payload.targets) ? payload.targets.map(asObject) : [];
  const target = targets.find((entry) => entry?.insertionId === insertionId && entry.targetDate === targetDate);
  const items = Array.isArray(job.items) ? job.items.map(asObject) : [];
  const item = items.find((entry) => entry?.insertionId === insertionId && entry.targetDate === targetDate);
  if (!target || target.candidateOnly !== true || !item || item.status !== "ok" || item.candidateOnly !== true) return { ok: false, reason: "job_target_mismatch" };

  const stages = Array.isArray(item.stages) ? item.stages.map(asObject) : [];
  const captureStage = stages.find((stage) => stage?.stage === "slot_captured" && stage.status === "ok");
  const captureStageStartedAt = normalizedIso(captureStage?.startedAt);
  const captureStageFinishedAt = normalizedIso(captureStage?.finishedAt);
  const uploadedStage = stages.find((stage) => stage?.stage === "uploaded" && stage.status === "ok");
  const uploadedAt = normalizedIso(uploadedStage?.finishedAt);
  const startedAt = normalizedIso(job.startedAt);
  const finishedAt = normalizedIso(job.finishedAt);
  if (!captureStageStartedAt || !captureStageFinishedAt || !uploadedAt || !startedAt || !finishedAt
    || Date.parse(startedAt) > Date.parse(captureStageStartedAt)
    || Date.parse(captureStageStartedAt) > Date.parse(captureStageFinishedAt)
    || Date.parse(captureStageFinishedAt) > Date.parse(uploadedAt)
    || Date.parse(uploadedAt) > Date.parse(finishedAt)) return { ok: false, reason: "job_timestamps_untrusted" };

  if (typeof item.uploadedUrl !== "string") return { ok: false, reason: "artifact_url_missing" };
  let artifactUrl;
  try {
    artifactUrl = new URL(item.uploadedUrl);
  } catch {
    return { ok: false, reason: "artifact_url_invalid" };
  }
  const segments = artifactUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const candidateAt = segments.indexOf("candidates");
  const filename = segments.at(-1) ?? "";
  if (artifactUrl.protocol !== "https:" || !artifactUrl.hostname.endsWith(".digitaloceanspaces.com")
    || candidateAt < 1 || segments[candidateAt - 1] !== String(insertionId)
    || segments[candidateAt + 1] !== job.id || !filename.includes(targetDate)) return { ok: false, reason: "artifact_candidate_path_mismatch" };

  return { ok: true, jobId: job.id, item, target, captureStageStartedAt, captureStageFinishedAt, uploadedAt, artifactUrl, requestedCaptureAt: target.captureAt };
}

export function validateCandidateMetadata(metadata, { jobId, insertionId, targetDate, captureStageStartedAt, captureStageFinishedAt, requestedCaptureAt }) {
  const reconstruction = asObject(metadata?.reconstruction);
  const capturedAt = normalizedIso(metadata?.capturedAt);
  const reconstructedAt = normalizedIso(reconstruction?.reconstructedAt);
  const valid = metadata?.sourceJobId === jobId
    && metadata?.insertionId === insertionId
    && metadata?.targetDate === targetDate
    && capturedAt !== null && capturedAt === metadata?.capturedAt
    && reconstructedAt === capturedAt
    && Date.parse(captureStageStartedAt) <= Date.parse(capturedAt)
    && Date.parse(capturedAt) <= Date.parse(captureStageFinishedAt)
    && typeof requestedCaptureAt === "string" && metadata?.requestedCaptureAt === requestedCaptureAt
    && metadata?.captureClass === "historical_recovery"
    && metadata?.auditPolicyVersion === "audit-policy-v1"
    && reconstruction?.historicalDisplayConfirmed === false
    && reconstruction?.provenanceVersion === 3;
  return { ok: valid, reason: valid ? null : "candidate_metadata_provenance_mismatch" };
}

export function validateCandidateReadback(candidate, actual) {
  return candidate.artifactSha256 === actual.sha256
    && candidate.artifactBytes === actual.bytes
    && stableJson(candidate.metadata) === stableJson(actual.metadata)
    && candidate.artifactUrl === actual.artifactUrl
    && normalizedIso(candidate.capturedAt) === normalizedIso(actual.capturedAt);
}
