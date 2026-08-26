const CAPTURE_STAGES = new Set([
  "page_resolved",
  "slot_found",
  "creative_matched",
  "frame_selected",
  "slot_captured",
  "critical_assets",
  "final_composed",
  "capture_failed",
]);

export function sanitizeCaptureStages(stages = []) {
  return (Array.isArray(stages) ? stages : []).map((item) => ({
    stage: typeof item?.stage === "string" ? item.stage : "unknown",
    status: typeof item?.status === "string" ? item.status : "unknown",
    startedAt: typeof item?.startedAt === "string" ? item.startedAt : null,
    finishedAt: typeof item?.finishedAt === "string" ? item.finishedAt : null,
    durationMs: typeof item?.durationMs === "number" && Number.isFinite(item.durationMs) && item.durationMs >= 0
      ? item.durationMs
      : null,
  }));
}

export function buildFailedCaptureStage(startedAt, finishedAt) {
  return {
    stage: "capture_failed",
    status: "failed",
    startedAt: typeof startedAt === "string" ? startedAt : null,
    finishedAt: typeof finishedAt === "string" ? finishedAt : null,
    durationMs: durationBetween(startedAt, finishedAt),
  };
}

function durationBetween(start, end) {
  const startMs = Date.parse(String(start ?? ""));
  const endMs = Date.parse(String(end ?? ""));
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : null;
}

function sumStageDurations(stages, acceptedNames) {
  const values = (Array.isArray(stages) ? stages : [])
    .filter((item) => acceptedNames.has(String(item?.stage ?? "")))
    .map((item) => item?.durationMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

export function summarizeCaptureJobTimings(job = {}) {
  const stages = sanitizeCaptureStages((Array.isArray(job?.items) ? job.items : []).flatMap((item) => Array.isArray(item?.stages) ? item.stages : []));
  const captureStarts = stages
    .filter((item) => CAPTURE_STAGES.has(item.stage))
    .map((item) => Date.parse(String(item.startedAt ?? "")))
    .filter(Number.isFinite);
  const uploadStarts = stages
    .filter((item) => item.stage === "uploaded")
    .map((item) => Date.parse(String(item.startedAt ?? "")))
    .filter(Number.isFinite);
  const captureFinishes = stages
    .filter((item) => CAPTURE_STAGES.has(item.stage))
    .map((item) => Date.parse(String(item.finishedAt ?? "")))
    .filter(Number.isFinite);
  const captureEndMs = uploadStarts.length ? Math.min(...uploadStarts) : captureFinishes.length ? Math.max(...captureFinishes) : null;
  const captureMs = captureStarts.length && captureEndMs !== null
    ? Math.max(0, captureEndMs - Math.min(...captureStarts))
    : null;
  return {
    queueMs: durationBetween(job?.createdAt, job?.startedAt),
    captureMs,
    uploadMs: sumStageDurations(stages, new Set(["uploaded"])),
    auditMs: sumStageDurations(stages, new Set(["audit_evaluated"])),
    totalMs: durationBetween(job?.createdAt, job?.finishedAt),
  };
}

function sumKnown(values) {
  const known = values.filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

export function aggregateCaptureTimings(items = [], finalAuditMs = null) {
  const timings = (Array.isArray(items) ? items : []).map((item) => item?.timings ?? {});
  return {
    captureMs: sumKnown(timings.map((item) => item.captureMs)),
    uploadMs: sumKnown(timings.map((item) => item.uploadMs)),
    auditMs: sumKnown([...timings.map((item) => item.auditMs), finalAuditMs]),
  };
}
