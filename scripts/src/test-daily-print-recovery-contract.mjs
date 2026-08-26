import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../../ops/cloudflare-public-api/migrations/0006_daily_print_recoveries.sql", import.meta.url), "utf8");
const alertMigration = await readFile(new URL("../../ops/cloudflare-public-api/migrations/0007_daily_print_alerts.sql", import.meta.url), "utf8");
const postgresAlertMigration = await readFile(new URL("../../ops/portainer/adops-stack/migrations/2026-08-26-daily-print-alerts.sql", import.meta.url), "utf8");
const macMiniOps = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const telegram = await readFile(new URL("../../ops/cloudflare-telegram-bot/src/index.ts", import.meta.url), "utf8");

test("recuperação persiste três tentativas em 5, 10 e 15 minutos", () => {
  assert.match(worker, /RECOVERY_DELAYS_MINUTES\s*=\s*\[5, 10, 15\]/);
  assert.match(worker, /daily-print-recovery:\$\{input\.targetDate\}:\$\{input\.insertionId\}:attempt:\$\{input\.attempt\}/);
  assert.match(worker, /attempt >= 3/);
  assert.match(worker, /status='blocked'/);
  assert.match(migration, /PRIMARY KEY \(target_date, insertion_id\)/);
});

test("alerta operacional usa claim idempotente e só resolve incidente já aberto", () => {
  assert.match(alertMigration, /fingerprint TEXT PRIMARY KEY/);
  assert.match(postgresAlertMigration, /fingerprint text PRIMARY KEY/);
  assert.match(macMiniOps, /router\.post\("\/ops\/daily-print-alerts\/claim"/);
  assert.match(worker, /no_previous_incident/);
  assert.match(worker, /INSERT OR IGNORE INTO daily_print_alerts/);
  assert.match(telegram, /daily-print-alerts\/claim/);
  assert.match(telegram, /const alertTimes = new Set\(\["18:45".+"08:30"\]\)/);
});

test("aprovação interrompe retries e runner não recaptura evidência válida", () => {
  assert.match(worker, /\["ok", "ok_best_effort"\]\.includes\(item\.status\)/);
  assert.match(worker, /status='completed'/);
  assert.match(runner, /\["ok", "ok_best_effort"\]\.includes\(preItem\.status\)/);
  assert.match(runner, /reason: "evidencia_auditada"/);
});

test("status oferece JSON compacto para avaliação econômica", () => {
  assert.match(worker, /status: blocked \|\| empty \? "blocked" : pending \? "retryable" : "complete"/);
  assert.match(worker, /daily_print_recovery_audit_unavailable/);
  assert.match(worker, /A tentativa não pôde ser agendada; as demais campanhas continuaram/);
  assert.match(worker, /A próxima tentativa não pôde ser agendada; é necessária análise humana/);
  assert.match(worker, /json_extract\(payload_json,'\$\.date'\)=\?/);
});
