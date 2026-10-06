import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(path.resolve(fileURLToPath(new URL("../..", import.meta.url))));
const { attachServerCaptureProvenance, evaluateCaptureMetadata, evaluateVideoPlayerProof } = await import("../../artifacts/api-server/src/lib/capture-audit.ts");

function videoMetadata(): any {
  return {
    format: "VIDEO", siteSigla: "ROO", captureClass: "historical_recovery",
    targetDate: "2026-10-01", capturedAt: "2026-10-06T20:00:00Z", sourceJobId: "video-job",
    auditPolicyVersion: "audit-policy-v1", auditContractVersion: "audit-checklist-v1",
    requestedCaptureAt: "2026-10-01T20:00:00-04:00",
    systemDateTime: "2026-10-01T20:00:00-04:00", pageDateText: "2026-10-01T20:00:00-04:00",
    pageDateObserved: "2026-10-01T20:00:00-04:00", contentDateSamples: ["2026-10-01T19:00:00-04:00"],
    reconstruction: { provenanceVersion: 4, reason: "historical_recovery", contractedDate: "2026-10-01", reconstructedAt: "2026-10-06T20:00:00Z", mediaUrl: "https://cdn.example.com/creative.mp4" },
    mediaBasename: "creative.mp4", matchedMediaUrl: "https://cdn.example.com/creative.mp4",
    slotStableFrameOk: true, slotLegibilityOk: true, identityFrameOk: true,
    slotVisibility: { mostlyVisible: true, visibleRatio: 1 },
    visualAudit: { viewportImagesTotal: 0, viewportImagesLoaded: 0, slotImagesTotal: 0, slotImagesLoaded: 0, viewportBackgroundsTotal: 0, viewportBackgroundsLoaded: 0, viewportVideosTotal: 1, viewportVideosLoaded: 1 },
    chromeFrameHeight: 100,
    videoProof: { ok: true, controls: true, paused: true, progressVisible: true, currentTime: 1, duration: 4, overlayInjected: false, artificialOverlayCount: 0 },
    nativeProgressAudit: {
      version: 1, source: "chromium_ua_shadow_timeline", ok: true, pseudo: "-webkit-media-controls-timeline",
      tag: "INPUT", type: "range", value: 1, max: 4, currentTime: 1, duration: 4, controls: true,
      box: { x: 8, y: 254, width: 480, height: 24 }, display: "block", visibility: "visible", disabled: false,
      effectiveVisible: true, effectiveOpacity: 1, visibleRatio: 1, paused: true, insideVideoBounds: true, insideViewport: true, occlusion: "clear", artificialOverlayCount: 0,
    },
    finalPngProgressAudit: {
      ok: true, source: "auditFinalPngSlotPixels_video_progress_roi", comparedTo: "viewportPng_video_progress_roi",
      slotBox: { left: 8, top: 254, width: 480, height: 24 }, cropBox: { left: 8, top: 354, width: 480, height: 24 }, cropSize: { width: 480, height: 24 }, pixelScale: 1,
      similarityScore: 1, minSimilarity: 0.9, finalCropMeanStddev: 24, finalCropMinContentStddev: 1, issues: [],
    },
  };
}

test("v4 exige timeline nativa medida e a mesma ROI no PNG final", () => {
  const metadata = videoMetadata();
  const result = evaluateVideoPlayerProof(metadata, true);
  assert.equal(result.ok, true);
  assert.equal(result.nativeRequired, true);
  assert.equal(result.controlsVisible, true);
  assert.equal(result.nativeProgressVerified, true);
  assert.equal(result.finalProgressPixelsVerified, true);
  assert.equal(result.progressSource, "chromium_ua_shadow_timeline");
});

test("duplicação real #3064: overlay e flags de controls/progress não aprovam v4", () => {
  const metadata = videoMetadata();
  metadata.videoProof = { ok: true, controls: true, progressVisible: true, overlayInjected: true, currentTime: 3.438596, duration: 30.037 };
  delete metadata.nativeProgressAudit; delete metadata.finalPngProgressAudit;
  assert.equal(evaluateVideoPlayerProof(metadata, true).ok, false);
  attachServerCaptureProvenance(metadata, { targetDate: metadata.targetDate, capturedAt: metadata.capturedAt, sourceJobId: metadata.sourceJobId, uploadedUrl: "https://cdn.example.com/proof.png" });
  const result = evaluateCaptureMetadata(metadata, metadata.targetDate, new Date("2026-10-06T20:01:00Z"));
  assert.equal(result.ok, false);
  assert.equal(result.playerProof.ok, false);
  assert.equal(result.playerProof.progressVisible, false);
  assert.equal(result.playerProof.progressSource, "unverified");
  assert.ok(result.issues.some((issue) => issue.code === "video_player_proof_incomplete"));
});

const cases: Array<[string, (metadata: any) => void]> = [
  ["native audit ausente", m => { delete m.nativeProgressAudit; }],
  ["pixel audit ausente", m => { delete m.finalPngProgressAudit; }],
  ["native ok falso", m => { m.nativeProgressAudit.ok = false; }],
  ["source desconhecido", m => { m.nativeProgressAudit.source = "dom_attribute"; }],
  ["versão desconhecida", m => { m.nativeProgressAudit.version = 2; }],
  ["pseudo diferente", m => { m.nativeProgressAudit.pseudo = "fake-timeline"; }],
  ["controle não é range", m => { m.nativeProgressAudit.type = "text"; }],
  ["controle disabled", m => { m.nativeProgressAudit.disabled = true; }],
  ["ancestral invisível", m => { m.nativeProgressAudit.effectiveVisible = false; }],
  ["ancestral opaco zero", m => { m.nativeProgressAudit.effectiveOpacity = 0; }],
  ["barra recortada pelo ancestral", m => { m.nativeProgressAudit.visibleRatio = 0.9; }],
  ["clipping sem medição", m => { delete m.nativeProgressAudit.visibleRatio; }],
  ["clipping não finito", m => { m.nativeProgressAudit.visibleRatio = NaN; }],
  ["timeline em reprodução", m => { m.nativeProgressAudit.paused = false; }],
  ["frame em reprodução", m => { m.videoProof.paused = false; }],
  ["display oculto", m => { m.nativeProgressAudit.display = "none"; }],
  ["visibility oculta", m => { m.nativeProgressAudit.visibility = "hidden"; }],
  ["fora do player", m => { m.nativeProgressAudit.insideVideoBounds = false; }],
  ["fora da viewport", m => { m.nativeProgressAudit.insideViewport = false; }],
  ["barra coberta", m => { m.nativeProgressAudit.occlusion = "covered"; }],
  ["oclusão indisponível", m => { m.nativeProgressAudit.occlusion = "unavailable"; }],
  ["oclusão não medida", m => { delete m.nativeProgressAudit.occlusion; }],
  ["tempo divergente", m => { m.nativeProgressAudit.value = 2; }],
  ["duração divergente", m => { m.nativeProgressAudit.max = 9; }],
  ["metadata do vídeo mudou", m => { m.videoProof.currentTime = 2; }],
  ["número não finito", m => { m.nativeProgressAudit.value = Infinity; }],
  ["número textual", m => { m.nativeProgressAudit.value = "1"; }],
  ["overlay medido no DOM", m => { m.nativeProgressAudit.artificialOverlayCount = 1; }],
  ["overlay declarado", m => { m.videoProof.overlayInjected = true; }],
  ["overlay count ausente", m => { delete m.videoProof.artificialOverlayCount; }],
  ["PNG alterado", m => { m.finalPngProgressAudit.ok = false; }],
  ["pixel source diferente", m => { m.finalPngProgressAudit.source = "generic_painted"; }],
  ["ROI com origem diferente", m => { m.finalPngProgressAudit.slotBox.top += 12; }],
  ["ROI de outro tamanho", m => { m.finalPngProgressAudit.slotBox.width = 20; }],
  ["crop sem offset da moldura", m => { m.finalPngProgressAudit.cropBox.top -= 100; }],
  ["crop recortado", m => { m.finalPngProgressAudit.cropBox.width = 20; }],
  ["pixels da ROI final cortados", m => { m.finalPngProgressAudit.cropSize.height = 12; }],
  ["dimensões pixel ausentes", m => { delete m.finalPngProgressAudit.cropSize; }],
  ["scale inconsistente", m => { m.finalPngProgressAudit.pixelScale = 2; }],
  ["similaridade abaixo do gate", m => { m.finalPngProgressAudit.similarityScore = 0.8; }],
  ["threshold degradado", m => { m.finalPngProgressAudit.minSimilarity = 0; }],
  ["ROI uniforme", m => { m.finalPngProgressAudit.finalCropMeanStddev = 0; }],
  ["issue de pixel persistida", m => { m.finalPngProgressAudit.issues = [{ code: "missing_file" }]; }],
];
for (const [name, change] of cases) test(`v4 bloqueia ${name}`, () => {
  const metadata = videoMetadata(); change(metadata);
  assert.equal(evaluateVideoPlayerProof(metadata, true).ok, false);
});

test("mapeamento de ROI acompanha a escala da moldura", () => {
  const metadata = videoMetadata(); metadata.chromeFrameHeight = 180;
  metadata.finalPngProgressAudit.pixelScale = 2;
  metadata.finalPngProgressAudit.cropBox = { left: 16, top: 688, width: 960, height: 48 };
  metadata.finalPngProgressAudit.cropSize = { width: 960, height: 48 };
  assert.equal(evaluateVideoPlayerProof(metadata, true).ok, true);
});

test("v2/v3 e vídeo diário mantêm o contrato legado sem declarar prova nativa", () => {
  for (const version of [2, 3, null]) {
    const metadata = videoMetadata();
    metadata.reconstruction = version === null ? null : { provenanceVersion: version };
    delete metadata.nativeProgressAudit; delete metadata.finalPngProgressAudit;
    metadata.videoProof.overlayInjected = true;
    const result = evaluateVideoPlayerProof(metadata, true);
    assert.equal(result.ok, true); assert.equal(result.nativeRequired, false);
    assert.equal(result.progressSource, "legacy_injected_overlay");
    assert.equal(result.nativeProgressVerified, false);
  }
});

test("imagem/GIF v4 não recebe gate de vídeo", () => {
  const metadata = videoMetadata(); delete metadata.videoProof;
  delete metadata.nativeProgressAudit; delete metadata.finalPngProgressAudit;
  assert.equal(evaluateVideoPlayerProof(metadata, false).ok, true);
  assert.equal(evaluateVideoPlayerProof(metadata, false).nativeRequired, false);
});

test("auditoria final expõe prova nativa sem depender da flag progressVisible", () => {
  const metadata = videoMetadata(); metadata.videoProof.progressVisible = false;
  attachServerCaptureProvenance(metadata, { targetDate: metadata.targetDate, capturedAt: metadata.capturedAt, sourceJobId: metadata.sourceJobId, uploadedUrl: "https://cdn.example.com/proof.png" });
  const result = evaluateCaptureMetadata(metadata, metadata.targetDate, new Date("2026-10-06T20:01:00Z"));
  assert.equal(result.playerProof.ok, true);
  assert.equal(result.playerProof.nativeProgressRequired, true);
  assert.equal(result.playerProof.nativeProgressVerified, true);
  assert.equal(result.playerProof.finalProgressPixelsVerified, true);
  assert.equal(result.issues.some((issue) => issue.code === "video_player_proof_incomplete"), false);
});
