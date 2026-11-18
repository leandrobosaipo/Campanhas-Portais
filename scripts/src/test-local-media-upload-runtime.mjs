#!/usr/bin/env node
import assert from "node:assert/strict";
import { once } from "node:events";

process.env.DATABASE_URL ??= "postgres://adops-test:unused@127.0.0.1:1/adops_test";
process.env.OPS_API_TOKEN = "local-test-operator-token";
process.env.ADOPS_INTERNAL_API_TOKEN = "local-test-internal-token";
const { default: app } = await import("../../artifacts/api-server/src/app.ts");
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const url = `http://127.0.0.1:${port}/api/media-assets/local-upload`;

try {
  const unauthorized = await fetch(url, { method: "POST", headers: { "content-type": "image/gif" }, body: Buffer.from("GIF89a") });
  assert.equal(unauthorized.status, 401, "the API operator guard must protect media upload");

  const invalidSignature = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer local-test-operator-token", "content-type": "image/gif" },
    body: Buffer.from("not a gif"),
  });
  assert.equal(invalidSignature.status, 415, "invalid file signatures must be rejected before storage access");
  assert.equal((await invalidSignature.json()).error, "media_signature_mismatch");

  const tooLarge = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer local-test-operator-token", "content-type": "image/gif" },
    body: Buffer.alloc(32 * 1024 * 1024 + 1),
  });
  assert.equal(tooLarge.status, 413, "raw uploads must enforce the declared byte ceiling");
  assert.equal((await tooLarge.json()).error, "media_too_large");
} finally {
  server.close();
  await once(server, "close");
}

console.log("ok: upload route is authenticated and rejects bad signatures and oversized payloads");
