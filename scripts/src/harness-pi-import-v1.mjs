#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/pi-import-v1/${stamp}`);
await fs.mkdir(reportDir, { recursive: true });

const allowMutation = process.env.ADOPS_HARNESS_ALLOW_MUTATION === "true";
const inputDir = process.env.ADOPS_PI_INPUT_DIR || "/Users/leandrobosaipo/Downloads/pi-adops-2.5.26";
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

async function exists(filePath) {
  await fs.access(path.resolve(repoRoot, filePath));
  return filePath;
}

await check("prd-pi-import", () => exists("docs/prd-pi-import-v1.md"));
await check("spec-pi-import", () => exists("docs/spec-pi-import-v1.md"));
await check("harness-pi-import", () => exists("docs/harness-pi-import-v1.md"));
await check("sync-harness", () => exists("scripts/src/harness-sync-planilha-v1.mjs"));
await check("reconcile-harness", () => exists("scripts/src/harness-reconcile-planilha-adrotate-v1.mjs"));
await check("input-dir-readable", async () => {
  const items = await fs.readdir(inputDir);
  return { inputDir, totalFiles: items.length, pdfs: items.filter((item) => item.toLowerCase().endsWith(".pdf")).length };
});
await check("mutacao-bloqueada-por-padrao", async () => ({ allowMutation }));

const summary = { ok: results.every((item) => item.ok), allowMutation, inputDir, results };
await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(reportDir, "summary.md"),
  ["# Harness Report - PI Import v1", "", `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`, `- Pasta: ${inputDir}`, `- Mutacao habilitada: ${allowMutation}`, "", ...results.map((item) => `- ${item.ok ? "OK" : "FAIL"} ${item.name}`)].join("\n"),
);
console.log(JSON.stringify({ ok: summary.ok, reportDir }, null, 2));
process.exit(summary.ok ? 0 : 1);
