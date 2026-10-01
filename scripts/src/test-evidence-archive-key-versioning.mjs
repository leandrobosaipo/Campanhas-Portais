import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { archiveEvidenceBeforeReplacement } = require("./capture-insertion-proof.cjs");
const bucket = "test-bucket";
const env = { endpoint: "https://spaces.invalid", region: "test", accessKeyId: "key", secretAccessKey: "secret" };

function makeMock() {
  const root = mkdtempSync(path.join(os.tmpdir(), "adops-archive-key-test-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const aws = path.join(bin, "aws");
  writeFileSync(aws, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(1);
const root = process.env.ADOPS_TEST_OBJECT_ROOT;
const objectPath = (uri) => path.join(root, uri.slice("s3://${bucket}/".length));
const source = args[5];
const destination = args[6];
if (!source || !destination) throw new Error("expected copy arguments");
const from = source.startsWith("s3://") ? objectPath(source) : source;
const to = destination.startsWith("s3://") ? objectPath(destination) : destination;
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
`);
  chmodSync(aws, 0o700);
  const objects = path.join(root, "objects");
  mkdirSync(path.join(objects, "evidence"), { recursive: true });
  const previousPath = process.env.PATH;
  const previousRoot = process.env.ADOPS_TEST_OBJECT_ROOT;
  process.env.PATH = `${bin}${path.delimiter}${previousPath || ""}`;
  process.env.ADOPS_TEST_OBJECT_ROOT = objects;
  return {
    root,
    objects,
    put(bytes) { writeFileSync(path.join(objects, "evidence", "proof.png"), bytes); },
    restore() {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousRoot === undefined) delete process.env.ADOPS_TEST_OBJECT_ROOT;
      else process.env.ADOPS_TEST_OBJECT_ROOT = previousRoot;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

for (const version of ["?v=123", ""]) {
  test(`preserva versões anteriores e é idempotente com URL ${version ? "versionada" : "sem versão"}`, () => {
    const mock = makeMock();
    const plan = { sourceKey: "evidence/proof.png", archiveKey: "private-archive/unversioned-proof.png" };
    try {
      mock.put("first version");
      const first = { ...archiveEvidenceBeforeReplacement(env, bucket, plan) };
      mock.put("second version");
      const second = { ...archiveEvidenceBeforeReplacement(env, bucket, plan) };
      const retry = { ...archiveEvidenceBeforeReplacement(env, bucket, plan) };

      assert.notEqual(first.archiveKey, second.archiveKey);
      assert.equal(second.archiveKey, retry.archiveKey);
      assert.deepEqual(readFileSync(path.join(mock.objects, first.archiveKey)), Buffer.from("first version"));
      assert.deepEqual(readFileSync(path.join(mock.objects, second.archiveKey)), Buffer.from("second version"));
    } finally {
      mock.restore();
    }
  });
}
