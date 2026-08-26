import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ops = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../../artifacts/api-server/src/app.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const insertions = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
const compose = await readFile(new URL("../../ops/portainer/adops-stack/docker-compose.yml", import.meta.url), "utf8");

test("reconcile é protegido e a criação idempotente é atômica", () => {
  assert.match(app, /app\.use\("\/api", internalApiGuard, router\)/);
  assert.match(ops, /router\.post\("\/ops\/schedules\/reconcile"/);
  assert.match(ops, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(ops, /payload_json::jsonb ->> 'idempotencyKey'/);
});

test("Mac Mini é a autoridade e o Worker fica proxy shadow", () => {
  assert.match(compose, /ADOPS_CONTROL_PLANE_PROVIDER: \$\{ADOPS_CONTROL_PLANE_PROVIDER:-macmini\}/);
  assert.match(compose, /OPS_API_BASE_URL: http:\/\/adops-api:4011/);
  assert.match(worker, /shouldProxyOpsToMacMini\(env\.ADOPS_CONTROL_PLANE_PROVIDER, path\)/);
  assert.match(worker, /canonical_scheduler_shadow/);
  assert.match(worker, /path === "\/api\/ops\/daily-print-alerts\/evaluate"/);
});

test("consumidores diários não retornam ao Worker quando o Mac Mini está ativo", () => {
  assert.match(ops, /router\.get\("\/ops\/daily-print-status"/);
  assert.match(ops, /router\.get\("\/ops\/daily-print-recoveries"/);
  assert.match(ops, /router\.post\("\/ops\/monthly-report-refreshes"/);
  assert.match(ops, /router\.post\("\/ops\/jobs\/evidence-monthly-report"/);
  assert.match(ops, /router\.post\("\/ops\/jobs\/campaign-publication-reconcile"/);
  assert.doesNotMatch(ops, /router\.post\("\/ops\/jobs\/campaign-publication-reconcile", \(req, res\) => void proxyPublicWorkerJob/);
  assert.doesNotMatch(ops, /router\.get\("\/ops\/incidents", \(req, res\) => void proxyPublicWorkerJob/);
});

test("scheduler entrega payload executável e terminais respeitam o lease", () => {
  assert.match(ops, /date: input\.targetDate/);
  assert.match(ops, /recoveryMode: "late_publication_recovery"/);
  assert.match(ops, /competencia: competenciaForDate\(input\.targetDate\)/);
  assert.match(ops, /expectedStatus: "running"/);
  assert.match(ops, /expectedRunnerId: runnerId/);
  assert.match(ops, /expectedUpdatedAt: record\.updated_at/);
  assert.match(ops, /return "job_execution"/);
  assert.doesNotMatch(ops, /incidentLayer \?\? "job"/);
});

test("claim do runner falha fechado e limita os tipos no Postgres", () => {
  assert.match(ops, /runnerId e ao menos um kind válido são obrigatórios/);
  assert.match(ops, /kind = ANY\(\$\$\{values\.length\}::text\[\]\)/);
});

test("OpenAPI publica os contratos operacionais do control plane", () => {
  for (const path of [
    "/api/ops/daily-print-status",
    "/api/ops/incidents",
    "/api/ops/runner/claim-next",
    "/api/ops/runner/heartbeat",
    "/api/ops/runner/jobs/{jobId}/progress",
  ]) {
    assert(ops.includes(`path: "${path}"`), `catálogo/OpenAPI sem ${path}`);
  }
});

test("overview diferencia runners ativos de registros históricos", () => {
  assert.match(ops, /recentHeartbeats = heartbeatRows\.filter/);
  assert.match(ops, /count: recentHeartbeats\.length \|\| null/);
  assert.match(ops, /registeredCount: heartbeatRows\.length \|\| null/);
});

test("refresh incremental mensal mantém somente um job ativo por competência", () => {
  assert.match(ops, /activeOnly = false/);
  assert.match(ops, /NOT \$3::boolean OR status IN \('queued', 'ready_for_runner'\)/);
  assert.doesNotMatch(ops, /NOT \$3::boolean OR status IN \('queued', 'ready_for_runner', 'running'\)/);
  assert.match(ops, /`evidence-monthly-report:\$\{competencia\}:incremental`/);
  assert.match(ops, /"evidence-approved-refresh", idempotencyKey, true\)/);
  assert.match(ops, /existingNotBefore/);
  assert.doesNotMatch(ops, /incremental:\$\{minuteBucket\}/);
});

test("reconciliacao consulta auditoria viva antes de criar recuperacao", () => {
  assert.match(ops, /readDailyPrintCandidateAudit/);
  assert.match(ops, /selectDailyPrintCandidates/);
  assert.match(ops, /getCaptureProofAuditForDate/);
  assert.match(ops, /suppressCompletedPrintRecoveries/);
  assert.match(ops, /auditGateEvaluated/);
  assert.match(insertions, /method: "HEAD", signal: AbortSignal\.timeout\(10_000\)/);
});
