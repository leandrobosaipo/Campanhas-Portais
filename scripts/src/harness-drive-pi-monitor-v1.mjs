#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/drive-pi-monitor-v1/${stamp}`);
await fs.mkdir(reportDir, { recursive: true });

const results = [];

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const data = await fn();
    results.push({ name, ok: true, durationMs: Date.now() - startedAt, data });
  } catch (error) {
    results.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
  }
}

async function read(filePath) {
  return fs.readFile(path.resolve(repoRoot, filePath), "utf8");
}

async function exists(filePath) {
  await fs.access(path.resolve(repoRoot, filePath));
  return filePath;
}

await check("apps-script-monitor", () => exists("ops/google-apps-script/drive-pi-monitor.gs"));
await check("d1-migration", () => exists("ops/cloudflare-public-api/migrations/0002_drive_pi_ingest.sql"));
await check("worker-endpoint", async () => {
  const source = await read("ops/cloudflare-public-api/src/index.ts");
  if (!source.includes("/api/ops/drive-pi-events")) throw new Error("Endpoint drive-pi-events ausente.");
  if (!source.includes("drive-pi-ingest")) throw new Error("Job kind drive-pi-ingest ausente no Worker.");
  return "worker endpoint ok";
});
await check("runner-kind", async () => {
  const source = await read("ops/cloudflare-remote-runner/src/runner.mjs");
  if (!source.includes("executeDrivePiIngest")) throw new Error("Processor executeDrivePiIngest ausente.");
  if (!source.includes("ADOPS_DRIVE_PI_ALLOW_MUTATION")) throw new Error("Guardrail de mutação ausente.");
  return "runner processor ok";
});
await check("runner-service-account-auth", async () => {
  const source = await read("ops/cloudflare-remote-runner/src/runner.mjs");
  if (!source.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE")) throw new Error("Suporte a arquivo de conta de servico ausente.");
  if (!source.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON")) throw new Error("Suporte a JSON de conta de servico ausente.");
  if (!source.includes("urn:ietf:params:oauth:grant-type:jwt-bearer")) throw new Error("Fluxo JWT bearer de conta de servico ausente.");
  if (!source.includes("https://www.googleapis.com/auth/drive.readonly")) throw new Error("Escopo readonly do Drive ausente.");
  return "runner service account auth ok";
});
await check("telegram-notification", async () => {
  const source = await read("ops/cloudflare-telegram-bot/src/index.ts");
  if (!source.includes("/ops/drive-pi-event")) throw new Error("Endpoint Telegram de PI Drive ausente.");
  return "telegram route ok";
});

const summary = { ok: results.every((item) => item.ok), results };
await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(reportDir, "summary.md"),
  ["# Harness Report - Drive PI Monitor v1", "", `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`, "", ...results.map((item) => `- ${item.ok ? "OK" : "FAIL"} ${item.name}`)].join("\n"),
);
console.log(JSON.stringify({ ok: summary.ok, reportDir }, null, 2));
process.exit(summary.ok ? 0 : 1);
