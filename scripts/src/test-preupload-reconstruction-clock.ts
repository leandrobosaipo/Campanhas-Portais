import assert from "node:assert/strict";
import test from "node:test";
import type { AuditChecklistValidation } from "../../artifacts/api-server/src/lib/audit-checklist.ts";
import { evaluateCaptureMetadata } from "../../artifacts/api-server/src/lib/capture-audit.ts";

// Importing the route initializes the pool, but this pure regression makes no DB calls.
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
const { validatePreUploadReconstructionClock } = await import("../../artifacts/api-server/src/routes/audit-checklists.ts");
const now = new Date("2026-09-15T04:00:00.000Z");
const targetDate = "2026-09-12";
const metadata = {
  captureClass: "historical_recovery",
  targetDate,
  sourceJobId: "untrusted-request-job",
  auditPolicyVersion: "audit-policy-v1",
  capturedAt: now.toISOString(),
  requestedCaptureAt: `${targetDate}T21:53:00-04:00`,
  systemDateTime: "sábado, 12/09/2026, 21:53",
  pageDateText: `${targetDate}T21:53:00-04:00`,
  reconstruction: {
    provenanceVersion: 2,
    reason: "late_publication_recovery",
    contractedDate: targetDate,
    reconstructedAt: "2026-09-15T03:59:00.000Z",
    mediaUrl: "https://cdn.example.com/canonical.gif",
  },
};
const audit = evaluateCaptureMetadata({
  requestedCaptureAt: metadata.requestedCaptureAt,
  systemDateTime: metadata.systemDateTime,
  pageDateText: metadata.pageDateText,
}, targetDate, now);
assert(audit.issues.some((issue) => issue.code === "desktop_time_mismatch"));

const baseline = {
  approved: false,
  preliminary: true,
  version: "audit-checklist-v1",
  insertionId: 2979,
  date: targetDate,
  contract: {
    ok: true,
    period: { inPeriod: true },
    expectedMedia: { mediaUrl: metadata.reconstruction.mediaUrl },
    resolvedRule: { auditConfig: { allowAuditedReconstruction: true } },
  },
  metadataPresent: true,
  audit,
  issues: [],
  blockingIssues: [{ code: "metadata_desktop_time_mismatch", gate: "captureMetadata", severity: "blocking", label: "Clock mismatch", detail: "Contracted day differs from actual capture" }],
  warnings: [],
  evidenceStatus: "blocked",
} as unknown as AuditChecklistValidation;

test("historical screenshot clock clears only its preliminary mismatch, without minting provenance", () => {
  const result = validatePreUploadReconstructionClock(baseline, metadata, now);
  assert.equal(result.approved, true);
  assert.equal(result.preliminary, true);
  assert.equal(result.audit, audit, "canonical audit must not be replaced or made trusted");
  assert.equal(result.audit?.ok, false);
  assert.equal(result.blockingIssues.length, 0);
  assert.equal(result.warnings[0]?.code, "preupload_reconstruction_clock_checked");
  assert.equal(baseline.approved, false, "input validation is preserved");
  assert.equal(evaluateCaptureMetadata(metadata, targetDate, now).ok, false, "the same raw request still fails final persisted provenance");
});

test("untrusted timestamps, wrong historical desktop clock and invalid reconstruction identity remain blocked", () => {
  for (const reconstruction of [
    { ...metadata.reconstruction, reconstructedAt: "2026-09-15T03:44:59.000Z" },
    { ...metadata.reconstruction, reconstructedAt: "2026-09-15T04:15:01.000Z" },
    { ...metadata.reconstruction, reconstructedAt: "2026-09-12T21:53:00-04:00" },
    { ...metadata.reconstruction, reconstructedAt: "invalid" },
    { ...metadata.reconstruction, reconstructedAt: "2026-09-15T03:59:00" },
    { ...metadata.reconstruction, contractedDate: "2026-09-11" },
    { ...metadata.reconstruction, mediaUrl: "https://cdn.example.com/other.gif" },
  ]) {
    const result = validatePreUploadReconstructionClock(baseline, { ...metadata, capturedAt: reconstruction.reconstructedAt, reconstruction }, now);
    assert.equal(result.approved, false);
    assert(result.blockingIssues.some((issue) => issue.code === "preupload_reconstruction_clock_invalid"));
  }
  assert.equal(validatePreUploadReconstructionClock(baseline, { ...metadata, systemDateTime: "terça-feira, 15/09/2026, 03:59" }, now).approved, false);
  assert.equal(validatePreUploadReconstructionClock(baseline, { ...metadata, captureClass: "scheduled" }, now).approved, false);
});

test("other gates, canonical opt-out and final phase are never bypassed", () => {
  const otherGate = { ...baseline.blockingIssues[0]!, code: "metadata_page_time_mismatch" };
  const result = validatePreUploadReconstructionClock({ ...baseline, blockingIssues: [...baseline.blockingIssues, otherGate] }, metadata, now);
  assert.equal(result.approved, false);
  assert.deepEqual(result.blockingIssues, [otherGate]);
  const denied = structuredClone(baseline);
  if (denied.contract.ok) denied.contract.resolvedRule.auditConfig.allowAuditedReconstruction = false;
  assert.equal(validatePreUploadReconstructionClock(denied, metadata, now).approved, false);
  const final = { ...baseline, preliminary: false };
  assert.equal(validatePreUploadReconstructionClock(final, metadata, now), final);
  assert.equal(validatePreUploadReconstructionClock(baseline, { ...metadata, reconstruction: undefined }, now), baseline);
});
