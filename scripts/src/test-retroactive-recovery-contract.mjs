import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");

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
