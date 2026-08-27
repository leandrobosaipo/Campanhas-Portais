import { eq, sql } from "drizzle-orm";
import {
  campaignsTable,
  db,
  evidencesTable,
  insertionsTable,
  sitesTable,
} from "@workspace/db";
import {
  extractPiDigits,
  loadCurrentSheetCampaigns,
  normalizeForMatch,
  todayInCuiaba,
  type CurrentSheetCampaignRow,
} from "./current-sheet-campaigns";
import {
  driveMediaMatchesFormat,
  findDriveCampaignMedia,
  type DriveCampaignMediaMatch,
} from "./drive-campaign-media";
import { getEvidenceDateKey, parseDateOnly } from "./capture-audit";
import { validateAuditChecklist } from "./audit-checklist";
import { getAdRotateGroupId, getSiteFormatMapping, getSiteIntegration, getSupportedGroupIds, normalizeSiteMediaUrl } from "./adrotate-sites";
import { findCampaignIdentityMatches, isFormatCompatible, selectBestAdopsMatch } from "./campaign-operations-matching";

export const CAMPAIGN_OPERATIONS_VERSION = "campaign-operations-v1" as const;

export type PublicationHealth = {
  status: "ok" | "prepublication_pending" | "blocked_upstream";
  reason: "confirmed" | "drive_media_not_linked" | "media_missing" | "adrotate_relation_missing" | "expected_media_not_observed" | "public_html_not_confirmed" | "duplicate_identity";
  requiredAction: "none" | "resolve_media" | "reconcile_duplicate" | "publish_adrotate" | "verify_publication";
  expectedGroupId: number | null;
  expectedMediaObserved: boolean;
  duplicateInsertionIds: number[];
};

export type EvidenceHealth = {
  status: "complete" | "missing" | "invalid" | "blocked_upstream" | "not_applicable";
  auditedDates: string[];
  missingDates: string[];
  invalidDates: string[];
};

type PublicationHealthInput = {
  inPeriod: boolean;
  mediaUrl: string | null;
  bannerPublicadoNoSite: boolean;
  expectedGroupId: number | null;
  expectedMediaObserved: boolean;
  publicConfirmation: "confirmed" | "reported_only" | "not_published";
  driveMediaAvailable?: boolean;
  duplicateInsertionIds: number[];
};

export function classifyPublicationHealth(input: PublicationHealthInput): PublicationHealth {
  const blockedStatus = input.inPeriod ? "blocked_upstream" : "prepublication_pending";
  const result = (reason: PublicationHealth["reason"], requiredAction: PublicationHealth["requiredAction"]): PublicationHealth => ({
    status: blockedStatus,
    reason,
    requiredAction,
    expectedGroupId: input.expectedGroupId,
    expectedMediaObserved: input.expectedMediaObserved,
    duplicateInsertionIds: input.duplicateInsertionIds,
  });

  if (!input.mediaUrl) return result(input.driveMediaAvailable ? "drive_media_not_linked" : "media_missing", "resolve_media");
  if (!input.expectedGroupId) return result("adrotate_relation_missing", "publish_adrotate");
  if (!input.expectedMediaObserved) return result("expected_media_not_observed", "publish_adrotate");
  if (input.publicConfirmation !== "confirmed") return result("public_html_not_confirmed", "verify_publication");
  if (input.duplicateInsertionIds.length) return result("duplicate_identity", "reconcile_duplicate");
  return {
    status: "ok",
    reason: "confirmed",
    requiredAction: "none",
    expectedGroupId: input.expectedGroupId,
    expectedMediaObserved: input.expectedMediaObserved,
    duplicateInsertionIds: input.duplicateInsertionIds,
  };
}

type RequiredAction =
  | "create_campaign_or_insertion"
  | "locate_or_upload_media"
  | "publish_on_site"
  | "generate_evidence"
  | "review_period_divergence"
  | "review_format_divergence"
  | "review_drive_ambiguity"
  | "confirm_source_identity"
  | "review_live_slot_conflict";

type OperationStatus =
  | "ok"
  | "needs_create_in_adops"
  | "needs_media"
  | "needs_publication"
  | "needs_evidence"
  | "divergent_period"
  | "divergent_format"
  | "drive_missing"
  | "ambiguous_drive_match"
  | "source_conflict"
  | "blocked";

type SuggestedJob = {
  type: "drive_pi_preflight" | "drive_pi_folder" | "print_backfill" | "print_single";
  method: "POST";
  endpoint: string;
  payload: Record<string, unknown>;
};

type MinimalInsertionRow = Pick<
  typeof insertionsTable.$inferSelect,
  | "id"
  | "campanhaId"
  | "siteId"
  | "localFormato"
  | "localFormatoNormalizado"
  | "periodoInicio"
  | "periodoFim"
  | "periodoOriginal"
  | "statusNormalizado"
  | "bannerPublicadoNoSite"
  | "printGerado"
  | "observacoes"
> & {
  mediaUrl: string | null;
};

type MinimalCampaignRow = Pick<typeof campaignsTable.$inferSelect, "id" | "nome" | "piCodigo" | "competencia">;
type MinimalSiteRow = Pick<typeof sitesTable.$inferSelect, "id" | "nome" | "sigla">;

type MinimalEnrichedInsertion = MinimalInsertionRow & {
  campaign: MinimalCampaignRow | null;
  site: MinimalSiteRow | null;
};

export type CampaignOperationItem = {
  version: typeof CAMPAIGN_OPERATIONS_VERSION;
  status: OperationStatus;
  siteSigla: string;
  piCodigo: string;
  campaignName: string;
  period: {
    start: string | null;
    end: string | null;
    original: string;
  };
  format: {
    sheet: string;
    adops: string | null;
    normalized: string;
  };
  sheetSource: {
    sheetName: string;
    blockSite: string;
    rowNumber: number;
  };
  sourceIdentity: SourceIdentityDecision;
  canonicalSelection: {
    insertionId: number | null;
    decision: "confirmed" | "ambiguous" | "missing";
    compatibleInsertionIds: number[];
    reason: string;
    identityEvidence: {
      piCodigo: string;
      siteSigla: string;
      format: string;
      periodStart: string | null;
      periodEnd: string | null;
      mediaUrl: string | null;
    } | null;
  };
  drive: DriveCampaignMediaMatch & {
    mediaMatchesFormat: boolean;
  };
  adops: {
    status: "matched" | "missing" | "ambiguous";
    campaignId: number | null;
    competencia: string | null;
    insertionId: number | null;
    mediaUrl: string | null;
    bannerPublicadoNoSite: boolean | null;
    publicConfirmation: "confirmed" | "reported_only" | "not_published";
    statusNormalizado: string | null;
    matchedBy: "pi_site" | "none";
    operationalMatchCount: number;
  };
  evidence: {
    status: "approved" | "missing" | "invalid" | "missing_or_not_applicable";
    requiredDates: string[];
    auditedDates: string[];
    invalidDates: string[];
    missingDates: string[];
  };
  publicationHealth: PublicationHealth;
  evidenceHealth: EvidenceHealth;
  requiredActions: RequiredAction[];
  blockingIssues: string[];
  suggestedJobs: SuggestedJob[];
};

export type CampaignOperationUpcomingItem = {
  version: typeof CAMPAIGN_OPERATIONS_VERSION;
  siteSigla: string;
  piCodigo: string;
  campaignName: string;
  period: {
    start: string | null;
    end: string | null;
    original: string;
  };
  format: {
    sheet: string;
    adops: string | null;
    normalized: string;
  };
  sheetSource: {
    sheetName: string;
    blockSite: string;
    rowNumber: number;
  };
  sourceIdentity: SourceIdentityDecision;
  drive: DriveCampaignMediaMatch & {
    mediaMatchesFormat: boolean;
  };
  adops: {
    status: "missing" | "matched" | "ambiguous";
    campaignId: number | null;
    insertionId: number | null;
    mediaUrl: string | null;
    bannerPublicadoNoSite: boolean | null;
    publicConfirmation: "confirmed" | "reported_only" | "not_published";
    statusNormalizado: string | null;
    matchedBy: "pi_site" | "none";
  };
  publicationHealth: PublicationHealth;
  evidenceHealth: EvidenceHealth;
  requiredActions: RequiredAction[];
  blockingIssues: string[];
};

export type SourceIdentityDecision = {
  sources: {
    sheetPi: string | null;
    driveFolderPiCandidates: string[];
    drivePdfPiCandidates: string[];
    adopsPi: string | null;
  };
  observedPiCandidates: string[];
  canonicalPi: string | null;
  decision: "confirmed" | "needs_confirmation" | "insufficient_data";
  reason: string;
};

export type CampaignOperationsActiveResult = {
  version: typeof CAMPAIGN_OPERATIONS_VERSION;
  date: string;
  generatedAt: string;
  sheet: {
    name: string;
    activeRows: number;
    downloadedAt: string;
    sourceSha256: string;
  };
  summary: {
    activeInSheet: number;
    matchedInAdOps: number;
    needsCreateInAdOps: number;
    needsPublication: number;
    needsEvidence: number;
    hasDivergence: number;
    upcomingInSheet: number;
  };
  items: CampaignOperationItem[];
  upcomingItems: CampaignOperationUpcomingItem[];
};

function eachIsoDay(start: string | null, end: string | null) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate || endDate < startDate) return [];
  const days: string[] = [];
  for (let current = new Date(startDate); current <= endDate; current = new Date(current.getTime() + 86_400_000)) {
    days.push(current.toISOString().slice(0, 10));
  }
  return days;
}

function clampRequiredDates(row: CurrentSheetCampaignRow, targetDate: string) {
  if (!row.periodoInicio || !row.periodoFim) return [];
  const end = row.periodoFim < targetDate ? row.periodoFim : targetDate;
  return eachIsoDay(row.periodoInicio, end);
}

function isCampaignNameCompatible(sheetName: string, adopsName: string | null | undefined) {
  const sheet = normalizeForMatch(sheetName);
  const adops = normalizeForMatch(adopsName);
  if (!sheet || !adops) return false;
  return sheet === adops || sheet.includes(adops) || adops.includes(sheet);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function resolveSourceIdentity(
  row: CurrentSheetCampaignRow,
  drive: DriveCampaignMediaMatch,
  insertion: MinimalEnrichedInsertion | null,
): SourceIdentityDecision {
  const sheetPi = extractPiDigits(row.piCodigo);
  const adopsPi = extractPiDigits(insertion?.campaign?.piCodigo);
  const folderPis = drive.sourceIdentity.folderPiCandidates;
  const pdfPis = drive.sourceIdentity.pdfPiCandidates;
  const observedPiCandidates = unique([sheetPi, ...folderPis, ...pdfPis, adopsPi].filter((value): value is string => Boolean(value)));
  const sheetAndPdfAgree = Boolean(sheetPi && pdfPis.includes(sheetPi));

  if (observedPiCandidates.length === 0) {
    return {
      sources: { sheetPi, driveFolderPiCandidates: folderPis, drivePdfPiCandidates: pdfPis, adopsPi },
      observedPiCandidates,
      canonicalPi: null,
      decision: "insufficient_data",
      reason: "Nenhuma fonte contém um número de PI reconhecível.",
    };
  }
  if (observedPiCandidates.length === 1) {
    return {
      sources: { sheetPi, driveFolderPiCandidates: folderPis, drivePdfPiCandidates: pdfPis, adopsPi },
      observedPiCandidates,
      canonicalPi: observedPiCandidates[0]!,
      decision: "confirmed",
      reason: "As fontes com PI identificável concordam.",
    };
  }
  if (sheetAndPdfAgree && (!adopsPi || adopsPi === sheetPi)) {
    return {
      sources: { sheetPi, driveFolderPiCandidates: folderPis, drivePdfPiCandidates: pdfPis, adopsPi },
      observedPiCandidates,
      canonicalPi: sheetPi,
      decision: "needs_confirmation",
      reason: "Planilha e PDF concordam, mas o nome da pasta ou da mídia no Drive usa outra PI. Confirme antes de alterar ou publicar.",
    };
  }
  return {
    sources: { sheetPi, driveFolderPiCandidates: folderPis, drivePdfPiCandidates: pdfPis, adopsPi },
    observedPiCandidates,
    canonicalPi: null,
    decision: "needs_confirmation",
    reason: "As fontes divergem e não há maioria canônica segura para mutação automática.",
  };
}

type LiveAdSlot = {
  pageUrl: string;
  groupId: number;
  adId: number;
  mediaUrl: string | null;
  mediaBasename: string | null;
};

function mediaBasename(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).pathname.split("/").filter(Boolean).pop() ?? value.split("/").pop() ?? null;
  } catch {
    return value.split("/").pop() ?? null;
  }
}

function parseLiveSlotsFromHtml(html: string, pageUrl: string, supportedGroups: number[]) {
  const slots: LiveAdSlot[] = [];
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
      if (!Number.isFinite(adId) || !mediaUrl || mediaUrl.startsWith("data:image/svg+xml")) continue;
      slots.push({ pageUrl, groupId, adId, mediaUrl, mediaBasename: mediaBasename(mediaUrl) });
    }
  }
  return slots;
}

async function fetchLiveSlotsForInsertion(insertion: MinimalEnrichedInsertion | null, cache: Map<string, LiveAdSlot[]>) {
  const siteSigla = insertion?.site?.sigla ?? null;
  const mapping = getSiteFormatMapping(siteSigla, insertion?.localFormatoNormalizado ?? insertion?.localFormato);
  const site = getSiteIntegration(siteSigla);
  if (!site || !mapping) return [] as LiveAdSlot[];
  const pageUrl = mapping.page === "article" ? site.articleFallbackUrl : site.homeUrl;
  if (!pageUrl) return [] as LiveAdSlot[];
  const cacheKey = `${site.sigla}:${mapping.page}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? [];
  try {
    const response = await fetch(pageUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      cache.set(cacheKey, []);
      return [];
    }
    const html = await response.text();
    const slots = parseLiveSlotsFromHtml(html, pageUrl, getSupportedGroupIds(siteSigla));
    cache.set(cacheKey, slots);
    return slots;
  } catch {
    cache.set(cacheKey, []);
    return [];
  }
}

function liveSlotIssuesForInsertion(insertion: MinimalEnrichedInsertion | null, liveSlots: LiveAdSlot[]) {
  if (!insertion) return [];
  const siteSigla = insertion.site?.sigla ?? null;
  const expectedGroupId = getAdRotateGroupId(siteSigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
  const expectedMediaBasename = mediaBasename(insertion.mediaUrl);
  if (!expectedGroupId || !expectedMediaBasename) return [];

  const issues: string[] = [];
  const groupSlots = liveSlots.filter((slot) => slot.groupId === expectedGroupId);
  const exactSlot = groupSlots.find((slot) => slot.mediaBasename === expectedMediaBasename);
  const conflictingSlots = groupSlots.filter((slot) => slot.mediaBasename && slot.mediaBasename !== expectedMediaBasename);

  if (!exactSlot && conflictingSlots.length) {
    issues.push(
      `Slot público do grupo ${expectedGroupId} está ocupado por outra mídia: ${conflictingSlots.map((slot) => `ad ${slot.adId}/${slot.mediaBasename}`).join(", ")}.`,
    );
  }

  for (const slot of groupSlots) {
    const duplicateGroups = liveSlots
      .filter((candidate) => candidate.pageUrl === slot.pageUrl && candidate.adId === slot.adId && candidate.groupId !== slot.groupId)
      .map((candidate) => candidate.groupId);
    if (duplicateGroups.length) {
      issues.push(`Anúncio ${slot.adId} aparece duplicado nos grupos ${unique([slot.groupId, ...duplicateGroups]).sort((a, b) => a - b).join(", ")}.`);
    }
  }

  return unique(issues);
}

function hasExactPublicSlot(insertion: MinimalEnrichedInsertion | null, liveSlots: LiveAdSlot[]) {
  if (!insertion) return false;
  const expectedGroupId = getAdRotateGroupId(insertion.site?.sigla ?? null, insertion.localFormatoNormalizado ?? insertion.localFormato);
  const expectedMediaBasename = mediaBasename(insertion.mediaUrl);
  return Boolean(expectedGroupId && expectedMediaBasename && liveSlots.some((slot) => (
    slot.groupId === expectedGroupId && slot.mediaBasename === expectedMediaBasename
  )));
}

async function loadEnrichedInsertions(): Promise<MinimalEnrichedInsertion[]> {
  const [insertionsResult, campaignsResult, sitesResult] = await Promise.all([
    db.execute(sql`
      select
        id,
        campanha_id as "campanhaId",
        site_id as "siteId",
        local_formato as "localFormato",
        local_formato_normalizado as "localFormatoNormalizado",
        periodo_inicio as "periodoInicio",
        periodo_fim as "periodoFim",
        periodo_original as "periodoOriginal",
        status_normalizado as "statusNormalizado",
        banner_publicado_no_site as "bannerPublicadoNoSite",
        print_gerado as "printGerado",
        media_url as "mediaUrl",
        observacoes
      from insertions
    `),
    db.execute(sql`
      select id, nome, pi_codigo as "piCodigo", competencia
      from campaigns
    `),
    db.execute(sql`
      select id, nome, sigla
      from sites
    `),
  ]);
  const insertions = insertionsResult.rows as MinimalInsertionRow[];
  const campaigns = campaignsResult.rows as MinimalCampaignRow[];
  const sites = sitesResult.rows as MinimalSiteRow[];
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const siteById = new Map(sites.map((site) => [site.id, site]));
  return insertions.map((insertion) => ({
    ...insertion,
    campaign: campaignById.get(insertion.campanhaId) ?? null,
    site: insertion.siteId ? siteById.get(insertion.siteId) ?? null : null,
  }));
}

function findAdopsMatches(row: CurrentSheetCampaignRow, insertions: MinimalEnrichedInsertion[]) {
  return findCampaignIdentityMatches(row, insertions.map((insertion) => ({
    ...insertion,
    campaignName: insertion.campaign?.nome ?? null,
    piCodigo: insertion.campaign?.piCodigo ?? null,
    siteSigla: insertion.site?.sigla ?? null,
  })));
}

async function resolveEvidence(insertion: MinimalEnrichedInsertion | null, row: CurrentSheetCampaignRow, targetDate: string, includeEvidence: boolean) {
  const requiredDates = clampRequiredDates(row, targetDate);
  if (!includeEvidence || !insertion) {
    return {
      status: "missing_or_not_applicable" as const,
      requiredDates,
      auditedDates: [] as string[],
      invalidDates: [] as string[],
      missingDates: insertion ? requiredDates : [],
    };
  }

  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id));
  const evidenceDates = new Set(evidences.map((evidence) => getEvidenceDateKey(evidence.titulo)).filter((value): value is string => Boolean(value)));
  const auditedDates: string[] = [];
  const invalidDates: string[] = [];
  const missingDates: string[] = [];

  for (const date of requiredDates) {
    if (!evidenceDates.has(date)) {
      missingDates.push(date);
      continue;
    }
    try {
      const validation = await validateAuditChecklist({ insertionId: insertion.id, date });
      if (validation.approved) auditedDates.push(date);
      else invalidDates.push(date);
    } catch {
      invalidDates.push(date);
    }
  }

  return {
    status: missingDates.length ? "missing" as const : invalidDates.length ? "invalid" as const : "approved" as const,
    requiredDates,
    auditedDates,
    invalidDates,
    missingDates,
  };
}

function resolveEvidenceHealth(
  evidence: Awaited<ReturnType<typeof resolveEvidence>>,
  publicationHealth: PublicationHealth,
): EvidenceHealth {
  return {
    status: publicationHealth.status === "blocked_upstream"
      ? "blocked_upstream"
      : evidence.status === "approved"
        ? "complete"
        : evidence.status === "missing"
          ? "missing"
          : evidence.status === "invalid"
            ? "invalid"
            : "not_applicable",
    auditedDates: evidence.auditedDates,
    missingDates: evidence.missingDates,
    invalidDates: evidence.invalidDates,
  };
}

function suggestedJobs(row: CurrentSheetCampaignRow, insertion: MinimalEnrichedInsertion | null, evidenceStatus: Awaited<ReturnType<typeof resolveEvidence>>, drive: DriveCampaignMediaMatch, publicationHealth: PublicationHealth): SuggestedJob[] {
  const jobs: SuggestedJob[] = [];
  if (drive.folderId) {
    jobs.push({
      type: "drive_pi_preflight",
      method: "POST",
      endpoint: "/api/ops/jobs/drive-pi-preflight",
      payload: { folderId: drive.folderId },
    });
  }
  if (!insertion && drive.folderId) {
    jobs.push({
      type: "drive_pi_folder",
      method: "POST",
      endpoint: "/api/ops/jobs/drive-pi-folder",
      payload: { folderId: drive.folderId },
    });
  }
  if (insertion && publicationHealth.status === "ok" && evidenceStatus.requiredDates.length) {
    jobs.push({
      type: "print_backfill",
      method: "POST",
      endpoint: "/api/ops/jobs/print-backfill",
      payload: {
        piCodigo: row.piCodigo,
        siteSigla: row.blockSite,
        fromDate: row.periodoInicio,
        toDate: evidenceStatus.requiredDates.at(-1),
      },
    });
    const firstMissing = evidenceStatus.missingDates[0] ?? evidenceStatus.invalidDates[0];
    if (firstMissing) {
      jobs.push({
        type: "print_single",
        method: "POST",
        endpoint: "/api/ops/jobs/print-single",
        payload: {
          insertionId: insertion.id,
          date: firstMissing,
          replace: evidenceStatus.invalidDates.includes(firstMissing),
        },
      });
    }
  }
  return jobs;
}

export async function getActiveCampaignOperations(options: {
  date?: string;
  refreshDrive?: boolean;
  siteSigla?: string | null;
  includeEvidence?: boolean;
  sheetScope?: "daily" | "monthly";
} = {}): Promise<CampaignOperationsActiveResult> {
  const date = options.date ?? todayInCuiaba();
  const includeEvidence = options.includeEvidence !== false;
  const [sheet, insertions] = await Promise.all([
    loadCurrentSheetCampaigns({
      date,
      siteSigla: options.siteSigla ?? null,
      includeUpcoming: options.sheetScope !== "monthly",
      scope: options.sheetScope ?? "daily",
    }),
    loadEnrichedInsertions(),
  ]);
  const liveSlotsByPage = new Map<string, LiveAdSlot[]>();

  const items: CampaignOperationItem[] = [];
  for (const row of sheet.rows) {
    const matches = findAdopsMatches(row, insertions);
    const { insertion, compatible } = selectBestAdopsMatch(row, matches);
    const drive = await findDriveCampaignMedia({
      siteSigla: row.blockSite,
      piCodigo: row.piCodigo,
      campaignName: row.campaignName,
      periodStart: row.periodoInicio,
      refreshDrive: options.refreshDrive === true,
    });
    const mediaMatchesFormat = driveMediaMatchesFormat(drive.mediaFiles, row.localFormatoNormalizado, getSiteIntegration(row.blockSite)?.formatMappings.find((mapping) => mapping.aliases.some((alias) => normalizeForMatch(alias) === normalizeForMatch(row.localFormatoNormalizado)))?.operationalMediaProfile?.formats ?? null);
    const sourceIdentity = resolveSourceIdentity(row, drive, insertion);
    const canonicalSelection = {
      insertionId: insertion?.id ?? null,
      decision: insertion ? "confirmed" as const : compatible.length ? "ambiguous" as const : "missing" as const,
      compatibleInsertionIds: compatible.map((candidate) => candidate.id).sort((left, right) => left - right),
      reason: insertion
        ? "Inserção selecionada por PI, portal, formato, período e prioridade da variante exata."
        : compatible.length
          ? "Há inserções compatíveis sem vencedora determinística; não autorize publicação ou captura."
          : "Nenhuma inserção compatível foi encontrada para PI e portal.",
      identityEvidence: insertion ? {
        piCodigo: insertion.campaign?.piCodigo ?? row.piCodigo,
        siteSigla: insertion.site?.sigla ?? row.blockSite,
        format: insertion.localFormatoNormalizado ?? insertion.localFormato ?? row.localFormatoNormalizado,
        periodStart: insertion.periodoInicio,
        periodEnd: insertion.periodoFim,
        mediaUrl: insertion.mediaUrl,
      } : null,
    };
    const evidence = await resolveEvidence(insertion, row, date, includeEvidence);
    const requiredActions: RequiredAction[] = [];
    const blockingIssues: string[] = [];
    const hasAdopsMedia = Boolean(insertion?.mediaUrl);
    const expectedGroupId = getAdRotateGroupId(insertion?.site?.sigla ?? row.blockSite, insertion?.localFormatoNormalizado ?? insertion?.localFormato ?? row.localFormatoNormalizado);
    const liveSlots = await fetchLiveSlotsForInsertion(insertion, liveSlotsByPage);
    const observedLiveSlotIssues = liveSlotIssuesForInsertion(insertion, liveSlots);
    const exactPublicSlot = hasExactPublicSlot(insertion, liveSlots);
    const publicConfirmation = exactPublicSlot
      ? "confirmed" as const
      : insertion?.bannerPublicadoNoSite === true
        ? "reported_only" as const
        : "not_published" as const;
    const duplicateInsertionIds = compatible
      .filter((candidate) => candidate.id !== insertion?.id)
      .map((candidate) => candidate.id)
      .sort((left, right) => left - right);
    const publicationHealth = classifyPublicationHealth({
      inPeriod: Boolean(row.periodoInicio && row.periodoFim && date >= row.periodoInicio && date <= row.periodoFim),
      mediaUrl: insertion?.mediaUrl ?? null,
      bannerPublicadoNoSite: insertion?.bannerPublicadoNoSite ?? false,
      expectedGroupId,
      expectedMediaObserved: exactPublicSlot,
      publicConfirmation,
      driveMediaAvailable: drive.mediaFiles.length > 0,
      duplicateInsertionIds,
    });
    const evidenceHealth = resolveEvidenceHealth(evidence, publicationHealth);
    // An approved per-insertion proof is stronger than one random response from a rotating group.
    const liveSlotIssues = evidence.status === "approved" ? [] : observedLiveSlotIssues;

    if (!insertion) requiredActions.push("create_campaign_or_insertion");
    if (!insertion && compatible.length > 1) blockingIssues.push("Mais de uma inserção AdOps corresponde a PI + portal e formato.");
    if ((drive.status === "not_found" || drive.status === "unavailable") && !hasAdopsMedia) requiredActions.push("locate_or_upload_media");
    if (drive.status === "ambiguous") {
      requiredActions.push("review_drive_ambiguity");
      blockingIssues.push("Drive retornou mais de uma pasta candidata para a campanha.");
    }
    if (sourceIdentity.decision === "needs_confirmation") {
      requiredActions.push("confirm_source_identity");
      blockingIssues.push(sourceIdentity.reason);
    }
    if (drive.mediaFiles.length && !mediaMatchesFormat && !hasAdopsMedia) {
      requiredActions.push("locate_or_upload_media");
      blockingIssues.push("Mídia encontrada no Drive não corresponde ao formato da planilha.");
    }
    if (insertion && !insertion.mediaUrl) requiredActions.push("locate_or_upload_media");
    if (!insertion || (insertion.bannerPublicadoNoSite !== true && !exactPublicSlot)) requiredActions.push("publish_on_site");
    if (evidence.status === "missing" || evidence.status === "invalid" || !insertion) requiredActions.push("generate_evidence");

    const periodDivergent = Boolean(insertion && (insertion.periodoInicio !== row.periodoInicio || insertion.periodoFim !== row.periodoFim));
    const formatDivergent = Boolean(insertion && !isFormatCompatible(row.localFormato, insertion.localFormatoNormalizado ?? insertion.localFormato));
    if (periodDivergent) requiredActions.push("review_period_divergence");
    if (formatDivergent) requiredActions.push("review_format_divergence");
    if (liveSlotIssues.length) {
      requiredActions.push("review_live_slot_conflict");
      blockingIssues.push(...liveSlotIssues);
    }

    const statuses: OperationStatus[] = [];
    if (!insertion) statuses.push("needs_create_in_adops");
    if ((drive.status === "not_found" || drive.status === "unavailable") && !hasAdopsMedia) statuses.push("drive_missing");
    if (drive.status === "ambiguous") statuses.push("ambiguous_drive_match");
    if (sourceIdentity.decision === "needs_confirmation") statuses.push("source_conflict");
    if (insertion && (!insertion.mediaUrl || (drive.mediaFiles.length > 0 && !mediaMatchesFormat && !hasAdopsMedia))) statuses.push("needs_media");
    if (!insertion || (insertion.bannerPublicadoNoSite !== true && !exactPublicSlot)) statuses.push("needs_publication");
    if (evidence.status === "missing" || evidence.status === "invalid" || !insertion) statuses.push("needs_evidence");
    if (periodDivergent) statuses.push("divergent_period");
    if (formatDivergent) statuses.push("divergent_format");
    if (blockingIssues.length && statuses.length === 0) statuses.push("blocked");

    const campaignNameDivergent = Boolean(insertion && !isCampaignNameCompatible(row.campaignName, insertion.campaign?.nome));
    if (campaignNameDivergent) blockingIssues.push(`Nome da campanha diverge do AdOps: ${insertion?.campaign?.nome ?? "sem nome"}`);

    items.push({
      version: CAMPAIGN_OPERATIONS_VERSION,
      status: statuses[0] ?? "ok",
      siteSigla: row.blockSite,
      piCodigo: row.piCodigo,
      campaignName: row.campaignName,
      period: {
        start: row.periodoInicio,
        end: row.periodoFim,
        original: row.periodoOriginal,
      },
      format: {
        sheet: row.localFormato,
        adops: insertion?.localFormatoNormalizado ?? insertion?.localFormato ?? null,
        normalized: row.localFormatoNormalizado,
      },
      sheetSource: {
        sheetName: row.sheetName,
        blockSite: row.blockSite,
        rowNumber: row.rowNumber,
      },
      sourceIdentity,
      canonicalSelection,
      drive: {
        ...drive,
        mediaMatchesFormat,
      },
      adops: {
        status: insertion ? "matched" : compatible.length > 1 ? "ambiguous" : "missing",
        campaignId: insertion?.campanhaId ?? null,
        competencia: insertion?.campaign?.competencia ?? null,
        insertionId: insertion?.id ?? null,
        mediaUrl: insertion?.mediaUrl ?? null,
        bannerPublicadoNoSite: insertion?.bannerPublicadoNoSite ?? null,
        publicConfirmation,
        statusNormalizado: insertion?.statusNormalizado ?? null,
        matchedBy: insertion ? "pi_site" : "none",
        operationalMatchCount: compatible.length,
      },
      evidence,
      publicationHealth,
      evidenceHealth,
      requiredActions: unique(requiredActions),
      blockingIssues,
      suggestedJobs: suggestedJobs(row, insertion, evidence, drive, publicationHealth),
    });
  }

  const upcomingItems: CampaignOperationUpcomingItem[] = [];
  for (const row of sheet.upcomingRows) {
    const matches = findAdopsMatches(row, insertions);
    const { insertion, compatible } = selectBestAdopsMatch(row, matches);
    const drive = await findDriveCampaignMedia({
      siteSigla: row.blockSite,
      piCodigo: row.piCodigo,
      campaignName: row.campaignName,
      periodStart: row.periodoInicio,
      refreshDrive: options.refreshDrive === true,
    });
    const mediaMatchesFormat = driveMediaMatchesFormat(drive.mediaFiles, row.localFormatoNormalizado, getSiteIntegration(row.blockSite)?.formatMappings.find((mapping) => mapping.aliases.some((alias) => normalizeForMatch(alias) === normalizeForMatch(row.localFormatoNormalizado)))?.operationalMediaProfile?.formats ?? null);
    const sourceIdentity = resolveSourceIdentity(row, drive, insertion);
    const requiredActions: RequiredAction[] = [];
    const blockingIssues: string[] = [];
    const hasAdopsMedia = Boolean(insertion?.mediaUrl);
    const expectedGroupId = getAdRotateGroupId(insertion?.site?.sigla ?? row.blockSite, insertion?.localFormatoNormalizado ?? insertion?.localFormato ?? row.localFormatoNormalizado);
    const publicConfirmation = insertion?.bannerPublicadoNoSite === true ? "reported_only" as const : "not_published" as const;
    const duplicateInsertionIds = compatible
      .filter((candidate) => candidate.id !== insertion?.id)
      .map((candidate) => candidate.id)
      .sort((left, right) => left - right);
    const publicationHealth = classifyPublicationHealth({
      inPeriod: false,
      mediaUrl: insertion?.mediaUrl ?? null,
      bannerPublicadoNoSite: insertion?.bannerPublicadoNoSite ?? false,
      expectedGroupId,
      expectedMediaObserved: false,
      publicConfirmation,
      driveMediaAvailable: drive.mediaFiles.length > 0,
      duplicateInsertionIds,
    });
    // Future ads are intentionally not required to appear in public HTML before their start date.
    const liveSlotIssues: string[] = [];

    if (!insertion) requiredActions.push("create_campaign_or_insertion");
    if (!insertion && compatible.length > 1) blockingIssues.push("Mais de uma inserção AdOps corresponde a PI + portal e formato.");
    if ((drive.status === "not_found" || drive.status === "unavailable") && !hasAdopsMedia) requiredActions.push("locate_or_upload_media");
    if (drive.status === "ambiguous") {
      requiredActions.push("review_drive_ambiguity");
      blockingIssues.push("Drive retornou mais de uma pasta candidata para a campanha.");
    }
    if (sourceIdentity.decision === "needs_confirmation") {
      requiredActions.push("confirm_source_identity");
      blockingIssues.push(sourceIdentity.reason);
    }
    if (drive.mediaFiles.length && !mediaMatchesFormat && !hasAdopsMedia) {
      requiredActions.push("locate_or_upload_media");
      blockingIssues.push("Mídia encontrada no Drive não corresponde ao formato da planilha.");
    }
    if (insertion && !insertion.mediaUrl) requiredActions.push("locate_or_upload_media");
    if (!insertion || insertion.bannerPublicadoNoSite !== true) requiredActions.push("publish_on_site");

    const periodDivergent = Boolean(insertion && (insertion.periodoInicio !== row.periodoInicio || insertion.periodoFim !== row.periodoFim));
    const formatDivergent = Boolean(insertion && !isFormatCompatible(row.localFormato, insertion.localFormatoNormalizado ?? insertion.localFormato));
    if (periodDivergent) requiredActions.push("review_period_divergence");
    if (formatDivergent) requiredActions.push("review_format_divergence");
    if (liveSlotIssues.length) {
      requiredActions.push("review_live_slot_conflict");
      blockingIssues.push(...liveSlotIssues);
    }

    upcomingItems.push({
      version: CAMPAIGN_OPERATIONS_VERSION,
      siteSigla: row.blockSite,
      piCodigo: row.piCodigo,
      campaignName: row.campaignName,
      period: {
        start: row.periodoInicio,
        end: row.periodoFim,
        original: row.periodoOriginal,
      },
      format: {
        sheet: row.localFormato,
        adops: insertion?.localFormatoNormalizado ?? insertion?.localFormato ?? null,
        normalized: row.localFormatoNormalizado,
      },
      sheetSource: {
        sheetName: row.sheetName,
        blockSite: row.blockSite,
        rowNumber: row.rowNumber,
      },
      sourceIdentity,
      drive: {
        ...drive,
        mediaMatchesFormat,
      },
      adops: {
        status: insertion ? "matched" : compatible.length > 1 ? "ambiguous" : "missing",
        campaignId: insertion?.campanhaId ?? null,
        insertionId: insertion?.id ?? null,
        mediaUrl: insertion?.mediaUrl ?? null,
        bannerPublicadoNoSite: insertion?.bannerPublicadoNoSite ?? null,
        publicConfirmation,
        statusNormalizado: insertion?.statusNormalizado ?? null,
        matchedBy: insertion ? "pi_site" : "none",
      },
      publicationHealth,
      evidenceHealth: {
        status: "not_applicable",
        auditedDates: [],
        missingDates: [],
        invalidDates: [],
      },
      requiredActions: unique(requiredActions),
      blockingIssues,
    });
  }

  return {
    version: CAMPAIGN_OPERATIONS_VERSION,
    date,
    generatedAt: new Date().toISOString(),
    sheet: {
      name: sheet.sheetName,
      activeRows: sheet.rows.length,
      downloadedAt: sheet.source.downloadedAt,
      sourceSha256: sheet.source.sha256,
    },
    summary: {
      activeInSheet: items.length,
      matchedInAdOps: items.filter((item) => item.adops.status === "matched").length,
      needsCreateInAdOps: items.filter((item) => item.requiredActions.includes("create_campaign_or_insertion")).length,
      needsPublication: items.filter((item) => item.requiredActions.includes("publish_on_site")).length,
      needsEvidence: items.filter((item) => item.requiredActions.includes("generate_evidence")).length,
      hasDivergence: items.filter((item) => item.requiredActions.includes("review_period_divergence") || item.requiredActions.includes("review_format_divergence") || item.blockingIssues.length > 0).length,
      upcomingInSheet: upcomingItems.length,
    },
    items,
    upcomingItems,
  };
}
