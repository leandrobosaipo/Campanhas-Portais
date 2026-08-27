import assert from "node:assert/strict";
import test from "node:test";
import { buildRunnerPools } from "../../ops/cloudflare-remote-runner/src/runner-concurrency.mjs";

test("separa exportacoes paralelas de capturas seriais", () => {
  assert.deepEqual(buildRunnerPools(["print-single", "pi-site-export", "campaign-evidence-export"], 3), [
    { kinds: ["print-single", "pi-site-export"], concurrency: 1, maintenance: true },
    { kinds: ["campaign-evidence-export"], concurrency: 3, maintenance: false },
  ]);
});

test("limita concorrencia de exportacao entre um e tres", () => {
  assert.equal(buildRunnerPools(["campaign-evidence-export"], 99)[0].concurrency, 3);
  assert.equal(buildRunnerPools(["campaign-evidence-export"], 0)[0].concurrency, 1);
});
