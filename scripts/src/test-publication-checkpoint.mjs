import assert from "node:assert/strict";
process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { publicationCheckpointMatches, selectPublicationRecoveryCheckpoint } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const checkpoint = { insertionId: 3083, adId: 219, groupId: 11, externalKey: "ADOPS-PERRENGUE-3083", mediaBasename: "entregas.gif" };
const relation = { historicalAdminMatches: [{ adId: 219, groupId: 11, adopsInsertionId: 3083,
  adopsExternalKey: "ADOPS-PERRENGUE-3083", adopsMediaBasename: "entregas.gif" }] };
assert.equal(publicationCheckpointMatches(checkpoint, relation), true);
assert.equal(publicationCheckpointMatches(checkpoint, { historicalAdminMatches: [] }), false);
assert.equal(publicationCheckpointMatches(checkpoint, { historicalAdminMatches: [{ ...relation.historicalAdminMatches[0], groupId: 6 }] }), false);
assert.equal(publicationCheckpointMatches({ ...checkpoint, mediaBasename: "other.gif" }, relation), false);

const sourceJob = { kind: "adrotate-publish", status: "failed", payload: { insertionId: 3083, apply: true },
  result: { partialResult: { publicationCheckpoint: { ...checkpoint, state: "wp_applied" } } } };
assert.deepEqual(selectPublicationRecoveryCheckpoint(sourceJob, 3083), { ...checkpoint, state: "wp_applied" });
assert.throws(() => selectPublicationRecoveryCheckpoint(sourceJob, 3080), /publication_recovery_source_invalid/);
assert.throws(() => selectPublicationRecoveryCheckpoint({ ...sourceJob, status: "running" }, 3083), /publication_recovery_source_invalid/);
