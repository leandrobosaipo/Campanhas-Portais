export type HistoricalPresentationExpectation = {
  evidenceId: number;
  arquivoUrl: string;
  sha256: string;
  bytes: number;
};
export function parsePromotionRequestBody(rawBody: unknown): { ok: true; expectation?: HistoricalPresentationExpectation } | { ok: false; error: string };
export function decideHistoricalPresentationUpgrade(input: {
  request?: HistoricalPresentationExpectation | null;
  original?: { id: number; arquivoUrl: string; sha256: string; bytes: number; captureClass: string; auditCaptureClass: string | null; canonicalUrl: string | null; auditApproved: boolean; provenanceVersion?: number; frameTemplateVersion?: string } | null;
  candidate?: { captureClass: string; provenanceVersion: number; frameTemplateVersion: string; historicalDisplayConfirmed: unknown } | null;
  reviewApproved: boolean;
  canonicalApproved: boolean;
}): { ok: true; reason: "presentation_upgrade"; expectedOriginal: HistoricalPresentationExpectation } | { ok: false; code: string };
