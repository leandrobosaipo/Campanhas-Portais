import assert from "node:assert/strict";
import test from "node:test";
import { validateLegacySameDayInlineCorrelation } from "../../artifacts/api-server/src/lib/capture-audit";

const evidenceUrl = "https://storage.example/evidence.png?v=1";
const mediaUrl = "https://cdn.example/campaign.gif";

function validInput() {
  return {
    targetDate: "2026-08-21",
    runnerJobId: "inline-1787365443641-cd1sdn",
    status: "ok",
    createdAt: new Date("2026-08-22T02:25:38.238Z"),
    capturedAt: "2026-08-22T02:25:07.747Z",
    requestedCaptureAt: "2026-08-21T20:00",
    uploadedUrl: evidenceUrl,
    evidenceUrl,
    matchedMediaUrl: `${mediaUrl}?cache=1`,
    expectedMediaUrl: mediaUrl,
  };
}

test("aceita captura inline criada no mesmo dia em America/Cuiaba", () => {
  const result = validateLegacySameDayInlineCorrelation(validInput());
  assert.equal(result.ok, true);
  assert.equal(result.sourceJobId, "inline-1787365443641-cd1sdn");
  assert.equal(result.capturedAt, "2026-08-22T02:25:07.747Z");
});

test("converte UTC para o dia operacional de Cuiaba", () => {
  const result = validateLegacySameDayInlineCorrelation({ ...validInput(), createdAt: new Date("2026-08-22T04:01:00.000Z") });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes("capture_created_date_mismatch"));
});

test("bloqueia arquivo, mídia, runner e data solicitada divergentes", () => {
  const result = validateLegacySameDayInlineCorrelation({
    ...validInput(),
    runnerJobId: "job-sem-proveniencia",
    uploadedUrl: "https://storage.example/outro.png",
    matchedMediaUrl: "https://cdn.example/outra.gif",
    requestedCaptureAt: "2026-08-20T20:00",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.blockers), new Set([
    "inline_runner_job_missing",
    "requested_capture_date_mismatch",
    "capture_artifact_mismatch",
    "capture_media_mismatch",
  ]));
});

test("bloqueia log que não terminou aprovado", () => {
  const result = validateLegacySameDayInlineCorrelation({ ...validInput(), status: "failed" });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes("capture_log_not_approved"));
});
