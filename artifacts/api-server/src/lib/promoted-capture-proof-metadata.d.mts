export type PromotedCaptureProofRecord = Record<string, unknown>;

export function resolvePromotedCaptureProofMetadata(input: {
  promotion: PromotedCaptureProofRecord | null | undefined;
  candidate: PromotedCaptureProofRecord | null | undefined;
  finalLog: PromotedCaptureProofRecord | null | undefined;
  canonicalEvidenceUrl: string | null | undefined;
}): PromotedCaptureProofRecord | null;
