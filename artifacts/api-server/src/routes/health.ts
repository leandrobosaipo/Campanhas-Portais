import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({
    ...data,
    releaseSha: (process.env.ADOPS_RELEASE_SHA || process.env.ADOPS_IMAGE_TAG || "development").trim(),
  });
});

export default router;
