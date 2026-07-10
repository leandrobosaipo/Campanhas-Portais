#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/reconcile-planilha-adrotate-v1/${stamp}`);
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

async function optionalExists(filePath) {
  try {
    return { filePath: await exists(filePath), present: true };
  } catch (error) {
    return {
      filePath,
      present: false,
      skipped: true,
      reason: "Documento fora do pacote de runtime. A validacao bloqueante fica em codigo/config/API.",
    };
  }
}

await check("package-script-reconcile", async () => {
  const pkg = JSON.parse(await fs.readFile(path.resolve(repoRoot, "scripts/package.json"), "utf8"));
  if (!pkg.scripts?.["reconcile:planilha-adrotate"]) throw new Error("script reconcile:planilha-adrotate ausente");
  return pkg.scripts["reconcile:planilha-adrotate"];
});
await check("spec-reconcile", () => optionalExists("docs/spec-reconcile-planilha-adrotate-v1.md"));
await check("config-portais", () => exists("config/adrotate-sites.json"));
await check("capture-rules-audit", async () => {
  const run = spawnSync("node", ["scripts/src/audit-capture-rules-integrity.mjs"], { cwd: repoRoot, encoding: "utf8", timeout: 1000 * 60 * 2 });
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || "audit falhou").slice(0, 2000));
  return { stdout: run.stdout.slice(-2000) };
});
await check("modo-mutacao-explicito", async () => ({ allowMutation }));

if (allowMutation) {
  await check("reconcile-real", async () => {
    const run = spawnSync("pnpm", ["--dir", "scripts", "run", "reconcile:planilha-adrotate"], { cwd: repoRoot, encoding: "utf8", timeout: 1000 * 60 * 8 });
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || "reconcile falhou").slice(0, 2000));
    return { stdout: run.stdout.slice(-2000) };
  });
}

const summary = { ok: results.every((item) => item.ok), allowMutation, results };
await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(reportDir, "summary.md"),
  ["# Harness Report - Reconcile Planilha AdRotate v1", "", `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`, `- Mutacao habilitada: ${allowMutation}`, "", ...results.map((item) => `- ${item.ok ? "OK" : "FAIL"} ${item.name}`)].join("\n"),
);
console.log(JSON.stringify({ ok: summary.ok, reportDir }, null, 2));
process.exit(summary.ok ? 0 : 1);
