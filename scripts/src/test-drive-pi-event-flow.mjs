#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerSourcePath = path.join(repoRoot, "ops/cloudflare-public-api/src/index.ts");
const apiOpsRoutePath = path.join(repoRoot, "artifacts/api-server/src/routes/ops.ts");
const wranglerConfigPath = path.join(repoRoot, "ops/cloudflare-public-api/wrangler.jsonc");
const monitorDeployPath = path.join(repoRoot, "ops/portainer/deploy-drive-pi-monitor.mjs");
const envCandidates = [
  path.join(repoRoot, ".env.adops-operator.local"),
  path.join(repoRoot, "ops/cloudflare-public-api/.env.ops.local"),
];
const API_BASE = process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api.codigo5.com.br";
const EXPECTED_RUNNER_ID = process.env.ADOPS_EXPECTED_RUNNER_ID || "runner-1";
const liveSmokeReportRoot = path.join(repoRoot, "docs/harness-reports/drive-pi-live-smoke");
const results = [];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of read(filePath).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

function readOpsToken() {
  if (process.env.OPS_API_TOKEN) return process.env.OPS_API_TOKEN.trim();
  for (const candidate of envCandidates) {
    const token = parseEnv(candidate).OPS_API_TOKEN;
    if (token) return token.trim();
  }
  return "";
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const data = await fn();
    results.push({ name, ok: true, durationMs: Date.now() - startedAt, data });
  } catch (error) {
    results.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(content, markers, label) {
  const missing = markers.filter((marker) => !content.includes(marker));
  assert(missing.length === 0, `${label} sem marcador(es): ${missing.join(", ")}`);
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writeLiveSmokeReport(evidence) {
  const reportDir = path.join(liveSmokeReportRoot, timestampForPath(new Date(evidence.createdAt)));
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "results.json"), `${JSON.stringify(evidence, null, 2)}\n`);

  const statusLine = evidence.ok ? "PASS" : "FAIL";
  const conclusion = evidence.ok
    ? "Smoke validou o Safe PI Intake no Mac Mini."
    : "Smoke nao validou o Mac Mini; conferir API alvo e runner concorrente.";
  const summary = [
    "# Drive PI Live Smoke",
    "",
    `- Resultado: ${statusLine}`,
    `- Gerado em: ${evidence.createdAt}`,
    `- API usada: ${evidence.apiBase}`,
    `- Runner esperado: ${evidence.expectedRunnerId}`,
    `- Runner observado: ${evidence.runnerId || "ausente"}`,
    `- Job: ${evidence.jobId || "ausente"}`,
    `- Stage: ${evidence.stageKey || "ausente"}`,
    `- Status: ${evidence.status || "ausente"}`,
    `- Replay duplicado: ${evidence.duplicate === true ? "sim" : "nao"}`,
    `- Conclusao: ${conclusion}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(reportDir, "summary.md"), summary);
  return reportDir;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text.slice(0, 400) };
  }
  return { response, payload };
}

await check("worker-main-usa-typescript", async () => {
  const config = read(wranglerConfigPath);
  assert(config.includes('"main": "src/index.ts"'), "wrangler precisa publicar src/index.ts, nao arquivo compilado antigo");
  return { main: "src/index.ts" };
});

await check("worker-allowlists-incluem-drive-pi-ingest", async () => {
  const source = read(workerSourcePath);
  assertIncludes(source, [
    "drive-pi-ingest",
    "reconcile-adrotate",
    "adrotate-link",
    "telegram-send-evidence",
    "const OPS_JOB_KINDS",
    "OPS_JOB_KINDS.includes",
    'if (path === "/api/ops/drive-pi-events")',
  ], "Worker Drive PI");
  return { ok: true };
});

await check("ops-api-catalog-expõe-openapi", async () => {
  const source = read(apiOpsRoutePath);
  assertIncludes(source, [
    'router.get("/ops/openapi.json"',
    'router.get("/ops/docs"',
    "buildOpsOpenApiDocument",
    '<a href="/api/ops/openapi.json">OpenAPI</a>',
    '<a href="/api/ops/docs">Swagger UI</a>',
  ], "Ops API OpenAPI catalog");
  return { ok: true };
});

await check("ops-api-expõe-runtime-readiness-sem-segredos", async () => {
  const source = read(apiOpsRoutePath);
  assertIncludes(source, [
    'router.get("/ops/runtime-readiness"',
    "buildOpsRuntimeReadiness",
    "readRunnerLiveness",
    "runnerLiveness",
    "lastRunnerSeenAt",
    "recentRunnerWindowMinutes",
    "noSecretValues: true",
    "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
    "TELEGRAM_BOT_TOKEN",
    "ADOPS_DRIVE_PI_ALLOW_MUTATION",
    'id: "runtime-readiness"',
  ], "Ops API runtime readiness");
  return { ok: true };
});

await check("monitor-nao-aborta-varredura-por-um-evento-ruim", async () => {
  const source = read(monitorDeployPath);
  assertIncludes(source, [
    "const failed = [];",
    "evento falhou",
    "if (previous) currentItems[item.driveFileId] = previous;",
    "else delete currentItems[item.driveFileId];",
  ], "Monitor Drive PI");
  return { ok: true };
});

await check("runner-infere-competencia-quando-periodo-nao-cruza-mes", async () => {
  const source = read(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"));
  assertIncludes(source, [
    "function inferCompetenciaFromInsertionPeriod",
    "periodoInicio",
    "periodoFim",
    "inicio.year !== fim.year || inicio.month !== fim.month",
    "competenciaInference",
    "periodoInicio/periodoFim no mesmo mes",
  ], "Runner competencia inference");
  return { ok: true };
});

await check("live-smoke-drive-pi-event-duplicate-progress", async () => {
  if (process.env.ADOPS_DRIVE_PI_LIVE_SMOKE !== "true") {
    return { skipped: "Defina ADOPS_DRIVE_PI_LIVE_SMOKE=true para criar evento sintetico na API alvo." };
  }
  const token = readOpsToken();
  assert(token, "OPS_API_TOKEN ausente para live smoke.");

  const now = new Date().toISOString();
  const unique = `cod5synthetic${Date.now()}`;
  const event = {
    eventId: `drive:${unique}:${now}`,
    driveFileId: unique,
    name: "COD5 TESTE AUTOMATICO - pasta sem PI real",
    mimeType: "application/vnd.google-apps.folder",
    path: "/COD5 TESTE AUTOMATICO",
    parentFolderId: "cod5-synthetic-parent",
    modifiedTime: now,
    webViewLink: "https://drive.google.com/drive/folders/cod5synthetic",
    eventType: "folder_created",
  };

  const first = await fetchJson(`${API_BASE}/api/ops/drive-pi-events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  assert(first.response.status === 202, `primeiro POST deveria ser 202, veio ${first.response.status}: ${JSON.stringify(first.payload)}`);
  assert(first.payload?.kind === "drive-pi-ingest", "primeiro POST deveria criar drive-pi-ingest");
  assert(first.payload?.jobId, "primeiro POST deveria retornar jobId");

  const duplicate = await fetchJson(`${API_BASE}/api/ops/drive-pi-events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  assert(duplicate.response.status === 200, `POST duplicado deveria ser 200, veio ${duplicate.response.status}: ${JSON.stringify(duplicate.payload)}`);
  assert(duplicate.payload?.duplicate === true, "POST duplicado deveria retornar duplicate=true");

  let progressPayload = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000));
    const progress = await fetchJson(`${API_BASE}/api/ops/jobs/${encodeURIComponent(first.payload.jobId)}/progress`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(progress.response.status === 200, `progress deveria ser 200, veio ${progress.response.status}: ${JSON.stringify(progress.payload)}`);
    progressPayload = progress.payload;
    if (["completed", "failed"].includes(progressPayload?.status)) break;
  }
  assert(progressPayload?.kind === "drive-pi-ingest", "progress deveria ser drive-pi-ingest");
  assert(progressPayload?.status === "completed", `job sintetico deveria completar como needs_review, status=${progressPayload?.status}`);
  assert(progressPayload?.stageKey === "needs_review", `stage esperado needs_review, veio ${progressPayload?.stageKey}`);

  const filteredJobs = await fetchJson(`${API_BASE}/api/ops/jobs?kind=drive-pi-ingest&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(filteredJobs.response.status === 200, `listagem por kind deveria ser 200, veio ${filteredJobs.response.status}: ${JSON.stringify(filteredJobs.payload)}`);
  const listedJob = Array.isArray(filteredJobs.payload?.items)
    ? filteredJobs.payload.items.find((item) => item.id === first.payload.jobId || item.jobId === first.payload.jobId)
    : null;
  assert(listedJob, "listagem /api/ops/jobs?kind=drive-pi-ingest deveria incluir o job sintetico");

  const runnerOk = progressPayload.runnerId === EXPECTED_RUNNER_ID;
  const evidence = {
    ok: runnerOk,
    apiBase: API_BASE,
    expectedRunnerId: EXPECTED_RUNNER_ID,
    eventId: event.eventId,
    jobId: first.payload.jobId,
    duplicate: duplicate.payload.duplicate,
    status: progressPayload.status,
    stageKey: progressPayload.stageKey,
    runnerId: progressPayload.runnerId,
    createdAt: new Date().toISOString(),
  };
  const reportDir = writeLiveSmokeReport(evidence);
  assert(
    runnerOk,
    `runner esperado ${EXPECTED_RUNNER_ID}, veio ${progressPayload.runnerId || "ausente"}. Se veio runner-vps-1, provavel uso do control plane legado.`,
  );

  return {
    eventId: event.eventId,
    jobId: first.payload.jobId,
    duplicate: duplicate.payload.duplicate,
    apiBase: API_BASE,
    expectedRunnerId: EXPECTED_RUNNER_ID,
    reportDir,
    progress: {
      status: progressPayload.status,
      stageKey: progressPayload.stageKey,
      runnerId: progressPayload.runnerId,
    },
  };
});

const ok = results.every((item) => item.ok);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
