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
  sourceJobId = "job-immutable-001",
  capturedAt = "2026-08-24T10:00:00.000Z",
  auditPolicyVersion = "audit-policy-v1",
  captureTime = `${targetDate}T10:00:00-04:00`,
}: {
  captureClass: string | null;
  targetDate: string;
  requestedCaptureAt: string;
  contentDateSamples: string[];
  retroContentProof?: unknown;
  sourceJobId?: string | null;
  capturedAt?: string | null;
  auditPolicyVersion?: string | null;
  captureTime?: string;
}) {
  return {
    captureClass,
    targetDate,
    auditPolicyVersion,
    capturedAt,
    sourceJobId,
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

test("captura do dia contratado pode ser reavaliada no dia seguinte sem virar retroativa", () => {
  const captureDate = "2026-08-24";
  const nextDate = "2026-08-25";
  const metadata = buildMetadata({
    captureClass: "scheduled",
    targetDate: captureDate,
    requestedCaptureAt: `${captureDate}T10:00:00-04:00`,
    contentDateSamples: [`${captureDate}T10:00:00-04:00`],
  });

  const result = evaluateCaptureMetadata(metadata, captureDate, new Date(`${nextDate}T08:00:00-04:00`));
  assert.equal(result.ok, true);
  assert.equal(result.targetDate, captureDate);
  assert.equal(result.captureClass, "scheduled");
  assert.equal(result.issues.some((issue) => issue.code === "content_time_mismatch"), false);
});

test("empty_samples permitido para scheduled e same_day_retry", () => {
  const targetDate = "2026-08-24";
  const requestedCaptureAt = `${targetDate}T10:00:00-04:00`;

  for (const captureClass of ["scheduled", "same_day_retry"] as const) {
    const metadata = buildMetadata({
      captureClass,
      targetDate,
      requestedCaptureAt,
      contentDateSamples: [],
    });

    const result = evaluateCaptureMetadata(metadata, targetDate, new Date(`${targetDate}T12:00:00-04:00`));
    assert.equal(result.ok, true);
    assert.equal(result.captureClass, captureClass);
    assert.equal(result.issues.some((issue) => issue.code === "retro_content_unverified"), false);
  }
});

test("future_samples é rejeitado para scheduled/same_day_retry/historical_recovery", () => {
  const captureDate = "2026-08-24";
  const nextDate = "2026-08-25";
  const requestedCaptureAt = `${captureDate}T10:00:00-04:00`;

  for (const captureClass of ["scheduled", "same_day_retry", "historical_recovery"] as const) {
    const metadata = buildMetadata({
      captureClass,
      targetDate: captureDate,
      requestedCaptureAt,
      contentDateSamples: [`${nextDate}T10:00:00-04:00`],
    });

    const result = evaluateCaptureMetadata(metadata, captureDate, new Date(`${captureDate}T12:00:00-04:00`));
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "content_time_mismatch"), true);
    assert.equal(
      result.issues.some((issue) => issue.code === "capture_class_capture_at_date_mismatch"),
      false,
    );
  }
});

test("falha explícita quando campos críticos de contrato estão ausentes/inválidos", () => {
  const targetDate = "2026-08-24";
  const requestedCaptureAt = `${targetDate}T10:00:00-04:00`;

  const sourceJobMissing = evaluateCaptureMetadata(
    buildMetadata({
      captureClass: "scheduled",
      targetDate,
      requestedCaptureAt,
      contentDateSamples: [`${targetDate}T10:00:00-04:00`],
      sourceJobId: null,
    }),
    targetDate,
    new Date(`${targetDate}T12:00:00-04:00`),
  );
  assert.equal(sourceJobMissing.ok, false);
  assert.equal(sourceJobMissing.issues.some((issue) => issue.code === "capture_class_source_job_missing"), true);

  const policyMissing = evaluateCaptureMetadata(
    buildMetadata({
      captureClass: "scheduled",
      targetDate,
      requestedCaptureAt,
      contentDateSamples: [`${targetDate}T10:00:00-04:00`],
      auditPolicyVersion: "legacy-policy",
    }),
    targetDate,
    new Date(`${targetDate}T12:00:00-04:00`),
  );
  assert.equal(policyMissing.ok, false);
  assert.equal(policyMissing.issues.some((issue) => issue.code === "capture_class_policy_version_unknown"), true);

  const targetDateMismatch = evaluateCaptureMetadata(
    buildMetadata({
      captureClass: "scheduled",
      targetDate: "2026-08-25",
      requestedCaptureAt,
      contentDateSamples: [`${targetDate}T10:00:00-04:00`],
      capturedAt: "2026-08-25T10:00:00.000Z",
    }),
    targetDate,
    new Date(`${targetDate}T12:00:00-04:00`),
  );
  assert.equal(targetDateMismatch.ok, false);
  assert.equal(targetDateMismatch.issues.some((issue) => issue.code === "capture_class_target_date_mismatch"), true);
});
