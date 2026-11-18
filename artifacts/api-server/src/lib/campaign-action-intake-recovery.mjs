const norm = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const day = value => String(value ?? "").slice(0, 10);
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const parse = value => typeof value === "string" ? JSON.parse(value) : value;
const identityMatch = (left, right) => Number(left?.siteId) === Number(right?.siteId)
  && norm(left?.localFormatoNormalizado ?? left?.localFormato) === norm(right?.localFormatoNormalizado ?? right?.localFormato)
  && day(left?.periodoInicio ?? left?.periodo_inicio) === day(right?.periodoInicio)
  && day(left?.periodoFim ?? left?.periodo_fim) === day(right?.periodoFim);

/**
 * Reuses only intake records tied to this exact action event and failed job.
 * Insertion IDs come from a unique current DB match; no successful job result is
 * synthesized and the caller must keep the original terminal failure visible.
 */
export function recoverActionIntakeEvidence({ actionId, job, plan, eventRow, documentRow, parseRuns, campaigns, insertions }) {
  const expectedEventId = `drive:${plan?.folderId}:confirmed-action:${actionId}`;
  if (!actionId || !job?.id || job.status !== "failed" || job.kind !== "drive-pi-ingest" || !plan?.folderId) return null;
  if (eventRow?.event_id !== expectedEventId || eventRow?.job_id !== job.id || eventRow?.drive_file_id !== plan.folderId || !["applied", "failed"].includes(eventRow?.status)) return null;
  if (!documentRow?.id || documentRow.event_id !== expectedEventId || documentRow.drive_file_id !== plan.folderId || !["applied", "failed"].includes(documentRow.status)) return null;

  let event, jobPayload;
  try { event = parse(eventRow.payload_json); jobPayload = parse(job.payload_json); } catch { return null; }
  if (event?.eventId !== expectedEventId || event?.driveFileId !== plan.folderId || event?.source !== "macmini-api-publish") return null;
  if (jobPayload?.eventId !== expectedEventId || jobPayload?.driveFileId !== plan.folderId) return null;
  if (!same(event.parsedPi, plan.parsedPi) || !same(jobPayload.parsedPi, plan.parsedPi)) return null;
  if (event.publish !== true || event.strictInsertionScope !== true || event.preserveOtherInsertions !== true || event.preflightOnly === true) return null;
  if (documentRow.content_sha256 && documentRow.content_sha256 !== plan.sourcePdfSha) return null;

  const expected = Array.isArray(plan.parsedPi?.insertions) ? plan.parsedPi.insertions : [];
  if (!expected.length || !Array.isArray(parseRuns) || !Array.isArray(campaigns) || !Array.isArray(insertions)) return null;
  const campaignMatches = campaigns.filter(c => norm(c.pi_codigo ?? c.piCodigo) === norm(plan.parsedPi.piCodigo)
    && Number(c.cliente_id ?? c.clienteId) === Number(plan.parsedPi.clienteId)
    && Number(c.agencia_id ?? c.agenciaId) === Number(plan.parsedPi.agenciaId));
  if (campaignMatches.length !== 1) return null;
  const campaignId = Number(campaignMatches[0].id);
  if (!(campaignId > 0)) return null;

  const parsedRuns = parseRuns.map(row => {
    try { return { row, fields: parse(row.fields_json) }; } catch { return null; }
  }).filter(Boolean);
  const sourceCandidates = parsedRuns.filter(({ row, fields }) => ["validated", "applying", "applied"].includes(row.status)
    && fields?.package?.pdf?.sha256 === plan.sourcePdfSha
    && norm(fields?.piCodigo) === norm(plan.parsedPi.piCodigo)
    && Array.isArray(fields?.mediaProcessing?.results));
  const appliedCandidates = parsedRuns.filter(({ row, fields }) => row.status === "applied"
    && norm(fields?.piCodigo) === norm(plan.parsedPi.piCodigo)
    && Array.isArray(fields?.insertions));
  if (sourceCandidates.length !== 1 || appliedCandidates.length !== 1) return null;
  const sourceRun = sourceCandidates[0], appliedRun = appliedCandidates[0];

  const ids = [];
  const mediaResults = [];
  for (const raw of expected) {
    const expectedMedia = (plan.media ?? []).filter(item => String(item?.sourceDriveFileId ?? "") === String(raw.mediaDriveFileId ?? "")
      && String(item?.md5 ?? "").toLowerCase() === String(raw.mediaMd5Checksum ?? "").toLowerCase());
    if (expectedMedia.length !== 1 || !/^[a-f0-9]{32}$/i.test(String(raw.mediaMd5Checksum ?? ""))) return null;
    const parsed = appliedRun.fields.insertions.filter(item => identityMatch(item, raw)
      && String(item?.mediaDriveFileId ?? "") === String(raw.mediaDriveFileId ?? "")
      && typeof item?.mediaUrl === "string" && item.mediaUrl.length > 0);
    if (parsed.length !== 1) return null;
    const media = sourceRun.fields.mediaProcessing.results.filter(item => Number(item?.siteId) === Number(raw.siteId)
      && norm(item?.localFormatoNormalizado ?? item?.localFormato) === norm(raw.localFormatoNormalizado ?? raw.localFormato)
      && String(item?.sourceDriveFileId ?? "") === String(raw.mediaDriveFileId ?? "")
      && typeof item?.mediaUrl === "string" && item.mediaUrl === parsed[0].mediaUrl
      && (!item?.md5 || String(item.md5).toLowerCase() === String(raw.mediaMd5Checksum).toLowerCase()));
    if (!media.length || media.some(item => item.mediaUrl !== media[0].mediaUrl)) return null;
    const live = insertions.filter(item => Number(item.campanha_id ?? item.campanhaId ?? item.campaignId) === campaignId
      && Number(item.site_id ?? item.siteId) === Number(raw.siteId)
      && norm(item.local_formato_normalizado ?? item.localFormatoNormalizado ?? item.local_formato ?? item.localFormato) === norm(raw.localFormatoNormalizado ?? raw.localFormato)
      && day(item.periodo_inicio ?? item.periodoInicio) === day(raw.periodoInicio)
      && day(item.periodo_fim ?? item.periodoFim) === day(raw.periodoFim)
      && (item.archived_at ?? item.archivedAt) == null
      && (item.superseded_by_insertion_id ?? item.supersededByInsertionId) == null
      && (item.media_url ?? item.mediaUrl) === parsed[0].mediaUrl);
    if (live.length !== 1 || !(Number(live[0].id) > 0)) return null;
    ids.push(Number(live[0].id));
    mediaResults.push({...media[0], periodoInicio: raw.periodoInicio, periodoFim: raw.periodoFim});
  }
  if (new Set(ids).size !== expected.length) return null;
  return {
    source: "exact_action_intake_and_unique_live_identity",
    eventId: expectedEventId,
    driveFileId: plan.folderId,
    sourcePdfSha: plan.sourcePdfSha,
    appliedParseRunId: appliedRun.row.id ?? null,
    mediaParseRunId: sourceRun.row.id ?? null,
    insertionIds: ids,
    mediaProcessing: { results: mediaResults },
    executionWarning: true,
  };
}
