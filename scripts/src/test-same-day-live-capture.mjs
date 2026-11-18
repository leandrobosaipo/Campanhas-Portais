import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendCaptureRetryQuery, resolveEffectiveCaptureAt, resolveDesktopFrameDateTime, resolveReachableMediaUrl, resolveMatchedGifSourceUrl } = require("./capture-insertion-proof.cjs");

test("OMT live usa cache bust sem prévia ou relógio simulado; histórico mantém sua URL", () => {
  const original = "https://omatogrossense.com/?existing=1";
  assert.equal(appendCaptureRetryQuery(original, 1), original);
  const before = Date.now();
  const live = new URL(appendCaptureRetryQuery(original, 1, true));
  assert.equal(live.origin, new URL(original).origin);
  assert.equal(live.searchParams.get("existing"), "1");
  assert.ok(Number(live.searchParams.get("_adops_capture_retry")) >= before);
  assert.ok(Number(live.searchParams.get("_adops_capture_retry")) <= Date.now());
  assert.equal(live.searchParams.has("adops_preview_at"), false);
  const historical = "https://omatogrossense.com/?adops_preview_at=2026-10-09T18%3A00";
  assert.equal(appendCaptureRetryQuery(historical, 1), historical);
  assert.equal(new URL(appendCaptureRetryQuery(historical, 2)).searchParams.get("_adops_capture_retry"), "2");
});

test("captura do dia usa página e relógio vivos mesmo quando a fila começou depois", () => {
  const captureDate = new Date("2026-10-10T00:00:00Z");
  assert.equal(resolveEffectiveCaptureAt({ captureClass: "scheduled", previewSupported: true, requestedCaptureAt: "2026-10-09T20:02", captureDate }), null);
  assert.equal(resolveEffectiveCaptureAt({ captureClass: "same_day_retry", previewSupported: true, requestedCaptureAt: "2026-10-09T20:02", captureDate }), null);
  assert.equal(resolveEffectiveCaptureAt({ captureClass: "historical_recovery", previewSupported: true, requestedCaptureAt: "2026-10-08T19:00", captureDate }), "2026-10-08T19:00");
});

test("relógio do frame usa o instante capturado e preserva a referência histórica", () => {
  const actual = "2026-10-09T22:28:11.226Z";
  assert.equal(resolveDesktopFrameDateTime("sexta-feira, 09/10/2026, 18:26", null, null, actual), "sexta-feira, 09/10/2026, 18:28");
  assert.equal(resolveDesktopFrameDateTime("legacy-clock", null, null, "invalid"), "legacy-clock");
  assert.equal(resolveDesktopFrameDateTime("legacy-clock", null), "legacy-clock");
  assert.equal(resolveDesktopFrameDateTime("legacy-clock", { provenanceVersion: 4 }, "2026-10-08T19:00", actual), "quinta-feira, 08/10/2026, 19:00");
});

test("GIF protocol-relative só é normalizado para HTTP(S) quando corresponde à mídia esperada", () => {
  const expected = "https://omatogrossense.nyc3.digitaloceanspaces.com/app/uploads/banner.gif?ver=1";
  assert.equal(resolveMatchedGifSourceUrl("//omatogrossense.nyc3.digitaloceanspaces.com/app/uploads/banner.gif?ver=2", expected), "https://omatogrossense.nyc3.digitaloceanspaces.com/app/uploads/banner.gif?ver=2");
  assert.equal(resolveMatchedGifSourceUrl("//evil.example/banner.gif", expected), null);
  assert.equal(resolveMatchedGifSourceUrl("data:image/gif;base64,R0lGODlh", expected), null);
  assert.equal(resolveMatchedGifSourceUrl("javascript:alert(1).gif", expected), null);
  assert.equal(resolveReachableMediaUrl("javascript:alert(1)"), null);
  assert.equal(resolveReachableMediaUrl("//omatogrossense.nyc3.digitaloceanspaces.com/banner.gif"), "https://omatogrossense.nyc3.digitaloceanspaces.com/banner.gif");
});
