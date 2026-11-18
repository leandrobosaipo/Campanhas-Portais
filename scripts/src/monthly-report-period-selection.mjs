const terminalStatuses = new Set(["cancelado", "cancelada"]);

/**
 * Select report rows by canonical operational identity and effective-period
 * overlap. Commercial competence is intentionally not a report-membership
 * gate: it can be stale while the insertion is still effective in the month.
 */
export function selectMonthlyReportInsertions(canonicalInsertions, bounds) {
  return (canonicalInsertions || [])
    .filter((item) => !terminalStatuses.has(String(item.statusNormalizado || "").toLowerCase()))
    .filter((item) => item.periodoFim >= bounds.start && item.periodoInicio <= bounds.end);
}
