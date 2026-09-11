import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API test server did not become healthy");
}

test("API local preserva fronteiras de auth e CORS após retirar o proxy", async () => {
  const apiPort = 41873;
  const api = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      PORT: String(apiPort),
      OPS_API_TOKEN: "configured-in-production",
      ADOPS_INTERNAL_API_TOKEN: "private-test-token",
      DATABASE_URL: "postgresql://adops:adops@127.0.0.1:9/adops",
    },
    stdio: "ignore",
  });
  try {
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    await waitForHealth(baseUrl);

    const unauthorizedBatch = await fetch(`${baseUrl}/api/campaign-evidence-exports/jobs/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competencia: "AGOSTO/2026", campaigns: [{ piCodigo: "17048" }] }),
    });
    assert.equal(unauthorizedBatch.status, 401);

    const unauthorizedAnalytics = await fetch(`${baseUrl}/api/analytics/jobs/request-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ insertionId: 1 }),
    });
    assert.equal(unauthorizedAnalytics.status, 401);

    const internal = await fetch(`${baseUrl}/api/internal/campaign-evidence-exports?piCodigo=17048&competencia=AGOSTO%2F2026`);
    assert.equal(internal.status, 401);

    const preflight = await fetch(`${baseUrl}/api/campaign-evidence-exports/jobs`, {
      method: "OPTIONS",
      headers: {
        origin: "https://adops-campanhas-portais.pages.dev",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,idempotency-key",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://adops-campanhas-portais.pages.dev");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const rejectedOrigin = await fetch(`${baseUrl}/api/healthz`, { headers: { origin: "https://externo.invalid" } });
    assert.equal(rejectedOrigin.headers.get("access-control-allow-origin"), null);
  } finally {
    api.kill("SIGTERM");
  }
});
