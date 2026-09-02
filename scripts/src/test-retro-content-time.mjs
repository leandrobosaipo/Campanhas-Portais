import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("./capture-insertion-proof.cjs", import.meta.url), "utf8");
const {
  evaluateContentTimeline,
  evaluateRelativeContentTimeline,
  evaluateRetroCaptureGate,
  compactMetadataForPersistence,
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
  requireNoRelativeEditorialDates: true,
});
assert.equal(rejected.ok, false);
assert.ok(rejected.codes.includes("relative_content_time_unresolved"));

const liveWithAbsoluteDates = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-09-01T21:21",
  systemDateTime: "terça-feira, 01/09/2026, 21:21",
  pageDateObserved: "2026-09-01T21:21:00-04:00",
  contentDateSamples: ["01/09/2026 14:42"],
  contentRelativeTimeSamples: ["há 6 horas"],
  requireAbsoluteEditorialDates: true,
  requireNoRelativeEditorialDates: false,
});
assert.equal(liveWithAbsoluteDates.ok, true);

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

const wrongArticleDate = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-07-31T20:00:00-04:00",
  systemDateTime: "sexta-feira, 31/07/2026, 20:00",
  pageDateObserved: "2026-07-31T20:00:00-04:00",
  contentDateSamples: ["20/07/2026 19:50"],
  contentRelativeTimeSamples: [],
  requireEditorialDateMatchTarget: true,
});
assert.equal(wrongArticleDate.ok, false);
assert.equal(wrongArticleDate.contentTimeline.targetDateMatches, false);
assert.ok(wrongArticleDate.codes.includes("editorial_date_target_mismatch"));

const matchingArticleDate = evaluateRetroCaptureGate({
  requestedCaptureAt: "2026-07-31T20:00:00-04:00",
  systemDateTime: "sexta-feira, 31/07/2026, 20:00",
  pageDateObserved: "2026-07-31T20:00:00-04:00",
  contentDateSamples: ["31/07/2026 19:51"],
  contentRelativeTimeSamples: [],
  requireEditorialDateMatchTarget: true,
});
assert.equal(matchingArticleDate.ok, true);
assert.equal(matchingArticleDate.contentTimeline.targetDateMatches, true);

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

const compact = compactMetadataForPersistence({
  contentDateSamples: Array.from({ length: 30 }, (_, index) => `15/07/2026 ${index}:00`),
  contentRelativeTimeSamples: Array.from({ length: 15 }, (_, index) => `há ${index + 1} dias`),
});
assert.equal(compact.contentDateSamples.length, 25);
assert.equal(compact.contentRelativeTimeSamples.length, 10);
assert.equal(compact.contentDateSamples[0], "15/07/2026 0:00");
assert.equal(compact.contentRelativeTimeSamples[0], "há 1 dias");
assert.match(source, /shouldCollectEditorialEvidence = isHistoricalCapture/);
assert.match(source, /contentRelativeTimeSamples = isHistoricalCapture && Array\.isArray\(retroContentEvidence\.contentRelativeTimeSamples\)/);
assert.match(source, /requireAbsoluteEditorialDates: mapping\.auditConfig\?\.requireAbsoluteEditorialDates === true/);
assert.match(source, /contentRelativeTimeSamples,/);

console.log("ok: retro proofs reject unresolved relative editorial dates");
