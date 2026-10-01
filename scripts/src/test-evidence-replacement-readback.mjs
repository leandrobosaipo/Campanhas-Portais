import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { archiveEvidenceBeforeReplacement } = require("./capture-insertion-proof.cjs");
const sourceBytes = Buffer.from("canonical evidence bytes");
const env = {
  endpoint: "https://spaces.invalid",
  region: "test-region",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
};
const bucket = "test-bucket";
const plan = { sourceKey: "evidence/canonical.png", archiveKey: "private-archive/previous.png" };

function makeTestStorage({ corruptArchive = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "adops-evidence-readback-test-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const awsPath = path.join(bin, "aws");
  writeFileSync(awsPath, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const source = args[4];
const destination = args[5];
const root = process.env.ADOPS_TEST_OBJECT_ROOT;
const objectPath = (uri) => path.join(root, uri.slice("s3://${bucket}/".length));
const isObject = (value) => value.startsWith("s3://");
if (isObject(source) && isObject(destination)) {
  let bytes = fs.readFileSync(objectPath(source));
  if (process.env.ADOPS_TEST_CORRUPT_ARCHIVE === "1" && destination.includes("private-archive/")) bytes = Buffer.concat([bytes, Buffer.from("corrupt")]);
  fs.mkdirSync(path.dirname(objectPath(destination)), { recursive: true });
  fs.writeFileSync(objectPath(destination), bytes);
} else if (isObject(source) && !isObject(destination)) {
  fs.copyFileSync(objectPath(source), destination);
} else {
  throw new Error("unexpected test aws command");
}
`);
  chmodSync(awsPath, 0o700);
  mkdirSync(path.dirname(path.join(root, "objects", plan.sourceKey)), { recursive: true });
  writeFileSync(path.join(root, "objects", plan.sourceKey), sourceBytes);
  const previous = {
    PATH: process.env.PATH,
    ADOPS_TEST_OBJECT_ROOT: process.env.ADOPS_TEST_OBJECT_ROOT,
    ADOPS_TEST_CORRUPT_ARCHIVE: process.env.ADOPS_TEST_CORRUPT_ARCHIVE,
  };
  process.env.PATH = `${bin}${path.delimiter}${previous.PATH || ""}`;
  process.env.ADOPS_TEST_OBJECT_ROOT = path.join(root, "objects");
  process.env.ADOPS_TEST_CORRUPT_ARCHIVE = corruptArchive ? "1" : "0";
  return {
    root,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("confirma SHA-256 e tamanho após arquivar e ler os dois objetos", () => {
  const storage = makeTestStorage();
  try {
    assert.deepEqual(archiveEvidenceBeforeReplacement(env, bucket, plan), plan);
    assert.deepEqual(readFileSync(path.join(storage.root, "objects", plan.sourceKey)), sourceBytes);
    assert.deepEqual(readFileSync(path.join(storage.root, "objects", plan.archiveKey)), sourceBytes);
  } finally {
    storage.restore();
  }
});

test("falha fechada na divergência e mantém a evidência canônica intacta", () => {
  const storage = makeTestStorage({ corruptArchive: true });
  try {
    assert.throws(
      () => archiveEvidenceBeforeReplacement(env, bucket, plan),
      /evidence_replacement_archive_failed:.*SHA-256.*tamanho/i,
    );
    assert.deepEqual(readFileSync(path.join(storage.root, "objects", plan.sourceKey)), sourceBytes);
  } finally {
    storage.restore();
  }
});
