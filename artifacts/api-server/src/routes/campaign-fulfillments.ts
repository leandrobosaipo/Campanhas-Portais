import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { chromium, type Browser, type Page } from "playwright";
import { withPlaywrightPermit } from "../lib/playwright-budget";

type FulfillmentJobRow = {
  id: string;
  status: string;
  payload_json: string;
  result_json: string | null;
  error_text: string | null;
  requested_by: string | null;
  runner_id: string | null;
  created_at: string;
  updated_at: string;
};

const router: IRouter = Router();
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const SUPPORTED_SITES = new Set(["AFL", "OMT", "ROO", "PERRENGUE", "PNMT", "PPMT"]);

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function describeJob(row: FulfillmentJobRow) {
  const payload = parseJson(row.payload_json) as Record<string, unknown> | null;
  const result = parseJson(row.result_json) as Record<string, unknown> | null;
  return {
    jobId: row.id,
    kind: "campaign-fulfillment",
    status: row.status,
    stage: typeof result?.stage === "string"
      ? result.stage
      : typeof (result?.execution as Record<string, unknown> | undefined)?.stage === "string"
        ? (result?.execution as Record<string, unknown>).stage
        : row.status,
    piCodigo: payload?.piCodigo ?? null,
    siteSigla: payload?.siteSigla ?? null,
    placement: payload?.placement ?? null,
    payload,
    result,
    error: row.error_text,
    requestedBy: row.requested_by,
    runnerId: row.runner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    links: {
      status: `/api/campaign-fulfillments/jobs/${row.id}`,
      report: `/api/campaign-fulfillments/jobs/${row.id}/report`,
      reportPdf: `/api/campaign-fulfillments/jobs/${row.id}/report.pdf`,
    },
  };
}

async function findJob(jobId: string) {
  const found = await pool.query<FulfillmentJobRow>(
    "SELECT * FROM ops_jobs WHERE id = $1 AND kind = 'campaign-fulfillment' LIMIT 1",
    [jobId],
  );
  return found.rows[0] ?? null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function valueAt(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function renderChecklist(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return "<p class=\"muted\">Checklist ainda não disponível.</p>";
  return `<div class="checklist">${items.map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const ok = item.ok === true;
    return `<div class="check ${ok ? "ok" : "pending"}"><span>${ok ? "✓" : "!"}</span><div><strong>${escapeHtml(item.label ?? item.key ?? "Validação")}</strong><small>${escapeHtml(item.details ?? "")}</small></div></div>`;
  }).join("")}</div>`;
}

function renderArtifacts(artifacts: unknown) {
  if (!artifacts || typeof artifacts !== "object") return "<p class=\"muted\">Artefatos ainda não disponíveis.</p>";
  const links: Array<{ label: string; url: string }> = [];
  const walk = (value: unknown, label: string) => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${label} ${index + 1}`));
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") links.push({ label: String(record.fileName ?? record.position ?? label), url: record.url });
    for (const [key, nested] of Object.entries(record)) {
      if (key !== "url" && (Array.isArray(nested) || (nested && typeof nested === "object"))) walk(nested, key);
    }
  };
  walk(artifacts, "Arquivo");
  if (!links.length) return "<p class=\"muted\">Artefatos ainda não disponíveis.</p>";
  return `<div class="links">${links.map(({ label, url }) => `<a href="${escapeHtml(url)}">${escapeHtml(label)} <span>↗</span></a>`).join("")}</div>`;
}

function renderReport(row: FulfillmentJobRow) {
  const job = describeJob(row);
  const storedResult = job.result;
  const result = valueAt(storedResult, ["execution"]) ?? storedResult;
  const operation = valueAt(result, ["operation"]) as Record<string, unknown> | null;
  const period = operation?.period as Record<string, unknown> | undefined;
  const format = operation?.format as Record<string, unknown> | undefined;
  const evidence = operation?.evidence as Record<string, unknown> | undefined;
  const artifacts = valueAt(result, ["delivery", "artifacts"]) ?? valueAt(result, ["artifacts"]);
  const sourceProofs = valueAt(result, ["sourceProofs"]);
  const checklist = valueAt(result, ["checklist"]);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrega PI ${escapeHtml(job.piCodigo)}</title><style>
  :root{--ink:#14213d;--muted:#667085;--line:#d9dde7;--paper:#fbfaf6;--card:#fff;--accent:#176b5b;--warn:#a15c00}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif}.wrap{max-width:1040px;margin:auto;padding:28px}.hero{background:linear-gradient(135deg,#14213d,#203961);color:#fff;border-radius:22px;padding:30px;display:grid;gap:16px}.eyebrow{font-size:12px;letter-spacing:.13em;text-transform:uppercase;opacity:.74}.hero h1{font-size:clamp(28px,6vw,54px);line-height:1;margin:0}.status{display:inline-flex;width:max-content;padding:7px 12px;border-radius:999px;background:#ffffff1c;border:1px solid #ffffff38}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}.card h2{font-size:15px;margin:0 0 12px}.value{font-size:20px;font-weight:700;overflow-wrap:anywhere}.muted,small{color:var(--muted)}.checklist{display:grid;gap:9px}.check{display:flex;gap:10px;padding:10px;border:1px solid var(--line);border-radius:12px}.check>span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;flex:none}.check.ok>span{background:#dff4ec;color:var(--accent)}.check.pending>span{background:#fff0d8;color:var(--warn)}.check small{display:block}.links{display:grid;gap:8px}.links a{display:flex;justify-content:space-between;padding:11px 13px;border:1px solid var(--line);border-radius:10px;color:var(--ink);text-decoration:none;overflow-wrap:anywhere}.wide{grid-column:span 2}.footer{font-size:12px;color:var(--muted);margin:20px 4px}@media(max-width:760px){.wrap{padding:14px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.hero{padding:22px}.hero h1{font-size:32px}}@media print{body{background:#fff}.wrap{max-width:none;padding:0}.card,.hero{break-inside:avoid}.links a{color:#14213d}}
  </style></head><body><main class="wrap"><section class="hero"><div class="eyebrow">AdOps Código5 · dossiê operacional</div><h1>PI ${escapeHtml(job.piCodigo)} · ${escapeHtml(job.siteSigla)}</h1><div class="status">${escapeHtml(job.status)} · ${escapeHtml(job.stage)}</div></section><section class="grid">
  <article class="card"><h2>Período</h2><div class="value">${escapeHtml(period?.start ?? "—")} → ${escapeHtml(period?.end ?? "—")}</div></article>
  <article class="card"><h2>Posição</h2><div class="value">${escapeHtml(format?.normalized ?? format?.sheet ?? job.placement ?? "—")}</div></article>
  <article class="card"><h2>Evidências</h2><div class="value">${escapeHtml(Array.isArray(evidence?.auditedDates) ? evidence.auditedDates.length : 0)} auditadas</div></article>
  <article class="card wide"><h2>Checklist de entrega</h2>${renderChecklist(checklist)}</article>
  <article class="card"><h2>Arquivos finais</h2>${renderArtifacts(artifacts)}</article>
  <article class="card wide"><h2>Fontes conferidas</h2>${renderArtifacts(sourceProofs)}</article>
  <article class="card"><h2>Divergências</h2><p>${escapeHtml(valueAt(result, ["sourceConflicts", "summary"]) ?? "Nenhuma divergência pendente registrada.")}</p></article>
  </section><div class="footer">Job ${escapeHtml(job.jobId)} · atualizado em ${escapeHtml(job.updatedAt)} · dados gerados pela API AdOps</div></main></body></html>`;
}

router.post("/campaign-fulfillments/jobs", async (req, res): Promise<void> => {
  const piCodigo = String(req.body?.piCodigo ?? "").replace(/\D/g, "");
  const requestedSite = String(req.body?.siteSigla ?? "").trim().toUpperCase();
  const siteSigla = requestedSite === "PMT" || requestedSite === "PMMT" ? "PPMT" : requestedSite;
  const placement = typeof req.body?.placement === "string" ? req.body.placement.trim() : null;
  const campaignDate = typeof req.body?.campaignDate === "string" && isIsoDate(req.body.campaignDate)
    ? req.body.campaignDate
    : null;
  if (req.body?.campaignDate != null && !campaignDate) {
    res.status(400).json({ error: "bad_request", details: "campaignDate deve estar no formato YYYY-MM-DD." });
    return;
  }
  if (!piCodigo || !SUPPORTED_SITES.has(siteSigla)) {
    res.status(400).json({ error: "bad_request", details: "piCodigo e siteSigla suportada são obrigatórios.", allowedSites: Array.from(SUPPORTED_SITES) });
    return;
  }
  const payload = {
    piCodigo,
    siteSigla,
    placement,
    campaignDate,
    sendTelegram: req.body?.sendTelegram !== false,
    chatId: typeof req.body?.chatId === "string" ? req.body.chatId.trim() : null,
    refreshDrive: req.body?.refreshDrive !== false,
    source: typeof req.body?.source === "string" ? req.body.source : "campaign-fulfillment-api",
  };
  const requestedKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";
  const idempotencyKey = requestedKey || `fulfill:${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32)}`;
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    res.status(400).json({ error: "bad_request", details: "Idempotency-Key inválida." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`campaign-fulfillment:${idempotencyKey}`]);
    const existing = await client.query<{ id: string; status: string; payload_json: string }>(
      `SELECT id, status, payload_json FROM ops_jobs WHERE kind = 'campaign-fulfillment' AND payload_json::jsonb ->> 'idempotencyKey' = $1 ORDER BY created_at DESC LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      const previous = parseJson(existing.rows[0].payload_json) as Record<string, unknown> | null;
      const previousPayload = { ...previous };
      delete previousPayload.idempotencyKey;
      if (createHash("sha256").update(JSON.stringify(previousPayload)).digest("hex") !== createHash("sha256").update(JSON.stringify(payload)).digest("hex")) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "idempotency_conflict", details: "A Idempotency-Key já foi usada com outro payload." });
        return;
      }
      await client.query("COMMIT");
      res.status(200).json({ ok: true, duplicate: true, jobId: existing.rows[0].id, status: existing.rows[0].status, ...payload });
      return;
    }
    const jobId = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at) VALUES ($1, 'campaign-fulfillment', 'ready_for_runner', $2, NULL, NULL, $3, NULL, $4, $4)`,
      [jobId, JSON.stringify({ ...payload, idempotencyKey }), typeof req.body?.requestedBy === "string" ? req.body.requestedBy : "api-server", now],
    );
    await client.query("COMMIT");
    res.status(202).json({ ok: true, duplicate: false, jobId, status: "ready_for_runner", ...payload });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
});

router.get("/campaign-fulfillments/jobs/:jobId", async (req, res): Promise<void> => {
  const job = await findJob(req.params.jobId);
  if (!job) return void res.status(404).json({ error: "not_found", details: "Job de fulfillment não encontrado." });
  res.setHeader("Cache-Control", "no-store");
  res.json(describeJob(job));
});

router.get("/campaign-fulfillments/jobs/:jobId/report", async (req, res): Promise<void> => {
  const job = await findJob(req.params.jobId);
  if (!job) return void res.status(404).send("Job de fulfillment não encontrado.");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(renderReport(job));
});

router.get("/campaign-fulfillments/jobs/:jobId/report.pdf", async (req, res): Promise<void> => {
  const job = await findJob(req.params.jobId);
  if (!job) return void res.status(404).send("Job de fulfillment não encontrado.");
  const pdf = await withPlaywrightPermit(`campaign-fulfillment-report:${job.id}`, async () => {
    let browser: Browser | null = null;
    let page: Page | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(process.env["ADOPS_CHROMIUM_EXECUTABLE_PATH"]?.trim()
          ? { executablePath: process.env["ADOPS_CHROMIUM_EXECUTABLE_PATH"]!.trim() }
          : {}),
      });
      page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.setContent(renderReport(job), { waitUntil: "networkidle" });
      return page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" } });
    } finally {
      await Promise.allSettled([
        page ? page.close() : Promise.resolve(),
        browser ? browser.close() : Promise.resolve(),
      ]);
    }
  });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `inline; filename=PI-${String(describeJob(job).piCodigo)}-${String(describeJob(job).siteSigla)}.pdf`);
  res.type("application/pdf").send(pdf);
});

export default router;
