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
  normalizeFormato,
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
import { getAdRotateGroupId, getSiteIntegration, getSupportedGroupIds, normalizeSiteMediaUrl } from "./adrotate-sites";

export const CAMPAIGN_OPERATIONS_VERSION = "campaign-operations-v1" as const;

type RequiredAction =
  | "create_campaign_or_insertion"
  | "locate_or_upload_media"
  | "publish_on_site"
  | "generate_evidence"
  | "review_period_divergence"
  | "review_format_divergence"
  | "review_drive_ambiguity"
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

type MinimalCampaignRow = Pick<typeof campaignsTable.$inferSelect, "id" | "nome" | "piCodigo">;
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
  drive: DriveCampaignMediaMatch & {
    mediaMatchesFormat: boolean;
  };
  adops: {
    status: "matched" | "missing" | "ambiguous";
    campaignId: number | null;
    insertionId: number | null;
    mediaUrl: string | null;
    bannerPublicadoNoSite: boolean | null;
    statusNormalizado: string | null;
    matchedBy: "pi_site" | "none";
  };
  evidence: {
    status: "approved" | "missing" | "invalid" | "missing_or_not_applicable";
    requiredDates: string[];
    auditedDates: string[];
    invalidDates: string[];
    missingDates: string[];
  };
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
  drive: DriveCampaignMediaMatch & {
    mediaMatchesFormat: boolean;
  };
  adops: {
    status: "missing" | "matched" | "ambiguous";
    campaignId: number | null;
    insertionId: number | null;
    mediaUrl: string | null;
    bannerPublicadoNoSite: boolean | null;
    statusNormalizado: string | null;
    matchedBy: "pi_site" | "none";
  };
  requiredActions: RequiredAction[];
  blockingIssues: string[];
};

export type CampaignOperationsActiveResult = {
  version: typeof CAMPAIGN_OPERATIONS_VERSION;
  date: string;
  generatedAt: string;
  sheet: {
    name: string;
    activeRows: number;
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

function isFormatCompatible(sheetFormat: string, adopsFormat: string | null | undefined) {
  const sheet = normalizeFormato(sheetFormat);
  const adops = normalizeFormato(adopsFormat);
  if (!sheet || !adops) return false;
  if (sheet === adops) return true;
  if (sheet === "TOPO" && adops.includes("TOPO")) return true;
  if (sheet === "LATERAL" && adops.includes("LATERAL")) return true;
  if (sheet === "VIDEO" && adops.includes("VIDEO")) return true;
  return false;
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

async function fetchHomeLiveSlots(siteSigla: string) {
  const site = getSiteIntegration(siteSigla);
  if (!site) return [] as LiveAdSlot[];
  try {
    const response = await fetch(site.homeUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return [];
    const html = await response.text();
    return parseLiveSlotsFromHtml(html, site.homeUrl, getSupportedGroupIds(siteSigla));
  } catch {
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
      select id, nome, pi_codigo as "piCodigo"
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
  const piDigits = extractPiDigits(row.piCodigo);
  if (!piDigits) return [];
  return insertions.filter((insertion) => {
    const siteSigla = insertion.site?.sigla?.toUpperCase();
    const insertionPi = extractPiDigits(insertion.campaign?.piCodigo);
    return siteSigla === row.blockSite && insertionPi === piDigits;
  });
}

function periodsOverlap(row: CurrentSheetCampaignRow, insertion: MinimalEnrichedInsertion) {
  if (!row.periodoInicio || !row.periodoFim || !insertion.periodoInicio || !insertion.periodoFim) return false;
  return insertion.periodoInicio <= row.periodoFim && insertion.periodoFim >= row.periodoInicio;
}

function scoreAdopsMatch(row: CurrentSheetCampaignRow, insertion: MinimalEnrichedInsertion) {
  let score = 0;
  const adopsFormat = insertion.localFormatoNormalizado ?? insertion.localFormato;
  if (isFormatCompatible(row.localFormato, adopsFormat)) score += 100;
  if (insertion.periodoInicio === row.periodoInicio && insertion.periodoFim === row.periodoFim) score += 60;
  else if (periodsOverlap(row, insertion)) score += 30;
  if (insertion.mediaUrl) score += 20;
  if (insertion.bannerPublicadoNoSite === true) score += 20;
  if (["publicado", "em_veiculacao", "publicado_no_site"].includes(normalizeForMatch(insertion.statusNormalizado))) score += 10;
  return score;
}

function selectBestAdopsMatch(row: CurrentSheetCampaignRow, matches: MinimalEnrichedInsertion[]) {
  const compatible = matches.filter((insertion) => isFormatCompatible(row.localFormato, insertion.localFormatoNormalizado ?? insertion.localFormato));
  if (compatible.length === 0) return { insertion: null, compatible };
  const ranked = compatible
    .map((insertion) => ({ insertion, score: scoreAdopsMatch(row, insertion) }))
    .sort((a, b) => b.score - a.score || b.insertion.id - a.insertion.id);
  if (ranked.length === 1) return { insertion: ranked[0]!.insertion, compatible };
  const [best, second] = ranked;
  if (best && second && best.score > second.score) return { insertion: best.insertion, compatible };
  return { insertion: null, compatible };
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

function suggestedJobs(row: CurrentSheetCampaignRow, insertion: MinimalEnrichedInsertion | null, evidenceStatus: Awaited<ReturnType<typeof resolveEvidence>>, drive: DriveCampaignMediaMatch): SuggestedJob[] {
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
  if (insertion && evidenceStatus.requiredDates.length) {
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
} = {}): Promise<CampaignOperationsActiveResult> {
  const date = options.date ?? todayInCuiaba();
  const includeEvidence = options.includeEvidence !== false;
  const [sheet, insertions] = await Promise.all([
    loadCurrentSheetCampaigns({ date, siteSigla: options.siteSigla ?? null, includeUpcoming: true }),
    loadEnrichedInsertions(),
  ]);
  const liveSlotsBySite = new Map<string, LiveAdSlot[]>();
  const getLiveSlots = async (siteSigla: string) => {
    if (!liveSlotsBySite.has(siteSigla)) {
      liveSlotsBySite.set(siteSigla, await fetchHomeLiveSlots(siteSigla));
    }
    return liveSlotsBySite.get(siteSigla) ?? [];
  };

  const items: CampaignOperationItem[] = [];
  for (const row of sheet.rows) {
    const matches = findAdopsMatches(row, insertions);
    const { insertion, compatible } = selectBestAdopsMatch(row, matches);
    const drive = await findDriveCampaignMedia({
      siteSigla: row.blockSite,
      piCodigo: row.piCodigo,
      campaignName: row.campaignName,
      refreshDrive: options.refreshDrive === true,
    });
    const mediaMatchesFormat = driveMediaMatchesFormat(drive.mediaFiles, row.localFormatoNormalizado);
    const evidence = await resolveEvidence(insertion, row, date, includeEvidence);
    const requiredActions: RequiredAction[] = [];
    const blockingIssues: string[] = [];
    const hasAdopsMedia = Boolean(insertion?.mediaUrl);
    const liveSlotIssues = liveSlotIssuesForInsertion(insertion, await getLiveSlots(row.blockSite));

    if (!insertion) requiredActions.push("create_campaign_or_insertion");
    if (!insertion && compatible.length > 1) blockingIssues.push("Mais de uma inserção AdOps corresponde a PI + portal e formato.");
    if ((drive.status === "not_found" || drive.status === "unavailable") && !hasAdopsMedia) requiredActions.push("locate_or_upload_media");
    if (drive.status === "ambiguous") {
      requiredActions.push("review_drive_ambiguity");
      blockingIssues.push("Drive retornou mais de uma pasta candidata para a campanha.");
    }
    if (drive.mediaFiles.length && !mediaMatchesFormat && !hasAdopsMedia) {
      requiredActions.push("locate_or_upload_media");
      blockingIssues.push("Mídia encontrada no Drive não corresponde ao formato da planilha.");
    }
    if (insertion && !insertion.mediaUrl) requiredActions.push("locate_or_upload_media");
    if (!insertion || insertion.bannerPublicadoNoSite !== true) requiredActions.push("publish_on_site");
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
    if (insertion && (!insertion.mediaUrl || (drive.mediaFiles.length > 0 && !mediaMatchesFormat && !hasAdopsMedia))) statuses.push("needs_media");
    if (!insertion || insertion.bannerPublicadoNoSite !== true) statuses.push("needs_publication");
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
        statusNormalizado: insertion?.statusNormalizado ?? null,
        matchedBy: insertion ? "pi_site" : "none",
      },
      evidence,
      requiredActions: unique(requiredActions),
      blockingIssues,
      suggestedJobs: suggestedJobs(row, insertion, evidence, drive),
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
      refreshDrive: options.refreshDrive === true,
    });
    const mediaMatchesFormat = driveMediaMatchesFormat(drive.mediaFiles, row.localFormatoNormalizado);
    const requiredActions: RequiredAction[] = [];
    const blockingIssues: string[] = [];
    const hasAdopsMedia = Boolean(insertion?.mediaUrl);
    const liveSlotIssues = liveSlotIssuesForInsertion(insertion, await getLiveSlots(row.blockSite));

    if (!insertion) requiredActions.push("create_campaign_or_insertion");
    if (!insertion && compatible.length > 1) blockingIssues.push("Mais de uma inserção AdOps corresponde a PI + portal e formato.");
    if ((drive.status === "not_found" || drive.status === "unavailable") && !hasAdopsMedia) requiredActions.push("locate_or_upload_media");
    if (drive.status === "ambiguous") {
      requiredActions.push("review_drive_ambiguity");
      blockingIssues.push("Drive retornou mais de uma pasta candidata para a campanha.");
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
        statusNormalizado: insertion?.statusNormalizado ?? null,
        matchedBy: insertion ? "pi_site" : "none",
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
