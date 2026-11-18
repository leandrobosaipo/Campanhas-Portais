export function parseHistoricalInventoryPagination(query) {
  const limitValue = query.limit;
  let limit = 50;
  if (limitValue !== undefined) {
    if (typeof limitValue !== "string" || !/^\d+$/.test(limitValue)) return { ok: false, error: "historical_inventory_limit_invalid" };
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return { ok: false, error: "historical_inventory_limit_invalid" };
  }
  const cursorValue = query.cursor;
  let cursor = null;
  if (cursorValue !== undefined) {
    if (typeof cursorValue !== "string" || !/^[1-9]\d*$/.test(cursorValue)) return { ok: false, error: "historical_inventory_cursor_invalid" };
    cursor = Number(cursorValue);
    if (!Number.isSafeInteger(cursor) || cursor > 2_147_483_647) return { ok: false, error: "historical_inventory_cursor_invalid" };
  }
  return { ok: true, limit, cursor };
}

function newerEvidence(left, right) {
  const leftTime = new Date(left.createdAt ?? 0).getTime();
  const rightTime = new Date(right.createdAt ?? 0).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime > rightTime || (leftTime === rightTime && left.evidenceId > right.evidenceId)
    : left.evidenceId > right.evidenceId;
}

export function selectCanonicalHistoricalEvidenceRows(rows) {
  const byIdentity = new Map();
  for (const row of rows) {
    if (row.targetDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(row.targetDate)) continue;
    if (row.targetDate == null) {
      byIdentity.set(`undated:${row.evidenceId}`, row);
      continue;
    }
    const key = `${row.insertionId}:${row.targetDate}`;
    const current = byIdentity.get(key);
    if (!current || newerEvidence(row, current)) byIdentity.set(key, row);
  }
  return [...byIdentity.values()].sort((left, right) => left.evidenceId - right.evidenceId);
}

export function pageHistoricalInventoryRows(canonicalRows, { limit, cursor }) {
  const eligible = canonicalRows.filter((row) => cursor === null || row.evidenceId > cursor)
    .sort((left, right) => left.evidenceId - right.evidenceId);
  const hasMore = eligible.length > limit;
  const rows = eligible.slice(0, limit);
  return {
    rows,
    nextCursor: hasMore && rows.length ? String(rows.at(-1).evidenceId) : null,
  };
}

export function classifyHistoricalInventorySource({ trustedClass, reconstructionPresent }) {
  if (trustedClass === "historical_recovery") return "historical";
  if (["scheduled", "same_day_retry"].includes(trustedClass) && !reconstructionPresent) return "daily";
  return "unknown";
}
