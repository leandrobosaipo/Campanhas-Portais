function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function selectDailyPrintCandidates(items, targetDate, options = {}) {
  const scope = [...(Array.isArray(items) ? items : [])];
  const represented = new Set(scope.map(item => positiveInteger(item?.adops?.insertionId)));
  for (const { insertion, audit } of options.publishedInsertions ?? []) {
    const id = positiveInteger(insertion?.id);
    if (!id || represented.has(id) || audit?.insertionId !== id || audit?.targetDate !== targetDate) continue;
    if (!['ok', 'missing', 'invalid_audit', 'invalid_url'].includes(audit.status)) continue;
    if (insertion.bannerPublicadoNoSite !== true || !insertion.mediaUrl || insertion.archivedAt || insertion.supersededByInsertionId) continue;
    if (/^(cancelad[oa]|inativ[oa]|arquivad[oa]|superseded|concluido)$/.test(String(insertion.statusNormalizado ?? '').trim().toLowerCase())) continue;
    if (!insertion.periodoInicio || !insertion.periodoFim || targetDate < insertion.periodoInicio || targetDate > insertion.periodoFim) continue;
    represented.add(id);
    scope.push({
      adops: { ...insertion, insertionId: id },
      evidence: { requiredDates: [targetDate], missingDates: audit.status === 'missing' ? [targetDate] : [], invalidDates: audit.status.startsWith('invalid_') ? [targetDate] : [] },
      captureScopeSource: 'published_insertion_audit',
    });
  }
  const pendingIds = new Set((Array.isArray(options.pendingInsertionIds) ? options.pendingInsertionIds : [])
    .map(positiveInteger)
    .filter(Boolean));
  const competencia = typeof options.competencia === "string" && options.competencia.trim()
    ? options.competencia.trim().toUpperCase()
    : null;
  return scope.filter((item) => {
    const insertionId = positiveInteger(item?.adops?.insertionId);
    // Capture an explicitly selected, observed creative; never authorize publication here.
    const confirmedCanonical = item?.publicationHealth?.reason === 'duplicate_identity'
      && item?.canonicalSelection?.decision === 'confirmed'
      && item.canonicalSelection.insertionId === insertionId
      && item?.sourceIdentity?.decision === 'confirmed'
      && item?.publicationHealth?.expectedMediaObserved === true
      && positiveInteger(item?.publicationHealth?.expectedGroupId)
      && item?.adops?.publicConfirmation === 'confirmed';
    if (item?.publicationHealth?.status === "blocked_upstream" && !confirmedCanonical) return false;
    if (pendingIds.size > 0 && !pendingIds.has(insertionId)) return false;
    if (competencia && String(item?.adops?.competencia || "").toUpperCase() !== competencia) return false;
    const publicConfirmed = item?.adops?.publicConfirmation === "confirmed";
    if (!insertionId || (item?.adops?.bannerPublicadoNoSite !== true && !publicConfirmed) || !item?.adops?.mediaUrl) return false;
    const requiredDates = Array.isArray(item?.evidence?.requiredDates) ? item.evidence.requiredDates : [];
    return requiredDates.includes(targetDate);
  });
}

export function summarizeDailyPrintCandidates(candidates, targetDate) {
  const items = Array.isArray(candidates) ? candidates : [];
  let missing = 0;
  let invalid = 0;
  for (const item of items) {
    if (Array.isArray(item?.evidence?.missingDates) && item.evidence.missingDates.includes(targetDate)) missing += 1;
    else if (Array.isArray(item?.evidence?.invalidDates) && item.evidence.invalidDates.includes(targetDate)) invalid += 1;
  }
  return { totalEligible: items.length, ok: items.length - missing - invalid, missing, invalid };
}
