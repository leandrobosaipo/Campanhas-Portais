import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRootIdempotencyKey,
  buildRetryJobInput,
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

test("expiracao cria filho sem reabrir o job pai", () => {
  const retry = buildRetryJobInput({
    parentJobId: "job-parent",
    jobKind: "print-batch",
    payload: {
      routineKind: "daily-print",
      targetDate: "2026-08-26",
      dispatchWindow: "18:00",
      rootIdempotencyKey: "daily-print:2026-08-26:18:00",
      attempt: 1,
      maxAttempts: 8,
    },
    failedAt: "2026-08-26T23:00:00.000Z",
    errorCode: "expired",
  });

  assert.deepEqual(retry, {
    jobKind: "print-batch",
    idempotencyKey: "daily-print:2026-08-26:18:00:attempt:2",
    payload: {
      routineKind: "daily-print",
      targetDate: "2026-08-26",
      dispatchWindow: "18:00",
      rootIdempotencyKey: "daily-print:2026-08-26:18:00",
      parentJobId: "job-parent",
      attempt: 2,
      maxAttempts: 8,
      recoveryReason: "expired",
      previousFailedAt: "2026-08-26T23:00:00.000Z",
    },
  });
});

test("nao cria retry acima do limite ou para bloqueio de seguranca", () => {
  const base = {
    parentJobId: "job-parent",
    jobKind: "print-batch" as const,
    failedAt: "2026-08-26T23:00:00.000Z",
    errorCode: "expired",
  };
  assert.equal(buildRetryJobInput({ ...base, payload: { rootIdempotencyKey: "root", attempt: 8, maxAttempts: 8 } }), null);
  assert.equal(buildRetryJobInput({ ...base, errorCode: "blocked_security", payload: { rootIdempotencyKey: "root", attempt: 1, maxAttempts: 8 } }), null);
});

test("runner mantém heartbeat do job durante execução longa", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { runWithJobHeartbeat } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  const heartbeats: string[] = [];
  const result = await runWithJobHeartbeat(
    "job-lease",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 24));
      return "completed";
    },
    async (jobId: string) => {
      heartbeats.push(jobId);
    },
    5,
  );

  assert.equal(result, "completed");
  assert.ok(heartbeats.length >= 2);
  assert.deepEqual(new Set(heartbeats), new Set(["job-lease"]));
});
