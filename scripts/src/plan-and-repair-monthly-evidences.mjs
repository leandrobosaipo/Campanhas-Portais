#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyEvidenceStatus,
  isAuditFailureJob,
  selectCanonicalInsertions,
} from "./monthly-evidence-contract.mjs";

const cod5_repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cod5_targetDate = process.env.ADOPS_REPAIR_DATE || new Date().toLocaleDateString("en-CA", { timeZone: "America/Cuiaba" });
const cod5_competencia = process.env.ADOPS_REPAIR_COMPETENCIA || "AGOSTO/2026";
const cod5_privateApi = (process.env.ADOPS_PRIVATE_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const cod5_opsApi = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, "");
const cod5_token = String(process.env.OPS_API_TOKEN || "").trim();
const cod5_apply = process.argv.includes("--apply");
const cod5_reuseBaseline = process.argv.includes("--reuse-baseline");
const cod5_resume = process.argv.includes("--resume");
const cod5_outputDir = process.env.ADOPS_REPAIR_OUTPUT_DIR || path.join(cod5_repoRoot, "outputs", `adops-evidence-repair-${cod5_targetDate}`);

if (!cod5_token) throw new Error("OPS_API_TOKEN ausente. Carregue .env.adops-operator.local sem imprimir o valor.");

function cod5_headers(json = false) {
  return {
    authorization: `Bearer ${cod5_token}`,
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function cod5_request(base, pathname, options = {}, attempts = 3) {
  let cod5_lastError;
  for (let cod5_attempt = 1; cod5_attempt <= attempts; cod5_attempt += 1) {
    try {
      const cod5_response = await fetch(`${base}${pathname}`, {
        ...options,
        headers: { ...cod5_headers(Boolean(options.body)), ...(options.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      const cod5_text = await cod5_response.text();
      let cod5_payload = null;
      try {
        cod5_payload = cod5_text ? JSON.parse(cod5_text) : null;
      } catch {
        throw new Error(`${pathname} devolveu conteúdo não JSON (HTTP ${cod5_response.status}).`);
      }
      if (!cod5_response.ok) throw new Error(`${pathname} HTTP ${cod5_response.status}: ${cod5_text.slice(0, 500)}`);
      return cod5_payload;
    } catch (error) {
      cod5_lastError = error;
      if (cod5_attempt < attempts) await new Promise((resolve) => setTimeout(resolve, cod5_attempt * 2_000));
    }
  }
  throw cod5_lastError;
}

async function cod5_mapLimit(values, limit, mapper) {
  const cod5_results = new Array(values.length);
  let cod5_index = 0;
  async function cod5_worker() {
    for (;;) {
      const cod5_current = cod5_index++;
      if (cod5_current >= values.length) return;
      cod5_results[cod5_current] = await mapper(values[cod5_current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, cod5_worker));
  return cod5_results;
}

function cod5_evidenceDate(row) {
  return String(row?.titulo || "").match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
}

async function cod5_loadBaseline() {
  const cod5_activePayload = await cod5_request(cod5_privateApi, `/api/campaign-operations/active?date=${encodeURIComponent(cod5_targetDate)}`);
  const cod5_activeItems = Array.isArray(cod5_activePayload?.items) ? cod5_activePayload.items : [];
  const cod5_canonicalRefs = cod5_activeItems
    .filter((item) => Number.isInteger(Number(item?.adops?.insertionId)) && Number(item.adops.insertionId) > 0)
    .map((item) => ({ ...item, id: Number(item.adops.insertionId) }));
  const cod5_monthPayload = await cod5_request(cod5_privateApi, `/api/insertions?competencia=${encodeURIComponent(cod5_competencia)}&limit=500`);
  const cod5_monthItems = Array.isArray(cod5_monthPayload) ? cod5_monthPayload : cod5_monthPayload?.items || [];
  const cod5_canonicalMonthItems = selectCanonicalInsertions(cod5_canonicalRefs, cod5_monthItems);
  const cod5_uniqueIds = new Set(cod5_canonicalRefs.map((item) => item.id));
  if (
    cod5_canonicalRefs.length === 0
    || cod5_canonicalRefs.length !== cod5_activeItems.length
    || cod5_canonicalMonthItems.length !== cod5_canonicalRefs.length
    || cod5_uniqueIds.size !== cod5_canonicalRefs.length
    || Number(cod5_activePayload?.summary?.needsCreateInAdOps || 0) > 0
    || Number(cod5_activePayload?.summary?.hasDivergence || 0) > 0
  ) {
    throw new Error(`Gate canônico recusado: sheet=${cod5_activeItems.length}, active=${cod5_canonicalRefs.length}, month=${cod5_canonicalMonthItems.length}, unique=${cod5_uniqueIds.size}, needsCreate=${Number(cod5_activePayload?.summary?.needsCreateInAdOps || 0)}, divergences=${Number(cod5_activePayload?.summary?.hasDivergence || 0)}.`);
  }
  if (cod5_canonicalRefs.some((item) => item.id === 1826)) throw new Error("Gate canônico recusado: inserção duplicada #1826 presente.");

  const cod5_tasks = cod5_canonicalRefs.flatMap((item) => (item.evidence?.requiredDates || [])
    .filter((date) => date <= cod5_targetDate)
    .map((date) => ({ item, date })));
  const cod5_rowsByInsertion = new Map(await cod5_mapLimit(cod5_canonicalRefs, 1, async (item) => {
    const cod5_rows = await cod5_request(cod5_privateApi, `/api/insertions/${item.id}/evidences`, {}, 5).catch(() => []);
    return [item.id, Array.isArray(cod5_rows) ? cod5_rows : cod5_rows?.items || []];
  }));
  const cod5_entries = await cod5_mapLimit(cod5_tasks, 1, async ({ item, date }) => {
    const cod5_status = await cod5_request(cod5_privateApi, `/api/insertions/${item.id}/capture-proof/status?date=${encodeURIComponent(date)}`, {}, 5);
    const cod5_evidenceRows = (cod5_rowsByInsertion.get(item.id) || []).filter((row) => cod5_evidenceDate(row) === date);
    return {
      insertionId: item.id,
      campaignName: item.campaignName,
      piCodigo: item.piCodigo,
      siteSigla: item.siteSigla,
      format: item.format?.normalized || item.format?.adops || item.format?.sheet || null,
      date,
      classification: classifyEvidenceStatus(cod5_status),
      evidenceRows: cod5_evidenceRows.map((row) => ({ id: row.id, titulo: row.titulo, arquivoUrl: row.arquivoUrl, criadoEm: row.criadoEm })),
      status: cod5_status,
    };
  });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    targetDate: cod5_targetDate,
    competencia: cod5_competencia,
    source: "campaign-operations/active",
    canonicalInsertionIds: cod5_canonicalRefs.map((item) => item.id).sort((a, b) => a - b),
    excludedInsertionIds: [1826],
    summary: {
      insertions: cod5_canonicalRefs.length,
      audited: cod5_entries.filter((item) => item.classification.startsWith("audited")).length,
      missing: cod5_entries.filter((item) => item.classification === "missing").length,
      invalid: cod5_entries.filter((item) => item.classification === "invalid").length,
    },
    entries: cod5_entries,
  };
}

async function cod5_waitJob(jobId) {
  const cod5_deadline = Date.now() + 20 * 60_000;
  while (Date.now() < cod5_deadline) {
    const cod5_job = await cod5_request(cod5_opsApi, `/api/ops/jobs/${encodeURIComponent(jobId)}`);
    if (cod5_job?.status === "completed") return cod5_job;
    if (cod5_job?.status === "failed") return cod5_job;
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }
  throw new Error(`Timeout aguardando job ${jobId}.`);
}

async function cod5_repairEntry(entry) {
  if (entry?.status?.hasMedia !== true) {
    return {
      ok: false,
      ...entry,
      blocker: "insertion_media_missing",
      attempts: [],
    };
  }
  const cod5_firstEndpoint = entry.classification === "missing" ? "/api/ops/jobs/print-backfill" : "/api/ops/jobs/print-single";
  const cod5_firstBody = entry.classification === "missing"
    ? { insertionId: entry.insertionId, fromDate: entry.date, toDate: entry.date, replace: false, force: false }
    : { insertionId: entry.insertionId, date: entry.date, replace: true, force: false };
  const cod5_attempts = [];
  let cod5_technicalFailures = 0;
  let cod5_auditAttempt = 0;
  while (cod5_auditAttempt <= 2 && cod5_technicalFailures < 3) {
    const cod5_endpoint = cod5_auditAttempt === 0 ? cod5_firstEndpoint : "/api/ops/jobs/print-single";
    const cod5_body = cod5_auditAttempt === 0 ? cod5_firstBody : { insertionId: entry.insertionId, date: entry.date, replace: true, force: false };
    const cod5_created = await cod5_request(cod5_opsApi, cod5_endpoint, { method: "POST", body: JSON.stringify(cod5_body) }, 3);
    const cod5_job = await cod5_waitJob(cod5_created.jobId);
    const cod5_status = await cod5_request(cod5_privateApi, `/api/insertions/${entry.insertionId}/capture-proof/status?date=${encodeURIComponent(entry.date)}`);
    const cod5_classification = classifyEvidenceStatus(cod5_status);
    cod5_attempts.push({
      jobId: cod5_created.jobId,
      jobStatus: cod5_job.status,
      classification: cod5_classification,
      status: cod5_status.status,
      failureKind: cod5_job.status === "failed" ? (isAuditFailureJob(cod5_job) ? "audit" : "technical") : null,
    });
    if (cod5_classification.startsWith("audited")) return { ok: true, ...entry, attempts: cod5_attempts, finalStatus: cod5_status };
    if (cod5_job.status === "failed" && !isAuditFailureJob(cod5_job)) cod5_technicalFailures += 1;
    else cod5_auditAttempt += 1;
    if (cod5_auditAttempt <= 2 && cod5_technicalFailures < 3) await new Promise((resolve) => setTimeout(resolve, 12_000));
  }
  return { ok: false, ...entry, attempts: cod5_attempts };
}

await mkdir(cod5_outputDir, { recursive: true });
console.error(`[adops-evidence-repair] ${cod5_reuseBaseline ? "reutilizando" : "coletando"} baseline canônico de ${cod5_targetDate}`);
const cod5_baseline = cod5_reuseBaseline
  ? JSON.parse(await readFile(path.join(cod5_outputDir, "baseline-manifest.json"), "utf8"))
  : await cod5_loadBaseline();
if (
  cod5_baseline?.targetDate !== cod5_targetDate ||
  !Number.isInteger(cod5_baseline?.summary?.insertions) ||
  cod5_baseline.summary.insertions <= 0 ||
  !Array.isArray(cod5_baseline?.canonicalInsertionIds) ||
  cod5_baseline.canonicalInsertionIds.length !== cod5_baseline.summary.insertions ||
  new Set(cod5_baseline.canonicalInsertionIds).size !== cod5_baseline.summary.insertions ||
  cod5_baseline.canonicalInsertionIds.includes(1826)
) {
  throw new Error("Baseline reutilizado recusado: data ou conjunto canônico inválido.");
}
await writeFile(path.join(cod5_outputDir, "baseline-manifest.json"), `${JSON.stringify(cod5_baseline, null, 2)}\n`, "utf8");
console.error(`[adops-evidence-repair] baseline salvo: ${JSON.stringify(cod5_baseline.summary)}`);

if (!cod5_apply) {
  console.log(JSON.stringify({ ok: true, apply: false, outputDir: cod5_outputDir, summary: cod5_baseline.summary }, null, 2));
  process.exit(0);
}

const cod5_pending = cod5_baseline.entries.filter((item) => item.classification === "missing" || item.classification === "invalid");
const cod5_resultsPath = path.join(cod5_outputDir, "repair-results.json");
let cod5_results = [];
if (cod5_resume) {
  try {
    const cod5_previous = JSON.parse(await readFile(cod5_resultsPath, "utf8"));
    cod5_results = Array.isArray(cod5_previous?.results) ? cod5_previous.results : [];
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
const cod5_completedKeys = new Set(cod5_results.filter((item) => item.ok).map((item) => `${item.insertionId}:${item.date}`));
cod5_results = cod5_results.filter((item) => item.ok);
for (const [cod5_pendingIndex, cod5_entry] of cod5_pending.entries()) {
  const cod5_entryKey = `${cod5_entry.insertionId}:${cod5_entry.date}`;
  if (cod5_completedKeys.has(cod5_entryKey)) {
    console.error(`[adops-evidence-repair] ${cod5_pendingIndex + 1}/${cod5_pending.length} #${cod5_entry.insertionId} ${cod5_entry.date} retomada: já registrada`);
    continue;
  }
  console.error(`[adops-evidence-repair] ${cod5_pendingIndex + 1}/${cod5_pending.length} #${cod5_entry.insertionId} ${cod5_entry.date} ${cod5_entry.classification}`);
  cod5_results.push(await cod5_repairEntry(cod5_entry));
  const cod5_checkpoint = {
    generatedAt: new Date().toISOString(),
    total: cod5_results.length,
    approved: cod5_results.filter((item) => item.ok).length,
    blocked: cod5_results.filter((item) => !item.ok).length,
    complete: false,
    results: cod5_results,
  };
  await writeFile(cod5_resultsPath, `${JSON.stringify(cod5_checkpoint, null, 2)}\n`, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 12_000));
}
const cod5_repairReport = {
  generatedAt: new Date().toISOString(),
  total: cod5_results.length,
  approved: cod5_results.filter((item) => item.ok).length,
  blocked: cod5_results.filter((item) => !item.ok).length,
  complete: true,
  results: cod5_results,
};
await writeFile(cod5_resultsPath, `${JSON.stringify(cod5_repairReport, null, 2)}\n`, "utf8");
if (cod5_repairReport.blocked) throw new Error(`${cod5_repairReport.blocked} evidência(s) permanecem bloqueadas após as tentativas permitidas.`);
console.log(JSON.stringify({ ok: true, apply: true, outputDir: cod5_outputDir, summary: cod5_repairReport }, null, 2));
