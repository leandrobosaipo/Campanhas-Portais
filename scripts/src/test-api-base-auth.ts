import test from "node:test";
import assert from "node:assert/strict";

import { buildApiRequestHeaders } from "../../artifacts/adops/src/lib/api-base.ts";
import { getRuntimeApiBaseUrl } from "../../artifacts/adops/src/lib/runtime-api.ts";

const PUBLIC_API = "https://adops-api-public.leandro471.workers.dev";
const COD5_PUBLIC_API = "https://adops-api.codigo5.com.br";

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

test("adops.codigo5.com.br usa a API pública do Mac Mini", () => {
  const cod5_windowOriginal = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hostname: "adops.codigo5.com.br" } },
  });

  try {
    assert.equal(getRuntimeApiBaseUrl(), COD5_PUBLIC_API);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: cod5_windowOriginal });
  }
});

test("buildApiRequestHeaders bloqueia mutação direta sem token", () => {
  const result = buildApiRequestHeaders(
    { method: "POST" },
    { apiBase: COD5_PUBLIC_API, token: "", clientBuildId: "build-direct" },
  );

  assert.equal(result.shouldBlockProtectedMutation, true);
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
