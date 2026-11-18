import assert from "node:assert/strict";
process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { shouldSkipPrintSingle } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

assert.equal(shouldSkipPrintSingle({ status: "ok" }, { replace: false }), true);
assert.equal(shouldSkipPrintSingle({ status: "ok" }, { replace: true }), false);
assert.equal(shouldSkipPrintSingle({ status: "ok_best_effort" }, { replace: true }), false);
assert.equal(shouldSkipPrintSingle({ status: "missing" }, { replace: false }), false);
