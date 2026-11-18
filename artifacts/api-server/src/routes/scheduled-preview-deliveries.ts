import { Router, type IRouter } from "express";
import {
  claimScheduledPreview,
  attemptScheduledPreview,
  receiptScheduledPreview,
  listScheduledPreviews,
} from "../lib/scheduled-preview-deliveries";
const router: IRouter = Router(),
  base = "/visual-previews/scheduled-deliveries";
router.use(base, (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (
    !process.env.OPS_API_TOKEN ||
    req.header("authorization") !== `Bearer ${process.env.OPS_API_TOKEN.trim()}`
  ) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
function body(req: any, keys: string[]) {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((k) => !keys.includes(k))
  )
    throw Error("scheduled_preview_invalid_request");
}
function failure(res: any, e: unknown) {
  const message = String((e as Error).message),
    safe = /^scheduled_preview_[a-z_]+$/.test(message)
      ? message
      : "scheduled_preview_unavailable";
  res
    .status(
      safe === "scheduled_preview_unavailable"
        ? 503
        : safe === "scheduled_preview_invalid_request" ||
            safe === "scheduled_preview_exact_receipt_required"
          ? 400
          : 409,
    )
    .json({ error: safe, publicationEnabled: false });
}
router.get(base, async (_req, res) => {
  try {
    res.json(await listScheduledPreviews());
  } catch (e) {
    failure(res, e);
  }
});
router.post(base + "/claim", async (req, res) => {
  try {
    body(req, ["claimRequestId", "insertionId"]);
    if (
      !uuid(req.body.claimRequestId) ||
      (req.body.insertionId !== undefined &&
        (!Number.isSafeInteger(req.body.insertionId) ||
          req.body.insertionId <= 0))
    )
      throw Error("scheduled_preview_invalid_request");
    res.json(
      await claimScheduledPreview(
        req.body.claimRequestId,
        req.body.insertionId,
      ),
    );
  } catch (e) {
    failure(res, e);
  }
});
for (const action of ["attempt", "receipt"])
  router.post(base + "/" + action, async (req, res) => {
    try {
      body(
        req,
        action === "attempt"
          ? ["deliveryId", "claimToken"]
          : ["deliveryId", "claimToken", "receipt"],
      );
      if (!uuid(req.body.deliveryId) || !uuid(req.body.claimToken))
        throw Error("scheduled_preview_invalid_request");
      res.json(
        action === "attempt"
          ? await attemptScheduledPreview(
              req.body.deliveryId,
              req.body.claimToken,
            )
          : await receiptScheduledPreview(
              req.body.deliveryId,
              req.body.claimToken,
              req.body.receipt,
            ),
      );
    } catch (e) {
      failure(res, e);
    }
  });
export default router;
