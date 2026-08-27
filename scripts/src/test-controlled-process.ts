import { spawn } from "node:child_process";
import { runControlledProcess, ControlledProcessError } from "../../artifacts/api-server/src/lib/controlled-process";

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

const success = await runControlledProcess(process.execPath, ["-e", "process.stdout.write('ok')"], {
  cwd: process.cwd(),
  env: process.env,
  timeoutMs: 5_000,
  killGraceMs: 250,
  maxBuffer: 1024,
});
if (success.stdout !== "ok") throw new Error("controlled_process_success_failed");

let grandchildPid = 0;
try {
  await runControlledProcess(process.execPath, ["-e", [
    "const {spawn}=require('node:child_process')",
    "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})",
    "process.stderr.write(String(child.pid))",
    "setInterval(()=>{},1000)",
  ].join(";")], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 300,
    killGraceMs: 200,
    maxBuffer: 1024,
  });
  throw new Error("controlled_process_timeout_not_enforced");
} catch (error) {
  if (!(error instanceof ControlledProcessError) || !error.timedOut || error.code !== "ADOPS_CAPTURE_TIMEOUT") throw error;
  grandchildPid = Number.parseInt(error.stderr, 10);
}

await new Promise((resolve) => setTimeout(resolve, 300));
if (!grandchildPid || isAlive(grandchildPid)) {
  if (grandchildPid) spawn("kill", ["-KILL", String(grandchildPid)]).unref();
  throw new Error(`controlled_process_grandchild_survived:${grandchildPid || "missing"}`);
}

console.log(JSON.stringify({ ok: true, success: true, timeout: true, grandchildCleaned: true }));
