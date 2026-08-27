import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const runnerSource = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url));

test("backfill usa criacao idempotente nos dois providers", () => {
  const apiStart = api.indexOf('router.post("/ops/jobs/print-backfill"');
  const apiBlock = api.slice(apiStart, apiStart + 3200);
  assert.match(apiBlock, /createIdempotentOpsJob\("print-backfill", payload, "ops-api", buildPrintBackfillIdempotencyKey\(payload\), false, true\)/);

  const workerStart = worker.indexOf('if (path === "/api/ops/jobs/print-backfill")');
  const workerBlock = worker.slice(workerStart, workerStart + 3200);
  assert.match(workerBlock, /createIdempotentOpsJob\(env, "print-backfill", payload, "ops-api", buildPrintBackfillIdempotencyKey\(payload\), true\)/);

  for (const block of [apiBlock, workerBlock]) {
    assert.match(block, /late_publication_recovery/);
    assert.match(block, /duplicate/);
  }
});

test("retry idempotente reabre somente failed e preserva o mesmo jobId", () => {
  const apiStart = api.indexOf("async function createIdempotentOpsJob");
  const apiBlock = api.slice(apiStart, apiStart + 3600);
  assert.match(apiBlock, /shouldRetryFailedOpsJob\(existing\.rows\[0\]\.status, retryFailed\)/);
  assert.match(apiBlock, /WHERE id = \$3 AND status = 'failed'/);
  assert.match(apiBlock, /attempt: nextOperationalAttempt\(existing\.rows\[0\]\.attempt\)/);
  assert.match(apiBlock, /jobId: existing\.rows\[0\]\.id, status: "ready_for_runner" as const, duplicate: false/);
  assert.match(apiBlock, /status: existing\.rows\[0\]\.status,[\s\S]{0,80}duplicate: true/);

  const workerStart = worker.indexOf("async function createIdempotentOpsJob");
  const workerBlock = worker.slice(workerStart, workerStart + 3600);
  assert.match(workerBlock, /shouldRetryFailedOpsJob\(existing\.status, retryFailed\)/);
  assert.match(workerBlock, /WHERE id = \? AND status = \? AND result_json IS \? AND updated_at = \?/);
  assert.match(workerBlock, /attempt: nextOperationalAttempt\(existingPayload\.attempt\)/);
  assert.match(workerBlock, /jobId: existing\.id, status: "ready_for_runner" as JobStatus, duplicate: false/);
  assert.match(workerBlock, /jobId: existing\.id, status: existing\.status, duplicate: true/);
});

test("tentativa operacional cria uma unica chave nova para o job filho", () => {
  assert.equal(runner.buildRunnerCaptureIdempotencyKey("job-1", 1, 1861, "2026-08-24"), "runner-capture:job-1:attempt:1:1861:2026-08-24");
  assert.equal(runner.buildRunnerCaptureIdempotencyKey("job-1", 2, 1861, "2026-08-24"), "runner-capture:job-1:attempt:2:1861:2026-08-24");
  assert.equal(runner.buildRunnerCaptureIdempotencyKey("job-1", 2, 1861, "2026-08-24"), runner.buildRunnerCaptureIdempotencyKey("job-1", 2, 1861, "2026-08-24"));
  const start = runnerSource.indexOf("async function executePrintBackfill");
  const block = runnerSource.slice(start, start + 7000);
  assert.match(block, /outerAttempt: payload\?\.attempt/);
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

test("GET 503 preserva codigo estruturado para o retry", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503 });
  try {
    await assert.rejects(
      () => runner.privateApiGet("/api/insertions/2645/capture-proof/status?date=2026-08-24"),
      (error) => error?.code === "http_503" && runner.isRetryableRetroactiveError(error),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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
