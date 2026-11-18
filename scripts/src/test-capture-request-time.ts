import assert from "node:assert/strict";
import test from "node:test";
import { captureAtPolicyError, isDirectExecutionEvidenceAudit, isFutureCaptureAt, isHistoricalCaptureDate, resolveRegenerationCaptureAt } from "../../artifacts/api-server/src/lib/capture-audit";

test("hoje não recebe horário retroativo implícito, mesmo após a janela", () => {
  const now = new Date("2026-10-12T02:30:00.000Z"); // 22:30 em Cuiabá em 11/10
  assert.equal(resolveRegenerationCaptureAt("2026-10-11", 3080, null, now), null);
});

test("captura histórica mantém a distribuição retroativa", () => {
  const now = new Date("2026-10-12T02:30:00.000Z");
  assert.match(resolveRegenerationCaptureAt("2026-10-10", 3080, null, now) ?? "", /^2026-10-10T(18|19|20|21):\d{2}$/);
});

test("horário histórico explícito é preservado, mas horário futuro continua recusado", () => {
  const now = new Date("2026-10-12T02:30:00.000Z");
  const audit = { requestedCaptureAt: "2026-10-10T20:15" } as ReturnType<typeof import("../../artifacts/api-server/src/lib/capture-audit").evaluateCaptureMetadata>;
  assert.equal(resolveRegenerationCaptureAt("2026-10-10", 3080, audit, now), "2026-10-10T20:15");
  assert.equal(captureAtPolicyError("2026-10-11T22:31", now), "capture_at_in_future");
});

test("carimbo futuro é recusável com ou sem offset", () => {
  const now = new Date("2026-10-09T22:10:18.000Z");
  assert.equal(isFutureCaptureAt("2026-10-09T18:35", now), true);
  assert.equal(isFutureCaptureAt("2026-10-09T18:10", now), false);
  assert.equal(isFutureCaptureAt("2026-10-09T22:35:00Z", now), true);
});

test("prova retroativa só é exigida para data anterior", () => {
  const now = new Date("2026-10-09T22:10:18.000Z");
  assert.equal(isHistoricalCaptureDate("2026-10-08", now), true);
  assert.equal(isHistoricalCaptureDate("2026-10-09", now), false);
});

test("09h real é aceito hoje, mas não como reconstrução histórica", () => {
  const now = new Date("2026-10-09T13:10:00Z");
  assert.equal(captureAtPolicyError("2026-10-09T09:00", now), null);
  assert.equal(captureAtPolicyError("2026-10-08T09:00", now), "capture_at_outside_allowed_window");
});

test("datas e horários impossíveis são recusados e offset usa Cuiabá", () => {
  const now = new Date("2026-10-09T13:10:00Z");
  assert.equal(captureAtPolicyError("2026-09-31T19:00", now), "capture_at_invalid");
  assert.equal(captureAtPolicyError("2026-02-29T19:00", now), "capture_at_invalid");
  assert.equal(captureAtPolicyError("2026-10-09T09:00:99", now), "capture_at_invalid");
  assert.equal(captureAtPolicyError("2026-10-09T13:00:00Z", now), null);
  assert.equal(captureAtPolicyError("2026-10-08T21:30:00Z", now), "capture_at_outside_allowed_window");
});

test("declaração final não usa reconstrução editorial como prova de execução real", () => {
  assert.equal(isDirectExecutionEvidenceAudit({ captureClass: "scheduled", retroContentProof: { sourceMode: "audited_reconstruction", reconstructed: true } }), false);
  assert.equal(isDirectExecutionEvidenceAudit({ captureClass: "historical_recovery", retroContentProof: { sourceMode: "signed_preview" } }), false);
  assert.equal(isDirectExecutionEvidenceAudit({ captureClass: "scheduled", retroContentProof: null }), true);
});
