import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRootIdempotencyKey,
  buildScheduleId,
  reconcileDueSchedules,
  resolveCanonicalSchedule,
  serializeOptionalCount,
  validateDryRunNow,
} from "../../artifacts/api-server/src/lib/ops-scheduler";

test("resolve o lote das 18h de Cuiaba a partir de UTC", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T22:00:00.000Z"));
  const dailyPrint = decisions.find((decision) => decision.routineKind === "daily-print");

  assert.deepEqual(dailyPrint, {
    routineKind: "daily-print",
    jobKind: "print-batch",
    targetDate: "2026-08-26",
    timezone: "America/Cuiaba",
    scheduledFor: "2026-08-26T22:00:00.000Z",
    dispatchWindow: "18:00",
    due: true,
    maxAttempts: 8,
    nextRecoveryAt: "2026-08-26T22:30:00.000Z",
  });
});

test("resolve a recuperacao das 08h para o dia anterior em Cuiaba", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-27T12:00:00.000Z"));
  const recovery = decisions.find((decision) => decision.routineKind === "daily-print-morning-recovery");

  assert.equal(recovery?.targetDate, "2026-08-26");
  assert.equal(recovery?.dispatchWindow, "08:00");
  assert.equal(recovery?.scheduledFor, "2026-08-27T12:00:00.000Z");
  assert.equal(recovery?.due, true);
});

test("nao considera uma janela futura como devida", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T21:59:00.000Z"));
  const dailyPrint = decisions.find((decision) => decision.routineKind === "daily-print");

  assert.equal(dailyPrint?.targetDate, "2026-08-26");
  assert.equal(dailyPrint?.due, false);
  assert.equal(dailyPrint?.scheduledFor, "2026-08-26T22:00:00.000Z");
});

test("gera identificadores estaveis por rotina data e janela", () => {
  assert.equal(buildScheduleId("daily-print", "2026-08-26", "18:00"), "daily-print:2026-08-26:18:00");
  assert.equal(buildRootIdempotencyKey("daily-print", "2026-08-26", "18:00"), "daily-print:2026-08-26:18:00");
});

test("preserva ausencia de contagem como null", () => {
  assert.equal(serializeOptionalCount(undefined), null);
  assert.equal(serializeOptionalCount(null), null);
  assert.equal(serializeOptionalCount(0), 0);
  assert.equal(serializeOptionalCount("3"), 3);
});

test("duas reconciliacoes concorrentes retornam o mesmo job", async () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T22:00:00.000Z"));
  const jobs = new Map<string, string>();
  let sequence = 0;
  const createIfAbsent = async (input: { idempotencyKey: string }) => {
    await new Promise((resolve) => setImmediate(resolve));
    const existing = jobs.get(input.idempotencyKey);
    if (existing) return { jobId: existing, created: false };
    const jobId = `job-${++sequence}`;
    jobs.set(input.idempotencyKey, jobId);
    return { jobId, created: true };
  };

  const [first, second] = await Promise.all([
    reconcileDueSchedules(decisions, createIfAbsent),
    reconcileDueSchedules(decisions, createIfAbsent),
  ]);
  const firstDaily = first.find((decision) => decision.scheduleId === "daily-print:2026-08-26:18:00");
  const secondDaily = second.find((decision) => decision.scheduleId === "daily-print:2026-08-26:18:00");

  assert.equal(jobs.size, 1);
  assert.equal(firstDaily?.jobId, secondDaily?.jobId);
  assert.deepEqual(new Set([firstDaily?.outcome, secondDaily?.outcome]), new Set(["created", "duplicate"]));
});

test("reconciliacao nao cria job fora da janela", async () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T21:59:00.000Z"));
  let creates = 0;
  const result = await reconcileDueSchedules(decisions, async () => {
    creates += 1;
    return { jobId: "unexpected", created: true };
  });

  assert.equal(creates, 0);
  assert.ok(result.every((decision) => decision.outcome === "not_due"));
});

test("instante informado pelo caller só é aceito em dry-run", () => {
  assert.equal(validateDryRunNow(false, "2026-08-26T22:00:00.000Z"), null);
  assert.equal(validateDryRunNow(true, "invalid"), undefined);
  assert.equal(validateDryRunNow(true, "2026-08-26T22:00:00.000Z")?.toISOString(), "2026-08-26T22:00:00.000Z");
});
