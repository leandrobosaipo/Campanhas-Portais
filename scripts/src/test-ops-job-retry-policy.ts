import assert from "node:assert/strict";
import test from "node:test";
import { nextOperationalAttempt as nextApiAttempt, shouldRetryFailedOpsJob as shouldRetryApiJob } from "../../artifacts/api-server/src/lib/ops-job-retry.ts";
import { nextOperationalAttempt as nextWorkerAttempt, shouldRetryFailedOpsJob as shouldRetryWorkerJob } from "../../ops/cloudflare-public-api/src/ops-job-retry.ts";

for (const [provider, shouldRetry] of [["api", shouldRetryApiJob], ["worker", shouldRetryWorkerJob]] as const) {
  test(`${provider}: reabre somente job failed quando retry foi autorizado`, () => {
    assert.equal(shouldRetry("failed", true), true);
    assert.equal(shouldRetry("failed", false), false);
    assert.equal(shouldRetry("completed", true), false);
    assert.equal(shouldRetry("queued", true), false);
    assert.equal(shouldRetry("ready_for_runner", true), false);
    assert.equal(shouldRetry("running", true), false);
  });
}

for (const [provider, nextAttempt] of [["api", nextApiAttempt], ["worker", nextWorkerAttempt]] as const) {
  test(`${provider}: tentativa operacional progride sem saltos`, () => {
    assert.equal(nextAttempt(undefined), 2);
    assert.equal(nextAttempt(1), 2);
    assert.equal(nextAttempt("2"), 3);
  });
}
