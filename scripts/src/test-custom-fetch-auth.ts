import test from "node:test";
import assert from "node:assert/strict";

import {
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
  setClientBuildGetter,
} from "../../lib/api-client-react/src/custom-fetch.ts";

const PUBLIC_API = "https://adops-api-public.leandro471.workers.dev";

test.afterEach(() => {
  setBaseUrl(null);
  setAuthTokenGetter(null);
  setClientBuildGetter(null);
  (globalThis as any).fetch = undefined;
});

test("customFetch bloqueia mutação pública sem token", async () => {
  setBaseUrl(PUBLIC_API);
  setAuthTokenGetter(() => null);
  setClientBuildGetter(() => "build-a");

  await assert.rejects(
    () => customFetch("/api/evidences/231", { method: "DELETE" }),
    /Acao operacional protegida/,
  );
});

test("customFetch trata getter com token vazio serializado como ausente", async () => {
  setBaseUrl(PUBLIC_API);
  setAuthTokenGetter(() => '""');
  setClientBuildGetter(() => "build-b");

  await assert.rejects(
    () => customFetch("/api/evidences/231", { method: "DELETE" }),
    /Acao operacional protegida/,
  );
});

test("customFetch envia headers de diagnóstico e Authorization com token válido", async () => {
  setBaseUrl(PUBLIC_API);
  setAuthTokenGetter(() => "token-real");
  setClientBuildGetter(() => "build-c");

  let capturedHeaders: Headers | null = null;
  (globalThis as any).fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = new Headers(init?.headers ?? {});
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const payload = await customFetch<{ ok: boolean }>("/api/evidences/231", {
    method: "DELETE",
    responseType: "json",
  });

  assert.equal(payload.ok, true);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer token-real");
  assert.equal(capturedHeaders?.get("x-adops-auth-state"), "present");
  assert.equal(capturedHeaders?.get("x-adops-client-build"), "build-c");
});
