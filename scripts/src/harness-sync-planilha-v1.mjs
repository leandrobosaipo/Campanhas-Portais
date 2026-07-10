#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/sync-planilha-v1/${stamp}`);
await fs.mkdir(reportDir, { recursive: true });

const allowMutation = process.env.ADOPS_HARNESS_ALLOW_MUTATION === "true";
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

await check("package-script-sync-planilha", async () => {
  const pkg = JSON.parse(await fs.readFile(path.resolve(repoRoot, "scripts/package.json"), "utf8"));
  if (!pkg.scripts?.["sync:planilha"]) throw new Error("script sync:planilha ausente");
  return pkg.scripts["sync:planilha"];
});
await check("spec-deduplicacao", () => exists("docs/spec-sync-planilha-v1.md"));
await check("reconcile-disponivel", () => exists("scripts/src/reconcile-planilha-adrotate.ts"));
await check("modo-mutacao-explicito", async () => ({ allowMutation }));

if (allowMutation) {
  await check("sync-planilha-real", async () => {
    const run = spawnSync("pnpm", ["--dir", "scripts", "run", "sync:planilha"], { cwd: repoRoot, encoding: "utf8", timeout: 1000 * 60 * 5 });
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "sync falhou").slice(0, 2000));
    return { stdout: run.stdout.slice(-2000) };
  });
}

const summary = { ok: results.every((item) => item.ok), allowMutation, results };
await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(reportDir, "summary.md"),
  ["# Harness Report - Sync Planilha v1", "", `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`, `- Mutacao habilitada: ${allowMutation}`, "", ...results.map((item) => `- ${item.ok ? "OK" : "FAIL"} ${item.name}`)].join("\n"),
);
console.log(JSON.stringify({ ok: summary.ok, reportDir }, null, 2));
process.exit(summary.ok ? 0 : 1);
