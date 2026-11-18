import { createHash } from "node:crypto";

export const SCHEDULED_PREVIEW_CUTOFF = "2026-11-10T14:52:57.000Z";
export const TEST_SCHEDULE = Object.freeze({
  insertionId: 3129,
  jobId: "833a6cd7-a5e4-402e-9fde-55fdb5d175cc",
  revision: "4a3affea371abec316299042e393676c634a920d86b80f36122d4d2d193cc76c",
  adId: 62,
  scheduleId: 80,
  groupId: 2,
  site: "AFL",
  pi: "25208111",
  periodStart: "2026-11-12",
  periodEnd: "2026-11-24",
});
export function scheduleExecutions(job) {
  let result;
  try {
    result =
      typeof job.result_json === "string"
        ? JSON.parse(job.result_json)
        : job.result_json;
  } catch {
    return [];
  }
  if (job.status !== "completed") return [];
  const execution = result?.execution;
  if (job.kind === "adrotate-publish") return execution ? [execution] : [];
  if (job.kind === "drive-pi-ingest")
    return (execution?.publicationResults ?? [])
      .map((x) => x.published)
      .filter(Boolean);
  return [];
}
export function scheduleMatches(job, execution, snapshot, preview) {
  const wp = execution?.wpCliResult,
    payload = execution?.publishPayload;
  if (
    execution?.apply !== true ||
    execution?.scheduled !== true ||
    wp?.schedule_verified !== true ||
    !payload ||
    payload.schedule_only !== true
  )
    return false;
  if (
    !Number.isSafeInteger(wp.ad_id) ||
    wp.ad_id <= 0 ||
    !Number.isSafeInteger(wp.schedule_id) ||
    wp.schedule_id <= 0
  )
    return false;
  if (
    wp.insertion_id !== snapshot.insertionId ||
    payload.insertion_id !== snapshot.insertionId ||
    wp.group_id !== snapshot.groupId ||
    payload.group_id !== snapshot.groupId
  )
    return false;
  if (
    wp.period_start !== snapshot.periodStart ||
    wp.period_end !== snapshot.periodEnd ||
    payload.period_start !== snapshot.periodStart ||
    payload.period_end !== snapshot.periodEnd
  )
    return false;
  if (
    payload.media_url !== snapshot.mediaUrl ||
    (payload.link_url ?? null) !== (snapshot.clickUrl ?? null) ||
    payload.site_sigla !== snapshot.site ||
    String(payload.pi_code) !== String(snapshot.pi)
  )
    return false;
  let result;
  try {
    result =
      typeof job.result_json === "string"
        ? JSON.parse(job.result_json)
        : job.result_json;
  } catch {
    return false;
  }
  if (
    new Date(result?.completedAt).getTime() >=
    Date.parse(SCHEDULED_PREVIEW_CUTOFF)
  )
    return true;
  const t = TEST_SCHEDULE;
  return (
    job.id === t.jobId &&
    snapshot.insertionId === t.insertionId &&
    snapshot.site === t.site &&
    String(snapshot.pi) === t.pi &&
    snapshot.periodStart === t.periodStart &&
    snapshot.periodEnd === t.periodEnd &&
    snapshot.groupId === t.groupId &&
    wp.ad_id === t.adId &&
    wp.schedule_id === t.scheduleId &&
    preview.revision === t.revision
  );
}
export function scheduledMessageKey(snapshot, preview, wp) {
  return (
    "scheduled-preview:" +
    createHash("sha256")
      .update(
        JSON.stringify([
          snapshot.insertionId,
          preview.revision,
          wp.ad_id,
          wp.schedule_id,
        ]),
      )
      .digest("hex")
  );
}
