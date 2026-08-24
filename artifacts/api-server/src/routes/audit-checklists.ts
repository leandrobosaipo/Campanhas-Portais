import { Router, type IRouter } from "express";
import {
  loadAuditChecklistMetadata,
  resolveAuditChecklist,
  validateAuditChecklist,
} from "../lib/audit-checklist";
import { attachServerCaptureProvenance } from "../lib/capture-audit";

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
    const item = { ...metadata as Record<string, unknown> };
    if (typeof item.targetDate === "string" && typeof item.sourceJobId === "string" && typeof item.capturedAt === "string") {
      metadata = attachServerCaptureProvenance(item, {
        targetDate: item.targetDate,
        sourceJobId: item.sourceJobId,
        capturedAt: item.capturedAt,
        uploadedUrl: null,
      });
    }
  }
  const validation = await validateAuditChecklist({
    insertionId,
    date,
    metadata,
  });
  res.status(validation.approved ? 200 : 422).json(validation);
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
