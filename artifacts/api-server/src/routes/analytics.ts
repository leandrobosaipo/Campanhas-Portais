import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { agenciesTable, campaignsTable, clientsTable, db, insertionsTable, sitesTable, pool } from "@workspace/db";
import { cod5_criarJobOperacional, cod5_obterJobOperacional, cod5_listarJobsOperacionais, cod5_chaveEstavelPayloadOperacional } from "../lib/ops-job-store";

type AnalyticsSiteConfig = {
  propertyKey: string;
  siteSigla: string;
  reportConfigName: string;
  analyticsSource: "ga4";
  recommendedDimensions: string[];
  recommendedMetrics: string[];
  notes: string[];
};

type InsertionContext = {
  id: number;
  campanhaId: number | null;
  campanhaName: string | null;
  clienteNome: string | null;
  agenciaNome: string | null;
  piCodigo: string | null;
  siteSigla: string | null;
  siteNome: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  observacoes: string | null;
  competencia: string | null;
};

export type AnalyticsReportSummary = {
  id: string;
  kind: "ga4";
  propertyKey: string | null;
  campaignName: string | null;
  clientName: string | null;
  piCodigo: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodMode: string;
  dimensions: unknown[];
  metrics: unknown[];
  status: string;
  downloadUrl: string | null;
  previewUrl: string | null;
  fileName: string | null;
  createdAt: string;
  updatedAt: string;
};

const cod5_router: IRouter = Router();

const cod5_configuracoesSitesAnalytics: AnalyticsSiteConfig[] = [
  ["afolhalivre-ga4", "AFL", "afolhalivre"],
  ["omatogrossense-ga4", "OMT", "omatogrossense"],
  ["perrenguemt-ga4", "PERRENGUE", "perrenguemt"],
  ["portalnortemt-ga4", "PNMT", "portalnortemt"],
  ["portalpantanalmt-ga4", "PPMT", "portalpantanalmt"],
  ["roonoticias-ga4", "ROO", "roonoticias"],
].map(([propertyKey, siteSigla, reportConfigName]) => ({
  propertyKey: propertyKey!,
  siteSigla: siteSigla!,
  reportConfigName: reportConfigName!,
  analyticsSource: "ga4" as const,
  recommendedDimensions: ["city"],
  recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
  notes: [
    "A automação atual gera o relatório GA4 em modo Cidade.",
    "O período final segue a janela real da inserção/PI.",
  ],
}));

function cod5_normalizarTexto(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function cod5_formatarDataIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cod5_lerDataIso(value: unknown) {
  const raw = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00-04:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cod5_hojeEmCuiaba() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cod5_lerMesCompetencia(value: unknown) {
  const normalized = cod5_normalizarTexto(value).toUpperCase().replace(/\s+/g, "");
  const numeric = normalized.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  if (numeric) return { year: Number(numeric[1]), month: Number(numeric[2]) - 1 };
  const named = normalized.match(/^(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})$/);
  if (!named) return null;
  const month = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"].indexOf(named[1]!);
  return month >= 0 ? { year: Number(named[2]), month } : null;
}

async function cod5_obterContextoInsercao(insertionId: number): Promise<InsertionContext | null> {
  const [insertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!insertion) return null;
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, insertion.campanhaId));
  const [site] = insertion.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, insertion.siteId)) : [null];
  const [client] = campaign?.clienteId ? await db.select().from(clientsTable).where(eq(clientsTable.id, campaign.clienteId)) : [null];
  const [agency] = campaign?.agenciaId ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, campaign.agenciaId)) : [null];
  return {
    id: insertion.id,
    campanhaId: campaign?.id ?? null,
    campanhaName: campaign?.nome ?? null,
    clienteNome: client?.nome ?? null,
    agenciaNome: agency?.nome ?? null,
    piCodigo: campaign?.piCodigo ?? null,
    siteSigla: site?.sigla ?? null,
    siteNome: site?.nome ?? null,
    periodoInicio: insertion.periodoInicio ?? null,
    periodoFim: insertion.periodoFim ?? null,
    observacoes: insertion.observacoes ?? null,
    competencia: campaign?.competencia ?? null,
  };
}

function cod5_resolverConfiguracaoSite(insertion: InsertionContext, requestedPropertyKey?: string | null) {
  const requested = requestedPropertyKey?.trim().toLowerCase();
  if (requested) {
    const exact = cod5_configuracoesSitesAnalytics.find((item) => item.propertyKey === requested);
    if (exact) return exact;
  }
  return cod5_configuracoesSitesAnalytics.find((item) => cod5_normalizarTexto(item.siteSigla) === cod5_normalizarTexto(insertion.siteSigla)) ?? null;
}

function cod5_exigeAnalytics(insertion: InsertionContext) {
  const agency = cod5_normalizarTexto(insertion.agenciaNome);
  const client = cod5_normalizarTexto(insertion.clienteNome);
  const campaign = cod5_normalizarTexto(insertion.campanhaName);
  const notes = cod5_normalizarTexto(insertion.observacoes);
  const pi = cod5_normalizarTexto(insertion.piCodigo);
  return agency.includes("genius")
    || (agency.includes("renca") && (client.includes("secom") || campaign.includes("secom") || notes.includes("secom")))
    || /\banalytics\b|\bgoogle analytics\b|\bga4\b/.test(`${notes} ${campaign} ${pi}`);
}

function cod5_resolverPeriodo(insertion: InsertionContext, mode: "pi" | "full_month" | "custom", customStart?: string | null, customEnd?: string | null) {
  if (mode === "custom") return { periodStart: customStart ?? null, periodEnd: customEnd ?? null };
  if (mode === "pi") return { periodStart: insertion.periodoInicio, periodEnd: insertion.periodoFim };
  const competencia = cod5_lerMesCompetencia(insertion.competencia);
  const base = competencia ? new Date(competencia.year, competencia.month, 1) : cod5_lerDataIso(insertion.periodoInicio);
  if (!base) return { periodStart: insertion.periodoInicio, periodEnd: insertion.periodoFim };
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const today = cod5_lerDataIso(cod5_hojeEmCuiaba());
  return {
    periodStart: cod5_formatarDataIso(monthStart),
    periodEnd: cod5_formatarDataIso(today && monthEnd > today ? today : monthEnd),
  };
}

function cod5_requisitosPara(insertion: InsertionContext, siteConfig: AnalyticsSiteConfig | null) {
  const piPeriod = cod5_resolverPeriodo(insertion, "pi");
  const monthPeriod = cod5_resolverPeriodo(insertion, "full_month");
  const required = cod5_exigeAnalytics(insertion);
  const notes = [
    required
      ? "A inserção bate em uma regra operacional que pede apoio de Analytics."
      : "A regra operacional não marcou Analytics como obrigatório, mas a integração pode ser solicitada se o site suportar GA4.",
    ...(siteConfig?.notes ?? []),
  ];
  return {
    insertionId: insertion.id,
    campaignId: insertion.campanhaId,
    piCodigo: insertion.piCodigo,
    siteSigla: insertion.siteSigla,
    requiresAnalytics: required,
    analyticsSource: siteConfig?.analyticsSource ?? null,
    propertyKey: siteConfig?.propertyKey ?? null,
    periodStart: piPeriod.periodStart,
    periodEnd: piPeriod.periodEnd,
    recommendedDimensions: siteConfig?.recommendedDimensions ?? [],
    recommendedMetrics: siteConfig?.recommendedMetrics ?? [],
    notes,
    periodOptions: [
      { mode: "pi", label: "Período da PI", description: "Usa exatamente a janela da inserção/PI.", ...piPeriod },
      { mode: "full_month", label: "Mês completo", description: "Usa o mês da competência inteira; se a competência atual ainda estiver em andamento, fecha até hoje.", ...monthPeriod },
      { mode: "custom", label: "Período customizado", description: "Permite escolher manualmente o início e o fim do relatório.", periodStart: null, periodEnd: null },
    ],
  };
}

function cod5_relatorioAnalyticsDoJob(job: NonNullable<Awaited<ReturnType<typeof cod5_obterJobOperacional>>>): AnalyticsReportSummary {
  const payload = job.payload ?? {};
  const result = job.result ?? {};
  const execution = result.execution && typeof result.execution === "object" && !Array.isArray(result.execution)
    ? result.execution as Record<string, unknown>
    : result;
  const downloadUrl = typeof execution.downloadUrl === "string" ? execution.downloadUrl : null;
  let fileName = typeof execution.fileName === "string" ? execution.fileName : null;
  if (!fileName && downloadUrl) {
    try { fileName = new URL(downloadUrl).pathname.split("/").filter(Boolean).at(-1) ?? null; } catch { fileName = null; }
  }
  return {
    id: job.id,
    kind: "ga4",
    propertyKey: typeof payload.propertyKey === "string" ? payload.propertyKey : null,
    campaignName: typeof payload.campaignName === "string" ? payload.campaignName : null,
    clientName: typeof payload.clientName === "string" ? payload.clientName : null,
    piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
    periodStart: typeof payload.periodStart === "string" ? payload.periodStart : null,
    periodEnd: typeof payload.periodEnd === "string" ? payload.periodEnd : null,
    periodMode: typeof payload.periodMode === "string" ? payload.periodMode : "pi",
    dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
    metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
    status: job.status,
    downloadUrl,
    previewUrl: typeof execution.previewUrl === "string" ? execution.previewUrl : downloadUrl,
    fileName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function cod5_listarRelatoriosAnalyticsConcluidos(insertionId: number): Promise<AnalyticsReportSummary[]> {
  const jobs = await cod5_listarJobsOperacionais("analytics-report", { insertionId, limit: 50 });
  return jobs.map(cod5_relatorioAnalyticsDoJob).filter((report) => report.status === "completed" && /^https?:\/\//i.test(report.downloadUrl ?? ""));
}

cod5_router.get("/analytics/insertions/:insertionId/requirements", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const insertionId = Number(req.params.insertionId);
  if (!Number.isInteger(insertionId) || insertionId <= 0) {
    res.status(400).json({ error: "bad_request", details: "insertionId inválido." });
    return;
  }
  const insertion = await cod5_obterContextoInsercao(insertionId);
  if (!insertion) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }
  res.json(cod5_requisitosPara(insertion, cod5_resolverConfiguracaoSite(insertion)));
});

cod5_router.post("/analytics/jobs/request-report", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const insertionId = Number(req.body?.insertionId);
  if (!Number.isInteger(insertionId) || insertionId <= 0) {
    res.status(400).json({ error: "bad_request", details: "Informe insertionId para solicitar o relatório de Analytics." });
    return;
  }
  const insertion = await cod5_obterContextoInsercao(insertionId);
  if (!insertion) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }
  const siteConfig = cod5_resolverConfiguracaoSite(insertion, typeof req.body?.propertyKey === "string" ? req.body.propertyKey : null);
  if (!siteConfig) {
    res.status(400).json({ error: "bad_request", details: "O site desta inserção ainda não possui configuração de Analytics por API." });
    return;
  }
  const requestedMode = typeof req.body?.periodMode === "string" ? req.body.periodMode : "pi";
  const periodMode = ["pi", "full_month", "custom"].includes(requestedMode)
    ? requestedMode as "pi" | "full_month" | "custom"
    : "pi";
  const resolvedPeriod = cod5_resolverPeriodo(
    insertion,
    periodMode,
    typeof req.body?.customPeriodStart === "string" ? req.body.customPeriodStart : null,
    typeof req.body?.customPeriodEnd === "string" ? req.body.customPeriodEnd : null,
  );
  if (!resolvedPeriod.periodStart || !resolvedPeriod.periodEnd) {
    res.status(400).json({ error: "bad_request", details: "A inserção não possui período suficiente para gerar o relatório." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodEnd)) {
    res.status(400).json({ error: "bad_request", details: "O período informado para Analytics está inválido." });
    return;
  }
  if (resolvedPeriod.periodStart > resolvedPeriod.periodEnd) {
    res.status(400).json({ error: "bad_request", details: "A data inicial do relatório não pode ser maior que a data final." });
    return;
  }
  const requirements = cod5_requisitosPara(insertion, siteConfig);
  const requestedBy = typeof req.body?.requestedBy === "string" ? req.body.requestedBy : "adops-ui-public";
  const payload = {
    campaignId: insertion.campanhaId,
    campaignName: insertion.campanhaName,
    insertionId: insertion.id,
    piCodigo: insertion.piCodigo,
    siteSigla: insertion.siteSigla,
    siteNome: insertion.siteNome,
    clientName: insertion.clienteNome,
    agencyName: insertion.agenciaNome,
    propertyKey: siteConfig.propertyKey,
    reportConfigName: siteConfig.reportConfigName,
    periodMode,
    periodStart: resolvedPeriod.periodStart,
    periodEnd: resolvedPeriod.periodEnd,
    dimensions: requirements.recommendedDimensions,
    metrics: requirements.recommendedMetrics,
    requestedBy,
    source: typeof req.body?.source === "string" ? req.body.source : "api-server",
    analyticsSource: requirements.analyticsSource,
    notes: requirements.notes,
  };
  const requestedKey = req.header("idempotency-key")?.trim() ?? "";
  if (requestedKey && !/^[A-Za-z0-9._:-]{8,160}$/.test(requestedKey)) {
    res.status(400).json({ error: "bad_request", details: "Idempotency-Key inválida." });
    return;
  }
  const idempotencyKey = requestedKey || `analytics-${cod5_chaveEstavelPayloadOperacional(payload)}-${randomUUID()}`;
  const created = await cod5_criarJobOperacional({ kind: "analytics-report", payload, requestedBy, idempotencyKey });
  res.status(created.duplicate ? 200 : 202).json({
    ok: true,
    jobId: created.job.id,
    status: created.job.status,
    duplicate: created.duplicate,
    payload,
  });
});

cod5_router.get("/analytics/jobs/:jobId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const job = await cod5_obterJobOperacional(req.params.jobId, "analytics-report");
  if (!job) {
    res.status(404).json({ error: "Analytics job not found" });
    return;
  }
  const payload = job.payload ?? {};
  res.json({
    id: job.id,
    status: job.status,
    kind: "analytics-report",
    campaignId: typeof payload.campaignId === "number" ? payload.campaignId : null,
    insertionId: typeof payload.insertionId === "number" ? payload.insertionId : null,
    piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
    siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

cod5_router.get("/analytics/insertions/:insertionId/reports", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const insertionId = Number(req.params.insertionId);
  if (!Number.isInteger(insertionId) || insertionId <= 0) {
    res.status(400).json({ error: "bad_request", details: "insertionId inválido." });
    return;
  }
  const jobs = await cod5_listarJobsOperacionais("analytics-report", { insertionId, limit: 50 });
  res.json({ insertionId, reports: jobs.map(cod5_relatorioAnalyticsDoJob) });
});

cod5_router.get("/analytics/reports/:jobId/download", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const job = await cod5_obterJobOperacional(req.params.jobId, "analytics-report");
  if (!job) {
    res.status(404).json({ error: "Analytics report not found" });
    return;
  }
  const report = cod5_relatorioAnalyticsDoJob(job);
  if (!report.downloadUrl) {
    res.status(409).json({ error: "report_not_ready", details: "O relatório ainda não possui artefato publicado para download." });
    return;
  }
  res.redirect(302, report.downloadUrl);
});

cod5_router.delete("/analytics/reports/:jobId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const deleted = await pool.query(
    "DELETE FROM ops_jobs WHERE id = $1 AND kind = 'analytics-report' RETURNING id",
    [req.params.jobId],
  );
  if (!deleted.rows[0]) {
    res.status(404).json({ error: "Analytics report not found" });
    return;
  }
  res.json({ ok: true, id: req.params.jobId });
});

export default cod5_router;
