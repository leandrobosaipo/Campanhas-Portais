#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ??= "postgres://adops-test:unused@127.0.0.1:1/adops_test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const express = apiRequire("express");
const { default: campaignBundlesRouter } = await import("../../artifacts/api-server/src/routes/campaign-bundles.ts");
const app = express();
app.use(express.json());
app.use(campaignBundlesRouter);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();

try {
  const invalidPreflight = await fetch(`http://127.0.0.1:${port}/campaign-bundles/preflight`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(invalidPreflight.status, 400, "preflight route must be mounted and validate body before DB access");
  assert.equal((await invalidPreflight.json()).error, "invalid_campaign_bundle");

  const validShapeMissingKey = await fetch(`http://127.0.0.1:${port}/campaign-bundles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campaign: { nome: "Local validation only" }, insertions: [{ statusNormalizado: "aguardando_publicacao" }] }),
  });
  assert.equal(validShapeMissingKey.status, 400, "create route must enforce idempotency before DB access");
  assert.equal((await validShapeMissingKey.json()).error, "invalid_idempotency_key");
} finally {
  server.close();
  await once(server, "close");
}

console.log("ok: mounted bundle routes validate preflight and idempotency without database writes");
