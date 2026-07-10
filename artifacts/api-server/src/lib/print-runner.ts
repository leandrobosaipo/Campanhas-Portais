import type { PrintRunnerPort } from "./print-runner-contract";
import { getLocalPrintRunner } from "./local-print-runner";
import { RemotePrintRunner } from "./remote-print-runner";

let singleton: PrintRunnerPort | null = null;

export function getPrintRunner(): PrintRunnerPort {
  if (singleton) return singleton;

  const mode = (process.env.PRINT_RUNNER_MODE ?? "local").trim().toLowerCase();

  if (mode === "remote") {
    const baseUrl = process.env.PRINT_RUNNER_BASE_URL;
    if (!baseUrl) {
      throw new Error("PRINT_RUNNER_BASE_URL must be set when PRINT_RUNNER_MODE=remote");
    }

    singleton = new RemotePrintRunner({
      baseUrl,
      token: process.env.PRINT_RUNNER_TOKEN ?? null,
    });
    return singleton;
  }

  singleton = getLocalPrintRunner();
  return singleton;
}
