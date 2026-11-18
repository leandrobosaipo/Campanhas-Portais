import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { pool } from "@workspace/db";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  previewRevision,
  previewHash,
  previewConsumer,
} from "../lib/visual-preview-policy.mjs";
import {
  ensureVisualPreviewSchema,
  visualPreviewSnapshot,
  kickVisualPreviewRunner,
  visualPreviewPath,
  enqueueVisualPreview,
} from "../lib/visual-previews";

const router: IRouter = Router();
function authorize(req: Request, res: Response, next: NextFunction) {
  const token = process.env.OPS_API_TOKEN?.trim(),
    internal = process.env.ADOPS_INTERNAL_API_TOKEN?.trim();
  res.setHeader("Cache-Control", "private, no-store");
  if (
    !(token && req.header("authorization") === `Bearer ${token}`) &&
    !(req.method === "POST" && internal && req.header("x-adops-api-token") === internal)
  ) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
router.use("/insertions/:id/visual-previews", authorize);
router.get("/visual-previews/completed", authorize, async (req, res) => {
  try {
    await ensureVisualPreviewSchema();
    kickVisualPreviewRunner();
    const cursor = String(req.query.cursor ?? "0");
    if (!/^\d{1,19}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n)
      throw Error("preview_invalid_cursor");
    const rows = (
      await pool.query(
        `SELECT p.*,e.seq::text AS cursor_seq FROM adops_visual_preview_events e JOIN adops_visual_previews p ON p.id=e.preview_id WHERE e.seq>$1::bigint ORDER BY e.seq LIMIT 50`,
        [cursor],
      )
    ).rows;
    const items = [];
    for (const row of rows) {
      try {
        if (
          row.status === "completed" &&
          previewHash(await visualPreviewSnapshot(row.insertion_id, false)) ===
            row.snapshot_hash
        )
          items.push(previewConsumer(row));
      } catch (e) {
        if (
          ![
            "insertion_not_found",
            "insertion_inactive",
            "preview_slot_unconfigured",
            "preview_rule_ambiguous",
            "preview_rule_drift",
            "preview_media_or_page_missing",
            "preview_page_origin_mismatch",
          ].includes(String((e as Error).message))
        )
          throw e;
      }
    }
    const last = rows.at(-1);
    res.json({
      items,
      nextCursor: last ? last.cursor_seq : cursor,
      publicationEnabled: false,
    });
  } catch (e) {
    failure(res, e);
  }
});
function failure(res: Response, e: unknown) {
  const message = String((e as Error).message);
  const safe =
    /^(invalid_revision|insertion_not_found|insertion_inactive|preview_[a-z_]+|unsafe_preview_[a-z_]+)$/.test(
      message,
    )
      ? message
      : "preview_unavailable";
  res
    .status(
      ["insertion_not_found", "preview_not_found"].includes(safe)
        ? 404
        : [
              "invalid_revision",
              "preview_invalid_cursor",
              "preview_server_snapshot_required",
            ].includes(safe)
          ? 400
          : safe === "preview_unavailable"
            ? 503
            : 409,
    )
    .json({ error: safe, publicationEnabled: false });
}
router.post("/insertions/:id/visual-previews", async (req, res) => {
  try {
    const insertionId = Number(req.params.id);
    if (!Number.isSafeInteger(insertionId) || insertionId <= 0)
      throw Error("insertion_not_found");
    if (
      req.body != null &&
      (Array.isArray(req.body) ||
        typeof req.body !== "object" ||
        Object.keys(req.body).some((k) => k !== "revision"))
    )
      throw Error("preview_server_snapshot_required");
    const result = await enqueueVisualPreview(insertionId, req.body?.revision);
    res
      .status(
        result.status === "failed"
          ? 409
          : result.status === "completed"
            ? 200
            : 202,
      )
      .json(result);
  } catch (e) {
    failure(res, e);
  }
});
async function current(id: unknown, revision: unknown) {
  const insertionId = Number(id);
  if (!Number.isSafeInteger(insertionId) || insertionId <= 0)
    throw Error("insertion_not_found");
  await ensureVisualPreviewSchema();
  kickVisualPreviewRunner();
  const row = (
    await pool.query(
      "SELECT * FROM adops_visual_previews WHERE insertion_id=$1 AND revision=$2",
      [insertionId, previewRevision(revision)],
    )
  ).rows[0];
  if (!row) throw Error("preview_not_found");
  if (
    previewHash(await visualPreviewSnapshot(insertionId, false)) !==
    row.snapshot_hash
  )
    throw Error("preview_revision_stale");
  return row;
}
router.get("/insertions/:id/visual-previews/:revision", async (req, res) => {
  try {
    const row = await current(req.params.id, req.params.revision);
    res.json(previewConsumer(row));
  } catch (e) {
    failure(res, e);
  }
});
router.get(
  "/insertions/:id/visual-previews/:revision/download",
  async (req, res) => {
    try {
      const row = await current(req.params.id, req.params.revision);
      if (row.status !== "completed") throw Error("preview_not_completed");
      const png = await readFile(visualPreviewPath(row.id));
      if (createHash("sha256").update(png).digest("hex") !== row.sha256)
        throw Error("preview_artifact_corrupt");
      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="previa-${row.insertion_id}-${row.revision}.png"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(png);
    } catch (e) {
      failure(res, e);
    }
  },
);
export default router;
