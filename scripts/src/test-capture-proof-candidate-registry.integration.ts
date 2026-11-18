import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { Server } from "node:http";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";

function isExplicitIsolatedTestDatabase() {
  if (process.env.ADOPS_CANDIDATE_REGISTRY_TEST !== "1" || !process.env.DATABASE_URL) return false;
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const host = parsed.searchParams.get("host") || parsed.searchParams.get("hostaddr") || parsed.hostname;
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(host)
      || host.startsWith("/tmp/adops-candidate-pg-socket");
    return localHost && ["candidate_audit_test", "adops_source_conflict_test"].includes(databaseName);
  } catch {
    return false;
  }
}

const enabled = isExplicitIsolatedTestDatabase();
const targetDate = "2026-09-08";
const requestedCaptureAt = `${targetDate}T18:40:00-04:00`;
const capturedAt = "2026-10-01T22:50:57.930Z";
const pngFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC", "base64");

test("candidate registry enforces internal auth, idempotency, immutability and canonical isolation", { skip: !enabled }, async () => {
  const previousInternalToken = process.env.ADOPS_INTERNAL_API_TOKEN;
  const previousOperatorToken = process.env.OPS_API_TOKEN;
  const previousGeneratedRoot = process.env.ADOPS_GENERATED_PRINTS_ROOT;
  const previousCandidateFeatureFlag = process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED;
  const previousSpacesEnv = {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID,
    secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY,
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
  };
  const originalFetch = globalThis.fetch;
  const generatedRoot = await mkdtemp(path.join(tmpdir(), "adops-candidate-registry-"));
  let server: Server | null = null;
  let siteId: number | null = null;
  let campaignId: number | null = null;
  let insertionId: number | null = null;
  let sourceJobId: string | null = null;
  let database: typeof import("@workspace/db") | null = null;

  process.env.ADOPS_INTERNAL_API_TOKEN = "test-only-internal-token";
  process.env.OPS_API_TOKEN = "test-only-operator-token";
  process.env.ADOPS_GENERATED_PRINTS_ROOT = generatedRoot;
  process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED = "false";
  process.env.DO_SPACES_ACCESS_KEY_ID = "test-only-access-key";
  process.env.DO_SPACES_SECRET_ACCESS_KEY = "test-only-secret-key";
  process.env.DO_SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com";
  process.env.DO_SPACES_REGION = "nyc3";

  try {
    database = await import("@workspace/db");
    const databaseCheck = await database.pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
    assert.ok(["candidate_audit_test", "adops_source_conflict_test"].includes(databaseCheck.rows[0]?.database_name ?? ""), "database identity must match a disposable candidate audit database");

    const [site] = await database.db.insert(database.sitesTable).values({ nome: "Candidate registry fixture", sigla: `CT${randomUUID().slice(0, 5).toUpperCase()}` }).returning();
    siteId = site!.id;
    const [campaign] = await database.db.insert(database.campaignsTable).values({ nome: `Candidate registry ${randomUUID()}`, competencia: "2026-09" }).returning();
    campaignId = campaign!.id;
    const [insertion] = await database.db.insert(database.insertionsTable).values({
      campanhaId: campaign!.id,
      siteId: site!.id,
      localFormato: "MEGABANNER TOPO",
      periodoInicio: targetDate,
      periodoFim: "2026-09-21",
      statusNormalizado: "ativa",
    }).returning();
    insertionId = insertion!.id;

    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    sourceJobId = `test-candidate-${suffix}`;
    const artifactUrl = `https://perrenguematogrosso.nyc3.digitaloceanspaces.com/app/uploads/SETEMBRO-2026/${campaign!.id}/${insertionId}/candidates/${sourceJobId}/fixture_${targetDate}_MEGA_TOPO.png`;
    const metadataDirectory = path.join(generatedRoot, "candidates", sourceJobId, targetDate, String(insertionId));
    await mkdir(metadataDirectory, { recursive: true });
    const metadata = {
      auditContractVersion: "audit-contract-v3",
      auditPolicyVersion: "audit-policy-v1",
      captureClass: "historical_recovery",
      targetDate,
      sourceJobId,
      insertionId,
      campaignId: campaign!.id,
      siteSigla: site!.sigla,
      format: "MEGABANNER TOPO",
      requestedCaptureAt,
      capturedAt,
      captureOnly: true,
      historicalDisplayConfirmed: false,
      reconstruction: {
        reason: "late_publication_recovery",
        provenanceVersion: 3,
        contractedDate: targetDate,
        reconstructedAt: capturedAt,
        historicalDisplayConfirmed: false,
      },
    };
    await writeFile(path.join(metadataDirectory, `${targetDate}-meta.json`), JSON.stringify(metadata));

    await database.db.insert(database.printJobsTable).values({
      id: sourceJobId,
      kind: "capture-proof-single",
      status: "completed",
      totalTargets: 1,
      completedTargets: 1,
      startedAt: new Date("2026-10-01T22:49:59.900Z"),
      finishedAt: new Date("2026-10-01T22:51:24.200Z"),
      payload: { targets: [{ insertionId, targetDate, candidateOnly: true, captureAt: requestedCaptureAt }] },
      items: [{
        insertionId, targetDate, status: "ok", candidateOnly: true, uploadedUrl: artifactUrl,
        stages: [
          { stage: "slot_captured", status: "ok", startedAt: "2026-10-01T22:50:55.300Z", finishedAt: "2026-10-01T22:50:57.955Z" },
          { stage: "uploaded", status: "ok", startedAt: "2026-10-01T22:51:05.700Z", finishedAt: "2026-10-01T22:51:21.700Z" },
        ],
      }],
    });

    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
      if (url.hostname.endsWith(".digitaloceanspaces.com")) {
        return new Response(pngFixture, { status: 200, headers: { "content-type": "image/png", "content-length": String(pngFixture.length) } });
      }
      return originalFetch(input, init);
    };

    const { default: app } = await import("../../artifacts/api-server/src/app");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const candidateListUrl = `${base}/api/internal/insertions/${insertionId}/capture-proof/candidates?date=${targetDate}`;
    const registerUrl = `${base}/api/internal/insertions/${insertionId}/capture-proof/candidates`;
    const internalHeaders = {
      authorization: "Bearer test-only-operator-token",
      "x-adops-api-token": "test-only-internal-token",
      "content-type": "application/json",
    };
    const disabledRegister = await originalFetch(registerUrl, { method: "POST", headers: internalHeaders, body: JSON.stringify({ date: targetDate, sourceJobId }) });
    assert.equal(disabledRegister.status, 404);
    const disabledAudit = await originalFetch(`${base}/api/internal/capture-proof-candidates/${randomUUID()}/audit`, { method: "POST", headers: internalHeaders });
    assert.equal(disabledAudit.status, 404);
    const disabledPromotion = await originalFetch(`${base}/api/internal/capture-proof-candidates/${randomUUID()}/promote`, { method: "POST", headers: internalHeaders });
    assert.equal(disabledPromotion.status, 404);
    const disabledListRead = await originalFetch(candidateListUrl, { headers: internalHeaders });
    assert.equal(disabledListRead.status, 200, "internal GET remains available while candidate writes are disabled");
    process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED = "true";
    const originalUrl = `https://cod5.nyc3.digitaloceanspaces.com/test-original/${suffix}.png`;
    await database.db.insert(database.evidencesTable).values({
      insercaoId: insertionId,
      tipo: "print",
      titulo: `Print ${targetDate}`,
      arquivoUrl: originalUrl,
    });
    await database.db.insert(database.captureProofLogsTable).values({
      id: randomUUID(), insertionId, targetDate, jobId: "prior-test-job", runnerJobId: "prior-test-job",
      status: "ok", uploadedUrl: originalUrl, metadata: { sourceJobId: "prior-test-job", targetDate },
    });
    const beforeEvidence = await database.db.select().from(database.evidencesTable).where(eq(database.evidencesTable.insercaoId, insertionId));
    const beforeLogs = await database.db.select().from(database.captureProofLogsTable).where(eq(database.captureProofLogsTable.insertionId, insertionId));

    const unauthenticatedRead = await originalFetch(candidateListUrl);
    assert.equal(unauthenticatedRead.status, 401);
    const operatorOnlyRead = await originalFetch(candidateListUrl, { headers: { authorization: "Bearer test-only-operator-token" } });
    assert.equal(operatorOnlyRead.status, 401);
    const unauthenticatedWrite = await originalFetch(registerUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: targetDate, sourceJobId }),
    });
    assert.equal(unauthenticatedWrite.status, 401);

    const requestPayload = { date: targetDate, sourceJobId, capturedAt: "2000-01-01T00:00:00.000Z" };
    const firstResponse = await originalFetch(registerUrl, { method: "POST", headers: internalHeaders, body: JSON.stringify(requestPayload) });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json() as { candidate: { candidateId: string; capturedAt: string; receivedAt: string; artifactSha256: string } };
    assert.equal(first.candidate.capturedAt, capturedAt, "request-supplied fake time must be ignored");
    assert.notEqual(first.candidate.receivedAt, first.candidate.capturedAt);
    assert.equal(first.candidate.artifactSha256.length, 64);

    const duplicateResponse = await originalFetch(registerUrl, { method: "POST", headers: internalHeaders, body: JSON.stringify(requestPayload) });
    assert.equal(duplicateResponse.status, 200);
    const duplicate = await duplicateResponse.json() as { candidate: { candidateId: string } };
    assert.equal(duplicate.candidate.candidateId, first.candidate.candidateId);
    assert.equal((await database.db.select().from(database.captureProofCandidatesTable)
      .where(eq(database.captureProofCandidatesTable.sourceJobId, sourceJobId))).length, 1);

    const auditResponse = await originalFetch(`${base}/api/internal/capture-proof-candidates/${first.candidate.candidateId}/audit`, { method: "POST", headers: internalHeaders });
    assert.equal(auditResponse.status, 201);
    const auditResult = await auditResponse.json() as { decision: string; checklist: { contract?: { ok?: boolean }; blockingIssues?: unknown[]; audit?: unknown } };
    assert.equal(auditResult.decision, "candidate_blocked");
    assert.equal(auditResult.checklist.contract?.ok, false);
    assert.ok(Array.isArray(auditResult.checklist.blockingIssues) && auditResult.checklist.blockingIssues.length > 0);

    const [candidate] = await database.db.select().from(database.captureProofCandidatesTable).where(eq(database.captureProofCandidatesTable.id, first.candidate.candidateId));
    const [review] = await database.db.select().from(database.captureProofCandidateReviewsTable).where(eq(database.captureProofCandidateReviewsTable.candidateId, first.candidate.candidateId));
    await assert.rejects(database.db.update(database.captureProofCandidatesTable).set({ state: "tampered" }).where(eq(database.captureProofCandidatesTable.id, first.candidate.candidateId)));
    await assert.rejects(database.db.delete(database.captureProofCandidatesTable).where(eq(database.captureProofCandidatesTable.id, first.candidate.candidateId)));
    await assert.rejects(database.db.update(database.captureProofCandidateReviewsTable).set({ decision: "candidate_approved" }).where(eq(database.captureProofCandidateReviewsTable.id, review!.id)));
    await assert.rejects(database.db.delete(database.captureProofCandidateReviewsTable).where(eq(database.captureProofCandidateReviewsTable.id, review!.id)));

    const afterEvidence = await database.db.select().from(database.evidencesTable).where(eq(database.evidencesTable.insercaoId, insertionId));
    const afterLogs = await database.db.select().from(database.captureProofLogsTable).where(eq(database.captureProofLogsTable.insertionId, insertionId));
    assert.deepEqual(afterEvidence, beforeEvidence, "registration/audit must not create or replace canonical evidence");
    assert.deepEqual(afterLogs, beforeLogs, "registration/audit must not append canonical capture logs");
    assert.equal(candidate?.state, "registered");
    assert.equal(review?.decision, "candidate_blocked");
    const candidateReadback = await originalFetch(`${base}/api/internal/capture-proof-candidates/${first.candidate.candidateId}`, { headers: internalHeaders });
    assert.equal(candidateReadback.status, 200);
    const readCandidate = await candidateReadback.json() as { state: string; latestReview?: { decision: string } };
    assert.equal(readCandidate.state, "candidate_blocked");
    assert.equal(readCandidate.latestReview?.decision, "candidate_blocked");
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    globalThis.fetch = originalFetch;
    if (database && insertionId !== null) {
      await database.db.delete(database.captureProofLogsTable).where(eq(database.captureProofLogsTable.insertionId, insertionId));
      await database.db.delete(database.evidencesTable).where(eq(database.evidencesTable.insercaoId, insertionId));
      await database.db.execute(sql`ALTER TABLE capture_proof_candidate_reviews DISABLE TRIGGER capture_proof_candidate_reviews_immutable`);
      await database.db.delete(database.captureProofCandidateReviewsTable).where(eq(database.captureProofCandidateReviewsTable.insertionId, insertionId));
      await database.db.execute(sql`ALTER TABLE capture_proof_candidate_reviews ENABLE TRIGGER capture_proof_candidate_reviews_immutable`);
      await database.db.execute(sql`ALTER TABLE capture_proof_candidates DISABLE TRIGGER capture_proof_candidates_immutable`);
      await database.db.delete(database.captureProofCandidatesTable).where(eq(database.captureProofCandidatesTable.insertionId, insertionId));
      await database.db.execute(sql`ALTER TABLE capture_proof_candidates ENABLE TRIGGER capture_proof_candidates_immutable`);
      await database.db.delete(database.insertionsTable).where(eq(database.insertionsTable.id, insertionId));
    }
    if (database && sourceJobId) await database.db.delete(database.printJobsTable).where(eq(database.printJobsTable.id, sourceJobId));
    if (database && campaignId !== null) await database.db.delete(database.campaignsTable).where(eq(database.campaignsTable.id, campaignId));
    if (database && siteId !== null) await database.db.delete(database.sitesTable).where(eq(database.sitesTable.id, siteId));
    await database?.pool.end();
    await rm(generatedRoot, { recursive: true, force: true });
    if (previousInternalToken === undefined) delete process.env.ADOPS_INTERNAL_API_TOKEN; else process.env.ADOPS_INTERNAL_API_TOKEN = previousInternalToken;
    if (previousOperatorToken === undefined) delete process.env.OPS_API_TOKEN; else process.env.OPS_API_TOKEN = previousOperatorToken;
    if (previousGeneratedRoot === undefined) delete process.env.ADOPS_GENERATED_PRINTS_ROOT; else process.env.ADOPS_GENERATED_PRINTS_ROOT = previousGeneratedRoot;
    if (previousCandidateFeatureFlag === undefined) delete process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED; else process.env.ADOPS_CAPTURE_PROOF_CANDIDATES_ENABLED = previousCandidateFeatureFlag;
    if (previousSpacesEnv.accessKeyId === undefined) delete process.env.DO_SPACES_ACCESS_KEY_ID; else process.env.DO_SPACES_ACCESS_KEY_ID = previousSpacesEnv.accessKeyId;
    if (previousSpacesEnv.secretAccessKey === undefined) delete process.env.DO_SPACES_SECRET_ACCESS_KEY; else process.env.DO_SPACES_SECRET_ACCESS_KEY = previousSpacesEnv.secretAccessKey;
    if (previousSpacesEnv.endpoint === undefined) delete process.env.DO_SPACES_ENDPOINT; else process.env.DO_SPACES_ENDPOINT = previousSpacesEnv.endpoint;
    if (previousSpacesEnv.region === undefined) delete process.env.DO_SPACES_REGION; else process.env.DO_SPACES_REGION = previousSpacesEnv.region;
  }
});
