import { Router, type IRouter } from "express";
import { getActiveCampaignOperations } from "../lib/campaign-operations";

const router: IRouter = Router();

const VALID_SITES = new Set(["OMT", "ROO", "PERRENGUE", "AFL", "PNMT", "PPMT"]);

function parseDate(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed.toISOString().slice(0, 10) === value ? value : "invalid";
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (value == null || value === "") return fallback;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return fallback;
}

router.get("/campaign-operations/active", async (req, res): Promise<void> => {
  const date = parseDate(req.query.date);
  if (date === "invalid") {
    res.status(400).json({ error: "bad_request", details: "date deve estar no formato YYYY-MM-DD." });
    return;
  }

  const siteSigla = typeof req.query.siteSigla === "string" && req.query.siteSigla.trim()
    ? req.query.siteSigla.trim().toUpperCase()
    : null;
  if (siteSigla && !VALID_SITES.has(siteSigla)) {
    res.status(400).json({
      error: "bad_request",
      details: "siteSigla deve ser um dos portais suportados.",
      allowed: Array.from(VALID_SITES),
    });
    return;
  }

  try {
    const payload = await getActiveCampaignOperations({
      date: date ?? undefined,
      refreshDrive: parseBoolean(req.query.refreshDrive, false),
      siteSigla,
      includeEvidence: parseBoolean(req.query.includeEvidence, true),
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: "campaign_operations_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
