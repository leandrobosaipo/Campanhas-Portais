import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { restoreEvidenceFromArchive } = require("./capture-insertion-proof.cjs");
const env = { endpoint: "https://spaces.invalid", region: "test-region", accessKeyId: "test-access", secretAccessKey: "test-secret" };
const bucket = "test-bucket";
const original = Buffer.from("saved original evidence bytes");
const replacement = Buffer.from("current canonical candidate bytes");
const plan = {
  sourceKey: "adops-prints/SEPTEMBER-2026/1/3032/2026-09-14.png",
  archiveKey: "adops-evidence-originals/SEPTEMBER-2026/1/3032/2026-09-14/sha256-original.png",
  sha256: createHash("sha256").update(original).digest("hex"),
  bytes: original.length,
};

function makeStorage({ corruptRestore = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "adops-evidence-restore-test-"));
  const objectRoot = path.join(root, "objects");
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  mkdirSync(path.dirname(path.join(objectRoot, plan.sourceKey)), { recursive: true });
  mkdirSync(path.dirname(path.join(objectRoot, plan.archiveKey)), { recursive: true });
  writeFileSync(path.join(objectRoot, plan.sourceKey), replacement);
  writeFileSync(path.join(objectRoot, plan.archiveKey), original);
  const awsPath = path.join(bin, "aws");
  writeFileSync(awsPath, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const source = args[4];
const destination = args[5];
const root = process.env.ADOPS_TEST_OBJECT_ROOT;
const bucket = "s3://${bucket}/";
const objectPath = (uri) => path.join(root, uri.slice(bucket.length));
const isObject = (value) => value.startsWith("s3://");
if (isObject(source) && !isObject(destination)) fs.copyFileSync(objectPath(source), destination);
else if (!isObject(source) && isObject(destination)) {
  let bytes = fs.readFileSync(source);
  if (process.env.ADOPS_TEST_CORRUPT_RESTORE === "1" && source.endsWith("/archive")) bytes = Buffer.concat([bytes, Buffer.from("corrupt")]);
  fs.mkdirSync(path.dirname(objectPath(destination)), { recursive: true });
  fs.writeFileSync(objectPath(destination), bytes);
} else throw new Error("unexpected test aws command");
`);
  chmodSync(awsPath, 0o700);
  const previous = {
    PATH: process.env.PATH,
    ADOPS_TEST_OBJECT_ROOT: process.env.ADOPS_TEST_OBJECT_ROOT,
    ADOPS_TEST_CORRUPT_RESTORE: process.env.ADOPS_TEST_CORRUPT_RESTORE,
  };
  process.env.PATH = `${bin}${path.delimiter}${previous.PATH || ""}`;
  process.env.ADOPS_TEST_OBJECT_ROOT = objectRoot;
  process.env.ADOPS_TEST_CORRUPT_RESTORE = corruptRestore ? "1" : "0";
  return {
    objectRoot,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("restaura arquivo privado no alvo e confere SHA-256 e tamanho por readback", () => {
  const storage = makeStorage();
  try {
    const result = restoreEvidenceFromArchive(env, bucket, plan);
    assert.equal(result.restoredVerified, true);
    assert.equal(result.sha256, plan.sha256);
    assert.equal(result.bytes, original.length);
    assert.deepEqual(readFileSync(path.join(storage.objectRoot, plan.sourceKey)), original);
  } finally {
    storage.restore();
  }
});

test("falha fechada e restaura o objeto anterior se o readback do restore divergir", () => {
  const storage = makeStorage({ corruptRestore: true });
  try {
    assert.throws(() => restoreEvidenceFromArchive(env, bucket, plan), /evidence_restore_failed: readback/);
    assert.deepEqual(readFileSync(path.join(storage.objectRoot, plan.sourceKey)), replacement);
  } finally {
    storage.restore();
  }
});

test("rejeita arquivo sem hash ou prefixo privado", () => {
  const storage = makeStorage();
  try {
    assert.throws(() => restoreEvidenceFromArchive(env, bucket, { ...plan, sha256: "" }), /alvo, arquivo ou checksum inválido/);
    assert.throws(() => restoreEvidenceFromArchive(env, bucket, { ...plan, archiveKey: "public/candidate.png" }), /alvo, arquivo ou checksum inválido/);
  } finally {
    storage.restore();
  }
});
