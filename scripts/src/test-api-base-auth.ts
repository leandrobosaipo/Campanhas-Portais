import test from "node:test";
import assert from "node:assert/strict";

import { buildApiRequestHeaders } from "../../artifacts/adops/src/lib/api-base.ts";

const PUBLIC_API = "https://adops-api-public.leandro471.workers.dev";

test("buildApiRequestHeaders bloqueia mutação pública sem token", () => {
  const result = buildApiRequestHeaders(
    { method: "DELETE" },
    { apiBase: PUBLIC_API, token: "", clientBuildId: "build-1" },
  );

  assert.equal(result.shouldBlockProtectedMutation, true);
  assert.equal(result.headers.get("authorization"), null);
  assert.equal(result.headers.get("x-adops-auth-state"), "missing");
  assert.equal(result.headers.get("x-adops-client-build"), "build-1");
});

test("buildApiRequestHeaders sanitiza Bearer vazio", () => {
  const result = buildApiRequestHeaders(
    { method: "PATCH", headers: { Authorization: 'Bearer ""' } },
    { apiBase: PUBLIC_API, token: "", clientBuildId: "build-2" },
  );

  assert.equal(result.headers.get("authorization"), null);
  assert.equal(result.authState, "empty_bearer_sanitized");
  assert.equal(result.shouldBlockProtectedMutation, true);
});

test("buildApiRequestHeaders anexa token válido", () => {
  const result = buildApiRequestHeaders(
    { method: "POST", headers: { "Content-Type": "application/json" } },
    { apiBase: PUBLIC_API, token: "token-real", clientBuildId: "build-3" },
  );

  assert.equal(result.shouldBlockProtectedMutation, false);
  assert.equal(result.headers.get("authorization"), "Bearer token-real");
  assert.equal(result.headers.get("x-adops-auth-state"), "present");
});
