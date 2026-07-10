import { Router, type IRouter } from "express";
import { getActiveCampaignOperations } from "../lib/campaign-operations";
import { enqueueDriveInventoryRefresh, getDriveInventoryStatus } from "../lib/drive-inventory";

const router: IRouter = Router();

const VALID_SITES = new Set(["OMT", "ROO", "PERRENGUE", "AFL", "PNMT", "PPMT"]);
const SITE_ALIASES: Record<string, string> = {
  PMT: "PPMT",
  PMMT: "PPMT",
};

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

  const requestedSiteSigla = typeof req.query.siteSigla === "string" && req.query.siteSigla.trim()
    ? req.query.siteSigla.trim().toUpperCase()
    : null;
  const siteSigla = requestedSiteSigla ? SITE_ALIASES[requestedSiteSigla] ?? requestedSiteSigla : null;
  if (siteSigla && !VALID_SITES.has(siteSigla)) {
    res.status(400).json({
      error: "bad_request",
      details: "siteSigla deve ser um dos portais suportados.",
      allowed: Array.from(VALID_SITES),
      aliases: SITE_ALIASES,
    });
    return;
  }

  try {
    const refreshDrive = parseBoolean(req.query.refreshDrive, false);
    const monitorMode = process.env.DRIVE_INTEGRATION_MODE === "monitor";
    const refresh = refreshDrive && monitorMode
      ? await enqueueDriveInventoryRefresh("campaign-operations")
      : null;
    const payload = await getActiveCampaignOperations({
      date: date ?? undefined,
      refreshDrive: refreshDrive && !monitorMode,
      siteSigla,
      includeEvidence: parseBoolean(req.query.includeEvidence, true),
    });
    const inventory = await getDriveInventoryStatus();
    res.json({
      ...payload,
      snapshotStatus: inventory.snapshotStatus,
      snapshotAt: inventory.snapshotAt,
      snapshotAgeSeconds: inventory.snapshotAgeSeconds,
      stale: inventory.stale,
      refreshJobId: refresh?.jobId ?? null,
      driveInventory: { ...inventory, refreshJobId: refresh?.jobId ?? null },
    });
  } catch (error) {
    res.status(500).json({
      error: "campaign_operations_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
