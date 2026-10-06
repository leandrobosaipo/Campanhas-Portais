import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  campaignsTable,
  captureProofCandidatePromotionsTable,
  captureProofCandidateReviewsTable,
  captureProofCandidatesTable,
  captureProofLogsTable,
  db,
  evidencesTable,
  insertionsTable,
  printJobsTable,
  sitesTable,
} from "@workspace/db";
import { promoteApprovedCaptureCandidate, type CandidatePromotionServices } from "../../artifacts/api-server/src/lib/capture-proof-candidate-promotion";
import type { AuditChecklistValidation } from "../../artifacts/api-server/src/lib/audit-checklist";

function isExplicitIsolatedTestDatabase() {
  if (process.env.ADOPS_PROMOTION_TEST !== "1" || !process.env.DATABASE_URL) return false;
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const hostIsLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
      || String(parsed.searchParams.get("host") || "").startsWith("/tmp/adops-candidate-pg-socket");
    return hostIsLocal && ["candidate_audit_test", "adops_source_conflict_test"].includes(databaseName);
  } catch {
    return false;
  }
}
const enabled = isExplicitIsolatedTestDatabase();
const candidateBytes = Buffer.from("isolated-promotion-candidate-bytes");
const originalBytes = Buffer.from("isolated-original-canonical-bytes");
const candidateSha256 = createHash("sha256").update(candidateBytes).digest("hex");
const originalSha256 = createHash("sha256").update(originalBytes).digest("hex");
const capturedAt = new Date("2026-10-01T22:50:57.930Z");
const targetDate = "2026-09-08";

function checklist(approved: boolean, insertionId: number, captureClass?: string): AuditChecklistValidation {
  return {
    approved,
    preliminary: false,
    version: "audit-checklist-v1",
    insertionId,
    date: targetDate,
    contract: {} as AuditChecklistValidation["contract"],
    metadataPresent: true,
    audit: { ok: approved, captureClass } as AuditChecklistValidation["audit"],
    issues: [],
    blockingIssues: [],
    warnings: [],
    evidenceStatus: approved ? "approved" : "blocked",
  };
}

async function withFixture(run: (input: { candidateId: string; insertionId: number; oldUrl: string; candidateUrl: string; finalLogId: string }) => Promise<void>, options: {
  candidateProvenanceVersion?: number; candidateFrameVersion?: string;
  originalCaptureClass?: string; originalProvenanceVersion?: number; originalFrameVersion?: string;
} = {}) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 18);
  const candidateId = `test-candidate-${suffix}`;
  const jobId = `test-job-${suffix}`;
  const candidateUrl = `https://cod5.nyc3.digitaloceanspaces.com/candidates/${jobId}/${targetDate}/proof.png`;
  const oldUrl = `https://cod5.nyc3.digitaloceanspaces.com/test-original/${suffix}.png`;
  let siteId: number | null = null;
  let campaignId: number | null = null;
  let insertionId: number | null = null;
  try {
  const [site] = await db.insert(sitesTable).values({ nome: `Test ${suffix}`, sigla: `T${suffix.slice(0, 5)}` }).returning();
  siteId = site!.id;
  const [campaign] = await db.insert(campaignsTable).values({ nome: `Promotion test ${suffix}`, competencia: "2026-09" }).returning();
  campaignId = campaign!.id;
  const [insertion] = await db.insert(insertionsTable).values({
    campanhaId: campaign!.id,
    siteId: site!.id,
    localFormato: "Teste",
    periodoInicio: targetDate,
    periodoFim: targetDate,
    statusNormalizado: "ativa",
  }).returning();
  insertionId = insertion!.id;
  const metadata = {
    captureClass: "historical_recovery",
    targetDate,
    sourceJobId: jobId,
    capturedAt: capturedAt.toISOString(),
    requestedCaptureAt: `${targetDate}T18:40:00-04:00`,
    auditPolicyVersion: "audit-policy-v1",
    frameTemplateVersion: options.candidateFrameVersion,
    reconstruction: { provenanceVersion: options.candidateProvenanceVersion ?? 3, historicalDisplayConfirmed: false },
  };
  await db.insert(printJobsTable).values({
    id: jobId,
    kind: "capture-proof-single",
    status: "completed",
    totalTargets: 1,
    completedTargets: 1,
    items: [{ insertionId, targetDate, status: "ok", candidateOnly: true, uploadedUrl: candidateUrl }],
    payload: { targets: [{ insertionId, targetDate, candidateOnly: true }] },
  });
  await db.insert(captureProofCandidatesTable).values({
    id: candidateId,
    insertionId,
    targetDate,
    sourceJobId: jobId,
    artifactUrl: candidateUrl,
    artifactSha256: candidateSha256,
    artifactBytes: candidateBytes.length,
    requestedCaptureAt: metadata.requestedCaptureAt,
    capturedAt,
    captureStageStartedAt: new Date(capturedAt.getTime() - 500),
    captureStageFinishedAt: new Date(capturedAt.getTime() + 500),
    metadata,
    checklistVersion: "capture-proof-candidate-audit-v1",
    historicalDisplayConfirmed: false,
    state: "registered",
  });
  await db.insert(captureProofCandidateReviewsTable).values({
    id: randomUUID(),
    candidateId,
    insertionId,
    targetDate,
    artifactSha256: candidateSha256,
    decision: "candidate_approved",
    checklistVersion: "capture-proof-candidate-audit-v1",
    auditPolicyVersion: "audit-policy-v1",
    checklist: { approved: true },
    evaluatedBy: "integration-test",
  });
  await db.insert(evidencesTable).values({
    insercaoId: insertionId,
    tipo: "print",
    titulo: `Print ${targetDate}`,
    arquivoUrl: oldUrl,
  }).returning();
  await db.insert(captureProofLogsTable).values({
    id: randomUUID(),
    insertionId,
    targetDate,
    jobId: "prior-job",
    runnerJobId: "prior-job",
    status: "ok",
    uploadedUrl: oldUrl,
    metadata: {
      sourceJobId: "prior-job", targetDate,
      ...(options.originalCaptureClass ? {
        captureClass: options.originalCaptureClass,
        frameTemplateVersion: options.originalFrameVersion,
        reconstruction: { provenanceVersion: options.originalProvenanceVersion, historicalDisplayConfirmed: true },
      } : {}),
    },
  });
  await run({ candidateId, insertionId, oldUrl, candidateUrl, finalLogId: "" });
  } finally {
    await db.delete(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    if (insertionId !== null) await db.delete(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    if (insertionId !== null) await db.delete(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    await db.execute(sql`ALTER TABLE capture_proof_candidate_reviews DISABLE TRIGGER capture_proof_candidate_reviews_immutable`);
    await db.delete(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.candidateId, candidateId));
    await db.execute(sql`ALTER TABLE capture_proof_candidate_reviews ENABLE TRIGGER capture_proof_candidate_reviews_immutable`);
    await db.execute(sql`ALTER TABLE capture_proof_candidates DISABLE TRIGGER capture_proof_candidates_immutable`);
    await db.delete(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, candidateId));
    await db.execute(sql`ALTER TABLE capture_proof_candidates ENABLE TRIGGER capture_proof_candidates_immutable`);
    await db.delete(printJobsTable).where(eq(printJobsTable.id, jobId));
    if (insertionId !== null) await db.delete(insertionsTable).where(eq(insertionsTable.id, insertionId));
    if (campaignId !== null) await db.delete(campaignsTable).where(eq(campaignsTable.id, campaignId));
    if (siteId !== null) await db.delete(sitesTable).where(eq(sitesTable.id, siteId));
  }
}

async function seedAwaitingReadback(input: {
  candidateId: string;
  insertionId: number;
  oldUrl: string;
  candidateUrl: string;
}) {
  const [candidate] = await db.select().from(captureProofCandidatesTable)
    .where(eq(captureProofCandidatesTable.id, input.candidateId)).limit(1);
  const [original] = await db.select().from(evidencesTable)
    .where(eq(evidencesTable.insercaoId, input.insertionId)).limit(1);
  assert.ok(candidate);
  assert.ok(original);
  const originalLogs = await db.select().from(captureProofLogsTable)
    .where(eq(captureProofLogsTable.insertionId, input.insertionId));
  const promotionId = randomUUID();
  const finalLogId = randomUUID();
  const archive = {
    sourceKey: "test-original/source.png",
    archiveKey: "adops-evidence-originals/test/sha-original.png",
    sha256: originalSha256,
    bytes: originalBytes.length,
  };

  // Model a process restart after the canonical transaction committed and
  // persisted its checkpoint, but before the final storage readback completed.
  await db.update(evidencesTable).set({ arquivoUrl: input.candidateUrl, tipo: "print" })
    .where(eq(evidencesTable.id, original.id));
  await db.insert(captureProofLogsTable).values({
    id: finalLogId,
    insertionId: input.insertionId,
    targetDate,
    jobId: candidate.sourceJobId,
    runnerJobId: candidate.sourceJobId,
    captureAt: candidate.requestedCaptureAt,
    status: "ok",
    uploadedUrl: input.candidateUrl,
    metadata: { ...candidate.metadata, evidenceUrl: input.candidateUrl },
    createdAt: candidate.capturedAt,
    summary: { source: "approved_candidate_promotion", promotionId },
    stages: [],
    artifacts: { candidateId: candidate.id, archive },
  });
  await db.insert(captureProofCandidatePromotionsTable).values({
    id: promotionId,
    candidateId: candidate.id,
    insertionId: candidate.insertionId,
    targetDate: candidate.targetDate,
    sourceJobId: candidate.sourceJobId,
    candidateUrl: candidate.artifactUrl,
    candidateSha256: candidate.artifactSha256,
    candidateBytes: candidate.artifactBytes,
    originalEvidence: JSON.parse(JSON.stringify(original)),
    originalLogs: originalLogs.map((row) => JSON.parse(JSON.stringify(row))),
    archive,
    finalLogId,
    status: "awaiting_readback",
    audit: checklist(true, input.insertionId),
  });
  return { promotionId, finalLogId, original, originalLogs };
}

function servicesFor(insertionId: number, finalAudit: (call: number, input?: { metadata?: unknown }) => boolean, captureClass?: string): CandidatePromotionServices {
  let auditCalls = 0;
  return {
    inspectCandidate: async (candidate) => ({
      ok: candidate.artifactSha256 === candidateSha256 && candidate.capturedAt.toISOString() === capturedAt.toISOString(),
      artifact: { sha256: candidateSha256, bytes: candidateBytes.length },
    }),
    hashArtifact: async (url) => url.includes("test-original")
      ? { sha256: originalSha256, bytes: originalBytes.length }
      : { sha256: candidateSha256, bytes: candidateBytes.length },
    archiveOriginal: async () => ({ sourceKey: "test-original/source.png", archiveKey: "adops-evidence-originals/test/sha-original.png", sha256: originalSha256, bytes: originalBytes.length }),
    audit: async (input) => checklist(finalAudit(++auditCalls, input), insertionId, captureClass),
  };
}

test("promotes exact candidate bytes, logs real capture time and keeps receipt time separate", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const [review] = await db.select().from(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.candidateId, candidateId));
    await assert.rejects(db.update(captureProofCandidatesTable).set({ state: "tampered" }).where(eq(captureProofCandidatesTable.id, candidateId)));
    await assert.rejects(db.delete(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, candidateId)));
    await assert.rejects(db.update(captureProofCandidateReviewsTable).set({ decision: "candidate_blocked" }).where(eq(captureProofCandidateReviewsTable.id, review!.id)));
    await assert.rejects(db.delete(captureProofCandidateReviewsTable).where(eq(captureProofCandidateReviewsTable.id, review!.id)));
    const result = await promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, (call) => call !== 1));
    assert.equal(result.ok, true);
    assert.equal(result.capturedAt, capturedAt.toISOString());
    assert.notEqual(result.receivedAt, result.capturedAt);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, candidateUrl);
    const [log] = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, result.finalLogId!));
    assert.equal(log?.createdAt.toISOString(), capturedAt.toISOString());
    assert.equal(log?.uploadedUrl, candidateUrl);
    assert.equal((log?.metadata as { checklistValidation?: { approved?: boolean; preliminary?: boolean; audit?: { ok?: boolean } } })
      .checklistValidation?.approved, true);
    assert.equal((log?.metadata as { checklistValidation?: { preliminary?: boolean } }).checklistValidation?.preliminary, false);
    assert.equal((log?.metadata as { checklistValidation?: { audit?: { ok?: boolean } } }).checklistValidation?.audit?.ok, true);
    const [ledger] = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.id, result.promotionId));
    assert.equal(ledger?.status, "approved");
    assert.equal((ledger?.originalEvidence as { arquivoUrl?: string })?.arquivoUrl, oldUrl);
  });
});

test("requires the latest persisted approval before promotion", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    const [candidate] = await db.select().from(captureProofCandidatesTable).where(eq(captureProofCandidatesTable.id, candidateId));
    await db.insert(captureProofCandidateReviewsTable).values({
      id: randomUUID(),
      candidateId,
      insertionId,
      targetDate,
      artifactSha256: candidate!.artifactSha256,
      decision: "candidate_blocked",
      checklistVersion: candidate!.checklistVersion,
      auditPolicyVersion: "audit-policy-v1",
      checklist: { approved: false },
      evaluatedBy: "integration-test",
      evaluatedAt: new Date(Date.now() + 60_000),
    });
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true)), /persisted_candidate_approval_required/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, oldUrl);
  });
});

test("same approved candidate promotion is idempotent", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId }) => {
    const services = servicesFor(insertionId, (call) => call !== 1);
    const first = await promoteApprovedCaptureCandidate(candidateId, services);
    const second = await promoteApprovedCaptureCandidate(candidateId, services);
    assert.equal(second.idempotent, true);
    assert.equal(second.promotionId, first.promotionId);
    const logs = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    assert.equal(logs.filter((row) => row.summary?.source === "approved_candidate_promotion").length, 1);
  });
});

test("resumes awaiting-readback promotion after restart without duplicating its IDs or log", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const seeded = await seedAwaitingReadback({ candidateId, insertionId, oldUrl, candidateUrl });
    const result = await promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true));

    assert.equal(result.ok, true);
    assert.equal(result.idempotent, true);
    assert.equal(result.promotionId, seeded.promotionId);
    assert.equal(result.finalLogId, seeded.finalLogId);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable)
      .where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 1);
    assert.equal(promotions[0]?.status, "approved");
    const logs = await db.select().from(captureProofLogsTable)
      .where(eq(captureProofLogsTable.insertionId, insertionId));
    assert.equal(logs.filter((row) => row.summary?.source === "approved_candidate_promotion").length, 1);
    assert.equal(logs.find((row) => row.id === seeded.finalLogId)?.status, "ok");
    const evidence = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(evidence.find((row) => row.id === seeded.original.id)?.arquivoUrl, candidateUrl);
    assert.equal(evidence.find((row) => row.id === seeded.original.id)?.titulo, seeded.original.titulo);
    assert.equal(logs.find((row) => row.id === seeded.originalLogs[0]?.id)?.uploadedUrl, oldUrl);
  });
});

test("resumes awaiting-readback even when a newer blocked ledger row exists", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const seeded = await seedAwaitingReadback({ candidateId, insertionId, oldUrl, candidateUrl });
    const [awaiting] = await db.select().from(captureProofCandidatePromotionsTable)
      .where(eq(captureProofCandidatePromotionsTable.id, seeded.promotionId)).limit(1);
    assert.ok(awaiting);
    const blockedId = randomUUID();
    await db.insert(captureProofCandidatePromotionsTable).values({
      ...awaiting,
      id: blockedId,
      status: "blocked",
      failure: "concurrent_promotion_snapshot_stale",
      receivedAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    });

    const result = await promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true));

    assert.equal(result.promotionId, seeded.promotionId);
    assert.equal(result.finalLogId, seeded.finalLogId);
    assert.equal(result.idempotent, true);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable)
      .where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 2);
    assert.equal(promotions.find((row) => row.id === seeded.promotionId)?.status, "approved");
    assert.equal(promotions.find((row) => row.id === blockedId)?.status, "blocked");
    const logs = await db.select().from(captureProofLogsTable)
      .where(eq(captureProofLogsTable.insertionId, insertionId));
    assert.equal(logs.filter((row) => row.summary?.source === "approved_candidate_promotion").length, 1);
    assert.equal(logs.find((row) => row.id === seeded.finalLogId)?.status, "ok");
    const evidence = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(evidence.find((row) => row.id === seeded.original.id)?.arquivoUrl, candidateUrl);
    assert.equal(evidence.find((row) => row.id === seeded.original.id)?.titulo, seeded.original.titulo);
    assert.equal(logs.find((row) => row.id === seeded.originalLogs[0]?.id)?.uploadedUrl, oldUrl);
  });
});

test("failed resumed readback rolls back only the candidate row and verifies original bytes", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const seeded = await seedAwaitingReadback({ candidateId, insertionId, oldUrl, candidateUrl });
    const services = servicesFor(insertionId, () => true, "historical_recovery");
    services.hashArtifact = async (url) => url === oldUrl
      ? { sha256: originalSha256, bytes: originalBytes.length }
      : { sha256: "0".repeat(64), bytes: candidateBytes.length };

    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, services), /prior_promotion_readback_invalid/);

    const evidence = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    const restored = evidence.find((row) => row.id === seeded.original.id);
    assert.equal(restored?.arquivoUrl, seeded.original.arquivoUrl);
    assert.equal(restored?.tipo, seeded.original.tipo);
    assert.equal(restored?.titulo, seeded.original.titulo);
    assert.equal(evidence.length, 1);
    const logs = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    assert.equal(logs.find((row) => row.id === seeded.finalLogId)?.status, "failed");
    const promotion = await db.select().from(captureProofCandidatePromotionsTable)
      .where(eq(captureProofCandidatePromotionsTable.id, seeded.promotionId)).limit(1);
    assert.equal(promotion[0]?.status, "rolled_back");
    assert.equal(promotion[0]?.failure, "post_commit_final_audit_or_readback_failed");
    assert.equal(logs.find((row) => row.id === seeded.originalLogs[0]?.id)?.uploadedUrl, oldUrl);
  });
});

test("compensates canonical URL and marks final log failed when post-commit full audit fails", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    await assert.rejects(
      promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, (call) => call !== 1 && call !== 3)),
      /canonical_final_readback_failed/,
    );
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, oldUrl);
    const logs = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    const failed = logs.find((row) => row.uploadedUrl === candidateUrl);
    assert.equal(failed?.status, "failed");
    assert.equal(logs.some((row) => row.uploadedUrl === oldUrl), true);
    const [ledger] = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(ledger?.status, "rolled_back");
  });
});

test("preserves an already-approved canonical evidence", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true)), /canonical_already_approved/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, oldUrl);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 0);
  });
});

test("upgrades an exact approved legacy presentation only with explicit identity and remains idempotent", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const expected = { evidenceId: 1, arquivoUrl: oldUrl, sha256: originalSha256, bytes: originalBytes.length };
    const [evidence] = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    expected.evidenceId = evidence!.id;
    const services = servicesFor(insertionId, () => true, "historical_recovery");
    const first = await promoteApprovedCaptureCandidate(candidateId, services, expected);
    assert.equal(first.ok, true);
    assert.equal(first.idempotent, undefined);
    const [promoted] = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.id, first.promotionId));
    assert.equal((promoted?.audit as Record<string, unknown>)?.reason, "presentation_upgrade");
    assert.deepEqual((promoted?.audit as Record<string, unknown>)?.expectedOriginal, expected);
    const [finalLog] = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.id, first.finalLogId!));
    assert.equal((finalLog?.summary as Record<string, unknown>)?.reason, "presentation_upgrade");
    assert.deepEqual((finalLog?.summary as Record<string, unknown>)?.expectedOriginal, expected);
    assert.equal((finalLog?.metadata as Record<string, unknown>)?.reconstructionReason, undefined);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.id === evidence!.id)?.arquivoUrl, candidateUrl);
    const retry = await promoteApprovedCaptureCandidate(candidateId, services, expected);
    assert.equal(retry.idempotent, true);
    assert.equal(retry.promotionId, first.promotionId);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 1);
  }, {
    candidateProvenanceVersion: 4,
    candidateFrameVersion: "windows11-chrome-light-similar-v5",
    originalCaptureClass: "historical_recovery",
    originalProvenanceVersion: 3,
    originalFrameVersion: "windows11-chrome-light-similar-v4",
  });
});

test("a prior historical log cannot authorize upgrade when the current canonical audit is daily", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    const [evidence] = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    const expected = { evidenceId: evidence!.id, arquivoUrl: oldUrl, sha256: originalSha256, bytes: originalBytes.length };
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true, "scheduled"), expected), /historical_original_identity_or_legacy_proof_required/);
    const current = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(current.find((row) => row.id === evidence!.id)?.arquivoUrl, oldUrl);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 0);
  }, {
    candidateProvenanceVersion: 4,
    candidateFrameVersion: "windows11-chrome-light-similar-v5",
    originalCaptureClass: "historical_recovery",
    originalProvenanceVersion: 3,
    originalFrameVersion: "windows11-chrome-light-similar-v4",
  });
});

test("refuses an upgrade when expected original bytes do not match before archive", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    const [evidence] = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    const expected = { evidenceId: evidence!.id, arquivoUrl: oldUrl, sha256: "0".repeat(64), bytes: originalBytes.length };
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, servicesFor(insertionId, () => true, "historical_recovery"), expected), /historical_original_hash_mismatch/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.id === evidence!.id)?.arquivoUrl, oldUrl);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 0);
  }, {
    candidateProvenanceVersion: 4,
    candidateFrameVersion: "windows11-chrome-light-similar-v5",
    originalCaptureClass: "historical_recovery",
    originalProvenanceVersion: 3,
    originalFrameVersion: "windows11-chrome-light-similar-v4",
  });
});

test("archive failure leaves the approved historical canonical pointer untouched", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    const [evidence] = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    const expected = { evidenceId: evidence!.id, arquivoUrl: oldUrl, sha256: originalSha256, bytes: originalBytes.length };
    const services = servicesFor(insertionId, () => true, "historical_recovery");
    services.archiveOriginal = async () => { throw Object.assign(new Error("archive failed"), { code: "evidence_replacement_archive_failed" }); };
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, services, expected), /archive failed/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.id === evidence!.id)?.arquivoUrl, oldUrl);
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions.length, 0);
  }, {
    candidateProvenanceVersion: 4,
    candidateFrameVersion: "windows11-chrome-light-similar-v5",
    originalCaptureClass: "historical_recovery",
    originalProvenanceVersion: 3,
    originalFrameVersion: "windows11-chrome-light-similar-v4",
  });
});

test("failed upgraded candidate readback compensates to the archived original", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const [evidence] = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    const expected = { evidenceId: evidence!.id, arquivoUrl: oldUrl, sha256: originalSha256, bytes: originalBytes.length };
    const services = servicesFor(insertionId, () => true, "historical_recovery");
    services.hashArtifact = async (url) => url === oldUrl
      ? { sha256: originalSha256, bytes: originalBytes.length }
      : { sha256: "0".repeat(64), bytes: candidateBytes.length };
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, services, expected), /canonical_final_hash_readback_failed/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.id === evidence!.id)?.arquivoUrl, oldUrl);
    const logs = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    const promotedLog = logs.find((row) => row.uploadedUrl === candidateUrl);
    assert.equal(promotedLog?.status, "failed");
    assert.equal((promotedLog?.summary as Record<string, unknown>)?.reason, "presentation_upgrade");
    const promotions = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(promotions[0]?.status, "rolled_back");
  }, {
    candidateProvenanceVersion: 4,
    candidateFrameVersion: "windows11-chrome-light-similar-v5",
    originalCaptureClass: "historical_recovery",
    originalProvenanceVersion: 3,
    originalFrameVersion: "windows11-chrome-light-similar-v4",
  });
});

test("refuses a stale candidate hash before changing the canonical URL", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl }) => {
    const services = servicesFor(insertionId, (call) => call !== 1);
    services.inspectCandidate = async () => ({ ok: true, artifact: { sha256: "0".repeat(64), bytes: candidateBytes.length } });
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, services), /candidate_artifact_hash_mismatch/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, oldUrl);
  });
});

test("compensates when candidate storage readback throws after commit", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId, oldUrl, candidateUrl }) => {
    const services = servicesFor(insertionId, (call) => call !== 1);
    services.hashArtifact = async (url) => {
      if (url === candidateUrl) throw new Error("injected_readback_network_failure");
      return { sha256: originalSha256, bytes: originalBytes.length };
    };
    await assert.rejects(promoteApprovedCaptureCandidate(candidateId, services), /injected_readback_network_failure/);
    const rows = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId));
    assert.equal(rows.find((row) => row.titulo?.includes(targetDate))?.arquivoUrl, oldUrl);
    const ledger = await db.select().from(captureProofCandidatePromotionsTable).where(eq(captureProofCandidatePromotionsTable.candidateId, candidateId));
    assert.equal(ledger.at(-1)?.status, "rolled_back");
  });
});

test("serializes competing promotions and allows only one canonical change", { skip: !enabled }, async () => {
  await withFixture(async ({ candidateId, insertionId }) => {
    let initialAudits = 0;
    let releaseInitialAudits!: () => void;
    const bothInitialAudits = new Promise<void>((resolve) => { releaseInitialAudits = resolve; });
    const services = servicesFor(insertionId, () => true);
    services.audit = async (input) => {
      if (input.metadata !== undefined) return checklist(true, insertionId);
      if (initialAudits < 2) {
        initialAudits += 1;
        if (initialAudits === 2) releaseInitialAudits();
        await bothInitialAudits;
        return checklist(false, insertionId);
      }
      return checklist(true, insertionId);
    };
    const results = await Promise.allSettled([
      promoteApprovedCaptureCandidate(candidateId, services),
      promoteApprovedCaptureCandidate(candidateId, services),
    ]);
    assert.ok(results.some((result) => result.status === "fulfilled"), JSON.stringify(results.map((result) => result.status === "rejected" ? result.reason?.code ?? result.reason?.message : "fulfilled")));
    const evidenceLogs = await db.select().from(captureProofLogsTable).where(eq(captureProofLogsTable.insertionId, insertionId));
    assert.equal(evidenceLogs.filter((row) => row.summary?.source === "approved_candidate_promotion" && row.status === "ok").length, 1);
  });
});
