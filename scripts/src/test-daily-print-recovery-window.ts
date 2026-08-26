import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyPrintRecoveryWindow } from "../../ops/cloudflare-public-api/src/daily-print-recovery-window";

test("programa as sete retomadas no mesmo dia de Cuiabá", () => {
  const crons = ["30 22 * * *", "0 23 * * *", "30 23 * * *", "0 0 * * *", "30 0 * * *", "0 1 * * *", "30 1 * * *"];
  for (const cron of crons) {
    assert.deepEqual(buildDailyPrintRecoveryWindow(cron, Date.parse("2026-08-25T23:00:00Z"))?.date, "2026-08-25");
    assert.equal(buildDailyPrintRecoveryWindow(cron, Date.parse("2026-08-25T23:00:00Z"))?.mode, "same_day_retry");
  }
});

test("recuperação das 08h usa o dia anterior em Cuiabá", () => {
  assert.deepEqual(buildDailyPrintRecoveryWindow("0 12 * * *", Date.parse("2026-08-26T12:00:00Z")), {
    date: "2026-08-25",
    window: "next_day_0800",
    mode: "late_publication_recovery",
  });
});

test("ignora cron que não pertence à recuperação", () => {
  assert.equal(buildDailyPrintRecoveryWindow("15 2 * * *", Date.now()), null);
});
