import { and, desc, eq, inArray } from "drizzle-orm";
import {
  campaignsTable,
  captureProofLogsTable,
  captureRulesTable,
  db,
  evidencesTable,
  insertionsTable,
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
  isCaptureAtInRetroWindow,
  parseDateOnly,
} from "./capture-audit";
import {
  requiresPerrengueHomeEditorialAudit,
  resolveChecklistFinalProofStyle,
} from "./proof-style-contract";

export const AUDIT_CHECKLIST_VERSION = "audit-checklist-v1" as const;
const REQUIRED_FRAME_TEMPLATE = "windows11-chrome-light-similar-v4";

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
};

function issue(
  code: string,
  gate: string,
  label: string,
  detail: string,
  severity: Severity = "blocking",
): AuditChecklistIssue {
  return { code, severity, gate, label, detail };
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
    requireGifAllowedFrameRanges: ranges.length > 0,
    gifAllowedFrameRanges: ranges,
  };
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

export async function loadAuditChecklistMetadata(insertionId: number, targetDate: string) {
  const dateKey = normalizeDateKey(targetDate);
  const logs = await db.select().from(captureProofLogsTable).where(
    and(
      eq(captureProofLogsTable.insertionId, insertionId),
      eq(captureProofLogsTable.targetDate, dateKey),
      inArray(captureProofLogsTable.status, ["ok", "pending_audit"]),
    ),
  ).orderBy(desc(captureProofLogsTable.createdAt)).limit(50);
  const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
  const evidenceUrl = evidenceRows.find((row) => String(row.titulo || "").includes(dateKey))?.arquivoUrl ?? null;
  const latestLog = logs.find((row) => row.uploadedUrl === evidenceUrl) ?? logs[0];
  if (!latestLog || !isPlainObject(latestLog.metadata)) return null;
  const metadata = { ...latestLog.metadata };
  const provenance = correlateCaptureLogProvenance({
    targetDate: latestLog.targetDate,
    jobId: latestLog.jobId,
    runnerJobId: latestLog.runnerJobId,
    createdAt: latestLog.createdAt,
    uploadedUrl: latestLog.uploadedUrl,
    status: latestLog.status,
    metadata,
    evidenceUrl,
  });
  return provenance ? attachServerCaptureProvenance(metadata, provenance) : metadata;
}

export async function resolveAuditChecklist(input: { insertionId: number; date: string }): Promise<AuditChecklistContract> {
  const targetDate = normalizeDateKey(input.date);
  const blockingIssues: AuditChecklistIssue[] = [];
  const warnings: AuditChecklistIssue[] = [];
  const bundle = await loadInsertionBundle(input.insertionId);
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

  const publishedRule = await resolvePublishedRule(siteSigla, groupId);
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

export async function validateAuditChecklist(input: {
  insertionId: number;
  date: string;
  metadata?: unknown;
  phase?: "pre_upload" | "final";
}): Promise<AuditChecklistValidation> {
  const date = normalizeDateKey(input.date);
  const contract = await resolveAuditChecklist({ insertionId: input.insertionId, date });
  const warnings = [...contract.warnings];
  const blockingIssues: AuditChecklistIssue[] = contract.ok ? [] : [...contract.blockingIssues];
  const loadedMetadata = input.metadata === undefined
    ? await loadAuditChecklistMetadata(input.insertionId, date)
    : input.metadata;
  const metadata = isPlainObject(loadedMetadata) ? loadedMetadata : null;
  const audit = evaluateCaptureMetadata(metadata, date);

  if (!metadata) {
    blockingIssues.push(issue(
      "capture_metadata_missing",
      "captureMetadata",
      "Metadado de captura ausente",
      `A evidência ${input.insertionId}/${date} não possui metadata para validar o checklist.`,
    ));
  }

  addBaseAuditIssues(audit, blockingIssues);
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
    const videoProof = metadataObject(metadata, "videoProof");
    const readinessAudit = metadataObject(metadata, "readinessAudit");
    const metadataRequiredGates = metadataObject(metadata, "requiredGates");
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

    if (!requestedCaptureAt || !isCaptureAtInRetroWindow(requestedCaptureAt)) {
      blockingIssues.push(issue(
        "capture_time_outside_window",
        "captureTimeWindow",
        "Horário fora da janela",
        `captureAt precisa ficar entre 18:00 e 21:59 America/Cuiaba. Encontrado: ${requestedCaptureAt || "ausente"}.`,
      ));
    }

    if (requiredGates.requireFrameV4) {
      const frameTemplate = metadataString(metadata, "frameTemplateVersion");
      if (frameTemplate !== REQUIRED_FRAME_TEMPLATE) {
        blockingIssues.push(issue(
          "frame_template_mismatch",
          "requireFrameV4",
          "Moldura oficial ausente",
          `Esperado ${REQUIRED_FRAME_TEMPLATE}; encontrado ${frameTemplate || "ausente"}.`,
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
    if (requiresPerrengueHomeEditorialAudit(contract.insertion.siteSigla, resolvedRule.page)) {
      const editorialMemeLeaks = Array.isArray(retroGate?.editorialMemeLeaks)
        ? retroGate.editorialMemeLeaks
        : null;
      if (retroGate?.editorialContentMatches !== true || editorialMemeLeaks === null) {
        blockingIssues.push(issue(
          "retro_editorial_audit_missing",
          "retroGate",
          "Auditoria editorial retroativa ausente",
          "Perrengue exige editorialContentMatches=true e editorialMemeLeaks presente antes de liberar a prova.",
        ));
      } else if (editorialMemeLeaks.length > 0) {
        blockingIssues.push(issue(
          "retro_editorial_meme_leak",
          "retroGate",
          "Memes do Vovo em area editorial bloqueada",
          `Destaques e Agora nao podem conter Memes do Vovo. Ocorrencias: ${JSON.stringify(editorialMemeLeaks)}.`,
        ));
      }
    }

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
      if (
        videoProof?.ok !== true ||
        videoProof.controls !== true ||
        !((videoProof.progressVisible === true) || (videoProof.overlayInjected === true)) ||
        Number(videoProof.currentTime ?? 0) <= 0.5 ||
        Number(videoProof.duration ?? 0) <= 0
      ) {
        blockingIssues.push(issue(
          "video_controls_missing",
          "requireVideoControls",
          "Controles do vídeo ausentes",
          `videoProof inválido: ${JSON.stringify(videoProof ?? {})}.`,
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

  const issues = [...blockingIssues, ...warnings];
  const approved = blockingIssues.length === 0 && audit?.ok === true && contract.ok === true;
  return {
    approved,
    version: AUDIT_CHECKLIST_VERSION,
    insertionId: input.insertionId,
    date,
    contract,
    metadataPresent: Boolean(metadata),
    audit,
    issues,
    blockingIssues,
    warnings,
    evidenceStatus: approved ? "approved" : "blocked",
  };
}
