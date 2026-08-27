import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../ops/cloudflare-public-api/migrations/0003_ops_jobs_idempotency.sql", import.meta.url), "utf8");

test("claim do runner usa compare-and-set", () => {
  assert.match(source, /WHERE id = \? AND status = 'ready_for_runner'/);
  assert.match(source, /claimed\.meta\?\.changes/);
});

test("idempotencia usa indice unico e insert-or-ignore", () => {
  assert.match(migration, /CREATE UNIQUE INDEX/);
  assert.match(migration, /idempotencyKey/);
  assert.match(source, /INSERT OR IGNORE INTO ops_jobs/);
});
