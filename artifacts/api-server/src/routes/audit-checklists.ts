import { Router, type IRouter } from "express";
import {
  decideAuditChecklistApproval,
  loadAuditChecklistMetadata,
  resolveAuditChecklist,
  validateAuditChecklist,
  type AuditChecklistValidation,
} from "../lib/audit-checklist";
import { pageTextMatchesRequestedCaptureAt } from "../lib/capture-audit";

const router: IRouter = Router();

function parseInsertionId(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function validatePreUploadReconstructionClock(
  validation: AuditChecklistValidation,
  suppliedMetadata: unknown,
  receivedAt = new Date(),
): AuditChecklistValidation {
  if (!validation.preliminary || !suppliedMetadata || typeof suppliedMetadata !== "object" || Array.isArray(suppliedMetadata)) return validation;
  const metadata = suppliedMetadata as Record<string, unknown>;
  const reconstruction = metadata.reconstruction as Record<string, unknown> | null;
  if (!reconstruction || reconstruction.provenanceVersion !== 2) return validation;

  // The entire request is untrusted. This checks a preliminary desktop clock,
  // never immutable provenance: only the server receipt time anchors freshness.
  const declaredAt = typeof reconstruction.reconstructedAt === "string" ? reconstruction.reconstructedAt : "";
  const instant = /(?:Z|[+-]\d{2}:\d{2})$/.test(declaredAt) ? new Date(declaredAt) : new Date(NaN);
  const recent = Number.isFinite(instant.getTime()) && Math.abs(instant.getTime() - receivedAt.getTime()) <= 15 * 60 * 1000;
  const valid = validation.contract.ok
    && validation.contract.resolvedRule.auditConfig.allowAuditedReconstruction === true
    && validation.contract.period.inPeriod
    && metadata.captureClass === "historical_recovery"
    && reconstruction.contractedDate === validation.date
    && ["late_publication_recovery", "historical_recovery"].includes(String(reconstruction.reason))
    && Boolean(validation.contract.expectedMedia.mediaUrl)
    && reconstruction.mediaUrl === validation.contract.expectedMedia.mediaUrl
    && recent
    && typeof metadata.systemDateTime === "string"
    && pageTextMatchesRequestedCaptureAt(metadata.systemDateTime, instant.toISOString());
  const clockIssue = {
    code: valid ? "preupload_reconstruction_clock_checked" : "preupload_reconstruction_clock_invalid",
    gate: "preUploadReconstructionClock",
    severity: valid ? "warning" as const : "blocking" as const,
    label: valid ? "Relógio de reconstrução conferido preliminarmente" : "Relógio de reconstrução não confirmado",
    detail: `Referência do servidor: ${receivedAt.toISOString()}; tolerância de 15 minutos. A auditoria final continua exigindo correlação persistida de job e artefato.`,
  };
  const blockingIssues = valid
    ? validation.blockingIssues.filter((issue) => issue.code !== "metadata_desktop_time_mismatch")
    : [...validation.blockingIssues, clockIssue];
  const warnings = valid ? [...validation.warnings, clockIssue] : validation.warnings;
  const decision = decideAuditChecklistApproval({
    phase: "pre_upload",
    contractOk: validation.contract.ok,
    metadataPresent: validation.metadataPresent,
    auditOk: validation.audit?.ok === true,
    blockingIssues,
  });
  return {
    ...validation,
    approved: decision.approved,
    evidenceStatus: decision.approved ? "approved" : "blocked",
    blockingIssues: decision.blockingIssues,
    warnings,
    issues: [...decision.blockingIssues, ...warnings],
  };
}

router.get("/audit-checklists/resolve", async (req, res): Promise<void> => {
  const insertionId = parseInsertionId(req.query.insertionId);
  const date = parseDate(req.query.date);
  if (!insertionId || !date) {
    res.status(400).json({
      error: "Parâmetros inválidos.",
      required: ["insertionId", "date=YYYY-MM-DD"],
    });
    return;
  }

  const checklist = await resolveAuditChecklist({ insertionId, date });
  res.status(checklist.ok ? 200 : 422).json(checklist);
});

router.post("/audit-checklists/validate-proof", async (req, res): Promise<void> => {
  const receivedAt = new Date();
  const insertionId = typeof req.body?.insertionId === "number"
    ? req.body.insertionId
    : parseInsertionId(String(req.body?.insertionId ?? ""));
  const date = parseDate(req.body?.date);
  if (!insertionId || !date) {
    res.status(400).json({
      error: "Payload inválido.",
      required: ["insertionId", "date=YYYY-MM-DD"],
    });
    return;
  }

  const suppliedMetadata = Object.prototype.hasOwnProperty.call(req.body ?? {}, "metadata") ? req.body.metadata : undefined;
  let metadata = suppliedMetadata;
  if (req.body?.phase === "pre_upload" && metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    // Pre-upload data is still supplied by the runner and has no persisted
    // job/artifact correlation.  It may validate the visual capture, but it
    // must never mint immutable provenance or authorize reconstructed history.
    const item = { ...metadata as Record<string, unknown> };
    for (const key of ["captureClass", "targetDate", "sourceJobId", "capturedAt", "auditPolicyVersion", "evidenceUrl", "reconstruction"]) {
      delete item[key];
    }
    metadata = item;
  }
  let validation = await validateAuditChecklist({
    insertionId,
    date,
    metadata,
    phase: req.body?.phase === "pre_upload" ? "pre_upload" : "final",
  });
  if (req.body?.phase === "pre_upload") {
    validation = validatePreUploadReconstructionClock(validation, suppliedMetadata, receivedAt);
  }
  res.status(validation.approved ? 200 : 422).json({
    ...validation,
    preliminary: req.body?.phase === "pre_upload",
  });
});

router.get("/audit-checklists/metadata", async (req, res): Promise<void> => {
  const insertionId = parseInsertionId(req.query.insertionId);
  const date = parseDate(req.query.date);
  if (!insertionId || !date) {
    res.status(400).json({
      error: "Parâmetros inválidos.",
      required: ["insertionId", "date=YYYY-MM-DD"],
    });
    return;
  }

  res.json({
    insertionId,
    date,
    metadata: await loadAuditChecklistMetadata(insertionId, date),
  });
});

export default router;
