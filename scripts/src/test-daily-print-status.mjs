import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyPrintStatus } from "../../ops/shared/daily-print-status.mjs";

test("resume a última rotina usando somente a auditoria canônica do próprio lote", () => {
  const result = buildDailyPrintStatus({
    now: new Date("2026-08-18T01:00:00.000Z"),
    jobs: [
      {
        id: "job-17", status: "failed", createdAt: "2026-08-17T22:00:50.000Z", updatedAt: "2026-08-17T22:14:25.000Z",
        payload: { source: "cloudflare-cron-daily-print", date: "2026-08-17" },
        result: { canonicalAudit: { expected: 16, approved: 14, missing: 2, invalid: 0 } },
        error: "daily_print_audit_incomplete",
      },
      {
        id: "job-16", status: "completed", createdAt: "2026-08-16T22:00:00.000Z", updatedAt: "2026-08-16T22:10:00.000Z",
        payload: { source: "cloudflare-cron-daily-print", date: "2026-08-16" },
        result: { canonicalAudit: { expected: 16, approved: 16, missing: 0, invalid: 0 } },
      },
    ],
  });
  assert.equal(result.nextRunAt, "2026-08-18T22:00:00.000Z");
  assert.deepEqual(result.lastAttempt, {
    jobId: "job-17", targetDate: "2026-08-17", status: "partial",
    startedAt: "2026-08-17T22:00:50.000Z", finishedAt: "2026-08-17T22:14:25.000Z",
    expected: 16, approved: 14, missing: 2, invalid: 0,
    summary: "14 de 16 inserções tiveram o print aprovado; 2 precisam de nova tentativa.",
  });
  assert.deepEqual(result.lastFullyApproved, { targetDate: "2026-08-16", finishedAt: "2026-08-16T22:10:00.000Z" });
  assert.equal(JSON.stringify(result).includes("daily_print_audit_incomplete"), false);
});

test("não declara dia aprovado quando o job não contém auditoria canônica completa", () => {
  const result = buildDailyPrintStatus({
    now: new Date("2026-08-18T23:00:00.000Z"),
    jobs: [{ id: "job", status: "completed", createdAt: "2026-08-18T22:00:00.000Z", updatedAt: "2026-08-18T22:05:00.000Z", payload: { source: "cloudflare-cron-daily-print", date: "2026-08-18" }, result: {} }],
  });
  assert.equal(result.nextRunAt, "2026-08-19T22:00:00.000Z");
  assert.equal(result.lastFullyApproved, null);
});

test("preserva estados em fila e em execução sem declarar aprovação antecipada", () => {
  for (const [rawStatus, expectedStatus, counts] of [
    ["queued", "queued", null],
    ["ready_for_runner", "queued", null],
    ["running", "running", { expected: 16, approved: 16, missing: 0, invalid: 0 }],
  ]) {
    const result = buildDailyPrintStatus({
      now: new Date("2026-08-18T21:00:00.000Z"),
      jobs: [{
        id: `job-${rawStatus}`,
        status: rawStatus,
        createdAt: "2026-08-18T20:00:00.000Z",
        updatedAt: "2026-08-18T20:05:00.000Z",
        payload: { source: "cloudflare-cron-daily-print", date: "2026-08-18" },
        result: counts ? { canonicalAudit: counts } : {},
      }],
    });
    assert.equal(result.lastAttempt.status, expectedStatus);
    assert.equal(result.lastAttempt.finishedAt, null);
    assert.equal(result.lastFullyApproved, null);
    assert.match(result.lastAttempt.summary, expectedStatus === "running" ? /agora/ : /fila/);
  }
});
