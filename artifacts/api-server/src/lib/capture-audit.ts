import { getSiteFormatMappingByContext, getSiteIntegration } from "./adrotate-sites";

export function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizePtText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function extractPageDateParts(value: string | null | undefined) {
  const normalized = normalizePtText(value);
  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { day: iso[3], month: iso[2], year: iso[1] };
  }
  const numeric = normalized.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (numeric) {
    return { day: numeric[1], month: numeric[2], year: numeric[3] };
  }
  const longForm = normalized.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/);
  if (longForm) {
    const monthMap: Record<string, string> = {
      janeiro: "01",
      fevereiro: "02",
      marco: "03",
      abril: "04",
      maio: "05",
      junho: "06",
      julho: "07",
      agosto: "08",
      setembro: "09",
      outubro: "10",
      novembro: "11",
      dezembro: "12",
    };
    return {
      day: String(longForm[1]).padStart(2, "0"),
      month: monthMap[longForm[2]] ?? "00",
      year: longForm[3],
    };
  }
  return null;
}

export function pageTextMatchesTargetDate(pageDateText: string, targetDate: string) {
  const parts = extractPageDateParts(pageDateText);
  if (!parts) return false;
  const [year, month, day] = targetDate.split("-");
  return parts.year === year && parts.month === month && parts.day === day;
}

function extractPageTimeParts(value: string | null | undefined) {
  const normalized = normalizePtText(value);
  const iso = normalized.match(/\b\d{4}-\d{2}-\d{2}[t\s](\d{2}):(\d{2})(?::(\d{2}))?\b/);
  if (iso) {
    return {
      hour: Number(iso[1]),
      minute: Number(iso[2]),
      second: Number(iso[3] ?? 0),
    };
  }
  const match = normalized.match(/\b(?:as|às)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };
}

function parseIsoLikeDate(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b.*?\b(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (numeric) {
    const day = String(numeric[1]).padStart(2, "0");
    const month = String(numeric[2]).padStart(2, "0");
    const hour = String(numeric[4]).padStart(2, "0");
    const fallback = new Date(`${numeric[3]}-${month}-${day}T${hour}:${numeric[5]}:${numeric[6] ?? "00"}-04:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  const cod5PtDateOnly = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (cod5PtDateOnly) {
    const cod5DayNumber = Number(cod5PtDateOnly[1]);
    const cod5MonthNumber = Number(cod5PtDateOnly[2]);
    const cod5YearNumber = Number(cod5PtDateOnly[3]);
    const cod5MaxDay = cod5MonthNumber >= 1 && cod5MonthNumber <= 12
      ? new Date(Date.UTC(cod5YearNumber, cod5MonthNumber, 0)).getUTCDate()
      : 0;
    if (cod5DayNumber >= 1 && cod5DayNumber <= cod5MaxDay) {
      const cod5Day = String(cod5DayNumber).padStart(2, "0");
      const cod5Month = String(cod5MonthNumber).padStart(2, "0");
      const cod5Candidate = new Date(`${cod5YearNumber}-${cod5Month}-${cod5Day}T00:00:00-04:00`);
      if (!Number.isNaN(cod5Candidate.getTime())) return cod5Candidate;
    }
    return null;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function evaluateContentTimeline(contentDateSamples: string[], requestedCaptureAt: string | null) {
  const captureAtDate = parseIsoLikeDate(requestedCaptureAt);
  if (!captureAtDate) {
    return { ok: false, maxObserved: null as string | null, futureSamples: [] as string[], parsedCount: 0, sampleCount: 0, reason: "invalid_capture_at" };
  }
  if (!Array.isArray(contentDateSamples) || contentDateSamples.length === 0) {
    return { ok: false, maxObserved: null as string | null, futureSamples: [] as string[], parsedCount: 0, sampleCount: 0, reason: "empty_samples" };
  }
  const maxAllowed = captureAtDate.getTime() + 90 * 1000;
  const parsedSamples = contentDateSamples
    .map((value) => ({ raw: value, parsed: parseIsoLikeDate(value) }))
    .filter((item) => item.parsed);
  if (parsedSamples.length === 0) {
    return { ok: false, maxObserved: null as string | null, futureSamples: [] as string[], parsedCount: 0, sampleCount: contentDateSamples.length, reason: "unparseable_samples" };
  }
  const futureSamples = parsedSamples.filter((item) => item.parsed!.getTime() > maxAllowed);
  const maxObserved = parsedSamples.reduce<Date | null>((acc, item) => (
    !acc || item.parsed!.getTime() > acc.getTime() ? item.parsed! : acc
  ), null);
  return {
    ok: futureSamples.length === 0,
    maxObserved: maxObserved ? maxObserved.toISOString() : null,
    futureSamples: futureSamples.slice(0, 5).map((item) => item.raw),
    parsedCount: parsedSamples.length,
    sampleCount: contentDateSamples.length,
    reason: futureSamples.length ? "future_samples" : null,
  };
}

export function pageTextMatchesRequestedCaptureAt(pageDateText: string, requestedCaptureAt: string) {
  const normalizedPageText = normalizePtText(pageDateText);
  const normalizedCaptureAt = normalizePtText(requestedCaptureAt);
  if (normalizedPageText.startsWith(normalizedCaptureAt)) return true;

  const parts = extractPageDateParts(pageDateText);
  const [targetDate, targetTimeRaw = ""] = requestedCaptureAt.split("T");
  const [year, month, day] = targetDate.split("-");
  if (!parts) return false;
  const [hourRaw = "", minuteRaw = ""] = targetTimeRaw.split(":");
  const expectedHour = Number(hourRaw);
  const expectedMinute = Number(minuteRaw);
  if (!Number.isFinite(expectedHour) || !Number.isFinite(expectedMinute)) return false;
  if (!(parts.year === year && parts.month === month && parts.day === day)) return false;

  const timeParts = extractPageTimeParts(pageDateText);
  if (!timeParts) {
    const expectedTime = requestedCaptureAt.slice(11, 16);
    return expectedTime ? normalizePtText(pageDateText).includes(expectedTime) : false;
  }

  const expectedSeconds = expectedHour * 3600 + expectedMinute * 60;
  const actualSeconds = timeParts.hour * 3600 + timeParts.minute * 60 + timeParts.second;
  return Math.abs(actualSeconds - expectedSeconds) <= 90;
}

export function formatIsoDate(value = new Date()) {
  return value.toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" });
}

const ISO_DATE_REGEXP = /^\d{4}-\d{2}-\d{2}$/;

export const CAPTURE_CLASS_SAME_DAY_RETRY = "same_day_retry";
export const CAPTURE_CLASS_SCHEDULED = "scheduled";
export const CAPTURE_CLASS_HISTORICAL_RECOVERY = "historical_recovery";
export const AUDIT_POLICY_VERSION_IMMUTABLE_CAPTURE = "audit-policy-v1";

const SERVER_CAPTURE_PROVENANCE = Symbol("serverCaptureProvenance");

export type ServerCaptureProvenance = {
  targetDate: string;
  sourceJobId: string;
  capturedAt: string;
  uploadedUrl: string | null;
};

export function correlateCaptureLogProvenance(input: {
  targetDate: string;
  jobId: string | null;
  runnerJobId: string | null;
  createdAt: Date | null;
  uploadedUrl: string | null;
  status: string;
  metadata: Record<string, unknown>;
  evidenceUrl: string | null;
}) {
  if (!["ok", "pending_audit"].includes(input.status)) return null;
  const declaredSourceJobId = typeof input.metadata.sourceJobId === "string" ? input.metadata.sourceJobId.trim() : "";
  const sourceJobId = [input.runnerJobId, input.jobId]
    .find((value) => typeof value === "string" && value === declaredSourceJobId) ?? null;
  if (!sourceJobId || !input.createdAt || !input.uploadedUrl || input.uploadedUrl !== input.evidenceUrl) return null;
  return { targetDate: input.targetDate, sourceJobId, capturedAt: input.createdAt.toISOString(), uploadedUrl: input.uploadedUrl };
}

export function attachServerCaptureProvenance(
  metadata: Record<string, unknown>,
  provenance: ServerCaptureProvenance,
) {
  Object.defineProperty(metadata, SERVER_CAPTURE_PROVENANCE, {
    value: provenance,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return metadata;
}

function readServerCaptureProvenance(metadata: unknown): ServerCaptureProvenance | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<PropertyKey, unknown>)[SERVER_CAPTURE_PROVENANCE];
  if (!value || typeof value !== "object") return null;
  return value as ServerCaptureProvenance;
}

function parseCuiabaDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" });
}

function normalizeCaptureClassValue(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : null;
  if (raw === CAPTURE_CLASS_HISTORICAL_RECOVERY) return CAPTURE_CLASS_HISTORICAL_RECOVERY;
  if (raw === CAPTURE_CLASS_SAME_DAY_RETRY) return CAPTURE_CLASS_SAME_DAY_RETRY;
  if (raw === CAPTURE_CLASS_SCHEDULED) return CAPTURE_CLASS_SCHEDULED;
  return null;
}

function hasKnownCapturePolicy(version: unknown) {
  return typeof version === "string" && version.trim() === AUDIT_POLICY_VERSION_IMMUTABLE_CAPTURE;
}

function buildCaptureClassTrustContext({
  canonicalTargetDate,
  metadataTargetDate,
  captureClass,
  sourceJobId,
  capturedAt,
  auditPolicyVersion,
}: {
  canonicalTargetDate: string | null;
  metadataTargetDate: string | null;
  captureClass: string | null;
  sourceJobId: string | null;
  capturedAt: string | null;
  auditPolicyVersion: string | null;
}) {
  const canonical = typeof canonicalTargetDate === "string" && ISO_DATE_REGEXP.test(canonicalTargetDate)
    ? canonicalTargetDate
    : null;
  const persisted = typeof metadataTargetDate === "string" && ISO_DATE_REGEXP.test(metadataTargetDate)
    ? metadataTargetDate
    : null;
  const capturedAtDate = parseCuiabaDate(capturedAt);
  const hasSourceJobId = typeof sourceJobId === "string" && sourceJobId.trim().length > 0;
  const hasValidPolicy = hasKnownCapturePolicy(auditPolicyVersion);
  const hasCanonicalTarget = !!canonical;
  const hasPersistedTarget = !!persisted;
  const hasCapturedAtDate = !!capturedAtDate;
  const targetDateMatches = hasCanonicalTarget && hasPersistedTarget && canonical === persisted;
  const targetDateMatchesForDaily = hasCapturedAtDate && targetDateMatches && capturedAtDate === canonical;
  if (!captureClass) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["capture_class_missing"],
    };
  }
  if (!hasCanonicalTarget) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["target_date_invalid"],
    };
  }
  if (!hasPersistedTarget) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["target_date_persisted_invalid_or_missing"],
    };
  }
  if (!hasSourceJobId) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["source_job_id_missing"],
    };
  }
  if (!hasValidPolicy) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["audit_policy_version_unknown"],
    };
  }
  if (!hasCapturedAtDate) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["captured_at_invalid_or_missing"],
    };
  }
  if (!targetDateMatches) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["target_date_mismatch"],
    };
  }
  if (captureClass === CAPTURE_CLASS_HISTORICAL_RECOVERY) {
    return {
      trusted: true,
      trustedClass: captureClass,
      reasons: [],
    };
  }
  if (!targetDateMatchesForDaily) {
    return {
      trusted: false,
      trustedClass: null as string | null,
      reasons: ["captured_at_date_mismatch"],
    };
  }
  return {
    trusted: true,
    trustedClass: captureClass,
    reasons: [],
  };
}

// Editorial timeline proof is meaningful only when reconstructing a past day.
// A live capture for the current Cuiabá day cannot contain a retroactive page
// timeline yet; the remaining visual, slot, media and clock gates still apply.
export function requiresRetroEditorialProof(targetDate: string, now = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate < formatIsoDate(now);
}

export function eachIsoDay(start: Date, end: Date) {
  const days: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    days.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export const RETRO_CAPTURE_WINDOW_START = "18:00";
export const RETRO_CAPTURE_WINDOW_END = "22:00";
export const RETRO_CAPTURE_WINDOW_START_MINUTES = 18 * 60;
export const RETRO_CAPTURE_WINDOW_END_MINUTES = 22 * 60;

export function isCaptureAtInRetroWindow(captureAt: string | null | undefined) {
  const match = String(captureAt ?? "").trim().match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= RETRO_CAPTURE_WINDOW_START_MINUTES && minutes < RETRO_CAPTURE_WINDOW_END_MINUTES;
}

export function buildRetroCaptureAt(dateKey: string, insertionId: number) {
  const seed = `${dateKey}:${insertionId}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % (RETRO_CAPTURE_WINDOW_END_MINUTES - RETRO_CAPTURE_WINDOW_START_MINUTES);
  }
  const totalMinutes = RETRO_CAPTURE_WINDOW_START_MINUTES + hash;
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${dateKey}T${hour}:${minute}`;
}

export function getEvidenceDateKey(title: string | null | undefined) {
  if (!title) return null;
  const match = title.match(/Print\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

export function evaluateCaptureMetadata(metadata: any, targetDate: string, now = new Date()) {
  if (!metadata) {
    return {
      requestedCaptureAt: null,
      systemDateTime: "",
      pageDateText: "",
      isVideoCapture: false,
      playerProof: {
        ok: false,
        currentTime: 0,
        duration: 0,
        targetTime: null,
        randomSeed: null,
        controlsVisible: false,
        progressVisible: false,
        playResolved: false,
      },
      visualAudit: {
        viewportImagesTotal: 0,
        viewportImagesLoaded: 0,
        slotImagesTotal: 0,
        slotImagesLoaded: 0,
        viewportBackgroundsTotal: 0,
        viewportBackgroundsLoaded: 0,
        viewportVideosTotal: 0,
        viewportVideosLoaded: 0,
        slotStableFrameOk: false,
        slotLegibilityOk: false,
        slotMotionScore: null,
        slotChosenSampleIndex: null,
        slotFrameSamples: [],
        slotTransitionRejected: false,
        slotLegibilityScore: null,
        frameSelectionMode: null,
        gifSourceUrl: null,
        gifChosenFrameIndex: null,
        gifChosenDurationMs: null,
        frameSelectionDowngraded: false,
        frameSelectionDowngradeReason: null,
      },
      auditContext: {
        resolvedPage: null,
        resolvedSlotSelector: null,
        resolvedContextSelector: null,
        resolvedGroupId: null,
      },
      desktopMatches: false,
      pageMatches: false,
      playerProofOk: false,
      visualsOk: false,
      issues: [
        {
          code: "capture_metadata_missing",
          label: "Evidência sem metadado de auditoria",
          detail: `A evidência de ${targetDate} não possui o JSON de captura exigido para validar frame estável, legibilidade e horário.`,
        },
      ],
      ok: false,
    };
  }
  const serverProvenance = readServerCaptureProvenance(metadata);
  const persistedTargetDate = serverProvenance?.targetDate ?? null;
  const canonicalTargetDate = ISO_DATE_REGEXP.test(targetDate) ? targetDate : null;
  const recordedCaptureClassRaw = typeof metadata.captureClass === "string" ? metadata.captureClass.trim() : "";
  const recordedCaptureClass = normalizeCaptureClassValue(recordedCaptureClassRaw);
  const explicitCaptureClass = typeof metadata.captureClass === "string" && metadata.captureClass.trim().length > 0;
  const declaredSourceJobId = typeof metadata.sourceJobId === "string" && metadata.sourceJobId.trim()
    ? metadata.sourceJobId.trim()
    : null;
  const sourceJobId = serverProvenance && declaredSourceJobId === serverProvenance.sourceJobId
    ? serverProvenance.sourceJobId
    : null;
  const auditPolicyVersion = typeof metadata.auditPolicyVersion === "string" ? metadata.auditPolicyVersion.trim() : null;
  const capturedAt = serverProvenance?.capturedAt ?? null;
  const captureClassTrustContext = buildCaptureClassTrustContext({
    canonicalTargetDate,
    metadataTargetDate: persistedTargetDate,
    captureClass: recordedCaptureClass,
    sourceJobId,
    capturedAt,
    auditPolicyVersion,
  });
  const normalizedCaptureClass = captureClassTrustContext.trusted ? recordedCaptureClass : null;
  const requestedCaptureAt = typeof metadata.requestedCaptureAt === "string" ? metadata.requestedCaptureAt : null;
  const systemDateTime = typeof metadata.systemDateTime === "string" ? metadata.systemDateTime : "";
  const pageDateText = typeof metadata.pageDateText === "string" ? metadata.pageDateText : "";
  const pageDateObserved = typeof metadata.pageDateObserved === "string" ? metadata.pageDateObserved : "";
  const pageDateReference = pageDateObserved || pageDateText;
  const formatText = typeof metadata.format === "string" ? metadata.format : "";
  const isVideoCapture = /VIDEO/i.test(formatText);
  const visualAudit = metadata.visualAudit ?? {};
  const contentDateSamples = Array.isArray(metadata.contentDateSamples)
    ? metadata.contentDateSamples.filter((value: unknown) => typeof value === "string")
    : [];
  const retroContentProof = metadata.retroContentProof && typeof metadata.retroContentProof === "object"
    ? metadata.retroContentProof
    : null;
  const slotVisibility = metadata.slotVisibility && typeof metadata.slotVisibility === "object"
    ? metadata.slotVisibility
    : {};
  const videoProof = metadata.videoProof ?? {};
  const siteSigla = typeof metadata.siteSigla === "string" ? metadata.siteSigla : null;
  const localFormato = typeof metadata.format === "string" ? metadata.format : null;
  const resolvedMapping = getSiteFormatMappingByContext(siteSigla, localFormato, {
    pageLabel: typeof metadata.pageLabel === "string" ? metadata.pageLabel : null,
    pageUrl: typeof metadata.pageUrl === "string" ? metadata.pageUrl : null,
    slotSelector: typeof metadata.slotSelector === "string" ? metadata.slotSelector : null,
    contextSelector: typeof metadata.contextSelector === "string" ? metadata.contextSelector : null,
  });
  const fallbackAuditConfig = {
    ...(getSiteIntegration(siteSigla)?.auditConfig ?? {}),
    ...(resolvedMapping?.auditOverrides ?? {}),
  };
  const effectiveAuditConfig = {
    ...fallbackAuditConfig,
  } as {
    allowViewportImageMisses?: number;
    requireStableFrame?: boolean;
    requireLegibleFrame?: boolean;
    requireIdentityFrame?: boolean;
    requireSlotVisibleInViewport?: boolean;
    gifAllowedFrameRanges?: Array<[number, number]>;
    requireSignedRetroPreview?: boolean;
    requireRetroContentProof?: boolean;
    minRetroContentMatches?: number;
    allowAuditedReconstruction?: boolean;
  };
  // A recovery after a late publication cannot honestly recreate the editorial
  // page as it looked on the contracted day.  It is still a valid, explicitly
  // labelled proof of the campaign only when the portal rule permits it and
  // the runner persisted the complete reconstruction audit trail.  Do not
  // waive any creative, slot, media or frame gate below.
  const reconstruction = metadata.reconstruction && typeof metadata.reconstruction === "object"
    ? metadata.reconstruction as Record<string, unknown>
    : null;
  const auditedLatePublicationRecovery = effectiveAuditConfig.allowAuditedReconstruction === true &&
    reconstruction?.reason === "late_publication_recovery" &&
    reconstruction?.contractedDate === canonicalTargetDate &&
    typeof reconstruction?.reconstructedAt === "string" &&
    typeof reconstruction?.mediaUrl === "string" &&
    reconstruction.mediaUrl.trim().length > 0;
  const expectedEvaluationDate = canonicalTargetDate ? canonicalTargetDate.split("-").reverse().join("/") : "";
  const desktopMatches = requestedCaptureAt
    ? pageTextMatchesRequestedCaptureAt(systemDateTime, requestedCaptureAt)
    : Boolean(expectedEvaluationDate) && systemDateTime.includes(expectedEvaluationDate);
  const pageMatches = requestedCaptureAt
    ? pageTextMatchesRequestedCaptureAt(pageDateReference, requestedCaptureAt)
    : canonicalTargetDate ? pageTextMatchesTargetDate(pageDateReference, canonicalTargetDate) : false;
  const viewportImagesTotal = Number(visualAudit.viewportImagesTotal ?? 0);
  const viewportImagesLoaded = Number(visualAudit.viewportImagesLoaded ?? 0);
  const allowViewportImageMisses = Math.max(0, Number(effectiveAuditConfig.allowViewportImageMisses ?? 0));
  const viewportImagesOk = viewportImagesTotal <= 0 || viewportImagesLoaded >= Math.max(0, viewportImagesTotal - allowViewportImageMisses);
  const slotImagesTotal = Number(visualAudit.slotImagesTotal ?? 0);
  const slotImagesLoaded = Number(visualAudit.slotImagesLoaded ?? 0);
  const mediaBasename = typeof metadata.mediaBasename === "string" ? metadata.mediaBasename.trim() : "";
  const matchedMediaUrl = typeof metadata.matchedMediaUrl === "string" ? metadata.matchedMediaUrl.trim() : "";
  const hasMatchedMediaProof = Object.prototype.hasOwnProperty.call(metadata, "matchedMediaUrl");
  const mediaMatchesInsertion = !hasMatchedMediaProof || !mediaBasename || matchedMediaUrl.includes(mediaBasename);
  const finalProofStyle = typeof metadata.finalProofStyle === "string" ? metadata.finalProofStyle.trim() : "";
  const finalPngSlotAudit = metadata.finalPngSlotAudit && typeof metadata.finalPngSlotAudit === "object"
    ? metadata.finalPngSlotAudit
    : null;
  const hasFinalPngSlotAudit = Object.prototype.hasOwnProperty.call(metadata, "finalPngSlotAudit");
  const finalPngSlotAuditOk = !hasFinalPngSlotAudit || finalPngSlotAudit?.ok === true;
  const headerAdPolicyAudit = metadata.headerAdPolicyAudit && typeof metadata.headerAdPolicyAudit === "object"
    ? metadata.headerAdPolicyAudit
    : null;
  const finalPngHeaderAdPolicyAudit = metadata.finalPngHeaderAdPolicyAudit && typeof metadata.finalPngHeaderAdPolicyAudit === "object"
    ? metadata.finalPngHeaderAdPolicyAudit
    : null;
  const requiresHeaderAdPolicyAudit = siteSigla === "PERRENGUE";
  const headerAdPolicyAuditOk = !requiresHeaderAdPolicyAudit || headerAdPolicyAudit?.ok === true;
  const finalPngHeaderAdPolicyAuditOk = !finalPngHeaderAdPolicyAudit || finalPngHeaderAdPolicyAudit.ok === true;
  const viewportBackgroundsTotal = Number(visualAudit.viewportBackgroundsTotal ?? 0);
  const viewportBackgroundsLoaded = Number(visualAudit.viewportBackgroundsLoaded ?? 0);
  const viewportVideosTotal = Number(visualAudit.viewportVideosTotal ?? 0);
  const viewportVideosLoaded = Number(visualAudit.viewportVideosLoaded ?? 0);
  const readinessAudit = metadata.readinessAudit && typeof metadata.readinessAudit === "object"
    ? metadata.readinessAudit as Record<string, unknown>
    : null;
  const metadataRequiredGates = metadata.requiredGates && typeof metadata.requiredGates === "object"
    ? metadata.requiredGates as Record<string, unknown>
    : null;
  const readinessRequired = metadataRequiredGates?.requireReadinessAudit === true;
  const readinessOk = !readinessRequired || readinessAudit?.approved === true;
  const videoProofCurrentTime = Number(videoProof.currentTime ?? 0);
  const videoProofDuration = Number(videoProof.duration ?? 0);
  const videoProgressVisible = videoProof.progressVisible === true || videoProof.overlayInjected === true;
  const playerProofOk = !isVideoCapture || Boolean(
    videoProof &&
    videoProof.ok === true &&
    videoProof.controls === true &&
    videoProgressVisible &&
    videoProofCurrentTime > 0.5 &&
    videoProofDuration > 0,
  );
  const visualAuditAvailable = visualAudit && typeof visualAudit === "object";
  const slotStableFrameOk = metadata.slotStableFrameOk === true;
  const slotLegibilityOk = metadata.slotLegibilityOk === true;
  const identityFrameOk = metadata.identityFrameOk === true;
  const identityFrameScore = typeof metadata.identityFrameScore === "number" ? metadata.identityFrameScore : null;
  const identityFrameReasons = Array.isArray(metadata.identityFrameReasons)
    ? metadata.identityFrameReasons.filter((value: unknown) => typeof value === "string" && value.trim())
    : [];
  const requireStableFrame = !isVideoCapture && effectiveAuditConfig.requireStableFrame !== false;
  const requireLegibleFrame = effectiveAuditConfig.requireLegibleFrame !== false;
  const requireIdentityFrame = effectiveAuditConfig.requireIdentityFrame !== false;
  const requireSlotVisibleInViewport = effectiveAuditConfig.requireSlotVisibleInViewport === true;
  const gifAllowedFrameRanges = Array.isArray(effectiveAuditConfig.gifAllowedFrameRanges)
    ? effectiveAuditConfig.gifAllowedFrameRanges
        .filter((range): range is [number, number] => (
          Array.isArray(range) &&
          range.length === 2 &&
          Number.isFinite(Number(range[0])) &&
          Number.isFinite(Number(range[1]))
        ))
        .map(([start, end]) => [Math.min(Number(start), Number(end)), Math.max(Number(start), Number(end))] as [number, number])
    : [];
  const gifChosenFrameIndex = typeof metadata.gifChosenFrameIndex === "number" ? metadata.gifChosenFrameIndex : null;
  const gifChosenFrameAllowed = gifAllowedFrameRanges.length === 0 || (
    typeof gifChosenFrameIndex === "number" &&
    gifAllowedFrameRanges.some(([start, end]) => gifChosenFrameIndex >= start && gifChosenFrameIndex <= end)
  );
  const slotMostlyVisible = slotVisibility?.mostlyVisible === true;
  const contentTimeline = evaluateContentTimeline(contentDateSamples, requestedCaptureAt);
  const isScheduledLikeCaptureClass = normalizedCaptureClass === CAPTURE_CLASS_SCHEDULED || normalizedCaptureClass === CAPTURE_CLASS_SAME_DAY_RETRY;
  const requireRetroContentProof = effectiveAuditConfig.requireRetroContentProof === true &&
    (normalizedCaptureClass === CAPTURE_CLASS_HISTORICAL_RECOVERY ||
      (normalizedCaptureClass === null && requiresRetroEditorialProof(canonicalTargetDate ?? "", now))) &&
    !auditedLatePublicationRecovery;
  const contentTimelineOk = contentTimeline.ok ||
    (contentTimeline.reason === "empty_samples" && (isScheduledLikeCaptureClass || auditedLatePublicationRecovery));
  const retroContentProofOk = !requireRetroContentProof || retroContentProof?.status === "approved";
  const captureClassContractOk = captureClassTrustContext.trusted || !explicitCaptureClass;
  const visualsOk = Boolean(
    visualAuditAvailable &&
    viewportImagesOk &&
    slotImagesTotal === slotImagesLoaded &&
    viewportBackgroundsTotal === viewportBackgroundsLoaded &&
    viewportVideosTotal === viewportVideosLoaded &&
    readinessOk &&
    (!requireStableFrame || slotStableFrameOk) &&
    (!requireLegibleFrame || slotLegibilityOk) &&
    (!requireIdentityFrame || identityFrameOk) &&
    gifChosenFrameAllowed &&
    playerProofOk,
  );
  const issues: Array<{ code: string; label: string; detail: string }> = [];
  if (!captureClassTrustContext.trusted && explicitCaptureClass) {
    const trustIssues: Array<{ code: string; label: string; detail: string }> = captureClassTrustContext.reasons
      .map((reason) => {
        const codeMap: Record<string, string> = {
          target_date_invalid: "capture_class_target_date_invalid",
          target_date_persisted_invalid_or_missing: "capture_class_target_date_missing",
          source_job_id_missing: "capture_class_source_job_missing",
          audit_policy_version_unknown: "capture_class_policy_version_unknown",
          captured_at_invalid_or_missing: "capture_class_capture_at_invalid",
          target_date_mismatch: "capture_class_target_date_mismatch",
          captured_at_date_mismatch: "capture_class_capture_at_date_mismatch",
          capture_class_missing: "capture_class_missing",
        };
        const code = codeMap[reason] ?? "capture_class_untrusted";
        return {
          code,
          label: "Classificação de captura não confiável",
          detail: `A evidência definiu ${recordedCaptureClassRaw}, porém o contrato não foi validado: ${reason}.`,
        };
      });
    issues.push(...trustIssues.slice(0, 6));
  }
  if (!desktopMatches) {
    issues.push({
      code: "desktop_time_mismatch",
      label: "Hora da moldura divergente",
      detail: requestedCaptureAt
        ? `A moldura do sistema não mostrou o horário esperado para ${requestedCaptureAt}. Valor encontrado: ${systemDateTime || "não encontrado"}.`
        : `A moldura do sistema não mostrou a data esperada para ${canonicalTargetDate}. Valor encontrado: ${systemDateTime || "não encontrado"}.`,
    });
  }
  if (!pageMatches) {
    issues.push({
      code: "page_time_mismatch",
      label: "Hora do site divergente",
      detail: requestedCaptureAt
        ? `O site não exibiu o horário esperado para ${requestedCaptureAt}. Valor encontrado: ${pageDateReference || "não encontrado"}.`
        : `O site não exibiu a data esperada para ${canonicalTargetDate}. Valor encontrado: ${pageDateReference || "não encontrado"}.`,
    });
  }
  if (!contentTimelineOk) {
    issues.push({
      code: contentTimeline.reason === "future_samples" ? "content_time_mismatch" : "retro_content_unverified",
      label: contentTimeline.reason === "future_samples" ? "Conteúdo da página não está retroativo" : "Conteúdo editorial retroativo não comprovado",
      detail: contentTimeline.reason === "future_samples"
        ? `Foram detectadas datas posteriores ao captureAt. maxObserved=${contentTimeline.maxObserved || "n/a"}; exemplos=${contentTimeline.futureSamples.join(" | ") || "n/a"}.`
        : `A evidência não contém amostras editoriais válidas. reason=${contentTimeline.reason}; parsed=${contentTimeline.parsedCount}/${contentTimeline.sampleCount}.`,
    });
  }
  if (requireRetroContentProof && retroContentProof?.status !== "approved") {
    const proofIssues = Array.isArray(retroContentProof?.issues) ? retroContentProof.issues : [];
    if (!proofIssues.length) {
      issues.push({
        code: "retro_content_unverified",
        label: "Prova editorial retroativa ausente",
        detail: "A regra exige retroContentProof aprovado, mas a evidência não contém essa prova.",
      });
    } else {
      for (const issue of proofIssues.slice(0, 10)) {
        const code = typeof issue?.code === "string" ? issue.code : "retro_content_unverified";
        issues.push({
          code,
          label: "Prova editorial retroativa reprovada",
          detail: typeof issue?.detail === "string" ? issue.detail : code,
        });
      }
    }
  }
  if (requireSlotVisibleInViewport && !slotMostlyVisible) {
    issues.push({
      code: "slot_position_mismatch",
      label: "Banner fora da posição esperada no viewport",
      detail: `O slot principal não ficou majoritariamente visível. visibleRatio=${Number(slotVisibility?.visibleRatio ?? 0).toFixed(3)}.`,
    });
  }
  if (!viewportImagesOk) {
    issues.push({
      code: "viewport_images_incomplete",
      label: "Imagens da primeira dobra incompletas",
      detail: `${viewportImagesLoaded}/${viewportImagesTotal} imagens da primeira dobra carregaram completamente.`,
    });
  }
  if (slotImagesTotal !== slotImagesLoaded) {
    issues.push({
      code: "slot_images_incomplete",
      label: "Imagens do anúncio incompletas",
      detail: `${slotImagesLoaded}/${slotImagesTotal} imagens do slot do anúncio carregaram completamente.`,
    });
  }
  if (!readinessOk) {
    issues.push({
      code: readinessAudit ? "readiness_audit_failed" : "readiness_audit_missing",
      label: "Conteúdo crítico incompleto",
      detail: readinessAudit
        ? `readinessAudit.approved=false: ${JSON.stringify(readinessAudit)}`
        : "A captura exige readinessAudit, mas o metadado está ausente.",
    });
  }
  if (!mediaMatchesInsertion) {
    issues.push({
      code: "slot_media_mismatch",
      label: "Criativo capturado diferente da inserção",
      detail: `A captura não confirmou o arquivo esperado ${mediaBasename}. Mídia encontrada: ${matchedMediaUrl || "não registrada"}.`,
    });
  }
  if (finalProofStyle === "viewport_with_slot_inset") {
    issues.push({
      code: "client_png_audit_inset_forbidden",
      label: "PNG final contém prova visual artificial",
      detail: "O PNG final de cliente nao pode conter o inset 'Frame auditado do banner'. Gere novamente com o slot real visivel no site.",
    });
  }
  if (hasFinalPngSlotAudit && finalPngSlotAudit?.ok !== true) {
    const finalIssues = Array.isArray(finalPngSlotAudit?.issues)
      ? finalPngSlotAudit.issues.map((issue: any) => issue?.code || issue?.detail).filter(Boolean).join("; ")
      : "sem detalhes";
    issues.push({
      code: "final_png_slot_audit_failed",
      label: "Slot visível no PNG final não bate com o criativo",
      detail: `A auditoria pixel a pixel do slot final falhou: ${finalIssues}.`,
    });
  }
  if (requiresHeaderAdPolicyAudit && headerAdPolicyAudit?.ok !== true) {
    const headerIssues = Array.isArray(headerAdPolicyAudit?.issues)
      ? headerAdPolicyAudit.issues.map((issue: any) => issue?.code || issue?.detail).filter(Boolean).join("; ")
      : "metadata sem headerAdPolicyAudit";
    issues.push({
      code: "header_ad_policy_audit_failed",
      label: "Política visual do header reprovada",
      detail: `O Perrengue precisa provar apenas um bloco de publicidade antes do logo/menu e sem POP UP no header. Detalhes: ${headerIssues}.`,
    });
  }
  if (finalPngHeaderAdPolicyAudit && finalPngHeaderAdPolicyAudit.ok !== true) {
    const finalHeaderIssues = Array.isArray(finalPngHeaderAdPolicyAudit.issues)
      ? finalPngHeaderAdPolicyAudit.issues.map((issue: any) => issue?.code || issue?.detail).filter(Boolean).join("; ")
      : "sem detalhes";
    issues.push({
      code: "final_png_header_ad_policy_failed",
      label: "PNG final viola política visual do header",
      detail: `O PNG final ainda mostra duplicidade ou POP UP no header. Detalhes: ${finalHeaderIssues}.`,
    });
  }
  if (viewportBackgroundsTotal !== viewportBackgroundsLoaded) {
    issues.push({
      code: "viewport_backgrounds_incomplete",
      label: "Fundos visuais incompletos",
      detail: `${viewportBackgroundsLoaded}/${viewportBackgroundsTotal} backgrounds da primeira dobra carregaram completamente.`,
    });
  }
  if (viewportVideosTotal !== viewportVideosLoaded) {
    issues.push({
      code: "viewport_videos_incomplete",
      label: "Vídeos ou posters incompletos",
      detail: `${viewportVideosLoaded}/${viewportVideosTotal} vídeos ou posters visíveis carregaram completamente.`,
    });
  }
  if (requireStableFrame && !slotStableFrameOk) {
    issues.push({
      code: "slot_frame_unstable",
      label: "Frame do banner ainda em transição",
      detail: metadata.slotTransitionRejected === true
        ? "A captura não encontrou um frame final estável do slot para evitar transição de GIF/animação."
        : "A evidência não possui a nova prova de estabilidade do slot e passou a ser inválida pela regra atual.",
    });
  }
  if (requireLegibleFrame && !slotLegibilityOk) {
    const reasons = Array.isArray(metadata.slotLegibilityReasons) ? metadata.slotLegibilityReasons.filter(Boolean) : [];
    issues.push({
      code: "slot_frame_illegible",
      label: "Banner capturado sem legibilidade suficiente",
      detail: reasons.length
        ? reasons.join("; ")
        : "A evidência não possui a nova prova de legibilidade do slot e passou a ser inválida pela regra atual.",
    });
  }
  if (requireIdentityFrame && !identityFrameOk) {
    issues.push({
      code: "ad_identity_frame_missing",
      label: "Frame sem identidade suficiente da campanha",
      detail: identityFrameReasons.length
        ? identityFrameReasons.join("; ")
        : `A evidência não comprovou texto/identidade suficiente do anúncio. identityFrameScore=${identityFrameScore ?? "n/a"}.`,
    });
  }
  if (!gifChosenFrameAllowed) {
    issues.push({
      code: "gif_frame_not_approved",
      label: "Frame do GIF fora do intervalo aprovado",
      detail: `Frame ${gifChosenFrameIndex ?? "n/a"} não está nos intervalos de mensagem legível: ${gifAllowedFrameRanges.map(([start, end]) => `${start}-${end}`).join(", ") || "n/a"}.`,
    });
  }
  if (!playerProofOk) {
    issues.push({
      code: "video_player_proof_incomplete",
      label: "Player do vídeo incompleto",
      detail: `A prova do vídeo precisa mostrar controles e barra de progresso. Estado atual: ${videoProofCurrentTime.toFixed(2)}s de ${videoProofDuration.toFixed(2)}s, controls=${videoProof.controls === true ? "sim" : "nao"}, progress=${videoProgressVisible ? "sim" : "nao"}.`,
    });
  }
  return {
    captureClass: normalizedCaptureClass,
    targetDate: canonicalTargetDate,
    auditPolicyVersion,
    capturedAt,
    sourceJobId,
    requestedCaptureAt,
    systemDateTime,
    pageDateText,
    pageDateObserved,
    isVideoCapture,
    playerProof: {
      ok: playerProofOk,
      currentTime: videoProofCurrentTime,
      duration: videoProofDuration,
      targetTime: typeof videoProof.targetTime === "number" ? videoProof.targetTime : null,
      randomSeed: typeof videoProof.randomSeed === "number" ? videoProof.randomSeed : null,
      controlsVisible: videoProof.controls === true,
      progressVisible: videoProgressVisible,
      playResolved: videoProof.playResolved === true,
    },
    visualAudit: {
      ...visualAudit,
      viewportImagesTotal,
      viewportImagesLoaded,
      slotImagesTotal,
      slotImagesLoaded,
      viewportBackgroundsTotal,
      viewportBackgroundsLoaded,
      viewportVideosTotal,
      viewportVideosLoaded,
      readinessAudit,
      readinessOk,
      slotStableFrameOk,
      slotLegibilityOk,
      slotMotionScore: typeof metadata.slotMotionScore === "number" ? metadata.slotMotionScore : null,
      slotChosenSampleIndex: typeof metadata.slotChosenSampleIndex === "number" ? metadata.slotChosenSampleIndex : null,
      slotFrameSamples: Array.isArray(metadata.slotFrameSamples) ? metadata.slotFrameSamples : [],
      slotTransitionRejected: metadata.slotTransitionRejected === true,
      slotLegibilityScore: metadata.slotLegibilityScore ?? null,
      identityFrameOk,
      identityFrameScore,
      identityFrameReasons,
      frameSelectionMode: typeof metadata.frameSelectionMode === "string" ? metadata.frameSelectionMode : null,
      gifSourceUrl: typeof metadata.gifSourceUrl === "string" ? metadata.gifSourceUrl : null,
      gifChosenFrameIndex,
      gifChosenDurationMs: typeof metadata.gifChosenDurationMs === "number" ? metadata.gifChosenDurationMs : null,
      gifAllowedFrameRanges,
      gifChosenFrameAllowed,
      frameSelectionDowngraded: metadata.frameSelectionDowngraded === true,
      frameSelectionDowngradeReason: typeof metadata.frameSelectionDowngradeReason === "string" ? metadata.frameSelectionDowngradeReason : null,
    },
    auditContext: {
      resolvedPage: resolvedMapping?.page ?? null,
      resolvedSlotSelector: resolvedMapping?.slotSelector ?? null,
      resolvedContextSelector: resolvedMapping?.contextSelector ?? resolvedMapping?.slotSelector ?? null,
      resolvedGroupId: resolvedMapping?.groupId ?? null,
    },
    contentTimeline,
    retroContentProof,
    mediaProof: {
      ok: mediaMatchesInsertion,
      mediaBasename: mediaBasename || null,
      matchedMediaUrl: matchedMediaUrl || null,
    },
    finalPngSlotAudit: finalPngSlotAudit
      ? {
          ...finalPngSlotAudit,
          ok: finalPngSlotAudit.ok === true,
        }
      : null,
    headerAdPolicyAudit: headerAdPolicyAudit
      ? {
          ...headerAdPolicyAudit,
          ok: headerAdPolicyAudit.ok === true,
        }
      : null,
    finalPngHeaderAdPolicyAudit: finalPngHeaderAdPolicyAudit
      ? {
          ...finalPngHeaderAdPolicyAudit,
          ok: finalPngHeaderAdPolicyAudit.ok === true,
        }
      : null,
    slotVisibility,
    desktopMatches,
    pageMatches,
    playerProofOk,
    visualsOk,
    issues,
    ok: captureClassContractOk && desktopMatches && pageMatches && visualsOk && contentTimelineOk && retroContentProofOk && mediaMatchesInsertion && finalProofStyle !== "viewport_with_slot_inset" && finalPngSlotAuditOk && headerAdPolicyAuditOk && finalPngHeaderAdPolicyAuditOk && (!requireSlotVisibleInViewport || slotMostlyVisible),
  };
}

export function listAuditIssueCodes(audit: ReturnType<typeof evaluateCaptureMetadata> | null | undefined) {
  return Array.isArray(audit?.issues)
    ? audit.issues
        .map((issue) => (typeof issue?.code === "string" ? issue.code : ""))
        .filter(Boolean)
    : [];
}

export function summarizeAuditRootCauses(audit: ReturnType<typeof evaluateCaptureMetadata> | null | undefined) {
  const codes = new Set(listAuditIssueCodes(audit));
  return {
    legacyMissingMetadata: codes.has("capture_metadata_missing"),
    visualLegibility: codes.has("slot_frame_illegible"),
    visualIdentity: codes.has("ad_identity_frame_missing"),
    visualStability: codes.has("slot_frame_unstable"),
    timeMismatch: codes.has("desktop_time_mismatch") || codes.has("page_time_mismatch"),
    contentTimeMismatch: codes.has("content_time_mismatch"),
    slotPositionMismatch: codes.has("slot_position_mismatch"),
    assetCompleteness:
      codes.has("viewport_images_incomplete") ||
      codes.has("slot_images_incomplete") ||
      codes.has("viewport_backgrounds_incomplete") ||
      codes.has("viewport_videos_incomplete"),
    mediaMismatch: codes.has("slot_media_mismatch"),
    videoPlayer: codes.has("video_player_proof_incomplete"),
    invalidUrl: codes.has("invalid_url"),
    other:
      codes.size > 0 &&
      ![
        "capture_metadata_missing",
        "slot_frame_illegible",
        "slot_frame_unstable",
        "desktop_time_mismatch",
        "page_time_mismatch",
        "content_time_mismatch",
        "slot_position_mismatch",
        "viewport_images_incomplete",
        "slot_images_incomplete",
        "viewport_backgrounds_incomplete",
        "viewport_videos_incomplete",
        "slot_media_mismatch",
        "video_player_proof_incomplete",
        "invalid_url",
      ].some((code) => codes.has(code)),
  };
}

export function resolveRegenerationCaptureAt(
  targetDate: string,
  insertionId: number,
  audit?: ReturnType<typeof evaluateCaptureMetadata> | null,
) {
  if (audit?.requestedCaptureAt && isCaptureAtInRetroWindow(audit.requestedCaptureAt)) {
    return audit.requestedCaptureAt.slice(0, 16);
  }
  return buildRetroCaptureAt(targetDate, insertionId);
}

export function safeFileName(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}
