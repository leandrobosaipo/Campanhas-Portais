import express, { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { LocalMediaUploadError, MAX_LOCAL_MEDIA_BYTES, uploadLocalMediaAsset } from "../lib/local-media-upload";

const router: IRouter = Router();
const allowedTypes = ["image/gif", "image/png", "image/jpeg", "image/webp", "video/mp4"];

router.post(
  "/media-assets/local-upload",
  express.raw({ type: allowedTypes, limit: MAX_LOCAL_MEDIA_BYTES }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(415).json({ error: "unsupported_media_type", accepted: allowedTypes });
      return;
    }
    try {
      const result = await uploadLocalMediaAsset({ bytes: req.body, contentType: req.header("content-type") ?? "" });
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof LocalMediaUploadError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      req.log?.error({ err: error }, "local media upload failed");
      res.status(502).json({ error: "media_upload_failed" });
    }
  },
);

router.use((error: { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (error.status === 413 || error.type === "entity.too.large") {
    res.status(413).json({ error: "media_too_large" });
    return;
  }
  next(error);
});

export default router;
