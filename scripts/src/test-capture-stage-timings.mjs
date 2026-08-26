import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCaptureTimings, buildFailedCaptureStage, sanitizeCaptureStages, summarizeCaptureJobTimings } from "../../ops/shared/capture-stage-timings.mjs";

test("resume fila, captura, upload e auditoria do job assíncrono", () => {
  const result = summarizeCaptureJobTimings({
    createdAt: "2026-08-26T22:00:00.000Z",
    startedAt: "2026-08-26T22:00:01.250Z",
    finishedAt: "2026-08-26T22:00:09.000Z",
    items: [{
      stages: [
        { stage: "page_resolved", startedAt: "2026-08-26T22:00:01.500Z", finishedAt: "2026-08-26T22:00:02.400Z", durationMs: 900 },
        { stage: "slot_captured", startedAt: "2026-08-26T22:00:05.000Z", finishedAt: "2026-08-26T22:00:07.500Z", durationMs: 2_500 },
        { stage: "critical_assets", startedAt: "2026-08-26T22:00:05.500Z", finishedAt: "2026-08-26T22:00:06.200Z", durationMs: 700 },
        { stage: "uploaded", startedAt: "2026-08-26T22:00:07.500Z", finishedAt: "2026-08-26T22:00:08.400Z", durationMs: 900 },
        { stage: "audit_evaluated", startedAt: "2026-08-26T22:00:08.400Z", finishedAt: "2026-08-26T22:00:09.200Z", durationMs: 800 },
      ],
    }],
  });

  assert.deepEqual(result, {
    queueMs: 1_250,
    captureMs: 6_000,
    uploadMs: 900,
    auditMs: 800,
    totalMs: 9_000,
  });
});

test("usa null quando o runtime não informou uma etapa", () => {
  assert.deepEqual(summarizeCaptureJobTimings({ items: [] }), {
    queueMs: null,
    captureMs: null,
    uploadMs: null,
    auditMs: null,
    totalMs: null,
  });
});

test("não inventa zero para tempos de captura ausentes", () => {
  assert.deepEqual(aggregateCaptureTimings([], 125), {
    captureMs: null,
    uploadMs: null,
    auditMs: 125,
  });
  assert.deepEqual(aggregateCaptureTimings([
    { timings: { captureMs: 300, uploadMs: 40, auditMs: 20 } },
    { timings: { captureMs: 200, uploadMs: 30, auditMs: 10 } },
  ], 50), {
    captureMs: 500,
    uploadMs: 70,
    auditMs: 80,
  });
  assert.deepEqual(aggregateCaptureTimings([
    { timings: { captureMs: null, uploadMs: null, auditMs: null } },
  ], null), {
    captureMs: null,
    uploadMs: null,
    auditMs: null,
  });
});

test("não transforma duração null de estágio em zero", () => {
  const result = summarizeCaptureJobTimings({
    items: [{ stages: [{ stage: "uploaded", durationMs: null }] }],
  });
  assert.equal(result.uploadMs, null);
});

test("persiste somente os campos públicos dos estágios", () => {
  assert.deepEqual(sanitizeCaptureStages([{
    stage: "uploaded",
    status: "ok",
    startedAt: "2026-08-26T22:00:07.500Z",
    finishedAt: "2026-08-26T22:00:08.400Z",
    durationMs: 900,
    summary: { targetUrl: "https://example.com/?adops_preview_sig=segredo" },
    errorDetail: "interno",
  }]), [{
    stage: "uploaded",
    status: "ok",
    startedAt: "2026-08-26T22:00:07.500Z",
    finishedAt: "2026-08-26T22:00:08.400Z",
    durationMs: 900,
  }]);
});

test("atribui ao captureMs o tempo real de uma captura que falhou", () => {
  const stage = buildFailedCaptureStage(
    "2026-08-26T22:00:01.000Z",
    "2026-08-26T22:10:01.000Z",
  );
  const result = summarizeCaptureJobTimings({
    createdAt: "2026-08-26T22:00:00.000Z",
    startedAt: "2026-08-26T22:00:01.000Z",
    finishedAt: "2026-08-26T22:10:01.000Z",
    items: [{ status: "error", stages: [stage] }],
  });
  assert.equal(result.captureMs, 600_000);
  assert.deepEqual(stage, {
    stage: "capture_failed",
    status: "failed",
    startedAt: "2026-08-26T22:00:01.000Z",
    finishedAt: "2026-08-26T22:10:01.000Z",
    durationMs: 600_000,
  });
});
