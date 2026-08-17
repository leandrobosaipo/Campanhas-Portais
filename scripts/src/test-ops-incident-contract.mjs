import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");

test("falhas de runner persistem incidente sanitizado e idempotente", () => {
  assert.match(worker, /async function recordOpsIncident/);
  assert.match(worker, /async function failOpsJobWithIncident/);
  assert.match(worker, /env\.adops_ops\.batch\(statements\)/);
  assert.match(worker, /INSERT INTO ops_incidents/);
  assert.match(worker, /ON CONFLICT\(fingerprint\) DO UPDATE/);
  assert.match(worker, /isSensitiveJobKey\(key\) \? "\[redacted\]"/);
  for (const key of ["accessToken", "apiKey", "clientSecret", "authorizationHeader"]) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    assert.ok(normalized.includes("authorization") || normalized.endsWith("token") || normalized.endsWith("apikey") || normalized.endsWith("secret"));
  }
  assert.match(worker, /current\.status !== "running" \|\| current\.runner_id !== runnerId/);
});

test("incidentes são consultáveis somente pela API operacional", () => {
  assert.match(worker, /path === "\/api\/ops\/incidents"/);
  assert.match(worker, /requireOpsAuth\(request, env\)/);
});

test("falha ao agendar a reconciliação diária também abre incidente de agendamento", () => {
  assert.match(worker, /function recordSchedulingIncident/);
  assert.match(worker, /"scheduling"\);/);
  assert.match(worker, /daily_reconciliation_schedule_failed/);
  assert.match(worker, /recordSchedulingIncident\(env, schedulingKind, targetDate, message\)/);
});
