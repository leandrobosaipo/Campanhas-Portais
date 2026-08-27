import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const runnerSource = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url));

test("backfill usa criacao idempotente nos dois providers", () => {
  for (const [source, handler] of [
    [api, 'router.post("/ops/jobs/print-backfill"'],
    [worker, 'if (path === "/api/ops/jobs/print-backfill")'],
  ]) {
    const start = source.indexOf(handler);
    const block = source.slice(start, start + 3200);
    assert.match(block, /createIdempotentOpsJob/);
    assert.match(block, /late_publication_recovery/);
    assert.match(block, /duplicate/);
  }
});

test("backfill limita retry temporario e nao repete bloqueio", () => {
  assert.match(runnerSource, /const RETROACTIVE_RETRY_DELAYS_MS = \[0, 2_000, 5_000\]/);
  assert.match(runnerSource, /isRetryableRetroactiveError/);
  assert.match(runnerSource, /blocked_reconstruction/);
  assert.match(runnerSource, /blocked_upstream/);
  assert.match(runnerSource, /skipped_existing/);
  assert.match(runnerSource, /attempts/);
});

test("erro 503 passa na terceira tentativa", async () => {
  let attempts = 0;
  const result = await runner.executeRetroactiveTarget({
    identity: { insertionId: 2645, date: "2026-08-24" },
    readStatus: async () => attempts >= 3
      ? { status: "audited", approved: true, arquivoUrl: "https://cdn.example/2645-2026-08-24.png" }
      : { status: "missing" },
    capture: async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("503"), { code: "http_503" });
      return { item: { uploadedUrl: "https://cdn.example/2645-2026-08-24.png" } };
    },
    sleep: async () => undefined,
  });
  assert.equal(result.status, "audited");
  assert.equal(result.attempts, 3);
});

test("bloqueio de reconstrucao nao recebe retry", async () => {
  let attempts = 0;
  const result = await runner.executeRetroactiveTarget({
    identity: { insertionId: 2645, date: "2026-08-25" },
    readStatus: async () => ({ status: "missing" }),
    capture: async () => {
      attempts += 1;
      throw Object.assign(new Error("reconstruction not allowed"), { code: "reconstruction_not_allowed" });
    },
    sleep: async () => undefined,
  });
  assert.equal(result.status, "blocked_reconstruction");
  assert.equal(attempts, 1);
});

test("filtro de competencia usa o seletor compartilhado", () => {
  const start = runnerSource.indexOf("async function executePrintBackfill");
  const end = runnerSource.indexOf("async function executePrintSingle", start);
  const flow = start >= 0 && end > start ? runnerSource.slice(start, end) : "";
  assert.match(flow, /capture-proof\/backfill-overdue\/preview/);
  assert.match(flow, /params\.set\("competencia", String\(payload\.competencia\)\)/);
  assert.doesNotMatch(flow, /filter\([^)]*competencia/);
});
