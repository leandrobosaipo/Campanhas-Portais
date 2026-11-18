#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { uploadLocalMediaAsset } = await import("../../artifacts/api-server/src/lib/local-media-upload.ts");
const route = await readFile(path.join(root, "artifacts/api-server/src/routes/local-media-upload.ts"), "utf8");
const index = await readFile(path.join(root, "artifacts/api-server/src/routes/index.ts"), "utf8");
const openapi = await readFile(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");

const bytes = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b])]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const calls = [];
const uploaded = await uploadLocalMediaAsset({
  bytes,
  contentType: "image/gif",
  env: {
    DO_SPACES_ACCESS_KEY_ID: "test-key",
    DO_SPACES_SECRET_ACCESS_KEY: "test-secret",
    DO_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.com",
    DO_SPACES_REGION: "nyc3",
    ADOPS_SPACES_BUCKET: "test-bucket",
  },
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body, redirect: options.redirect });
    if (options.method === "PUT") return new Response(null, { status: 200 });
    return new Response(bytes, { status: 200, headers: { "content-type": "image/gif" } });
  },
});

assert.equal(uploaded.sha256, sha256);
assert.equal(uploaded.bytes, bytes.length);
assert.equal(uploaded.contentType, "image/gif");
assert.equal(uploaded.readback.verified, true);
assert.equal(uploaded.requiresMediaPreflight, true);
assert.equal(uploaded.validation, "signature_and_storage_readback_only");
assert.equal(calls.length, 2, "exactly one upload and one public readback are required");
assert.equal(calls[0].method, "PUT");
assert.equal(calls[1].method, "GET");
assert.equal(calls[0].redirect, "error", "storage writes must never follow redirects");
assert.match(calls[0].url, new RegExp(`${sha256}\\.gif$`));

const mp4 = Buffer.alloc(16);
mp4.writeUInt32BE(16, 0);
mp4.write("ftyp", 4, "ascii");
mp4.write("isom", 8, "ascii");
mp4.writeUInt32BE(0, 12);
const mp4Calls = [];
const uploadedMp4 = await uploadLocalMediaAsset({
  bytes: mp4,
  contentType: "video/mp4",
  env: { DO_SPACES_ACCESS_KEY_ID: "test-key", DO_SPACES_SECRET_ACCESS_KEY: "test-secret", ADOPS_SPACES_BUCKET: "test-bucket" },
  fetchImpl: async (url, options) => {
    mp4Calls.push({ url: String(url), method: options.method });
    return options.method === "PUT" ? new Response(null, { status: 200 }) : new Response(mp4, { status: 200, headers: { "content-type": "video/mp4" } });
  },
});
assert.equal(uploadedMp4.contentType, "video/mp4");
assert.equal(uploadedMp4.readback.verified, true);
assert.equal(uploadedMp4.requiresMediaPreflight, true, "MP4 must pass normal metadata/renderability preflight before linking/publishing");
assert.match(mp4Calls[0].url, /\.mp4$/);

await assert.rejects(
  uploadLocalMediaAsset({ bytes, contentType: "image/png", env: {}, fetchImpl: async () => { throw new Error("must not upload invalid media"); } }),
  /media_signature_mismatch/,
);
await assert.rejects(
  uploadLocalMediaAsset({
    bytes,
    contentType: "image/gif",
    env: { DO_SPACES_ACCESS_KEY_ID: "test-key", DO_SPACES_SECRET_ACCESS_KEY: "test-secret", ADOPS_SPACES_BUCKET: "test-bucket" },
    fetchImpl: async (_url, options) => options.method === "PUT"
      ? new Response(null, { status: 200 })
      : new Response(Buffer.from("different bytes"), { status: 200, headers: { "content-type": "image/gif" } }),
  }),
  /media_readback_size_mismatch|media_readback_hash_mismatch/,
);
assert.match(route, /express\.raw/);
assert.match(route, /media_too_large/);
assert.match(route, /uploadLocalMediaAsset/);
assert.match(route, /video\/mp4/);
assert.match(route, /MAX_LOCAL_MEDIA_BYTES/);
assert.match(index, /localMediaUploadRouter/);
assert.match(openapi, /^  \/media-assets\/local-upload:\n    post:/m);
assert.match(openapi, /OperatorBearerAuth/);

console.log("ok: local GIF and MP4 upload validate signatures, hash bytes, and verify public readback");
