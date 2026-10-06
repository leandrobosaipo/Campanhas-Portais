import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";

function enabledIsolatedDatabase() {
  if (process.env.ADOPS_HISTORICAL_INVENTORY_TEST !== "1" || !process.env.DATABASE_URL) return false;
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const host = parsed.searchParams.get("host") || parsed.searchParams.get("hostaddr") || parsed.hostname;
    return name === "candidate_audit_test" && (["localhost", "127.0.0.1", "::1"].includes(host) || host.startsWith("/tmp/adops-candidate-pg-socket"));
  } catch { return false; }
}

test("historical inventory SQL projects canonical date rows and unique undated unknown rows", { skip: !enabledIsolatedDatabase() }, async () => {
  const database = await import("@workspace/db");
  const databaseCheck = await database.pool.query<{ database_name: string }>("select current_database() as database_name");
  assert.equal(databaseCheck.rows[0]?.database_name, "candidate_audit_test");
  const [site] = await database.db.insert(database.sitesTable).values({ nome: "Inventory fixture", sigla: `IV${randomUUID().slice(0, 5).toUpperCase()}` }).returning();
  const [campaign] = await database.db.insert(database.campaignsTable).values({ nome: `Inventory ${randomUUID()}`, competencia: "2026-09" }).returning();
  const [insertion] = await database.db.insert(database.insertionsTable).values({
    campanhaId: campaign!.id, siteId: site!.id, localFormato: "TEST", periodoInicio: "2026-09-01", periodoFim: "2026-09-30", statusNormalizado: "ativa",
  }).returning();
  const insertedEvidenceIds: number[] = [];
  const dailyLogIds: string[] = [];
  const insertedLogIds: string[] = [];
  const candidateIds: string[] = [];
  const promotionIds: string[] = [];
  try {
    const [dailyEvidence] = await database.db.insert(database.evidencesTable).values({ insercaoId: insertion!.id, tipo: "print", titulo: "Print 2026-09-07", arquivoUrl: "https://example.invalid/daily.png" }).returning();
    const [older] = await database.db.insert(database.evidencesTable).values({ insercaoId: insertion!.id, tipo: "print", titulo: "Print 2026-09-08", arquivoUrl: "https://example.invalid/old.png" }).returning();
    const [canonical] = await database.db.insert(database.evidencesTable).values({ insercaoId: insertion!.id, tipo: "print", titulo: "pRiNt   2026-09-08", arquivoUrl: "https://example.invalid/canonical.png" }).returning();
    const [undated] = await database.db.insert(database.evidencesTable).values({ insercaoId: insertion!.id, tipo: "print", titulo: "Legacy evidence without a date", arquivoUrl: "https://example.invalid/undated.png" }).returning();
    insertedEvidenceIds.push(dailyEvidence!.id, older!.id, canonical!.id, undated!.id);
    const dailyLogId = `inventory-daily-${randomUUID()}`;
    await database.db.insert(database.captureProofLogsTable).values({
      id: dailyLogId, insertionId: insertion!.id, targetDate: "2026-09-07", jobId: dailyLogId,
      runnerJobId: dailyLogId, status: "ok", uploadedUrl: dailyEvidence!.arquivoUrl, createdAt: new Date("2026-09-07T14:00:00.000Z"),
      metadata: { captureClass: "scheduled", targetDate: "2026-09-07", sourceJobId: dailyLogId, capturedAt: "2026-09-07T14:00:00.000Z", auditPolicyVersion: "audit-policy-v1" },
    });
    dailyLogIds.push(dailyLogId);
    const malformedLogId = `inventory-${randomUUID()}`;
    await database.db.insert(database.captureProofLogsTable).values({
      id: malformedLogId, insertionId: insertion!.id, targetDate: "2026-09-08", jobId: malformedLogId,
      runnerJobId: malformedLogId, status: "pending_audit", uploadedUrl: canonical!.arquivoUrl,
      metadata: {
        captureClass: "historical_recovery", targetDate: "2026-09-08", sourceJobId: malformedLogId,
        capturedAt: "2026-10-01T22:50:57.930Z", auditPolicyVersion: "audit-policy-v1",
        preliminary: "not-a-boolean", checklistValidation: { approved: "invalid", preliminary: 17, audit: { ok: [] }, blockingIssues: "malformed" },
      },
    });
    insertedLogIds.push(malformedLogId);

    const candidateId = randomUUID();
    const finalLogId = `inventory-final-${randomUUID()}`;
    const sourceJobId = `inventory-source-${randomUUID()}`;
    const capturedAt = new Date("2026-10-01T22:50:57.930Z");
    const sha256 = createHash("sha256").update("synthetic-inventory-candidate").digest("hex");
    const candidateMetadata = {
      insertionId: insertion!.id, targetDate: "2026-09-08", sourceJobId, capturedAt: capturedAt.toISOString(),
      uploadedUrl: canonical!.arquivoUrl, evidenceUrl: canonical!.arquivoUrl, captureClass: "historical_recovery",
      auditPolicyVersion: "audit-policy-v1", requestedCaptureAt: "2026-09-08T18:40",
      reconstruction: { provenanceVersion: 3, reconstructedAt: capturedAt.toISOString(), historicalDisplayConfirmed: false },
    };
    await database.db.insert(database.captureProofCandidatesTable).values({
      id: candidateId, insertionId: insertion!.id, targetDate: "2026-09-08", sourceJobId,
      artifactUrl: canonical!.arquivoUrl!, artifactSha256: sha256, artifactBytes: 123,
      capturedAt, captureStageStartedAt: capturedAt, captureStageFinishedAt: capturedAt,
      metadata: candidateMetadata, checklistVersion: "capture-proof-candidate-audit-v1", state: "registered",
    });
    candidateIds.push(candidateId);
    await database.db.insert(database.captureProofLogsTable).values({
      id: finalLogId, insertionId: insertion!.id, targetDate: "2026-09-08", jobId: sourceJobId,
      runnerJobId: sourceJobId, status: "ok", uploadedUrl: canonical!.arquivoUrl, createdAt: capturedAt,
      artifacts: { candidateId }, metadata: {},
    });
    insertedLogIds.push(finalLogId);
    const promotionId = randomUUID();
    await database.db.insert(database.captureProofCandidatePromotionsTable).values({
      id: promotionId, candidateId, insertionId: insertion!.id, targetDate: "2026-09-08", sourceJobId,
      candidateUrl: canonical!.arquivoUrl!, candidateSha256: sha256, candidateBytes: 123, finalLogId,
      status: "approved", audit: {
        approved: true, preliminary: false, insertionId: insertion!.id, date: "2026-09-08",
        blockingIssues: [], audit: { ok: true },
      },
    });
    promotionIds.push(promotionId);

    const { loadHistoricalEvidenceInventory } = await import("../../artifacts/api-server/src/routes/insertions");
    const result = await loadHistoricalEvidenceInventory({ limit: 200, cursor: Math.min(...insertedEvidenceIds) - 1 });
    const rows = result.items.filter((item: any) => insertedEvidenceIds.includes(item.evidenceId)) as any[];
    assert.deepEqual(rows.map((item) => item.evidenceId), [canonical!.id, undated!.id]);
    assert.equal(rows[0].targetDate, "2026-09-08");
    assert.equal(rows[0].origin, "historical");
    assert.equal(rows[0].status, "approved");
    assert.equal(rows[1].targetDate, null);
    assert.equal(rows[1].origin, "unknown");
    assert.equal(rows[1].status, "unknown");

    const firstPage = await loadHistoricalEvidenceInventory({ limit: 1, cursor: Math.min(...insertedEvidenceIds) - 1 });
    const secondPage = await loadHistoricalEvidenceInventory({ limit: 1, cursor: Number(firstPage.nextCursor) });
    const thirdPage = await loadHistoricalEvidenceInventory({ limit: 1, cursor: Number(secondPage.nextCursor) });
    assert.deepEqual(firstPage.items, []);
    assert.equal(firstPage.nextCursor, String(dailyEvidence!.id));
    assert.deepEqual(secondPage.items.map((item: any) => item.evidenceId), [canonical!.id]);
    assert.deepEqual(thirdPage.items.map((item: any) => item.evidenceId), [undated!.id]);
    assert.equal(thirdPage.nextCursor, null);

    await database.db.delete(database.captureProofLogsTable).where(eq(database.captureProofLogsTable.id, malformedLogId));
    await database.db.update(database.captureProofCandidatePromotionsTable).set({ audit: {
      approved: true, preliminary: false, insertionId: insertion!.id, date: "2026-09-09",
      blockingIssues: [], audit: { ok: true },
    } }).where(eq(database.captureProofCandidatePromotionsTable.id, promotionId));
    const mismatched = await loadHistoricalEvidenceInventory({ limit: 200, cursor: Math.min(...insertedEvidenceIds) - 1 });
    const mismatchedRow = mismatched.items.find((item: any) => item.evidenceId === canonical!.id) as any;
    assert.equal(mismatchedRow.origin, "unknown");
    assert.equal(mismatchedRow.status, "unknown");
  } finally {
    if (dailyLogIds.length) await database.db.delete(database.captureProofLogsTable).where(inArray(database.captureProofLogsTable.id, dailyLogIds));
    if (promotionIds.length) await database.db.delete(database.captureProofCandidatePromotionsTable).where(inArray(database.captureProofCandidatePromotionsTable.id, promotionIds));
    if (candidateIds.length) {
      await database.db.transaction(async (tx) => {
        await tx.execute(sql`alter table capture_proof_candidates disable trigger capture_proof_candidates_immutable`);
        await tx.delete(database.captureProofCandidatesTable).where(inArray(database.captureProofCandidatesTable.id, candidateIds));
        await tx.execute(sql`alter table capture_proof_candidates enable trigger capture_proof_candidates_immutable`);
      });
    }
    if (insertedLogIds.length) await database.db.delete(database.captureProofLogsTable).where(inArray(database.captureProofLogsTable.id, insertedLogIds));
    if (insertedEvidenceIds.length) await database.db.delete(database.evidencesTable).where(inArray(database.evidencesTable.id, insertedEvidenceIds));
    await database.db.delete(database.insertionsTable).where(eq(database.insertionsTable.id, insertion!.id));
    await database.db.delete(database.campaignsTable).where(eq(database.campaignsTable.id, campaign!.id));
    await database.db.delete(database.sitesTable).where(eq(database.sitesTable.id, site!.id));
    const triggerState = await database.pool.query<{ enabled: string }>("select tgenabled as enabled from pg_trigger where tgname = 'capture_proof_candidates_immutable' and not tgisinternal");
    assert.ok(triggerState.rows.length > 0 && triggerState.rows.every((row) => row.enabled === "O"), "candidate immutability trigger must remain enabled");
  }
});
