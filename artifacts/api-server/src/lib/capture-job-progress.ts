import crypto from "node:crypto";
import type { PrintRunnerJobResult } from "./print-runner-contract";

export const CAPTURE_PROGRESS = {
  queued: 0,
  running: 5,
  page_resolved: 15,
  slot_found: 25,
  creative_matched: 35,
  frame_selected: 45,
  slot_captured: 60,
  critical_assets: 70,
  final_composed: 80,
  uploaded: 90,
  audit_evaluated: 95,
  completed: 100,
} as const;

export type CaptureProgressStage = keyof typeof CAPTURE_PROGRESS | "failed";
export type CaptureProgress = {
  percent: number;
  stage: CaptureProgressStage;
  message: string;
  updatedAt: string;
};

const MESSAGES: Record<CaptureProgressStage, string> = {
  queued: "Solicitação recebida.",
  running: "Iniciando a geração do print.",
  page_resolved: "Preparando a página.",
  slot_found: "Localizando o espaço do anúncio.",
  creative_matched: "Conferindo o anúncio.",
  frame_selected: "Preparando a área da captura.",
  slot_captured: "Captura realizada. Estamos montando a evidência.",
  critical_assets: "Carregando os elementos da página.",
  final_composed: "Montando a evidência.",
  uploaded: "Salvando a imagem.",
  audit_evaluated: "Validando a evidência.",
  completed: "Print concluído.",
  failed: "Não foi possível concluir a geração deste print.",
};

export function initialCaptureProgress(updatedAt = new Date().toISOString()): CaptureProgress {
  return { percent: 0, stage: "queued", message: MESSAGES.queued, updatedAt };
}

export function advanceCaptureProgress(
  current: CaptureProgress | null | undefined,
  stage: CaptureProgressStage,
  updatedAt = new Date().toISOString(),
): CaptureProgress {
  const percent = stage === "failed" ? (current?.percent ?? 0) : CAPTURE_PROGRESS[stage];
  if (stage !== "failed" && current && percent < current.percent) return current;
  return { percent, stage, message: MESSAGES[stage], updatedAt };
}

export function buildCaptureSupport(jobId: string, _technicalError?: unknown) {
  return {
    code: `CAPTURE-${crypto.createHash("sha256").update(jobId).digest("hex").slice(0, 8).toUpperCase()}`,
    message: "Tente novamente. Se o problema continuar, informe este código ao suporte.",
  };
}

function sanitizeCandidateChecklist(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const pick = (source: unknown, keys: string[]) => {
    if (!source || typeof source !== "object") return null;
    const object = source as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of keys) if (key in object) picked[key] = object[key];
    return picked;
  };
  const safeText = (value: unknown) => typeof value === "string"
    ? value
        .replace(/(token|secret|password|cookie|authorization)(\s*[=:]\s*)[^\s,;}]+/gi, "$1$2[redacted]")
        .replace(/\/(?:Users|tmp|var|home)\/[^\s,;)}]+/g, "[path]")
        .slice(0, 800)
    : undefined;
  const issues = (items: unknown) => Array.isArray(items)
    ? items.map((item) => {
        const issue = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const sanitized: Record<string, string> = {};
        for (const key of ["code", "severity", "gate", "label", "detail"]) {
          const entry = key === "detail" ? safeText(issue[key]) : issue[key];
          if (typeof entry === "string") sanitized[key] = entry;
        }
        return sanitized;
      })
    : [];
  return {
    approved: value.approved === true,
    preliminary: value.preliminary === true,
    version: typeof value.version === "string" ? value.version : null,
    insertionId: typeof value.insertionId === "number" ? value.insertionId : null,
    date: typeof value.date === "string" ? value.date : null,
    metadataPresent: value.metadataPresent === true,
    evidenceStatus: value.evidenceStatus === "approved" ? "approved" : "blocked",
    issues: issues(value.issues),
    blockingIssues: issues(value.blockingIssues),
    warnings: issues(value.warnings),
    contract: (() => {
      const contract = value.contract as Record<string, unknown> | null;
      if (!contract || typeof contract !== "object") return null;
      const base = {
        ...pick(contract, ["ok", "version", "insertionId", "targetDate"]),
        blockingIssues: issues(contract.blockingIssues),
        warnings: issues(contract.warnings),
      };
      if (contract.ok !== true) return base;
      return {
        ...base,
        insertion: pick(contract.insertion, ["id", "campaignId", "campaignName", "piCodigo", "siteId", "siteSigla", "localFormato", "localFormatoNormalizado", "statusNormalizado"]),
        period: pick(contract.period, ["start", "end", "targetDate", "inPeriod"]),
        expectedMedia: pick(contract.expectedMedia, ["mediaBasename"]),
        expectedSelectors: pick(contract.expectedSelectors, ["slotSelector", "contextSelector", "groupId"]),
        resolvedRule: pick(contract.resolvedRule, ["source", "ruleId", "ruleVersionHash", "siteSigla", "groupId", "page", "slotSelector", "contextSelector", "scrollMode", "proofStyle"]),
        requiredGates: pick(contract.requiredGates, ["inPeriod", "mediaPresent", "captureTimeWindow", "slotMatchesResolvedRule", "requireSlotVisibleInViewport", "requireStickyHeaderInViewport", "stickyHeaderExpected", "requireScrollbar", "requireFrameV4", "requireIdentityFrame", "requireFinalPngSlotAudit", "requireNoOverlay", "requireNo404", "requireVideoControls", "requireReadinessAudit", "requireAbsoluteEditorialDates", "requireEditorialDateMatchTarget", "requireVisiblePageDate", "requireGifAllowedFrameRanges", "gifAllowedFrameRanges"]),
      };
    })(),
    audit: value.audit && typeof value.audit === "object"
      ? (() => {
          const audit = value.audit as Record<string, unknown>;
          return { ok: audit.ok === true, issues: issues(audit.issues) };
        })()
      : null,
  };
}

function sanitizeCandidateProof(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  return {
    status: value.status === "approved" ? "approved" : "rejected",
    sourceMode: value.sourceMode === "audited_reconstruction" ? "audited_reconstruction" : "signed_preview",
    previewActive: value.previewActive === true,
    expectedCount: Number.isFinite(Number(value.expectedCount)) ? Number(value.expectedCount) : 0,
    visibleMatchCount: Number.isFinite(Number(value.visibleMatchCount)) ? Number(value.visibleMatchCount) : 0,
    minimumRequired: Number.isFinite(Number(value.minimumRequired)) ? Number(value.minimumRequired) : 0,
    maxObserved: typeof value.maxObserved === "string" ? value.maxObserved : null,
    futureCount: Number.isFinite(Number(value.futureCount)) ? Number(value.futureCount) : 0,
    reconstructed: value.reconstructed === true,
    manifestHash: typeof value.manifestHash === "string" ? value.manifestHash : null,
    issues: Array.isArray(value.issues) ? value.issues.map((item) => {
      const issue = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const sanitized: Record<string, string> = {};
      for (const key of ["code", "detail"]) {
        const entry = issue[key];
        if (typeof entry === "string") sanitized[key] = key === "detail"
          ? entry.replace(/(token|secret|password|cookie|authorization)(\s*[=:]\s*)[^\s,;}]+/gi, "$1$2[redacted]").slice(0, 800)
          : entry;
      }
      return sanitized;
    }) : [],
  };
}

export function toPublicCaptureJob(job: PrintRunnerJobResult) {
  const progress = job.progress
    ?? advanceCaptureProgress(null, job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : job.status);
  const failed = job.status === "failed";
  return {
    ...job,
    items: job.items.map((item) => item.candidateOnly
        ? {
            insertionId: item.insertionId,
            targetDate: item.targetDate,
            captureAt: item.captureAt,
            status: item.status,
            ...(item.status === "error" ? { error: MESSAGES.failed } : {}),
            uploadedUrl: item.uploadedUrl,
            captureLogId: item.captureLogId,
            probableCause: item.status === "error" ? null : item.probableCause,
            manifestHash: item.manifestHash,
            stages: item.stages?.map((stage) => ({
              stage: typeof stage.stage === "string" ? stage.stage : "unknown",
              status: typeof stage.status === "string" && /^[a-z_]+$/.test(stage.status) ? stage.status : "unknown",
              startedAt: typeof stage.startedAt === "string" && !/[\/\\]/.test(stage.startedAt) ? stage.startedAt : null,
              finishedAt: typeof stage.finishedAt === "string" && !/[\/\\]/.test(stage.finishedAt) ? stage.finishedAt : null,
              durationMs: typeof stage.durationMs === "number" && Number.isFinite(stage.durationMs) && stage.durationMs >= 0 ? stage.durationMs : null,
            })),
            candidateOnly: true,
            checklistValidation: sanitizeCandidateChecklist(item.checklistValidation),
            retroContentProof: sanitizeCandidateProof(item.retroContentProof),
          }
        : item.status === "error"
          ? { ...item, error: MESSAGES.failed, probableCause: null }
          : item),
    progress,
    support: failed ? buildCaptureSupport(job.id) : null,
  };
}
