#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toPublicCaptureJob } from "../../artifacts/api-server/src/lib/capture-job-progress.ts";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [capture, runner, contract, progress, app] = await Promise.all([
  read("scripts/src/capture-insertion-proof.cjs"),
  read("artifacts/api-server/src/lib/local-print-runner.ts"),
  read("artifacts/api-server/src/lib/print-runner-contract.ts"),
  read("artifacts/api-server/src/lib/capture-job-progress.ts"),
  read("artifacts/api-server/src/app.ts"),
]);

assert.match(capture, /if \(\(args\.saveEvidence \|\| args\.candidateOnly\) && args\.apiBase && internalCaptureToken\)[\s\S]*?metadata\.checklistValidation = await validateCaptureChecklist/);
assert.match(capture, /args\.candidateOnly && !args\.saveEvidence/);
assert.match(capture, /async function validateCaptureChecklist\(apiBase, insertionId, targetDate, metadata, allowRejected = false\)/);
assert.match(capture, /if \(!response\.ok \|\| \(!allowRejected && payload\?\.approved !== true\)\)/);
assert.match(capture, /if \(args\.apiBase && internalCaptureToken && \(!args\.candidateOnly \|\| args\.saveEvidence\)\)[\s\S]*?persistCaptureMetadata/);
assert.match(capture, /checklistValidation: metadata\.checklistValidation/);
assert.match(runner, /checklistValidation: capture\.checklistValidation/);
assert.match(contract, /checklistValidation\?: Record<string, unknown> \| null/);
assert.match(progress, /item\.candidateOnly[\s\S]*?checklistValidation:[\s\S]*?retroContentProof:/);
assert.match(app, /req\.method === "GET"[\s\S]*?capture-proof\\\/jobs/);

const publicJob = toPublicCaptureJob({
  id: "job-12345678",
  kind: "capture-proof-single",
  status: "completed",
  createdAt: "2026-09-29T00:00:00.000Z",
  totalTargets: 1,
  completedTargets: 1,
  failedTargets: 0,
  items: [{
    insertionId: 3021,
    targetDate: "2026-09-17",
    status: "ok",
    candidateOnly: true,
    readinessAudit: { secret: "drop" },
    checklistValidation: {
      approved: false,
      preliminary: true,
      version: "audit-checklist-v1",
      insertionId: 3021,
      date: "2026-09-17",
      metadataPresent: true,
      evidenceStatus: "blocked",
      blockingIssues: [{ code: "retro_editorial_audit_missing", detail: "secret=drop /Users/operator/private", token: "drop" }],
      contract: { ok: true, insertion: { id: 3021, apiToken: "drop" }, expectedMedia: { mediaBasename: "ad.jpg", mediaUrl: "https://media.example/ad.jpg?token=drop" }, requiredGates: { inPeriod: true } },
      apiToken: "drop",
    },
    retroContentProof: { status: "approved", manifestHash: "abc123", secret: "drop" },
    secret: "drop",
  }],
});
assert.deepEqual(publicJob.items[0].checklistValidation.blockingIssues, [{ code: "retro_editorial_audit_missing", detail: "secret=[redacted] [path]" }]);
assert.deepEqual(publicJob.items[0].checklistValidation.contract.insertion, { id: 3021 });
assert.deepEqual(publicJob.items[0].checklistValidation.contract.expectedMedia, { mediaBasename: "ad.jpg" });
assert.equal(publicJob.items[0].checklistValidation.apiToken, undefined);
assert.equal(publicJob.items[0].retroContentProof.secret, undefined);
assert.equal(publicJob.items[0].secret, undefined);
assert.equal(publicJob.items[0].readinessAudit, undefined);

console.log("ok: candidate capture keeps canonical metadata isolated and returns authenticated checklist proof");
