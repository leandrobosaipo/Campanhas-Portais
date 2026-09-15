// PostgreSQL JSONB reorders object keys when the runner claims a job.
// Keep the original descriptor field order so existing signatures stay valid.
export function serializeCampaignEvidenceFingerprint(piCodigo: string, competencia: string, evidences: unknown[]) {
  return JSON.stringify({ piCodigo, competencia, evidences: evidences.map((value) => {
    const item = value as Record<string, unknown>;
    return {
      insertionId: item.insertionId,
      evidenceId: item.evidenceId,
      portal: item.portal,
      date: item.date,
      url: item.url,
      auditHash: item.auditHash,
    };
  }) });
}
