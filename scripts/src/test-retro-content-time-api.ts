import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCaptureMetadata } from "../../artifacts/api-server/src/lib/capture-audit";

test("API audit rejects relative editorial dates required by PNMT", () => {
  const audit = evaluateCaptureMetadata({
    siteSigla: "PNMT",
    format: "MEGABANNER TOPO",
    requestedCaptureAt: "2026-07-15T19:06",
    systemDateTime: "quarta-feira, 15/07/2026, 19:06",
    pageDateObserved: "2026-07-15T19:06:00-04:00",
    contentDateSamples: ["15/07/2026 16:12"],
    contentRelativeTimeSamples: ["há 6 dias"],
    visualAudit: {},
    slotVisibility: {},
  }, "2026-07-15");

  assert.ok(audit.relativeContentTimeline);
  assert.equal(audit.relativeContentTimeline.required, true);
  assert.equal(audit.relativeContentTimeline.ok, false);
  assert.ok(audit.issues.some((item) => item.code === "relative_content_time_unresolved"));
});

test("API audit rejects PNMT proof without an absolute editorial date", () => {
  const audit = evaluateCaptureMetadata({
    siteSigla: "PNMT",
    format: "MEGABANNER TOPO",
    requestedCaptureAt: "2026-07-15T19:06",
    systemDateTime: "quarta-feira, 15/07/2026, 19:06",
    pageDateObserved: "2026-07-15T19:06:00-04:00",
    contentDateSamples: [],
    contentRelativeTimeSamples: [],
    visualAudit: {},
    slotVisibility: {},
  }, "2026-07-15");

  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((item) => item.code === "absolute_content_time_missing"));
});

test("API audit rejects an article whose visible date does not match the target day", () => {
  const audit = evaluateCaptureMetadata({
    siteSigla: "PERRENGUE",
    format: "INTERNO DE NOTICIAS",
    requestedCaptureAt: "2026-07-31T20:00:00-04:00",
    systemDateTime: "sexta-feira, 31/07/2026, 20:00",
    pageDateObserved: "2026-07-31T20:00:00-04:00",
    contentDateSamples: ["20/07/2026 19:50"],
    contentRelativeTimeSamples: [],
    auditConfig: {
      requireEditorialDateMatchTarget: true,
    },
    visualAudit: {},
    slotVisibility: {},
  }, "2026-07-31");

  assert.equal(audit.contentTimeline?.targetDateMatches, false);
  assert.equal(audit.ok, false);
  assert.ok(audit.issues.some((item) => item.code === "editorial_date_target_mismatch"));
});
