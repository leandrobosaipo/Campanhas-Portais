import { pool } from "@workspace/db";
import { getPlaywrightBudgetSnapshot, withPlaywrightPermit } from "../../artifacts/api-server/src/lib/playwright-budget";

let active = 0;
let maxActive = 0;
const started: number[] = [];
const waits: number[] = [];

async function task(index: number) {
  return withPlaywrightPermit(
    `budget-test-${index}`,
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      started.push(index);
      await new Promise((resolve) => setTimeout(resolve, 250));
      active -= 1;
    },
    { onAcquired: ({ queueWaitMs }) => { waits.push(queueWaitMs); } },
  );
}

try {
  await Promise.all([task(1), task(2)]);
  if (maxActive !== 1) throw new Error(`playwright_budget_concurrency_failed:${maxActive}`);
  if (waits.length !== 2 || Math.max(...waits) < 200) {
    throw new Error(`playwright_budget_wait_timing_failed:${JSON.stringify(waits)}`);
  }
  const snapshot = getPlaywrightBudgetSnapshot();
  if (snapshot.active !== 0 || snapshot.queued !== 0 || snapshot.sinceProcessStart.completed !== 2) {
    throw new Error(`playwright_budget_snapshot_invalid:${JSON.stringify(snapshot)}`);
  }
  console.log(JSON.stringify({ ok: true, maxActive, started, waits, snapshot }));
} finally {
  await pool.end();
}
