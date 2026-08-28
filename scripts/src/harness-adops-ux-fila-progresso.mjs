import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REPORTS_BASE_DIR = path.join(PROJECT_ROOT, "docs", "harness-reports", "adops-ux-v1");

const PHASES = [
  {
    id: "typecheck",
    title: "Typecheck",
    gates: [
      {
        id: "scripts_typecheck",
        title: "Scripts typecheck",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "typecheck"],
      },
      {
        id: "adops_typecheck",
        title: "AdOps app typecheck",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "artifacts/adops", "run", "typecheck"],
      },
      {
        id: "api_server_typecheck",
        title: "API server typecheck",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "artifacts/api-server", "run", "typecheck"],
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
      {
        id: "api_server_build",
        title: "API server build",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "artifacts/api-server", "run", "build"],
      },
    ],
  },
  {
    id: "tests",
    title: "Testes locais relevantes",
    gates: [
      {
        id: "scripts_runtime_auth_tests",
        title: "Runtime auth tests",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "test:runtime-auth"],
      },
      {
        id: "scripts_mutation_inventory",
        title: "Mutation inventory guard",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "test:mutation-inventory"],
      },
      {
        id: "daily_print_live_progress",
        title: "Daily print live progress",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "test:daily-print-live-progress"],
      },
      {
        id: "daily_print_runner_live_progress",
        title: "Daily print runner live progress",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "test:daily-print-runner-live-progress"],
      },
      {
        id: "monthly_report_live_polling",
        title: "Monthly report live polling",
        critical: true,
        cmd: "pnpm",
        args: ["--dir", "scripts", "run", "test:monthly-report-live-polling"],
      },
      {
        id: "monthly_evidence_contract",
        title: "Monthly evidence contract",
        critical: true,
        cmd: "node",
        args: ["scripts/src/test-monthly-evidence-contract.mjs"],
      },
      {
        id: "monthly_report_mobile_ui",
        title: "Monthly report mobile UI",
        critical: true,
        cmd: "node",
        args: ["scripts/src/test-monthly-report-mobile-ui.mjs"],
      },
      {
        id: "monthly_report_incremental_refresh",
        title: "Monthly report incremental refresh",
        critical: true,
        cmd: "node",
        args: ["scripts/src/test-monthly-report-incremental-refresh.mjs"],
      },
      {
        id: "campaign_evidence_private_route",
        title: "Campaign evidence immutable export",
        critical: true,
        cmd: "node",
        args: ["--test", "scripts/src/test-campaign-evidence-private-route.mjs"],
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

async function runGate(gate, { cwd, logsDir }) {
  const startedAt = new Date();
  const started = Date.now();
  const stdoutChunks = [];
  const stderrChunks = [];

  return new Promise((resolve) => {
    const child = spawn(gate.cmd, gate.args, {
      cwd,
      env: process.env,
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
  lines.push("# Harness Report - AdOps UX Fila + Progresso v1");
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
  await fs.mkdir(logsDir, { recursive: true });

  const phasesResult = [];

  for (const phase of PHASES) {
    console.log(`PHASE_START ${phase.id}`);
    const gateResults = [];
    for (const gate of phase.gates) {
      console.log(`GATE_START ${gate.id}`);
      const result = await runGate(gate, { cwd: PROJECT_ROOT, logsDir });
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
    harness: "adops-ux-fila-progresso-v1",
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

  if (criticalFailures.length > 0) {
    process.exit(1);
  }
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
