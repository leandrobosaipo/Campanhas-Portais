import { Router } from "express";
import { captureProofCandidatePromotionsTable, db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { promoteApprovedCaptureCandidate } from "../lib/capture-proof-candidate-promotion";
import { parsePromotionRequestBody } from "../lib/historical-presentation-upgrade-guard.mjs";
import { queueMonthlyEvidenceRefreshForDate } from "./ops";

const router = Router();

router.get("/internal/capture-proof-candidates/:candidateId/promotions", async (req, res): Promise<void> => {
  const rows = await db.select().from(captureProofCandidatePromotionsTable)
    .where(eq(captureProofCandidatePromotionsTable.candidateId, String(req.params.candidateId)))
    .orderBy(desc(captureProofCandidatePromotionsTable.receivedAt));
  res.json({ promotions: rows.map((row) => {
    const audit = row.audit && typeof row.audit === "object" && !Array.isArray(row.audit)
      ? row.audit as Record<string, unknown> : null;
    const rawExpected = audit?.expectedOriginal && typeof audit.expectedOriginal === "object" && !Array.isArray(audit.expectedOriginal)
      ? audit.expectedOriginal as Record<string, unknown> : null;
    const expectedOriginal = audit?.reason === "presentation_upgrade" && rawExpected
      && typeof rawExpected.evidenceId === "number" && Number.isSafeInteger(rawExpected.evidenceId) && rawExpected.evidenceId > 0
      && typeof rawExpected.arquivoUrl === "string" && typeof rawExpected.sha256 === "string"
      && /^[a-f0-9]{64}$/.test(rawExpected.sha256)
      && typeof rawExpected.bytes === "number" && Number.isSafeInteger(rawExpected.bytes) && rawExpected.bytes > 0
      ? { evidenceId: rawExpected.evidenceId, arquivoUrl: rawExpected.arquivoUrl, sha256: rawExpected.sha256, bytes: rawExpected.bytes }
      : null;
    return {
      id: row.id, candidateId: row.candidateId, insertionId: row.insertionId,
      targetDate: row.targetDate, sourceJobId: row.sourceJobId,
      artifactSha256: row.candidateSha256, artifactBytes: row.candidateBytes,
      finalLogId: row.finalLogId, status: row.status, failure: row.failure,
      ...(expectedOriginal ? { reason: "presentation_upgrade", expectedOriginal } : {}),
      receivedAt: row.receivedAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
  }) });
});

// /internal is guarded by the existing internal API token middleware.
router.post("/internal/capture-proof-candidates/:candidateId/promote", async (req, res): Promise<void> => {
  if (process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED !== "true") {
    res.status(404).json({ error: "capture_proof_candidates_disabled" });
    return;
  }
  const candidateId = String(req.params.candidateId ?? "");
  if (!/^[a-f0-9-]{36}$/.test(candidateId)) {
    res.status(400).json({ error: "invalid_candidate_id" });
    return;
  }
  const parsedRequest = parsePromotionRequestBody(req.body);
  if (!parsedRequest.ok) {
    res.status(400).json({ error: parsedRequest.error });
    return;
  }
  try {
    const result = await promoteApprovedCaptureCandidate(candidateId, {}, parsedRequest.expectation);
    let reportRefresh: unknown = null;
    if (!result.idempotent) {
      try {
        reportRefresh = await queueMonthlyEvidenceRefreshForDate(result.audit.date, "approved-candidate-promotion");
      } catch {
        reportRefresh = { status: "pending", error: "monthly_report_refresh_not_confirmed" };
      }
    }
    res.json({ ...result, reportRefresh });
  } catch (failure) {
    const code = failure && typeof failure === "object" && "code" in failure
      ? String(failure.code) : "candidate_promotion_failed";
    const safeCode = /^[a-z][a-z0-9_]+$/.test(code) ? code : "candidate_promotion_failed";
    res.status(safeCode === "candidate_not_found" ? 404 : 409).json({
      error: safeCode,
      details: "A promoção não foi confirmada. Consulte a auditoria e o registro de promoção; a geração de nova captura não substitui este gate.",
    });
  }
});

export default router;
