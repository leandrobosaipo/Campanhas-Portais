import assert from "node:assert/strict";
import test from "node:test";
import { buildRunnerPools } from "../../ops/cloudflare-remote-runner/src/runner-concurrency.mjs";

test("separa pi-site-export do pool serial que executa analytics filho", () => {
  assert.deepEqual(buildRunnerPools(["print-single", "pi-site-export", "campaign-evidence-export"], 3), [
    { kinds: ["print-single"], concurrency: 1, maintenance: true },
    { kinds: ["pi-site-export"], concurrency: 1, maintenance: false },
    { kinds: ["campaign-evidence-export"], concurrency: 3, maintenance: false },
  ]);
});

test("mantem analytics e mutacoes operacionais no mesmo pool serial", () => {
  assert.deepEqual(buildRunnerPools([
    "sync-planilha",
    "analytics-report",
    "pi-site-export",
    "adrotate-publish",
  ], 2), [
    { kinds: ["sync-planilha", "analytics-report", "adrotate-publish"], concurrency: 1, maintenance: true },
    { kinds: ["pi-site-export"], concurrency: 1, maintenance: false },
  ]);
});

test("mantem exatamente um pool responsavel por manutencao sem jobs seriais", () => {
  assert.deepEqual(buildRunnerPools(["pi-site-export", "campaign-evidence-export"], 2), [
    { kinds: ["pi-site-export"], concurrency: 1, maintenance: true },
    { kinds: ["campaign-evidence-export"], concurrency: 2, maintenance: false },
  ]);
});

test("limita concorrencia de exportacao entre um e tres", () => {
  assert.equal(buildRunnerPools(["campaign-evidence-export"], 99)[0].concurrency, 3);
  assert.equal(buildRunnerPools(["campaign-evidence-export"], 0)[0].concurrency, 1);
});
