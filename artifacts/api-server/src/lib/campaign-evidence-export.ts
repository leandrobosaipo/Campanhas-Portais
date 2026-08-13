import crypto from "node:crypto";

export class CampaignEvidenceExportConflict extends Error {
  readonly statusCode = 409;
}

function normalizePi(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCompetencia(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function parseCampaignEvidenceIdentity(input: { piCodigo?: unknown; competencia?: unknown }) {
  const piCodigo = normalizePi(input?.piCodigo);
  const competencia = normalizeCompetencia(input?.competencia);
  if (!piCodigo) throw new CampaignEvidenceExportConflict("A campanha precisa de PI canônica para gerar o pacote completo.");
  if (!competencia) throw new CampaignEvidenceExportConflict("A competência é obrigatória para isolar o pacote da campanha.");
  return { piCodigo, competencia };
}

export function selectCampaignEvidenceInsertions<T extends {
  piCodigo?: unknown;
  competencia?: unknown;
  statusNormalizado?: unknown;
  bannerPublicadoNoSite?: unknown;
  mediaUrl?: unknown;
}>(insertions: T[], identity: { piCodigo: string; competencia: string }) {
  return (insertions || []).filter((item) => (
    normalizePi(item.piCodigo) === identity.piCodigo
    && normalizeCompetencia(item.competencia) === identity.competencia
    && String(item.statusNormalizado || "").trim().toLowerCase() !== "cancelado"
  ));
}

export type CampaignEvidenceReadinessItem = {
  insertionId: number;
  requiredDates: string[];
  evidenceDates: string[];
  invalidDates: string[];
  inaccessibleDates: string[];
  published?: boolean;
  hasMedia?: boolean;
};

export function validateCampaignEvidenceReadiness(items: CampaignEvidenceReadinessItem[]) {
  const missingDates: Array<{ insertionId: number; date: string }> = [];
  const invalidDates: Array<{ insertionId: number; date: string }> = [];
  const inaccessibleDates: Array<{ insertionId: number; date: string }> = [];
  const operationalBlockers: Array<{ insertionId: number; reason: string }> = [];
  for (const item of items || []) {
    if (item.published === false) operationalBlockers.push({ insertionId: item.insertionId, reason: "not_published" });
    if (item.hasMedia === false) operationalBlockers.push({ insertionId: item.insertionId, reason: "missing_media" });
    const evidenceDates = new Set(item.evidenceDates || []);
    for (const date of item.requiredDates || []) {
      if (!evidenceDates.has(date)) missingDates.push({ insertionId: item.insertionId, date });
    }
    invalidDates.push(...(item.invalidDates || []).map((date) => ({ insertionId: item.insertionId, date })));
    inaccessibleDates.push(...(item.inaccessibleDates || []).map((date) => ({ insertionId: item.insertionId, date })));
  }
  return {
    ready: missingDates.length === 0 && invalidDates.length === 0 && inaccessibleDates.length === 0 && operationalBlockers.length === 0,
    missingDates,
    invalidDates,
    inaccessibleDates,
    operationalBlockers,
  };
}

export function buildCampaignEvidenceExportIdempotencyKey(input: {
  piCodigo: string;
  competencia: string;
  imageMaxWidth: number;
  imageQuality: number;
  evidences: Array<{ insertionId: number; evidenceId: number; portal: string; date: string }>;
}) {
  const identity = parseCampaignEvidenceIdentity(input);
  const evidences = (input.evidences || []).map((item) => ({
    insertionId: Number(item.insertionId),
    evidenceId: Number(item.evidenceId),
    portal: String(item.portal || "").trim().toUpperCase(),
    date: String(item.date || ""),
  })).sort((left, right) => (
    left.portal.localeCompare(right.portal)
    || left.date.localeCompare(right.date)
    || left.insertionId - right.insertionId
    || left.evidenceId - right.evidenceId
  ));
  const imageMaxWidth = Number(input.imageMaxWidth);
  const imageQuality = Number(input.imageQuality);
  const digest = crypto.createHash("sha256").update(JSON.stringify({ ...identity, imageMaxWidth, imageQuality, variant: "web", mode: "prints-only", evidences })).digest("hex");
  return `campaign-evidence-v1-${digest}`;
}

export function buildPendingPublicationView<T extends {
  date: string;
  generatedAt: string;
  summary: { needsPublication: number; needsEvidence: number };
  items: Array<{ requiredActions?: string[] }>;
  upcomingItems?: unknown[];
}>(input: T) {
  const nextCheckAt = new Date(Date.parse(input.generatedAt) + 24 * 60 * 60 * 1000).toISOString();
  const items = input.items.filter((item) => (
    item.requiredActions?.includes("publish_on_site")
    || item.requiredActions?.includes("generate_evidence")
  )).map((item: any) => {
    const published = item.adops?.bannerPublicadoNoSite === true && Boolean(item.adops?.mediaUrl);
    const canonicalPi = String(item.sourceIdentity?.canonicalPi ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const authoritativePiInPdf = Boolean(canonicalPi) && (item.sourceIdentity?.sources?.drivePdfPiCandidates ?? [])
      .map((value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, ""))
      .includes(canonicalPi);
    const awaitingAuthoritativePi = !published
      && item.sourceIdentity?.decision === "insufficient_data"
      && item.drive?.mediaStatus === "candidate_found"
      && item.drive?.documentStatus === "missing";
    const readyForPreflight = !published
      && item.sourceIdentity?.decision === "confirmed"
      && item.drive?.mediaStatus === "candidate_found"
      && item.drive?.documentStatus === "candidate_found"
      && authoritativePiInPdf
      && !item.adops?.mediaUrl;
    const readyForPublication = !published
      && item.sourceIdentity?.decision === "confirmed"
      && item.drive?.documentStatus === "candidate_found"
      && authoritativePiInPdf
      && Boolean(item.adops?.mediaUrl);
    const resolutionStatus = published
      ? "published"
      : awaitingAuthoritativePi
        ? "awaiting_authoritative_pi"
        : readyForPreflight
          ? "ready_for_preflight"
          : readyForPublication
            ? "ready_for_publication"
            : "failed_retryable";
    const resolutionReason = resolutionStatus === "published"
      ? "Inserção já publicada; permanecem somente as ações operacionais listadas."
      : resolutionStatus === "awaiting_authoritative_pi"
        ? "Aguardando PI/PDF autoritativa antes de publicar a inserção existente."
        : resolutionStatus === "ready_for_preflight"
          ? "Identidade confirmada e mídia candidata pronta para validação."
          : resolutionStatus === "ready_for_publication"
            ? "Identidade e mídia canônica confirmadas; publicação pode prosseguir."
            : item.sourceIdentity?.reason ?? "Pendência deve ser reavaliada após atualização das fontes.";
    const resumeAction = resolutionStatus === "published"
      ? (item.requiredActions?.includes("generate_evidence") ? "generate_evidence" : "none")
      : resolutionStatus === "awaiting_authoritative_pi"
        ? "await_authoritative_pi_pdf"
        : resolutionStatus === "ready_for_preflight"
          ? "run_drive_pi_preflight"
          : resolutionStatus === "ready_for_publication"
            ? "publish_existing_insertion"
            : "retry_reconcile";
    return {
      ...item,
      resolutionStatus,
      resolutionReason,
      lastCheckedAt: input.generatedAt,
      nextCheckAt: resolutionStatus === "published" ? null : nextCheckAt,
      resumeAction,
    };
  });
  return {
    date: input.date,
    generatedAt: input.generatedAt,
    summary: {
      pending: items.length,
      needsPublication: items.filter((item) => item.requiredActions?.includes("publish_on_site")).length,
      needsEvidence: items.filter((item) => item.requiredActions?.includes("generate_evidence")).length,
    },
    items,
    upcomingItems: input.upcomingItems ?? [],
  };
}

export function parseCampaignEvidenceBatch(input: {
  competencia?: unknown;
  campaigns?: Array<{ piCodigo?: unknown }>;
  imageMaxWidth?: unknown;
  imageQuality?: unknown;
}) {
  const competencia = normalizeCompetencia(input.competencia);
  if (!competencia) throw new CampaignEvidenceExportConflict("A competência é obrigatória para gerar o lote de campanhas.");
  const piCodes = Array.from(new Set((input.campaigns ?? []).map((item) => normalizePi(item.piCodigo)).filter(Boolean)));
  if (!piCodes.length) throw new CampaignEvidenceExportConflict("Informe ao menos uma campanha com PI canônica.");
  if (piCodes.length > 100) throw new CampaignEvidenceExportConflict("O lote aceita no máximo 100 campanhas.");
  return {
    competencia,
    campaigns: piCodes.map((piCodigo) => ({ piCodigo })),
    mode: "prints-only" as const,
    variant: "web" as const,
    imageMaxWidth: Math.max(800, Math.min(2560, Number.parseInt(String(input.imageMaxWidth ?? "1600"), 10) || 1600)),
    imageQuality: Math.max(45, Math.min(90, Number.parseInt(String(input.imageQuality ?? "72"), 10) || 72)),
  };
}

export function buildMonthlyEvidenceSource<T extends {
  version: string;
  date: string;
  generatedAt: string;
  sheet: unknown;
  summary: unknown;
  items: Array<Record<string, any>>;
  upcomingItems?: Array<Record<string, any>>;
}>(input: T) {
  const compactItem = (item: Record<string, any>) => ({
    campaignName: item.campaignName,
    piCodigo: item.piCodigo,
    siteSigla: item.siteSigla,
    period: item.period,
    format: item.format,
    sheetSource: item.sheetSource,
    sourceIdentity: item.sourceIdentity,
    adops: item.adops,
    evidence: item.evidence,
    drive: item.drive ? {
      status: item.drive.status,
      source: item.drive.source,
      folderId: item.drive.folderId,
      folderPath: item.drive.folderPath,
      folderItemCount: item.drive.folderItemCount ?? [
        ...(item.drive.mediaFiles ?? []),
        ...(item.drive.pdfFiles ?? []),
        ...(item.drive.textFiles ?? []),
        ...(item.drive.otherFiles ?? []),
      ].length,
      inventoryScanId: item.drive.inventoryScanId ?? null,
      resolutionReason: item.drive.resolutionReason ?? item.drive.status,
      mediaStatus: item.drive.mediaFiles?.length ? "candidate_found" : "missing",
      documentStatus: item.drive.pdfFiles?.length ? "candidate_found" : "missing",
    } : null,
    requiredActions: item.requiredActions ?? [],
    blockingIssues: item.blockingIssues ?? [],
  });
  return {
    version: input.version,
    date: input.date,
    generatedAt: input.generatedAt,
    sheet: input.sheet,
    summary: input.summary,
    items: input.items.map(compactItem),
    upcomingItems: (input.upcomingItems ?? []).map(compactItem),
  };
}
