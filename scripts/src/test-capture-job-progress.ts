import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCaptureProgress,
  buildCaptureSupport,
  initialCaptureProgress,
  toPublicCaptureJob,
} from "../../artifacts/api-server/src/lib/capture-job-progress";

test("progresso usa etapas reais e nunca retrocede", () => {
  const queued = initialCaptureProgress("2026-09-02T12:00:00.000Z");
  const captured = advanceCaptureProgress(queued, "slot_captured", "2026-09-02T12:01:00.000Z");
  const stale = advanceCaptureProgress(captured, "slot_found", "2026-09-02T12:02:00.000Z");
  const completed = advanceCaptureProgress(stale, "completed", "2026-09-02T12:03:00.000Z");

  assert.equal(queued.percent, 0);
  assert.equal(captured.percent, 60);
  assert.deepEqual(stale, captured);
  assert.equal(completed.percent, 100);
  assert.equal(completed.stage, "completed");
});

test("falha publica somente mensagem segura e codigo correlacionavel", () => {
  const first = buildCaptureSupport("job-123", "Error: senha=segredo /srv/app/file.ts:99");
  const again = buildCaptureSupport("job-123", "outro erro interno");

  assert.match(first.code, /^CAPTURE-[A-F0-9]{8}$/);
  assert.equal(first.code, again.code);
  assert.equal(first.message, "Tente novamente. Se o problema continuar, informe este código ao suporte.");
  assert.doesNotMatch(JSON.stringify(first), /segredo|\/srv|file\.ts/);

  const publicJob = toPublicCaptureJob({
    id: "job-123",
    kind: "capture-proof-single",
    status: "failed",
    createdAt: "2026-09-02T12:00:00.000Z",
    totalTargets: 1,
    completedTargets: 1,
    failedTargets: 1,
    items: [{ insertionId: 1, targetDate: "2026-09-02", status: "error", error: "senha=segredo /srv/app/file.ts:99" }],
  });
  assert.equal(publicJob.items[0]?.error, "Não foi possível concluir a geração deste print.");
  assert.doesNotMatch(JSON.stringify(publicJob), /segredo|\/srv|file\.ts/);
});
