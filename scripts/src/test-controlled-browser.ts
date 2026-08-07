import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runControlledProcess } from "../../artifacts/api-server/src/lib/controlled-process";

const cwd = process.cwd().endsWith("/scripts") ? process.cwd().slice(0, -"/scripts".length) : process.cwd();
const playwrightModulePath = new URL(import.meta.resolve("playwright")).pathname;

function browserProgram(mode: "success" | "error" | "timeout") {
  return `
    const { chromium } = require(process.env.COD5_PLAYWRIGHT_MODULE_PATH);
    (async () => {
      let browser = null;
      let page = null;
      try {
        browser = await chromium.launch({ headless: true, args: ["--cod5-browser-test=" + process.env.COD5_BROWSER_MARKER] });
        page = await browser.newPage();
        await page.setContent("<p>cod5 browser cleanup</p>");
        if (${JSON.stringify(mode)} === "error") throw new Error("intentional_browser_error");
        if (${JSON.stringify(mode)} === "timeout") await new Promise(() => undefined);
      } finally {
        await Promise.allSettled([page ? page.close() : Promise.resolve(), browser ? browser.close() : Promise.resolve()]);
      }
    })().catch((error) => { console.error(error.message); process.exitCode = 23; });
  `;
}

function markerExists(marker: string) {
  return execFileSync("ps", ["ax", "-o", "command="], { encoding: "utf8" }).includes(marker);
}

async function run(mode: "success" | "error" | "timeout", timeoutMs: number) {
  const marker = `cod5-${mode}-${randomUUID()}`;
  let failed = false;
  let timedOut = false;
  let errorMessage: string | null = null;
  try {
    await runControlledProcess(process.execPath, ["-e", browserProgram(mode)], {
      cwd,
      env: {
        ...process.env,
        COD5_BROWSER_MARKER: marker,
        COD5_PLAYWRIGHT_MODULE_PATH: playwrightModulePath,
      },
      timeoutMs,
      killGraceMs: 1_000,
      maxBuffer: 256 * 1024,
    });
  } catch (error) {
    failed = true;
    errorMessage = error instanceof Error
      ? `${error.message}: ${String((error as Error & { stderr?: string }).stderr ?? "").slice(0, 500)}`
      : String(error);
    timedOut = error instanceof Error && (
      String((error as Error & { code?: string }).code ?? "").includes("TIMEOUT")
      || /timeout/i.test(error.message)
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (markerExists(marker)) throw new Error(`browser_residual_process:${mode}`);
  return { mode, failed, timedOut, errorMessage };
}

const success = await run("success", 15_000);
const failure = await run("error", 15_000);
const timeout = await run("timeout", 3_000);

if (success.failed || !failure.failed || !timeout.failed || !timeout.timedOut) {
  throw new Error(`browser_cleanup_contract_failed:${JSON.stringify({ success, failure, timeout })}`);
}

console.log(JSON.stringify({ ok: true, success, failure, timeout, residualBrowsers: 0 }));
