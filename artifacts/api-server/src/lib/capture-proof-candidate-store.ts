import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, printJobsTable, type CaptureProofCandidate } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getLocalCaptureRuntime } from "./local-capture-runtime";
import { inspectCandidateJob, stableJson, validateCandidateMetadata, validateCandidateReadback } from "./capture-proof-candidate-provenance.mjs";
import { prepareEvidenceImage } from "./evidence-export";

export async function loadPersistedCandidateSource(jobId: string, insertionId: number, targetDate: string) {
  const row = await db.query.printJobsTable.findFirst({ where: eq(printJobsTable.id, jobId) });
  if (!row) return { ok: false as const, reason: "source_job_not_found" };
  const proof = inspectCandidateJob({
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload ?? {},
    items: Array.isArray(row.items) ? row.items : [],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  }, insertionId, targetDate);
  if (!proof.ok) return { ok: false as const, reason: proof.reason };
  const filePath = path.join(getLocalCaptureRuntime().generatedPrintsRoot, "candidates", jobId, targetDate, String(insertionId), `${targetDate}-meta.json`);
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false as const, reason: "candidate_metadata_file_missing" };
  }
  const metadataProof = validateCandidateMetadata(metadata, { jobId, insertionId, targetDate, captureStageStartedAt: proof.captureStageStartedAt, captureStageFinishedAt: proof.captureStageFinishedAt, requestedCaptureAt: proof.requestedCaptureAt });
  if (!metadataProof.ok) return { ok: false as const, reason: metadataProof.reason ?? "candidate_metadata_provenance_mismatch" };
  return { ok: true as const, row, proof, metadata, artifactUrl: proof.artifactUrl, capturedAt: new Date(metadata.capturedAt as string).toISOString(), captureStageStartedAt: proof.captureStageStartedAt, captureStageFinishedAt: proof.captureStageFinishedAt, uploadedAt: proof.uploadedAt, requestedCaptureAt: proof.requestedCaptureAt };
}

export async function readCandidateArtifact(url: URL) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "image/png" } });
  if (!response.ok) throw new Error("candidate_artifact_unavailable");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 20 * 1024 * 1024) throw new Error("candidate_artifact_too_large");
  if (!response.body) throw new Error("candidate_artifact_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 20 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("candidate_artifact_too_large");
    }
    chunks.push(chunk.value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  if (bytes.length < 8 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("candidate_artifact_not_png");
  if (bytes.length < 33 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("candidate_artifact_invalid_png");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 40_000_000) throw new Error("candidate_artifact_dimensions_blocked");
  const decodeDir = await mkdtemp(path.join(tmpdir(), "adops-candidate-decode-"));
  try {
    // Reuse the production delivery decoder to reject truncated/corrupt PNGs.
    // Only this temporary validation copy is resized; the candidate stays exact.
    await prepareEvidenceImage({ source: bytes, outputPath: path.join(decodeDir, "validation.jpg"), variant: "web", maxWidth: 800, quality: 60 });
  } catch {
    throw new Error("candidate_artifact_decode_failed");
  } finally {
    await rm(decodeDir, { recursive: true, force: true });
  }
  return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

export async function inspectPersistedCaptureCandidate(candidate: CaptureProofCandidate) {
  const source = await loadPersistedCandidateSource(candidate.sourceJobId, candidate.insertionId, candidate.targetDate);
  if (!source.ok) return { ok: false as const, reason: source.reason };
  if (source.artifactUrl.toString() !== candidate.artifactUrl
    || source.capturedAt !== candidate.capturedAt.toISOString()
    || source.captureStageStartedAt !== candidate.captureStageStartedAt.toISOString()
    || source.captureStageFinishedAt !== candidate.captureStageFinishedAt.toISOString()
    || stableJson(source.metadata) !== stableJson(candidate.metadata)) return { ok: false as const, reason: "candidate_provenance_changed" };
  try {
    const artifact = await readCandidateArtifact(source.artifactUrl);
    if (!validateCandidateReadback(candidate, {
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      metadata: source.metadata,
      artifactUrl: source.artifactUrl.toString(),
      capturedAt: source.capturedAt,
    })) return { ok: false as const, reason: "candidate_artifact_changed" };
    return { ok: true as const, source, artifact };
  } catch {
    return { ok: false as const, reason: "candidate_artifact_unavailable" };
  }
}
