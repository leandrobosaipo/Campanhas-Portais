import crypto from "node:crypto";
import adrotateSites from "../../../../config/adrotate-sites.json";

export function resolveCompositePublicationTarget(siteSigla: unknown, localFormat: unknown) {
  const site = String(siteSigla ?? "").trim().toUpperCase();
  const format = String(localFormat ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const siteConfig = (adrotateSites as Record<string, any>)[site];
  const matches = (siteConfig?.formatMappings ?? []).filter((mapping: any) => (
    mapping?.operationalMediaProfile
    && (mapping?.aliases ?? []).some((alias: unknown) => String(alias ?? "").trim().toUpperCase().replace(/\s+/g, " ") === format)
  ));
  if (matches.length !== 1) return null;
  return {
    groupId: Number(matches[0].groupId),
    ...JSON.parse(JSON.stringify(matches[0].operationalMediaProfile)),
  };
}

export function isCompositePublicationTarget(siteSigla: unknown, localFormat: unknown) {
  return Boolean(resolveCompositePublicationTarget(siteSigla, localFormat));
}

export class CampaignEvidenceExportConflict extends Error {
  readonly statusCode = 409;
}

export function normalizeCampaignPi(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function normalizeCompetencia(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

const COMPETENCIA_MONTHS = new Map([
  ["JANEIRO", 1], ["FEVEREIRO", 2], ["MARCO", 3], ["ABRIL", 4],
  ["MAIO", 5], ["JUNHO", 6], ["JULHO", 7], ["AGOSTO", 8],
  ["SETEMBRO", 9], ["OUTUBRO", 10], ["NOVEMBRO", 11], ["DEZEMBRO", 12],
]);

export function normalizeCompetenciaMonthKey(value: unknown) {
  const normalized = normalizeCompetencia(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
  let match = normalized.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  if (match) return `${match[2]}-${String(Number(match[1])).padStart(2, "0")}`;
  match = normalized.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
  match = normalized.match(/^([A-Z]+)\/(\d{4})$/);
  const month = match ? COMPETENCIA_MONTHS.get(match[1]) : null;
  return match && month ? `${match[2]}-${String(month).padStart(2, "0")}` : null;
}

export function parseCampaignEvidenceIdentity(input: { piCodigo?: unknown; competencia?: unknown }) {
  const piCodigo = normalizeCampaignPi(input?.piCodigo);
  const competencia = normalizeCompetenciaMonthKey(input?.competencia);
  if (!piCodigo) throw new CampaignEvidenceExportConflict("A campanha precisa de PI canônica para gerar o pacote completo.");
  if (!competencia) throw new CampaignEvidenceExportConflict("A competência mensal válida é obrigatória para isolar o pacote da campanha.");
  return { piCodigo, competencia };
}

export function selectCampaignEvidenceInsertions<T extends {
  piCodigo?: unknown;
  competencia?: unknown;
  statusNormalizado?: unknown;
  bannerPublicadoNoSite?: unknown;
  mediaUrl?: unknown;
}>(insertions: T[], identity: { piCodigo: string; competencia: string }) {
  const expectedMonth = normalizeCompetenciaMonthKey(identity.competencia);
  return (insertions || []).filter((item) => (
    normalizeCampaignPi(item.piCodigo) === identity.piCodigo
    && expectedMonth !== null
    && normalizeCompetenciaMonthKey(item.competencia) === expectedMonth
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
  const operationalKey = (item: any) => JSON.stringify([
    String(item?.sheetSource?.sheetName ?? "").trim().toUpperCase(),
    String(item?.siteSigla ?? "").trim().toUpperCase(),
    String(item?.campaignName ?? "").trim().toUpperCase(),
    String(item?.period?.start ?? ""),
    String(item?.period?.end ?? ""),
    String(item?.format?.normalized ?? item?.format?.sheet ?? "").trim().toUpperCase(),
  ]);
  const operationalCounts = new Map<string, number>();
  for (const item of input.items as any[]) {
    const key = operationalKey(item);
    operationalCounts.set(key, (operationalCounts.get(key) ?? 0) + 1);
  }
  const items = input.items.filter((item: any) => (
    item.requiredActions?.includes("publish_on_site")
    || item.requiredActions?.includes("generate_evidence")
    || item.publicationHealth?.status === "blocked_upstream"
  )).map((item: any) => {
    const published = Boolean(item.adops?.mediaUrl) && (item.publicationHealth
      ? item.publicationHealth.status === "ok"
      : item.adops?.bannerPublicadoNoSite === true || item.adops?.publicConfirmation === "confirmed");
    const canonicalPi = String(item.sourceIdentity?.canonicalPi ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const authoritativePiInPdf = Boolean(canonicalPi) && (item.sourceIdentity?.sources?.drivePdfPiCandidates ?? [])
      .map((value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, ""))
      .includes(canonicalPi);
    const mediaFiles = Array.isArray(item.drive?.mediaFiles) ? item.drive.mediaFiles : [];
    const pdfFiles = Array.isArray(item.drive?.pdfFiles) ? item.drive.pdfFiles : [];
    const textFiles = Array.isArray(item.drive?.textFiles) ? item.drive.textFiles : [];
    const destinationMode = textFiles.length === 0 ? "none" : textFiles.length === 1 ? "https_candidate" : "ambiguous";
    const destinationStatusText = destinationMode === "none"
      ? "Banner informativo, sem link"
      : destinationMode === "https_candidate"
        ? "Link encontrado; será validado antes da publicação"
        : "Foram encontrados links diferentes";
    const operationalMediaProfile = resolveCompositePublicationTarget(
      item.siteSigla,
      item.format?.normalized ?? item.format?.adops ?? item.format?.sheet,
    );
    const allowedMediaFormats = new Set((operationalMediaProfile?.formats ?? []).map((value: unknown) => String(value).toUpperCase()));
    const operationalMediaFiles = mediaFiles.filter((file: any) => {
      const value = `${file?.mimeType ?? ""} ${file?.name ?? ""}`.toUpperCase();
      if (!value.trim()) return true;
      return [...allowedMediaFormats].some((format) => value.includes(format));
    });
    const gates = {
      sheetUnique: operationalCounts.get(operationalKey(item)) === 1,
      insertionUnique: item.adops?.status === "matched"
        && Number(item.adops?.campaignId || 0) > 0
        && Number(item.adops?.insertionId || 0) > 0
        && Number(item.adops?.operationalMatchCount ?? 1) === 1,
      approvedOperationalTarget: isCompositePublicationTarget(item.siteSigla, item.format?.normalized ?? item.format?.adops ?? item.format?.sheet),
      folderUnique: item.drive?.status === "matched" && Boolean(item.drive?.folderId) && Boolean(item.drive?.folderPath),
      mediaUnique: item.drive?.mediaStatus === "candidate_found" && item.drive?.mediaMatchesFormat === true && operationalMediaFiles.length === 1,
      destinationPolicyValid: textFiles.length <= 1,
      destinationCandidateUnique: textFiles.length === 1,
      campaignConsistent: !(item.blockingIssues ?? []).some((issue: unknown) => /nome da campanha diverge/i.test(String(issue))),
      portalConsistent: !item.requiredActions?.includes("review_site_divergence"),
      periodConsistent: !item.requiredActions?.includes("review_period_divergence"),
      formatConsistent: !item.requiredActions?.includes("review_format_divergence"),
      sourceUnambiguous: item.sourceIdentity?.decision !== "needs_confirmation" && item.drive?.status !== "ambiguous",
    };
    const gatesReady = Object.entries(gates)
      .filter(([name]) => name !== "destinationCandidateUnique")
      .every(([, value]) => value);
    const operationalReady = !published
      && String(item.siteSigla || "").trim().toUpperCase() === "PERRENGUE"
      && item.sourceIdentity?.decision === "insufficient_data"
      && !canonicalPi
      && item.drive?.documentStatus === "missing"
      && (item.sourceIdentity?.sources?.drivePdfPiCandidates ?? []).length === 0
      && !authoritativePiInPdf
      && gatesReady;
    const normalizeSourcePi = (value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const sourcePis = item.sourceIdentity?.sources ?? {};
    const compositeSourcesAgree = Boolean(canonicalPi)
      && normalizeSourcePi(sourcePis.sheetPi) === canonicalPi
      && normalizeSourcePi(sourcePis.adopsPi) === canonicalPi
      && Array.isArray(sourcePis.driveFolderPiCandidates)
      && sourcePis.driveFolderPiCandidates.length === 1
      && normalizeSourcePi(sourcePis.driveFolderPiCandidates[0]) === canonicalPi
      && Array.isArray(sourcePis.drivePdfPiCandidates)
      && sourcePis.drivePdfPiCandidates.length === 1
      && normalizeSourcePi(sourcePis.drivePdfPiCandidates[0]) === canonicalPi;
    const compositePdfImmutable = pdfFiles.length === 1
      && Number(pdfFiles[0]?.size || 0) > 0
      && /^[a-f0-9]{32}$/i.test(String(pdfFiles[0]?.md5Checksum || ""));
    const compositeReady = !published
      && item.sourceIdentity?.decision === "confirmed"
      && compositeSourcesAgree
      && item.drive?.documentStatus === "candidate_found"
      && compositePdfImmutable
      && gatesReady;
    const fingerprintInput = {
      sheet: item.sheetSource,
      siteSigla: item.siteSigla,
      campaignName: item.campaignName,
      period: item.period,
      format: item.format,
      campaignId: item.adops?.campaignId,
      insertionId: item.adops?.insertionId,
      folderId: item.drive?.folderId,
      folderPath: item.drive?.folderPath,
      inventoryScanId: item.drive?.inventoryScanId,
      expectedPiCodigo: compositeReady ? canonicalPi : null,
      media: operationalMediaFiles.map((file: any) => ({ id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, size: file.size ?? null, md5Checksum: file.md5Checksum ?? null })),
      pdfDocuments: pdfFiles.map((file: any) => ({ id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, size: file.size ?? null, md5Checksum: file.md5Checksum ?? null })),
      destinationDocuments: textFiles.map((file: any) => ({ id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, size: file.size ?? null, md5Checksum: file.md5Checksum ?? null })),
      destinationMode,
      operationalMediaProfile,
    };
    const operationalIdentity = {
      gates,
      fingerprint: crypto.createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex"),
      source: fingerprintInput,
    };
    const awaitingAuthoritativePi = !published
      && item.sourceIdentity?.decision === "insufficient_data"
      && item.drive?.mediaStatus === "candidate_found"
      && item.drive?.documentStatus === "missing"
      && textFiles.length === 0;
    const readyForPreflight = !published
      && item.sourceIdentity?.decision === "confirmed"
      && item.drive?.mediaStatus === "candidate_found"
      && item.drive?.documentStatus === "candidate_found"
      && (!authoritativePiInPdf || !item.adops?.mediaUrl);
    const readyForPublication = !published
      && item.sourceIdentity?.decision === "confirmed"
      && item.drive?.documentStatus === "candidate_found"
      && authoritativePiInPdf
      && Boolean(item.adops?.mediaUrl);
    const publicationStatus = published
      ? "published"
      : operationalReady || compositeReady
        ? "ready_for_publication"
        : awaitingAuthoritativePi
          ? "awaiting_authoritative_pi"
        : readyForPreflight
          ? "ready_for_preflight"
          : readyForPublication
            ? "ready_for_publication"
            : "failed_retryable";
    const identityMode = compositeReady ? "sheet_drive_composite" : authoritativePiInPdf ? "authoritative_pi" : operationalReady ? "operational_identity" : null;
    const commercialIdentityStatus = compositeReady || authoritativePiInPdf ? "confirmed" : "awaiting_authoritative_pi";
    const resolutionReason = publicationStatus === "published"
      ? "Inserção já publicada; permanecem somente as ações operacionais listadas."
      : compositeReady
        ? "Planilha, AdOps e pasta única concordam; PDF, mídia e destino serão validados no preflight vivo."
      : operationalReady
        ? "Identidade operacional única; publicação depende do preflight vivo de mídia e destino."
      : publicationStatus === "awaiting_authoritative_pi"
        ? "Aguardando PI/PDF autoritativa antes de publicar a inserção existente."
        : publicationStatus === "ready_for_preflight"
          ? authoritativePiInPdf
            ? "PI candidata no nome do PDF; conteúdo e mídia aguardam validação no preflight."
            : "PDF e mídia candidatos; o conteúdo do PDF deve confirmar a PI no preflight."
          : publicationStatus === "ready_for_publication"
            ? "Identidade e mídia canônica confirmadas; publicação pode prosseguir."
            : item.sourceIdentity?.reason ?? "Pendência deve ser reavaliada após atualização das fontes.";
    const resumeAction = publicationStatus === "published"
      ? (item.requiredActions?.includes("generate_evidence") ? "generate_evidence" : "none")
      : compositeReady
        ? "run_composite_preflight_and_publish"
      : operationalReady
        ? "run_operational_preflight_and_publish"
      : publicationStatus === "awaiting_authoritative_pi"
        ? "await_authoritative_pi_pdf"
        : publicationStatus === "ready_for_preflight"
          ? "run_drive_pi_preflight"
          : publicationStatus === "ready_for_publication"
            ? "publish_existing_insertion"
            : "retry_reconcile";
    return {
      ...item,
      destinationMode,
      destinationStatusText,
      identityMode,
      commercialIdentityStatus,
      publicationStatus,
      resolutionStatus: publicationStatus,
      resolutionReason,
      operationalIdentity,
      lastCheckedAt: input.generatedAt,
      nextCheckAt: publicationStatus === "published" ? null : nextCheckAt,
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
  const piCodes = Array.from(new Set((input.campaigns ?? []).map((item) => normalizeCampaignPi(item.piCodigo)).filter(Boolean)));
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
    canonicalSelection: item.canonicalSelection ?? null,
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
