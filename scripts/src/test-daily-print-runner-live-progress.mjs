import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(source, /buildDailyPrintLiveProgress/);
assert.match(source, /candidateInsertionIds/);
assert.match(source, /liveProgress/);
assert.match(source, /itemsDone:\s*captured\.length \+ skipped\.length \+ failed\.length/);
assert.match(source, /percentTotal/);
assert.match(source, /const publishLiveProgress = async[\s\S]*?try \{[\s\S]*?await progressJob[\s\S]*?\} catch \(error\) \{[\s\S]*?console\.warn\(`\[runner\] progresso diário não publicado/);
assert.match(source, /catch \(error\) \{[\s\S]*?failed\.push\([\s\S]*?\n    \}\n    await publishLiveProgress\(null, \{ insertionId \}\);/);

const progressStart = source.indexOf("const jobProgressResults = new Map();");
const progressEnd = source.indexOf("function normalizePiDigits", progressStart);
assert.ok(progressStart >= 0 && progressEnd > progressStart, "helpers de progresso devem ser extraíveis");
const requests = [];
const context = {
  Map,
  RUNNER_ID: "test-runner",
  encodeURIComponent,
  request: async (_path, init) => requests.push(JSON.parse(init.body)),
};
vm.runInNewContext(`${source.slice(progressStart, progressEnd)}\nglobalThis.progressJob = progressJob;`, context, { filename: "runner-progress.js" });
await context.progressJob("job-1", {
  stage: "capture_async_dispatch",
  liveProgress: { completedInsertionIds: [2713] },
});
await context.progressJob("job-1", { stage: "capture_async_wait", captureStatus: "running" });
await context.progressJob("job-1", { stage: "heartbeat", heartbeatAt: "2026-08-27T12:00:00.000Z" });
assert.deepEqual(requests.map((call) => call.result.liveProgress), [
  { completedInsertionIds: [2713] },
  { completedInsertionIds: [2713] },
  { completedInsertionIds: [2713] },
]);
console.log("daily print runner live progress: passed");
