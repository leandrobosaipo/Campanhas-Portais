import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runnerUrl = new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url);

test("lote diário usa jobs assíncronos por inserção e fecha pela auditoria agregada", async () => {
  const source = await readFile(runnerUrl, "utf8");
  const start = source.indexOf("async function executePrintBatch(job)");
  const end = source.indexOf("async function executePrintBackfill", start);
  const flow = start >= 0 && end > start ? source.slice(start, end) : "";

  assert.match(flow, /enqueueAndWaitCaptureProof\(\{/);
  assert.match(flow, /capture_async_dispatch/);
  assert.match(flow, /\/api\/insertions\/capture-proof\/audit/);
  assert.match(flow, /daily_print_audit_incomplete/);
  assert.match(flow, /incidentLayer: incident\.layer/);
  assert.match(flow, /transportError: transportError/);
  assert.match(flow, /expectedTotal: candidates\.length/);
  assert.match(flow, /item\?\.adops\?\.competencia/);
  assert.match(flow, /auditQuery\.set\("insertionIds", candidates\.map/);
  assert.doesNotMatch(flow, /capture-proof\/batch/);
  const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /competencia: competenciaForDate\(date\)/);
  assert.match(worker, /incidentlayer.*api_or_runner_transport/);
});
