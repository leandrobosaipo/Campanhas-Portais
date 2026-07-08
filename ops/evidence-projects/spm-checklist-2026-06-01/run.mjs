#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const projectDir = resolve(new URL(".", import.meta.url).pathname);
const logDir = join(projectDir, "logs");
const apiBase = "https://adops-api-public.leandro471.workers.dev";
const outputRoot = join(process.env.HOME || "", "Downloads", "Evidencias-SPM-Checklist-2026-06-01");
const targetDate = "2026-05-31";

mkdirSync(logDir, { recursive: true });
mkdirSync(outputRoot, { recursive: true });

const targets = [
  { label: "OMT-PI-14414-vacina", site: "OMT", pi: "14414", insertionId: 1390 },
  { label: "AFL-PI-89771-aniversario", site: "AFL", pi: "89771", insertionId: 1361 },
  { label: "AFL-PI-89533-IPTU-2026", site: "AFL", pi: "89533", insertionId: 1325 },
  { label: "ROO-PI-89741-IPTU", site: "ROO", pi: "89741", insertionId: 1264 },
  { label: "PERRENGUE-PI-009596-aniversario-VG", site: "PERRENGUE", pi: "009596", insertionId: 1256 },
  { label: "PERRENGUE-PI-89742-IPTU", site: "PERRENGUE", pi: "89742", insertionId: 1327 },
  { label: "PERRENGUE-PI-89784-aniversario-PVA", site: "PERRENGUE", pi: "89784", insertionId: 1364 },
  { label: "PERRENGUE-PI-89955-aniversario-VG", site: "PERRENGUE", pi: "89955", insertionId: 1376 },
  { label: "PERRENGUE-PI-14408-aniversario-VG", site: "PERRENGUE", pi: "14408", insertionId: 1395 },
];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

const opsEnv = parseEnvFile(join(repoRoot, ".env.adops-operator.local"));

function log(message, payload) {
  console.log(payload === undefined ? message : `${message} ${JSON.stringify(payload)}`);
}

async function requestJson(path, options = {}) {
  const fetchOptions = {
    ...options,
    headers: {
      ...(options.protected ? { authorization: `Bearer ${opsEnv.OPS_API_TOKEN || ""}` } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  };
  delete fetchOptions.protected;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(`${apiBase}${path}`, fetchOptions);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
    }
  }
  if (!response) throw lastError;
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path} falhou: ${response.status} ${text}`);
  return payload;
}

function dateRange(start, end) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00-04:00`);
  const limit = new Date(`${end}T00:00:00-04:00`);
  while (cursor <= limit) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function minDate(a, b) {
  return a <= b ? a : b;
}

function statusOk(status) {
  const issues = status.audit?.issues || status.issues || [];
  return status.status === "audited" && status.audit?.ok === true && Boolean(status.arquivoUrl) && issues.length === 0;
}

async function enqueuePrint(insertionId, date, captureTime = "18:13") {
  const body = { insertionId, date, force: true, replace: true };
  if (captureTime) body.captureAt = `${date}T${captureTime}`;
  return requestJson("/api/ops/jobs/print-single", {
    method: "POST",
    protected: true,
    body: JSON.stringify(body),
  });
}

async function waitJob(jobInfo) {
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    const job = await requestJson(`/api/ops/jobs/${encodeURIComponent(jobInfo.jobId)}`);
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(`Job ${jobInfo.jobId} falhou para ${jobInfo.date}: ${job.error || job.result?.error || "sem detalhe"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  throw new Error(`Job ainda pendente: ${jobInfo.jobId}`);
}

async function regenerateDate(target, date) {
  const attempts = ["18:13", "18:00", "18:30", "19:00", null];
  const errors = [];
  for (const captureTime of attempts) {
    try {
      const job = await enqueuePrint(target.insertionId, date, captureTime);
      log("print_enqueued", { label: target.label, date, captureTime: captureTime || "auto", jobId: job.jobId });
      await waitJob({ date, jobId: job.jobId });
      const status = await requestJson(`/api/insertions/${target.insertionId}/capture-proof/status?date=${date}`);
      if (statusOk(status)) return status;
      errors.push(`${captureTime || "auto"} completed_but_not_audited`);
    } catch (error) {
      errors.push(`${captureTime || "auto"} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Nao consegui auditar ${target.label} em ${date}: ${errors.join(" | ")}`);
}

async function ensureAudited(target, dates) {
  const before = [];
  const missing = [];
  for (const date of dates) {
    const status = await requestJson(`/api/insertions/${target.insertionId}/capture-proof/status?date=${date}`);
    const issues = status.audit?.issues || status.issues || [];
    before.push({ date, ok: statusOk(status), status: status.status, issues: issues.length, url: status.arquivoUrl || null });
    if (!statusOk(status)) missing.push(date);
  }
  if (missing.length) {
    log("prints_needed", { label: target.label, dates: missing });
    for (const date of missing) await regenerateDate(target, date);
  }

  const final = [];
  for (const date of dates) {
    const status = await requestJson(`/api/insertions/${target.insertionId}/capture-proof/status?date=${date}`);
    const issues = status.audit?.issues || status.issues || [];
    final.push({ date, ok: statusOk(status), status: status.status, issues: issues.length, url: status.arquivoUrl || null });
  }
  const failed = final.filter((item) => !item.ok);
  if (failed.length) throw new Error(`Auditoria ainda falhou para ${target.label}: ${JSON.stringify(failed)}`);
  return { before, final };
}

async function downloadFile(url, outPath) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(url);
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
    }
  }
  if (!response) throw lastError;
  if (!response.ok || !response.body) throw new Error(`Download falhou ${response.status}: ${url}`);
  await pipeline(response.body, createWriteStream(outPath));
}

async function buildPackage(target, auditRows) {
  const dir = join(outputRoot, target.label);
  const zipPath = join(outputRoot, `${target.label}.zip`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const row of auditRows) {
    const filePath = join(dir, `${row.date}_${target.label}_evidencia.png`);
    await downloadFile(row.url, filePath);
    files.push({ date: row.date, filePath });
  }
  execFileSync("zip", ["-q", "-r", zipPath, target.label], { cwd: outputRoot });
  return { dir, zipPath, files };
}

async function runTarget(target) {
  const insertion = await requestJson(`/api/insertions/${target.insertionId}`);
  const publishable = Boolean(insertion.mediaUrl) && Boolean(insertion.bannerPublicadoNoSite);
  const summaryBase = {
    label: target.label,
    insertionId: target.insertionId,
    piCodigo: insertion.piCodigo,
    siteSigla: insertion.siteSigla,
    periodoInicio: insertion.periodoInicio,
    periodoFim: insertion.periodoFim,
    targetDate,
    statusNormalizado: insertion.statusNormalizado,
    mediaUrlPresent: Boolean(insertion.mediaUrl),
    bannerPublicadoNoSite: Boolean(insertion.bannerPublicadoNoSite),
  };
  if (!publishable) {
    const pending = {
      ...summaryBase,
      ok: false,
      skipped: true,
      reason: `Nao publicavel: mediaUrl=${Boolean(insertion.mediaUrl)} bannerPublicadoNoSite=${Boolean(insertion.bannerPublicadoNoSite)}`,
    };
    writeFileSync(join(logDir, `${target.label}.json`), JSON.stringify({ summary: pending, audit: null }, null, 2));
    log("target_pending", pending);
    return pending;
  }

  const endDate = minDate(insertion.periodoFim, targetDate);
  const dates = dateRange(insertion.periodoInicio, endDate);
  log("target_start", { ...summaryBase, dates: dates.length });
  const audit = await ensureAudited(target, dates);
  const pack = await buildPackage(target, audit.final);
  const summary = {
    ...summaryBase,
    ok: true,
    skipped: false,
    evidenceCount: audit.final.length,
    dir: pack.dir,
    zipPath: pack.zipPath,
    checkedAt: new Date().toISOString(),
  };
  writeFileSync(join(logDir, `${target.label}.json`), JSON.stringify({ summary, audit }, null, 2));
  log("target_done", summary);
  return summary;
}

async function main() {
  if (!opsEnv.OPS_API_TOKEN) throw new Error("OPS_API_TOKEN ausente em .env.adops-operator.local");
  const summaries = [];
  for (const target of targets) summaries.push(await runTarget(target));
  writeFileSync(join(logDir, "checklist-summary.json"), JSON.stringify({ outputRoot, targetDate, summaries }, null, 2));
  log("summary", {
    outputRoot,
    ok: summaries.filter((item) => item.ok).length,
    pending: summaries.filter((item) => item.skipped).length,
  });
}

await main();
