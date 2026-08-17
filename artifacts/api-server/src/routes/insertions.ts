import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter, type Request, type Response } from "express";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { db, pool, insertionsTable, campaignsTable, sitesTable, clientsTable, agenciesTable, evidencesTable, printJobsTable, operationalDocumentStatesTable, captureProofLogsTable } from "@workspace/db";
import {
  CreateInsertionBody,
  GetInsertionParams,
  GetInsertionParams as GetInsertionRelationParams,
  UpdateInsertionParams,
  UpdateInsertionBody,
  DeleteInsertionParams,
  ListInsertionsQueryParams,
  BulkUpdateInsertionsBody,
} from "@workspace/api-zod";
import {
  extractFirstArticleUrl,
  getAdRotateGroupId,
  getSiteFormatMapping,
  getSiteIntegration,
  getSiteIntegrations,
  getSupportedGroupIds,
  normalizeLocalFormato,
  normalizeSiteMediaUrl,
} from "../lib/adrotate-sites";
import {
  buildRetroCaptureAt,
  eachIsoDay,
  evaluateCaptureMetadata,
  formatIsoDate,
  getEvidenceDateKey,
  isCaptureAtInRetroWindow,
  listAuditIssueCodes,
  pageTextMatchesTargetDate,
  parseDateOnly,
  resolveRegenerationCaptureAt,
  safeFileName,
  summarizeAuditRootCauses,
} from "../lib/capture-audit";
import {
  resolveAuditChecklist,
  validateAuditChecklist,
} from "../lib/audit-checklist";
import { loadLocalCaptureMetadata, saveLocalCaptureMetadata } from "../lib/local-capture-runtime";
import { generateOperationalDocument, listOperationalDocuments, type OperationalDocumentKind } from "../lib/operational-documents";
import { getPrintRunner } from "../lib/print-runner";
import type { PrintRunnerJobPayload, PrintRunnerJobResultItem } from "../lib/print-runner-contract";
import {
  buildDeliveryPackageName,
  buildDeliveryPrintFileName,
  buildIndividualEvidenceDownloadName,
  calculateSavingsPercent,
  deliverySegment,
  EvidenceExportInputError,
  isApprovedEvidenceDownload,
  parseIndividualEvidenceDownloadOptions,
  parseEvidenceExportOptions,
  prepareEvidenceImage,
  resolveDeliveryDateRange,
  resolveDeliveryPiCode,
  selectApprovedCanonicalEvidenceRows,
  selectCanonicalEvidencePerDate,
  type EvidenceImageVariant,
} from "../lib/evidence-export";
import { findDriveCampaignMedia } from "../lib/drive-campaign-media";
import { getActiveCampaignOperations } from "../lib/campaign-operations";
import { mediaNamesCompatible } from "../lib/media-consistency";
import {
  buildMonthlyEvidenceSource,
  CampaignEvidenceExportConflict,
  normalizeCampaignPi,
  parseCampaignEvidenceIdentity,
  selectCampaignEvidenceInsertions,
  validateCampaignEvidenceReadiness,
} from "../lib/campaign-evidence-export";

const router: IRouter = Router();

const execFileAsync = promisify(execFile);
const printRunner = getPrintRunner();

type CompressedEvidencePdfResult = {
  ok: true;
  pageCount: number;
  sourceBytes: number;
  outputBytes: number;
  compressionRatio: number | null;
  maxWidth: number;
  quality: number;
  resolution: number;
  outputPath: string;
  imageCount: number;
  imageBytes: number;
  imagesOutputDir: string | null;
};

const CONTACT_SHEET_SCRIPT = String.raw`
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

output_path = Path(sys.argv[1])
sources = [Path(value) for value in sys.argv[2:5]]
if len(sources) != 3 or any(not source.is_file() for source in sources):
    raise ValueError("contact_sheet_sources_invalid")

cell_width, cell_height, label_height, margin = 600, 520, 54, 24
canvas = Image.new("RGB", (cell_width * 3 + margin * 4, cell_height + label_height + margin * 2), "#f5f1e8")
draw = ImageDraw.Draw(canvas)
font = ImageFont.load_default()
labels = ("PRIMEIRA", "INTERMEDIARIA", "ULTIMA")

for index, (source_path, label) in enumerate(zip(sources, labels)):
    with Image.open(source_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)
        x = margin + index * (cell_width + margin) + (cell_width - image.width) // 2
        y = margin + (cell_height - image.height) // 2
        canvas.paste(image, (x, y))
    text = f"{label} - {source_path.stem}"[:85]
    draw.text((margin + index * (cell_width + margin), margin + cell_height + 14), text, fill="#222222", font=font)

output_path.parent.mkdir(parents=True, exist_ok=True)
canvas.save(output_path, "JPEG", quality=82, optimize=True, progressive=True)
`;

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(rootDir, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  }));
  return nested.flat().sort();
}

function sanitizeEditorialPosts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    return {
      id: Number.isFinite(Number(row.id)) && Number(row.id) > 0 ? Number(row.id) : null,
      url: typeof row.url === "string" ? row.url.slice(0, 2_048) : null,
      title: typeof row.title === "string" ? row.title.slice(0, 240) : null,
      date: typeof row.date === "string" ? row.date.slice(0, 64) : null,
      source: typeof row.source === "string" ? row.source.slice(0, 160) : null,
    };
  }).filter((item) => item.url && item.date);
}

async function writeRetroAuditArtifacts(options: {
  rootDir: string;
  descriptor: Awaited<ReturnType<typeof describePiSiteExport>> & {};
  insertions: EnrichedInsertion[];
}) {
  const auditDir = join(options.rootDir, "04-AUDITORIA");
  const manifestsDir = join(auditDir, "MANIFESTOS-EDITORIAIS");
  await mkdir(manifestsDir, { recursive: true });
  const entries: Array<Record<string, unknown>> = [];

  for (const insertion of options.insertions) {
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id));
    const dates = Array.from(new Set(
      evidences.map((evidence) => getEvidenceDateKey(evidence.titulo)).filter((value): value is string => Boolean(value)),
    )).sort();
    for (const date of dates) {
      const [status, metadata] = await Promise.all([
        resolveEvidenceAuditStatus(insertion, date, evidences),
        loadCaptureMetadataForAudit(insertion.id, date),
      ]);
      const rawMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};
      const rawManifest = rawMetadata.retroContentManifest && typeof rawMetadata.retroContentManifest === "object" && !Array.isArray(rawMetadata.retroContentManifest)
        ? rawMetadata.retroContentManifest as Record<string, unknown>
        : {};
      const proof = status.audit?.retroContentProof ?? null;
      const manifest = {
        version: 1,
        piCodigo: options.descriptor.piCodigo,
        siteSigla: options.descriptor.siteSigla,
        insertionId: insertion.id,
        date,
        cutoff: typeof rawManifest.cutoff === "string" ? rawManifest.cutoff : status.audit?.requestedCaptureAt ?? null,
        source: typeof rawManifest.source === "string" ? rawManifest.source : proof?.sourceMode ?? null,
        reconstructed: rawManifest.reconstructed === true,
        expectedPosts: sanitizeEditorialPosts(rawManifest.expectedPosts),
        visiblePosts: sanitizeEditorialPosts(rawManifest.visiblePosts),
        proof,
      };
      const approved = status.status === "ok" && proof?.status === "approved" && proof?.futureCount === 0 && Boolean(proof?.manifestHash);
      if (!approved) {
        throw new EvidenceExportInputError(`Prova editorial não aprovada na inserção ${insertion.id}, data ${date}.`, 422);
      }
      const manifestName = `${deliverySegment(insertion.siteSigla, "SITE")}-INSERCAO-${insertion.id}-${date}.json`;
      await writeFile(join(manifestsDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      entries.push({
        insertionId: insertion.id,
        date,
        status: "audited",
        retroContentProof: proof,
        manifestFile: `04-AUDITORIA/MANIFESTOS-EDITORIAIS/${manifestName}`,
      });
    }
  }

  const report = {
    ok: entries.length > 0 && entries.every((entry) => (entry.retroContentProof as Record<string, unknown>)?.status === "approved"),
    generatedAt: new Date().toISOString(),
    piCodigo: options.descriptor.piCodigo,
    siteSigla: options.descriptor.siteSigla,
    total: entries.length,
    approved: entries.filter((entry) => (entry.retroContentProof as Record<string, unknown>)?.status === "approved").length,
    futureCount: entries.reduce((sum, entry) => sum + Number((entry.retroContentProof as Record<string, unknown>)?.futureCount || 0), 0),
    entries,
  };
  await writeFile(join(auditDir, "AUDITORIA-RETRO-CONTENT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function writeContactSheet(rootDir: string, imagesDir: string) {
  const images = (await listFilesRecursively(imagesDir)).filter((filePath) => /\.jpe?g$/i.test(filePath));
  if (!images.length) throw new EvidenceExportInputError("Não há JPEGs para a contact sheet.", 422);
  const selected = [images[0], images[Math.floor((images.length - 1) / 2)], images.at(-1)!];
  const outputPath = join(rootDir, "04-AUDITORIA", "CONTACT-SHEET-PRIMEIRA-INTERMEDIARIA-ULTIMA.jpg");
  await execFileAsync("python3", ["-c", CONTACT_SHEET_SCRIPT, outputPath, ...selected], { timeout: 120_000, maxBuffer: 1024 * 1024 });
  return outputPath;
}

async function writeSha256Sums(rootDir: string) {
  const checksumPath = join(rootDir, "SHA256SUMS.txt");
  const files = (await listFilesRecursively(rootDir)).filter((filePath) => filePath !== checksumPath);
  const lines = await Promise.all(files.map(async (filePath) => {
    const digest = crypto.createHash("sha256").update(await readFile(filePath)).digest("hex");
    return `${digest}  ${relative(rootDir, filePath)}`;
  }));
  await writeFile(checksumPath, `${lines.join("\n")}\n`, "utf8");
}

function parseBoundedInteger(
  value: unknown,
  options: { minimum: number; maximum: number; fallback: number },
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return options.fallback;
  return Math.max(options.minimum, Math.min(options.maximum, parsed));
}

async function buildCompressedEvidencePdf(options: {
  tempDir: string;
  outputPath: string;
  pages: Array<{ inputPath: string; dateKey: string | null; evidenceId: number; insertionId: number; outputRelativePath?: string }>;
  maxWidth: number;
  quality: number;
  resolution: number;
  imagesOutputDir?: string;
}) {
  const manifestPath = join(options.tempDir, "compressed-evidence-pdf-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    version: 1,
    maxWidth: options.maxWidth,
    quality: options.quality,
    resolution: options.resolution,
    imagesOutputDir: options.imagesOutputDir,
    pages: options.pages,
  }), "utf8");

  const projectRoot = process.env.ADOPS_PROJECT_ROOT || process.cwd();
  const scriptPath = join(projectRoot, "scripts", "src", "build-compressed-evidence-pdf.py");
  try {
    const { stdout } = await execFileAsync("python3", [
      scriptPath,
      "--manifest",
      manifestPath,
      "--output",
      options.outputPath,
    ], { maxBuffer: 4 * 1024 * 1024 });
    const result = JSON.parse(stdout.trim()) as CompressedEvidencePdfResult;
    if (!result.ok || result.pageCount !== options.pages.length || result.outputBytes <= 0) {
      throw new Error("O gerador de PDF não confirmou todas as páginas solicitadas.");
    }
    return result;
  } finally {
    await rm(manifestPath, { force: true });
  }
}

function shellEscape(value: string | null | undefined) {
  return `'${String(value ?? "").replace(/'/g, `'\"'\"'`)}'`;
}

function buildPrintRunnerPayload(
  kind: PrintRunnerJobPayload["kind"],
  targets: PrintRunnerJobPayload["targets"],
  options?: {
    competencia?: string | null;
    siteId?: number | null;
    source?: PrintRunnerJobPayload["source"];
  },
): PrintRunnerJobPayload {
  return {
    kind,
    competencia: options?.competencia ?? null,
    siteId: options?.siteId ?? null,
    targets,
    source: options?.source ?? "api",
  };
}

function summarizeRunnerItems(items: PrintRunnerJobResultItem[]) {
  return {
    ok: items.filter((item) => item.status === "ok").length,
    error: items.filter((item) => item.status === "error").length,
    skipped: items.filter((item) => item.status === "skipped").length,
  };
}

function previewCampaignName(
  grouped: Array<{ insertionId: number; campaignName: string | null }>,
  insertionId: number,
) {
  return grouped.find((item) => item.insertionId === insertionId)?.campaignName ?? null;
}

async function buildBackfillPreview(options?: { competencia?: string; siteId?: number; insertionId?: number }) {
  const competencia = options?.competencia;
  const siteId = options?.siteId;
  const insertionId = options?.insertionId;
  const todayKey = formatIsoDate(new Date());
  const today = parseDateOnly(todayKey);

  let rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  if (siteId) rawInsertions = rawInsertions.filter((item) => item.siteId === siteId);
  if (insertionId) rawInsertions = rawInsertions.filter((item) => item.id === insertionId);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  const candidates = enriched.filter((item) => {
    if (["cancelado", "concluido"].includes(item.statusNormalizado)) return false;
    if (competencia && item.competencia !== competencia) return false;
    if (!item.mediaUrl) return false;
    if (getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato) == null) return false;
    const start = parseDateOnly(item.periodoInicio);
    const end = parseDateOnly(item.periodoFim);
    if (!start || !end || !today) return false;
    const cappedEnd = end < today ? end : new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return cappedEnd >= start;
  });

  const jobs: Array<{ insertionId: number; campaignName: string | null; targetDate: string; captureAt: string }> = [];
  const skipped: Array<{ insertionId: number; campaignName: string | null; targetDate: string; reason: string }> = [];
  const grouped = new Map<number, {
    insertionId: number;
    campaignName: string | null;
    siteSigla: string | null;
    localFormato: string | null;
    periodoInicio: string | null;
    periodoFim: string | null;
    totalMissing: number;
    sampleDates: string[];
  }>();

  for (const item of candidates) {
    const start = parseDateOnly(item.periodoInicio)!;
    const end = parseDateOnly(item.periodoFim)!;
    const cappedEnd = end < today! ? end : new Date(today!.getTime() - 24 * 60 * 60 * 1000);
    const days = eachIsoDay(start, cappedEnd);
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id));

    for (const day of days) {
      const existing = evidences.find((row) => getEvidenceDateKey(row.titulo) === day && isValidHttpUrl(row.arquivoUrl));
      if (existing) {
        skipped.push({
          insertionId: item.id,
          campaignName: item.campanhaName,
          targetDate: day,
          reason: "Print retroativo já existe para este dia.",
        });
        continue;
      }

      jobs.push({
        insertionId: item.id,
        campaignName: item.campanhaName,
        targetDate: day,
        captureAt: buildRetroCaptureAt(day, item.id),
      });

      const current = grouped.get(item.id) ?? {
        insertionId: item.id,
        campaignName: item.campanhaName,
        siteSigla: item.siteSigla,
        localFormato: item.localFormatoNormalizado ?? item.localFormato,
        periodoInicio: item.periodoInicio,
        periodoFim: item.periodoFim,
        totalMissing: 0,
        sampleDates: [],
      };
      current.totalMissing += 1;
      if (current.sampleDates.length < 6) current.sampleDates.push(day);
      grouped.set(item.id, current);
    }
  }

  return {
    competencia: competencia ?? null,
    siteId: siteId ?? null,
    insertionId: insertionId ?? null,
    totalCandidates: candidates.length,
    totalJobs: jobs.length,
    totalSkipped: skipped.length,
    jobs,
    skipped,
    grouped: Array.from(grouped.values()).sort((a, b) => b.totalMissing - a.totalMissing),
  };
}

function isValidHttpUrl(value: string | null | undefined) {
  return !!value && /^https?:\/\/\S+/i.test(value);
}

function buildEvidenceExportFileName(
  evidence: { id: number; arquivoUrl: string | null | undefined; titulo: string | null | undefined },
  dateKey: string | null,
) {
  if (!isValidHttpUrl(evidence.arquivoUrl)) {
    return {
      fileName: safeFileName(`${safeFileName(dateKey, `evidence-${evidence.id}`)}__ev-${evidence.id}.bin`, `evidence-${evidence.id}.bin`),
      sourcePathname: null as string | null,
    };
  }

  const url = new URL(evidence.arquivoUrl!);
  const extension = extname(url.pathname) || ".bin";
  const baseNameRaw = basename(url.pathname) || `${safeFileName(dateKey, `evidence-${evidence.id}`)}${extension}`;
  const baseName = baseNameRaw.endsWith(extension)
    ? baseNameRaw.slice(0, Math.max(0, baseNameRaw.length - extension.length))
    : baseNameRaw;
  const fallbackName = `${safeFileName(dateKey, `evidence-${evidence.id}`)}__ev-${evidence.id}${extension}`;
  const fileName = safeFileName(`${baseName}__ev-${evidence.id}${extension}`, fallbackName);
  return {
    fileName,
    sourcePathname: url.pathname,
  };
}

const ANALYTICS_PUBLIC_API_BASE_URL = (process.env.OPS_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, "");

async function proxyCampaignEvidenceWorkerRequest(req: any, res: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const upstream = await fetch(`${ANALYTICS_PUBLIC_API_BASE_URL}${req.originalUrl}`, {
      method: req.method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: req.header("accept") || "application/json",
        ...(req.method === "POST" ? { "content-type": "application/json" } : {}),
        ...(req.header("authorization") ? { authorization: req.header("authorization") } : {}),
        ...(req.header("idempotency-key") ? { "idempotency-key": req.header("idempotency-key") } : {}),
      },
      ...(req.method === "POST" ? { body: JSON.stringify(req.body ?? {}) } : {}),
    });
    for (const header of ["content-type", "cache-control", "location"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.status(503).json({
      error: "campaign_evidence_worker_unavailable",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function rejectCaptureAtOutsideWindow(captureAt: string | null, res: any) {
  if (!captureAt) return false;
  if (isCaptureAtInRetroWindow(captureAt)) return false;
  res.status(400).json({
    error: "capture_at_outside_allowed_window",
    details: "captureAt deve ficar na janela operacional 18:00-22:00 America/Cuiaba. Omita captureAt para o sistema distribuir por inserção/dia.",
    allowedWindow: { start: "18:00", endExclusive: "22:00", timezone: "America/Cuiaba" },
  });
  return true;
}

type AnalyticsReportSummary = {
  id: string;
  status: string;
  downloadUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodMode?: string | null;
  propertyKey: string | null;
  createdAt?: string | null;
  fileName?: string | null;
};

async function fetchCompletedAnalyticsReports(insertionId: number): Promise<AnalyticsReportSummary[]> {
  const response = await fetch(`${ANALYTICS_PUBLIC_API_BASE_URL}/api/analytics/insertions/${insertionId}/reports`, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null) as { reports?: AnalyticsReportSummary[] } | null;
  const reports = Array.isArray(payload?.reports) ? payload.reports : [];
  return reports.filter((item) => item.status === "completed" && isValidHttpUrl(item.downloadUrl));
}

async function listVisibleOperationalDocuments(insertion: Awaited<ReturnType<typeof enrichInsertion>>) {
  const [documents, hiddenStates] = await Promise.all([
    listOperationalDocuments(insertion),
    db.select().from(operationalDocumentStatesTable).where(eq(operationalDocumentStatesTable.insertionId, insertion.id)),
  ]);
  const hiddenKinds = new Set(
    hiddenStates.filter((item) => item.hiddenAt).map((item) => item.kind as OperationalDocumentKind),
  );
  return documents.filter((item) => !hiddenKinds.has(item.kind));
}

async function isOperationalDocumentHidden(insertionId: number, kind: OperationalDocumentKind) {
  const [state] = await db.select().from(operationalDocumentStatesTable).where(
    and(
      eq(operationalDocumentStatesTable.insertionId, insertionId),
      eq(operationalDocumentStatesTable.kind, kind),
    ),
  ).limit(1);
  return Boolean(state?.hiddenAt);
}

async function hideOperationalDocument(insertionId: number, kind: OperationalDocumentKind) {
  const now = new Date();
  await db.execute(sql`
    INSERT INTO operational_document_states (insertion_id, kind, hidden_at, created_at, updated_at)
    VALUES (${insertionId}, ${kind}, ${now}, ${now}, ${now})
    ON CONFLICT (insertion_id, kind)
    DO UPDATE SET hidden_at = ${now}, updated_at = ${now}
  `);
}

async function unhideOperationalDocuments(insertionId: number, kinds: OperationalDocumentKind[]) {
  if (!kinds.length) return;
  await db.update(operationalDocumentStatesTable)
    .set({ hiddenAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(operationalDocumentStatesTable.insertionId, insertionId),
        inArray(operationalDocumentStatesTable.kind, kinds),
      ),
    );
}

function buildAnalyticsExportFileName(report: AnalyticsReportSummary, fallbackInsertionId: number) {
  const base = [
    report.propertyKey ?? `analytics-${fallbackInsertionId}`,
    report.periodMode ?? "periodo",
    report.periodStart ?? "sem-inicio",
    report.periodEnd ?? "sem-fim",
    report.createdAt ? report.createdAt.replace(/[:T]/g, "-").replace(/\..+$/, "").replace(/Z$/, "") : "sem-data-geracao",
  ].join("_");
  const safeBase = safeFileName(base, `analytics-${fallbackInsertionId}-${report.id}`);
  return `${safeBase}.pdf`;
}

function buildAnalyticsStyleTimestamp(value = new Date()) {
  return value.toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "").replace(/Z$/, "");
}

function buildPiSiteExportArchiveBaseName(
  descriptor: {
    piCodigo: string;
    siteSigla: string;
  },
  insertions: Array<Awaited<ReturnType<typeof enrichInsertion>>>,
  reports: AnalyticsReportSummary[],
) {
  const exportKey = safeFileName(
    reports.find((item) => item.propertyKey)?.propertyKey ?? String(descriptor.siteSigla ?? "site").toLowerCase(),
    "site",
  );
  const periodStart = insertions
    .map((item) => item.periodoInicio)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? "sem-inicio";
  const periodEnd = insertions
    .map((item) => item.periodoFim)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? "sem-fim";
  const generatedAt = buildAnalyticsStyleTimestamp();
  return safeFileName(
    `${exportKey}_pi_site_${periodStart}_${periodEnd}_${generatedAt}_pi${descriptor.piCodigo}`,
    `pi-site-${descriptor.piCodigo}-${descriptor.siteSigla}`,
  );
}

type PiSiteExportOpsJobRow = {
  id: string;
  kind: string;
  status: string;
  payload_json: unknown;
  result_json: unknown;
  error_text: string | null;
  requested_by: string | null;
  runner_id: string | null;
  created_at: string;
  updated_at: string;
};

function parseJobJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function createLocalPiSiteExportJob(options: {
  payload: Record<string, unknown>;
  requestedBy: string;
  idempotencyKey: string;
}) {
  const existing = await pool.query<{ id: string; status: string }>(
    `SELECT id, status
       FROM ops_jobs
      WHERE kind = 'pi-site-export'
        AND payload_json::jsonb ->> 'idempotencyKey' = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [options.idempotencyKey],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].status === "failed") {
      const now = new Date().toISOString();
      const retried = await pool.query(
        `UPDATE ops_jobs
            SET status = 'ready_for_runner', payload_json = $1, result_json = $2,
                error_text = NULL, runner_id = NULL, updated_at = $3
          WHERE id = $4 AND status = 'failed'`,
        [
          JSON.stringify({ ...options.payload, idempotencyKey: options.idempotencyKey }),
          JSON.stringify({ stage: "ready_for_runner", retryOf: existing.rows[0].id, retriedAt: now }),
          now,
          existing.rows[0].id,
        ],
      );
      if ((retried.rowCount ?? 0) > 0) {
        return { jobId: existing.rows[0].id, status: "ready_for_runner", duplicate: false };
      }
    }
    return { jobId: existing.rows[0].id, status: existing.rows[0].status, duplicate: true };
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
     VALUES ($1, 'pi-site-export', 'ready_for_runner', $2, NULL, NULL, $3, NULL, $4, $5)`,
    [jobId, JSON.stringify({ ...options.payload, idempotencyKey: options.idempotencyKey }), options.requestedBy, now, now],
  );
  return { jobId, status: "ready_for_runner", duplicate: false };
}

async function getLocalPiSiteExportJob(jobId: string) {
  const result = await pool.query<PiSiteExportOpsJobRow>(
    "SELECT * FROM ops_jobs WHERE id = $1 AND kind = 'pi-site-export' LIMIT 1",
    [jobId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const payload = parseJobJson(row.payload_json);
  const jobResult = parseJobJson(row.result_json);
  const execution = jobResult?.execution && typeof jobResult.execution === "object" && !Array.isArray(jobResult.execution)
    ? jobResult.execution as Record<string, unknown>
    : null;
  const artifactResult = execution ?? jobResult;
  return {
    id: row.id,
    jobId: row.id,
    kind: row.kind,
    status: row.status,
    stage: typeof artifactResult?.stage === "string" ? artifactResult.stage : row.status,
    piCodigo: payload?.piCodigo ?? null,
    siteSigla: payload?.siteSigla ?? null,
    mode: payload?.mode ?? null,
    variant: payload?.variant ?? null,
    downloadUrl: typeof artifactResult?.downloadUrl === "string" ? artifactResult.downloadUrl : null,
    artifactBytes: typeof artifactResult?.artifactBytes === "number" ? artifactResult.artifactBytes : null,
    artifactContentType: typeof artifactResult?.artifactContentType === "string" ? artifactResult.artifactContentType : null,
    artifactFileName: typeof artifactResult?.artifactFileName === "string" ? artifactResult.artifactFileName : null,
    error: row.error_text,
    runnerId: row.runner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    result: jobResult,
  };
}

async function attachAnalyticsPdfsToExport(tempDir: string, insertionId: number, lines: string[]) {
  return attachAnalyticsPdfsToExportAtPath(tempDir, insertionId, lines, "02-ANALYTICS");
}

async function attachAnalyticsPdfsToExportAtPath(tempDir: string, insertionId: number, lines: string[], relativeDir: string) {
  const reports = await fetchCompletedAnalyticsReports(insertionId);
  if (!reports.length) {
    lines.push("Relatório de Analytics: nenhum PDF concluído encontrado para anexar.");
    lines.push("");
    return;
  }

  const analyticsDir = join(tempDir, relativeDir);
  await mkdir(analyticsDir, { recursive: true });
  lines.push("Relatórios de Analytics");
  lines.push("=======================");

  for (const report of reports) {
    try {
      const response = await fetch(report.downloadUrl!);
      if (!response.ok) {
        lines.push(`- ${report.id}: download falhou (${response.status}).`);
        continue;
      }

      const fileName = buildAnalyticsExportFileName(report, insertionId);
      const outputPath = join(analyticsDir, fileName);
      const arrayBuffer = await response.arrayBuffer();
      await writeFile(outputPath, Buffer.from(arrayBuffer));

      lines.push(`Job/arquivo: ${report.id}`);
      lines.push(`- Property key: ${report.propertyKey ?? "—"}`);
      lines.push(`- Período: ${report.periodStart ?? "—"} até ${report.periodEnd ?? "—"}`);
      lines.push(`- Modo: ${report.periodMode ?? "—"}`);
      lines.push(`- Gerado em: ${report.createdAt ?? "—"}`);
      lines.push(`- Arquivo anexado: ${relativeDir}/${basename(outputPath)}`);
      lines.push(`- Origem: ${report.downloadUrl}`);
      lines.push("");
    } catch (error) {
      lines.push(`- ${report.id}: falha ao anexar PDF (${error instanceof Error ? error.message : String(error)}).`);
      lines.push("");
    }
  }
}

function resolveOperationalPrintFolder(insertion: Awaited<ReturnType<typeof enrichInsertion>>) {
  const raw = insertion.localFormatoNormalizado ?? insertion.localFormato ?? "PRINTS";
  const normalized = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  return safeFileName(normalized || "PRINTS", "PRINTS");
}

type PrintDeliveryMetrics = {
  total: number;
  generated: number;
  failed: number;
  originalBytes: number;
  outputBytes: number;
};

function emptyPrintDeliveryMetrics(): PrintDeliveryMetrics {
  return { total: 0, generated: 0, failed: 0, originalBytes: 0, outputBytes: 0 };
}

function mergePrintDeliveryMetrics(target: PrintDeliveryMetrics, source: PrintDeliveryMetrics) {
  target.total += source.total;
  target.generated += source.generated;
  target.failed += source.failed;
  target.originalBytes += source.originalBytes;
  target.outputBytes += source.outputBytes;
}

function setPrintDeliveryHeaders(
  res: any,
  metrics: PrintDeliveryMetrics,
  variant: EvidenceImageVariant,
  requestId: string,
) {
  const outputFormat = variant === "web" ? "jpeg" : "png";
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-adops-export-request-id", requestId);
  res.setHeader("x-adops-export-mode", "prints-only");
  res.setHeader("x-adops-export-variant", variant);
  res.setHeader("x-adops-export-image-format", outputFormat);
  res.setHeader("x-adops-export-images-total", String(metrics.total));
  res.setHeader("x-adops-export-images-generated", String(metrics.generated));
  res.setHeader("x-adops-export-images-failed", String(metrics.failed));
  res.setHeader("x-adops-export-original-bytes", String(metrics.originalBytes));
  res.setHeader("x-adops-export-output-bytes", String(metrics.outputBytes));
  res.setHeader("x-adops-export-savings-percent", String(calculateSavingsPercent(metrics.originalBytes, metrics.outputBytes)));
  res.setHeader("access-control-expose-headers", [
    "content-disposition",
    "x-adops-export-request-id",
    "x-adops-export-mode",
    "x-adops-export-variant",
    "x-adops-export-image-format",
    "x-adops-export-images-total",
    "x-adops-export-images-generated",
    "x-adops-export-images-failed",
    "x-adops-export-original-bytes",
    "x-adops-export-output-bytes",
    "x-adops-export-savings-percent",
  ].join(", "));
}

async function writePrintDeliveryFolder(options: {
  rootDir: string;
  insertion: Awaited<ReturnType<typeof enrichInsertion>>;
  evidences: Array<typeof evidencesTable.$inferSelect>;
  variant: EvidenceImageVariant;
  packageNameOverride?: string;
  maxWidth?: number;
  quality?: number;
}) {
  const { rootDir, insertion, evidences, variant } = options;
  const dates = evidences.map((evidence) => getEvidenceDateKey(evidence.titulo));
  const packageName = options.packageNameOverride ?? buildDeliveryPackageName(insertion, dates);
  const packageDir = join(rootDir, packageName);
  await mkdir(packageDir, { recursive: true });

  const metrics = emptyPrintDeliveryMetrics();
  metrics.total = evidences.length;
  const failures: Array<{ evidenceId: number; date: string | null; error: string }> = [];
  const outputFiles: Array<{ inputPath: string; dateKey: string; evidenceId: number }> = [];
  const dateOccurrences = new Map<string, number>();

  for (const evidence of evidences) {
    const dateKey = getEvidenceDateKey(evidence.titulo);
    if (!dateKey || !isValidHttpUrl(evidence.arquivoUrl)) {
      metrics.failed += 1;
      failures.push({
        evidenceId: evidence.id,
        date: dateKey,
        error: !dateKey ? "evidence_date_missing" : "evidence_url_invalid",
      });
      continue;
    }

    const occurrence = (dateOccurrences.get(dateKey) ?? 0) + 1;
    dateOccurrences.set(dateKey, occurrence);
    const fileName = buildDeliveryPrintFileName(
      insertion,
      dateKey,
      occurrence > 1 ? `EV-${evidence.id}` : undefined,
      variant === "web" ? ".jpg" : ".png",
    );

    try {
      const response = await fetch(evidence.arquivoUrl!);
      if (!response.ok) throw new EvidenceExportInputError(`download_http_${response.status}`, 422);
      const prepared = await prepareEvidenceImage({
        source: Buffer.from(await response.arrayBuffer()),
        outputPath: join(packageDir, fileName),
        variant,
        maxWidth: options.maxWidth,
        quality: options.quality,
      });
      metrics.generated += 1;
      metrics.originalBytes += prepared.originalBytes;
      metrics.outputBytes += prepared.outputBytes;
      outputFiles.push({
        inputPath: join(packageDir, fileName),
        dateKey,
        evidenceId: evidence.id,
      });
    } catch (error) {
      metrics.failed += 1;
      failures.push({
        evidenceId: evidence.id,
        date: dateKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { packageName, metrics, failures, outputFiles };
}

function buildPiSitePrintDeliveryArchiveName(
  descriptor: { piCodigo: string; siteSigla: string },
  insertions: Array<Awaited<ReturnType<typeof enrichInsertion>>>,
  evidenceDates: string[],
) {
  if (insertions.length === 1) return buildDeliveryPackageName(insertions[0], evidenceDates);
  const range = resolveDeliveryDateRange(
    {
      periodoInicio: insertions.map((item) => item.periodoInicio).filter(Boolean).sort()[0] ?? null,
      periodoFim: insertions.map((item) => item.periodoFim).filter(Boolean).sort().at(-1) ?? null,
    },
    evidenceDates,
  );
  return [
    deliverySegment(descriptor.siteSigla, "SITE"),
    "PI",
    resolveDeliveryPiCode(descriptor.piCodigo),
    "PRINTS",
    range.start,
    "A",
    range.end,
  ].join("-");
}

async function attachOperationalDocumentsToExport(tempDir: string, insertion: Awaited<ReturnType<typeof enrichInsertion>>, lines: string[]) {
  return attachOperationalDocumentsToExportAtPath(tempDir, insertion, lines, "03-DOCUMENTOS-OPERACIONAIS");
}

async function attachOperationalDocumentsToExportAtPath(
  tempDir: string,
  insertion: Awaited<ReturnType<typeof enrichInsertion>>,
  lines: string[],
  relativeDir: string,
) {
  const targetDir = join(tempDir, relativeDir);
  await mkdir(targetDir, { recursive: true });
  const visibleDescriptors = await listVisibleOperationalDocuments(insertion);
  const kinds = visibleDescriptors.map((item) => item.kind);

  lines.push("Documentos operacionais");
  lines.push("=======================");

  if (!kinds.length) {
    lines.push("Nenhum documento operacional visível para anexar.");
    lines.push("");
    return;
  }

  for (const kind of kinds) {
    try {
      const generated = await generateOperationalDocument(insertion, kind);
      const docxPath = join(targetDir, generated.descriptor.docxFileName);
      const pdfPath = join(targetDir, generated.descriptor.pdfFileName);
      await Promise.all([
        writeFile(docxPath, generated.docx),
        writeFile(pdfPath, generated.pdf),
      ]);
      lines.push(`${generated.descriptor.title}:`);
      lines.push(`- DOCX: ${relativeDir}/${generated.descriptor.docxFileName}`);
      lines.push(`- PDF: ${relativeDir}/${generated.descriptor.pdfFileName}`);
      if (generated.descriptor.placeholders.length) {
        lines.push(`- Campos pendentes: ${generated.descriptor.placeholders.join(", ")}`);
      }
      lines.push("");
    } catch (error) {
      lines.push(`${kind}: falha ao gerar documentos operacionais (${error instanceof Error ? error.message : String(error)}).`);
      lines.push("");
    }
  }
}

function extractAuditQueryParams(query: Record<string, unknown>) {
  return {
    competencia: typeof query.competencia === "string" ? query.competencia : undefined,
    siteId: typeof query.siteId === "string" ? Number.parseInt(query.siteId, 10) : undefined,
    clienteId: typeof query.clienteId === "string" ? Number.parseInt(query.clienteId, 10) : undefined,
    agenciaId: typeof query.agenciaId === "string" ? Number.parseInt(query.agenciaId, 10) : undefined,
    targetDate: typeof query.date === "string" ? query.date : formatIsoDate(new Date()),
  };
}

async function resolveEvidenceAuditStatus(
  insertion: Awaited<ReturnType<typeof enrichInsertion>>,
  targetDate: string,
  evidences?: Array<typeof evidencesTable.$inferSelect>,
) {
  const evidenceRows = evidences ?? await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id));
  const evidence = evidenceRows.find((row) => getEvidenceDateKey(row.titulo) === targetDate) ?? null;
  const arquivoUrl = evidence?.arquivoUrl ?? null;
  const metadata = await loadCaptureMetadataForAudit(insertion.id, targetDate);
  const checklistValidation = await validateAuditChecklist({
    insertionId: insertion.id,
    date: targetDate,
    metadata,
  });
  const audit = checklistValidation.audit;
  let urlStatus: number | null = null;
  let isReachable = false;

  if (arquivoUrl && isValidHttpUrl(arquivoUrl)) {
    try {
      const response = await fetch(arquivoUrl, { method: "HEAD" });
      urlStatus = response.status;
      isReachable = response.ok;
    } catch {
      isReachable = false;
    }
  }

  const downgraded = audit?.visualAudit?.frameSelectionDowngraded === true;
  const status: "ok" | "ok_best_effort" | "invalid_audit" | "invalid_url" | "missing" = evidence && isReachable && checklistValidation.approved
    ? (downgraded ? "ok_best_effort" : "ok")
    : evidence
      ? (isReachable ? "invalid_audit" : "invalid_url")
      : "missing";

  return {
    insertionId: insertion.id,
    targetDate,
    campaignName: insertion.campanhaName,
    siteSigla: insertion.siteSigla,
    periodoInicio: insertion.periodoInicio,
    periodoFim: insertion.periodoFim,
    hasEvidenceForDate: Boolean(evidence),
    evidenceId: evidence?.id ?? null,
    hasValidUrl: isValidHttpUrl(arquivoUrl),
    isReachable,
    urlStatus,
    arquivoUrl,
    readinessAudit: metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).readinessAudit ?? null
      : null,
    audit,
    checklistValidation,
    status,
  };
}

function isPlaceholderMedia(value: string | null | undefined) {
  return !value || /placehold\.co|ANUNCIE\+AQUI/i.test(value);
}

type EnrichedInsertion = Awaited<ReturnType<typeof enrichInsertion>>;
type EvidenceRow = typeof evidencesTable.$inferSelect;

async function buildInsertionAuditSummary(
  insertion: EnrichedInsertion,
  evidences?: EvidenceRow[],
) {
  const evidenceRows = evidences ?? await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id));
  const evidenceDates = Array.from(new Set(
    evidenceRows
      .map((row) => getEvidenceDateKey(row.titulo))
      .filter((value): value is string => Boolean(value)),
  )).sort();

  const statuses = await Promise.all(evidenceDates.map((targetDate) => resolveEvidenceAuditStatus(insertion, targetDate, evidenceRows)));
  const failedItems = statuses.filter((item) => item.status === "invalid_audit" || item.status === "invalid_url");
  const rootCauseCounts = {
    legacyMissingMetadata: 0,
    visualLegibility: 0,
    visualStability: 0,
    timeMismatch: 0,
    assetCompleteness: 0,
    videoPlayer: 0,
    invalidUrl: 0,
    other: 0,
  };
  const issueCodeCounts: Record<string, number> = {};

  for (const item of failedItems) {
    const rootCauses = summarizeAuditRootCauses(item.audit);
    if (rootCauses.legacyMissingMetadata) rootCauseCounts.legacyMissingMetadata += 1;
    if (rootCauses.visualLegibility) rootCauseCounts.visualLegibility += 1;
    if (rootCauses.visualStability) rootCauseCounts.visualStability += 1;
    if (rootCauses.timeMismatch) rootCauseCounts.timeMismatch += 1;
    if (rootCauses.assetCompleteness) rootCauseCounts.assetCompleteness += 1;
    if (rootCauses.videoPlayer) rootCauseCounts.videoPlayer += 1;
    if (item.status === "invalid_url") rootCauseCounts.invalidUrl += 1;
    if (rootCauses.other) rootCauseCounts.other += 1;
    for (const code of listAuditIssueCodes(item.audit)) {
      issueCodeCounts[code] = (issueCodeCounts[code] ?? 0) + 1;
    }
  }

  return {
    totalEvidenceDates: evidenceDates.length,
    auditedCount: statuses.filter((item) => item.status === "ok").length,
    bestEffortCount: statuses.filter((item) => item.status === "ok_best_effort").length,
    invalidAuditCount: statuses.filter((item) => item.status === "invalid_audit").length,
    invalidUrlCount: statuses.filter((item) => item.status === "invalid_url").length,
    failedCount: failedItems.length,
    missingCount: statuses.filter((item) => item.status === "missing").length,
    rootCauseCounts,
    issueCodeCounts,
    problemDates: failedItems.map((item) => ({
      date: item.targetDate,
      status: item.status,
      arquivoUrl: item.arquivoUrl,
      rootCauses: summarizeAuditRootCauses(item.audit),
      issues: Array.isArray(item.audit?.issues) ? item.audit?.issues : [],
    })).filter((item) => Boolean(item.date)),
  };
}

function serializeCaptureProofLog(row: typeof captureProofLogsTable.$inferSelect) {
  return {
    id: row.id,
    insertionId: row.insertionId,
    targetDate: row.targetDate,
    jobId: row.jobId,
    runnerJobId: row.runnerJobId,
    captureAt: row.captureAt,
    siteSigla: row.siteSigla,
    status: row.status,
    uploadedUrl: row.uploadedUrl,
    cacheBustedUrl: row.cacheBustedUrl,
    frameSelectionMode: row.frameSelectionMode,
    frameSelectionDowngraded: row.frameSelectionDowngraded,
    probableCause: row.probableCause,
    confidence: row.confidence,
    nextAction: row.nextAction,
    summary: row.summary ?? {},
    stages: row.stages ?? [],
    artifacts: row.artifacts ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

async function loadCaptureMetadataForAudit(insertionId: number, targetDate: string) {
  const localMetadata = loadLocalCaptureMetadata(insertionId, targetDate);
  if (localMetadata && typeof localMetadata === "object") return localMetadata;

  const [latestLog] = await db.select().from(captureProofLogsTable).where(
    and(
      eq(captureProofLogsTable.insertionId, insertionId),
      eq(captureProofLogsTable.targetDate, targetDate),
      eq(captureProofLogsTable.status, "ok"),
    ),
  ).orderBy(desc(captureProofLogsTable.createdAt)).limit(1);
  const metadata = latestLog?.metadata;
  return metadata && typeof metadata === "object" ? metadata : null;
}

async function listLegacyAuditCandidates(options?: {
  competencia?: string;
  insertionId?: number;
  siteSigla?: string;
}) {
  let rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  if (options?.insertionId) {
    rawInsertions = rawInsertions.filter((item) => item.id === options.insertionId);
  }
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  const candidates = enriched.filter((item) => {
    if (options?.competencia && item.competencia !== options.competencia) return false;
    if (options?.siteSigla && normalizeTextKey(item.siteSigla) !== normalizeTextKey(options.siteSigla)) return false;
    if (!item.mediaUrl) return false;
    if (getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato) == null) return false;
    return true;
  });

  const items: Array<{
    insertionId: number;
    campaignName: string | null;
    siteSigla: string | null;
    competencia: string | null;
    localFormato: string | null;
    targetDate: string;
    status: "invalid_audit" | "invalid_url" | "missing";
    audit: ReturnType<typeof evaluateCaptureMetadata> | null;
    issueCodes: string[];
    classification: "kept_invalid_legacy" | "missing" | "non_legacy_failure";
  }> = [];

  for (const item of candidates) {
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id));
    const evidenceDates = Array.from(new Set(
      evidences
        .map((row) => getEvidenceDateKey(row.titulo))
        .filter((value): value is string => Boolean(value)),
    )).sort();

    for (const targetDate of evidenceDates) {
      const status = await resolveEvidenceAuditStatus(item, targetDate, evidences);
      if (status.status !== "invalid_audit" && status.status !== "invalid_url" && status.status !== "missing") continue;
      const issueCodes = listAuditIssueCodes(status.audit);
      const isLegacyMetadataOnly =
        status.status === "invalid_audit" &&
        issueCodes.length > 0 &&
        issueCodes.every((code) => code === "capture_metadata_missing");
      items.push({
        insertionId: item.id,
        campaignName: item.campanhaName,
        siteSigla: item.siteSigla,
        competencia: item.competencia,
        localFormato: item.localFormatoNormalizado ?? item.localFormato,
        targetDate,
        status: status.status,
        audit: status.audit,
        issueCodes,
        classification: isLegacyMetadataOnly ? "kept_invalid_legacy" : status.status === "missing" ? "missing" : "non_legacy_failure",
      });
    }
  }

  return items;
}

async function enrichInsertion(ins: typeof insertionsTable.$inferSelect) {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, ins.campanhaId));
  const [site] = ins.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, ins.siteId)) : [null];
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(evidencesTable).where(eq(evidencesTable.insercaoId, ins.id));

  let clienteNome = null;
  let clienteCnpj = null;
  let agenciaNome = null;
  if (campaign?.clienteId) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, campaign.clienteId));
    clienteNome = client?.nome ?? null;
    clienteCnpj = (client as { cnpj?: string | null } | undefined)?.cnpj ?? null;
  }
  if (campaign?.agenciaId) {
    const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, campaign.agenciaId));
    agenciaNome = agency?.nome ?? null;
  }

  return {
    ...ins,
    atrasado: computeAtrasado(ins),
    mediaUrl: ins.mediaUrl ?? null,
    campanhaName: campaign?.nome ?? null,
    clienteId: campaign?.clienteId ?? null,
    agenciaId: campaign?.agenciaId ?? null,
    piCodigo: campaign?.piCodigo ?? null,
    valorLiquido: campaign?.valorLiquido ? parseFloat(campaign.valorLiquido) : null,
    origemCampanha: campaign?.origem ?? null,
    siteNome: site?.nome ?? null,
    siteSigla: site?.sigla ?? null,
    siteLogoUrl: site?.logoUrl ?? null,
    clienteNome,
    clienteCnpj,
    agenciaNome,
    competencia: campaign?.competencia ?? null,
    totalEvidencias: Number(countResult?.count ?? 0),
  };
}

function normalizeTextKey(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizePiDigitsKey(value: string | null | undefined) {
  const digits = normalizeCampaignPi(value);
  return digits || null;
}

function pluralizeInsertion(count: number) {
  return `${count} ${count === 1 ? "inserção" : "inserções"}`;
}

async function listPiSiteInsertions(piCodigo: string, siteSigla: string) {
  const requestedPi = normalizePiDigitsKey(piCodigo);
  const requestedSite = normalizeTextKey(siteSigla);
  if (!requestedPi || !requestedSite) {
    return [];
  }

  const rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.periodoInicio, insertionsTable.id);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));
  return enriched
    .filter((item) => normalizePiDigitsKey(item.piCodigo) === requestedPi)
    .filter((item) => normalizeTextKey(item.siteSigla) === requestedSite)
    .filter((item) => item.statusNormalizado !== "cancelado")
    .sort((a, b) => {
      const aDate = a.periodoInicio ?? "";
      const bDate = b.periodoInicio ?? "";
      return aDate.localeCompare(bDate) || a.id - b.id;
    });
}

async function describePiSiteExport(piCodigo: string, siteSigla: string) {
  const insertions = await listPiSiteInsertions(piCodigo, siteSigla);
  if (!insertions.length) return null;

  const descriptors = await Promise.all(insertions.map(async (item) => {
    const [evidences, analyticsReports, visibleDocs] = await Promise.all([
      db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id)),
      fetchCompletedAnalyticsReports(item.id),
      listVisibleOperationalDocuments(item),
    ]);

    return {
      insertion: item,
      evidenceCount: evidences.length,
      analyticsCount: analyticsReports.length,
      visibleDocsCount: visibleDocs.length,
      operational: item.bannerPublicadoNoSite === true && Boolean(item.mediaUrl),
      exportable: item.bannerPublicadoNoSite === true
        && Boolean(item.mediaUrl)
        && (evidences.length > 0 || analyticsReports.length > 0 || visibleDocs.length > 0),
    };
  }));

  const operational = descriptors.filter((item) => item.operational);
  const exportable = descriptors.filter((item) => item.exportable);
  const skippedInsertions = descriptors
    .filter((item) => !item.operational || !item.exportable)
    .map((item) => ({
      insertionId: item.insertion.id,
      reason: !item.operational
        ? "Inserção não publicada ou sem mídia; excluída da captura e da entrega para evitar evidência de veiculação inexistente."
        : "Sem evidências, Analytics concluído ou documentos operacionais visíveis para anexar.",
    }));

  const sample = insertions[0]!;
  const resolvedPi = normalizePiDigitsKey(sample.piCodigo) ?? normalizePiDigitsKey(piCodigo) ?? piCodigo;
  const resolvedSiteSigla = sample.siteSigla ?? siteSigla.toUpperCase();
  const competencia = sample.competencia ?? null;

  return {
    piCodigo: resolvedPi,
    siteSigla: resolvedSiteSigla,
    competencia,
    totalInsertions: insertions.length,
    insertionIds: insertions.map((item) => item.id),
    operationalInsertionIds: operational.map((item) => item.insertion.id),
    evidenceInsertionIds: descriptors
      .filter((item) => item.operational && item.evidenceCount > 0)
      .map((item) => item.insertion.id),
    label: `PI ${resolvedPi} · ${resolvedSiteSigla} · ${pluralizeInsertion(insertions.length)}`,
    downloadUrl: exportable.length
      ? `/api/pi-site-exports?piCodigo=${encodeURIComponent(resolvedPi)}&siteSigla=${encodeURIComponent(resolvedSiteSigla)}&download=1`
      : null,
    exportableInsertionIds: exportable.map((item) => item.insertion.id),
    skippedInsertions,
  };
}

async function listCampaignEvidenceInsertions(piCodigo: string, competencia: string, includeEvidence = true, asOfDate?: string) {
  const identity = parseCampaignEvidenceIdentity({ piCodigo, competencia });
  const rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.periodoInicio, insertionsTable.id);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));
  const candidates = selectCampaignEvidenceInsertions(enriched, identity);
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  const operations = await getActiveCampaignOperations({ date: asOfDate, includeEvidence, sheetScope: "monthly" });
  const matchingOperations = [...operations.items, ...operations.upcomingItems].filter((item) => (
    normalizeCampaignPi(item.piCodigo) === identity.piCodigo
    && (item.adops.insertionId == null || candidateById.has(item.adops.insertionId))
  ));
  const canonicalIds = new Set(matchingOperations.map((item) => item.adops.insertionId).filter((id): id is number => Number.isFinite(id)));
  const requiredDatesByInsertion = new Map(operations.items
    .filter((item) => Number.isFinite(item.adops.insertionId))
    .map((item) => [Number(item.adops.insertionId), item.evidence.requiredDates]));
  const publiclyConfirmedInsertionIds = new Set(operations.items
    .filter((item) => item.adops.publicConfirmation === "confirmed")
    .map((item) => Number(item.adops.insertionId))
    .filter((id) => Number.isInteger(id) && id > 0));
  return {
    identity,
    operations: matchingOperations,
    requiredDatesByInsertion,
    insertions: candidates.filter((item) => canonicalIds.has(item.id)).map((item) => ({
      ...item,
      bannerPublicadoNoSite: item.bannerPublicadoNoSite === true || publiclyConfirmedInsertionIds.has(item.id),
    })).sort((left, right) => (
      String(left.siteSigla || "").localeCompare(String(right.siteSigla || ""))
      || String(left.periodoInicio || "").localeCompare(String(right.periodoInicio || ""))
      || left.id - right.id
    )),
  };
}

function signCampaignEvidenceFingerprint(piCodigo: string, competencia: string, evidences: unknown[]) {
  const key = process.env.ADOPS_INTERNAL_API_TOKEN?.trim();
  if (!key) throw new Error("ADOPS_INTERNAL_API_TOKEN é obrigatório para assinar o descritor de evidências.");
  return crypto.createHmac("sha256", key).update(JSON.stringify({ piCodigo, competencia, evidences })).digest("hex");
}

async function describeCampaignEvidenceExport(piCodigo: string, competencia: string, asOfDate?: string) {
  const { identity, insertions, operations, requiredDatesByInsertion } = await listCampaignEvidenceInsertions(piCodigo, competencia, true, asOfDate);
  if (!operations.length) return null;
  const evidenceDescriptors = [];
  for (const insertion of insertions) {
    const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id)).orderBy(evidencesTable.criadoEm);
    const requiredDates = requiredDatesByInsertion.get(insertion.id) ?? [];
    const statuses = await Promise.all(requiredDates.map((date) => resolveEvidenceAuditStatus(insertion, date, evidenceRows)));
    const approved = statuses.filter((status) => status.status === "ok" || status.status === "ok_best_effort");
    evidenceDescriptors.push({
      insertionId: insertion.id,
      siteSigla: insertion.siteSigla,
      requiredDates,
      evidenceDates: approved.map((status) => status.targetDate),
      invalidDates: statuses.filter((status) => status.status === "invalid_audit").map((status) => status.targetDate),
      inaccessibleDates: statuses.filter((status) => status.status === "invalid_url").map((status) => status.targetDate),
      published: insertion.bannerPublicadoNoSite === true,
      hasMedia: Boolean(String(insertion.mediaUrl || "").trim()),
      evidences: approved.map((status) => ({
        insertionId: insertion.id,
        evidenceId: Number(status.evidenceId),
        portal: insertion.siteSigla || "SEM-PORTAL",
        date: status.targetDate,
        url: status.arquivoUrl,
        auditHash: crypto.createHash("sha256").update(JSON.stringify({
          version: status.checklistValidation.version,
          approved: status.checklistValidation.approved,
          blockingIssues: status.checklistValidation.blockingIssues.map((issue) => issue.code),
          warnings: status.checklistValidation.warnings.map((issue) => issue.code),
        })).digest("hex"),
      })),
    });
  }
  const readiness = validateCampaignEvidenceReadiness(evidenceDescriptors);
  const identityBlockers = operations
    .filter((item) => item.adops.insertionId == null)
    .map((item) => ({ siteSigla: item.siteSigla, format: item.format.normalized, reason: "canonical_insertion_missing" }));
  if (identityBlockers.length) readiness.ready = false;
  const evidences = evidenceDescriptors.flatMap((item) => item.evidences);
  return {
    ...identity,
    asOfDate: asOfDate ?? null,
    campaignName: operations[0]?.campaignName ?? insertions[0]?.campanhaName ?? `PI ${identity.piCodigo}`,
    insertionIds: insertions.map((item) => item.id),
    siteSiglas: Array.from(new Set(insertions.map((item) => item.siteSigla).filter(Boolean))).sort(),
    evidenceCount: evidences.length,
    evidences,
    evidenceFingerprintSignature: signCampaignEvidenceFingerprint(identity.piCodigo, identity.competencia, evidences),
    readiness,
    identityBlockers,
    requiredDatesByInsertion: Object.fromEntries(evidenceDescriptors.map((item) => [item.insertionId, item.requiredDates])),
  };
}

function parseAdRotateSlotsFromHtml(html: string, pageUrl: string, supportedGroups: number[]) {
  const slots: Array<{
    pageUrl: string;
    groupId: number;
    adId: number;
    mediaUrl: string | null;
    mediaBasename: string | null;
  }> = [];

  const groupPattern = /class="g g-(\d+)"/gi;
  const matches = [...html.matchAll(groupPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const groupId = Number.parseInt(match[1] ?? "", 10);
    if (supportedGroups.length && !supportedGroups.includes(groupId)) continue;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? Math.min(html.length, start + 4000);
    const groupHtml = html.slice(start, end);
    const adPattern = /<div class="g-dyn a-(\d+)[^"]*">([\s\S]*?)<\/div>/gi;
    let adMatch: RegExpExecArray | null = null;
    while ((adMatch = adPattern.exec(groupHtml)) != null) {
      const adId = Number.parseInt(adMatch[1] ?? "", 10);
      const adHtml = adMatch[2] ?? "";
      const mediaSourceMatch = adHtml.match(/data-lazy-src="([^"]+)"/i) ?? adHtml.match(/<noscript><img[^>]+src="([^"]+)"/i) ?? adHtml.match(/src="([^"]+)"/i);
      const mediaUrl = normalizeSiteMediaUrl(mediaSourceMatch?.[1] ?? null);
      if (!Number.isFinite(adId)) continue;
      if (!mediaUrl || mediaUrl.startsWith("data:image/svg+xml")) continue;
      slots.push({
        pageUrl,
        groupId,
        adId,
        mediaUrl,
        mediaBasename: mediaUrl ? mediaUrl.split("/").pop() ?? null : null,
      });
    }
  }

  return slots;
}

function computeAtrasado(ins: {
  periodoFim?: string | null;
  processoEnviadoAgencia: boolean;
  statusNormalizado: string;
}): boolean {
  if (ins.processoEnviadoAgencia) return false;
  if (['concluido', 'cancelado'].includes(ins.statusNormalizado)) return false;
  if (!ins.periodoFim) return false;
  try {
    const due = new Date(`${ins.periodoFim}T23:59:59`);
    due.setDate(due.getDate() + 1);
    return due < new Date();
  } catch {
    return false;
  }
}

async function buildAdrotatePlanned(siteSigla = "PERRENGUE", competencia?: string) {
  const rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.periodoInicio, insertionsTable.id);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  return enriched
    .filter((item) => item.siteSigla === siteSigla)
    .filter((item) => !competencia || item.competencia === competencia)
    .filter((item) => item.statusNormalizado !== "cancelado")
    .map((item) => {
      const groupId = getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato);
      return {
        insertionId: item.id,
        campaignId: item.campanhaId,
        campaignName: item.campanhaName,
        piCodigo: item.piCodigo,
        competencia: item.competencia,
        siteSigla: item.siteSigla,
        clienteNome: item.clienteNome,
        agenciaNome: item.agenciaNome,
        localFormato: item.localFormatoNormalizado ?? item.localFormato,
        periodoInicio: item.periodoInicio,
        periodoFim: item.periodoFim,
        mediaUrl: item.mediaUrl,
        mediaBasename: item.mediaUrl ? item.mediaUrl.split("/").pop() ?? null : null,
        adrotateGroupId: groupId,
        externalKey: `ADOPS-${item.siteSigla}-${item.id}`,
      };
    })
    .filter((item) => item.adrotateGroupId != null);
}

async function fetchHistoricalAdminMatches(options: {
  siteId: number | null | undefined;
  siteSigla: string | null;
  groupId: number | null;
  externalKey: string | null;
  mediaBasename: string | null;
  adminBaseUrl: string | null;
}) {
  if (!options.siteSigla || !options.groupId || (!options.externalKey && !options.mediaBasename)) {
    return [] as Array<{
      adId: number;
      title: string | null;
      groupId: number;
      adopsInsertionId: number | null;
      adopsExternalKey: string | null;
      adopsMediaBasename: string | null;
      adminEditUrl: string | null;
    }>;
  }

  const siteRows = options.siteId
    ? await db.select().from(sitesTable).where(eq(sitesTable.id, options.siteId))
    : await db.select().from(sitesTable);
  const site = options.siteId
    ? siteRows[0]
    : siteRows.find((item) => String(item.sigla ?? "").toUpperCase() === options.siteSigla?.toUpperCase());
  if (!site?.sshHost || !site?.sshPort || !site?.sshUser || !site?.wpPath) {
    return [];
  }

  const phpCode = `
global $wpdb;
$rows = $wpdb->get_results($wpdb->prepare(
  "SELECT a.id, a.title, lm.\`group\` AS group_id, a.adops_insertion_id, a.adops_external_key, a.adops_media_basename
   FROM \`{$wpdb->prefix}adrotate\` a
   LEFT JOIN \`{$wpdb->prefix}adrotate_linkmeta\` lm ON lm.ad = a.id AND lm.user = 0
   WHERE lm.\`group\` = %d
     AND (
       (a.adops_external_key <> '' AND a.adops_external_key = %s)
       OR
       (a.adops_media_basename <> '' AND a.adops_media_basename = %s)
     )
   ORDER BY a.id DESC
   LIMIT 20",
  ${options.groupId},
  ${JSON.stringify(options.externalKey ?? "")},
  ${JSON.stringify(options.mediaBasename ?? "")}
), ARRAY_A);
echo wp_json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`.trim();

  const remoteCommand = [
    shellEscape(site.phpBin ?? "php"),
    shellEscape(site.wpCliPath ?? "wp"),
    "--allow-root",
    `--path=${shellEscape(site.wpPath)}`,
    "eval",
    shellEscape(phpCode),
  ].join(" ");

  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-p", site.sshPort, `${site.sshUser}@${site.sshHost}`, remoteCommand],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim() || "[]") as Array<{
      id: number;
      title: string | null;
      group_id: number;
      adops_insertion_id: number | null;
      adops_external_key: string | null;
      adops_media_basename: string | null;
    }>;
    return parsed.map((item) => ({
      adId: Number(item.id),
      title: item.title ?? null,
      groupId: Number(item.group_id),
      adopsInsertionId: item.adops_insertion_id != null ? Number(item.adops_insertion_id) : null,
      adopsExternalKey: item.adops_external_key ?? null,
      adopsMediaBasename: item.adops_media_basename ?? null,
      adminEditUrl: options.adminBaseUrl ? `${options.adminBaseUrl}/admin.php?page=adrotate&view=edit&ad=${item.id}` : null,
    }));
  } catch {
    return [];
  }
}

async function fetchLivePreview(siteSigla = "PERRENGUE") {
  const siteConfig = getSiteIntegration(siteSigla);
  if (!siteConfig) {
    return {
      siteSigla,
      homeUrl: null,
      articleUrl: null,
      warnings: ["Live preview ainda não configurado para este site."],
      items: [] as Array<{ pageUrl: string; groupId: number; adId: number; mediaUrl: string | null; mediaBasename: string | null }>,
    };
  }

  const warnings: string[] = [];
  const homeUrl = siteConfig.homeUrl;
  const homeHtml = await fetch(homeUrl).then((response) => response.text());
  const supportedGroups = getSupportedGroupIds(siteSigla);
  const articleGroups = siteConfig.formatMappings.filter((item) => item.page === "article").map((item) => item.groupId);
  const detectedArticleUrl = extractFirstArticleUrl(homeHtml, siteConfig.domain);
  const isSameSiteUrl = (value: string | null | undefined) => {
    if (!value) return false;
    try {
      const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      const expected = siteConfig.domain.toLowerCase().replace(/^www\./, "");
      return hostname === expected || hostname.endsWith(`.${expected}`);
    } catch {
      return false;
    }
  };
  const safeFallbackUrl = isSameSiteUrl(siteConfig.articleFallbackUrl) ? siteConfig.articleFallbackUrl : null;
  if (siteConfig.articleFallbackUrl && !safeFallbackUrl) {
    warnings.push("URL interna de fallback ignorada porque pertence a outro portal.");
  }
  let articleUrl = detectedArticleUrl ?? safeFallbackUrl;
  let articleItems: Array<{ pageUrl: string; groupId: number; adId: number; mediaUrl: string | null; mediaBasename: string | null }> = [];

  if (articleUrl) {
    let articleHtml = await fetch(articleUrl).then((response) => response.text());
    articleItems = parseAdRotateSlotsFromHtml(articleHtml, articleUrl, supportedGroups);
    if (articleGroups.length && !articleItems.some((item) => articleGroups.includes(item.groupId)) && safeFallbackUrl && articleUrl !== safeFallbackUrl) {
      articleUrl = safeFallbackUrl;
      articleHtml = await fetch(articleUrl).then((response) => response.text());
      articleItems = parseAdRotateSlotsFromHtml(articleHtml, articleUrl, supportedGroups);
      warnings.push("Usando URL interna de fallback para verificar posições de página interna.");
    }
  } else if (articleGroups.length) {
    warnings.push("Não foi possível detectar uma matéria pública para validar posições internas.");
  }

  const items = [
    ...parseAdRotateSlotsFromHtml(homeHtml, homeUrl, supportedGroups),
    ...articleItems,
  ].filter((item, index, array) => array.findIndex((candidate) => candidate.pageUrl === item.pageUrl && candidate.groupId === item.groupId && candidate.adId === item.adId) === index);

  return { siteSigla, homeUrl, articleUrl, warnings, items };
}

router.get("/insertions", async (req, res): Promise<void> => {
  const params = ListInsertionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let allInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.createdAt);

  if (params.data.siteId) {
    allInsertions = allInsertions.filter(i => i.siteId === params.data.siteId);
  }
  if (params.data.status) {
    allInsertions = allInsertions.filter(i => i.statusNormalizado === params.data.status);
  }
  if (params.data.atrasado === true || params.data.atrasado === "true" as unknown) {
    allInsertions = allInsertions.filter(i => computeAtrasado(i) === true);
  }
  if (params.data.campanhaId) {
    allInsertions = allInsertions.filter(i => i.campanhaId === params.data.campanhaId);
  }
  if (params.data.clienteId || params.data.agenciaId) {
    const matchingCampaigns = await db.select({
      id: campaignsTable.id,
      clienteId: campaignsTable.clienteId,
      agenciaId: campaignsTable.agenciaId,
    }).from(campaignsTable);

    const allowedCampaignIds = matchingCampaigns
      .filter((campaign) => {
        const matchesClient = params.data.clienteId == null || campaign.clienteId === params.data.clienteId;
        const matchesAgency = params.data.agenciaId == null || campaign.agenciaId === params.data.agenciaId;
        return matchesClient && matchesAgency;
      })
      .map((campaign) => campaign.id);

    allInsertions = allInsertions.filter((insertion) => allowedCampaignIds.includes(insertion.campanhaId));
  }

  const enriched = await Promise.all(allInsertions.map(enrichInsertion));

  let result = enriched;
  if (params.data.competencia) {
    result = result.filter(i => i.competencia === params.data.competencia);
  }
  const withAuditSummary = await Promise.all(result.map(async (item) => {
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id));
    return {
      ...item,
      auditSummary: await buildInsertionAuditSummary(item, evidences),
    };
  }));

  res.json(withAuditSummary);
});

router.get("/integrations/adrotate/planned", async (req, res): Promise<void> => {
  const competencia = typeof req.query.competencia === "string" ? req.query.competencia : undefined;
  const siteSigla = typeof req.query.siteSigla === "string" ? req.query.siteSigla.toUpperCase() : "PERRENGUE";
  res.json(await buildAdrotatePlanned(siteSigla, competencia));
});

router.get("/integrations/adrotate/sites", async (_req, res): Promise<void> => {
  const items = Object.values(getSiteIntegrations()).map((item) => ({
    sigla: item.sigla,
    label: item.label,
    domain: item.domain,
    homeUrl: item.homeUrl,
    supportsArticlePreview: item.formatMappings.some((mapping) => mapping.page === "article"),
  }));
  res.json(items);
});

router.get("/integrations/adrotate/live-preview", async (req, res): Promise<void> => {
  const siteSigla = typeof req.query.siteSigla === "string" ? req.query.siteSigla.toUpperCase() : "PERRENGUE";
  try {
    res.json(await fetchLivePreview(siteSigla));
  } catch (error) {
    res.status(500).json({
      error: "Falha ao ler a exibição pública do AdRotate.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/integrations/adrotate/insertions/:id/relation", async (req, res): Promise<void> => {
  const params = GetInsertionRelationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ins] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!ins) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const insertion = await enrichInsertion(ins);
  const siteSigla = insertion.siteSigla ?? null;
  const siteConfig = siteSigla ? getSiteIntegration(siteSigla) : null;
  const formatMapping = getSiteFormatMapping(siteSigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
  const groupId = getAdRotateGroupId(siteSigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
  const planned = siteSigla ? await buildAdrotatePlanned(siteSigla, insertion.competencia ?? undefined) : [];
  const live = siteSigla ? await fetchLivePreview(siteSigla) : { siteSigla: null, homeUrl: null, articleUrl: null, warnings: ["Inserção sem site vinculado."], items: [] };
  const mediaBasename = insertion.mediaUrl ? insertion.mediaUrl.split("/").pop() ?? null : null;
  const adminBaseUrl = siteConfig?.adminBaseUrl ?? null;
  const pageLabel = formatMapping?.page === "article" ? "Página interna" : formatMapping?.page === "home" ? "Home" : null;
  const positionLabel = insertion.localFormatoNormalizado ?? insertion.localFormato ?? formatMapping?.aliases?.[0] ?? null;
  const enrichLiveItem = (item: { pageUrl: string; groupId: number; adId: number; mediaUrl: string | null; mediaBasename: string | null }) => ({
    ...item,
    adminEditUrl: adminBaseUrl ? `${adminBaseUrl}/admin.php?page=adrotate&view=edit&ad=${item.adId}` : null,
  });

  const plannedSelf = planned.find((item) => item.insertionId === insertion.id) ?? null;
  const exactLiveMatches = mediaBasename
    ? live.items.filter((item) => item.groupId === groupId && item.mediaBasename === mediaBasename).map(enrichLiveItem)
    : [];
  const historicalAdminMatches = await fetchHistoricalAdminMatches({
    siteId: insertion.siteId,
    siteSigla,
    groupId,
    externalKey: plannedSelf?.externalKey ?? null,
    mediaBasename,
    adminBaseUrl,
  });

  const fallbackCandidates = planned
    .filter((item) => item.insertionId !== insertion.id)
    .filter((item) => normalizeTextKey(item.campaignName) === normalizeTextKey(insertion.campanhaName))
    .filter((item) => item.competencia === insertion.competencia)
    .filter((item) =>
      normalizeTextKey(item.localFormato) === normalizeTextKey(insertion.localFormatoNormalizado ?? insertion.localFormato) ||
      item.adrotateGroupId === groupId
    )
    .map((item) => ({
      ...item,
      liveMatches: item.mediaBasename ? live.items.filter((liveItem) => liveItem.groupId === item.adrotateGroupId && liveItem.mediaBasename === item.mediaBasename).map(enrichLiveItem) : [],
    }));

  res.json({
    insertionId: insertion.id,
    campaignName: insertion.campanhaName,
    competencia: insertion.competencia,
    siteSigla,
    localFormato: insertion.localFormatoNormalizado ?? insertion.localFormato,
    positionLabel,
    pageLabel,
    adrotateGroupId: groupId,
    mappingStatus: groupId == null ? "unresolved" : "resolved",
    blockingIssues: groupId == null
      ? [{ code: "format_mapping_unresolved", message: `Nenhum grupo AdRotate foi resolvido para ${siteSigla ?? "portal ausente"} / ${positionLabel ?? "formato ausente"}.` }]
      : [],
    mediaUrl: insertion.mediaUrl,
    mediaBasename,
    plannedSelf,
    exactLiveMatches,
    historicalAdminMatches,
    fallbackCandidates,
  });
});

router.get("/insertions/:id/media-consistency", async (req, res): Promise<void> => {
  const params = GetInsertionRelationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!rawInsertion) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  try {
    const insertion = await enrichInsertion(rawInsertion);
    const siteSigla = insertion.siteSigla ?? null;
    const localFormato = insertion.localFormatoNormalizado ?? insertion.localFormato;
    const groupId = getAdRotateGroupId(siteSigla, localFormato);
    const drive = siteSigla
      ? await findDriveCampaignMedia({
          siteSigla,
          piCodigo: insertion.piCodigo ?? "",
          campaignName: insertion.campanhaName ?? "",
          periodStart: insertion.periodoInicio,
          refreshDrive: false,
        })
      : null;
    const live = siteSigla
      ? await fetchLivePreview(siteSigla)
      : { items: [], warnings: ["Inserção sem portal vinculado."] };
    const driveMedia = drive?.mediaFiles ?? [];
    const matchingDriveMedia = driveMedia.filter((file) => mediaNamesCompatible(insertion.mediaUrl, file.name));
    const liveInGroup = live.items.filter((item) => groupId != null && item.groupId === groupId).map((item) => ({
      ...item,
      matchesAdopsMedia: mediaNamesCompatible(insertion.mediaUrl, item.mediaUrl),
    }));
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!siteSigla) issues.push("site_missing");
    if (!groupId) issues.push("format_mapping_unresolved");
    if (!insertion.mediaUrl) issues.push("adops_media_missing");
    if (!drive || drive.status === "not_found" || drive.status === "unavailable") issues.push("drive_campaign_folder_missing");
    if (drive?.sourceIdentity.piConflict) issues.push("source_pi_conflict");
    if (driveMedia.length > 1) issues.push("drive_media_ambiguous");
    if (insertion.mediaUrl && driveMedia.length && matchingDriveMedia.length === 0) issues.push("adops_drive_media_mismatch");
    if (insertion.bannerPublicadoNoSite && groupId && insertion.mediaUrl && !liveInGroup.some((item) => item.matchesAdopsMedia)) {
      warnings.push("public_media_not_observed_in_single_rotation_sample");
    }

    res.json({
      version: "media-consistency-v1",
      generatedAt: new Date().toISOString(),
      insertion: {
        id: insertion.id,
        campaignId: insertion.campanhaId,
        campaignName: insertion.campanhaName,
        piCodigo: insertion.piCodigo,
        siteSigla,
        localFormato,
        groupId,
        mediaUrl: insertion.mediaUrl,
        mediaBasename: basename(String(insertion.mediaUrl ?? "")) || null,
        published: insertion.bannerPublicadoNoSite === true,
      },
      drive,
      comparison: {
        matchingDriveMedia: matchingDriveMedia.map((file) => ({ id: file.id, name: file.name, path: file.path })),
        liveInExpectedGroup: liveInGroup,
      },
      status: issues.length ? "needs_confirmation" : "consistent",
      approved: issues.length === 0,
      issues,
      warnings,
      nextAction: issues.includes("adops_drive_media_mismatch") || issues.includes("drive_media_ambiguous") || issues.includes("source_pi_conflict")
        ? "confirm_sources_before_mutation"
        : issues.length
          ? "repair_publication_or_mapping"
          : "none",
    });
  } catch (error) {
    res.status(500).json({
      error: "media_consistency_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/integrations/adrotate/media/sync-related", async (req, res): Promise<void> => {
  const rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));
  const requestedSiteSigla = typeof req.body?.siteSigla === "string" ? req.body.siteSigla.toUpperCase() : null;

  const sources = enriched.filter((item) => item.siteSigla && getSiteIntegration(item.siteSigla) && item.mediaUrl && (!requestedSiteSigla || item.siteSigla === requestedSiteSigla));
  const targets = enriched.filter((item) => item.siteSigla && getSiteIntegration(item.siteSigla) && !item.mediaUrl && (!requestedSiteSigla || item.siteSigla === requestedSiteSigla));

  const updates: Array<{ insertionId: number; mediaUrl: string; sourceInsertionId: number; campaignName: string | null }> = [];
  const skipped: Array<{ insertionId: number; reason: string; campaignName: string | null }> = [];

  for (const target of targets) {
    const targetGroup = getAdRotateGroupId(target.siteSigla, target.localFormatoNormalizado ?? target.localFormato);
    const candidates = sources.filter((source) =>
      normalizeTextKey(source.campanhaName) === normalizeTextKey(target.campanhaName) &&
      source.competencia === target.competencia &&
      source.siteSigla === target.siteSigla &&
      (
        normalizeTextKey(source.localFormatoNormalizado ?? source.localFormato) === normalizeTextKey(target.localFormatoNormalizado ?? target.localFormato) ||
        getAdRotateGroupId(source.siteSigla, source.localFormatoNormalizado ?? source.localFormato) === targetGroup
      ),
    );

    const uniqueMedia = [...new Map(candidates.filter((item) => item.mediaUrl).map((item) => [item.mediaUrl!, item])).values()];
    if (uniqueMedia.length !== 1) {
      skipped.push({
        insertionId: target.id,
        campaignName: target.campanhaName,
        reason: uniqueMedia.length === 0 ? "Sem fonte equivalente com mídia." : "Mais de uma mídia possível; exige revisão manual.",
      });
      continue;
    }

    const source = uniqueMedia[0]!;
    await db.update(insertionsTable).set({ mediaUrl: source.mediaUrl, updatedAt: new Date() }).where(eq(insertionsTable.id, target.id));
    updates.push({
      insertionId: target.id,
      mediaUrl: source.mediaUrl!,
      sourceInsertionId: source.id,
      campaignName: target.campanhaName,
    });
  }

  res.json({
    ok: true,
    siteSigla: requestedSiteSigla,
    updated: updates.length,
    updates,
    skipped,
  });
});

router.post("/integrations/adrotate/media/sync-live", async (req, res): Promise<void> => {
  const competencia = typeof req.body?.competencia === "string" ? req.body.competencia : undefined;
  const siteSigla = typeof req.body?.siteSigla === "string" ? req.body.siteSigla.toUpperCase() : undefined;
  const targetSites = siteSigla ? [siteSigla] : Object.keys(getSiteIntegrations());

  const updates: Array<{ insertionId: number; siteSigla: string; mediaUrl: string; groupId: number }> = [];
  const skipped: Array<{ insertionId: number; siteSigla: string | null; reason: string }> = [];

  for (const sigla of targetSites) {
    const planned = await buildAdrotatePlanned(sigla, competencia);
    const live = await fetchLivePreview(sigla);
    const liveByGroup = new Map<number, Array<{ mediaUrl: string | null; mediaBasename: string | null }>>();
    for (const item of live.items) {
      if (isPlaceholderMedia(item.mediaUrl)) continue;
      const list = liveByGroup.get(item.groupId) ?? [];
      list.push({ mediaUrl: item.mediaUrl, mediaBasename: item.mediaBasename });
      liveByGroup.set(item.groupId, list);
    }

    for (const item of planned.filter((candidate) => candidate.adrotateGroupId != null)) {
      const plannedInSameGroup = planned.filter((candidate) => candidate.adrotateGroupId === item.adrotateGroupId);
      if (plannedInSameGroup.length !== 1) {
        skipped.push({
          insertionId: item.insertionId,
          siteSigla: item.siteSigla,
          reason: "Mais de uma inserção planejada para o mesmo grupo nesta competência.",
        });
        continue;
      }

      const candidates = [...new Map((liveByGroup.get(item.adrotateGroupId!) ?? [])
        .filter((liveItem) => liveItem.mediaUrl)
        .map((liveItem) => [liveItem.mediaUrl!, liveItem])).values()];

      if (candidates.length !== 1) {
        skipped.push({
          insertionId: item.insertionId,
          siteSigla: item.siteSigla,
          reason: candidates.length === 0 ? "Nenhuma mídia pública única para o grupo." : "Mais de uma mídia pública ativa no grupo.",
        });
        continue;
      }

      const [candidate] = candidates;
      if (!candidate?.mediaUrl) continue;
      if (item.mediaUrl === candidate.mediaUrl) continue;
      await db.update(insertionsTable).set({ mediaUrl: candidate.mediaUrl, updatedAt: new Date() }).where(eq(insertionsTable.id, item.insertionId));
      updates.push({
        insertionId: item.insertionId,
        siteSigla: sigla,
        mediaUrl: candidate.mediaUrl,
        groupId: item.adrotateGroupId!,
      });
    }
  }

  res.json({
    ok: true,
    competencia: competencia ?? null,
    siteSigla: siteSigla ?? null,
    updated: updates.length,
    updates,
    skipped,
  });
});

router.get("/insertions/capture-proof/audit", async (req, res): Promise<void> => {
  const { competencia, siteId, clienteId, agenciaId, targetDate } = extractAuditQueryParams(req.query as Record<string, unknown>);
  const insertionIds = typeof req.query.insertionIds === "string"
    ? new Set(req.query.insertionIds.split(",").map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value > 0))
    : null;

  let rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  if (insertionIds) rawInsertions = rawInsertions.filter((item) => insertionIds.has(item.id));
  if (siteId) rawInsertions = rawInsertions.filter((item) => item.siteId === siteId);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  const eligible = enriched.filter((item) => {
    if (competencia && item.competencia !== competencia) return false;
    if (clienteId && item.clienteId !== clienteId) return false;
    if (agenciaId && item.agenciaId !== agenciaId) return false;
    if (!item.bannerPublicadoNoSite && !insertionIds) return false;
    if (!item.mediaUrl) return false;
    if (getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato) == null) return false;
    const start = parseDateOnly(item.periodoInicio);
    const end = parseDateOnly(item.periodoFim);
    const today = parseDateOnly(targetDate);
    if (!start || !end || !today) return false;
    return today >= start && today <= end;
  });

  const checks = await Promise.all(eligible.map((item) => resolveEvidenceAuditStatus(item, targetDate)));

  res.json({
    date: targetDate,
    totalEligible: checks.length,
    ok: checks.filter((item) => item.status === "ok" || item.status === "ok_best_effort").length,
    strictOk: checks.filter((item) => item.status === "ok").length,
    bestEffort: checks.filter((item) => item.status === "ok_best_effort").length,
    missing: checks.filter((item) => item.status === "missing").length,
    invalid: checks.filter((item) => item.status === "invalid_url" || item.status === "invalid_audit").length,
    items: checks,
  });
});

router.get("/insertions/capture-proof/audit/failures", async (req, res): Promise<void> => {
  const { competencia, siteId, clienteId, agenciaId } = extractAuditQueryParams(req.query as Record<string, unknown>);
  const insertionId = typeof req.query.insertionId === "string"
    ? Number.parseInt(req.query.insertionId, 10)
    : undefined;

  let rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  if (Number.isFinite(insertionId)) {
    rawInsertions = rawInsertions.filter((item) => item.id === insertionId);
  }
  if (siteId) rawInsertions = rawInsertions.filter((item) => item.siteId === siteId);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  const candidates = enriched.filter((item) => {
    if (competencia && item.competencia !== competencia) return false;
    if (clienteId && item.clienteId !== clienteId) return false;
    if (agenciaId && item.agenciaId !== agenciaId) return false;
    if (!item.bannerPublicadoNoSite) return false;
    if (!item.mediaUrl) return false;
    if (getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato) == null) return false;
    return true;
  });

  const items: Array<{
    insertionId: number;
    campaignName: string | null;
    siteSigla: string | null;
    clienteNome: string | null;
    agenciaNome: string | null;
    competencia: string | null;
    localFormato: string | null;
    targetDate: string;
    arquivoUrl: string | null;
    status: "invalid_url" | "invalid_audit";
    audit: ReturnType<typeof evaluateCaptureMetadata> | null;
  }> = [];

  for (const item of candidates) {
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id));
    const evidenceDates = Array.from(new Set(
      evidences
        .map((row) => getEvidenceDateKey(row.titulo))
        .filter((value): value is string => Boolean(value))
    )).sort();

    for (const targetDate of evidenceDates) {
      const status = await resolveEvidenceAuditStatus(item, targetDate, evidences);
      if (status.status !== "invalid_audit" && status.status !== "invalid_url") continue;
      items.push({
        insertionId: item.id,
        campaignName: item.campanhaName,
        siteSigla: item.siteSigla,
        clienteNome: item.clienteNome,
        agenciaNome: item.agenciaNome,
        competencia: item.competencia,
        localFormato: item.localFormatoNormalizado ?? item.localFormato,
        targetDate,
        arquivoUrl: status.arquivoUrl,
        status: status.status,
        audit: status.audit,
      });
    }
  }

  res.json({
    insertionId: Number.isFinite(insertionId) ? insertionId : null,
    competencia: competencia ?? null,
    siteId: siteId ?? null,
    clienteId: clienteId ?? null,
    agenciaId: agenciaId ?? null,
    totalFailures: items.length,
    invalidAudit: items.filter((item) => item.status === "invalid_audit").length,
    invalidUrl: items.filter((item) => item.status === "invalid_url").length,
    items,
  });
});

router.get("/insertions/capture-proof/legacy-revalidation/preview", async (req, res): Promise<void> => {
  const competencia = typeof req.query.competencia === "string" ? req.query.competencia : undefined;
  const insertionId = typeof req.query.insertionId === "string" ? Number.parseInt(req.query.insertionId, 10) : undefined;
  const siteSigla = typeof req.query.siteSigla === "string" ? req.query.siteSigla.trim().toUpperCase() : undefined;

  const items = await listLegacyAuditCandidates({
    competencia,
    insertionId: Number.isFinite(insertionId) ? insertionId : undefined,
    siteSigla,
  });

  res.json({
    competencia: competencia ?? null,
    insertionId: Number.isFinite(insertionId) ? insertionId : null,
    siteSigla: siteSigla ?? null,
    totalItems: items.length,
    keptInvalidLegacy: items.filter((item) => item.classification === "kept_invalid_legacy").length,
    missing: items.filter((item) => item.classification === "missing").length,
    nonLegacyFailure: items.filter((item) => item.classification === "non_legacy_failure").length,
    items,
  });
});

router.post("/insertions/capture-proof/legacy-revalidation", async (req, res): Promise<void> => {
  const competencia = typeof req.body?.competencia === "string" ? req.body.competencia : undefined;
  const insertionId = typeof req.body?.insertionId === "number" ? req.body.insertionId : undefined;
  const siteSigla = typeof req.body?.siteSigla === "string" ? req.body.siteSigla.trim().toUpperCase() : undefined;

  const items = await listLegacyAuditCandidates({ competencia, insertionId, siteSigla });
  const legacyItems = items.filter((item) => item.classification === "kept_invalid_legacy");
  const deletedEvidenceIds = new Set<number>();
  const results: Array<{
    insertionId: number;
    campaignName: string | null;
    siteSigla: string | null;
    localFormato: string | null;
    date: string;
    classification: "kept_invalid_legacy" | "regenerated_ok" | "regenerated_failed" | "missing";
    deletedEvidenceIds: number[];
    captureAt: string | null;
    uploadedUrl?: string | null;
    error?: string;
  }> = [];

  for (const item of legacyItems) {
    const rowsForDate = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.insertionId));
    const matchingRows = rowsForDate.filter((row) => getEvidenceDateKey(row.titulo) === item.targetDate);
    for (const row of matchingRows) {
      if (deletedEvidenceIds.has(row.id)) continue;
      await db.delete(evidencesTable).where(eq(evidencesTable.id, row.id));
      deletedEvidenceIds.add(row.id);
    }

    const captureAt = resolveRegenerationCaptureAt(item.targetDate, item.insertionId, item.audit);
    try {
      const runnerResult = await printRunner.runNow(buildPrintRunnerPayload(
        "capture-proof-fix-invalid",
        [{ insertionId: item.insertionId, targetDate: item.targetDate, captureAt, replaceExisting: true }],
        { competencia: item.competencia ?? null, siteId: null, source: "adops-ui" },
      ));
      const capture = runnerResult.items[0];
      results.push({
        insertionId: item.insertionId,
        campaignName: item.campaignName,
        siteSigla: item.siteSigla,
        localFormato: item.localFormato,
        date: item.targetDate,
        classification: capture?.status === "ok" ? "regenerated_ok" : "regenerated_failed",
        deletedEvidenceIds: matchingRows.map((row) => row.id),
        captureAt,
        uploadedUrl: capture?.uploadedUrl ?? null,
        error: capture?.status === "error" ? capture.error ?? "Falha ao regerar evidência legada." : undefined,
      });
    } catch (error) {
      results.push({
        insertionId: item.insertionId,
        campaignName: item.campaignName,
        siteSigla: item.siteSigla,
        localFormato: item.localFormato,
        date: item.targetDate,
        classification: "regenerated_failed",
        deletedEvidenceIds: matchingRows.map((row) => row.id),
        captureAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const item of items.filter((entry) => entry.classification === "missing")) {
    results.push({
      insertionId: item.insertionId,
      campaignName: item.campaignName,
      siteSigla: item.siteSigla,
      localFormato: item.localFormato,
      date: item.targetDate,
      classification: "missing",
      deletedEvidenceIds: [],
      captureAt: null,
    });
  }

  res.json({
    ok: true,
    competencia: competencia ?? null,
    insertionId: insertionId ?? null,
    siteSigla: siteSigla ?? null,
    keptInvalidLegacy: legacyItems.length,
    regeneratedOk: results.filter((item) => item.classification === "regenerated_ok").length,
    regeneratedFailed: results.filter((item) => item.classification === "regenerated_failed").length,
    missing: results.filter((item) => item.classification === "missing").length,
    deletedEvidenceIds: Array.from(deletedEvidenceIds),
    items: results,
  });
});

router.get("/insertions/capture-proof/backfill-overdue/preview", async (req, res): Promise<void> => {
  const competencia = typeof req.query.competencia === "string" ? req.query.competencia : undefined;
  const siteId = typeof req.query.siteId === "string" ? Number.parseInt(req.query.siteId, 10) : undefined;
  const insertionId = typeof req.query.insertionId === "string" ? Number.parseInt(req.query.insertionId, 10) : undefined;
  res.json(await buildBackfillPreview({ competencia, siteId, insertionId }));
});

router.get("/insertions/:id/capture-proof/status", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const targetDate = typeof req.query.date === "string" ? req.query.date : formatIsoDate(new Date());
  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
  const evidence = evidences.find((row) => getEvidenceDateKey(row.titulo) === targetDate) ?? null;
  const arquivoUrl = evidence?.arquivoUrl ?? null;
  const metadata = await loadCaptureMetadataForAudit(insertionId, targetDate);
  const checklistValidation = await validateAuditChecklist({ insertionId, date: targetDate, metadata });
  const audit = checklistValidation.audit;
  let urlStatus: number | null = null;
  let isReachable = false;

  if (arquivoUrl && isValidHttpUrl(arquivoUrl)) {
    try {
      const response = await fetch(arquivoUrl, { method: "HEAD" });
      urlStatus = response.status;
      isReachable = response.ok;
    } catch {
      isReachable = false;
    }
  }

  const start = parseDateOnly(insertion.periodoInicio);
  const end = parseDateOnly(insertion.periodoFim);
  const today = parseDateOnly(targetDate);
  const inPeriod = Boolean(start && end && today && today >= start && today <= end);
  const downgraded = audit?.visualAudit?.frameSelectionDowngraded === true;
  const status = evidence && isReachable && checklistValidation.approved
    ? (downgraded ? "audited_best_effort" : "audited")
    : evidence
      ? (isReachable ? "invalid_audit" : "invalid_url")
      : "missing";

  res.json({
    insertionId,
    date: targetDate,
    inPeriod,
    hasMedia: Boolean(insertion.mediaUrl),
    hasEvidenceForDate: Boolean(evidence),
    hasValidUrl: isValidHttpUrl(arquivoUrl),
    isReachable,
    urlStatus,
    arquivoUrl,
    readinessAudit: metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).readinessAudit ?? null
      : null,
    audit,
    checklistValidation,
    status,
  });
});

router.post("/insertions/:id/capture-proof/metadata", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const targetDate = typeof req.body?.date === "string" ? req.body.date : "";
  const metadata = req.body?.metadata;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !metadata || typeof metadata !== "object") {
    res.status(400).json({ error: "Payload inválido.", details: "Informe date (YYYY-MM-DD) e metadata." });
    return;
  }

  const filePath = saveLocalCaptureMetadata(insertionId, targetDate, metadata);
  res.json({
    ok: true,
    insertionId,
    date: targetDate,
    filePath,
  });
});

router.post("/insertions/:id/capture-proof/logs", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const targetDate = typeof req.body?.date === "string" ? req.body.date : "";
  const log = req.body?.log;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !log || typeof log !== "object") {
    res.status(400).json({ error: "Payload inválido.", details: "Informe date (YYYY-MM-DD) e log." });
    return;
  }

  const payload = log as Record<string, unknown>;
  const logId = crypto.randomUUID();
  await db.insert(captureProofLogsTable).values({
    id: logId,
    insertionId,
    targetDate,
    jobId: typeof payload.jobId === "string" ? payload.jobId : null,
    runnerJobId: typeof payload.runnerJobId === "string" ? payload.runnerJobId : null,
    captureAt: typeof payload.captureAt === "string" ? payload.captureAt : null,
    siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
    status: typeof payload.status === "string" ? payload.status : "ok",
    uploadedUrl: typeof payload.uploadedUrl === "string" ? payload.uploadedUrl : null,
    cacheBustedUrl: typeof payload.cacheBustedUrl === "string" ? payload.cacheBustedUrl : null,
    frameSelectionMode: typeof payload.frameSelectionMode === "string" ? payload.frameSelectionMode : null,
    frameSelectionDowngraded: payload.frameSelectionDowngraded === true,
    probableCause: typeof payload.probableCause === "string" ? payload.probableCause : null,
    confidence: typeof payload.confidence === "number" ? payload.confidence : null,
    nextAction: typeof payload.nextAction === "string" ? payload.nextAction : null,
    summary: payload.summary && typeof payload.summary === "object" ? payload.summary as Record<string, unknown> : {},
    stages: Array.isArray(payload.stages) ? payload.stages as Array<Record<string, unknown>> : [],
    artifacts: payload.artifacts && typeof payload.artifacts === "object" ? payload.artifacts as Record<string, unknown> : {},
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata as Record<string, unknown> : {},
  });

  res.json({ ok: true, logId });
});

router.get("/insertions/:id/capture-proof/logs", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const targetDate = typeof req.query.date === "string" ? req.query.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    res.status(400).json({ error: "Payload inválido.", details: "Informe date (YYYY-MM-DD)." });
    return;
  }

  const rows = await db.select().from(captureProofLogsTable).where(
    and(
      eq(captureProofLogsTable.insertionId, insertionId),
      eq(captureProofLogsTable.targetDate, targetDate),
    ),
  ).orderBy(desc(captureProofLogsTable.createdAt));

  res.json({
    insertionId,
    date: targetDate,
    latest: rows[0] ? serializeCaptureProofLog(rows[0]) : null,
    attempts: rows.map(serializeCaptureProofLog),
  });
});

router.get("/capture-proof-logs/:logId", async (req, res): Promise<void> => {
  const logId = String(req.params.logId || "").trim();
  if (!logId) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const [row] = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, logId)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Log de captura não encontrado." });
    return;
  }

  res.json(serializeCaptureProofLog(row));
});

router.get("/ops/jobs/:id/log", async (req, res): Promise<void> => {
  const jobId = String(req.params.id || "").trim();
  if (!jobId) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const rows = await db.select().from(captureProofLogsTable).where(
    sql`${captureProofLogsTable.jobId} = ${jobId} OR ${captureProofLogsTable.runnerJobId} = ${jobId}`,
  ).orderBy(desc(captureProofLogsTable.createdAt));

  res.json({
    jobId,
    latest: rows[0] ? serializeCaptureProofLog(rows[0]) : null,
    attempts: rows.map(serializeCaptureProofLog),
  });
});

router.post("/insertions/:id/capture-proof/fix-invalid", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId)).orderBy(evidencesTable.criadoEm);
  const evidenceDates = Array.from(new Set(
    evidences
      .map((row) => getEvidenceDateKey(row.titulo))
      .filter((value): value is string => Boolean(value)),
  )).sort();
  const statuses = await Promise.all(evidenceDates.map((targetDate) => resolveEvidenceAuditStatus(insertion, targetDate, evidences)));
  const invalidStatuses = statuses.filter((item): item is typeof item & { status: "invalid_audit" | "invalid_url" } => (
    item.status === "invalid_audit" || item.status === "invalid_url"
  ));

  if (invalidStatuses.length === 0) {
    res.json({
      ok: true,
      insertionId,
      deletedEvidenceIds: [],
      totalProblemDates: 0,
      regenerated: 0,
      failed: 0,
      items: [],
    });
    return;
  }

  const deletedEvidenceIds = new Set<number>();
  const items: Array<{
    date: string;
    previousStatus: "invalid_audit" | "invalid_url";
    deletedEvidenceIds: number[];
    captureAt: string | null;
    status: "ok" | "error";
    uploadedUrl?: string | null;
    error?: string;
  }> = [];

  for (const invalidStatus of invalidStatuses) {
    const resolvedDate = invalidStatus.targetDate ?? null;
    if (!resolvedDate) continue;

    const rowsForDate = evidences.filter((row) => getEvidenceDateKey(row.titulo) === resolvedDate);
    for (const row of rowsForDate) {
      if (deletedEvidenceIds.has(row.id)) continue;
      await db.delete(evidencesTable).where(eq(evidencesTable.id, row.id));
      deletedEvidenceIds.add(row.id);
    }

    const captureAt = resolveRegenerationCaptureAt(resolvedDate, insertionId, invalidStatus.audit);
    try {
      const runnerResult = await printRunner.runNow(buildPrintRunnerPayload(
        "capture-proof-fix-invalid",
        [{ insertionId, targetDate: resolvedDate, captureAt, replaceExisting: true }],
        { competencia: insertion.competencia ?? null, siteId: insertion.siteId ?? null, source: "adops-ui" },
      ));
      const capture = runnerResult.items[0];
      items.push({
        date: resolvedDate,
        previousStatus: invalidStatus.status,
        deletedEvidenceIds: rowsForDate.map((row) => row.id),
        captureAt,
        status: capture?.status === "ok" ? "ok" : "error",
        uploadedUrl: capture?.uploadedUrl ?? null,
        error: capture?.status === "error" ? capture.error ?? "Falha ao gerar a nova evidência." : undefined,
      });
    } catch (error) {
      items.push({
        date: resolvedDate,
        previousStatus: invalidStatus.status,
        deletedEvidenceIds: rowsForDate.map((row) => row.id),
        captureAt,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  res.json({
    ok: true,
    insertionId,
    deletedEvidenceIds: Array.from(deletedEvidenceIds),
    totalProblemDates: invalidStatuses.length,
    regenerated: items.filter((item) => item.status === "ok").length,
    failed: items.filter((item) => item.status === "error").length,
    items,
  });
});

router.get("/insertions/:id/evidences/:date/download", async (req, res): Promise<void> => {
  const cod5_insertionId = Number.parseInt(req.params.id, 10);
  const cod5_targetDate = String(req.params.date ?? "");
  if (!Number.isFinite(cod5_insertionId) || !/^\d{4}-\d{2}-\d{2}$/.test(cod5_targetDate)) {
    res.status(400).json({ error: "Inserção ou data inválida." });
    return;
  }

  let cod5_options: ReturnType<typeof parseIndividualEvidenceDownloadOptions>;
  try {
    cod5_options = parseIndividualEvidenceDownloadOptions(req.query as Record<string, unknown>);
  } catch (error) {
    res.status(error instanceof EvidenceExportInputError ? error.statusCode : 400).json({
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const [cod5_rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, cod5_insertionId));
  if (!cod5_rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const cod5_insertion = await enrichInsertion(cod5_rawInsertion);
  const cod5_rows = await db.select().from(evidencesTable)
    .where(eq(evidencesTable.insercaoId, cod5_insertionId))
    .orderBy(evidencesTable.criadoEm);
  const cod5_canonicalRows = selectCanonicalEvidencePerDate(cod5_rows, (row) => getEvidenceDateKey(row.titulo));
  const cod5_evidence = cod5_canonicalRows.find((row) => getEvidenceDateKey(row.titulo) === cod5_targetDate) ?? null;
  if (!cod5_evidence?.arquivoUrl || !isValidHttpUrl(cod5_evidence.arquivoUrl)) {
    res.status(404).json({ error: "Evidência não encontrada para a data informada." });
    return;
  }

  const cod5_auditStatus = await resolveEvidenceAuditStatus(cod5_insertion, cod5_targetDate, [cod5_evidence]);
  if (!isApprovedEvidenceDownload(cod5_auditStatus)) {
    res.status(409).json({
      error: "A evidência existe, mas ainda não foi aprovada para download.",
      status: cod5_auditStatus.status,
    });
    return;
  }

  const cod5_tempDir = await mkdtemp(join(tmpdir(), `adops-evidence-download-${cod5_insertionId}-`));
  const cod5_fileName = buildIndividualEvidenceDownloadName(cod5_insertion, cod5_targetDate);
  const cod5_outputPath = join(cod5_tempDir, cod5_fileName);
  try {
    const cod5_sourceResponse = await fetch(cod5_evidence.arquivoUrl, { redirect: "follow" });
    if (!cod5_sourceResponse.ok) {
      res.status(409).json({ error: "A evidência aprovada não está acessível no storage." });
      return;
    }
    await prepareEvidenceImage({
      source: Buffer.from(await cod5_sourceResponse.arrayBuffer()),
      outputPath: cod5_outputPath,
      variant: cod5_options.variant,
      maxWidth: cod5_options.imageMaxWidth,
      quality: cod5_options.imageQuality,
    });
    const cod5_output = await readFile(cod5_outputPath);
    res.setHeader("cache-control", "private, max-age=300");
    res.setHeader("content-type", "image/jpeg");
    res.setHeader("content-disposition", `attachment; filename="${cod5_fileName}"`);
    res.setHeader("x-adops-evidence-id", String(cod5_evidence.id));
    res.send(cod5_output);
  } catch (error) {
    if (!res.headersSent) {
      res.status(error instanceof EvidenceExportInputError ? error.statusCode : 500).json({
        error: "Falha ao preparar o JPEG da evidência.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    await rm(cod5_tempDir, { recursive: true, force: true });
  }
});

router.get("/insertions/:id/evidences/export.debug", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId)).orderBy(evidencesTable.criadoEm);
  const auditSummary = await buildInsertionAuditSummary(insertion, evidences);
  const checkUrls = String(req.query.checkUrls ?? "") === "1";
  const requestedRequestId = typeof req.query.requestId === "string" ? req.query.requestId.trim() : "";
  const exportRequestId = requestedRequestId || crypto.randomUUID();
  const duplicateSourcePathnames = new Map<string, number>();

  const evidenceItems = await Promise.all(evidences.map(async (evidence) => {
    const dateKey = getEvidenceDateKey(evidence.titulo);
    const naming = buildEvidenceExportFileName(evidence, dateKey);
    if (naming.sourcePathname) {
      duplicateSourcePathnames.set(
        naming.sourcePathname,
        (duplicateSourcePathnames.get(naming.sourcePathname) ?? 0) + 1,
      );
    }
    let reachableStatus: number | null = null;
    let reachableOk: boolean | null = null;
    if (checkUrls && isValidHttpUrl(evidence.arquivoUrl)) {
      try {
        const headResponse = await fetch(evidence.arquivoUrl!, { method: "HEAD" });
        reachableStatus = headResponse.status;
        reachableOk = headResponse.ok;
      } catch {
        reachableStatus = null;
        reachableOk = false;
      }
    }
    return {
      evidenceId: evidence.id,
      date: dateKey,
      title: evidence.titulo,
      arquivoUrl: evidence.arquivoUrl,
      exportFileName: naming.fileName,
      sourcePathname: naming.sourcePathname,
      reachableStatus,
      reachableOk,
    };
  }));

  const duplicateSourceEntries = Array.from(duplicateSourcePathnames.entries())
    .filter(([, total]) => total > 1)
    .map(([pathname, total]) => ({ pathname, total }));

  (req as any).log?.info?.({
    exportRequestId,
    insertionId,
    evidenceRows: evidences.length,
    duplicateSourceEntries: duplicateSourceEntries.length,
    checkUrls,
  }, "evidence export debug requested");

  res.setHeader("cache-control", "no-store");
  res.json({
    requestId: exportRequestId,
    insertionId,
    evidenceRows: evidences.length,
    uniqueEvidenceDates: auditSummary.totalEvidenceDates,
    auditSummary,
    duplicateSourceEntries,
    items: evidenceItems,
  });
});

router.get("/insertions/:id/evidences/export.zip", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  let exportOptions: ReturnType<typeof parseEvidenceExportOptions>;
  try {
    exportOptions = parseEvidenceExportOptions(req.query as Record<string, unknown>);
  } catch (error) {
    res.status(error instanceof EvidenceExportInputError ? error.statusCode : 400).json({
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId)).orderBy(evidencesTable.criadoEm);
  const exportRequestId = crypto.randomUUID();
  const downloadSource = typeof req.query.source === "string" ? req.query.source : "unknown";

  if (exportOptions.mode === "prints-only") {
    if (evidences.length === 0) {
      res.status(409).json({ error: "A inserção não possui prints para exportação." });
      return;
    }
    const tempDir = await mkdtemp(join(tmpdir(), `adops-print-delivery-${insertionId}-`));
    let zipPath: string | null = null;
    try {
      const delivery = await writePrintDeliveryFolder({
        rootDir: tempDir,
        insertion,
        evidences,
        variant: exportOptions.variant,
      });
      if (delivery.failures.length > 0) {
        setPrintDeliveryHeaders(res, delivery.metrics, exportOptions.variant, exportRequestId);
        await rm(tempDir, { recursive: true, force: true });
        res.status(422).json({
          error: "Falha ao preparar todos os prints. Nenhum pacote parcial foi entregue.",
          requestId: exportRequestId,
          failed: delivery.failures,
        });
        return;
      }

      zipPath = join(tmpdir(), `${delivery.packageName}-${exportRequestId}.zip`);
      await execFileAsync("zip", ["-rq", zipPath, delivery.packageName], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
      setPrintDeliveryHeaders(res, delivery.metrics, exportOptions.variant, exportRequestId);
      (req as any).log?.info?.({
        exportRequestId,
        insertionId,
        source: downloadSource,
        mode: exportOptions.mode,
        variant: exportOptions.variant,
        ...delivery.metrics,
      }, "print delivery export completed");
      res.download(zipPath, `${delivery.packageName}.zip`, async () => {
        await Promise.allSettled([
          rm(tempDir, { recursive: true, force: true }),
          rm(zipPath!, { force: true }),
        ]);
      });
      return;
    } catch (error) {
      await Promise.allSettled([
        rm(tempDir, { recursive: true, force: true }),
        zipPath ? rm(zipPath, { force: true }) : Promise.resolve(),
      ]);
      res.status(error instanceof EvidenceExportInputError ? error.statusCode : 500).json({
        error: "Falha ao gerar o pacote de prints.",
        requestId: exportRequestId,
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  const auditSummary = await buildInsertionAuditSummary(insertion, evidences);
  (req as any).log?.info?.({
    exportRequestId,
    insertionId,
    source: downloadSource,
    evidenceRows: evidences.length,
    siteSigla: insertion.siteSigla,
    localFormato: insertion.localFormatoNormalizado ?? insertion.localFormato,
  }, "evidence export started");
  const tempDir = await mkdtemp(join(tmpdir(), `adops-export-${insertionId}-`));
  const printGroupFolder = resolveOperationalPrintFolder(insertion);
  const evidencesDir = join(tempDir, "01-PRINTS", printGroupFolder);
  await mkdir(evidencesDir, { recursive: true });
  let downloadedEvidenceFiles = 0;
  let evidenceDownloadFailures = 0;
  const duplicateSourcePathnames = new Map<string, number>();

  const lines: string[] = [
    "PACOTE OPERACIONAL DE PRINTS",
    "============================",
    "",
    `Inserção #${insertion.id}`,
    `Campanha: ${insertion.campanhaName ?? "—"}`,
    `PI: ${insertion.piCodigo ?? "—"}`,
    `Site: ${insertion.siteSigla ?? "—"} - ${insertion.siteNome ?? "—"}`,
    `Cliente: ${insertion.clienteNome ?? "—"}`,
    `Agência: ${insertion.agenciaNome ?? "—"}`,
    `Formato/peça: ${insertion.localFormatoNormalizado ?? insertion.localFormato ?? "—"}`,
    `Período: ${insertion.periodoOriginal ?? `${insertion.periodoInicio ?? "—"} até ${insertion.periodoFim ?? "—"}`}`,
    `Competência: ${insertion.competencia ?? "—"}`,
    "",
    "Estrutura deste ZIP",
    "-------------------",
    `01-PRINTS/${printGroupFolder}/ -> prints da peça/local desta inserção`,
    "02-ANALYTICS/ -> PDF do relatório de Analytics, quando disponível",
    "03-DOCUMENTOS-OPERACIONAIS/ -> modelos editáveis e PDFs operacionais baseados na PI",
    "",
    `Resumo da auditoria: ${auditSummary.auditedCount} aprovadas, ${auditSummary.failedCount} com falha.`,
    "",
    "Detalhamento das evidências",
    "=========================",
    "",
  ];

  for (const evidence of evidences) {
    const dateKey = getEvidenceDateKey(evidence.titulo);
    const fileNaming = buildEvidenceExportFileName(evidence, dateKey);
    if (fileNaming.sourcePathname) {
      duplicateSourcePathnames.set(
        fileNaming.sourcePathname,
        (duplicateSourcePathnames.get(fileNaming.sourcePathname) ?? 0) + 1,
      );
    }
    const auditStatus = dateKey ? await resolveEvidenceAuditStatus(insertion, dateKey, evidences) : null;
    const sectionTitle = `${dateKey ?? "sem-data"} - ${evidence.titulo ?? "Sem título"}`;
    lines.push(sectionTitle);
    lines.push("-".repeat(sectionTitle.length));
    lines.push(`Evidence ID: ${evidence.id}`);
    lines.push(`Criado em: ${evidence.criadoEm ?? "—"}`);
    lines.push(`URL: ${evidence.arquivoUrl ?? "—"}`);
    lines.push(`Status da auditoria: ${auditStatus?.status ?? "sem-auditoria"}`);
    if (auditStatus?.audit?.systemDateTime) lines.push(`Hora da moldura: ${auditStatus.audit.systemDateTime}`);
    if (auditStatus?.audit?.pageDateText) lines.push(`Hora do site: ${auditStatus.audit.pageDateText}`);
    if (auditStatus?.audit?.visualAudit) {
      lines.push(`Viewport: ${auditStatus.audit.visualAudit.viewportImagesLoaded ?? 0}/${auditStatus.audit.visualAudit.viewportImagesTotal ?? 0}`);
      lines.push(`Slot: ${auditStatus.audit.visualAudit.slotImagesLoaded ?? 0}/${auditStatus.audit.visualAudit.slotImagesTotal ?? 0}`);
      lines.push(`Backgrounds: ${auditStatus.audit.visualAudit.viewportBackgroundsLoaded ?? 0}/${auditStatus.audit.visualAudit.viewportBackgroundsTotal ?? 0}`);
      lines.push(`Vídeos/Posters: ${auditStatus.audit.visualAudit.viewportVideosLoaded ?? 0}/${auditStatus.audit.visualAudit.viewportVideosTotal ?? 0}`);
    }
    if (auditStatus?.audit?.playerProof) {
      lines.push(`Player do vídeo: ${auditStatus.audit.playerProof.ok ? "ok" : "pendente"} · ${Math.floor(Number(auditStatus.audit.playerProof.currentTime ?? 0))}s / ${Math.floor(Number(auditStatus.audit.playerProof.duration ?? 0))}s`);
    }
    const issues = Array.isArray(auditStatus?.audit?.issues) ? auditStatus.audit.issues : [];
    if (issues.length) {
      lines.push("Falhas:");
      issues.forEach((issue) => lines.push(`- ${issue.label}: ${issue.detail}`));
    }
    lines.push("");

    if (isValidHttpUrl(evidence.arquivoUrl)) {
      try {
        const response = await fetch(evidence.arquivoUrl!);
        if (response.ok) {
          const outputPath = join(evidencesDir, fileNaming.fileName);
          const arrayBuffer = await response.arrayBuffer();
          await writeFile(outputPath, Buffer.from(arrayBuffer));
          downloadedEvidenceFiles += 1;
        } else {
          lines.push(`Download falhou para ${evidence.arquivoUrl}: HTTP ${response.status}`);
          lines.push("");
          evidenceDownloadFailures += 1;
        }
      } catch (error) {
        lines.push(`Download falhou para ${evidence.arquivoUrl}: ${error instanceof Error ? error.message : String(error)}`);
        lines.push("");
        evidenceDownloadFailures += 1;
      }
    }
  }

  await attachAnalyticsPdfsToExport(tempDir, insertionId, lines);
  await attachOperationalDocumentsToExport(tempDir, insertion, lines);

  const reportPath = join(tempDir, "00-LEIA-ME.txt");
  await writeFile(reportPath, lines.join("\n"), "utf8");

  const archiveBase = safeFileName(`${insertion.siteSigla ?? "site"}-${insertion.id}-evidencias`, `insercao-${insertion.id}-evidencias`);
  const zipPath = join(tmpdir(), `${archiveBase}.zip`);
  try {
    await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
    res.setHeader("x-adops-export-request-id", exportRequestId);
    res.setHeader("x-adops-export-evidences-total", String(evidences.length));
    res.setHeader("x-adops-export-evidences-downloaded", String(downloadedEvidenceFiles));
    res.setHeader("x-adops-export-evidences-failed", String(evidenceDownloadFailures));
    const duplicateSourceEntries = Array.from(duplicateSourcePathnames.entries()).filter(([, total]) => total > 1);
    if (duplicateSourceEntries.length > 0) {
      res.setHeader("x-adops-export-duplicate-sources", String(duplicateSourceEntries.length));
    }
    (req as any).log?.info?.({
      exportRequestId,
      insertionId,
      source: downloadSource,
      evidenceRows: evidences.length,
      downloadedEvidenceFiles,
      evidenceDownloadFailures,
      duplicateSourceEntries: duplicateSourceEntries.length,
    }, "evidence export completed");
    res.download(zipPath, `${archiveBase}.zip`, async () => {
      await Promise.allSettled([
        rm(tempDir, { recursive: true, force: true }),
        rm(zipPath, { force: true }),
      ]);
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    await rm(zipPath, { force: true });
    (req as any).log?.error?.({
      exportRequestId,
      insertionId,
      source: downloadSource,
      evidenceRows: evidences.length,
      downloadedEvidenceFiles,
      evidenceDownloadFailures,
      error: error instanceof Error ? error.message : String(error),
    }, "evidence export failed");
    res.status(500).json({
      error: "Falha ao gerar o pacote das evidências.",
      requestId: exportRequestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/campaign-evidence-exports/jobs", proxyCampaignEvidenceWorkerRequest);
router.post("/campaign-evidence-exports/jobs/batch", proxyCampaignEvidenceWorkerRequest);
router.get("/campaign-evidence-exports/jobs/:jobId", proxyCampaignEvidenceWorkerRequest);
router.get("/campaign-evidence-exports/jobs/:jobId/download", proxyCampaignEvidenceWorkerRequest);

router.get("/campaign-operations/evidence-monthly-source", async (req, res): Promise<void> => {
  const targetDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : formatIsoDate(new Date());
  const requestedCompetencia = typeof req.query.competencia === "string" ? req.query.competencia.trim() : "";
  try {
    const operations = await getActiveCampaignOperations({ date: targetDate, includeEvidence: true, sheetScope: "monthly" });
    const canonicalCompetencia = operations.sheet.name.replace(/\s+(\d{4})$/, "/$1");
    const normalizeCompetencia = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toUpperCase();
    if (requestedCompetencia && normalizeCompetencia(requestedCompetencia) !== normalizeCompetencia(canonicalCompetencia)) {
      res.status(400).json({
        error: "competencia_divergente",
        details: `A data ${targetDate} pertence à competência ${canonicalCompetencia}.`,
      });
      return;
    }
    const rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
    const enrichedInsertions = await Promise.all(rawInsertions.map(enrichInsertion));
    const insertionById = new Map(enrichedInsertions.map((item) => [item.id, item]));
    const monthlyItems = await Promise.all(operations.items.map(async (item) => {
      const insertionId = Number(item.adops.insertionId);
      const insertion = Number.isFinite(insertionId) ? insertionById.get(insertionId) ?? null : null;
      if (!insertion) return { operation: item, insertion: null };
      const evidenceRows = await db.select().from(evidencesTable)
        .where(eq(evidencesTable.insercaoId, insertion.id))
        .orderBy(evidencesTable.criadoEm);
      const days = await Promise.all(item.evidence.requiredDates.map(async (date) => {
        const status = await resolveEvidenceAuditStatus(insertion, date, evidenceRows);
        const blockingIssues = status.checklistValidation.blockingIssues.map((issue) => issue.code);
        const auditHash = crypto.createHash("sha256").update(JSON.stringify({
          version: status.checklistValidation.version,
          approved: status.checklistValidation.approved,
          blockingIssues,
          warnings: status.checklistValidation.warnings.map((issue) => issue.code),
        })).digest("hex");
        return {
          date,
          status: status.status === "ok"
            ? "audited"
            : status.status === "ok_best_effort"
              ? "audited_best_effort"
              : status.status === "missing"
                ? "missing"
                : "invalid",
          evidenceId: status.evidenceId,
          url: status.arquivoUrl,
          auditHash,
          blockingIssues,
        };
      }));
      return {
        operation: { ...item, evidence: { ...item.evidence, days } },
        insertion: { ...insertion, evidenceDays: days },
      };
    }));
    const upcomingItems = operations.upcomingItems.map((item) => {
      const insertionId = Number(item.adops.insertionId);
      const insertion = Number.isFinite(insertionId) ? insertionById.get(insertionId) ?? null : null;
      return {
        operation: item,
        insertion: insertion ? { ...insertion, evidenceDays: [] } : null,
      };
    });
    const source = buildMonthlyEvidenceSource({
      ...operations,
      items: monthlyItems.map((item) => item.operation),
      upcomingItems: upcomingItems.map((item) => item.operation),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...source,
      source: {
        sheetName: operations.sheet.name,
        downloadedAt: operations.sheet.downloadedAt,
        sha256: operations.sheet.sourceSha256,
        competencia: canonicalCompetencia,
      },
      insertions: [...monthlyItems, ...upcomingItems].map((item) => item.insertion).filter(Boolean),
    });
  } catch (error) {
    res.status(500).json({
      error: "evidence_monthly_source_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

async function handleInternalCampaignEvidenceExport(req: Request, res: Response): Promise<void> {
  let tempDir: string | null = null;
  let zipPath: string | null = null;
  try {
    const identity = parseCampaignEvidenceIdentity(req.query);
    const asOfDate = typeof req.query.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOfDate)
      ? req.query.asOfDate
      : undefined;
    const suppliedFingerprint = Array.isArray(req.body?.evidenceFingerprint)
      ? req.body.evidenceFingerprint.filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
    const suppliedSignature = typeof req.body?.evidenceFingerprintSignature === "string" ? req.body.evidenceFingerprintSignature : "";
    const wantsImmutableDownload = String(req.query.download ?? "") === "1";
    if (wantsImmutableDownload && !suppliedFingerprint.length) {
      res.status(409).json({ error: "O download exige descritor imutável assinado." });
      return;
    }
    if (suppliedFingerprint.length) {
      const expectedSignature = signCampaignEvidenceFingerprint(identity.piCodigo, identity.competencia, suppliedFingerprint);
      const validSignature = suppliedSignature.length === expectedSignature.length
        && crypto.timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature));
      if (!validSignature) {
        res.status(409).json({ error: "Assinatura do descritor imutável é inválida." });
        return;
      }
    }
    const fingerprintByEvidenceId = new Map<number, Record<string, unknown>>(
      suppliedFingerprint.map((item: Record<string, unknown>) => [Number(item.evidenceId), item]),
    );
    const requestedEvidenceIds = suppliedFingerprint.length ? new Set(fingerprintByEvidenceId.keys()) : null;
    if (suppliedFingerprint.length && fingerprintByEvidenceId.size !== suppliedFingerprint.length) {
      res.status(409).json({ error: "Descritor imutável contém evidências duplicadas." });
      return;
    }
    const immutableDownload = wantsImmutableDownload && requestedEvidenceIds && requestedEvidenceIds.size > 0;
    const descriptor = immutableDownload
      ? null
      : await describeCampaignEvidenceExport(identity.piCodigo, identity.competencia, asOfDate);
    const immutableSelection = immutableDownload
      ? await listCampaignEvidenceInsertions(identity.piCodigo, identity.competencia, false, asOfDate)
      : null;
    if (immutableDownload && !immutableSelection?.operations.length) {
      res.status(404).json({ error: "Campanha canônica não encontrada para PI e competência informadas." });
      return;
    }
    if (!descriptor) {
      if (!immutableDownload) {
        res.status(404).json({ error: "Campanha canônica não encontrada para PI e competência informadas." });
        return;
      }
    }
    if (String(req.query.download ?? "") !== "1") {
      res.json({ ...descriptor!, mode: "prints-only", variant: "web", imageDefaults: { format: "jpeg", maxWidth: 1600, quality: 72 } });
      return;
    }
    if (descriptor && !descriptor.readiness.ready) {
      res.status(409).json({ error: "Pacote bloqueado por evidências ausentes, inválidas ou inacessíveis.", ...descriptor! });
      return;
    }
    const { insertions, operations } = immutableSelection ?? await listCampaignEvidenceInsertions(identity.piCodigo, identity.competencia, true, asOfDate);
    const imageMaxWidth = parseBoundedInteger(req.query.imageMaxWidth, { minimum: 800, maximum: 2560, fallback: 1600 });
    const imageQuality = parseBoundedInteger(req.query.imageQuality, { minimum: 45, maximum: 90, fallback: 72 });
    const requestId = crypto.randomUUID();
    const metrics = emptyPrintDeliveryMetrics();
    const failures: Array<{ insertionId: number; evidenceId: number; date: string | null; error: string }> = [];
    tempDir = await mkdtemp(join(tmpdir(), `adops-campaign-evidence-${identity.piCodigo}-`));
    for (const insertion of insertions) {
      const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id)).orderBy(evidencesTable.criadoEm);
      let evidences = evidenceRows.filter((evidence) => immutableDownload && requestedEvidenceIds!.has(evidence.id));
      if (immutableDownload && suppliedFingerprint.length) {
        const requiredDates = new Set(immutableSelection!.requiredDatesByInsertion.get(insertion.id) ?? []);
        const seenDates = new Set<string>();
        for (const evidence of evidences) {
          const expected = fingerprintByEvidenceId.get(evidence.id)!;
          const currentDate = getEvidenceDateKey(evidence.titulo);
          if (Number(expected.insertionId) !== insertion.id
            || String(expected.date || "") !== currentDate
            || String(expected.url || "") !== String(evidence.arquivoUrl || "")
            || !/^[a-f0-9]{64}$/i.test(String(expected.auditHash || ""))
            || !currentDate
            || !requiredDates.has(currentDate)
            || seenDates.has(currentDate)) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = null;
            res.status(409).json({ error: "A evidência mudou após a auditoria; gere um novo descritor antes do ZIP.", insertionId: insertion.id, evidenceId: evidence.id });
            return;
          }
          seenDates.add(currentDate);
        }
        if (evidences.length !== requiredDates.size) {
          await rm(tempDir, { recursive: true, force: true });
          tempDir = null;
          res.status(409).json({ error: "O descritor não cobre todas as datas canônicas da inserção.", insertionId: insertion.id });
          return;
        }
      }
      if (!immutableDownload) {
        const requiredDates = descriptor!.requiredDatesByInsertion[insertion.id] ?? [];
        const statusesByDate = new Map();
        for (const date of requiredDates) statusesByDate.set(date, await resolveEvidenceAuditStatus(insertion, date, evidenceRows));
        evidences = selectApprovedCanonicalEvidenceRows(evidenceRows, (evidence) => getEvidenceDateKey(evidence.titulo), statusesByDate);
      }
      const portalDir = join(tempDir, deliverySegment(insertion.siteSigla, "SEM-PORTAL"), resolveOperationalPrintFolder(insertion));
      const delivery = await writePrintDeliveryFolder({
        rootDir: portalDir,
        insertion,
        evidences,
        variant: "web",
        maxWidth: imageMaxWidth,
        quality: imageQuality,
        packageNameOverride: `INSERCAO-${insertion.id}`,
      });
      mergePrintDeliveryMetrics(metrics, delivery.metrics);
      failures.push(...delivery.failures.map((item) => ({ insertionId: insertion.id, ...item })));
    }
    const expectedEvidenceCount = immutableDownload ? requestedEvidenceIds!.size : descriptor!.evidenceCount;
    if (failures.length || metrics.generated !== expectedEvidenceCount) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
      res.status(422).json({ error: "Falha ao preparar todos os prints. Nenhum pacote parcial foi entregue.", requestId, failed: failures });
      return;
    }
    await writeSha256Sums(tempDir);
    const campaignName = descriptor?.campaignName ?? operations[0]?.campaignName ?? `PI ${identity.piCodigo}`;
    const archiveBase = safeFileName(`${campaignName}-PI-${identity.piCodigo}-${identity.competencia}-TODOS-OS-PRINTS`, `PI-${identity.piCodigo}-TODOS-OS-PRINTS`);
    zipPath = join(tmpdir(), `${archiveBase}-${requestId}.zip`);
    await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
    setPrintDeliveryHeaders(res, metrics, "web", requestId);
    res.download(zipPath, `${archiveBase}.zip`, async () => {
      await Promise.allSettled([rm(tempDir!, { recursive: true, force: true }), rm(zipPath!, { force: true })]);
    });
  } catch (error) {
    await Promise.allSettled([tempDir ? rm(tempDir, { recursive: true, force: true }) : Promise.resolve(), zipPath ? rm(zipPath, { force: true }) : Promise.resolve()]);
    const statusCode = error instanceof CampaignEvidenceExportConflict ? error.statusCode : 500;
    res.status(statusCode).json({ error: statusCode === 409 && error instanceof Error ? error.message : "Falha ao gerar o pacote completo da campanha.", details: error instanceof Error ? error.message : String(error) });
  }
}

router.get("/internal/campaign-evidence-exports", handleInternalCampaignEvidenceExport);
router.post("/internal/campaign-evidence-exports", handleInternalCampaignEvidenceExport);

router.post("/pi-site-exports/jobs", async (req, res): Promise<void> => {
  const piCodigo = typeof req.body?.piCodigo === "string" ? req.body.piCodigo.trim() : "";
  const siteSigla = typeof req.body?.siteSigla === "string" ? req.body.siteSigla.trim() : "";
  if (!piCodigo || !siteSigla) {
    res.status(400).json({ error: "piCodigo e siteSigla são obrigatórios." });
    return;
  }

  try {
    const exportOptions = parseEvidenceExportOptions({
      ...(req.body as Record<string, unknown>),
      mode: req.body?.mode ?? "full-pdf",
    });
    const payload = {
      piCodigo,
      siteSigla: siteSigla.toUpperCase(),
      mode: exportOptions.mode,
      variant: exportOptions.variant,
      pdfMaxWidth: parseBoundedInteger(req.body?.pdfMaxWidth, { minimum: 800, maximum: 2560, fallback: 1920 }),
      pdfQuality: parseBoundedInteger(req.body?.pdfQuality, { minimum: 45, maximum: 85, fallback: 68 }),
      pdfResolution: parseBoundedInteger(req.body?.pdfResolution, { minimum: 72, maximum: 180, fallback: 120 }),
      imageMaxWidth: parseBoundedInteger(req.body?.imageMaxWidth, { minimum: 800, maximum: 2560, fallback: 1600 }),
      imageQuality: parseBoundedInteger(req.body?.imageQuality, { minimum: 45, maximum: 90, fallback: 72 }),
      source: typeof req.body?.source === "string" ? req.body.source : "api-server",
    };
    const requestedKey = typeof req.headers["idempotency-key"] === "string"
      ? req.headers["idempotency-key"].trim()
      : "";
    const idempotencyKey = requestedKey || crypto.createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
      res.status(400).json({ error: "Idempotency-Key inválida." });
      return;
    }
    const created = await createLocalPiSiteExportJob({
      payload,
      requestedBy: typeof req.body?.requestedBy === "string" ? req.body.requestedBy : "api-server",
      idempotencyKey,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(created.duplicate ? 200 : 202).json({
      ok: true,
      jobId: created.jobId,
      kind: "pi-site-export",
      status: created.status,
      duplicate: created.duplicate,
      piCodigo,
      siteSigla: siteSigla.toUpperCase(),
      mode: exportOptions.mode,
      variant: exportOptions.variant,
    });
  } catch (error) {
    res.status(error instanceof EvidenceExportInputError ? error.statusCode : 500).json({
      error: "Falha ao criar o job assíncrono do pacote PI/site.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/pi-site-exports/jobs/:jobId", async (req, res): Promise<void> => {
  try {
    const job = await getLocalPiSiteExportJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job PI/site não encontrado." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(job);
  } catch (error) {
    res.status(500).json({
      error: "Falha ao consultar o job assíncrono do pacote PI/site.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/pi-site-exports/jobs/:jobId/download", async (req, res): Promise<void> => {
  try {
    const job = await getLocalPiSiteExportJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job PI/site não encontrado." });
      return;
    }
    if (job.status !== "completed" || !job.downloadUrl) {
      res.status(409).json({
        error: "Artefato ainda não está pronto para download.",
        jobId: job.jobId,
        status: job.status,
        stage: job.stage,
      });
      return;
    }
    res.redirect(job.downloadUrl);
  } catch (error) {
    res.status(500).json({
      error: "Falha ao redirecionar o download do pacote PI/site.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/pi-site-exports", async (req, res): Promise<void> => {
  const piCodigo = typeof req.query.piCodigo === "string" ? req.query.piCodigo : "";
  const siteSigla = typeof req.query.siteSigla === "string" ? req.query.siteSigla : "";
  const download = String(req.query.download ?? "") === "1";
  const pdfMaxWidth = parseBoundedInteger(req.query.pdfMaxWidth, { minimum: 800, maximum: 2560, fallback: 1920 });
  const pdfQuality = parseBoundedInteger(req.query.pdfQuality, { minimum: 45, maximum: 85, fallback: 68 });
  const pdfResolution = parseBoundedInteger(req.query.pdfResolution, { minimum: 72, maximum: 180, fallback: 120 });
  const imageMaxWidth = parseBoundedInteger(req.query.imageMaxWidth ?? req.query.pdfMaxWidth, { minimum: 800, maximum: 2560, fallback: 1600 });
  const imageQuality = parseBoundedInteger(req.query.imageQuality ?? req.query.pdfQuality, { minimum: 45, maximum: 90, fallback: 72 });
  let exportOptions: ReturnType<typeof parseEvidenceExportOptions>;

  try {
    exportOptions = parseEvidenceExportOptions(req.query as Record<string, unknown>);
  } catch (error) {
    res.status(error instanceof EvidenceExportInputError ? error.statusCode : 400).json({
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!piCodigo.trim()) {
    res.status(400).json({ error: "piCodigo é obrigatório." });
    return;
  }
  if (!siteSigla.trim()) {
    res.status(400).json({ error: "siteSigla é obrigatório." });
    return;
  }

  const descriptor = await describePiSiteExport(piCodigo, siteSigla);
  if (!descriptor) {
    res.status(404).json({
      error: "PI/site não encontrados.",
      piCodigo,
      siteSigla: siteSigla.toUpperCase(),
    });
    return;
  }

  if (!download) {
    res.json({
      ...descriptor,
      supportedExportModes: ["full", "prints-only", "pdf", "full-pdf"],
      supportedImageVariants: ["original", "web"],
      pdfDefaults: {
        maxWidth: 1920,
        quality: 68,
        resolution: 120,
      },
      imageDefaults: {
        format: "jpeg",
        maxWidth: 1600,
        quality: 72,
      },
    });
    return;
  }

  if (!descriptor.downloadUrl || !descriptor.exportableInsertionIds.length) {
    res.status(409).json({
      error: "Nenhum artefato disponível para exportação neste recorte de PI/site.",
      ...descriptor,
    });
    return;
  }

  const insertions = await listPiSiteInsertions(descriptor.piCodigo, descriptor.siteSigla);
  const selectedInsertionIds = exportOptions.mode === "full" ? descriptor.exportableInsertionIds : descriptor.evidenceInsertionIds;
  const exportableInsertionIds = new Set(selectedInsertionIds);
  const exportableInsertions = insertions.filter((item) => exportableInsertionIds.has(item.id));
  const tempDir = await mkdtemp(join(tmpdir(), `adops-pi-site-export-${descriptor.piCodigo}-${descriptor.siteSigla}-`));

  if (exportOptions.mode === "pdf" || exportOptions.mode === "full-pdf") {
    const exportRequestId = crypto.randomUUID();
    const pdfSourceDir = join(tempDir, ".pdf-source");
    const pdfOutputDir = exportOptions.mode === "full-pdf" ? join(tempDir, "01-PRINTS-PDF") : tempDir;
    const aggregateMetrics = emptyPrintDeliveryMetrics();
    const pdfPages: Array<{ inputPath: string; dateKey: string | null; evidenceId: number; insertionId: number }> = [];
    const failures: Array<{ insertionId: number; evidenceId: number; date: string | null; error: string }> = [];
    const skippedInsertionIds: number[] = [];
    const packageNameOccurrences = new Map<string, number>();
    let pdfPath: string | null = null;
    let zipPath: string | null = null;
    try {
      for (const insertion of exportableInsertions) {
        const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id)).orderBy(evidencesTable.criadoEm);
        const canonicalEvidences = selectCanonicalEvidencePerDate(evidenceRows, (evidence) => getEvidenceDateKey(evidence.titulo));
        const statusesByDate = new Map<string, Awaited<ReturnType<typeof resolveEvidenceAuditStatus>>>();
        for (const evidence of canonicalEvidences) {
          const dateKey = getEvidenceDateKey(evidence.titulo);
          if (!dateKey) continue;
          statusesByDate.set(dateKey, await resolveEvidenceAuditStatus(insertion, dateKey, [evidence]));
        }
        const evidences = selectApprovedCanonicalEvidenceRows(
          evidenceRows,
          (evidence) => getEvidenceDateKey(evidence.titulo),
          statusesByDate,
        );
        if (!evidences.length) {
          skippedInsertionIds.push(insertion.id);
          continue;
        }
        const evidenceDates = Array.from(new Set(
          evidences
            .map((evidence) => getEvidenceDateKey(evidence.titulo))
            .filter((value): value is string => Boolean(value)),
        ));
        const auditSummary = await buildInsertionAuditSummary(insertion, evidences);
        if (auditSummary.failedCount > 0 || auditSummary.auditedCount !== evidenceDates.length) {
          failures.push({
            insertionId: insertion.id,
            evidenceId: 0,
            date: null,
            error: `audit_gate_failed:${auditSummary.auditedCount}/${evidenceDates.length}`,
          });
          continue;
        }
        const basePackageName = buildDeliveryPackageName(insertion, evidenceDates);
        const occurrence = (packageNameOccurrences.get(basePackageName) ?? 0) + 1;
        packageNameOccurrences.set(basePackageName, occurrence);
        const delivery = await writePrintDeliveryFolder({
          rootDir: pdfSourceDir,
          insertion,
          evidences,
          variant: "original",
          packageNameOverride: occurrence > 1 ? `${basePackageName}-INSERCAO-${insertion.id}` : basePackageName,
        });
        mergePrintDeliveryMetrics(aggregateMetrics, delivery.metrics);
        failures.push(...delivery.failures.map((item) => ({ insertionId: insertion.id, ...item })));
        pdfPages.push(...delivery.outputFiles.map((item) => ({
          ...item,
          insertionId: insertion.id,
        })));
      }

      if (failures.length > 0 || !pdfPages.length) {
        await rm(tempDir, { recursive: true, force: true });
        res.status(422).json({
          error: failures.length
            ? "O PDF foi bloqueado porque há evidências ausentes, inválidas ou sem auditoria."
            : "Nenhuma evidência auditada disponível para montar o PDF.",
          requestId: exportRequestId,
          failed: failures,
          skippedInsertionIds,
        });
        return;
      }

      pdfPages.sort((left, right) => {
        const leftKey = `${left.dateKey ?? "9999-99-99"}-${String(left.insertionId).padStart(12, "0")}-${String(left.evidenceId).padStart(12, "0")}`;
        const rightKey = `${right.dateKey ?? "9999-99-99"}-${String(right.insertionId).padStart(12, "0")}-${String(right.evidenceId).padStart(12, "0")}`;
        return leftKey.localeCompare(rightKey);
      });
      await mkdir(pdfOutputDir, { recursive: true });
      const pdfBaseName = safeFileName(
        `PI-${descriptor.piCodigo}-${descriptor.siteSigla}-prints-auditados-comprimidos`,
        `PI-${descriptor.piCodigo}-${descriptor.siteSigla}-prints-auditados-comprimidos`,
      );
      pdfPath = join(pdfOutputDir, `${pdfBaseName}.pdf`);
      const pdfResult = await buildCompressedEvidencePdf({
        tempDir,
        outputPath: pdfPath,
        pages: pdfPages.map((page) => ({
          ...page,
          outputRelativePath: relative(pdfSourceDir, page.inputPath),
        })),
        maxWidth: pdfMaxWidth,
        quality: pdfQuality,
        resolution: pdfResolution,
        imagesOutputDir: exportOptions.mode === "full-pdf"
          ? join(pdfOutputDir, "IMAGENS-INDEPENDENTES")
          : undefined,
      });
      await rm(pdfSourceDir, { recursive: true, force: true });

      res.setHeader("cache-control", "no-store");
      res.setHeader("x-adops-export-request-id", exportRequestId);
      res.setHeader("x-adops-export-mode", exportOptions.mode);
      res.setHeader("x-adops-export-variant", "web");
      res.setHeader("x-adops-export-image-format", "jpeg");
      res.setHeader("x-adops-export-images-total", String(aggregateMetrics.total));
      res.setHeader("x-adops-export-images-generated", String(aggregateMetrics.generated));
      res.setHeader("x-adops-export-original-bytes", String(aggregateMetrics.originalBytes));
      res.setHeader("x-adops-export-image-bytes", String(pdfResult.imageBytes));
      res.setHeader("x-adops-export-web-png-bytes", String(pdfResult.imageBytes));
      res.setHeader("x-adops-export-prepared-image-bytes", String(pdfResult.imageBytes));
      res.setHeader("x-adops-export-pdf-bytes", String(pdfResult.outputBytes));
      res.setHeader("x-adops-export-pages", String(pdfResult.pageCount));
      res.setHeader("x-adops-export-independent-images", String(pdfResult.imageCount));
      res.setHeader("x-adops-export-independent-image-bytes", String(pdfResult.imageBytes));
      res.setHeader("x-adops-export-savings-percent", String(calculateSavingsPercent(aggregateMetrics.originalBytes, pdfResult.outputBytes)));
      res.setHeader("access-control-expose-headers", [
        "content-disposition",
        "x-adops-export-request-id",
        "x-adops-export-mode",
        "x-adops-export-variant",
        "x-adops-export-image-format",
        "x-adops-export-images-total",
        "x-adops-export-images-generated",
        "x-adops-export-original-bytes",
        "x-adops-export-image-bytes",
        "x-adops-export-web-png-bytes",
        "x-adops-export-prepared-image-bytes",
        "x-adops-export-pdf-bytes",
        "x-adops-export-pages",
        "x-adops-export-independent-images",
        "x-adops-export-independent-image-bytes",
        "x-adops-export-savings-percent",
      ].join(", "));

      if (exportOptions.mode === "pdf") {
        res.download(pdfPath, `${pdfBaseName}.pdf`, async () => {
          await rm(tempDir, { recursive: true, force: true });
        });
        return;
      }

      const readmeLines = [
        "PACOTE OPERACIONAL POR PI E SITE - PDF COMPRIMIDO",
        "================================================",
        "",
        `PI: ${descriptor.piCodigo}`,
        `Site: ${descriptor.siteSigla}`,
        `Páginas do PDF: ${pdfResult.pageCount}`,
        `Bytes dos PNGs originais: ${aggregateMetrics.originalBytes}`,
        `Bytes das imagens originais preparadas para o PDF: ${aggregateMetrics.outputBytes}`,
        `Bytes do PDF: ${pdfResult.outputBytes}`,
        `Imagens JPEG independentes: ${pdfResult.imageCount}`,
        `Bytes das imagens JPEG independentes: ${pdfResult.imageBytes}`,
        `Economia contra os PNGs originais: ${calculateSavingsPercent(aggregateMetrics.originalBytes, pdfResult.outputBytes)}%`,
        `Configuração: largura máxima ${pdfMaxWidth}px, qualidade ${pdfQuality}, ${pdfResolution} DPI`,
        "Os PNGs auditados originais não foram alterados.",
        "O pacote inclui manifesto editorial por data, relatório de auditoria, contact sheet e SHA256SUMS.",
        "",
        `Inserções sem prints ignoradas: ${skippedInsertionIds.length ? skippedInsertionIds.join(", ") : "nenhuma"}`,
        "",
      ];
      for (const insertion of exportableInsertions) {
        await attachAnalyticsPdfsToExportAtPath(tempDir, insertion.id, readmeLines, join("02-ANALYTICS", `INSERCAO-${insertion.id}`));
        await attachOperationalDocumentsToExportAtPath(tempDir, insertion, readmeLines, join("03-DOCUMENTOS-OPERACIONAIS", `INSERCAO-${insertion.id}`));
      }
      const retroAudit = await writeRetroAuditArtifacts({
        rootDir: tempDir,
        descriptor,
        insertions: exportableInsertions,
      });
      await writeContactSheet(tempDir, join(pdfOutputDir, "IMAGENS-INDEPENDENTES"));
      readmeLines.push(`Provas editoriais aprovadas: ${retroAudit.approved}/${retroAudit.total}`);
      readmeLines.push(`Notícias futuras detectadas: ${retroAudit.futureCount}`);
      readmeLines.push("");
      await writeFile(join(tempDir, "00-LEIA-ME.txt"), readmeLines.join("\n"), "utf8");
      await writeSha256Sums(tempDir);
      const archiveBase = `${pdfBaseName}-PACOTE`;
      zipPath = join(tmpdir(), `${archiveBase}-${exportRequestId}.zip`);
      await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
      res.download(zipPath, `${archiveBase}.zip`, async () => {
        await Promise.allSettled([
          rm(tempDir, { recursive: true, force: true }),
          rm(zipPath!, { force: true }),
        ]);
      });
      return;
    } catch (error) {
      await Promise.allSettled([
        rm(tempDir, { recursive: true, force: true }),
        zipPath ? rm(zipPath, { force: true }) : Promise.resolve(),
      ]);
      res.status(error instanceof EvidenceExportInputError ? error.statusCode : 500).json({
        error: "Falha ao gerar a entrega em PDF comprimido.",
        requestId: exportRequestId,
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  if (exportOptions.mode === "prints-only") {
    const exportRequestId = crypto.randomUUID();
    const aggregateMetrics = emptyPrintDeliveryMetrics();
    const allEvidenceDates: string[] = [];
    const failures: Array<{ insertionId: number; evidenceId: number; date: string | null; error: string }> = [];
    const packageNameOccurrences = new Map<string, number>();
    let zipPath: string | null = null;
    try {
      for (const insertion of exportableInsertions) {
        const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id)).orderBy(evidencesTable.criadoEm);
        const canonicalEvidences = selectCanonicalEvidencePerDate(evidenceRows, (evidence) => getEvidenceDateKey(evidence.titulo));
        const statusesByDate = new Map<string, Awaited<ReturnType<typeof resolveEvidenceAuditStatus>>>();
        for (const evidence of canonicalEvidences) {
          const dateKey = getEvidenceDateKey(evidence.titulo);
          if (!dateKey) continue;
          statusesByDate.set(dateKey, await resolveEvidenceAuditStatus(insertion, dateKey, [evidence]));
        }
        const evidences = selectApprovedCanonicalEvidenceRows(
          evidenceRows,
          (evidence) => getEvidenceDateKey(evidence.titulo),
          statusesByDate,
        );
        for (const evidence of evidences) {
          const dateKey = getEvidenceDateKey(evidence.titulo);
          if (dateKey) allEvidenceDates.push(dateKey);
        }
        if (evidences.length === 0) {
          failures.push({ insertionId: insertion.id, evidenceId: 0, date: null, error: "no_evidence_images" });
          continue;
        }
        const basePackageName = buildDeliveryPackageName(
          insertion,
          evidences.map((evidence) => getEvidenceDateKey(evidence.titulo)),
        );
        const packageOccurrence = (packageNameOccurrences.get(basePackageName) ?? 0) + 1;
        packageNameOccurrences.set(basePackageName, packageOccurrence);
        const delivery = await writePrintDeliveryFolder({
          rootDir: tempDir,
          insertion,
          evidences,
          variant: exportOptions.variant,
          maxWidth: exportOptions.variant === "web" ? imageMaxWidth : undefined,
          quality: exportOptions.variant === "web" ? imageQuality : undefined,
          packageNameOverride: packageOccurrence > 1 ? `${basePackageName}-INSERCAO-${insertion.id}` : basePackageName,
        });
        mergePrintDeliveryMetrics(aggregateMetrics, delivery.metrics);
        failures.push(...delivery.failures.map((item) => ({ insertionId: insertion.id, ...item })));
      }

      if (failures.length > 0) {
        setPrintDeliveryHeaders(res, aggregateMetrics, exportOptions.variant, exportRequestId);
        await rm(tempDir, { recursive: true, force: true });
        res.status(422).json({
          error: "Falha ao preparar todos os prints. Nenhum pacote parcial foi entregue.",
          requestId: exportRequestId,
          failed: failures,
        });
        return;
      }

      const archiveBase = buildPiSitePrintDeliveryArchiveName(descriptor, exportableInsertions, allEvidenceDates);
      zipPath = join(tmpdir(), `${archiveBase}-${exportRequestId}.zip`);
      await writeSha256Sums(tempDir);
      await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
      setPrintDeliveryHeaders(res, aggregateMetrics, exportOptions.variant, exportRequestId);
      res.download(zipPath, `${archiveBase}.zip`, async () => {
        await Promise.allSettled([
          rm(tempDir, { recursive: true, force: true }),
          rm(zipPath!, { force: true }),
        ]);
      });
      return;
    } catch (error) {
      await Promise.allSettled([
        rm(tempDir, { recursive: true, force: true }),
        zipPath ? rm(zipPath, { force: true }) : Promise.resolve(),
      ]);
      res.status(error instanceof EvidenceExportInputError ? error.statusCode : 500).json({
        error: "Falha ao gerar o pacote consolidado de prints.",
        requestId: exportRequestId,
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  const lines: string[] = [
    "PACOTE OPERACIONAL POR PI E SITE",
    "================================",
    "",
    `PI: ${descriptor.piCodigo}`,
    `Site: ${descriptor.siteSigla}`,
    `Competência: ${descriptor.competencia ?? "—"}`,
    `Inserções encontradas: ${pluralizeInsertion(descriptor.totalInsertions)}`,
    `Inserções exportadas: ${pluralizeInsertion(exportableInsertions.length)}`,
    "",
    "Estrutura deste ZIP",
    "-------------------",
    "01-PRINTS/ -> evidências separadas por formato e inserção",
    "02-ANALYTICS/ -> PDFs concluídos por inserção",
    "03-DOCUMENTOS-OPERACIONAIS/ -> documentos operacionais por inserção",
    "",
    "Inserções incluídas",
    "===================",
  ];

  for (const item of exportableInsertions) {
    lines.push(`- #${item.id} · ${item.localFormatoNormalizado ?? item.localFormato ?? "—"} · ${item.periodoInicio ?? "—"} a ${item.periodoFim ?? "—"}`);
  }

  if (descriptor.skippedInsertions.length) {
    lines.push("");
    lines.push("Inserções não exportadas");
    lines.push("=======================");
    for (const skipped of descriptor.skippedInsertions) {
      lines.push(`- #${skipped.insertionId}: ${skipped.reason}`);
    }
  }
  lines.push("");

  try {
    for (const insertion of exportableInsertions) {
      const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id)).orderBy(evidencesTable.criadoEm);
      const evidences = selectCanonicalEvidencePerDate(evidenceRows, (evidence) => getEvidenceDateKey(evidence.titulo));
      const auditSummary = await buildInsertionAuditSummary(insertion, evidences);
      const printGroupFolder = resolveOperationalPrintFolder(insertion);
      const insertionFolder = safeFileName(
        `INSERCAO-${insertion.id}-${printGroupFolder}`,
        `INSERCAO-${insertion.id}`,
      );
      const evidencesDir = join(tempDir, "01-PRINTS", printGroupFolder, insertionFolder);
      await mkdir(evidencesDir, { recursive: true });

      lines.push(`Inserção #${insertion.id}`);
      lines.push("----------------");
      lines.push(`Campanha: ${insertion.campanhaName ?? "—"}`);
      lines.push(`Formato/peça: ${insertion.localFormatoNormalizado ?? insertion.localFormato ?? "—"}`);
      lines.push(`Período: ${insertion.periodoOriginal ?? `${insertion.periodoInicio ?? "—"} até ${insertion.periodoFim ?? "—"}`}`);
      lines.push(`Resumo da auditoria: ${auditSummary.auditedCount} aprovadas, ${auditSummary.failedCount} com falha.`);
      lines.push("");

      for (const evidence of evidences) {
        const dateKey = getEvidenceDateKey(evidence.titulo);
        const auditStatus = dateKey ? await resolveEvidenceAuditStatus(insertion, dateKey, evidences) : null;
        const sectionTitle = `${dateKey ?? "sem-data"} - ${evidence.titulo ?? "Sem título"}`;
        lines.push(sectionTitle);
        lines.push("-".repeat(sectionTitle.length));
        lines.push(`Evidence ID: ${evidence.id}`);
        lines.push(`Criado em: ${evidence.criadoEm ?? "—"}`);
        lines.push(`URL: ${evidence.arquivoUrl ?? "—"}`);
        lines.push(`Status da auditoria: ${auditStatus?.status ?? "sem-auditoria"}`);
        if (auditStatus?.audit?.systemDateTime) lines.push(`Hora da moldura: ${auditStatus.audit.systemDateTime}`);
        if (auditStatus?.audit?.pageDateText) lines.push(`Hora do site: ${auditStatus.audit.pageDateText}`);
        const issues = Array.isArray(auditStatus?.audit?.issues) ? auditStatus.audit.issues : [];
        if (issues.length) {
          lines.push("Falhas:");
          issues.forEach((issue) => lines.push(`- ${issue.label}: ${issue.detail}`));
        }
        lines.push("");

        if (!isValidHttpUrl(evidence.arquivoUrl)) continue;
        try {
          const response = await fetch(evidence.arquivoUrl!);
          if (!response.ok) {
            lines.push(`Download falhou para ${evidence.arquivoUrl}: HTTP ${response.status}`);
            lines.push("");
            continue;
          }
          const url = new URL(evidence.arquivoUrl!);
          const fallbackName = `${safeFileName(dateKey, `evidence-${evidence.id}`)}${extname(url.pathname) || ".bin"}`;
          const fileName = safeFileName(basename(url.pathname) || fallbackName, fallbackName);
          const outputPath = join(evidencesDir, fileName);
          const arrayBuffer = await response.arrayBuffer();
          await writeFile(outputPath, Buffer.from(arrayBuffer));
        } catch (error) {
          lines.push(`Download falhou para ${evidence.arquivoUrl}: ${error instanceof Error ? error.message : String(error)}`);
          lines.push("");
        }
      }

      await attachAnalyticsPdfsToExportAtPath(tempDir, insertion.id, lines, join("02-ANALYTICS", `INSERCAO-${insertion.id}`));
      await attachOperationalDocumentsToExportAtPath(tempDir, insertion, lines, join("03-DOCUMENTOS-OPERACIONAIS", `INSERCAO-${insertion.id}`));
    }

    const reportPath = join(tempDir, "00-LEIA-ME.txt");
    await writeFile(reportPath, lines.join("\n"), "utf8");

    const allReports = (
      await Promise.all(exportableInsertions.map((item) => fetchCompletedAnalyticsReports(item.id)))
    ).flat();
    const archiveBase = buildPiSiteExportArchiveBaseName(descriptor, exportableInsertions, allReports);
    const zipPath = join(tmpdir(), `${archiveBase}.zip`);
    try {
      await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: tempDir, maxBuffer: 20 * 1024 * 1024 });
      res.download(zipPath, `${archiveBase}.zip`, async () => {
        await Promise.allSettled([
          rm(tempDir, { recursive: true, force: true }),
          rm(zipPath, { force: true }),
        ]);
      });
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      res.status(500).json({
        error: "Falha ao gerar o pacote consolidado da PI por site.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    res.status(500).json({
      error: "Falha ao montar o pacote consolidado da PI por site.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/insertions/:id/operational-documents", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const documents = await listVisibleOperationalDocuments(insertion);
  res.json({
    insertionId,
    generatedAt: new Date().toISOString(),
    documents: documents.map((item) => ({
      ...item,
      downloadDocxUrl: `/api/insertions/${insertionId}/operational-documents/${item.kind}/docx`,
      downloadPdfUrl: `/api/insertions/${insertionId}/operational-documents/${item.kind}/pdf`,
      previewDocxUrl: `/api/insertions/${insertionId}/operational-documents/${item.kind}/docx?disposition=inline`,
      previewPdfUrl: `/api/insertions/${insertionId}/operational-documents/${item.kind}/pdf?disposition=inline`,
    })),
  });
});

router.post("/insertions/:id/operational-documents/regenerate", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  await unhideOperationalDocuments(insertionId, ["declaracao-execucao", "anexo-v"]);
  const documents = await Promise.all([
    generateOperationalDocument(insertion, "declaracao-execucao"),
    generateOperationalDocument(insertion, "anexo-v"),
  ]);

  res.json({
    ok: true,
    insertionId,
    regeneratedAt: new Date().toISOString(),
    documents: documents.map((item) => ({
      ...item.descriptor,
      downloadDocxUrl: `/api/insertions/${insertionId}/operational-documents/${item.descriptor.kind}/docx`,
      downloadPdfUrl: `/api/insertions/${insertionId}/operational-documents/${item.descriptor.kind}/pdf`,
      previewDocxUrl: `/api/insertions/${insertionId}/operational-documents/${item.descriptor.kind}/docx?disposition=inline`,
      previewPdfUrl: `/api/insertions/${insertionId}/operational-documents/${item.descriptor.kind}/pdf?disposition=inline`,
    })),
  });
});

router.get("/insertions/:id/operational-documents/:kind/:format", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  const kind = req.params.kind as OperationalDocumentKind;
  const format = req.params.format === "pdf" ? "pdf" : req.params.format === "docx" ? "docx" : null;
  if (!["declaracao-execucao", "anexo-v"].includes(kind) || !format) {
    res.status(400).json({ error: "Documento operacional inválido." });
    return;
  }
  if (await isOperationalDocumentHidden(insertionId, kind)) {
    res.status(404).json({ error: "Documento operacional excluído." });
    return;
  }

  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }

  const insertion = await enrichInsertion(rawInsertion);
  const generated = await generateOperationalDocument(insertion, kind);
  const fileName = format === "pdf" ? generated.descriptor.pdfFileName : generated.descriptor.docxFileName;
  const payload = format === "pdf" ? generated.pdf : generated.docx;
  const disposition = req.query.disposition === "inline" ? "inline" : "attachment";
  res.setHeader("Content-Type", format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
  res.send(payload);
});

router.delete("/insertions/:id/operational-documents/:kind", async (req, res): Promise<void> => {
  const insertionId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(insertionId)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }
  const kind = req.params.kind as OperationalDocumentKind;
  if (!["declaracao-execucao", "anexo-v"].includes(kind)) {
    res.status(400).json({ error: "Documento operacional inválido." });
    return;
  }
  const [rawInsertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId));
  if (!rawInsertion) {
    res.status(404).json({ error: "Inserção não encontrada." });
    return;
  }
  await hideOperationalDocument(insertionId, kind);
  res.json({ ok: true, insertionId, kind });
});

router.post("/insertions/capture-proof/batch", async (req, res): Promise<void> => {
  const competencia = typeof req.body?.competencia === "string" ? req.body.competencia : undefined;
  const siteId = typeof req.body?.siteId === "number" ? req.body.siteId : undefined;
  const targetDate = typeof req.body?.date === "string"
    ? req.body.date
    : typeof req.body?.captureAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(req.body.captureAt)
      ? req.body.captureAt.slice(0, 10)
      : formatIsoDate(new Date());
  const captureAt = typeof req.body?.captureAt === "string" ? req.body.captureAt : null;
  if (rejectCaptureAtOutsideWindow(captureAt, res)) return;

  let rawInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.id);
  if (siteId) rawInsertions = rawInsertions.filter((item) => item.siteId === siteId);
  const enriched = await Promise.all(rawInsertions.map(enrichInsertion));

  const candidates = enriched.filter((item) => {
    if (competencia && item.competencia !== competencia) return false;
    if (!item.mediaUrl) return false;
    if (getAdRotateGroupId(item.siteSigla, item.localFormatoNormalizado ?? item.localFormato) == null) return false;
    const start = parseDateOnly(item.periodoInicio);
    const end = parseDateOnly(item.periodoFim);
    const today = parseDateOnly(targetDate);
    if (!start || !end || !today) return false;
    if (today < start || today > end) return false;
    return true;
  });

  const skippedResults = [];
  const targets: PrintRunnerJobPayload["targets"] = [];
  for (const item of candidates) {
    const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, item.id));
    const hasTodayEvidence = evidences.some((row) => getEvidenceDateKey(row.titulo) === targetDate && isValidHttpUrl(row.arquivoUrl));
    if (hasTodayEvidence) {
      skippedResults.push({ insertionId: item.id, campaignName: item.campanhaName, status: "skipped", reason: "Print do dia já existe" });
      continue;
    }
    targets.push({ insertionId: item.id, targetDate, captureAt: captureAt ?? buildRetroCaptureAt(targetDate, item.id) });
  }

  const runnerResult = targets.length
    ? await printRunner.runNow(buildPrintRunnerPayload("capture-proof-batch", targets, {
      competencia: competencia ?? null,
      siteId: siteId ?? null,
      source: "adops-ui",
    }))
    : null;
  const results = [
    ...skippedResults,
    ...((runnerResult?.items ?? []).map((item) => ({
      insertionId: item.insertionId,
      campaignName: candidates.find((candidate) => candidate.id === item.insertionId)?.campanhaName ?? null,
      status: item.status,
      uploadedUrl: item.uploadedUrl ?? null,
      error: item.error,
      reason: item.reason,
    }))),
  ];

  const auditPayload = {
    date: targetDate,
    totalCandidates: candidates.length,
    ok: results.filter((item) => item.status === "ok").length,
    error: results.filter((item) => item.status === "error").length,
    results,
  };

  res.json(auditPayload);
});

router.post("/insertions/capture-proof/backfill-overdue", async (req, res): Promise<void> => {
  const competencia = typeof req.body?.competencia === "string" ? req.body.competencia : undefined;
  const siteId = typeof req.body?.siteId === "number" ? req.body.siteId : undefined;
  const insertionId = typeof req.body?.insertionId === "number" ? req.body.insertionId : undefined;
  const { totalCandidates, totalJobs, totalSkipped, jobs, skipped } = await buildBackfillPreview({ competencia, siteId, insertionId });

  const runnerResult = jobs.length
    ? await printRunner.runNow(buildPrintRunnerPayload(
      "capture-proof-backfill",
      jobs.map((job) => ({
        insertionId: job.insertionId,
        targetDate: job.targetDate,
        captureAt: job.captureAt,
      })),
      { competencia: competencia ?? null, siteId: siteId ?? null, source: "adops-ui" },
    ))
    : null;
  const results = (runnerResult?.items ?? []).map((item) => ({
    insertionId: item.insertionId,
    campaignName: jobs.find((job) => job.insertionId === item.insertionId && job.targetDate === item.targetDate)?.campaignName ?? null,
    targetDate: item.targetDate,
    captureAt: item.captureAt ?? "",
    status: item.status === "ok" ? "ok" : "error",
    uploadedUrl: item.uploadedUrl ?? null,
    error: item.error,
  }));

  res.json({
    ok: true,
    competencia: competencia ?? null,
    siteId: siteId ?? null,
    insertionId: insertionId ?? null,
    totalCandidates,
    totalJobs,
    totalSkipped,
    generated: results.filter((item) => item.status === "ok").length,
    errors: results.filter((item) => item.status === "error").length,
    results,
    skipped,
  });
});

router.post("/insertions/capture-proof/backfill-overdue/jobs", async (req, res): Promise<void> => {
  const competencia = typeof req.body?.competencia === "string" ? req.body.competencia : undefined;
  const siteId = typeof req.body?.siteId === "number" ? req.body.siteId : undefined;
  const insertionId = typeof req.body?.insertionId === "number" ? req.body.insertionId : undefined;
  const preview = await buildBackfillPreview({ competencia, siteId, insertionId });
  const jobPayload = buildPrintRunnerPayload(
    "capture-proof-backfill",
    preview.jobs.map((job) => ({
      insertionId: job.insertionId,
      targetDate: job.targetDate,
      captureAt: job.captureAt,
    })),
    { competencia: competencia ?? null, siteId: siteId ?? null, source: "adops-ui" },
  );
  const { jobId } = await printRunner.enqueue(jobPayload);
  await printRunner.updateMeta(jobId, {
    competencia: competencia ?? null,
    siteId: siteId ?? null,
    insertionId: insertionId ?? null,
    totalCandidates: preview.totalCandidates,
    totalJobs: preview.totalJobs,
    totalSkipped: preview.totalSkipped,
    skipped: preview.skipped,
    grouped: preview.grouped,
  });

  res.status(202).json({
    ok: true,
    jobId,
    preview: {
      totalCandidates: preview.totalCandidates,
      totalJobs: preview.totalJobs,
      totalSkipped: preview.totalSkipped,
      grouped: preview.grouped,
    },
  });
});

router.get("/insertions/capture-proof/backfill-overdue/jobs/:jobId", async (req, res): Promise<void> => {
  const [job, meta] = await Promise.all([
    printRunner.get(req.params.jobId),
    db.query.printJobsTable.findFirst({ where: eq(printJobsTable.id, req.params.jobId) }),
  ]);
  const storedMeta = (meta?.meta ?? null) as null | {
    competencia: string | null;
    siteId: number | null;
    insertionId: number | null;
    totalCandidates: number;
    totalJobs: number;
    totalSkipped: number;
    skipped: Array<{ insertionId: number; campaignName: string | null; targetDate: string; reason: string }>;
    grouped: Array<{
      insertionId: number;
      campaignName: string | null;
      siteSigla: string | null;
      localFormato: string | null;
      periodoInicio: string | null;
      periodoFim: string | null;
      totalMissing: number;
      sampleDates: string[];
    }>;
  };
  if (!job || !storedMeta) {
    res.status(404).json({ error: "Lote não encontrado." });
    return;
  }
  const counts = summarizeRunnerItems(job.items);
  res.json({
    ...job,
    competencia: storedMeta.competencia,
    siteId: storedMeta.siteId,
    insertionId: storedMeta.insertionId,
    totalCandidates: storedMeta.totalCandidates,
    totalJobs: storedMeta.totalJobs,
    totalSkipped: storedMeta.totalSkipped,
    generated: counts.ok,
    errors: counts.error,
    skipped: storedMeta.skipped,
    grouped: storedMeta.grouped,
    results: job.items.map((item) => ({
      insertionId: item.insertionId,
      campaignName: previewCampaignName(storedMeta.grouped, item.insertionId),
      targetDate: item.targetDate,
      captureAt: item.captureAt ?? "",
      status: item.status === "ok" ? "ok" : "error",
      uploadedUrl: item.uploadedUrl ?? null,
      error: item.error,
    })),
  });
});

router.post("/insertions/bulk-update", async (req, res): Promise<void> => {
  const parsed = BulkUpdateInsertionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ids, updates } = parsed.data;
  if (ids.length === 0) {
    res.json({ updated: 0 });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.siteId !== undefined) updateData.siteId = updates.siteId;
  if (updates.localFormato !== undefined) updateData.localFormato = updates.localFormato;
  if (updates.localFormatoNormalizado !== undefined) updateData.localFormatoNormalizado = updates.localFormatoNormalizado;
  if (updates.periodoInicio !== undefined) updateData.periodoInicio = updates.periodoInicio;
  if (updates.periodoFim !== undefined) updateData.periodoFim = updates.periodoFim;
  if (updates.periodoOriginal !== undefined) updateData.periodoOriginal = updates.periodoOriginal;
  if (updates.statusNormalizado !== undefined) updateData.statusNormalizado = updates.statusNormalizado;
  if (updates.bannerPublicadoNoSite != null) updateData.bannerPublicadoNoSite = updates.bannerPublicadoNoSite;
  if (updates.printGerado != null) updateData.printGerado = updates.printGerado;
  if (updates.processoEnviadoAgencia != null) updateData.processoEnviadoAgencia = updates.processoEnviadoAgencia;
  if (updates.docsEnviados != null) updateData.docsEnviados = updates.docsEnviados;
  if (updates.dataEnvioAgencia !== undefined) updateData.dataEnvioAgencia = updates.dataEnvioAgencia;
  if (updates.mediaUrl !== undefined) updateData.mediaUrl = updates.mediaUrl;
  if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;

  const sample = ids.length > 0
    ? (await db.select().from(insertionsTable).where(eq(insertionsTable.id, ids[0]!)))[0]
    : null;
  if (sample) {
    const merged = { ...sample, ...updateData };
    updateData.atrasado = computeAtrasado({
      periodoFim: merged.periodoFim as string | null,
      processoEnviadoAgencia: merged.processoEnviadoAgencia as boolean,
      statusNormalizado: merged.statusNormalizado as string,
    });
  }

  const updated = await db.update(insertionsTable).set(updateData).where(inArray(insertionsTable.id, ids)).returning();

  res.json({ updated: updated.length });
});

router.post("/insertions", async (req, res): Promise<void> => {
  const parsed = CreateInsertionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertData = {
    campanhaId: parsed.data.campanhaId,
    siteId: parsed.data.siteId ?? null,
    localFormato: parsed.data.localFormato ?? null,
    localFormatoNormalizado: parsed.data.localFormatoNormalizado ?? null,
    periodoInicio: parsed.data.periodoInicio ?? null,
    periodoFim: parsed.data.periodoFim ?? null,
    periodoOriginal: parsed.data.periodoOriginal ?? null,
    statusLegado: parsed.data.statusLegado ?? null,
    statusNormalizado: parsed.data.statusNormalizado,
    bannerPublicadoNoSite: parsed.data.bannerPublicadoNoSite ?? false,
    printGerado: parsed.data.printGerado ?? false,
    processoEnviadoAgencia: parsed.data.processoEnviadoAgencia ?? false,
    docsEnviados: parsed.data.docsEnviados ?? false,
    dataEnvioAgencia: parsed.data.dataEnvioAgencia ?? null,
    mediaUrl: parsed.data.mediaUrl ?? null,
    observacoes: parsed.data.observacoes ?? null,
    atrasado: false,
  };

  insertData.atrasado = computeAtrasado(insertData);

  const [ins] = await db.insert(insertionsTable).values(insertData).returning();
  const enriched = await enrichInsertion(ins);
  res.status(201).json(enriched);
});

router.get("/insertions/:id", async (req, res): Promise<void> => {
  const params = GetInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ins] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!ins) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const enriched = await enrichInsertion(ins);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, ins.id)).orderBy(evidencesTable.criadoEm);

  res.json({
    ...enriched,
    evidences,
    auditSummary: await buildInsertionAuditSummary(enriched, evidences),
  });
});

router.post("/insertions/:id/capture-proof/jobs", async (req, res): Promise<void> => {
  const params = GetInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [insertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!insertion) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const targetDate = typeof req.body?.date === "string"
    ? req.body.date
    : typeof req.body?.captureAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(req.body.captureAt)
      ? req.body.captureAt.slice(0, 10)
      : formatIsoDate(new Date());
  const captureAt = typeof req.body?.captureAt === "string"
    ? req.body.captureAt
    : resolveRegenerationCaptureAt(targetDate, params.data.id);
  if (rejectCaptureAtOutsideWindow(captureAt, res)) return;

  const checklist = await resolveAuditChecklist({ insertionId: params.data.id, date: targetDate });
  if (!checklist.ok) {
    res.status(422).json({ error: "Checklist de auditoria não resolvido.", date: targetDate, checklist });
    return;
  }

  const candidateOnly = req.body?.candidate === true || req.body?.candidate === "true";
  const promoteCandidate = candidateOnly && (req.body?.promote === true || req.body?.promote === "true");
  const forceCapture = req.body?.force === true || req.body?.force === "true";
  const requestedIdempotencyKey = typeof req.headers["idempotency-key"] === "string"
    ? req.headers["idempotency-key"].trim()
    : "";
  const idempotencyKey = requestedIdempotencyKey || crypto.createHash("sha256")
    .update(JSON.stringify({ insertionId: params.data.id, targetDate, captureAt, candidateOnly, promoteCandidate }))
    .digest("hex");
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
    res.status(400).json({ error: "Idempotency-Key inválida." });
    return;
  }

  const [existingJob] = await db.select({ id: printJobsTable.id, status: printJobsTable.status })
    .from(printJobsTable)
    .where(sql`${printJobsTable.payload} ->> 'idempotencyKey' = ${idempotencyKey}`)
    .orderBy(desc(printJobsTable.createdAt))
    .limit(1);
  if (existingJob) {
    res.json({ ok: true, duplicate: true, jobId: existingJob.id, status: existingJob.status, date: targetDate });
    return;
  }

  const payload = {
    ...buildPrintRunnerPayload(
      "capture-proof-single",
      [{
        insertionId: params.data.id,
        targetDate,
        captureAt,
        replaceExisting: req.body?.replace === true || req.body?.replace === "true" || promoteCandidate || forceCapture,
        candidateOnly,
        promoteCandidate,
      }],
      { competencia: null, siteId: insertion.siteId ?? null, source: "api" },
    ),
    idempotencyKey,
  };
  const { jobId } = await printRunner.enqueue(payload);
  res.status(202).json({ ok: true, duplicate: false, jobId, status: "queued", date: targetDate });
});

router.get("/insertions/:id/capture-proof/jobs/:jobId", async (req, res): Promise<void> => {
  const params = GetInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const job = await printRunner.get(req.params.jobId);
  if (!job || job.items.some((item) => item.insertionId !== params.data.id)) {
    res.status(404).json({ error: "Job de captura não encontrado." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(job);
});

router.post("/insertions/:id/capture-proof", async (req, res): Promise<void> => {
  const params = GetInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ins] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!ins) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const targetDate = typeof req.body?.date === "string"
    ? req.body.date
    : typeof req.body?.captureAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(req.body.captureAt)
      ? req.body.captureAt.slice(0, 10)
      : formatIsoDate(new Date());
  const captureAt = typeof req.body?.captureAt === "string" ? req.body.captureAt : resolveRegenerationCaptureAt(targetDate, params.data.id);
  if (rejectCaptureAtOutsideWindow(captureAt, res)) return;
  const resolvedChecklist = await resolveAuditChecklist({ insertionId: params.data.id, date: targetDate });
  if (!resolvedChecklist.ok) {
    res.status(422).json({
      error: "Checklist de auditoria não resolvido.",
      date: targetDate,
      checklist: resolvedChecklist,
    });
    return;
  }
  const replaceExisting = req.body?.replace === true || req.body?.replace === "true";
  const candidateOnly = req.body?.candidate === true || req.body?.candidate === "true";
  const promoteCandidate = candidateOnly && (req.body?.promote === true || req.body?.promote === "true");
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, params.data.id));
  const existingEvidence = evidences.find((row) => getEvidenceDateKey(row.titulo) === targetDate && isValidHttpUrl(row.arquivoUrl)) ?? null;
  if (existingEvidence && !replaceExisting && !candidateOnly) {
    const [fresh] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
    const enriched = fresh ? await enrichInsertion(fresh) : null;
    res.json({
      ok: true,
      skipped: true,
      reason: "Print do dia já existe e não será sobrescrito automaticamente.",
      date: targetDate,
      capture: { uploadedUrl: existingEvidence.arquivoUrl, evidenceId: existingEvidence.id },
      insertion: enriched ? { ...enriched, evidences } : null,
    });
    return;
  }

  try {
    const runnerResult = await printRunner.runNow(buildPrintRunnerPayload(
      "capture-proof-single",
      [{
        insertionId: params.data.id,
        targetDate,
        captureAt: captureAt ?? null,
        replaceExisting,
        candidateOnly,
        promoteCandidate,
      }],
      { competencia: null, siteId: ins.siteId ?? null, source: "adops-ui" },
    ));
    const result = runnerResult.items[0];
    if (!result || result.status !== "ok") {
      throw new Error(result?.error ?? "Falha ao gerar print semi-automatico.");
    }
    if (candidateOnly) {
      if (result.retroContentProof?.status !== "approved") {
        res.status(422).json({
          error: "Candidato retroativo reprovado na prova editorial.",
          date: targetDate,
          candidate: result,
        });
        return;
      }
      res.json({
        ok: true,
        candidateOnly: true,
        promoted: promoteCandidate,
        date: targetDate,
        candidate: result,
        currentEvidencePreserved: !promoteCandidate && Boolean(existingEvidence),
      });
      return;
    }
    const freshMetadata = await loadCaptureMetadataForAudit(params.data.id, targetDate);
    const checklistValidation = await validateAuditChecklist({
      insertionId: params.data.id,
      date: targetDate,
      metadata: freshMetadata,
    });
    if (!checklistValidation.approved) {
      res.status(422).json({
        error: "Print gerado, mas reprovado no checklist de auditoria.",
        date: targetDate,
        capture: result,
        checklistValidation,
      });
      return;
    }
    const [fresh] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
    const enriched = fresh ? await enrichInsertion(fresh) : null;
    const latestEvidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, params.data.id)).orderBy(evidencesTable.criadoEm);

    res.json({
      ok: true,
      capture: result,
      checklistValidation,
      insertion: enriched ? { ...enriched, evidences: latestEvidences } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao gerar print semi-automatico.", details: message });
  }
});

router.patch("/insertions/:id", async (req, res): Promise<void> => {
  const params = UpdateInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInsertionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.siteId !== undefined) updateData.siteId = parsed.data.siteId;
  if (parsed.data.localFormato !== undefined) updateData.localFormato = parsed.data.localFormato;
  if (parsed.data.localFormatoNormalizado !== undefined) updateData.localFormatoNormalizado = parsed.data.localFormatoNormalizado;
  if (parsed.data.periodoInicio !== undefined) updateData.periodoInicio = parsed.data.periodoInicio;
  if (parsed.data.periodoFim !== undefined) updateData.periodoFim = parsed.data.periodoFim;
  if (parsed.data.periodoOriginal !== undefined) updateData.periodoOriginal = parsed.data.periodoOriginal;
  if (parsed.data.statusNormalizado !== undefined) updateData.statusNormalizado = parsed.data.statusNormalizado;
  if (parsed.data.bannerPublicadoNoSite != null) updateData.bannerPublicadoNoSite = parsed.data.bannerPublicadoNoSite;
  if (parsed.data.printGerado != null) updateData.printGerado = parsed.data.printGerado;
  if (parsed.data.processoEnviadoAgencia != null) updateData.processoEnviadoAgencia = parsed.data.processoEnviadoAgencia;
  if (parsed.data.docsEnviados != null) updateData.docsEnviados = parsed.data.docsEnviados;
  if (parsed.data.dataEnvioAgencia !== undefined) updateData.dataEnvioAgencia = parsed.data.dataEnvioAgencia;
  if (parsed.data.mediaUrl !== undefined) updateData.mediaUrl = parsed.data.mediaUrl;
  if (parsed.data.observacoes !== undefined) updateData.observacoes = parsed.data.observacoes;

  const merged = { ...existing, ...updateData };
  updateData.atrasado = computeAtrasado({
    periodoFim: merged.periodoFim as string | null,
    processoEnviadoAgencia: merged.processoEnviadoAgencia as boolean,
    statusNormalizado: merged.statusNormalizado as string,
  });

  const expectedUpdatedAt = parsed.data.expectedUpdatedAt instanceof Date
    ? parsed.data.expectedUpdatedAt
    : parsed.data.expectedUpdatedAt ? new Date(parsed.data.expectedUpdatedAt) : null;
  const updateWhere = expectedUpdatedAt
    ? and(eq(insertionsTable.id, params.data.id), eq(insertionsTable.updatedAt, expectedUpdatedAt))
    : eq(insertionsTable.id, params.data.id);
  const [updated] = await db.update(insertionsTable).set(updateData).where(updateWhere).returning();
  if (!updated) {
    res.status(409).json({ error: "Insertion changed", details: "A inserção foi alterada depois do preflight; releia as fontes e tente novamente." });
    return;
  }
  const enriched = await enrichInsertion(updated);
  res.json(enriched);
});

router.delete("/insertions/:id", async (req, res): Promise<void> => {
  const params = DeleteInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
