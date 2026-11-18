export function stableJson(value: unknown): string;
export function inspectCandidateJob(job: Record<string, unknown>, insertionId: number, targetDate: string): {
  ok: true; jobId: string; item: Record<string, unknown>; target: Record<string, unknown>;
  captureStageStartedAt: string; captureStageFinishedAt: string; uploadedAt: string; artifactUrl: URL; requestedCaptureAt: unknown;
} | { ok: false; reason: string };
export function validateCandidateMetadata(metadata: Record<string, unknown>, identity: {
  jobId: string; insertionId: number; targetDate: string; captureStageStartedAt: string; captureStageFinishedAt: string; requestedCaptureAt: unknown;
}): { ok: boolean; reason: string | null };
export function validateCandidateReadback(candidate: Record<string, unknown>, actual: {
  sha256: string; bytes: number; metadata: Record<string, unknown>; artifactUrl: string; capturedAt: string;
}): boolean;
