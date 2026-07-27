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
