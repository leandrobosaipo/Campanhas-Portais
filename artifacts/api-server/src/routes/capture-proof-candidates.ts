import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  captureProofCandidateReviewsTable,
  captureProofCandidatesTable,
  db,
} from "@workspace/db";
import { attachServerCaptureProvenance } from "../lib/capture-audit";
import { validateAuditChecklist } from "../lib/audit-checklist";
import { inspectPersistedCaptureCandidate, loadPersistedCandidateSource, readCandidateArtifact } from "../lib/capture-proof-candidate-store";
import { stableJson } from "../lib/capture-proof-candidate-provenance.mjs";

const router = Router();
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CHECKLIST_VERSION = "capture-proof-candidate-audit-v1";

function serializeCandidate(row: typeof captureProofCandidatesTable.$inferSelect, latestReview: typeof captureProofCandidateReviewsTable.$inferSelect | null) {
  return {
    candidateId: row.id,
    insertionId: row.insertionId,
    targetDate: row.targetDate,
    sourceJobId: row.sourceJobId,
    artifactUrl: row.artifactUrl,
    artifactSha256: row.artifactSha256,
    artifactBytes: row.artifactBytes,
    requestedCaptureAt: row.requestedCaptureAt,
    capturedAt: row.capturedAt.toISOString(),
    captureStageStartedAt: row.captureStageStartedAt.toISOString(),
    captureStageFinishedAt: row.captureStageFinishedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    checklistVersion: row.checklistVersion,
    historicalDisplayConfirmed: false,
    state: latestReview?.decision ?? row.state,
    latestReview: latestReview ? {
      decision: latestReview.decision,
      evaluatedAt: latestReview.evaluatedAt.toISOString(),
      checklist: latestReview.checklist,
    } : null,
  };
}

router.post("/internal/insertions/:id/capture-proof/candidates", async (req: Request, res: Response): Promise<void> => {
  if (process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED !== "true") {
    res.status(404).json({ error: "capture_proof_candidates_disabled" });
    return;
  }
  const insertionId = Number.parseInt(String(req.params.id ?? ""), 10);
  const targetDate = typeof req.body?.date === "string" ? req.body.date : "";
  const sourceJobId = typeof req.body?.sourceJobId === "string" ? req.body.sourceJobId.trim() : "";
  if (!Number.isInteger(insertionId) || insertionId <= 0 || !DATE_KEY.test(targetDate) || !sourceJobId) {
    res.status(400).json({ error: "invalid_candidate_identity", details: "Informe date e sourceJobId válidos." });
    return;
  }
  const trusted = await loadPersistedCandidateSource(sourceJobId, insertionId, targetDate);
  if (!trusted.ok) {
    res.status(409).json({ error: "candidate_provenance_blocked", cause: trusted.reason, details: "Job, metadata, timestamps ou caminho do artefato não foram comprovados." });
    return;
  }
  let artifact: { sha256: string; bytes: number };
  try {
    artifact = await readCandidateArtifact(trusted.artifactUrl);
  } catch (error) {
    res.status(409).json({ error: "candidate_artifact_blocked", details: error instanceof Error ? error.message : "Falha na leitura do artefato." });
    return;
  }
  const id = randomUUID();
  const [inserted] = await db.insert(captureProofCandidatesTable).values({
    id,
    insertionId,
    targetDate,
    sourceJobId,
    artifactUrl: trusted.artifactUrl.toString(),
    artifactSha256: artifact.sha256,
    artifactBytes: artifact.bytes,
    requestedCaptureAt: typeof trusted.requestedCaptureAt === "string" ? trusted.requestedCaptureAt : null,
    capturedAt: new Date(trusted.capturedAt),
    captureStageStartedAt: new Date(trusted.captureStageStartedAt),
    captureStageFinishedAt: new Date(trusted.captureStageFinishedAt),
    metadata: trusted.metadata,
    checklistVersion: CHECKLIST_VERSION,
    historicalDisplayConfirmed: false,
    state: "registered",
  }).onConflictDoNothing().returning();

  const [candidate] = inserted
    ? [inserted]
    : await db.select().from(captureProofCandidatesTable).where(and(
      eq(captureProofCandidatesTable.sourceJobId, sourceJobId),
      eq(captureProofCandidatesTable.artifactSha256, artifact.sha256),
    )).limit(1);
  if (!candidate || candidate.insertionId !== insertionId || candidate.targetDate !== targetDate || candidate.artifactUrl !== trusted.artifactUrl.toString() || candidate.artifactBytes !== artifact.bytes) {
    res.status(409).json({ error: "candidate_idempotency_conflict" });
    return;
  }
  if (candidate.capturedAt.toISOString() !== trusted.capturedAt
    || candidate.captureStageStartedAt.toISOString() !== trusted.captureStageStartedAt
    || candidate.captureStageFinishedAt.toISOString() !== trusted.captureStageFinishedAt
    || stableJson(candidate.metadata) !== stableJson(trusted.metadata)) {
    res.status(409).json({ error: "candidate_idempotency_conflict" });
    return;
  }
  const [latestReview] = await db.select().from(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
    .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
  res.status(inserted ? 201 : 200).json({ ok: true, candidate: serializeCandidate(candidate, latestReview ?? null) });
});

router.get("/internal/insertions/:id/capture-proof/candidates", async (req: Request, res: Response): Promise<void> => {
  const insertionId = Number.parseInt(String(req.params.id ?? ""), 10);
  const targetDate = typeof req.query.date === "string" ? req.query.date : "";
  if (!Number.isInteger(insertionId) || !DATE_KEY.test(targetDate)) {
    res.status(400).json({ error: "invalid_candidate_identity" });
    return;
  }
  const rows = await db.select().from(captureProofCandidatesTable).where(and(
    eq(captureProofCandidatesTable.insertionId, insertionId),
    eq(captureProofCandidatesTable.targetDate, targetDate),
  )).orderBy(desc(captureProofCandidatesTable.receivedAt));
  const items = await Promise.all(rows.map(async (row) => {
    const [review] = await db.select().from(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.candidateId, row.id))
      .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
    return serializeCandidate(row, review ?? null);
  }));
  res.setHeader("cache-control", "no-store");
  res.json({ insertionId, date: targetDate, candidates: items });
});

router.get("/internal/capture-proof-candidates/:candidateId", async (req: Request, res: Response): Promise<void> => {
  const candidateId = String(req.params.candidateId ?? "");
  const [candidate] = await db.select().from(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, candidateId)).limit(1);
  if (!candidate) {
    res.status(404).json({ error: "candidate_not_found" });
    return;
  }
  const [review] = await db.select().from(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
    .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
  res.setHeader("cache-control", "no-store");
  res.json(serializeCandidate(candidate, review ?? null));
});

router.post("/internal/capture-proof-candidates/:candidateId/audit", async (req: Request, res: Response): Promise<void> => {
  if (process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED !== "true") {
    res.status(404).json({ error: "capture_proof_candidates_disabled" });
    return;
  }
  const candidateId = String(req.params.candidateId ?? "");
  const [candidate] = await db.select().from(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, candidateId)).limit(1);
  if (!candidate) {
    res.status(404).json({ error: "candidate_not_found" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    // Use the same lock order as promotion; an audit cannot race its decision.
    await tx.execute(sql`select id from insertions where id = ${candidate.insertionId} for update`);
    await tx.execute(sql`select id from capture_proof_candidates where id = ${candidate.id} for update`);
    const trusted = await inspectPersistedCaptureCandidate(candidate);
    let checklist: Record<string, unknown>;
    if (!trusted.ok) {
      checklist = { approved: false, preliminary: false, version: CHECKLIST_VERSION, blockingIssues: [{ code: trusted.reason, gate: "candidateSource" }] };
    } else {
      const metadata = { ...trusted.source.metadata };
      attachServerCaptureProvenance(metadata, {
        targetDate: candidate.targetDate,
        sourceJobId: candidate.sourceJobId,
        capturedAt: candidate.capturedAt.toISOString(),
        uploadedUrl: candidate.artifactUrl,
      });
      checklist = await validateAuditChecklist({ insertionId: candidate.insertionId, date: candidate.targetDate, metadata, candidateFinalPageClock: true }) as unknown as Record<string, unknown>;
    }
    const decision = checklist.approved === true ? "candidate_approved" : "candidate_blocked";
    const [previous] = await tx.select().from(captureProofCandidateReviewsTable)
      .where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
      .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
    if (previous && previous.decision === decision && stableJson(previous.checklist) === stableJson(checklist)) {
      return { review: previous, duplicate: true, sourceBlocked: !trusted.ok };
    }
    const [review] = await tx.insert(captureProofCandidateReviewsTable).values({
      id: randomUUID(), candidateId: candidate.id, insertionId: candidate.insertionId,
      targetDate: candidate.targetDate, artifactSha256: candidate.artifactSha256,
      decision, checklistVersion: String(checklist.version ?? CHECKLIST_VERSION),
      auditPolicyVersion: typeof candidate.metadata.auditPolicyVersion === "string" ? candidate.metadata.auditPolicyVersion : null,
      checklist, evaluatedBy: "internal_api",
    }).returning();
    return { review: review!, duplicate: false, sourceBlocked: !trusted.ok };
  });
  res.status(result.sourceBlocked ? 409 : result.duplicate ? 200 : 201).json({
    candidateId: candidate.id, decision: result.review.decision,
    checklist: result.review.checklist, evaluatedAt: result.review.evaluatedAt.toISOString(),
    duplicate: result.duplicate,
  });
});

export default router;
