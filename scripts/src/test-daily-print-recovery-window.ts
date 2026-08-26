import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyPrintRecoveryWindow } from "../../ops/cloudflare-public-api/src/daily-print-recovery-window";

test("programa as sete retomadas no mesmo dia de Cuiabá", () => {
  const times = ["22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30"];
  for (const [index, time] of times.entries()) {
    const day = index < 3 ? "25" : "26";
    const result = buildDailyPrintRecoveryWindow("consolidated", Date.parse(`2026-08-${day}T${time}:00Z`));
    assert.equal(result?.date, "2026-08-25");
    assert.equal(result?.mode, "same_day_retry");
  }
});

test("recuperação das 08h usa o dia anterior em Cuiabá", () => {
  assert.deepEqual(buildDailyPrintRecoveryWindow("consolidated", Date.parse("2026-08-26T12:00:00Z")), {
    date: "2026-08-25",
    window: "next_day_0800",
    mode: "late_publication_recovery",
  });
});

test("ignora cron que não pertence à recuperação", () => {
  assert.equal(buildDailyPrintRecoveryWindow("consolidated", Date.parse("2026-08-26T10:00:00Z")), null);
});
