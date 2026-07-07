#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(repoRoot, `docs/harness-reports/pi-automation-v3/${stamp}`);
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
  if (missing.length > 0) {
    throw new Error(`${label} sem marcadores: ${missing.join(", ")}`);
  }
  return { markers };
}

await check("docs-v3-existem", async () => {
  const docs = [
    "docs/README.md",
    "docs/adops/pi-automation-v3/prd.md",
    "docs/adops/pi-automation-v3/blueprint.md",
    "docs/adops/pi-automation-v3/sdd.md",
    "docs/adops/pi-automation-v3/spec.md",
    "docs/adops/pi-automation-v3/harness.md",
    "docs/adops/pi-automation-v3/tests.md",
    "docs/adops/pi-automation-v3/playbook.md",
    "docs/adops/pi-automation-v3/runbook.md",
    "docs/adops/pi-automation-v3/prompts.md",
    "docs/adops/pi-automation-v3/spm-agent-knowledge.md",
  ];
  await Promise.all(docs.map((item) => fs.access(path.resolve(repoRoot, item))));
  return { docs };
});

await check("hub-aponta-para-v3", async () => {
  const start = await readProjectFile("docs/START_HERE_ADOPS.md");
  const map = await readProjectFile("docs/PROJECT_MAP_ADOPS.md");
  requireIncludes(start, ["docs/README.md", "docs/adops/pi-automation-v3/spec.md", "referência histórica"], "START_HERE");
  requireIncludes(map, ["docs/adops/pi-automation-v3/", "harness:pi-automation-v3", "GIF"], "PROJECT_MAP");
  return { ok: true };
});

await check("hierarquia-de-fonte-v3", async () => {
  const hub = await readProjectFile("docs/README.md");
  const spec = await readProjectFile("docs/adops/pi-automation-v3/spec.md");
  return requireIncludes(
    `${hub}\n${spec}`,
    ["PDF/e-mail", "Pasta Drive", "Planilha", "AdOps", "AdRotate", "WhatsApp"],
    "hierarquia de fonte",
  );
});

await check("gif-capture-only-no-capturador", async () => {
  const source = await readProjectFile("scripts/src/capture-insertion-proof.cjs");
  return requireIncludes(source, [
    "captureOnlyFallbackAllowed",
    "captureOnlyCandidate",
    "originalGifUrl",
    "frameSelectionReason",
    "syntheticHoldMs",
    "capture_only_short_frame_sequence",
    "no_capture_only_gif_frame",
  ], "capture-insertion-proof.cjs");
});

await check("testes-registrados", async () => {
  const pkg = JSON.parse(await readProjectFile("scripts/package.json"));
  const scripts = pkg.scripts || {};
  if (!scripts["test:gif-capture-only-short-frames"]) throw new Error("script test:gif-capture-only-short-frames ausente");
  if (!scripts["harness:pi-automation-v3"]) throw new Error("script harness:pi-automation-v3 ausente");
  return {
    gifTest: scripts["test:gif-capture-only-short-frames"],
    harness: scripts["harness:pi-automation-v3"],
  };
});

await check("drive-worker-runner-guardrails", async () => {
  const worker = await readProjectFile("ops/cloudflare-public-api/src/index.ts");
  const runner = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  requireIncludes(worker, ["/api/ops/drive-pi-events", "cod5_drive_events", "cod5_inbound_documents", "agent_analysis", "validated", "applying"], "worker Drive");
  requireIncludes(runner, [
    "executeDrivePiIngest",
    "ADOPS_DRIVE_PI_ALLOW_MUTATION",
    "ADOPS_PI_AGENT_AUTO_APPLY",
    "OPENAI_API_KEY",
    "analyzeDrivePiWithAgent",
    "buildPiAgentJsonSchema",
    "coverage",
    "telegram",
  ], "runner Drive");
  return { ok: true };
});

await check("prompt-ia-controla-somente-analise", async () => {
  const prompts = await readProjectFile("docs/adops/pi-automation-v3/prompts.md");
  return requireIncludes(prompts, ["ADOPS_PI_AGENT_AUTO_APPLY", "confidence", "source", "conflicts", "missingFields", "Nunca chamar API de mutacao"], "prompts.md");
});

await check("conhecimento-spm-versionado", async () => {
  const knowledge = await readProjectFile("docs/adops/pi-automation-v3/spm-agent-knowledge.md");
  return requireIncludes(knowledge, ["Papel do agente", "Campos criticos", "Regras de seguranca", "Scripts deterministas"], "spm-agent-knowledge.md");
});

await check("agent-guardrails-no-runner", async () => {
  const runner = await readProjectFile("ops/cloudflare-remote-runner/src/runner.mjs");
  return requireIncludes(runner, [
    "ADOPS_PI_AGENT_MIN_CONFIDENCE",
    "collectAgentQualityIssues",
    "citacao ausente",
    "confianca abaixo do minimo",
    "agentQuality",
    "AbortSignal.timeout",
  ], "runner agent guardrails");
});

await check("stack-expõe-configs-agent", async () => {
  const compose = await readProjectFile("ops/portainer/adops-stack/docker-compose.yml");
  return requireIncludes(compose, [
    "OPENAI_API_KEY",
    "ADOPS_PI_AGENT_ENABLED",
    "ADOPS_PI_AGENT_AUTO_APPLY",
    "ADOPS_PI_AGENT_MODEL",
    "ADOPS_PI_AGENT_MIN_CONFIDENCE",
    "ADOPS_PI_AGENT_KNOWLEDGE_FILE",
  ], "compose agent env");
});

await check("matriz-cenarios-readonly", async () => {
  const harness = await readProjectFile("docs/adops/pi-automation-v3/harness.md");
  return requireIncludes(harness, [
    "Drive com pasta completa",
    "Drive com pasta vazia",
    "WhatsApp com anexo local",
    "E-mail com PDF/anexo simulado",
    "Planilha com linha ja existente",
    "AdRotate com anuncio ja publicado",
    "PI duplicada",
    "GIF com muitos frames curtos",
    "Read-only",
    "Drive com PI completa analisada por agente IA",
    "Drive com PI incompleta bloqueada",
  ], "harness.md");
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
    "# Harness Report - PI Automation v3",
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
