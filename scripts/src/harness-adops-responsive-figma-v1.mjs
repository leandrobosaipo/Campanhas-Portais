import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REPORTS_BASE_DIR = path.join(PROJECT_ROOT, "docs", "harness-reports", "adops-responsive-figma-v1");

const PHASES = [
  {
    id: "figma_context",
    title: "Contexto Figma",
    gates: [
      {
        id: "figma_input_contract",
        title: "Figma input contract",
        critical: false,
        cmd: "node",
        args: ["./scripts/src/validate-figma-input-contract.mjs"],
      },
    ],
  },
  {
    id: "build",
    title: "Build",
    gates: [
      {
        id: "adops_build",
        title: "AdOps app build",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "artifacts/adops", "run", "build"],
      },
    ],
  },
  {
    id: "responsive_smoke",
    title: "Smoke responsivo",
    gates: [
      {
        id: "responsive_smoke",
        title: "Responsive smoke",
        critical: true,
        cmd: "node",
        args: ["./scripts/src/test-adops-responsive-figma.mjs"],
      },
    ],
  },
];

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDurationMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runGate(gate, { cwd, logsDir, env }) {
  const startedAt = new Date();
  const started = Date.now();
  const stdoutChunks = [];
  const stderrChunks = [];

  return new Promise((resolve) => {
    const child = spawn(gate.cmd, gate.args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

    child.on("error", async (error) => {
      const finishedAt = new Date();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = `${Buffer.concat(stderrChunks).toString("utf8")}\n${String(error)}`.trim();
      const stdoutPath = path.join(logsDir, `${gate.id}.stdout.log`);
      const stderrPath = path.join(logsDir, `${gate.id}.stderr.log`);
      await fs.writeFile(stdoutPath, stdout, "utf8");
      await fs.writeFile(stderrPath, `${stderr}\n`, "utf8");
      resolve({
        ...gate,
        status: "failed",
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Date.now() - started,
        command: `${gate.cmd} ${gate.args.join(" ")}`,
        stdoutLog: path.relative(PROJECT_ROOT, stdoutPath),
        stderrLog: path.relative(PROJECT_ROOT, stderrPath),
      });
    });

    child.on("close", async (code) => {
      const finishedAt = new Date();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const stdoutPath = path.join(logsDir, `${gate.id}.stdout.log`);
      const stderrPath = path.join(logsDir, `${gate.id}.stderr.log`);
      await fs.writeFile(stdoutPath, stdout, "utf8");
      await fs.writeFile(stderrPath, stderr, "utf8");
      resolve({
        ...gate,
        status: code === 0 ? "passed" : "failed",
        exitCode: code ?? 1,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Date.now() - started,
        command: `${gate.cmd} ${gate.args.join(" ")}`,
        stdoutLog: path.relative(PROJECT_ROOT, stdoutPath),
        stderrLog: path.relative(PROJECT_ROOT, stderrPath),
      });
    });
  });
}

function buildSummaryMarkdown(payload) {
  const lines = [];
  lines.push("# Harness Report - AdOps Responsive + Figma v1");
  lines.push("");
  lines.push(`- Started at: ${payload.startedAt}`);
  lines.push(`- Finished at: ${payload.finishedAt}`);
  lines.push(`- Duration: ${formatDurationMs(payload.durationMs)}`);
  lines.push(`- Output dir: \`${payload.outputDir}\``);
  lines.push(`- Critical failures: ${payload.criticalFailures}`);
  lines.push(`- Exit code: ${payload.exitCode}`);
  lines.push("");
  lines.push("## Gates");
  lines.push("");
  lines.push("| Phase | Gate | Critical | Status | Exit | Duration |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const phase of payload.phases) {
    for (const gate of phase.gates) {
      lines.push(
        `| ${phase.title} | ${gate.id} | ${gate.critical ? "yes" : "no"} | ${gate.status} | ${gate.exitCode} | ${formatDurationMs(gate.durationMs)} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Logs");
  lines.push("");
  for (const phase of payload.phases) {
    for (const gate of phase.gates) {
      lines.push(`- ${gate.id}: \`${gate.stdoutLog}\` / \`${gate.stderrLog}\``);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const started = Date.now();
  const startedAt = new Date();
  const timestamp = timestampForPath(startedAt);
  const outputDir = path.join(REPORTS_BASE_DIR, timestamp);
  const logsDir = path.join(outputDir, "logs");
  const artifactsDir = path.join(outputDir, "artifacts", "responsive");
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const phasesResult = [];
  const childEnv = {
    ...process.env,
    ADOPS_RESPONSIVE_ARTIFACTS_DIR: artifactsDir,
  };

  for (const phase of PHASES) {
    console.log(`PHASE_START ${phase.id}`);
    const gateResults = [];
    for (const gate of phase.gates) {
      console.log(`GATE_START ${gate.id}`);
      const result = await runGate(gate, { cwd: PROJECT_ROOT, logsDir, env: childEnv });
      gateResults.push(result);
      console.log(`GATE_${result.status.toUpperCase()} ${gate.id} (${formatDurationMs(result.durationMs)})`);
    }
    phasesResult.push({
      id: phase.id,
      title: phase.title,
      gates: gateResults,
    });
    console.log(`PHASE_DONE ${phase.id}`);
  }

  const criticalFailures = phasesResult
    .flatMap((phase) => phase.gates)
    .filter((gate) => gate.critical && gate.status !== "passed");

  const finishedAt = new Date();
  const payload = {
    harness: "adops-responsive-figma-v1",
    timestamp,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - started,
    outputDir: path.relative(PROJECT_ROOT, outputDir),
    criticalFailures: criticalFailures.length,
    exitCode: criticalFailures.length > 0 ? 1 : 0,
    phases: phasesResult,
  };

  const jsonPath = path.join(outputDir, "gate-results.json");
  const summaryPath = path.join(outputDir, "summary.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(summaryPath, buildSummaryMarkdown(payload), "utf8");

  console.log(`HARNESS_REPORT ${path.relative(PROJECT_ROOT, outputDir)}`);
  console.log(`HARNESS_SUMMARY ${path.relative(PROJECT_ROOT, summaryPath)}`);

  if (criticalFailures.length > 0) process.exit(1);
}

main().catch(async (error) => {
  const fallbackDir = path.join(REPORTS_BASE_DIR, `${timestampForPath()}-fatal`);
  await fs.mkdir(fallbackDir, { recursive: true });
  const fatalPath = path.join(fallbackDir, "fatal-error.log");
  const details = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  await fs.writeFile(fatalPath, `${details}\n`, "utf8");
  console.error(details);
  process.exit(1);
});
