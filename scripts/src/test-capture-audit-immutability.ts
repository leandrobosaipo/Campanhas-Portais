import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
process.chdir(rootDir);
const { attachServerCaptureProvenance, evaluateCaptureMetadata, evaluateFinalPageClockProof } = await import("../../artifacts/api-server/src/lib/capture-audit.ts");

test("relógio final exige texto visível, bounds e pixels correlacionados sem reclassificar canônicos legados", () => {
  const metadata: any = buildMetadata({ captureClass: "historical_recovery", targetDate: "2026-08-24",
    requestedCaptureAt: "2026-08-24T21:15:00-04:00", captureTime: "24/08/2026 21:15",
    capturedAt: "2026-10-07T04:00:00Z", contentDateSamples: [],
    reconstruction: { provenanceVersion: 4, reason: "late_publication_recovery", contractedDate: "2026-08-24",
      mediaUrl: "https://cdn.example.com/creative.jpg", reconstructedAt: "2026-10-07T04:00:00Z" } });
  metadata.chromeFrameHeight = 200;
  metadata.visiblePageDateAudit = { version: 2, source: "final_viewport_page_clock", ok: true, skipped: false,
    requestedCaptureAt: metadata.requestedCaptureAt, renderedText: "24/08/2026 21:15",
    box: { x: 10, y: 20, width: 220, height: 25 }, viewport: { width: 1660, height: 3000, scrollX: 0, scrollY: 0 },
    fullyInsideViewport: true, effectiveVisible: true, occlusion: "clear",
    pixelAudit: { source: "auditFinalPngSlotPixels_page_clock_roi", comparedTo: "viewportPng_page_clock_roi",
      ok: true, issues: [], slotBox: { left: 10, top: 20, width: 220, height: 25 }, pixelScale: 2,
      cropBox: { left: 20, top: 240, width: 440, height: 50 }, cropSize: { width: 440, height: 50 },
      similarityScore: 1, minSimilarity: 0.82, finalCropMeanStddev: 20, finalCropMinContentStddev: 4 } };
  const evaluate = (m: any, required = true) => evaluateCaptureMetadata(m, "2026-08-24", new Date("2026-10-07T04:01:00Z"), { finalPageClockRequired: required });
  assert.equal(evaluateFinalPageClockProof(metadata).ok, true);
  assert.equal(evaluate(metadata).ok, true, JSON.stringify(evaluate(metadata).issues));
  for (const mutate of [
    (m: any) => { delete m.visiblePageDateAudit; },
    (m: any) => { m.visiblePageDateAudit.version = 1; },
    (m: any) => { m.visiblePageDateAudit.renderedText = "24/08/2026"; },
    (m: any) => { m.visiblePageDateAudit.renderedText = "24/08/2026 20:15"; },
    (m: any) => { m.visiblePageDateAudit.requestedCaptureAt = "2026-08-23T21:15"; },
    (m: any) => { m.visiblePageDateAudit.box.y = -1; },
    (m: any) => { m.visiblePageDateAudit.box.y = 2990; },
    (m: any) => { m.visiblePageDateAudit.viewport.height = 0; },
    (m: any) => { m.visiblePageDateAudit.effectiveVisible = false; },
    (m: any) => { m.visiblePageDateAudit.occlusion = "page_element_target"; },
    (m: any) => { m.visiblePageDateAudit.skipped = true; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.minSimilarity = 0.48; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.similarityScore = 0.4; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.slotBox.top = 21; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.cropBox.top = 0; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.finalCropMeanStddev = 0; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.finalCropMinContentStddev = 0.01; },
    (m: any) => { m.visiblePageDateAudit.pixelAudit.issues = [{ code: "tampered" }]; },
    (m: any) => { m.requiredGates = { requireVisiblePageDate: false }; delete m.visiblePageDateAudit; },
  ]) {
    const changed = structuredClone(metadata); mutate(changed);
    assert.equal(evaluate(changed).issues.some(i => i.code === "final_page_clock_unverified"), true);
    assert.equal(evaluate(changed).ok, false);
  }
  const legacy = structuredClone(metadata); delete legacy.visiblePageDateAudit;
  attachServerCaptureProvenance(legacy, { targetDate: "2026-08-24", sourceJobId: "job-immutable-001", capturedAt: "2026-10-07T04:00:00Z", uploadedUrl: "https://cdn.example.com/evidence.png" });
  assert.equal(evaluate(legacy, false).ok, true);
  for (const provenanceVersion of [2, 3]) {
    legacy.reconstruction.provenanceVersion = provenanceVersion;
    assert.equal(evaluate(legacy).issues.some(i => i.code === "final_page_clock_unverified"), false);
  }
});

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
  trusted = true,
  reconstruction = null,
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
  trusted?: boolean;
  reconstruction?: unknown;
}) {
  const metadata = {
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
    reconstruction,
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
  if (!trusted || !sourceJobId || !capturedAt) return metadata;
  return attachServerCaptureProvenance(metadata, {
    targetDate,
    sourceJobId,
    capturedAt,
    uploadedUrl: "https://cdn.example.com/evidence.png",
  });
}

test("ROO com fonte parcial exige prova editorial completa na auditoria final", () => {
  const targetDate = "2026-08-24";
  const requestedCaptureAt = `${targetDate}T10:00:00-04:00`;
  const metadata: any = buildMetadata({
    captureClass: "historical_recovery", targetDate, requestedCaptureAt,
    contentDateSamples: Array(3).fill(`${targetDate}T09:00:00-04:00`),
    capturedAt: "2026-10-07T04:00:00Z", captureTime: requestedCaptureAt,
    reconstruction: { provenanceVersion: 4, reconstructedAt: "2026-10-07T04:00:00Z",
      sourceEvidence: { proofScope: "position_only", sourceEditorialProofStatus: "missing_legacy" } },
    retroContentProof: { status: "approved", expectedCount: 3, visibleMatchCount: 3,
      minimumRequired: 3, futureCount: 0, manifestHash: "a".repeat(64) },
  });
  metadata.format = "MEGABANNER TOPO";
  metadata.slotSelector = ".g.g-1";
  metadata.contextSelector = ".g.g-1";
  metadata.pageLabel = "Home";
  metadata.pageUrl = "https://roonoticias.com/";
  const posts = [1, 2, 3].map(id => ({ url: `https://roonoticias.com/news-${id}/`, date: `${targetDate}T09:00:00-04:00` }));
  metadata.retroContentManifest = { expectedPosts: structuredClone(posts), visiblePosts: structuredClone(posts) };
  metadata.editorialSamples = structuredClone(posts);
  const audit = (value: any) => evaluateCaptureMetadata(value, targetDate, new Date("2026-10-07T04:01:00Z"));
  assert.equal(audit(metadata).issues.some(issue => issue.code === "partial_source_editorial_unverified"), false);
  assert.equal(audit(metadata).ok, true, JSON.stringify(audit(metadata).issues));
  for (const change of [
    (m: any) => { m.retroContentProof.expectedCount = 2; },
    (m: any) => { m.retroContentProof.visibleMatchCount = 2; },
    (m: any) => { m.retroContentProof.minimumRequired = 2; },
    (m: any) => { m.contentDateSamples = [m.contentDateSamples[0]]; },
    (m: any) => { m.retroContentProof.futureCount = 1; },
    (m: any) => { m.retroContentProof.manifestHash = "invalid"; },
    (m: any) => { m.retroContentProof.status = "rejected"; },
    (m: any) => { m.reconstruction.sourceEvidence.sourceEditorialProofStatus = "approved"; },
    (m: any) => { m.siteSigla = "OMT"; },
    (m: any) => { m.reconstruction.provenanceVersion = 3; },
    (m: any) => { m.retroContentManifest.expectedPosts = m.retroContentManifest.expectedPosts.slice(0, 2); },
    (m: any) => { m.editorialSamples = m.editorialSamples.slice(0, 2); },
    (m: any) => { m.editorialSamples[0].date = "2026-08-25T09:00:00-04:00"; },
    (m: any) => { m.editorialSamples[0].url = "https://example.com/foreign/"; },
    (m: any) => { m.editorialSamples.push({ url: "https://roonoticias.com/future/", date: "2026-08-25T09:00:00-04:00" }); },
    (m: any) => { m.retroContentManifest.expectedPosts[0].date = "2026-08-25T09:00:00-04:00"; },
    (m: any) => { m.retroContentProof.expectedCount = "3"; },
  ]) {
    const changed = structuredClone(metadata);
    change(changed);
    const result = audit(changed);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.code === "partial_source_editorial_unverified"));
  }
});

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

  const sourceJobMissingMetadata = buildMetadata({
      captureClass: "scheduled",
      targetDate,
      requestedCaptureAt,
      contentDateSamples: [`${targetDate}T10:00:00-04:00`],
      sourceJobId: null,
      trusted: false,
    });
  attachServerCaptureProvenance(sourceJobMissingMetadata, {
    targetDate,
    sourceJobId: "persisted-job",
    capturedAt: "2026-08-24T14:00:00.000Z",
    uploadedUrl: "https://cdn.example.com/evidence.png",
  });
  const sourceJobMissing = evaluateCaptureMetadata(
    sourceJobMissingMetadata,
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

test("metadata autodeclarada ou job não correlacionado nunca autoriza scheduled", () => {
  const targetDate = "2026-08-24";
  const requestedCaptureAt = `${targetDate}T10:00:00-04:00`;
  const untrusted = buildMetadata({
    captureClass: "scheduled",
    targetDate,
    requestedCaptureAt,
    contentDateSamples: [],
    trusted: false,
  });
  const result = evaluateCaptureMetadata(untrusted, targetDate, new Date(`${targetDate}T12:00:00-04:00`));
  assert.equal(result.ok, false);
  assert.equal(result.captureClass, null);
  assert.equal(result.issues.some((issue) => issue.code === "capture_class_target_date_missing"), true);
});

test("histórico confiável sem prova retroativa continua bloqueado", () => {
  const targetDate = "2026-08-22";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T10:00:00-04:00`,
    captureTime: `${targetDate}T10:00:00-04:00`,
    capturedAt: "2026-08-24T14:00:00.000Z",
    contentDateSamples: [],
  });
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T15:00:00.000Z"));
  assert.equal(result.ok, false);
  assert.equal(result.captureClass, "historical_recovery");
  assert.equal(result.issues.some((issue) => issue.code === "retro_content_unverified"), true);
});

test("reconstrução tardia autorizada aceita timeline vazia sem fingir snapshot editorial", () => {
  const targetDate = "2026-08-23";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: `${targetDate}T20:40:00-04:00`,
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      provenanceVersion: 2,
      contractedDate: targetDate,
      reconstructedAt: "2026-08-24T15:00:00.000Z",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  metadata.pageDateText = `${targetDate}T20:40:00-04:00`;
  metadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T16:00:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.issues.some((issue) => issue.code === "retro_content_unverified"), false);
});

test("reconstrução tardia exige relógio real e timestamp coerente com a captura persistida", () => {
  const targetDate = "2026-08-23";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: "2026-08-24T15:00:00.000Z",
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      provenanceVersion: 2,
      contractedDate: targetDate,
      reconstructedAt: "2026-08-23T20:40:00.000-04:00",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T16:00:00.000Z"));
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "reconstruction_provenance_invalid"), true);
});

test("reconstrução histórica v2 preserva relógio contratado", () => {
  const targetDate = "2026-08-23";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: `${targetDate}T20:40:00-04:00`,
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [`${targetDate}T18:00:00-04:00`],
    reconstruction: {
      reason: "historical_recovery",
      provenanceVersion: 2,
      contractedDate: targetDate,
      reconstructedAt: "2026-08-24T15:00:00.000Z",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  metadata.pageDateText = `${targetDate}T20:40:00-04:00`;
  metadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T16:00:00.000Z"));
  assert.equal(result.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
});

test("reconstrução histórica v2 continua rejeitando relógio real no lugar do contratado", () => {
  const targetDate = "2026-08-23";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: "segunda-feira, 24/08/2026, 11:00",
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      provenanceVersion: 2,
      contractedDate: targetDate,
      reconstructedAt: "2026-08-24T15:00:00.000Z",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  metadata.pageDateText = `${targetDate}T20:40:00-04:00`;
  metadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T16:00:00.000Z"));
  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "desktop_time_mismatch"), true);
});

test("versão 2 mantém exatamente a classificação histórica do relógio", () => {
  const targetDate = "2026-08-23";
  const base = {
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [],
    reconstruction: {
      reason: "historical_recovery",
      provenanceVersion: 2,
      contractedDate: targetDate,
      reconstructedAt: "2026-08-24T15:00:00.000Z",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  };
  const contracted = buildMetadata({ ...base, captureTime: `${targetDate}T20:40:00-04:00` });
  const actual = buildMetadata({ ...base, captureTime: "segunda-feira, 24/08/2026, 11:00" });
  for (const metadata of [contracted, actual]) {
    metadata.pageDateText = `${targetDate}T20:40:00-04:00`;
    metadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  }
  const now = new Date("2026-08-24T15:01:00.000Z");
  const contractedAudit = evaluateCaptureMetadata(contracted, targetDate, now);
  const actualAudit = evaluateCaptureMetadata(actual, targetDate, now);
  assert.equal(contractedAudit.captureClass, "historical_recovery");
  assert.equal(actualAudit.captureClass, contractedAudit.captureClass);
  assert.equal(contractedAudit.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
  assert.equal(actualAudit.issues.some((issue) => issue.code === "desktop_time_mismatch"), true);
});

test("proveniência v3 audita relógio real e preserva a data editorial histórica", () => {
  const targetDate = "2026-08-23";
  const capturedAt = "2026-08-24T15:00:00.000Z";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: "segunda-feira, 24/08/2026, 11:00",
    capturedAt,
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      provenanceVersion: 3,
      contractedDate: targetDate,
      reconstructedAt: capturedAt,
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  metadata.pageDateText = `${targetDate}T20:40:00-04:00`;
  metadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T15:01:00.000Z"));
  assert.equal(result.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
  assert.equal(result.issues.some((issue) => issue.code === "page_time_mismatch"), false);
  assert.equal(result.ok, true);

  const wrongClock = evaluateCaptureMetadata({ ...metadata, systemDateTime: "domingo, 23/08/2026, 20:40" }, targetDate, new Date("2026-08-24T15:01:00.000Z"));
  assert.equal(wrongClock.issues.some((issue) => issue.code === "desktop_time_mismatch"), true);
  const wrongProvenanceMetadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: "segunda-feira, 24/08/2026, 11:00",
    capturedAt,
    contentDateSamples: [],
    reconstruction: { ...(metadata.reconstruction as Record<string, unknown>), reconstructedAt: "2026-08-23T20:40:00-04:00" },
  });
  wrongProvenanceMetadata.pageDateText = `${targetDate}T20:40:00-04:00`;
  wrongProvenanceMetadata.pageDateObserved = `${targetDate}T20:40:00-04:00`;
  const wrongProvenance = evaluateCaptureMetadata(wrongProvenanceMetadata, targetDate, new Date("2026-08-24T15:01:00.000Z"));
  assert.equal(wrongProvenance.issues.some((issue) => issue.code === "reconstruction_provenance_invalid"), true);
});

test("proveniência v4 usa requestedCaptureAt nos dois relógios e mantém o instante real imutável", () => {
  const targetDate = "2026-08-23";
  const capturedAt = "2026-08-24T15:00:00.000Z";
  const requestedCaptureAt = `${targetDate}T20:40:00-04:00`;
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt,
    captureTime: "domingo, 23/08/2026, 20:40",
    capturedAt,
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      provenanceVersion: 4,
      contractedDate: targetDate,
      reconstructedAt: capturedAt,
      mediaUrl: "https://cdn.example.com/creative.jpg",
      historicalDisplayConfirmed: false,
    },
  });
  metadata.pageDateText = requestedCaptureAt;
  metadata.pageDateObserved = requestedCaptureAt;
  const now = new Date("2026-08-24T15:01:00.000Z");

  const historicalClocks = evaluateCaptureMetadata(metadata, targetDate, now);
  assert.equal(historicalClocks.issues.some((issue) => issue.code === "desktop_time_mismatch"), false);
  assert.equal(historicalClocks.issues.some((issue) => issue.code === "page_time_mismatch"), false);
  assert.equal(historicalClocks.issues.some((issue) => issue.code === "reconstruction_provenance_invalid"), false);
  assert.equal(historicalClocks.captureClass, "historical_recovery");
  assert.equal(historicalClocks.ok, true);

  const actualDesktopClockMetadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt,
    captureTime: "segunda-feira, 24/08/2026, 11:00",
    capturedAt,
    contentDateSamples: [],
    reconstruction: metadata.reconstruction,
  });
  actualDesktopClockMetadata.pageDateText = requestedCaptureAt;
  actualDesktopClockMetadata.pageDateObserved = requestedCaptureAt;
  const actualDesktopClock = evaluateCaptureMetadata(actualDesktopClockMetadata, targetDate, now);
  assert.equal(actualDesktopClock.issues.some((issue) => issue.code === "desktop_time_mismatch"), true);

  const forgedCreationMetadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt,
    captureTime: "domingo, 23/08/2026, 20:40",
    capturedAt,
    contentDateSamples: [],
    reconstruction: { ...(metadata.reconstruction as Record<string, unknown>), reconstructedAt: requestedCaptureAt },
  });
  forgedCreationMetadata.pageDateText = requestedCaptureAt;
  forgedCreationMetadata.pageDateObserved = requestedCaptureAt;
  const forgedCreationTime = evaluateCaptureMetadata(forgedCreationMetadata, targetDate, now);
  assert.equal(forgedCreationTime.issues.some((issue) => issue.code === "reconstruction_provenance_invalid"), true);

  const uncorrelated = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt,
    captureTime: "domingo, 23/08/2026, 20:40",
    capturedAt,
    contentDateSamples: [],
    trusted: false,
    reconstruction: metadata.reconstruction,
  });
  uncorrelated.pageDateText = requestedCaptureAt;
  uncorrelated.pageDateObserved = requestedCaptureAt;
  const untrustedAudit = evaluateCaptureMetadata(uncorrelated, targetDate, now);
  assert.equal(untrustedAudit.ok, false);
  assert.equal(untrustedAudit.captureClass, null);
});

test("reconstrução legada aprovada preserva o contrato histórico", () => {
  const targetDate = "2026-08-23";
  const metadata = buildMetadata({
    captureClass: "historical_recovery",
    targetDate,
    requestedCaptureAt: `${targetDate}T20:40:00-04:00`,
    captureTime: `${targetDate}T20:40:00-04:00`,
    capturedAt: "2026-08-24T15:00:00.000Z",
    contentDateSamples: [],
    reconstruction: {
      reason: "late_publication_recovery",
      contractedDate: targetDate,
      reconstructedAt: "2026-08-23T20:40:00.000-04:00",
      mediaUrl: "https://cdn.example.com/creative.jpg",
    },
  });
  const result = evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T16:00:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.issues.some((issue) => issue.code === "reconstruction_provenance_invalid"), false);
});

test("reconstrução AFL v4 de artigo exige URL canônica igual à notícia esperada e visível", () => {
  const targetDate = "2026-08-23";
  const capturedAt = "2026-08-24T15:00:00.000Z";
  const requestedCaptureAt = `${targetDate}T20:40:00-04:00`;
  const makeArticle = ({
    pageUrl = "https://afolhalivre.com/expo-agro-2026/?preview=token",
    expectedUrl = "https://afolhalivre.com/expo-agro-2026?signature=expected",
    visibleUrl = expectedUrl,
    editorialUrl = visibleUrl,
    captureClass = "historical_recovery",
    provenanceVersion = 4,
    format = "INTERNO",
  }: {
    pageUrl?: string | null;
    expectedUrl?: string | null;
    visibleUrl?: string | null;
    editorialUrl?: string | null;
    captureClass?: string;
    provenanceVersion?: number;
    format?: string;
  } = {}) => {
    const metadata = buildMetadata({
      captureClass,
      targetDate,
      requestedCaptureAt,
      captureTime: requestedCaptureAt,
      capturedAt: captureClass === "scheduled" ? "2026-08-23T23:00:00.000Z" : capturedAt,
      contentDateSamples: [`${targetDate}T19:00:00-04:00`],
      reconstruction: captureClass === "historical_recovery" ? {
        reason: "late_publication_recovery",
        provenanceVersion,
        contractedDate: targetDate,
        reconstructedAt: capturedAt,
        mediaUrl: "https://cdn.example.com/creative.jpg",
        historicalDisplayConfirmed: false,
      } : null,
    }) as Record<string, unknown>;
    metadata.siteSigla = "AFL";
    metadata.format = format;
    metadata.pageUrl = pageUrl;
    metadata.editorialSamples = editorialUrl ? [{ title: "Notícia", url: editorialUrl, date: targetDate }] : [];
    metadata.retroContentManifest = {
      expectedPosts: expectedUrl ? [{ title: "Notícia", url: expectedUrl, date: targetDate }] : [],
      visiblePosts: visibleUrl ? [{ title: "Notícia", url: visibleUrl, date: targetDate }] : [],
    };
    return metadata;
  };
  const evaluate = (metadata: Record<string, unknown>) => evaluateCaptureMetadata(metadata, targetDate, new Date("2026-08-24T15:01:00.000Z"));
  const issuePresent = (result: ReturnType<typeof evaluateCaptureMetadata>) => result.issues.some((issue) => issue.code === "article_context_mismatch");

  const valid = evaluate(makeArticle());
  assert.equal(valid.auditContext.resolvedPage, "article");
  assert.equal(issuePresent(valid), false);
  assert.equal(valid.ok, true);

  for (const mismatch of [
    makeArticle({ expectedUrl: "https://afolhalivre.com/acidente-na-rodovia/" }),
    makeArticle({ visibleUrl: "https://afolhalivre.com/acidente-na-rodovia/" }),
    makeArticle({ editorialUrl: "https://afolhalivre.com/acidente-na-rodovia/" }),
    makeArticle({ expectedUrl: null }),
    makeArticle({ visibleUrl: null }),
    makeArticle({ editorialUrl: null }),
    makeArticle({ pageUrl: null }),
    makeArticle({ expectedUrl: "https://outro-portal.example/expo-agro-2026/" }),
    makeArticle({ pageUrl: "https://outro-portal.example/expo-agro-2026/", expectedUrl: "https://outro-portal.example/expo-agro-2026/" }),
    makeArticle({ pageUrl: "http://afolhalivre.com/expo-agro-2026/", expectedUrl: "http://afolhalivre.com/expo-agro-2026/" }),
    makeArticle({ pageUrl: "https://user@afolhalivre.com/expo-agro-2026/", expectedUrl: "https://user@afolhalivre.com/expo-agro-2026/" }),
    makeArticle({ editorialUrl: "not a URL" }),
  ]) {
    const rejected = evaluate(mismatch);
    assert.equal(issuePresent(rejected), true);
    assert.equal(rejected.ok, false);
  }

  const legacy = evaluate(makeArticle({ provenanceVersion: 3 }));
  assert.equal(legacy.captureClass, "historical_recovery");
  assert.equal(issuePresent(legacy), false);
  const daily = evaluate(makeArticle({ captureClass: "scheduled" }));
  assert.equal(daily.captureClass, "scheduled");
  assert.equal(issuePresent(daily), false);
  const home = evaluate(makeArticle({ format: "MEGABANNER TOPO", pageUrl: "https://afolhalivre.com/" }));
  assert.equal(home.auditContext.resolvedPage, "home");
  assert.equal(issuePresent(home), false);
});
