#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const repoRoot = resolve(new URL("../../../", import.meta.url).pathname);
const apiBase = "https://adops-api-public.leandro471.workers.dev";
const downloadsDir = join(process.env.HOME || "", "Downloads");
const projectDir = resolve(new URL(".", import.meta.url).pathname);
const logDir = join(projectDir, "logs");
mkdirSync(logDir, { recursive: true });

const mode = process.argv[2] || "today";
const sendTelegram = process.argv.includes("--telegram");
const sendTelegramEvidences = process.argv.includes("--telegram-evidences");

const targets = {
  today: [
    { label: "AFL-PI-14354-feminicidio", site: "AFL", pi: "14354", insertionId: 1342, targetDate: "2026-05-30", sendTelegram: false },
  ],
  "scheduled-15h": [
    { label: "OMT-PI-14414-vacina", site: "OMT", pi: "14414", insertionId: 1390, targetDate: "2026-05-30", sendTelegram: true },
    { label: "PERRENGUE-PI-15948-IPVA-2026", site: "PERRENGUE", pi: "15948", insertionId: 1254, targetDate: "2026-05-30", sendTelegram: true },
    { label: "PERRENGUE-PI-16091-governo", site: "PERRENGUE", pi: "16091", insertionId: 1271, targetDate: "2026-05-30", sendTelegram: true },
    { label: "PPMT-PI-14357-feminicidio", site: "PPMT", pi: "14357", insertionId: 1347, targetDate: "2026-05-30", sendTelegram: true },
    { label: "ROO-PI-14355-feminicidio", site: "ROO", pi: "14355", insertionId: 1341, targetDate: "2026-05-30", sendTelegram: true },
  ],
};
targets.tomorrow = targets["scheduled-15h"];

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
const tgEnv = parseEnvFile(join(repoRoot, "ops/telegram-bot/.env"));

function log(message, payload) {
  const line = payload === undefined ? message : `${message} ${JSON.stringify(payload)}`;
  console.log(line);
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
  if (!response.ok) {
    throw new Error(`${path} falhou: ${response.status} ${text}`);
  }
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
  const body = {
    insertionId,
    date,
    force: true,
    replace: true,
  };
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
  const jobs = [];
  const before = [];
  for (const date of dates) {
    const status = await requestJson(`/api/insertions/${target.insertionId}/capture-proof/status?date=${date}`);
    before.push({ date, ok: statusOk(status), status: status.status, issues: (status.audit?.issues || status.issues || []).length });
    if (!statusOk(status)) {
      jobs.push({ date });
    }
  }
  if (jobs.length) {
    log("prints_needed", { label: target.label, dates: jobs.map((job) => job.date) });
    for (const job of jobs) {
      await regenerateDate(target, job.date);
    }
  }

  const final = [];
  for (const date of dates) {
    const status = await requestJson(`/api/insertions/${target.insertionId}/capture-proof/status?date=${date}`);
    const issues = status.audit?.issues || status.issues || [];
    final.push({ date, ok: statusOk(status), status: status.status, issues: issues.length, url: status.arquivoUrl || null });
  }
  const failed = final.filter((item) => !item.ok);
  if (failed.length) {
    throw new Error(`Auditoria ainda falhou para ${target.label}: ${JSON.stringify(failed)}`);
  }
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

async function buildZip(target, auditRows) {
  const dir = join(downloadsDir, target.label);
  const zipPath = join(downloadsDir, `${target.label}.zip`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const row of auditRows) {
    const filePath = join(dir, `${row.date}_${target.label}_evidencia.png`);
    await downloadFile(row.url, filePath);
    files.push({ date: row.date, filePath });
  }
  execFileSync("zip", ["-q", "-r", zipPath, target.label], { cwd: downloadsDir });
  return { dir, zipPath, files };
}

async function sendDocument(filePath, caption) {
  if (!tgEnv.TELEGRAM_BOT_TOKEN || !tgEnv.TELEGRAM_DEFAULT_GROUP_ID) {
    throw new Error("Telegram env ausente.");
  }
  const form = new FormData();
  form.set("chat_id", tgEnv.TELEGRAM_DEFAULT_GROUP_ID);
  form.set("caption", caption);
  const blob = new Blob([readFileSync(filePath)], { type: "application/octet-stream" });
  form.set("document", blob, filePath.split("/").pop());
  const response = await fetch(`https://api.telegram.org/bot${tgEnv.TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Telegram falhou: ${JSON.stringify(payload)}`);
  }
  return payload.result?.message_id || null;
}

async function sendEvidenceDocuments(target, files) {
  const messageIds = [];
  for (const file of files) {
    const messageId = await sendDocument(file.filePath, `${target.label} | Evidencia auditada ${file.date}`);
    messageIds.push({ date: file.date, messageId });
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return messageIds;
}

async function runTarget(target) {
  const insertion = await requestJson(`/api/insertions/${target.insertionId}`);
  const endDate = minDate(insertion.periodoFim, target.targetDate);
  const dates = dateRange(insertion.periodoInicio, endDate);
  if (!insertion.mediaUrl || !insertion.bannerPublicadoNoSite) {
    throw new Error(`${target.label} nao esta publicavel: mediaUrl=${Boolean(insertion.mediaUrl)} bannerPublicadoNoSite=${Boolean(insertion.bannerPublicadoNoSite)}`);
  }
  log("target_start", { label: target.label, insertionId: target.insertionId, periodoInicio: insertion.periodoInicio, periodoFim: insertion.periodoFim, targetDate: target.targetDate, dates: dates.length });
  const audit = await ensureAudited(target, dates);
  const zip = await buildZip(target, audit.final);
  const telegramEvidenceMessages = (sendTelegram && sendTelegramEvidences && target.sendTelegram)
    ? await sendEvidenceDocuments(target, zip.files)
    : [];
  const telegramMessageId = (sendTelegram && target.sendTelegram)
    ? await sendDocument(zip.zipPath, `FINAL - ${target.label} | ZIP completo com ${audit.final.length} evidencias auditadas`)
    : null;
  const summary = {
    label: target.label,
    insertionId: target.insertionId,
    piCodigo: insertion.piCodigo,
    siteSigla: insertion.siteSigla,
    periodoInicio: insertion.periodoInicio,
    periodoFim: insertion.periodoFim,
    targetDate: target.targetDate,
    evidenceCount: audit.final.length,
    zipPath: zip.zipPath,
    telegramEvidenceMessages,
    telegramMessageId,
    checkedAt: new Date().toISOString(),
  };
  writeFileSync(join(logDir, `${target.label}.json`), JSON.stringify({ summary, audit }, null, 2));
  log("target_done", summary);
  return summary;
}

export async function main() {
  if (!targets[mode]) {
    throw new Error(`Modo invalido: ${mode}. Use today, scheduled-15h ou tomorrow.`);
  }
  if (!opsEnv.OPS_API_TOKEN) {
    throw new Error("OPS_API_TOKEN ausente em .env.adops-operator.local");
  }

  const summaries = [];
  for (const target of targets[mode]) {
    summaries.push(await runTarget(target));
  }
  writeFileSync(join(logDir, `${mode}-summary.json`), JSON.stringify(summaries, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
