import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("API PostgreSQL não retorna jobs ao Worker aposentado", async () => {
  const [ops, insertions] = await Promise.all([
    read("artifacts/api-server/src/routes/ops.ts"),
    read("artifacts/api-server/src/routes/insertions.ts"),
  ]);
  for (const source of [ops, insertions]) {
    assert.doesNotMatch(source, /proxyPublicWorkerJob|proxyCampaignEvidenceWorkerRequest|adops-api-public\.leandro471\.workers\.dev/);
  }
});

test("claim respeita notBefore e só libera dependência concluída", async () => {
  const ops = await read("artifacts/api-server/src/routes/ops.ts");
  const claim = ops.slice(ops.indexOf('router.post("/ops/runner/claim-next"'), ops.indexOf('router.post("/ops/runner/jobs/:id/progress"'));
  assert.match(claim, /payload_json::jsonb ->> 'notBefore'/);
  assert.match(claim, /payload_json::jsonb ->> 'dependsOnJobId'/);
  assert.match(claim, /dependency\.status = 'completed'/);
  assert.match(claim, /SELECT cod5_candidato\.id FROM ops_jobs AS cod5_candidato/);
  assert.match(claim, /dependency\.id = cod5_candidato\.payload_json::jsonb ->> 'dependsOnJobId'/);
  assert.match(claim, /FOR UPDATE SKIP LOCKED/);
});

test("estado operacional migrado usa as tabelas PostgreSQL canônicas", async () => {
  const ops = await read("artifacts/api-server/src/routes/ops.ts");
  const recoveries = ops.slice(ops.indexOf('router.get("/ops/daily-print-recoveries"'), ops.indexOf('router.get("/ops/incidents"'));
  const incidents = ops.slice(ops.indexOf('router.get("/ops/incidents"'), ops.indexOf('router.post("/ops/jobs/print-single"'));
  assert.match(recoveries, /FROM daily_print_recoveries/);
  assert.doesNotMatch(recoveries, /FROM ops_jobs/);
  assert.match(incidents, /FROM ops_incidents/);
  assert.doesNotMatch(incidents, /status = 'failed'/);
  assert.match(ops, /async function cod5_falharJobComIncidente/);
  assert.match(ops, /ON CONFLICT \(fingerprint\) DO UPDATE/);
});

test("refresh mensal serializa revisões e o endpoint diário legado continua disponível", async () => {
  const ops = await read("artifacts/api-server/src/routes/ops.ts");
  assert.match(ops, /dirty_revision = monthly_report_refreshes\.dirty_revision \+ 1/);
  assert.match(ops, /status: "queued_after_running"/);
  assert.match(ops, /refreshRevision: cod5_revisao/);
  assert.match(ops, /router\.post\("\/ops\/jobs\/daily-print-batch"/);
  assert.match(ops, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
});

test("jobs idempotentes usam transação e advisory lock", async () => {
  const store = await read("artifacts/api-server/src/lib/ops-job-store.ts");
  assert.match(store, /cod5_cliente\.query\("BEGIN"\)/);
  assert.match(store, /pg_advisory_xact_lock/);
  assert.match(store, /payload_json::jsonb ->> 'idempotencyKey'/);
  assert.match(store, /cod5_cliente\.query\("COMMIT"\)/);
  assert.match(store, /cod5_cliente\.query\("ROLLBACK"\)/);
});

test("contratos locais cobrem Analytics e downloads legados", async () => {
  const [analytics, evidences, index] = await Promise.all([
    read("artifacts/api-server/src/routes/analytics.ts"),
    read("artifacts/api-server/src/routes/evidences.ts"),
    read("artifacts/api-server/src/routes/index.ts"),
  ]);
  for (const route of [
    "/analytics/insertions/:insertionId/requirements",
    "/analytics/jobs/request-report",
    "/analytics/jobs/:jobId",
    "/analytics/insertions/:insertionId/reports",
    "/analytics/reports/:jobId/download",
    "/analytics/reports/:jobId",
  ]) assert.match(analytics, new RegExp(route.replaceAll("/", "\\/")));
  for (const route of [
    "/campaign-evidence-exports/jobs",
    "/campaign-evidence-exports/jobs/batch",
    "/campaign-evidence-exports/jobs/:jobId",
    "/campaign-evidence-exports/jobs/:jobId/download",
  ]) assert.match(evidences, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(index, /router\.use\(analyticsRouter\)/);
  assert.match(analytics, /result\.execution/);
  assert.match(evidences, /result\.execution/);
  assert.match(analytics, /res\.redirect\(302,/);
  assert.match(evidences, /res\.redirect\(302,/);
});

test("auth da API mantém somente o POST unitário de campanha público e CORS explícito", async () => {
  const app = await read("artifacts/api-server/src/app.ts");
  assert.match(app, /req\.path === "\/campaign-evidence-exports\/jobs"/);
  assert.doesNotMatch(app, /publicAsyncCampaignExportPost[\s\S]{0,300}jobs\/batch/);
  assert.match(app, /authorization\.match\(\/\^Bearer/);
  assert.match(app, /cod5_bearerOperador === operatorApiToken/);
  assert.match(app, /https:\/\/adops-campanhas-portais\.pages\.dev/);
});

test("bot autentica criação PI e o PDF legado resolve pelo resultado do job", async () => {
  const [bot, insertions] = await Promise.all([
    read("ops/cloudflare-telegram-bot/src/index.ts"),
    read("artifacts/api-server/src/routes/insertions.ts"),
  ]);
  const createPi = bot.slice(bot.indexOf("async function createPiSiteExportJob"), bot.indexOf("async function fetchPiSiteExportJob"));
  assert.match(createPi, /\}, true\) as Promise/);
  assert.match(insertions, /pdfUrl: typeof artifactResult\?\.pdfUrl/);
  assert.match(insertions, /router\.get\("\/pi-site-exports\/jobs\/:jobId\/pdf"/);
  assert.match(insertions, /res\.redirect\(cod5_job\.pdfUrl\)/);
});

test("POST de exportação de campanha apenas descreve e enfileira", async () => {
  const evidences = await read("artifacts/api-server/src/routes/evidences.ts");
  const create = evidences.slice(evidences.indexOf("async function cod5_criarJobExportacaoEvidencias"), evidences.indexOf("function cod5_respostaJobExportacaoEvidencias"));
  assert.match(create, /describeCampaignEvidenceExport/);
  assert.match(create, /cod5_criarJobOperacional/);
  assert.doesNotMatch(create, /execFile|\.download\(|zipPath|writeFile/);
});

test("jobs importados em revisão humana são legíveis e nunca elegíveis ao claim", async () => {
  const ops = await read("artifacts/api-server/src/routes/ops.ts");
  assert.match(ops, /awaiting_human_review: "Aguardando revisão humana"/);
  const claim = ops.slice(ops.indexOf('router.post("/ops/runner/claim-next"'), ops.indexOf('router.post("/ops/runner/jobs/:id/progress"'));
  assert.match(claim, /status = 'ready_for_runner'/);
  assert.doesNotMatch(claim, /status IN \([^)]*awaiting_human_review/);
});
