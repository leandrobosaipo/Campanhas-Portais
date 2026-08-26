import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRootIdempotencyKey,
  buildScheduleId,
  resolveCanonicalSchedule,
  serializeOptionalCount,
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
