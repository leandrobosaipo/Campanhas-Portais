import { and, desc, eq, inArray } from "drizzle-orm";
import {
  campaignsTable,
  captureProofCandidatePromotionsTable,
  captureProofCandidatesTable,
  captureProofLogsTable,
  captureRulesTable,
  db,
  evidencesTable,
  insertionsTable,
  printJobsTable,
  sitesTable,
} from "@workspace/db";
import {
  getAdRotateGroupId,
  getSiteFormatMapping,
  getSiteIntegration,
  normalizeLocalFormato,
  normalizeSiteMediaUrl,
} from "./adrotate-sites";
import {
  attachServerCaptureProvenance,
  correlateCaptureLogProvenance,
  evaluateCaptureMetadata,
  evaluateVideoPlayerProof,
  formatIsoDate,
  getEvidenceDateKey,
  isCaptureAtInRetroWindow,
  isFutureCaptureAt,
  pageTextMatchesRequestedCaptureAt,
  pageTextMatchesCaptureReceiptAt,
  parseDateOnly,
  requiresRetroEditorialProof,
} from "./capture-audit";
import {
  requiresPerrengueHomeEditorialAudit,
  resolveChecklistFinalProofStyle,
} from "./proof-style-contract";
import { selectCanonicalEvidencePerDate } from "./evidence-export";
import { resolvePromotedCaptureProofMetadata } from "./promoted-capture-proof-metadata.mjs";
import { publicationAcceptanceReceipt } from "./publication-acceptance-policy.mjs";

export const AUDIT_CHECKLIST_VERSION = "audit-checklist-v1" as const;
const REQUIRED_FRAME_TEMPLATES = new Set([
  "windows11-chrome-light-similar-v4",
  "windows11-chrome-light-similar-v5",
]);

type Severity = "blocking" | "warning";

export type AuditChecklistIssue = {
  code: string;
  severity: Severity;
  gate: string;
  label: string;
  detail: string;
};

type RequiredGates = {
  inPeriod: true;
  mediaPresent: true;
  captureTimeWindow: true;
  slotMatchesResolvedRule: true;
  requireSlotVisibleInViewport: boolean;
  requireStickyHeaderInViewport: boolean;
  stickyHeaderExpected: string | null;
  requireScrollbar: boolean;
  requireFrameV4: boolean;
  requireIdentityFrame: boolean;
  requireFinalPngSlotAudit: boolean;
  requireNoOverlay: boolean;
  requireNo404: boolean;
  requireVideoControls: boolean;
  requireReadinessAudit: boolean;
  requireAbsoluteEditorialDates: boolean;
  requireEditorialDateMatchTarget: boolean;
  requireVisiblePageDate: boolean;
  requireGifAllowedFrameRanges: boolean;
  gifAllowedFrameRanges: Array<[number, number]>;
};

type ResolvedRule = {
  source: "capture_rules" | "config/adrotate-sites.json";
  ruleId: number | null;
  ruleVersionHash: string | null;
  siteSigla: string;
  groupId: number;
  page: string;
  slotSelector: string;
  contextSelector: string;
  scrollMode: string;
  proofStyle: string;
  auditConfig: Record<string, unknown>;
};

type AuditChecklistContractOk = {
  ok: true;
  version: typeof AUDIT_CHECKLIST_VERSION;
  insertion: {
    id: number;
    campaignId: number;
    campaignName: string | null;
    piCodigo: string | null;
    siteId: number | null;
    siteSigla: string;
    localFormato: string | null;
    localFormatoNormalizado: string | null;
    statusNormalizado: string;
  };
  period: {
    start: string | null;
    end: string | null;
    targetDate: string;
    inPeriod: boolean;
  };
  expectedMedia: {
    mediaUrl: string | null;
    mediaBasename: string | null;
  };
  expectedSelectors: {
    slotSelector: string;
    contextSelector: string;
    groupId: number;
  };
  resolvedRule: ResolvedRule;
  requiredGates: RequiredGates;
  warnings: AuditChecklistIssue[];
};

type AuditChecklistContractBlocked = {
  ok: false;
  version: typeof AUDIT_CHECKLIST_VERSION;
  insertionId: number;
  targetDate: string;
  blockingIssues: AuditChecklistIssue[];
  warnings: AuditChecklistIssue[];
};

export type AuditChecklistContract = AuditChecklistContractOk | AuditChecklistContractBlocked;

export type AuditChecklistValidation = {
  approved: boolean;
  preliminary: boolean;
  version: typeof AUDIT_CHECKLIST_VERSION;
  insertionId: number;
  date: string;
  contract: AuditChecklistContract;
  metadataPresent: boolean;
  audit: ReturnType<typeof evaluateCaptureMetadata> | null;
  issues: AuditChecklistIssue[];
  blockingIssues: AuditChecklistIssue[];
  warnings: AuditChecklistIssue[];
  evidenceStatus: "approved" | "blocked";
  publicationAcceptance?: { purpose: string; sourceJobId: string; insertionId: number; targetDate: string; actualAt: string; preliminary: boolean } | null;
  captureWindowException: {
    approvalRef: string;
    approvedAt: string;
    expiresAt: string;
    actualAt: string;
    late: true;
    targetDate: string;
    insertionId: number;
    siteSigla: string;
    piCodigo: string;
    groupId: number;
    limitation: string;
  } | null;
};

const CAPTURE_WINDOW_EXCEPTION = {
  approvalRef: "call_dff2ebce693b4957bf4d52ccc737ce7b:reply",
  approvedAt: "2026-10-12T02:41:31Z",
  expiresAt: "2026-10-12T03:59:59.999Z",
  targetDate: "2026-10-11",
  allowlisted: [
    { insertionId: 3055, siteSigla: "OMT", piCodigo: "PI 9784 - PREF CBA", groupId: 1 },
    { insertionId: 3083, siteSigla: "PERRENGUE", piCodigo: "91713", groupId: 11 },
  ],
} as const;

function formatCuiabaDateAt(value: Date | string) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return formatIsoDate(instant);
}

function issue(
  code: string,
  gate: string,
  label: string,
  detail: string,
  severity: Severity = "blocking",
): AuditChecklistIssue {
  return { code, severity, gate, label, detail };
}

function formatCuiabaClockAt(value: Date | string) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(instant).replace(" ", "T");
}

export function decideAuditChecklistApproval(input: {
  phase?: "pre_upload" | "final";
  contractOk: boolean;
  metadataPresent: boolean;
  auditOk: boolean;
  blockingIssues: AuditChecklistIssue[];
}) {
  const blockingIssues = [...input.blockingIssues];
  const preliminary = input.phase === "pre_upload";
  const approved = input.contractOk
    && input.metadataPresent
    && blockingIssues.length === 0
    && (preliminary || input.auditOk);

  if (!approved && blockingIssues.length === 0) {
    blockingIssues.push(input.contractOk && input.metadataPresent && !preliminary && !input.auditOk
      ? issue(
          "audit_not_approved",
          "captureMetadata",
          "Auditoria final ainda não aprovada",
          "A captura passou pelos gates mecânicos, mas a auditoria final ainda não confirmou a proveniência persistida.",
        )
      : issue(
          "checklist_decision_inconsistent",
          "checklist",
          "Checklist bloqueado sem causa resolvida",
          "O contrato não pôde aprovar a captura e não informou outro bloqueio estruturado.",
        ));
  }

  return { approved, blockingIssues };
}

function normalizeDateKey(value: string) {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? value;
}

function mediaBasename(value: string | null | undefined) {
  const normalized = normalizeSiteMediaUrl(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const pieces = parsed.pathname.split("/").filter(Boolean);
    return pieces.at(-1) ?? null;
  } catch {
    const pieces = normalized.split(/[/?#]/).filter(Boolean);
    return pieces.at(-1) ?? null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function booleanFromConfig(config: Record<string, unknown>, key: string, fallback: boolean) {
  return typeof config[key] === "boolean" ? Boolean(config[key]) : fallback;
}

function textFromConfig(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" && String(config[key]).trim()
    ? String(config[key]).trim()
    : null;
}

function normalizeRanges(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((range): range is [unknown, unknown] => Array.isArray(range) && range.length === 2)
    .map(([start, end]) => [Number(start), Number(end)] as [number, number])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end))
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)] as [number, number]);
}

function mergeAuditConfig(siteSigla: string | null | undefined, groupId: number | null, ruleConfig: Record<string, unknown>) {
  const site = getSiteIntegration(siteSigla);
  const mapping = (site?.formatMappings ?? []).find((item) => item.groupId === groupId) ?? null;
  return {
    ...(site?.auditConfig ?? {}),
    ...(mapping?.auditOverrides ?? {}),
    ...ruleConfig,
  } as Record<string, unknown>;
}

function buildRequiredGates(localFormato: string | null | undefined, auditConfig: Record<string, unknown>): RequiredGates {
  const normalizedFormat = normalizeLocalFormato(localFormato);
  const isVideo = normalizedFormat.includes("VIDEO");
  const ranges = normalizeRanges(auditConfig.gifAllowedFrameRanges);
  return {
    inPeriod: true,
    mediaPresent: true,
    captureTimeWindow: true,
    slotMatchesResolvedRule: true,
    requireSlotVisibleInViewport: booleanFromConfig(auditConfig, "requireSlotVisibleInViewport", false),
    requireStickyHeaderInViewport: booleanFromConfig(auditConfig, "requireStickyHeaderInViewport", false),
    stickyHeaderExpected: textFromConfig(auditConfig, "stickyHeaderExpected"),
    requireScrollbar: booleanFromConfig(auditConfig, "requireScrollbar", true),
    requireFrameV4: booleanFromConfig(auditConfig, "requireFrameV4", true),
    requireIdentityFrame: booleanFromConfig(auditConfig, "requireIdentityFrame", true),
    requireFinalPngSlotAudit: booleanFromConfig(auditConfig, "requireFinalPngSlotAudit", true),
    requireNoOverlay: booleanFromConfig(auditConfig, "requireNoOverlay", true),
    requireNo404: booleanFromConfig(auditConfig, "requireNo404", true),
    requireVideoControls: booleanFromConfig(auditConfig, "requireVideoControls", isVideo),
    requireReadinessAudit: String(auditConfig.readinessMode ?? "legacy").trim().toLowerCase() === "strict-visible",
    requireAbsoluteEditorialDates: booleanFromConfig(auditConfig, "requireAbsoluteEditorialDates", false),
    requireEditorialDateMatchTarget: booleanFromConfig(auditConfig, "requireEditorialDateMatchTarget", false),
    requireVisiblePageDate: booleanFromConfig(auditConfig, "requireVisiblePageDate", false),
    requireGifAllowedFrameRanges: ranges.length > 0,
    gifAllowedFrameRanges: ranges,
  };
}

export type AuditChecklistReadContext = Map<string, Promise<unknown>>;

async function auditReadOnce<T>(context: AuditChecklistReadContext | undefined, key: string, load: () => Promise<T>): Promise<T> {
  if (!context) return load();
  let value = context.get(key) as Promise<T> | undefined;
  if (!value) { value = load(); context.set(key, value); }
  return value;
}

async function loadInsertionBundle(insertionId: number) {
  const [insertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, insertionId)).limit(1);
  if (!insertion) return null;

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, insertion.campanhaId)).limit(1);
  const [site] = insertion.siteId
    ? await db.select().from(sitesTable).where(eq(sitesTable.id, insertion.siteId)).limit(1)
    : [];

  return { insertion, campaign: campaign ?? null, site: site ?? null };
}

async function resolvePublishedRule(siteSigla: string, groupId: number) {
  const [rule] = await db.select().from(captureRulesTable).where(
    and(
      eq(captureRulesTable.siteSigla, siteSigla),
      eq(captureRulesTable.groupId, groupId),
      eq(captureRulesTable.statusPublished, true),
      eq(captureRulesTable.enabled, true),
    ),
  ).orderBy(desc(captureRulesTable.updatedAt)).limit(1);
  return rule ?? null;
}

export async function loadAuditChecklistMetadata(insertionId: number, targetDate: string, readContext?: AuditChecklistReadContext) {
  const dateKey = normalizeDateKey(targetDate);
  const references = await auditReadOnce(readContext, 'audit:refs:' + insertionId, async () => {
    const query = db.select({ id: captureProofLogsTable.id, targetDate: captureProofLogsTable.targetDate,
      uploadedUrl: captureProofLogsTable.uploadedUrl, createdAt: captureProofLogsTable.createdAt,
    }).from(captureProofLogsTable).where(and(
      eq(captureProofLogsTable.insertionId, insertionId),
      ...(readContext ? [] : [eq(captureProofLogsTable.targetDate, dateKey)]),
      inArray(captureProofLogsTable.status, ["ok", "pending_audit"]),
    )).orderBy(desc(captureProofLogsTable.createdAt));
    return readContext ? await query : await query.limit(50);
  });
  const logs = references.filter(row => row.targetDate === dateKey).slice(0, 50);
  const evidenceRows = await auditReadOnce(readContext, 'audit:evidences:' + insertionId,
    async () => db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId)));
  const evidenceUrl = selectCanonicalEvidencePerDate(evidenceRows, row => getEvidenceDateKey(row.titulo))
    .find(row => getEvidenceDateKey(row.titulo) === dateKey)?.arquivoUrl ?? null;
  if (evidenceUrl) {
    const allPromotions = await auditReadOnce(readContext, 'audit:promotions:' + insertionId, async () => db.select().from(captureProofCandidatePromotionsTable).where(and(
      eq(captureProofCandidatePromotionsTable.insertionId, insertionId),
      ...(readContext ? [] : [eq(captureProofCandidatePromotionsTable.targetDate, dateKey)]),
      eq(captureProofCandidatePromotionsTable.status, "approved"),
    )).orderBy(desc(captureProofCandidatePromotionsTable.receivedAt)));
    const promotions = allPromotions.filter(row => row.targetDate === dateKey);
    for (const promotion of promotions) {
      if (!promotion.finalLogId) continue;
      const candidatePromise = auditReadOnce(readContext, 'audit:candidate:' + promotion.candidateId,
        async () => db.select().from(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, promotion.candidateId)).limit(1));
      const logPromise = auditReadOnce(readContext, 'audit:log:' + promotion.finalLogId,
        async () => db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, promotion.finalLogId)).limit(1));
      const [[candidate], [finalLog]] = await Promise.all([candidatePromise, logPromise]);
      const promotedMetadata = resolvePromotedCaptureProofMetadata({ promotion, candidate, finalLog, canonicalEvidenceUrl: evidenceUrl });
      if (promotedMetadata && finalLog) {
        const provenance = correlateCaptureLogProvenance({ targetDate: finalLog.targetDate, jobId: finalLog.jobId,
          runnerJobId: finalLog.runnerJobId, createdAt: finalLog.createdAt, uploadedUrl: finalLog.uploadedUrl,
          status: finalLog.status, metadata: promotedMetadata, evidenceUrl });
        if (provenance) return attachServerCaptureProvenance(promotedMetadata, provenance);
      }
    }
  }
  const latestRef = logs.find(row => row.uploadedUrl === evidenceUrl) ?? null;
  const [latestLog] = latestRef ? await auditReadOnce(readContext, 'audit:log:' + latestRef.id,
    async () => db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, latestRef.id)).limit(1)) : [];
  if (!latestLog || !isPlainObject(latestLog.metadata)) return null;
  const metadata = { ...latestLog.metadata };
  const provenance = correlateCaptureLogProvenance({ targetDate: latestLog.targetDate, jobId: latestLog.jobId,
    runnerJobId: latestLog.runnerJobId, createdAt: latestLog.createdAt, uploadedUrl: latestLog.uploadedUrl,
    status: latestLog.status, metadata, evidenceUrl });
  return provenance ? attachServerCaptureProvenance(metadata, provenance) : metadata;
}

export async function resolveAuditChecklist(input: { insertionId: number; date: string; readContext?: AuditChecklistReadContext }): Promise<AuditChecklistContract> {
  const targetDate = normalizeDateKey(input.date);
  const blockingIssues: AuditChecklistIssue[] = [];
  const warnings: AuditChecklistIssue[] = [];
  const bundle = await auditReadOnce(input.readContext, 'audit:bundle:' + input.insertionId, () => loadInsertionBundle(input.insertionId));
  if (!bundle) {
    return {
      ok: false,
      version: AUDIT_CHECKLIST_VERSION,
      insertionId: input.insertionId,
      targetDate,
      blockingIssues: [
        issue("insertion_not_found", "insertion", "Inserção não encontrada", `Nenhuma inserção ${input.insertionId} foi encontrada.`),
      ],
      warnings,
    };
  }

  const siteSigla = (bundle.site?.sigla ?? "").trim().toUpperCase();
  if (!siteSigla) {
    blockingIssues.push(issue("site_sigla_missing", "site", "Site sem sigla", "A inserção não possui site/sigla para resolver a regra de captura."));
  }

  const localFormato = bundle.insertion.localFormatoNormalizado ?? bundle.insertion.localFormato;
  const groupId = siteSigla ? getAdRotateGroupId(siteSigla, localFormato) : null;
  if (!groupId) {
    blockingIssues.push(issue(
      "group_not_resolved",
      "resolvedRule",
      "Grupo AdRotate não resolvido",
      `Não foi possível resolver grupo para site=${siteSigla || "n/a"} formato=${localFormato || "n/a"}.`,
    ));
  }

  const start = parseDateOnly(bundle.insertion.periodoInicio);
  const end = parseDateOnly(bundle.insertion.periodoFim);
  const current = parseDateOnly(targetDate);
  const inPeriod = Boolean(start && end && current && current >= start && current <= end);
  if (!inPeriod) {
    blockingIssues.push(issue(
      "date_out_of_period",
      "period",
      "Data fora do período",
      `A data ${targetDate} não está dentro de ${bundle.insertion.periodoInicio || "n/a"}..${bundle.insertion.periodoFim || "n/a"}.`,
    ));
  }

  if (!bundle.insertion.mediaUrl) {
    blockingIssues.push(issue("media_missing", "expectedMedia", "Mídia ausente", "A inserção não possui mediaUrl vinculada."));
  }

  if (blockingIssues.some((item) => ["site_sigla_missing", "group_not_resolved"].includes(item.code)) || !siteSigla || !groupId) {
    return {
      ok: false,
      version: AUDIT_CHECKLIST_VERSION,
      insertionId: input.insertionId,
      targetDate,
      blockingIssues,
      warnings,
    };
  }

  const publishedRule = await auditReadOnce(input.readContext, 'audit:rule:' + siteSigla + ':' + groupId, () => resolvePublishedRule(siteSigla, groupId));
  const configMapping = getSiteFormatMapping(siteSigla, localFormato);
  if (!publishedRule && !configMapping) {
    return {
      ok: false,
      version: AUDIT_CHECKLIST_VERSION,
      insertionId: input.insertionId,
      targetDate,
      blockingIssues: [
        ...blockingIssues,
        issue(
          "capture_rule_not_found",
          "resolvedRule",
          "Regra de captura ausente",
          `Não existe regra publicada nem fallback JSON para ${siteSigla}:${groupId}.`,
        ),
      ],
      warnings,
    };
  }

  const ruleConfig = isPlainObject(publishedRule?.auditConfig) ? publishedRule.auditConfig : {};
  const auditConfig = mergeAuditConfig(siteSigla, groupId, ruleConfig);
  const resolvedRule: ResolvedRule = publishedRule
    ? {
        source: "capture_rules",
        ruleId: publishedRule.id,
        ruleVersionHash: publishedRule.ruleVersionHash ?? null,
        siteSigla,
        groupId,
        page: publishedRule.page,
        slotSelector: publishedRule.slotSelector,
        contextSelector: publishedRule.contextSelector || publishedRule.slotSelector,
        scrollMode: publishedRule.scrollMode,
        proofStyle: publishedRule.proofStyle,
        auditConfig,
      }
    : {
        source: "config/adrotate-sites.json",
        ruleId: null,
        ruleVersionHash: null,
        siteSigla,
        groupId,
        page: configMapping!.page,
        slotSelector: configMapping!.slotSelector,
        contextSelector: configMapping!.contextSelector || configMapping!.slotSelector,
        scrollMode: configMapping!.scrollMode ?? "slot",
        proofStyle: configMapping!.proofStyle ?? "viewport_only",
        auditConfig,
      };

  if (resolvedRule.source === "config/adrotate-sites.json") {
    warnings.push(issue(
      "capture_rule_json_fallback",
      "resolvedRule",
      "Regra usando fallback JSON",
      `A regra ${siteSigla}:${groupId} não está publicada no banco; usando config/adrotate-sites.json.`,
      "warning",
    ));
  }

  if (blockingIssues.length > 0) {
    return {
      ok: false,
      version: AUDIT_CHECKLIST_VERSION,
      insertionId: input.insertionId,
      targetDate,
      blockingIssues,
      warnings,
    };
  }

  return {
    ok: true,
    version: AUDIT_CHECKLIST_VERSION,
    insertion: {
      id: bundle.insertion.id,
      campaignId: bundle.insertion.campanhaId,
      campaignName: bundle.campaign?.nome ?? null,
      piCodigo: bundle.campaign?.piCodigo ?? null,
      siteId: bundle.insertion.siteId ?? null,
      siteSigla,
      localFormato: bundle.insertion.localFormato,
      localFormatoNormalizado: bundle.insertion.localFormatoNormalizado,
      statusNormalizado: bundle.insertion.statusNormalizado,
    },
    period: {
      start: bundle.insertion.periodoInicio,
      end: bundle.insertion.periodoFim,
      targetDate,
      inPeriod,
    },
    expectedMedia: {
      mediaUrl: normalizeSiteMediaUrl(bundle.insertion.mediaUrl),
      mediaBasename: mediaBasename(bundle.insertion.mediaUrl),
    },
    expectedSelectors: {
      slotSelector: resolvedRule.slotSelector,
      contextSelector: resolvedRule.contextSelector,
      groupId,
    },
    resolvedRule,
    requiredGates: buildRequiredGates(localFormato, auditConfig),
    warnings,
  };
}

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function metadataObject(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return isPlainObject(value) ? value : null;
}

function metadataBoolean(metadata: Record<string, unknown> | null, key: string) {
  return metadata?.[key] === true;
}

function addBaseAuditIssues(audit: ReturnType<typeof evaluateCaptureMetadata> | null, issues: AuditChecklistIssue[]) {
  if (!audit || !Array.isArray(audit.issues)) return;
  for (const item of audit.issues) {
    issues.push(issue(
      `metadata_${item.code}`,
      "captureMetadata",
      item.label,
      item.detail,
      "blocking",
    ));
  }
}

export function validatePerrengueRetroEditorialChecklistGate(input: {
  captureClass: string | null | undefined;
  siteSigla: string;
  page: string;
  retroGate: Record<string, unknown> | null;
}): AuditChecklistIssue[] {
  if (input.captureClass !== "historical_recovery" || !requiresPerrengueHomeEditorialAudit(input.siteSigla, input.page)) return [];
  const editorialMemeLeaks = Array.isArray(input.retroGate?.editorialMemeLeaks)
    ? input.retroGate.editorialMemeLeaks
    : null;
  if (input.retroGate?.editorialContentMatches !== true || editorialMemeLeaks === null) {
    return [issue(
      "retro_editorial_audit_missing",
      "retroGate",
      "Auditoria editorial retroativa ausente",
      "Perrengue exige editorialContentMatches=true e editorialMemeLeaks presente antes de liberar a prova.",
    )];
  }
  if (editorialMemeLeaks.length > 0) {
    return [issue(
      "retro_editorial_meme_leak",
      "retroGate",
      "Memes do Vovo em area editorial bloqueada",
      `Destaques e Agora nao podem conter Memes do Vovo. Ocorrencias: ${JSON.stringify(editorialMemeLeaks)}.`,
    )];
  }
  return [];
}

export function resolveChecklistCaptureWindowAt(
  audit: Pick<ReturnType<typeof evaluateCaptureMetadata>, "captureClass" | "targetDate" | "capturedAt" | "requestedCaptureAt"> | null,
  targetDate: string,
  now = new Date(),
  preUploadReceivedAt?: Date,
) {
  if (audit?.captureClass === "scheduled" || audit?.captureClass === "same_day_retry") {
    if (audit.targetDate !== targetDate || !audit.capturedAt || isFutureCaptureAt(audit.capturedAt, now)) return null;
    return audit.capturedAt;
  }
  if (preUploadReceivedAt && formatIsoDate(preUploadReceivedAt) === targetDate && !isFutureCaptureAt(preUploadReceivedAt.toISOString(), now)) {
    return preUploadReceivedAt.toISOString();
  }
  return audit?.requestedCaptureAt ?? null;
}

export function resolveChecklistEditorialCaptureClass(input: {
  trustedCaptureClass: string | null | undefined;
  phase?: "pre_upload" | "final";
  targetDate: string;
  preUploadReceivedAt?: Date;
}) {
  if (
    input.phase === "pre_upload" &&
    input.preUploadReceivedAt &&
    input.targetDate < formatIsoDate(input.preUploadReceivedAt)
  ) return "historical_recovery";
  return input.trustedCaptureClass ?? null;
}

export function requiresHistoricalEditorialChecklist(input: {
  trustedCaptureClass: string | null | undefined;
  phase?: "pre_upload" | "final";
  targetDate: string;
  preUploadReceivedAt?: Date;
  now?: Date;
}) {
  const captureClass = resolveChecklistEditorialCaptureClass(input);
  return captureClass === "historical_recovery" || (
    input.phase !== "pre_upload" && !captureClass &&
    requiresRetroEditorialProof(input.targetDate, input.now)
  );
}

export async function validateAuditChecklist(input: {
  readContext?: AuditChecklistReadContext;
  insertionId: number;
  date: string;
  metadata?: unknown;
  phase?: "pre_upload" | "final";
  candidateFinalPageClock?: boolean;
  preUploadReceivedAt?: Date;
  preUploadUntrustedMetadata?: unknown;
}): Promise<AuditChecklistValidation> {
  const date = normalizeDateKey(input.date);
  const contract = await resolveAuditChecklist({ insertionId: input.insertionId, date, readContext: input.readContext });
  const warnings = [...contract.warnings];
  const blockingIssues: AuditChecklistIssue[] = contract.ok ? [] : [...contract.blockingIssues];
  const loadedMetadata = input.metadata === undefined
    ? await loadAuditChecklistMetadata(input.insertionId, date, input.readContext)
    : input.metadata;
  const metadata = isPlainObject(loadedMetadata) ? loadedMetadata : null;
  const finalPageClockRequired = input.candidateFinalPageClock === true && contract.ok && contract.requiredGates.requireVisiblePageDate;
  const audit = evaluateCaptureMetadata(metadata, date, new Date(), {
    finalPageClockRequired,
    preUploadReceivedAt: input.phase === "pre_upload" ? input.preUploadReceivedAt : undefined,
  });
  const acceptanceMetadata = input.phase === "pre_upload" ? input.preUploadUntrustedMetadata : metadata;
  let publicationAcceptance: AuditChecklistValidation["publicationAcceptance"] = null;
  if (isPlainObject(acceptanceMetadata)
    && acceptanceMetadata.capturePurpose === "publication_acceptance"
    && typeof acceptanceMetadata.sourceJobId === "string"
    && /^[A-Za-z0-9._:-]{1,160}$/.test(acceptanceMetadata.sourceJobId)) {
    const [job] = await db.select().from(printJobsTable).where(eq(printJobsTable.id, acceptanceMetadata.sourceJobId)).limit(1);
    publicationAcceptance = publicationAcceptanceReceipt({
      insertionId: input.insertionId, date, phase: input.phase, metadata: acceptanceMetadata, audit, job,
      receivedAt: input.phase === "pre_upload" ? input.preUploadReceivedAt ?? new Date() : new Date(),
    });
  }
  const reconstruction = metadata?.reconstruction && typeof metadata.reconstruction === "object"
    ? metadata.reconstruction as Record<string, unknown>
    : null;
  const isTrustedOriginalOmtLiveCapture = contract.ok
    && contract.insertion.siteSigla === "OMT"
    && input.phase !== "pre_upload"
    && (audit?.captureClass === "scheduled" || audit?.captureClass === "same_day_retry")
    && audit.targetDate === date
    && typeof audit.capturedAt === "string"
    && formatIsoDate(new Date(audit.capturedAt)) === date
    && audit.retroContentProof?.sourceMode !== "signed_preview"
    && audit.retroContentProof?.sourceMode !== "audited_reconstruction"
    && audit.retroContentProof?.reconstructed !== true
    && reconstruction?.reconstructed !== true
    && reconstruction?.sourceMode !== "signed_preview"
    && reconstruction?.sourceMode !== "audited_reconstruction"
    && !["late_publication_recovery", "historical_recovery"].includes(String(reconstruction?.reason ?? ""));
  const canonicalOmtLiveClockAt = contract.ok
    && contract.insertion.siteSigla === "OMT"
    && !audit?.requestedCaptureAt
    ? input.phase === "pre_upload"
      ? date === formatIsoDate(new Date())
        && input.preUploadReceivedAt
        && formatIsoDate(input.preUploadReceivedAt) === date
        && !isFutureCaptureAt(input.preUploadReceivedAt.toISOString())
        ? input.preUploadReceivedAt
        : null
      : isTrustedOriginalOmtLiveCapture
        ? audit.capturedAt
        : null
    : null;
  const historicalEditorialAuditRequired = requiresHistoricalEditorialChecklist({
    trustedCaptureClass: audit?.captureClass,
    phase: input.phase,
    targetDate: date,
    preUploadReceivedAt: input.preUploadReceivedAt,
  });

  if (!metadata) {
    blockingIssues.push(issue(
      "capture_metadata_missing",
      "captureMetadata",
      "Metadado de captura ausente",
      `A evidência ${input.insertionId}/${date} não possui metadata para validar o checklist.`,
    ));
  }

  addBaseAuditIssues(audit, blockingIssues);
  let captureWindowException: AuditChecklistValidation["captureWindowException"] = null;
  if (canonicalOmtLiveClockAt && metadata) {
    const expectedClock = formatCuiabaClockAt(canonicalOmtLiveClockAt);
    const systemDateTime = typeof metadata.systemDateTime === "string" ? metadata.systemDateTime : "";
    const pageDateObserved = typeof metadata.pageDateObserved === "string" ? metadata.pageDateObserved : "";
    const pageDateText = typeof metadata.pageDateText === "string" ? metadata.pageDateText : "";
    const visiblePageClock = pageDateObserved || pageDateText;
    // This adds a second clock check against the server receipt. Existing date,
    // requested-time, and capture-integrity issues remain blocking.
    if (expectedClock && !pageTextMatchesCaptureReceiptAt(systemDateTime, expectedClock)) {
      blockingIssues.push(issue(
        "metadata_desktop_time_mismatch",
        "captureMetadata",
        "Relógio visível do OMT diverge da captura",
        `A hora visível precisa corresponder ao instante real da captura em America/Cuiaba (tolerância existente de 90 s). Esperado ${expectedClock}; encontrado ${systemDateTime || "ausente"}.`,
      ));
    }
    if (expectedClock && !pageTextMatchesCaptureReceiptAt(visiblePageClock, expectedClock)) {
      blockingIssues.push(issue(
        "page_time_mismatch",
        "captureMetadata",
        "Relógio da página do OMT diverge da captura",
        `A hora visível no site precisa corresponder ao instante real da captura em America/Cuiaba (tolerância existente de 90 s). Esperado ${expectedClock}; encontrado ${visiblePageClock || "ausente"}.`,
      ));
    }
  }
  if (input.phase === "pre_upload") {
    // Temporal provenance can only be trusted after the artifact and child job
    // are persisted.  Pre-upload is deliberately a visual/mechanical gate;
    // the canonical audit still runs after persistence and keeps these issues.
    for (let index = blockingIssues.length - 1; index >= 0; index -= 1) {
      if (["metadata_retro_content_unverified", "metadata_capture_class_untrusted"].includes(blockingIssues[index]!.code)) {
        blockingIssues.splice(index, 1);
      }
    }
  }

  if (contract.ok && metadata) {
    const { requiredGates, expectedSelectors, expectedMedia, resolvedRule } = contract;
    const slotSelector = metadataString(metadata, "canonicalSlotSelector") || metadataString(metadata, "slotSelector");
    const contextSelector = metadataString(metadata, "canonicalContextSelector") || metadataString(metadata, "contextSelector");
    const siteSigla = metadataString(metadata, "siteSigla").toUpperCase();
    const finalPngSlotAudit = metadataObject(metadata, "finalPngSlotAudit");
    const stickyHeaderViewportAudit = metadataObject(metadata, "stickyHeaderViewportAudit");
    const finalPngStickyHeaderAudit = metadataObject(metadata, "finalPngStickyHeaderAudit");
    const retroGate = metadataObject(metadata, "retroGate");
    const creativePlacementAudit = metadataObject(metadata, "creativePlacementAudit");
    const pageScrollMetrics = metadataObject(metadata, "pageScrollMetrics");
    const readinessAudit = metadataObject(metadata, "readinessAudit");
    const metadataRequiredGates = metadataObject(metadata, "requiredGates");
    const relativeContentTimeline = isPlainObject(retroGate?.relativeContentTimeline)
      ? retroGate.relativeContentTimeline
      : null;
    const matchedMediaUrl = metadataString(metadata, "matchedMediaUrl");
    const requestedCaptureAt = metadataString(metadata, "requestedCaptureAt");

    if (siteSigla && siteSigla !== contract.insertion.siteSigla) {
      blockingIssues.push(issue(
        "metadata_site_mismatch",
        "site",
        "Site do metadata diverge",
        `Esperado ${contract.insertion.siteSigla}; encontrado ${siteSigla}.`,
      ));
    }

    if (slotSelector !== expectedSelectors.slotSelector) {
      blockingIssues.push(issue(
        "slot_selector_mismatch",
        "resolvedRule",
        "Slot do print diverge da regra",
        `Esperado ${expectedSelectors.slotSelector}; encontrado ${slotSelector || "ausente"}.`,
      ));
    }
    if (contextSelector !== expectedSelectors.contextSelector) {
      blockingIssues.push(issue(
        "context_selector_mismatch",
        "resolvedRule",
        "Contexto do print diverge da regra",
        `Esperado ${expectedSelectors.contextSelector}; encontrado ${contextSelector || "ausente"}.`,
      ));
    }
    if (audit?.auditContext?.resolvedGroupId !== expectedSelectors.groupId) {
      blockingIssues.push(issue(
        "group_id_mismatch",
        "resolvedRule",
        "Grupo resolvido diverge",
        `Esperado grupo ${expectedSelectors.groupId}; auditoria resolveu ${audit?.auditContext?.resolvedGroupId ?? "n/a"}.`,
      ));
    }

    if (expectedMedia.mediaBasename && !matchedMediaUrl.includes(expectedMedia.mediaBasename)) {
      blockingIssues.push(issue(
        "expected_media_mismatch",
        "expectedMedia",
        "Mídia capturada diverge",
        `Esperado arquivo/id ${expectedMedia.mediaBasename}; encontrado ${matchedMediaUrl || "ausente"}.`,
      ));
    }

    const captureWindowAt = resolveChecklistCaptureWindowAt(
      audit,
      date,
      new Date(),
      input.phase === "pre_upload" ? input.preUploadReceivedAt : undefined,
    );
    const exceptionTuple = contract.ok
      ? CAPTURE_WINDOW_EXCEPTION.allowlisted.find((item) =>
        item.insertionId === input.insertionId
        && item.siteSigla === contract.insertion.siteSigla
        && item.piCodigo === contract.insertion.piCodigo
        && item.groupId === contract.expectedSelectors.groupId)
      : null;
    const exceptionActualAt = input.phase === "pre_upload"
      ? input.preUploadReceivedAt?.toISOString() ?? null
      : audit?.capturedAt ?? null;
    const exceptionInstant = exceptionActualAt ? new Date(exceptionActualAt) : null;
    const approvalStart = new Date(CAPTURE_WINDOW_EXCEPTION.approvedAt);
    const approvalEnd = new Date(CAPTURE_WINDOW_EXCEPTION.expiresAt);
    captureWindowException = contract.ok
      && exceptionTuple
      && date === CAPTURE_WINDOW_EXCEPTION.targetDate
      && input.phase === "pre_upload"
        ? Boolean(exceptionInstant
          && input.preUploadReceivedAt
          && !audit?.requestedCaptureAt
          && formatCuiabaDateAt(exceptionInstant) === CAPTURE_WINDOW_EXCEPTION.targetDate
          && exceptionInstant.getTime() >= approvalStart.getTime()
          && exceptionInstant.getTime() <= approvalEnd.getTime())
          && !isFutureCaptureAt(exceptionInstant.toISOString())
          ? {
            approvalRef: CAPTURE_WINDOW_EXCEPTION.approvalRef,
            approvedAt: CAPTURE_WINDOW_EXCEPTION.approvedAt,
            expiresAt: CAPTURE_WINDOW_EXCEPTION.expiresAt,
            actualAt: exceptionInstant.toISOString(),
            late: true as const,
            targetDate: date,
            insertionId: input.insertionId,
            siteSigla: exceptionTuple.siteSigla,
            piCodigo: exceptionTuple.piCodigo,
            groupId: exceptionTuple.groupId,
            limitation: "Exceção limitada à janela de captura desta aprovação; não substitui outros gates nem valida publicação externa.",
          }
          : null
        : contract.ok
          && exceptionTuple
          && date === CAPTURE_WINDOW_EXCEPTION.targetDate
          && input.phase !== "pre_upload"
          && (audit?.captureClass === "scheduled" || audit?.captureClass === "same_day_retry")
          && audit.targetDate === date
          && !audit.requestedCaptureAt
          && typeof audit.capturedAt === "string"
          && formatCuiabaDateAt(audit.capturedAt) === CAPTURE_WINDOW_EXCEPTION.targetDate
          && !isFutureCaptureAt(audit.capturedAt)
          && audit.retroContentProof?.sourceMode !== "signed_preview"
          && audit.retroContentProof?.sourceMode !== "audited_reconstruction"
          && audit.retroContentProof?.reconstructed !== true
          && reconstruction?.reconstructed !== true
          && reconstruction?.sourceMode !== "signed_preview"
          && reconstruction?.sourceMode !== "audited_reconstruction"
          && !["late_publication_recovery", "historical_recovery"].includes(String(reconstruction?.reason ?? ""))
          && exceptionInstant
          && exceptionInstant.getTime() >= approvalStart.getTime()
          && exceptionInstant.getTime() <= approvalEnd.getTime()
          ? {
            approvalRef: CAPTURE_WINDOW_EXCEPTION.approvalRef,
            approvedAt: CAPTURE_WINDOW_EXCEPTION.approvedAt,
            expiresAt: CAPTURE_WINDOW_EXCEPTION.expiresAt,
            actualAt: exceptionInstant.toISOString(),
            late: true as const,
            targetDate: date,
            insertionId: input.insertionId,
            siteSigla: exceptionTuple.siteSigla,
            piCodigo: exceptionTuple.piCodigo,
            groupId: exceptionTuple.groupId,
            limitation: "Exceção limitada à captura original correlacionada desta aprovação; não substitui outros gates nem valida publicação externa.",
          }
          : null;
    if ((!captureWindowAt || !isCaptureAtInRetroWindow(captureWindowAt)) && !captureWindowException && !publicationAcceptance) {
      blockingIssues.push(issue(
        "capture_time_outside_window",
        "captureTimeWindow",
        "Horário fora da janela",
        `captureAt precisa ficar entre 18:00 e 21:59 America/Cuiaba. Encontrado: ${captureWindowAt || "ausente"}.`,
      ));
    }
    if (publicationAcceptance) {
      warnings.push(issue(
        "publication_acceptance_actual_time", "captureTimeWindow", "Aceitação adicional em horário real",
        `Job ${publicationAcceptance.sourceJobId}; captura ${publicationAcceptance.actualAt}. Não substitui a evidência diária nem altera a janela de retroativos.`, "warning",
      ));
    }

    if (requiredGates.requireFrameV4) {
      const frameTemplate = metadataString(metadata, "frameTemplateVersion");
      if (!REQUIRED_FRAME_TEMPLATES.has(frameTemplate)) {
        blockingIssues.push(issue(
          "frame_template_mismatch",
          "requireFrameV4",
          "Moldura oficial ausente",
          `Esperado um de ${[...REQUIRED_FRAME_TEMPLATES].join(", ")}; encontrado ${frameTemplate || "ausente"}.`,
        ));
      }
      if (metadataString(metadata, "chromeTopTheme") !== "light") {
        blockingIssues.push(issue(
          "chrome_theme_mismatch",
          "requireFrameV4",
          "Tema Chrome incorreto",
          `Esperado chromeTopTheme=light; encontrado ${metadataString(metadata, "chromeTopTheme") || "ausente"}.`,
        ));
      }
      if (metadataBoolean(metadata, "frameStrictAssetsOk") !== true) {
        blockingIssues.push(issue(
          "frame_assets_missing",
          "requireFrameV4",
          "Assets da moldura incompletos",
          "frameStrictAssetsOk precisa ser true.",
        ));
      }
      if (metadata?.tabIconFallback === true) {
        blockingIssues.push(issue(
          "tab_icon_fallback",
          "requireFrameV4",
          "Ícone da aba em fallback",
          "tabIconFallback=true não é aceito para evidência final.",
        ));
      }
    }

    if (requiredGates.requireScrollbar && metadataBoolean(metadata, "scrollbarRendered") !== true) {
      blockingIssues.push(issue(
        "scrollbar_missing",
        "requireScrollbar",
        "Barra de rolagem ausente",
        `scrollbarRendered precisa ser true. pageScrollMetrics=${JSON.stringify(pageScrollMetrics ?? {})}.`,
      ));
    }

    if (requiredGates.requireIdentityFrame && metadataBoolean(metadata, "identityFrameOk") !== true) {
      blockingIssues.push(issue(
        "identity_frame_missing",
        "requireIdentityFrame",
        "Frame sem identidade da campanha",
        "identityFrameOk precisa ser true.",
      ));
    }

    if (requiredGates.requireSlotVisibleInViewport && metadataObject(metadata, "slotVisibility")?.mostlyVisible !== true) {
      blockingIssues.push(issue(
        "slot_not_visible_in_viewport",
        "requireSlotVisibleInViewport",
        "Slot fora da área visível",
        "slotVisibility.mostlyVisible precisa ser true.",
      ));
    }

    if (requiredGates.requireFinalPngSlotAudit) {
      if (!finalPngSlotAudit) {
        blockingIssues.push(issue(
          "final_png_slot_audit_missing",
          "requireFinalPngSlotAudit",
          "Auditoria final do PNG ausente",
          "finalPngSlotAudit é obrigatório para a imagem entregue ao cliente.",
        ));
      } else if (finalPngSlotAudit.ok !== true) {
        blockingIssues.push(issue(
          "final_png_slot_audit_failed",
          "requireFinalPngSlotAudit",
          "Banner não comprovado no PNG final",
          `finalPngSlotAudit.ok=false: ${JSON.stringify(finalPngSlotAudit.issues ?? [])}.`,
        ));
      }
    }

    if (requiredGates.requireStickyHeaderInViewport) {
      if (stickyHeaderViewportAudit?.ok !== true) {
        blockingIssues.push(issue(
          "sticky_header_missing",
          "requireStickyHeaderInViewport",
          "Header sticky ausente",
          `Esperado ${requiredGates.stickyHeaderExpected || "header sticky completo"}; stickyHeaderViewportAudit.ok precisa ser true.`,
        ));
      }
      if (finalPngStickyHeaderAudit && finalPngStickyHeaderAudit.ok !== true) {
        blockingIssues.push(issue(
          "final_png_sticky_header_failed",
          "requireStickyHeaderInViewport",
          "Header sticky falhou no PNG final",
          `finalPngStickyHeaderAudit.ok=false: ${JSON.stringify(finalPngStickyHeaderAudit.issues ?? [])}.`,
        ));
      }
    }

    if (retroGate?.ok !== true) {
      blockingIssues.push(issue(
        "retro_gate_failed",
        "retroGate",
        "Data/hora retroativa falhou",
        `retroGate.ok precisa ser true. Estado: ${JSON.stringify(retroGate ?? {})}.`,
      ));
    }
    if (historicalEditorialAuditRequired && requiredGates.requireAbsoluteEditorialDates && metadataRequiredGates?.requireAbsoluteEditorialDates === true) {
      if (
        !relativeContentTimeline
      ) {
        blockingIssues.push(issue(
          "relative_content_time_audit_missing",
          "requireAbsoluteEditorialDates",
          "Auditoria de datas editoriais ausente",
          "A prova histórica precisa registrar a varredura de textos relativos antes de ser aprovada.",
        ));
      } else if (relativeContentTimeline.ok !== true) {
        blockingIssues.push(issue(
          "relative_content_time_unresolved",
          "requireAbsoluteEditorialDates",
          "Data editorial relativa na prova",
          `A prova histórica ainda contém texto relativo: ${JSON.stringify(relativeContentTimeline.relativeSamples ?? [])}.`,
        ));
      }
      if (!audit.contentTimeline?.maxObserved) {
        blockingIssues.push(issue(
          "absolute_content_time_missing",
          "requireAbsoluteEditorialDates",
          "Data editorial absoluta ausente",
          "A prova histórica precisa registrar ao menos uma data editorial absoluta visível.",
        ));
      }
    }
    if (requiredGates.requireEditorialDateMatchTarget && metadataRequiredGates?.requireEditorialDateMatchTarget === true) {
      if (
        audit.contentTimeline?.targetDateMatches !== true
      ) {
        blockingIssues.push(issue(
          "editorial_date_target_mismatch",
          "requireEditorialDateMatchTarget",
          "Data interna da notícia divergente",
          `A notícia visível precisa corresponder a ${contract.period.targetDate}. Datas encontradas: ${audit.contentTimeline?.observedDates?.join(", ") || "nenhuma"}.`,
        ));
      }
    }
    if (requiredGates.requireVisiblePageDate && (metadataRequiredGates?.requireVisiblePageDate === true || finalPageClockRequired)) {
      const visiblePageDateAudit = metadataObject(metadata, "visiblePageDateAudit");
      if (
        visiblePageDateAudit?.ok !== true ||
        visiblePageDateAudit?.skipped === true
      ) {
        blockingIssues.push(issue(
          "visible_page_time_missing",
          "requireVisiblePageDate",
          "Data e hora do site ausentes",
          `A barra visível de data/hora precisa corresponder à captura. Estado: ${JSON.stringify(visiblePageDateAudit ?? {})}.`,
        ));
      }
    }
    blockingIssues.push(...validatePerrengueRetroEditorialChecklistGate({
      captureClass: resolveChecklistEditorialCaptureClass({
        trustedCaptureClass: audit?.captureClass,
        phase: input.phase,
        targetDate: date,
        preUploadReceivedAt: input.preUploadReceivedAt,
      }),
      siteSigla: contract.insertion.siteSigla,
      page: resolvedRule.page,
      retroGate,
    }));

    if (creativePlacementAudit?.ok !== true) {
      blockingIssues.push(issue(
        "creative_placement_failed",
        "creativePlacementAudit",
        "Criativo fora do slot",
        `creativePlacementAudit.ok precisa ser true. Estado: ${JSON.stringify(creativePlacementAudit ?? {})}.`,
      ));
    }

    if (requiredGates.requireNo404) {
      const pageStatus = metadata.pageStatus;
      const pageLooks404 = metadata.pageLooks404 === true || metadata.looks404 === true;
      if (pageLooks404 || (typeof pageStatus === "number" && pageStatus >= 400)) {
        blockingIssues.push(issue(
          "page_404_detected",
          "requireNo404",
          "Página com erro",
          `pageStatus=${typeof pageStatus === "number" ? pageStatus : "n/a"} pageLooks404=${pageLooks404}.`,
        ));
      } else if (pageStatus === undefined && metadata.pageLooks404 === undefined && metadata.looks404 === undefined) {
        warnings.push(issue(
          "page_status_metadata_missing",
          "requireNo404",
          "Metadata de 404 ainda não emitido",
          "A v1 valida o 404 quando o capturador envia pageStatus/pageLooks404; campo ausente fica como aviso até o runner emitir.",
          "warning",
        ));
      }
    }

    if (requiredGates.requireNoOverlay) {
      const overlayAudit = metadataObject(metadata, "overlayAudit");
      if (overlayAudit?.ok === false || metadata.overlayDetected === true) {
        blockingIssues.push(issue(
          "overlay_detected",
          "requireNoOverlay",
          "Overlay ou modal detectado",
          `overlayAudit=${JSON.stringify(overlayAudit ?? {})}; overlayDetected=${metadata.overlayDetected === true}.`,
        ));
      } else if (!overlayAudit && metadata.overlayDetected === undefined) {
        warnings.push(issue(
          "overlay_metadata_missing",
          "requireNoOverlay",
          "Metadata de overlay ainda não emitido",
          "A v1 valida overlay quando o capturador envia overlayAudit/overlayDetected; campo ausente fica como aviso até o runner emitir.",
          "warning",
        ));
      }
    }

    if (requiredGates.requireVideoControls) {
      const playerProof = evaluateVideoPlayerProof(metadata, true);
      if (!playerProof.ok) {
        blockingIssues.push(issue(
          "video_controls_missing",
          "requireVideoControls",
          "Controles do vídeo ausentes",
          `Progresso ${playerProof.nativeRequired ? "nativo no PNG final" : "do contrato legado"} não comprovado; controles=${playerProof.controlsVisible}, progresso=${playerProof.progressVisible}.`,
        ));
      }
    }

    const captureRequiresReadiness = metadataRequiredGates?.requireReadinessAudit === true || readinessAudit !== null;
    if (requiredGates.requireReadinessAudit && captureRequiresReadiness) {
      if (!readinessAudit) {
        blockingIssues.push(issue(
          "readiness_audit_missing",
          "requireReadinessAudit",
          "Readiness da captura ausente",
          "A captura declarou readiness estrito, mas não enviou readinessAudit.",
        ));
      } else if (readinessAudit.approved !== true) {
        blockingIssues.push(issue(
          "readiness_audit_failed",
          "requireReadinessAudit",
          "Conteúdo crítico não carregou",
          `readinessAudit.approved precisa ser true. Estado: ${JSON.stringify(readinessAudit)}.`,
        ));
      }
    }

    if (requiredGates.requireGifAllowedFrameRanges) {
      const frame = Number(metadata.gifChosenFrameIndex);
      const allowed = Number.isFinite(frame) && requiredGates.gifAllowedFrameRanges.some(([start, end]) => frame >= start && frame <= end);
      if (!allowed) {
        blockingIssues.push(issue(
          "gif_frame_outside_allowed_range",
          "gifAllowedFrameRanges",
          "Frame do GIF não aprovado",
          `Frame ${Number.isFinite(frame) ? frame : "ausente"} fora dos intervalos ${requiredGates.gifAllowedFrameRanges.map(([start, end]) => `${start}-${end}`).join(", ")}.`,
        ));
      }
    }

    if (resolveChecklistFinalProofStyle(resolvedRule.proofStyle, metadata) === "viewport_with_slot_inset") {
      blockingIssues.push(issue(
        "proof_style_inset_forbidden",
        "proofStyle",
        "Evidência final com inset artificial",
        "viewport_with_slot_inset não aprova evidência final de cliente.",
      ));
    }
  }

  const decision = decideAuditChecklistApproval({
    phase: input.phase,
    contractOk: contract.ok,
    metadataPresent: Boolean(metadata),
    auditOk: audit?.ok === true,
    blockingIssues,
  });
  const issues = [...decision.blockingIssues, ...warnings];
  return {
    approved: decision.approved,
    preliminary: input.phase === "pre_upload",
    version: AUDIT_CHECKLIST_VERSION,
    insertionId: input.insertionId,
    date,
    contract,
    metadataPresent: Boolean(metadata),
    audit,
    issues,
    blockingIssues: decision.blockingIssues,
    warnings,
    evidenceStatus: decision.approved ? "approved" : "blocked",
    captureWindowException: captureWindowException ?? null,
    publicationAcceptance: publicationAcceptance ?? null,
  };
}
