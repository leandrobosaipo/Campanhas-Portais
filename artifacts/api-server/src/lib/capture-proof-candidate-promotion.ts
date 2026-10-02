import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  captureProofCandidateReviewsTable,
  captureProofCandidatesTable,
  captureProofCandidatePromotionsTable,
  captureProofLogsTable,
  campaignsTable,
  db,
  evidencesTable,
  insertionsTable,
  sitesTable,
} from "@workspace/db";
import { getEvidenceDateKey, AUDIT_POLICY_VERSION_IMMUTABLE_CAPTURE } from "./capture-audit";
import { attachServerCaptureProvenance } from "./capture-audit";
import { validateAuditChecklist, type AuditChecklistValidation } from "./audit-checklist";
import { selectCanonicalEvidencePerDate } from "./evidence-export";
import { getLocalCaptureRuntime } from "./local-capture-runtime";
import { inspectPersistedCaptureCandidate } from "./capture-proof-candidate-store";

export type CaptureProofCandidateRow = typeof captureProofCandidatesTable.$inferSelect;
type ArchivePlan = { sourceKey: string; archiveKey: string; sha256?: string; bytes?: number };
type ArchiveHelpers = {
  buildEvidenceReplacementArchivePlan(input: Record<string, unknown>): ArchivePlan | null;
  archiveEvidenceBeforeReplacement(env: unknown, bucket: string, plan: ArchivePlan): ArchivePlan;
  parseSpacesEnv(filePath: string): unknown;
};

export type CandidatePromotionServices = {
  hashArtifact?: (url: string) => Promise<{ sha256: string; bytes: number }>;
  inspectCandidate?: (candidate: CaptureProofCandidateRow) => Promise<{
    ok: boolean;
    reason?: string;
    artifact?: { sha256: string; bytes: number };
  }>;
  archiveOriginal?: (input: {
    originalUrl: string;
    siteSigla: string;
    campaignId: number;
    competencia: string | null;
    insertionId: number;
    targetDate: string;
  }) => Promise<ArchivePlan>;
  audit?: (input: { insertionId: number; date: string; metadata?: unknown; phase?: "final" }) => Promise<AuditChecklistValidation>;
};

function promotionError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function configuredBucketForHost(hostname: string, runtimeBucket: string, siteBucket: string | null | undefined, region: string) {
  const configured = new Set([siteBucket, runtimeBucket].filter((value): value is string => Boolean(value)));
  for (const bucket of configured) {
    if (hostname === `${bucket}.${region}.digitaloceanspaces.com`) return bucket;
  }
  return null;
}

async function hashRemoteBytes(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw promotionError("candidate_url_must_be_https");
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw promotionError("candidate_artifact_read_failed");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 20 * 1024 * 1024) throw promotionError("candidate_artifact_too_large");
  if (!response.body) throw promotionError("candidate_artifact_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > 20 * 1024 * 1024) {
      await reader.cancel();
      throw promotionError("candidate_artifact_too_large");
    }
    chunks.push(part.value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length);
  return { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

function loadArchiveHelpers(): ArchiveHelpers {
  const root = process.env.ADOPS_PROJECT_ROOT || process.cwd();
  const requireFromApi = createRequire(path.join(root, "artifacts/api-server/package.json"));
  return requireFromApi(path.join(root, "scripts/src/capture-insertion-proof.cjs")) as ArchiveHelpers;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function canonicalEvidenceForDate(rows: Array<typeof evidencesTable.$inferSelect>, targetDate: string) {
  return selectCanonicalEvidencePerDate(rows, (row) => getEvidenceDateKey(row.titulo))
    .find((row) => getEvidenceDateKey(row.titulo) === targetDate) ?? null;
}

/**
 * Promote exact, already-approved candidate bytes. This performs no capture.
 * All storage operations are read/archive/readback only; the canonical pointer
 * is changed only after persisted approval, source-job and hash checks pass.
 */
export async function promoteApprovedCaptureCandidate(candidateId: string, services: CandidatePromotionServices = {}) {
  const readArtifact = services.hashArtifact ?? hashRemoteBytes;
  const audit = services.audit ?? validateAuditChecklist;
  const [candidate] = await db.select().from(captureProofCandidatesTable)
    .where(eq(captureProofCandidatesTable.id, candidateId)).limit(1);
  if (!candidate) throw promotionError("candidate_not_found");

  const [latestReview] = await db.select().from(captureProofCandidateReviewsTable)
    .where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
    .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
  if (!latestReview || latestReview.decision !== "candidate_approved"
    || latestReview.artifactSha256 !== candidate.artifactSha256
    || latestReview.insertionId !== candidate.insertionId || latestReview.targetDate !== candidate.targetDate) {
    throw promotionError("persisted_candidate_approval_required");
  }

  const sourceCheck = await (services.inspectCandidate ?? inspectPersistedCaptureCandidate)(candidate);
  const sourceValid = Boolean(sourceCheck.ok && sourceCheck.artifact
    && sourceCheck.artifact.sha256 === candidate.artifactSha256 && sourceCheck.artifact.bytes === candidate.artifactBytes);
  const sourceFailure = !sourceCheck.ok || !sourceCheck.artifact
    ? promotionError(sourceCheck.reason || "persisted_source_job_candidate_mismatch")
    : promotionError("candidate_artifact_hash_mismatch");

  const promotionRows = await db.select().from(captureProofCandidatePromotionsTable)
    .where(eq(captureProofCandidatePromotionsTable.candidateId, candidate.id))
    .orderBy(desc(captureProofCandidatePromotionsTable.receivedAt));
  // A concurrent loser may append a newer blocked row after the winning
  // transaction committed. Keep the durable promotion authoritative.
  const priorPromotion = promotionRows.find((row) => ["awaiting_readback", "approved", "promoting"].includes(row.status))
    ?? promotionRows[0];
  if (priorPromotion?.status === "approved") {
    if (!sourceValid) throw sourceFailure;
    const priorAudit = await audit({ insertionId: candidate.insertionId, date: candidate.targetDate, phase: "final" });
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
    const current = canonicalEvidenceForDate(rows, candidate.targetDate);
    const finalHash = current?.arquivoUrl ? await readArtifact(current.arquivoUrl) : null;
    if (priorAudit.approved && current?.arquivoUrl === candidate.artifactUrl
      && finalHash?.sha256 === candidate.artifactSha256 && finalHash.bytes === candidate.artifactBytes) {
      return { ok: true, promotionId: priorPromotion.id, candidateId, finalLogId: priorPromotion.finalLogId, capturedAt: candidate.capturedAt.toISOString(), receivedAt: priorPromotion.receivedAt.toISOString(), archiveSaved: Boolean(priorPromotion.archive), audit: priorAudit, idempotent: true };
    }
    throw promotionError("prior_promotion_readback_invalid");
  }

  if (priorPromotion?.status === "awaiting_readback") {
    const priorLogId = priorPromotion.finalLogId;
    const [priorLog] = priorLogId ? await db.select().from(captureProofLogsTable)
      .where(eq(captureProofLogsTable.id, priorLogId)).limit(1) : [];
    const savedOriginal = priorPromotion.originalEvidence as typeof evidencesTable.$inferSelect | null;
    try {
      if (!sourceValid) throw sourceFailure;
      if (priorPromotion.insertionId !== candidate.insertionId || priorPromotion.targetDate !== candidate.targetDate
        || priorPromotion.sourceJobId !== candidate.sourceJobId || priorPromotion.candidateUrl !== candidate.artifactUrl
        || priorPromotion.candidateSha256 !== candidate.artifactSha256 || priorPromotion.candidateBytes !== candidate.artifactBytes
        || !priorLog || priorLog.insertionId !== candidate.insertionId || priorLog.targetDate !== candidate.targetDate
        || priorLog.jobId !== candidate.sourceJobId || priorLog.runnerJobId !== candidate.sourceJobId
        || priorLog.uploadedUrl !== candidate.artifactUrl || priorLog.status !== "ok"
        || (priorLog.artifacts as Record<string, unknown>)?.candidateId !== candidate.id) {
        throw promotionError("prior_promotion_record_readback_invalid");
      }
      const priorAudit = await audit({ insertionId: candidate.insertionId, date: candidate.targetDate, phase: "final" });
      const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
      const current = canonicalEvidenceForDate(rows, candidate.targetDate);
      const finalHash = current?.arquivoUrl ? await readArtifact(current.arquivoUrl) : null;
      if (!priorAudit.approved || current?.arquivoUrl !== candidate.artifactUrl
        || finalHash?.sha256 !== candidate.artifactSha256 || finalHash.bytes !== candidate.artifactBytes) {
        throw Object.assign(promotionError("prior_promotion_readback_invalid"), { audit: priorAudit });
      }
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from insertions where id = ${candidate.insertionId} for update`);
        await tx.execute(sql`select id from capture_proof_candidates where id = ${candidate.id} for update`);
        await tx.execute(sql`select id from capture_proof_candidate_promotions where id = ${priorPromotion.id} for update`);
        const lockedRows = await tx.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
        const lockedCurrent = canonicalEvidenceForDate(lockedRows, candidate.targetDate);
        const [lockedLog] = await tx.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, priorLogId!)).limit(1);
        const [lockedReview] = await tx.select().from(captureProofCandidateReviewsTable)
          .where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
          .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
        const [lockedPromotion] = await tx.select().from(captureProofCandidatePromotionsTable)
          .where(eq(captureProofCandidatePromotionsTable.id, priorPromotion.id)).limit(1);
        if (lockedPromotion?.status !== "awaiting_readback"
          || lockedPromotion.candidateId !== candidate.id || lockedPromotion.insertionId !== candidate.insertionId
          || lockedPromotion.targetDate !== candidate.targetDate || lockedPromotion.sourceJobId !== candidate.sourceJobId
          || lockedPromotion.candidateUrl !== candidate.artifactUrl || lockedPromotion.candidateSha256 !== candidate.artifactSha256
          || lockedPromotion.candidateBytes !== candidate.artifactBytes || lockedPromotion.finalLogId !== priorLogId
          || !lockedLog || lockedLog.insertionId !== candidate.insertionId || lockedLog.targetDate !== candidate.targetDate
          || lockedLog.jobId !== candidate.sourceJobId || lockedLog.runnerJobId !== candidate.sourceJobId
          || lockedLog.status !== "ok" || lockedLog.uploadedUrl !== candidate.artifactUrl
          || (lockedLog.artifacts as Record<string, unknown>)?.candidateId !== candidate.id
          || lockedCurrent?.arquivoUrl !== candidate.artifactUrl
          || !lockedReview || lockedReview.id !== latestReview.id || lockedReview.decision !== "candidate_approved"
          || lockedReview.artifactSha256 !== candidate.artifactSha256 || lockedReview.insertionId !== candidate.insertionId
          || lockedReview.targetDate !== candidate.targetDate) {
          throw promotionError("prior_promotion_state_changed");
        }
        const [updated] = await tx.update(captureProofCandidatePromotionsTable)
          .set({ status: "approved", audit: toJsonRecord(priorAudit), updatedAt: new Date() })
          .where(and(eq(captureProofCandidatePromotionsTable.id, priorPromotion.id), eq(captureProofCandidatePromotionsTable.status, "awaiting_readback")))
          .returning({ id: captureProofCandidatePromotionsTable.id });
        if (!updated) throw promotionError("prior_promotion_state_changed");
      });
      return { ok: true, promotionId: priorPromotion.id, candidateId, finalLogId: priorLogId, capturedAt: candidate.capturedAt.toISOString(), receivedAt: priorPromotion.receivedAt.toISOString(), archiveSaved: Boolean(priorPromotion.archive), audit: priorAudit, idempotent: true };
    } catch (error) {
      await compensatePromotion({
        promotionId: priorPromotion.id, finalLogId: priorLogId ?? "", candidate,
        original: savedOriginal, archive: priorPromotion.archive as ArchivePlan | null, readArtifact,
      });
      throw error;
    }
  }
  if (priorPromotion && !["blocked", "rolled_back"].includes(priorPromotion.status)) {
    throw promotionError("prior_promotion_not_resumable");
  }
  if (!sourceValid) throw sourceFailure;

  const [insertion] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, candidate.insertionId)).limit(1);
  if (!insertion) throw promotionError("insertion_not_found");
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, insertion.campanhaId)).limit(1);
  const [site] = insertion.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, insertion.siteId)).limit(1) : [];
  const evidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
  const original = canonicalEvidenceForDate(evidenceRows, candidate.targetDate);
  const originalLogs = await db.select().from(captureProofLogsTable).where(and(
    eq(captureProofLogsTable.insertionId, candidate.insertionId),
    eq(captureProofLogsTable.targetDate, candidate.targetDate),
  ));

  const canonicalAudit = await audit({ insertionId: candidate.insertionId, date: candidate.targetDate, phase: "final" });
  if (canonicalAudit.approved) throw promotionError("canonical_already_approved");

  let archive: ArchivePlan | null = null;
  if (original?.arquivoUrl && original.arquivoUrl !== candidate.artifactUrl) {
    if (services.archiveOriginal) {
      archive = await services.archiveOriginal({
        originalUrl: original.arquivoUrl,
        siteSigla: String(site?.sigla ?? ""),
        campaignId: insertion.campanhaId,
        competencia: campaign?.competencia ?? null,
        insertionId: candidate.insertionId,
        targetDate: candidate.targetDate,
      });
    } else {
      const runtime = getLocalCaptureRuntime();
      const parsedOriginal = new URL(original.arquivoUrl);
      const helpers = loadArchiveHelpers();
      const storageEnv = helpers.parseSpacesEnv(runtime.spacesEnvFile) as { region?: string; endpoint?: string };
      const region = String(storageEnv.region || new URL(String(storageEnv.endpoint)).hostname.split(".")[0] || "");
      const bucket = configuredBucketForHost(parsedOriginal.hostname, runtime.spacesBucket, site?.spacesBucket, region);
      if (!bucket) throw promotionError("canonical_storage_bucket_not_configured");
      const plan = helpers.buildEvidenceReplacementArchivePlan({
        evidenceUrl: original.arquivoUrl,
        bucket,
        competencia: campaign?.competencia ?? "sem-competencia",
        campaignId: insertion.campanhaId,
        insertionId: candidate.insertionId,
        targetDate: candidate.targetDate,
      });
      if (!plan) throw promotionError("canonical_archive_plan_invalid");
      archive = helpers.archiveEvidenceBeforeReplacement(helpers.parseSpacesEnv(runtime.spacesEnvFile), bucket, plan);
    }
  }

  const now = new Date();
  const promotionId = crypto.randomUUID();
  const finalLogId = crypto.randomUUID();
  const trustedMetadata: Record<string, unknown> = { ...candidate.metadata, evidenceUrl: candidate.artifactUrl };
  if (trustedMetadata.captureClass !== "historical_recovery"
    || trustedMetadata.sourceJobId !== candidate.sourceJobId
    || trustedMetadata.targetDate !== candidate.targetDate
    || trustedMetadata.capturedAt !== candidate.capturedAt.toISOString()
    || trustedMetadata.auditPolicyVersion !== AUDIT_POLICY_VERSION_IMMUTABLE_CAPTURE) {
    throw promotionError("candidate_metadata_capture_provenance_mismatch");
  }
  attachServerCaptureProvenance(trustedMetadata, {
    targetDate: candidate.targetDate,
    sourceJobId: candidate.sourceJobId,
    capturedAt: candidate.capturedAt.toISOString(),
    uploadedUrl: candidate.artifactUrl,
  });

  const promotionSnapshot = {
    id: promotionId,
    candidateId: candidate.id,
    insertionId: candidate.insertionId,
    targetDate: candidate.targetDate,
    sourceJobId: candidate.sourceJobId,
    candidateUrl: candidate.artifactUrl,
    candidateSha256: candidate.artifactSha256,
    candidateBytes: candidate.artifactBytes,
    originalEvidence: original ? toJsonRecord(original) : null,
    originalLogs: originalLogs.map((row) => toJsonRecord(row)),
    archive: archive ? toJsonRecord(archive) : null,
    finalLogId,
    status: "promoting",
    receivedAt: now,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    // Serialize promotions and reject stale snapshots before any pointer change.
    await tx.execute(sql`select id from insertions where id = ${candidate.insertionId} for update`);
    await tx.execute(sql`select id from capture_proof_candidates where id = ${candidate.id} for update`);
    const currentRows = await tx.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
    const current = canonicalEvidenceForDate(currentRows, candidate.targetDate);
    if ((current?.id ?? null) !== (original?.id ?? null) || (current?.arquivoUrl ?? null) !== (original?.arquivoUrl ?? null)) {
      throw promotionError("canonical_evidence_changed_during_promotion");
    }
    const [reviewNow] = await tx.select().from(captureProofCandidateReviewsTable)
      .where(eq(captureProofCandidateReviewsTable.candidateId, candidate.id))
      .orderBy(desc(captureProofCandidateReviewsTable.evaluatedAt), desc(captureProofCandidateReviewsTable.id)).limit(1);
    if (!reviewNow || reviewNow.id !== latestReview.id || reviewNow.decision !== "candidate_approved") {
      throw promotionError("candidate_approval_changed_during_promotion");
    }
    await tx.insert(captureProofCandidatePromotionsTable).values(promotionSnapshot);
    if (current) {
      await tx.update(evidencesTable).set({ arquivoUrl: candidate.artifactUrl, tipo: "print" }).where(eq(evidencesTable.id, current.id));
    } else {
      await tx.insert(evidencesTable).values({
        insercaoId: candidate.insertionId,
        tipo: "print",
        arquivoUrl: candidate.artifactUrl,
        titulo: `Print ${candidate.targetDate}`,
      });
    }
    await tx.insert(captureProofLogsTable).values({
      id: finalLogId,
      insertionId: candidate.insertionId,
      targetDate: candidate.targetDate,
      jobId: candidate.sourceJobId,
      runnerJobId: candidate.sourceJobId,
      captureAt: candidate.requestedCaptureAt,
      status: "pending_audit",
      uploadedUrl: candidate.artifactUrl,
      metadata: trustedMetadata,
      createdAt: candidate.capturedAt,
      updatedAt: now,
      summary: { source: "approved_candidate_promotion", promotionId },
      stages: [],
      artifacts: { candidateId: candidate.id, archive: archive ?? null },
    });
    const finalAudit = await audit({
      insertionId: candidate.insertionId,
      date: candidate.targetDate,
      metadata: trustedMetadata,
      phase: "final",
    });
    if (!finalAudit.approved) throw Object.assign(promotionError("final_audit_failed"), { audit: finalAudit });
    await tx.update(captureProofCandidatePromotionsTable).set({
      status: "awaiting_readback",
      audit: toJsonRecord(finalAudit),
      updatedAt: new Date(),
    }).where(eq(captureProofCandidatePromotionsTable.id, promotionId));
    await tx.update(captureProofLogsTable).set({ status: "ok", updatedAt: new Date() }).where(eq(captureProofLogsTable.id, finalLogId));
  }).catch(async (error) => {
    await db.insert(captureProofCandidatePromotionsTable).values({
      ...promotionSnapshot,
      id: crypto.randomUUID(),
      status: "blocked",
      failure: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "promotion_transaction_failed",
      updatedAt: new Date(),
    }).catch(() => undefined);
    throw error;
  });

  // Canonical readback ensures the public loader resolves this exact log and URL.
  try {
    const finalAudit = await audit({ insertionId: candidate.insertionId, date: candidate.targetDate, phase: "final" });
    const finalEvidenceRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, candidate.insertionId));
    const readback = canonicalEvidenceForDate(finalEvidenceRows, candidate.targetDate);
    if (!finalAudit.approved || !readback || readback.arquivoUrl !== candidate.artifactUrl) {
      throw Object.assign(promotionError("canonical_final_readback_failed"), { audit: finalAudit });
    }
    const verified = await readArtifact(readback.arquivoUrl!);
    if (verified.sha256 !== candidate.artifactSha256 || verified.bytes !== candidate.artifactBytes) {
      throw promotionError("canonical_final_hash_readback_failed");
    }
    await db.update(captureProofCandidatePromotionsTable).set({ status: "approved", audit: toJsonRecord(finalAudit), updatedAt: new Date() })
      .where(eq(captureProofCandidatePromotionsTable.id, promotionId));
    return { ok: true, promotionId, candidateId, finalLogId, capturedAt: candidate.capturedAt.toISOString(), receivedAt: now.toISOString(), archiveSaved: Boolean(archive), audit: finalAudit };
  } catch (error) {
    await compensatePromotion({ promotionId, finalLogId, candidate, original, archive, readArtifact });
    throw error;
  }
}

async function compensatePromotion(input: {
  promotionId: string;
  finalLogId: string;
  candidate: CaptureProofCandidateRow;
  original: typeof evidencesTable.$inferSelect | null;
  archive: ArchivePlan | null;
  readArtifact: (url: string) => Promise<{ sha256: string; bytes: number }>;
}) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from insertions where id = ${input.candidate.insertionId} for update`);
    await tx.execute(sql`select id from capture_proof_candidate_promotions where id = ${input.promotionId} for update`);
    const [promotion] = await tx.select().from(captureProofCandidatePromotionsTable)
      .where(eq(captureProofCandidatePromotionsTable.id, input.promotionId)).limit(1);
    if (!promotion || promotion.status !== "awaiting_readback" || promotion.finalLogId !== input.finalLogId
      || promotion.candidateId !== input.candidate.id || promotion.candidateUrl !== input.candidate.artifactUrl
      || promotion.candidateSha256 !== input.candidate.artifactSha256 || promotion.candidateBytes !== input.candidate.artifactBytes) {
      throw promotionError("compensation_refused_promotion_changed");
    }
    const rows = await tx.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, input.candidate.insertionId));
    const current = canonicalEvidenceForDate(rows, input.candidate.targetDate);
    const expectedOriginal = promotion.originalEvidence as typeof evidencesTable.$inferSelect | null;
    if (!current || current.arquivoUrl !== input.candidate.artifactUrl
      || (input.original && current.id !== input.original.id)
      || (input.original?.id ?? null) !== (expectedOriginal?.id ?? null)
      || (input.original?.arquivoUrl ?? null) !== (expectedOriginal?.arquivoUrl ?? null)) {
      throw promotionError("compensation_refused_canonical_changed");
    }
    const [log] = await tx.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, input.finalLogId)).limit(1);
    if (!log || log.insertionId !== input.candidate.insertionId || log.targetDate !== input.candidate.targetDate
      || log.jobId !== input.candidate.sourceJobId || log.runnerJobId !== input.candidate.sourceJobId
      || log.uploadedUrl !== input.candidate.artifactUrl || log.status !== "ok"
      || (log.artifacts as Record<string, unknown>)?.candidateId !== input.candidate.id) {
      throw promotionError("compensation_refused_log_changed");
    }
    if (input.original) {
      const [restored] = await tx.update(evidencesTable).set({
        tipo: input.original.tipo,
        arquivoUrl: input.original.arquivoUrl,
        titulo: input.original.titulo,
      }).where(and(eq(evidencesTable.id, input.original.id), eq(evidencesTable.arquivoUrl, input.candidate.artifactUrl))).returning({ id: evidencesTable.id });
      if (!restored) throw promotionError("compensation_refused_canonical_changed");
    } else if (current) {
      const [deleted] = await tx.delete(evidencesTable).where(and(eq(evidencesTable.id, current.id), eq(evidencesTable.arquivoUrl, input.candidate.artifactUrl))).returning({ id: evidencesTable.id });
      if (!deleted) throw promotionError("compensation_refused_canonical_changed");
    }
    const [failed] = await tx.update(captureProofLogsTable).set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(captureProofLogsTable.id, input.finalLogId), eq(captureProofLogsTable.status, "ok"), eq(captureProofLogsTable.uploadedUrl, input.candidate.artifactUrl))).returning({ id: captureProofLogsTable.id });
    if (!failed) throw promotionError("compensation_refused_log_changed");
    await tx.update(captureProofCandidatePromotionsTable).set({ status: "rolled_back", failure: "post_commit_final_audit_or_readback_failed", updatedAt: new Date() })
      .where(and(eq(captureProofCandidatePromotionsTable.id, input.promotionId), eq(captureProofCandidatePromotionsTable.status, "awaiting_readback")));
  });
  const restoredRows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, input.candidate.insertionId));
  const restored = canonicalEvidenceForDate(restoredRows, input.candidate.targetDate);
  if ((restored?.id ?? null) !== (input.original?.id ?? null) || (restored?.arquivoUrl ?? null) !== (input.original?.arquivoUrl ?? null)) {
    throw promotionError("compensation_evidence_readback_failed");
  }
  if (input.archive && input.original?.arquivoUrl) {
    const restoredHash = await input.readArtifact(input.original.arquivoUrl);
    if (restoredHash.sha256 !== input.archive.sha256 || restoredHash.bytes !== input.archive.bytes) throw promotionError("compensation_original_hash_readback_failed");
  }
  const [failedLog] = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, input.finalLogId)).limit(1);
  if (!failedLog || failedLog.status !== "failed") throw promotionError("compensation_log_readback_failed");
}
