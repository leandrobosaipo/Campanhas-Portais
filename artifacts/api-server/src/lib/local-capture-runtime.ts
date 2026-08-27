import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { runControlledProcess } from "./controlled-process";
import { withPlaywrightPermit } from "./playwright-budget";

function getProjectRoot() {
  return process.env.ADOPS_PROJECT_ROOT || process.cwd();
}

function getGeneratedPrintsRoot() {
  return process.env.ADOPS_GENERATED_PRINTS_ROOT || path.join(getProjectRoot(), "tmp/generated-prints");
}

function getSpacesEnvFile() {
  if (process.env.ADOPS_SPACES_ENV_FILE) return process.env.ADOPS_SPACES_ENV_FILE;

  const accessKeyId = process.env.DO_SPACES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DO_SPACES_SECRET_ACCESS_KEY;
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region = process.env.DO_SPACES_REGION;

  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    throw new Error(
      "Configure ADOPS_SPACES_ENV_FILE ou as variaveis DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY, DO_SPACES_ENDPOINT e DO_SPACES_REGION.",
    );
  }

  const envFile = path.join(tmpdir(), "campanhas-portais-spaces.env");
  writeFileSync(
    envFile,
    [
      `DO_SPACES_ACCESS_KEY_ID=${accessKeyId}`,
      `DO_SPACES_SECRET_ACCESS_KEY=${secretAccessKey}`,
      `DO_SPACES_ENDPOINT=${endpoint}`,
      `DO_SPACES_REGION=${region}`,
    ].join("\n"),
    "utf8",
  );
  return envFile;
}

export function getLocalCaptureRuntime() {
  return {
    projectRoot: getProjectRoot(),
    spacesEnvFile: getSpacesEnvFile(),
    spacesBucket: process.env.ADOPS_SPACES_BUCKET || "cod5",
    spacesBasePath: process.env.ADOPS_SPACES_BASE_PATH || "adops-prints",
    generatedPrintsRoot: getGeneratedPrintsRoot(),
  } as const;
}

export type LocalCaptureOptions = {
  replaceExisting?: boolean;
  captureAt?: string | null;
  jobId?: string | null;
  runnerJobId?: string | null;
  diagnosticMode?: boolean;
  candidateOnly?: boolean;
  promoteCandidate?: boolean;
  reconstructionReason?: "late_publication_recovery" | null;
};

export async function runLocalCaptureProof(insertionId: number, options?: LocalCaptureOptions) {
  const runtime = getLocalCaptureRuntime();
  const args = [
    "./scripts/src/capture-insertion-proof.cjs",
    "--insertionId",
    String(insertionId),
    "--spacesEnv",
    runtime.spacesEnvFile,
    "--spacesBucket",
    runtime.spacesBucket,
    "--spacesBasePath",
    runtime.spacesBasePath,
  ];
  if (options?.replaceExisting) {
    args.push("--replaceExisting", "true");
  }
  if (options?.captureAt) {
    args.push("--captureAt", options.captureAt);
  }
  if (options?.reconstructionReason) {
    args.push("--reconstructionReason", options.reconstructionReason);
  }
  if (options?.jobId) {
    args.push("--jobId", options.jobId);
  }
  if (options?.runnerJobId) {
    args.push("--runnerJobId", options.runnerJobId);
  }
  if (options?.diagnosticMode) {
    args.push("--diagnosticMode", "true");
  }
  if (options?.candidateOnly) {
    args.push(
      "--candidateOnly",
      "true",
      "--saveEvidence",
      options.promoteCandidate ? "true" : "false",
    );
    if (options.promoteCandidate && !options.replaceExisting) {
      args.push("--replaceExisting", "true");
    }
  }
  const cleanContextRetries = Math.min(2, Math.max(0, Number(process.env.ADOPS_CAPTURE_CLEAN_CONTEXT_RETRIES ?? 2)));
  const timeoutMs = Math.max(30_000, Number(process.env.ADOPS_CAPTURE_TIMEOUT_MS ?? 300_000));
  const killGraceMs = Math.max(1_000, Number(process.env.ADOPS_CAPTURE_KILL_GRACE_MS ?? 5_000));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= cleanContextRetries + 1; attempt += 1) {
    try {
      const { stdout } = await withPlaywrightPermit(`capture:${insertionId}:${attempt}`, () =>
        runControlledProcess("node", [...args, "--captureAttempt", String(attempt)], {
          cwd: runtime.projectRoot,
          env: {
            ...process.env,
            DATABASE_URL: process.env.DATABASE_URL ?? "postgresql:///campanhas_portais_local",
          },
          timeoutMs,
          killGraceMs,
          maxBuffer: 10 * 1024 * 1024,
        }),
      );
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? `${error.message}\n${String((error as any).stderr ?? "")}` : String(error);
      const retryable = /critical_image_not_loaded|critical_image_not_painted|critical_background_not_loaded|resource_request_failed|readiness_timeout|layout_not_stable|final_viewport_changed/.test(message);
      const permanentClientError = /http_4\d\d/.test(message);
      if (!retryable || permanentClientError || attempt > cleanContextRetries) throw error;
    }
  }
  throw lastError;
}

export function loadLocalCaptureMetadata(insertionId: number, dateKey: string) {
  const runtime = getLocalCaptureRuntime();
  const filePath = `${runtime.generatedPrintsRoot}/${dateKey}/${insertionId}/${dateKey}-meta.json`;
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function saveLocalCaptureMetadata(insertionId: number, dateKey: string, metadata: unknown) {
  const runtime = getLocalCaptureRuntime();
  const dirPath = `${runtime.generatedPrintsRoot}/${dateKey}/${insertionId}`;
  const filePath = `${dirPath}/${dateKey}-meta.json`;
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf8");
  return filePath;
}
