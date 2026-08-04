import assert from "node:assert/strict";
import test from "node:test";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { selectSingleMediaCandidate } = await import("../src/runner.mjs");

function operation(overrides = {}) {
  return {
    format: { normalized: "TOPO", adops: "MEGABANNER TOPO" },
    drive: {
      status: "matched",
      safeToApply: true,
      mediaMatchesFormat: true,
      sourceIdentity: { piConflict: false },
      mediaFiles: [{ id: "image-1", name: "banner.gif", kind: "image" }],
    },
    ...overrides,
  };
}

test("accepts only one safe image candidate", () => {
  const selected = selectSingleMediaCandidate(operation());
  assert.equal(selected.ok, true);
  assert.equal(selected.mediaFile.id, "image-1");
});

test("keeps multiple candidates waiting instead of guessing", () => {
  const item = operation();
  item.drive.mediaFiles.push({ id: "image-2", name: "banner-2.gif", kind: "image" });
  const selected = selectSingleMediaCandidate(item);
  assert.equal(selected.ok, false);
  assert.equal(selected.reason, "multiple_media_candidates");
});

test("blocks a PI identity conflict", () => {
  const item = operation();
  item.drive.sourceIdentity.piConflict = true;
  const selected = selectSingleMediaCandidate(item);
  assert.equal(selected.ok, false);
  assert.equal(selected.reason, "source_pi_conflict");
});

test("video positions never accept an image", () => {
  const item = operation({ format: { normalized: "VIDEO", adops: "VIDEO" } });
  const selected = selectSingleMediaCandidate(item);
  assert.equal(selected.ok, false);
  assert.equal(selected.reason, "media_not_arrived");
});
