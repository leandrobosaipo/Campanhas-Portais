import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shouldCollectEditorialEvidenceForCapture } = require("./capture-insertion-proof.cjs");

test("AFL same-day ainda coleta datas editoriais quando a regra absoluta está ativa", () => {
  assert.equal(shouldCollectEditorialEvidenceForCapture({
    isHistoricalCapture: false,
    requireAbsoluteEditorialDates: true,
    requireEditorialDateMatchTarget: false,
  }), true);
});

test("coleta editorial continua coberta por captura histórica ou regra de data-alvo", () => {
  assert.equal(shouldCollectEditorialEvidenceForCapture({
    isHistoricalCapture: true,
    requireAbsoluteEditorialDates: false,
    requireEditorialDateMatchTarget: false,
  }), true);
  assert.equal(shouldCollectEditorialEvidenceForCapture({
    isHistoricalCapture: false,
    requireAbsoluteEditorialDates: false,
    requireEditorialDateMatchTarget: true,
  }), true);
  assert.equal(shouldCollectEditorialEvidenceForCapture({
    isHistoricalCapture: false,
    requireAbsoluteEditorialDates: false,
    requireEditorialDateMatchTarget: false,
  }), false);
});
