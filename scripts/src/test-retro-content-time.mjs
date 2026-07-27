import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  evaluateContentTimeline,
  evaluateRelativeContentTimeline,
  evaluateRetroCaptureGate,
} = require("./capture-insertion-proof.cjs");

assert.equal(
  evaluateContentTimeline(["15/07/2026 16:12"], "2026-07-15T19:06").ok,
  true,
);
assert.equal(
  evaluateContentTimeline(["16/07/2026 00:01"], "2026-07-15T19:06").ok,
  false,
);

assert.deepEqual(
  evaluateRelativeContentTimeline([], true),
  { ok: true, required: true, relativeSamples: [] },
);
assert.equal(
  evaluateRelativeContentTimeline(["há 6 dias"], true).ok,
  false,
);
assert.equal(
  evaluateRelativeContentTimeline(["há 6 dias"], false).ok,
  true,
);

const rejected = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-07-15T19:06",
  systemDateTime: "quarta-feira, 15/07/2026, 19:06",
  pageDateObserved: "2026-07-15T19:06:00-04:00",
  contentDateSamples: ["15/07/2026 16:12"],
  contentRelativeTimeSamples: ["há 6 dias"],
  requireAbsoluteEditorialDates: true,
});
assert.equal(rejected.ok, false);
assert.ok(rejected.codes.includes("relative_content_time_unresolved"));

const missingAbsolute = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-07-15T19:06",
  systemDateTime: "quarta-feira, 15/07/2026, 19:06",
  pageDateObserved: "2026-07-15T19:06:00-04:00",
  contentDateSamples: [],
  contentRelativeTimeSamples: [],
  requireAbsoluteEditorialDates: true,
});
assert.equal(missingAbsolute.ok, false);
assert.ok(missingAbsolute.codes.includes("absolute_content_time_missing"));

const approved = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-07-15T19:06",
  systemDateTime: "quarta-feira, 15/07/2026, 19:06",
  pageDateObserved: "2026-07-15T19:06:00-04:00",
  contentDateSamples: ["15/07/2026 16:12", "14/07/2026 17:18"],
  contentRelativeTimeSamples: [],
  requireAbsoluteEditorialDates: true,
});
assert.equal(approved.ok, true);
assert.equal(approved.contentTimeline.maxObserved, "2026-07-15T20:12:00.000Z");
assert.equal(approved.relativeContentTimeline.ok, true);

console.log("ok: retro proofs reject unresolved relative editorial dates");
