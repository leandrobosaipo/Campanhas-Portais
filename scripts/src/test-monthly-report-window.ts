import assert from "node:assert/strict";
import test from "node:test";
import * as windowContract from "../../ops/cloudflare-public-api/src/monthly-report-window";

test("agenda o portal mensal somente no cron 02:15 UTC", () => {
  assert.equal(windowContract.isMonthlyEvidenceReportCron("15 2 * * *"), true);
  assert.equal(windowContract.isMonthlyEvidenceReportCron("0 22 * * *"), false);
});

test("gera payload e chave idempotente por data de Cuiaba", () => {
  assert.deepEqual(windowContract.buildMonthlyEvidenceReportSchedule(new Date("2026-08-12T02:15:00.000Z")), {
    competencia: "AGOSTO/2026",
    targetDate: "2026-08-11",
    idempotencyKey: "evidence-monthly-report:2026-08-11",
    source: "cloudflare-cron-evidence-monthly-report",
  });
});
