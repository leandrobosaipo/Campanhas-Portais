import assert from "node:assert/strict";
import crypto from "node:crypto";
import { toPublicCaptureJob } from "./capture-job-progress.ts";

const job = toPublicCaptureJob({
  id: "candidate-failure",
  kind: "capture-proof-single",
  status: "failed",
  createdAt: "2026-09-29T00:00:00.000Z",
  totalTargets: 1,
  completedTargets: 0,
  failedTargets: 1,
  items: [{
    insertionId: 3021,
    targetDate: "2026-09-17",
    status: "error",
    candidateOnly: true,
    error: "secret=private-value /Users/operator/private",
    probableCause: "authorization=private-value /var/private",
    stages: [{ stage: "failed", status: "secret=private-value", startedAt: "/Users/operator/private", finishedAt: null, durationMs: 4, detail: "/tmp/private" }],
    checklistValidation: {
      approved: false,
      version: "audit-checklist-v1",
      evidenceStatus: "blocked",
      blockingIssues: [{ code: "retro_editorial_audit_missing", detail: "secret=private-value /Users/operator/private" }],
      privateField: "must not escape",
    },
  }],
});

assert.equal(job.items[0].status, "error");
assert.equal(job.items[0].error, "Não foi possível concluir a geração deste print.");
assert.equal(job.items[0].probableCause, null);
assert.deepEqual(job.items[0].stages, [{ stage: "failed", status: "unknown", startedAt: null, finishedAt: null, durationMs: 4 }]);
assert.equal(job.items[0].checklistValidation.privateField, undefined);
assert.deepEqual(job.items[0].checklistValidation.blockingIssues, [
  { code: "retro_editorial_audit_missing", detail: "secret=[redacted] [path]" },
]);
assert.equal(job.support.code, `CAPTURE-${crypto.createHash("sha256").update("candidate-failure").digest("hex").slice(0, 8).toUpperCase()}`);
