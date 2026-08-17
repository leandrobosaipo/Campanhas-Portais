import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

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

test("POST publico de campanha chega ao Worker sem Bearer e rota interna continua protegida", async () => {
  const worker = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/campaign-evidence-exports/jobs") {
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, jobId: "job-test", status: "queued" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/campaign-evidence-exports/jobs/batch") {
      if (req.headers.authorization !== "Bearer configured-in-production") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "missing_forwarded_authorization" }));
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, counts: { total: 2, queued: 2 }, items: [] }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/ops/jobs/campaign-publication-reconcile") {
      if (req.headers.authorization !== "Bearer configured-in-production") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "missing_forwarded_authorization" }));
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, kind: "campaign-publication-reconcile", jobId: "reconcile-test", status: "ready_for_runner" }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/ops/incidents?limit=5") {
      if (req.headers.authorization !== "Bearer configured-in-production") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "missing_forwarded_authorization" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [{ id: "incident-test", layer: "audit" }] }));
      return;
    }
    res.writeHead(404).end();
  });
  const workerPort = await listen(worker);
  const apiPort = 41873;
  const api = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      PORT: String(apiPort),
      OPS_API_BASE_URL: `http://127.0.0.1:${workerPort}`,
      OPS_API_TOKEN: "configured-in-production",
      ADOPS_INTERNAL_API_TOKEN: "private-test-token",
      DATABASE_URL: "postgresql://adops:adops@127.0.0.1:9/adops",
    },
    stdio: "ignore",
  });
  try {
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    await waitForHealth(baseUrl);
    const queued = await fetch(`${baseUrl}/api/campaign-evidence-exports/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ piCodigo: "17048", competencia: "AGOSTO/2026" }),
    });
    assert.equal(queued.status, 202);
    assert.equal((await queued.json()).jobId, "job-test");
    const unauthorizedBatch = await fetch(`${baseUrl}/api/campaign-evidence-exports/jobs/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competencia: "AGOSTO/2026", campaigns: [{ piCodigo: "17048" }, { piCodigo: "17190" }] }),
    });
    assert.equal(unauthorizedBatch.status, 401);
    const batch = await fetch(`${baseUrl}/api/campaign-evidence-exports/jobs/batch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer configured-in-production" },
      body: JSON.stringify({ competencia: "AGOSTO/2026", campaigns: [{ piCodigo: "17048" }, { piCodigo: "17190" }] }),
    });
    assert.equal(batch.status, 202);
    assert.equal((await batch.json()).counts.total, 2);
    const reconcile = await fetch(`${baseUrl}/api/ops/jobs/campaign-publication-reconcile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer configured-in-production" },
      body: JSON.stringify({ targetDate: "2026-08-13" }),
    });
    assert.equal(reconcile.status, 202);
    assert.equal((await reconcile.json()).jobId, "reconcile-test");
    const unauthorizedIncidents = await fetch(`${baseUrl}/api/ops/incidents?limit=5`);
    assert.equal(unauthorizedIncidents.status, 401);
    const incidents = await fetch(`${baseUrl}/api/ops/incidents?limit=5`, {
      headers: { authorization: "Bearer configured-in-production" },
    });
    assert.equal(incidents.status, 200);
    assert.equal((await incidents.json()).items[0].id, "incident-test");
    const internal = await fetch(`${baseUrl}/api/internal/campaign-evidence-exports?piCodigo=17048&competencia=AGOSTO%2F2026`);
    assert.equal(internal.status, 401);
  } finally {
    api.kill("SIGTERM");
    await new Promise((resolve) => worker.close(resolve));
  }
});
