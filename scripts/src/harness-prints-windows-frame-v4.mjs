import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.join(repoRoot, "docs/harness-reports/prints-windows-frame-v4", timestamp);
const runCaptureSamples = process.env.ADOPS_RUN_CAPTURE_SAMPLES === "true";

mkdirSync(reportDir, { recursive: true });

const results = [];

function runStep(name, command, args, options = {}) {
  const startedAt = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    });
    results.push({
      name,
      status: "passed",
      durationMs: Date.now() - startedAt,
      stdout: stdout.slice(-4000),
      stderr: "",
    });
  } catch (error) {
    results.push({
      name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      stdout: String(error.stdout || "").slice(-4000),
      stderr: String(error.stderr || error.message || error).slice(-4000),
    });
  }
}

function readCaptureMetadata(metaPath) {
  try {
    const data = JSON.parse(readFileSync(path.join(repoRoot, metaPath), "utf8"));
    const ok =
      data.frameTemplateVersion === "windows11-chrome-light-similar-v4" &&
      data.chromeTopTheme === "light" &&
      data.tabSurfaceRendered === true &&
      data.tabTitleRendered === true &&
      data.tabIconRendered === true &&
      data.tabIconFallback === false;
    results.push({
      name: `metadata ${metaPath}`,
      status: ok ? "passed" : "failed",
      durationMs: 0,
      stdout: JSON.stringify({
        frameTemplateVersion: data.frameTemplateVersion,
        chromeTopTheme: data.chromeTopTheme,
        tabSurfaceRendered: data.tabSurfaceRendered,
        tabTitleRendered: data.tabTitleRendered,
        tabIconRendered: data.tabIconRendered,
        tabIconFallback: data.tabIconFallback,
        finalPng: metaPath.replace("-meta.json", "-proof.png"),
      }, null, 2),
      stderr: ok ? "" : "metadata da moldura v4 nao passou no contrato",
    });
  } catch (error) {
    results.push({
      name: `metadata ${metaPath}`,
      status: "failed",
      durationMs: 0,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
}

runStep("node --check capture-insertion-proof", "node", ["--check", "scripts/src/capture-insertion-proof.cjs"]);
runStep("node --check build-windows-frame-kit", "node", ["--check", "scripts/src/build-windows-frame-kit.mjs"]);
runStep("test windows frame template", "pnpm", ["--dir", "scripts", "run", "test:windows-frame-template"]);
runStep("test windows frame template strict", "pnpm", ["--dir", "scripts", "run", "test:windows-frame-template"], {
  env: { ADOPS_VALIDATE_REAL_WINDOWS_FRAME_KIT: "true" },
});
runStep("audit capture rules integrity", "pnpm", ["--dir", "scripts", "run", "audit:capture-rules-integrity"]);

if (runCaptureSamples) {
  const samples = [
    { insertionId: "858", captureAt: "2026-04-20T19:49", meta: "tmp/generated-prints/2026-04-20/858/2026-04-20-meta.json" },
    { insertionId: "870", captureAt: "2026-04-10T19:00", meta: "tmp/generated-prints/2026-04-10/870/2026-04-10-meta.json" },
    { insertionId: "1207", captureAt: "2026-05-02T10:00", meta: "tmp/generated-prints/2026-05-02/1207/2026-05-02-meta.json" },
  ];
  for (const sample of samples) {
    runStep(
      `capture sample ${sample.insertionId}`,
      "node",
      [
        "scripts/src/capture-insertion-proof.cjs",
        "--insertionId",
        sample.insertionId,
        "--captureAt",
        sample.captureAt,
        "--upload",
        "false",
        "--saveEvidence",
        "false",
        "--apiBase",
        "https://adops-api-public.leandro471.workers.dev/api",
      ],
    );
    readCaptureMetadata(sample.meta);
  }
}

const passed = results.filter((item) => item.status === "passed").length;
const failed = results.filter((item) => item.status === "failed").length;
const summary = [
  "# Harness Prints Windows Frame v4",
  "",
  `- Data: ${new Date().toISOString()}`,
  `- Passou: ${passed}`,
  `- Falhou: ${failed}`,
  `- Amostras locais: ${runCaptureSamples ? "sim" : "nao"}`,
  "",
  "## Resultados",
  "",
  ...results.map((item) => `- ${item.status === "passed" ? "OK" : "FALHA"} - ${item.name} (${item.durationMs} ms)`),
  "",
].join("\n");

writeFileSync(path.join(reportDir, "results.json"), JSON.stringify({ ok: failed === 0, results }, null, 2));
writeFileSync(path.join(reportDir, "summary.md"), summary);

console.log(JSON.stringify({
  ok: failed === 0,
  passed,
  failed,
  reportDir,
}, null, 2));

if (failed > 0) process.exit(1);

