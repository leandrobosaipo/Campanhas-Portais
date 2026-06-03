#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/drive-pi-monitor-first-v4/${stamp}`);
await fs.mkdir(reportDir, { recursive: true });

const results = [];

async function readProjectFile(relativePath) {
  return fs.readFile(path.resolve(repoRoot, relativePath), "utf8");
}

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const data = await fn();
    results.push({ name, ok: true, durationMs: Date.now() - startedAt, data });
  } catch (error) {
    results.push({
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function requireIncludes(content, markers, label) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) throw new Error(`${label} sem marcadores: ${missing.join(", ")}`);
  return { markers };
}

await check("worker-aceita-intake-locked", async () => {
  const source = await readProjectFile("ops/cloudflare-public-api/src/index.ts");
  return requireIncludes(source, [
    "intake_locked",
    "Intake travado",
    "allowedStatuses",
  ], "Worker Drive PI");
});

await check("telegram-inicial-orienta-nao-cadastrar", async () => {
  const source = await readProjectFile("ops/cloudflare-telegram-bot/src/index.ts");
  return requireIncludes(source, [
    "Processo automático iniciado; não cadastre manualmente ainda",
    "packageClass",
    "intakeLock",
  ], "Telegram Drive PI");
});

await check("runner-cria-lock-antes-do-packaging", async () => {
  const source = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  const intakeIndex = source.indexOf('"intake_locked"');
  const packagingIndex = source.indexOf('"packaging"');
  if (intakeIndex === -1 || packagingIndex === -1 || intakeIndex > packagingIndex) {
    throw new Error("intake_locked precisa aparecer antes de packaging no fluxo executeDrivePiIngest.");
  }
  return requireIncludes(source, [
    "const intakeLock =",
    "Nova entrada do Drive em processamento automatico",
    "notifyDrivePiTelegram({",
    'status: "intake_locked"',
  ], "Runner intake lock");
});

await check("runner-classifica-pacote", async () => {
  const source = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  return requireIncludes(source, [
    "function classifyDrivePiPackage",
    "function validateDrivePiPackageReadiness",
    "folder_empty",
    "missing_pi_pdf",
    "missing_media",
    "pi_and_media_present",
    "pdf_only",
    "media_only",
    "missing_pi_pdf_and_media",
    "packageClassification",
  ], "Runner package classifier");
});

await check("runner-bloqueia-auto-apply-incompleto-e-dedupe-conflitante", async () => {
  const source = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  return requireIncludes(source, [
    "validateDrivePiPackageReadiness(packageClassification, fields)",
    "validateDrivePiDedupeSafety(fields)",
    "dedupe_conflict",
    "missing_pi_pdf",
    "missing_media",
    "needs_media",
    "reviewReasons",
    "canApply = validation.ok && packageReadiness.ok && rollout.ok && dedupe.ok",
  ], "Runner safe apply gate");
});

await check("ia-recebe-classificacao-sem-mutacao", async () => {
  const source = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  return requireIncludes(source, [
    "packageClassification: packageContext.packageClassification",
    "A IA nao aplica mudancas",
    "ADOPS_DRIVE_PI_ALLOW_MUTATION",
    "ADOPS_PI_AGENT_AUTO_APPLY",
  ], "Runner AI guardrail");
});

await check("competencia-e-inferida-por-periodo-seguro", async () => {
  const runner = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  const prompts = await readProjectFile("docs/adops/pi-automation-v3/prompts.md");
  const knowledge = await readProjectFile("docs/adops/pi-automation-v3/spm-agent-knowledge.md");
  return {
    runner: requireIncludes(runner, [
      "function inferCompetenciaFromInsertionPeriod",
      "periodoInicio",
      "periodoFim",
      "inicio.year !== fim.year || inicio.month !== fim.month",
      "competenciaInference",
      "periodoInicio/periodoFim no mesmo mes",
    ], "Runner competencia inference"),
    prompts: requireIncludes(prompts, [
      "Quando houver periodo de veiculacao com inicio e fim no mesmo mes",
      "`competencia` como `MM/YYYY`",
    ], "Prompt competencia inference"),
    knowledge: requireIncludes(knowledge, [
      "inicio e fim no mesmo mes",
      "formato `MM/YYYY`",
      "periodo cruzar meses diferentes",
    ], "SPM knowledge competencia inference"),
  };
});

await check("telegram-mostra-pendencias-objetivas", async () => {
  const source = await readProjectFile("ops/cloudflare-telegram-bot/src/index.ts");
  const adapter = await readProjectFile("ops/telegram-adapter/server.mjs");
  return {
    worker: requireIncludes(source, [
    "Motivos de revisão:",
    "Conflitos de dedupe:",
    "reviewReasons",
    "dedupeConflicts",
    ], "Telegram Worker review reasons"),
    adapter: requireIncludes(adapter, [
      "reviewReasons",
      "dedupe_conflict",
      "mídia pública",
      "conflito de duplicidade",
    ], "Telegram adapter review reasons"),
  };
});

await check("intakes-do-print-spm-sao-explicitos-e-travados", async () => {
  const script = await readProjectFile("scripts/src/create-spm-whatsapp-print-intakes-2026-06-03.mjs");
  const pkg = await readProjectFile("scripts/package.json");
  return {
    script: requireIncludes(script, [
      "ADOPS_CREATE_SPM_PRINT_INTAKE=true",
      "PERR-ALMT-CIDADANIA-MEGABANNER-TOPO",
      "PERR-ALMT-CIDADANIA-VIDEO",
      "ROO-CAMPANHA-2026-06-05",
      "AFL-CAMPANHA-2026-06-09",
      "piCodigo: null",
      "eventType: \"folder_created\"",
    ], "SPM WhatsApp intake script"),
    packageJson: requireIncludes(pkg, [
      "intake:spm-whatsapp-print-2026-06-03",
    ], "scripts package"),
  };
});

await check("plano-v4-versionado", async () => {
  const source = await readProjectFile("docs/adops/pi-automation-v4-monitor-first-ai-gate.md");
  return requireIncludes(source, [
    "intake lock",
    "Telegram no inicio",
    "Classificador deterministico antes da IA",
    "Gate de auto-apply",
  ], "Plano v4");
});

const summary = {
  ok: results.every((item) => item.ok),
  generatedAt: new Date().toISOString(),
  reportDir,
  results,
};

await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(reportDir, "summary.md"),
  [
    "# Harness Report - Drive PI Monitor First v4",
    "",
    `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`,
    `- Gerado em: ${summary.generatedAt}`,
    `- Pasta: ${reportDir}`,
    "",
    ...results.map((item) => `- ${item.ok ? "OK" : "FAIL"} ${item.name}${item.error ? ` - ${item.error}` : ""}`),
    "",
  ].join("\n"),
);

console.log(JSON.stringify({ ok: summary.ok, reportDir, checks: results.length }, null, 2));
process.exit(summary.ok ? 0 : 1);
