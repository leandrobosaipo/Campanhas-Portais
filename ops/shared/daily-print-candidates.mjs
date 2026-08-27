function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function selectDailyPrintCandidates(items, targetDate, options = {}) {
  const pendingIds = new Set((Array.isArray(options.pendingInsertionIds) ? options.pendingInsertionIds : [])
    .map(positiveInteger)
    .filter(Boolean));
  const competencia = typeof options.competencia === "string" && options.competencia.trim()
    ? options.competencia.trim().toUpperCase()
    : null;
  return (Array.isArray(items) ? items : []).filter((item) => {
    const insertionId = positiveInteger(item?.adops?.insertionId);
    if (item?.publicationHealth?.status === "blocked_upstream") return false;
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
