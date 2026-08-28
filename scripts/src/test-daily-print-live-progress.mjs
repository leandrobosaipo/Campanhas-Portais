import assert from "node:assert/strict";
import {
  buildDailyPrintLiveProgress,
  normalizeDailyPrintLiveProgress,
} from "../../ops/shared/daily-print-status.mjs";

const live = buildDailyPrintLiveProgress({
  candidateInsertionIds: [2693, 2650, 2278, 2712],
  captured: [{ insertionId: 2693, status: "audited" }],
  skipped: [{ insertionId: 2650, status: "skipped_existing" }],
  failed: [{ insertionId: 2712, status: "blocked_reconstruction" }],
  runningInsertionId: 2278,
});

assert.deepEqual(live, {
  completedInsertionIds: [2693, 2650],
  runningInsertionId: 2278,
  pendingInsertionIds: [],
  failedInsertionIds: [],
  blockedInsertionIds: [2712],
});

assert.deepEqual(normalizeDailyPrintLiveProgress({
  completedInsertionIds: [1, 1, "2", -1],
  runningInsertionId: 2,
  pendingInsertionIds: [2, 3, 4],
  failedInsertionIds: [3],
  blockedInsertionIds: [4],
}), {
  completedInsertionIds: [1, 2],
  runningInsertionId: null,
  pendingInsertionIds: [],
  failedInsertionIds: [3],
  blockedInsertionIds: [4],
});

console.log("daily print live progress: passed");
