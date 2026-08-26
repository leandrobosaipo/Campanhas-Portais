import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = await readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8");
const insertions = await readFile(path.join(repoRoot, "artifacts/api-server/src/routes/insertions.ts"), "utf8");
const worker = await readFile(path.join(repoRoot, "ops/cloudflare-public-api/src/index.ts"), "utf8");

assert.match(runner, /async function enqueueAndWaitCaptureProof/);
assert.match(runner, /candidate: true,[\s\S]*?promote: true,[\s\S]*?reconstructionReason: "late_publication_recovery"/);
assert.match(runner, /runner-capture:\$\{outerJobId\}:\$\{insertionId\}:\$\{date\}/);
assert.doesNotMatch(runner.match(/async function enqueueAndWaitCaptureProof[\s\S]*?async function sendRunnerHeartbeat/)?.[0] ?? "", /randomUUID/);
assert.match(runner, /capture-proof\/jobs/);
assert.match(runner, /capture-proof\/jobs\/\$\{encodeURIComponent\(jobId\)\}/);
assert.match(runner, /30 \* 60_000/);
assert.match(runner, /\["failed", "cancelled"\]/);
assert.match(runner, /captureAt: payload\?\.captureAt \?\? null/);
assert.match(runner, /await progressJob\(outerJobId/);
assert.match(runner, /capture:\s*\{\s*status: "ok",\s*uploadedUrl: capture\.item\?\.uploadedUrl/);
assert.match(insertions, /promoteCandidate \|\| forceCapture/);
assert.match(worker, /kind === "print-backfill" \|\| kind === "print-single"/);
assert.doesNotMatch(
  runner.match(/async function executePrintBackfill[\s\S]*?async function executePrintSingle/)?.[0] ?? "",
  /privateApi\(`\/api\/insertions\/\$\{insertionId\}\/capture-proof`,/,
);
assert.doesNotMatch(
  runner.match(/async function executePrintBackfill[\s\S]*?async function executePrintSingle/)?.[0] ?? "",
  /privateApi\("\/api\/insertions\/capture-proof\/backfill-overdue"/,
);
assert.match(runner, /capture-proof\/backfill-overdue\/preview/);
assert.doesNotMatch(
  runner.match(/async function executePrintSingle[\s\S]*?async function executeEvidenceMonthlyReport/)?.[0] ?? "",
  /privateApi\(`\/api\/insertions\/\$\{payload\.insertionId\}\/capture-proof`,/,
);

console.log(JSON.stringify({ ok: true, captureMode: "async-job", terminalPolling: true }));
