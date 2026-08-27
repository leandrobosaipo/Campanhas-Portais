import { Router, type IRouter } from "express";
import {
  loadAuditChecklistMetadata,
  resolveAuditChecklist,
  validateAuditChecklist,
} from "../lib/audit-checklist";

const router: IRouter = Router();

function parseInsertionId(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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

  let metadata = Object.prototype.hasOwnProperty.call(req.body ?? {}, "metadata") ? req.body.metadata : undefined;
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
  const validation = await validateAuditChecklist({
    insertionId,
    date,
    metadata,
    phase: req.body?.phase === "pre_upload" ? "pre_upload" : "final",
  });
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
