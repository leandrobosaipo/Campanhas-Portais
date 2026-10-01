import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateCaptureChecklist } = require("./capture-insertion-proof.cjs");
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      approved: false,
      blockingIssues: [{
        code: "retro_editorial_audit_missing",
        detail: "token=secret-token cookie=session-cookie /Users/operator/private.json",
        cookie: "session-cookie",
      }],
    }),
  });

  await assert.rejects(
    validateCaptureChecklist("https://api.invalid", 123, "2026-09-29", {}),
    (error) => {
      assert.match(error.message, /retro_editorial_audit_missing/);
      assert.doesNotMatch(error.message, /secret-token|session-cookie|\/Users\/operator\/private\.json/);
      return true;
    },
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ok: checklist errors retain blocker codes and omit secrets and paths");
