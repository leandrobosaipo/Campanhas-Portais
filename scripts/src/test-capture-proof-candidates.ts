import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import {
  inspectCandidateJob,
  stableJson,
  validateCandidateMetadata,
  validateCandidateReadback,
} from "../../artifacts/api-server/src/lib/capture-proof-candidate-provenance.mjs";

const require = createRequire(import.meta.url);
const capture = require("./capture-insertion-proof.cjs") as {
  assertInsertionOperable: (insertion: Record<string, unknown>) => void;
};

const jobId = "1790894999713-zz1efr";
const insertionId = 3024;
const targetDate = "2026-09-08";
const capturedAt = "2026-10-01T22:50:57.930Z";
const captureStageStartedAt = "2026-10-01T22:50:55.347Z";
const captureStageFinishedAt = "2026-10-01T22:50:57.930Z";
const uploadedAt = "2026-10-01T22:51:21.749Z";
const artifactUrl = `https://perrenguematogrosso.nyc3.digitaloceanspaces.com/app/uploads/SETEMBRO-2026/1040/3024/candidates/${jobId}/AFL_PRESTACAODECONTAS_PRESTACAODEC_PI91381_2026-09-08_MEGA_TOPO.png?v=1790895080160`;
const metadata = {
  sourceJobId: jobId,
  insertionId,
  targetDate,
  capturedAt,
  captureClass: "historical_recovery",
  requestedCaptureAt: "2026-09-08T18:40:00-04:00",
  auditPolicyVersion: "audit-policy-v1",
  historicalDisplayConfirmed: false,
  reconstruction: { provenanceVersion: 3, reconstructedAt: capturedAt, historicalDisplayConfirmed: false },
};
function fixture() {
  return {
    id: jobId,
    kind: "capture-proof-single",
    status: "completed",
    startedAt: "2026-10-01T22:49:59.902Z",
    finishedAt: "2026-10-01T22:51:24.179Z",
    payload: { targets: [{ insertionId, targetDate, candidateOnly: true, captureAt: "2026-09-08T18:40:00-04:00" }] },
    items: [{
      insertionId,
      targetDate,
      status: "ok",
      candidateOnly: true,
      uploadedUrl: artifactUrl,
      stages: [
        { stage: "slot_captured", status: "ok", startedAt: captureStageStartedAt, finishedAt: captureStageFinishedAt },
        { stage: "uploaded", status: "ok", finishedAt: uploadedAt },
      ],
    }],
  };
}

test("correlates candidate to persisted local print job, slot timestamp and exact candidate path", () => {
  const result = inspectCandidateJob(fixture(), insertionId, targetDate);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.jobId, jobId);
  assert.equal(result.captureStageFinishedAt, captureStageFinishedAt);
  assert.equal(result.uploadedAt, uploadedAt);
  assert.equal(result.artifactUrl.toString(), artifactUrl);
  assert.equal(validateCandidateMetadata(metadata, { jobId, insertionId, targetDate, captureStageStartedAt, captureStageFinishedAt, requestedCaptureAt: "2026-09-08T18:40:00-04:00" }).ok, true);
});

test("accepts v4 candidate provenance without weakening job, slot, or requested-clock identity", () => {
  const identity = { jobId, insertionId, targetDate, captureStageStartedAt, captureStageFinishedAt, requestedCaptureAt: metadata.requestedCaptureAt };
  const v4 = {
    ...metadata,
    reconstruction: { ...metadata.reconstruction, provenanceVersion: 4 },
  };
  assert.equal(validateCandidateMetadata(v4, identity).ok, true);
  assert.equal(validateCandidateMetadata({ ...v4, requestedCaptureAt: "2026-09-08T18:41:00-04:00" }, identity).ok, false);
  assert.equal(validateCandidateMetadata({ ...v4, sourceJobId: "another-job" }, identity).ok, false);
});

test("keeps the v4 slot capture stage open through the final native video recapture", () => {
  const captureSource = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "capture-insertion-proof.cjs"), "utf8");
  const sourceFile = ts.createSourceFile("capture-insertion-proof.cjs", captureSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const calls: { nativeAudit: ts.CallExpression[]; slotFinish: ts.CallExpression[]; finalComposeStart: ts.CallExpression[] } = {
    nativeAudit: [],
    slotFinish: [],
    finalComposeStart: [],
  };
  const isPropertyCall = (node: ts.Node, object: string, property: string): node is ts.CallExpression => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
    return ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === object
      && node.expression.name.text === property;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "auditNativeVideoProgress") {
      calls.nativeAudit.push(node);
    }
    const firstArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (isPropertyCall(node, "trace", "finish") && firstArgument && ts.isIdentifier(firstArgument) && firstArgument.text === "slotCapturedStage") {
      calls.slotFinish.push(node);
    }
    if (isPropertyCall(node, "trace", "start") && firstArgument && ts.isStringLiteral(firstArgument) && firstArgument.text === "final_composed") {
      calls.finalComposeStart.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const nativeAuditCall = calls.nativeAudit.at(-1);
  const slotFinishCall = calls.slotFinish.at(-1);
  const finalComposeStartCall = calls.finalComposeStart.at(-1);
  assert.ok(nativeAuditCall && slotFinishCall && finalComposeStartCall, "capture stage, native audit and final composition calls must be present");
  assert.ok(nativeAuditCall.getStart(sourceFile) < slotFinishCall.getStart(sourceFile),
    "slot_captured must finish after the last native video recapture and measurement");
  assert.ok(slotFinishCall.getStart(sourceFile) < finalComposeStartCall.getStart(sourceFile),
    "slot_captured must finish before final_composed starts");

  const realCaptureInstant = "2026-10-07T09:00:07.378Z";
  const v4 = {
    ...metadata,
    capturedAt: realCaptureInstant,
    reconstruction: { provenanceVersion: 4, reconstructedAt: realCaptureInstant, historicalDisplayConfirmed: false },
  };
  const identity = {
    jobId, insertionId, targetDate,
    captureStageStartedAt: "2026-10-07T09:00:00.000Z",
    captureStageFinishedAt: "2026-10-07T09:00:05.307Z",
    requestedCaptureAt: metadata.requestedCaptureAt,
  };
  assert.equal(validateCandidateMetadata(v4, identity).ok, false,
    "a stage closed before the real final capture instant must be rejected");
  assert.equal(validateCandidateMetadata(v4, { ...identity, captureStageFinishedAt: "2026-10-07T09:00:07.500Z" }).ok, true,
    "the same candidate is valid when slot_captured encloses its actual capture instant");
});

test("blocks only explicitly archived or superseded insertions before capture setup", () => {
  assert.doesNotThrow(() => capture.assertInsertionOperable({ id: 1, archivedAt: null, supersededByInsertionId: null }));
  assert.doesNotThrow(() => capture.assertInsertionOperable({ id: 2 }));
  assert.throws(() => capture.assertInsertionOperable({ id: 3, archivedAt: "2026-08-07T12:00:00.000Z" }), /insertion_not_operable/);
  assert.throws(() => capture.assertInsertionOperable({ id: 4, supersededByInsertionId: 1841 }), /insertion_not_operable/);

  const captureSource = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "capture-insertion-proof.cjs"), "utf8");
  const fetchAt = captureSource.indexOf("const insertion = await fetchInsertion(args.apiBase, args.insertionId);");
  const guardAt = captureSource.indexOf("assertInsertionOperable(insertion);", fetchAt);
  const mappingAt = captureSource.indexOf("const mapping = await getMapping(insertion, args.apiBase);", fetchAt);
  const launchAt = captureSource.indexOf("const browser = await chromium.launch(launchOptions);", fetchAt);
  assert.ok(fetchAt >= 0 && guardAt > fetchAt && mappingAt > guardAt && launchAt > guardAt,
    "operability must be checked after insertion readback and before mapping or browser launch");
});

test("blocks forged job identity, timestamps, non-candidate paths and metadata provenance", () => {
  const wrongTarget = inspectCandidateJob(fixture(), insertionId + 1, targetDate);
  assert.equal(wrongTarget.ok, false);
  const forgedClock = fixture();
  forgedClock.items[0]!.stages[0]!.startedAt = "2026-10-01T22:50:59.000Z";
  assert.equal(inspectCandidateJob(forgedClock, insertionId, targetDate).ok, false);
  const wrongPath = fixture();
  wrongPath.items[0]!.uploadedUrl = artifactUrl.replace(`/candidates/${jobId}/`, `/evidences/${jobId}/`);
  assert.equal(inspectCandidateJob(wrongPath, insertionId, targetDate).ok, false);
  const identity = { jobId, insertionId, targetDate, captureStageStartedAt, captureStageFinishedAt, requestedCaptureAt: "2026-09-08T18:40:00-04:00" };
  assert.equal(validateCandidateMetadata({ ...metadata, capturedAt: "2026-09-08T18:40:00-04:00" }, identity).ok, false);
  assert.equal(validateCandidateMetadata({ ...metadata, requestedCaptureAt: "2026-09-08T18:41:00-04:00" }, identity).ok, false);
  assert.equal(validateCandidateMetadata({ ...metadata, reconstruction: { provenanceVersion: 2, historicalDisplayConfirmed: false } }, identity).ok, false);
  assert.equal(validateCandidateMetadata({ ...metadata, reconstruction: { provenanceVersion: 3, historicalDisplayConfirmed: true } }, identity).ok, false);
  const stageBoundedClock = { ...metadata, capturedAt: "2026-10-01T23:05:43.954Z", reconstruction: { ...metadata.reconstruction, reconstructedAt: "2026-10-01T23:05:43.954Z" } };
  assert.equal(validateCandidateMetadata(stageBoundedClock, {
    jobId, insertionId, targetDate,
    captureStageStartedAt: "2026-10-01T23:05:43.291Z",
    captureStageFinishedAt: "2026-10-01T23:05:43.955Z",
    requestedCaptureAt: "2026-09-08T18:40:00-04:00",
  }).ok, true);
  assert.equal(validateCandidateMetadata(stageBoundedClock, {
    jobId, insertionId, targetDate,
    captureStageStartedAt: "2026-10-01T23:05:43.955Z",
    captureStageFinishedAt: "2026-10-01T23:05:43.955Z",
    requestedCaptureAt: "2026-09-08T18:40:00-04:00",
  }).ok, false);
});

test("readback decision stays bound to stored bytes, URL, metadata and trusted capture time", () => {
  const candidate = {
    artifactSha256: "a".repeat(64), artifactBytes: 4096, artifactUrl,
    capturedAt: new Date(capturedAt), metadata,
  };
  const actual = { sha256: "a".repeat(64), bytes: 4096, artifactUrl, capturedAt, metadata: { ...metadata } };
  assert.equal(validateCandidateReadback(candidate, actual), true);
  assert.equal(validateCandidateReadback(candidate, { ...actual, sha256: "b".repeat(64) }), false);
  assert.equal(validateCandidateReadback(candidate, { ...actual, bytes: 4097 }), false);
  assert.equal(validateCandidateReadback(candidate, { ...actual, artifactUrl: `${artifactUrl}&other=1` }), false);
  assert.equal(validateCandidateReadback(candidate, { ...actual, capturedAt: "2026-10-01T22:50:58.000Z" }), false);
  assert.equal(validateCandidateReadback(candidate, { ...actual, metadata: { ...metadata, targetDate: "2026-09-09" } }), false);
  assert.equal(stableJson({ b: 2, a: { y: 1, x: 0 } }), stableJson({ a: { x: 0, y: 1 }, b: 2 }));
});
