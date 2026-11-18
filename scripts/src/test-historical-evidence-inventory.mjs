import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyHistoricalInventorySource,
  pageHistoricalInventoryRows,
  parseHistoricalInventoryPagination,
  selectCanonicalHistoricalEvidenceRows,
} from "../../artifacts/api-server/src/lib/historical-evidence-inventory.mjs";

test("inventory pagination defaults to 50 and caps at 200", () => {
  assert.deepEqual(parseHistoricalInventoryPagination({}), { ok: true, limit: 50, cursor: null });
  assert.deepEqual(parseHistoricalInventoryPagination({ limit: "200", cursor: "13" }), { ok: true, limit: 200, cursor: 13 });
  for (const limit of ["0", "201", "1.5", ["50"], "-1"]) assert.equal(parseHistoricalInventoryPagination({ limit }).ok, false);
  for (const cursor of ["0", "-1", "1.2", ["2"], "2147483648", "9007199254740992"]) assert.equal(parseHistoricalInventoryPagination({ cursor }).ok, false);
});

test("canonical evidence selection matches newest-created/tie-highest-ID and stable cursor pages", () => {
  const rows = [
    { evidenceId: 1, insertionId: 8, targetDate: "2026-09-01", createdAt: "2026-09-02T00:00:00Z" },
    { evidenceId: 2, insertionId: 8, targetDate: "2026-09-01", createdAt: "2026-09-03T00:00:00Z" },
    { evidenceId: 3, insertionId: 9, targetDate: "2026-09-01", createdAt: "2026-09-03T00:00:00Z" },
    { evidenceId: 4, insertionId: 9, targetDate: "2026-09-01", createdAt: "2026-09-03T00:00:00Z" },
    { evidenceId: 5, insertionId: 10, targetDate: "2026-09-02", createdAt: "2026-09-01T00:00:00Z" },
  ];
  const canonical = selectCanonicalHistoricalEvidenceRows(rows);
  assert.deepEqual(canonical.map((row) => row.evidenceId), [2, 4, 5]);
  const first = pageHistoricalInventoryRows(canonical, { limit: 1, cursor: null });
  const second = pageHistoricalInventoryRows(canonical, { limit: 1, cursor: Number(first.nextCursor) });
  const third = pageHistoricalInventoryRows(canonical, { limit: 1, cursor: Number(second.nextCursor) });
  assert.deepEqual([...first.rows, ...second.rows, ...third.rows].map((row) => row.evidenceId), [2, 4, 5]);
  assert.equal(new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.evidenceId)).size, 3);
  assert.equal(third.nextCursor, null);
  assert.deepEqual(pageHistoricalInventoryRows(canonical, { limit: 1, cursor: 4 }), {
    rows: [canonical[2]], nextCursor: null,
  });
});

test("cursor advances across a filtered-empty page; classifications never infer history from date", () => {
  const page = pageHistoricalInventoryRows([
    { evidenceId: 11, insertionId: 1, targetDate: "2020-01-01" },
    { evidenceId: 12, insertionId: 2, targetDate: "2020-01-01" },
    { evidenceId: 13, insertionId: 3, targetDate: "2020-01-01" },
  ], { limit: 2, cursor: null });
  const projected = page.rows.filter((row) => row.insertionId === 99);
  assert.deepEqual(projected, []);
  assert.equal(page.nextCursor, "12");
  assert.equal(classifyHistoricalInventorySource({ trustedClass: "historical_recovery", reconstructionPresent: true }), "historical");
  assert.equal(classifyHistoricalInventorySource({ trustedClass: "scheduled", reconstructionPresent: false }), "daily");
  assert.equal(classifyHistoricalInventorySource({ trustedClass: null, reconstructionPresent: false }), "unknown");
  assert.equal(classifyHistoricalInventorySource({ trustedClass: "scheduled", reconstructionPresent: true }), "unknown");
});

test("undated records retain unique evidence IDs and remain unknown", () => {
  const rows = selectCanonicalHistoricalEvidenceRows([
    { evidenceId: 20, insertionId: 7, targetDate: null },
    { evidenceId: 21, insertionId: 7, targetDate: null },
    { evidenceId: 22, insertionId: 7, targetDate: "2026-10-01" },
  ]);
  assert.deepEqual(rows.map((row) => row.evidenceId), [20, 21, 22]);
  const page = pageHistoricalInventoryRows(rows, { limit: 2, cursor: null });
  assert.deepEqual(page.rows.map((row) => row.targetDate), [null, null]);
  assert.equal(page.nextCursor, "21");
  assert.equal(classifyHistoricalInventorySource({ trustedClass: null, reconstructionPresent: false }), "unknown");
});
