#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportRoot = path.join(repoRoot, "docs/harness-reports/retroactive-recovery");
const terminalStatuses = new Set(["completed", "failed"]);
const secretKey = /authorization|token|secret|cookie|password/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiBase() {
  return (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
}

function apiToken() {
  return process.env.ADOPS_OPS_API_TOKEN || process.env.OPS_API_TOKEN || process.env.ADOPS_INTERNAL_API_TOKEN || "";
}

function createApi() {
  const base = apiBase();
  const token = apiToken();
  async function request(method, pathname, body) {
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`API ${method} ${pathname} retornou ${response.status}.`), { code: `http_${response.status}`, status: response.status, payload });
    return payload;
  }
  return {
    get: (pathname) => request("GET", pathname),
    post: (pathname, body) => request("POST", pathname, body),
    async publicAsset(target) {
      const response = await fetch(target.url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Consumidor público ${target.kind} retornou ${response.status}.`);
      if (target.kind === "modal") {
        const data = await response.json();
        const insertion = data?.insertions?.find((item) => Number(item?.id) === target.insertionId);
        const evidence = insertion?.evidenceDays?.find((item) => item?.date === target.date);
        if (!evidence || evidence.url !== target.evidenceUrl) throw new Error(`Consumidor público modal não contém a evidência ${target.date}.`);
      }
      return { ok: true, url: target.url };
    },
  };
}

function requireExecuteSlice(options) {
  if (!Number.isSafeInteger(options.insertionId) || options.insertionId <= 0 || !options.fromDate || !options.toDate) {
    throw new Error("execute exige insertionId positivo, fromDate e toDate explícitos.");
  }
}

export async function waitForTerminalJob(api, jobId, timeoutMs, { now = Date.now, sleep: wait = sleep } = {}) {
  const deadline = now() + timeoutMs;
  let progress;
  for (;;) {
    progress = await api.get(`/api/ops/jobs/${encodeURIComponent(jobId)}/progress`);
    if (terminalStatuses.has(progress.status)) return progress;
    if (now() >= deadline) {
      throw Object.assign(new Error(`Timeout aguardando job ${jobId}.`), { code: "job_timeout", jobId, progress });
    }
    await wait(5_000);
  }
}

export async function runHarness(options) {
  const { mode, api = createApi(), timeoutMs = 2_700_000, now, sleep: wait } = options;
  const release = options.release ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null;
  if (!new Set(["check", "execute", "verify"]).has(mode)) throw new Error("mode deve ser check, execute ou verify.");

  if (mode === "check") {
    const checks = await Promise.all([
      api.get("/api/ops/jobs?kind=drive-pi-preflight&limit=10"),
      api.get("/api/ops/jobs?kind=adrotate-publish&limit=10"),
      api.get("/api/ops/queue/overview"),
      api.get("/api/ops/runtime-readiness"),
    ]);
    return { mode, release, status: "checked", checks: checks.length };
  }

  requireExecuteSlice(options);
  const dates = dateRange(options.fromDate, options.toDate);
  if (mode === "execute") {
    const created = await api.post("/api/ops/jobs/print-backfill", {
      insertionId: options.insertionId,
      fromDate: options.fromDate,
      toDate: options.toDate,
      ...(options.competencia ? { competencia: options.competencia } : {}),
    });
    if (!created.jobId) throw new Error("Resposta do print-backfill sem jobId.");
    const progress = await waitForTerminalJob(api, created.jobId, timeoutMs, { now, sleep: wait });
    return { mode, release, jobId: created.jobId, status: progress.status, progress, insertionId: options.insertionId, dates };
  }

  const evidence = [];
  for (const date of dates) {
    const status = await api.get(`/api/insertions/${encodeURIComponent(options.insertionId)}/capture-proof/status?date=${encodeURIComponent(date)}`);
    if (status.status !== "audited" || status.checklistValidation?.approved !== true || !status.arquivoUrl) {
      throw Object.assign(new Error(`Evidência não auditada para ${date}.`), { code: "evidence_not_audited", date, status });
    }
    evidence.push({ date, url: status.arquivoUrl });
  }
  const publicUrl = evidence[0]?.url;
  const firstDate = evidence[0]?.date;
  const reportUrl = publicReportUrl(options.reportUrl, options.toDate);
  const deliveryApiBase = String(options.deliveryApiBase || apiBase()).replace(/\/$/, "");
  const consumers = [
    { kind: "html", url: reportUrl },
    { kind: "thumbnail", url: publicUrl },
    { kind: "modal", url: new URL("data.json", reportUrl).toString(), insertionId: options.insertionId, date: firstDate, evidenceUrl: publicUrl },
    { kind: "download", url: `${deliveryApiBase}/api/insertions/${encodeURIComponent(options.insertionId)}/evidences/${encodeURIComponent(firstDate)}/download` },
  ];
  await Promise.all(consumers.map((target) => api.publicAsset(target)));
  return { mode, release, status: "verified", insertionId: options.insertionId, dates, evidence, consumers };
}

function publicReportUrl(override, toDate) {
  if (override) return String(override).endsWith("/") ? String(override) : `${override}/`;
  const [year, month] = toDate.split("-");
  const monthSlug = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][Number(month) - 1];
  const slug = process.env.ADOPS_REPORT_SLUG || `adops-evidencias-${monthSlug}-${year}`;
  return `https://sites.codigo5.com.br/reports/${slug}/`;
}

function dateRange(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from.toISOString().slice(0, 10) !== fromDate || to.toISOString().slice(0, 10) !== toDate || from > to || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error("Datas devem ser YYYY-MM-DD válidas e fromDate não pode ser posterior a toDate.");
  const dates = [];
  for (let current = from; current <= to; current = new Date(current.valueOf() + 86_400_000)) dates.push(current.toISOString().slice(0, 10));
  return dates;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key)).map(([key, item]) => [key, sanitize(item)]));
  return value;
}

export function parseHarnessArgs(argv) {
  const options = {};
  const allowed = new Set(["mode", "insertion-id", "from-date", "to-date", "competencia", "timeout-ms", "output-dir"]);
  for (const arg of argv) {
    if (arg === "--") continue;
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match || !allowed.has(match[1])) throw new Error(`Argumento inválido: ${arg}`);
    options[match[1]] = match[2];
  }
  if (!options.mode || !["check", "execute", "verify"].includes(options.mode)) throw new Error("--mode=check|execute|verify é obrigatório.");
  const parsed = { mode: options.mode, competencia: options.competencia };
  if (options["insertion-id"] !== undefined) {
    parsed.insertionId = Number(options["insertion-id"]);
    if (!Number.isSafeInteger(parsed.insertionId) || parsed.insertionId <= 0) throw new Error("--insertion-id deve ser inteiro positivo.");
  }
  for (const [option, property] of [["from-date", "fromDate"], ["to-date", "toDate"]]) if (options[option] !== undefined) parsed[property] = options[option];
  parsed.timeoutMs = options["timeout-ms"] === undefined ? 2_700_000 : Number(options["timeout-ms"]);
  if (!Number.isSafeInteger(parsed.timeoutMs) || parsed.timeoutMs < 1 || parsed.timeoutMs > 2_700_000) throw new Error("--timeout-ms deve estar entre 1 e 2700000.");
  parsed.outputDir = resolveOutputDir(options["output-dir"]);
  return parsed;
}

function resolveOutputDir(input) {
  const target = path.resolve(repoRoot, input || `docs/harness-reports/retroactive-recovery/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  if (target !== reportRoot && !target.startsWith(`${reportRoot}${path.sep}`)) throw new Error("--output-dir deve estar dentro de docs/harness-reports/retroactive-recovery.");
  return target;
}

async function assertSafeOutputDir(outputDir) {
  const relative = path.relative(reportRoot, outputDir);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Diretório de saída fora da raiz permitida.");
  let current = reportRoot;
  for (const segment of relative ? relative.split(path.sep) : []) {
    const metadata = await fs.lstat(current).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (metadata?.isSymbolicLink()) throw new Error(`Diretório de saída contém symlink: ${current}`);
    current = path.join(current, segment);
  }
  const metadata = await fs.lstat(current).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (metadata?.isSymbolicLink()) throw new Error(`Diretório de saída contém symlink: ${current}`);
}

export async function writeHarnessArtifacts(outputDir, result) {
  await assertSafeOutputDir(outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  const safe = sanitize(result);
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(safe, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "summary.md"), ["# Retroactive Recovery Harness", "", `- Mode: ${safe.mode}`, `- Status: ${safe.status}`, safe.release ? `- Release: ${safe.release}` : null, safe.jobId ? `- Job ID: ${safe.jobId}` : null, safe.insertionId ? `- Insertion: ${safe.insertionId}` : null, safe.dates ? `- Dates: ${safe.dates.join(", ")}` : null].filter(Boolean).join("\n") + "\n");
}

async function main() {
  const options = parseHarnessArgs(process.argv.slice(2));
  try {
    const result = await runHarness(options);
    await writeHarnessArtifacts(options.outputDir, result);
    console.log(JSON.stringify({ mode: result.mode, status: result.status, outputDir: options.outputDir }, null, 2));
    process.exitCode = result.status === "failed" ? 1 : 0;
  } catch (error) {
    const result = { mode: options.mode, status: "failed", error: { code: error?.code || "harness_error", message: error instanceof Error ? error.message : String(error), jobId: error?.jobId || null, progress: error?.progress || null } };
    await writeHarnessArtifacts(options.outputDir, result);
    console.error(result.error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
