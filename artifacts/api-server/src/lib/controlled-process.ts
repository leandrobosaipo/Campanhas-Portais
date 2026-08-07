import { spawn } from "node:child_process";

export type ControlledProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  killGraceMs: number;
  maxBuffer: number;
};

export class ControlledProcessError extends Error {
  code: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;

  constructor(message: string, details: {
    code: string;
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    stderr?: string;
    timedOut?: boolean;
  }) {
    super(message);
    this.name = "ControlledProcessError";
    this.code = details.code;
    this.exitCode = details.exitCode ?? null;
    this.signal = details.signal ?? null;
    this.stderr = details.stderr ?? "";
    this.timedOut = details.timedOut === true;
  }
}

function terminateTree(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    if (process.platform !== "win32") process.kill(-pid, signal);
    else process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") throw error;
  }
}

export async function runControlledProcess(
  command: string,
  args: string[],
  options: ControlledProcessOptions,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let timedOut = false;
    let bufferExceeded = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | null = null;

    const stop = (reason: "timeout" | "buffer") => {
      if (reason === "timeout") timedOut = true;
      else bufferExceeded = true;
      terminateTree(child.pid, "SIGTERM");
      if (!killTimer) {
        killTimer = setTimeout(() => terminateTree(child.pid, "SIGKILL"), options.killGraceMs);
        killTimer.unref();
      }
    };

    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => {
      if (current.length + chunk.length > options.maxBuffer) {
        stop("buffer");
        return current;
      }
      return Buffer.concat([current, chunk]);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => stop("timeout"), options.timeoutMs);
    timeout.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(new ControlledProcessError(error.message, {
        code: "ADOPS_CAPTURE_SPAWN_ERROR",
        stderr: stderr.toString("utf8"),
      }));
    });

    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      try {
        // A successful parent can still leave Chromium descendants behind.
        terminateTree(child.pid, "SIGTERM");
      } catch {
        // The group normally no longer exists after a clean shutdown.
      }
      const stdoutText = stdout.toString("utf8");
      const stderrText = stderr.toString("utf8");
      if (timedOut) {
        reject(new ControlledProcessError(`capture_timeout_after_${options.timeoutMs}ms`, {
          code: "ADOPS_CAPTURE_TIMEOUT",
          exitCode,
          signal,
          stderr: stderrText,
          timedOut: true,
        }));
        return;
      }
      if (bufferExceeded) {
        reject(new ControlledProcessError(`capture_output_exceeded_${options.maxBuffer}_bytes`, {
          code: "ADOPS_CAPTURE_MAX_BUFFER",
          exitCode,
          signal,
          stderr: stderrText,
        }));
        return;
      }
      if (exitCode !== 0) {
        reject(new ControlledProcessError(`capture_process_failed_exit_${exitCode ?? "signal"}`, {
          code: "ADOPS_CAPTURE_PROCESS_FAILED",
          exitCode,
          signal,
          stderr: stderrText,
        }));
        return;
      }
      resolve({ stdout: stdoutText, stderr: stderrText });
    });
  });
}
