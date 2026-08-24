import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
process.chdir(rootDir);
const { evaluateCaptureMetadata } = await import("../../artifacts/api-server/src/lib/capture-audit.ts");

function buildMetadata({
  captureClass,
  targetDate,
  requestedCaptureAt,
  contentDateSamples,
  retroContentProof = null,
  captureTime = `${targetDate}T10:00:00-04:00`,
}) {
  return {
    captureClass,
    targetDate,
    auditPolicyVersion: "audit-policy-v1",
    capturedAt: "2026-08-24T10:00:00.000Z",
    sourceJobId: "job-immutable-001",
    auditContractVersion: "audit-checklist-v1",
    requestedCaptureAt,
    systemDateTime: captureTime,
    pageDateText: captureTime,
    pageDateObserved: captureTime,
    format: "BANNER",
    siteSigla: "ROO",
    contentDateSamples,
    retroContentProof,
    mediaBasename: "creative.jpg",
    matchedMediaUrl: "https://cdn.example.com/creative.jpg",
    slotStableFrameOk: true,
    slotLegibilityOk: true,
    identityFrameOk: true,
    visualAudit: {
      viewportImagesTotal: 0,
      viewportImagesLoaded: 0,
      slotImagesTotal: 0,
      slotImagesLoaded: 0,
      viewportBackgroundsTotal: 0,
      viewportBackgroundsLoaded: 0,
      viewportVideosTotal: 0,
      viewportVideosLoaded: 0,
    },
    slotVisibility: {
      mostlyVisible: true,
      visibleRatio: 1,
    },
  };
}

test("captura do dia atual não vira retroativa no dia seguinte", () => {
  const captureDate = "2026-08-24";
  const nextDate = "2026-08-25";
  const metadata = buildMetadata({
    captureClass: "same_day_retry",
    targetDate: captureDate,
    requestedCaptureAt: `${captureDate}T10:00:00-04:00`,
    contentDateSamples: [`${nextDate}T10:00:00-04:00`],
  });

  const result = evaluateCaptureMetadata(metadata, nextDate);
  assert.equal(result.ok, true);
  assert.equal(
    result.issues.some((issue) => issue.code === "retro_content_unverified"),
    false,
  );
  assert.equal(result.captureClass, "same_day_retry");
  assert.equal(result.targetDate, captureDate);
  assert.equal(result.capturedAt, "2026-08-24T10:00:00.000Z");
  assert.equal(result.sourceJobId, "job-immutable-001");
  assert.equal(result.auditPolicyVersion, "audit-policy-v1");
});

test("proof retroativa exigida apenas para historical_recovery", () => {
  const targetDate = "2026-08-24";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T10:00:00-04:00`,
    contentDateSamples: ["2026-08-25T10:00:00-04:00"],
    retroContentProof: {
      status: "missing",
      issues: [{ code: "missing_retro", detail: "missing" }],
    },
  });

  const result = evaluateCaptureMetadata(metadata, targetDate);
  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === "retro_content_unverified" || issue.code === "missing_retro"),
    true,
  );
});

test("registro histórico preserva classificação com targetDate persistido", () => {
  const captureDate = "2026-08-24";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate: captureDate,
    requestedCaptureAt: `${captureDate}T10:00:00-04:00`,
    retroContentProof: {
      status: "approved",
      issues: [],
    },
    contentDateSamples: [`${captureDate}T10:00:00-04:00`],
  });

  const result = evaluateCaptureMetadata(metadata, captureDate);
  assert.equal(result.ok, true);
  assert.equal(result.captureClass, "historical_recovery");
  assert.equal(result.targetDate, captureDate);
  assert.equal(result.sourceJobId, "job-immutable-001");
  assert.equal(result.auditPolicyVersion, "audit-policy-v1");
});
