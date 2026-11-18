export interface IntakeRecovery {
  source: string;
  eventId: string;
  driveFileId: string;
  sourcePdfSha: string;
  appliedParseRunId: string | null;
  mediaParseRunId: string | null;
  insertionIds: number[];
  mediaProcessing: { results: Record<string, unknown>[] };
  executionWarning: true;
}
export function recoverActionIntakeEvidence(input: {
  actionId: string;
  job: Record<string, any>;
  plan: Record<string, any>;
  eventRow: Record<string, any> | undefined;
  documentRow: Record<string, any> | undefined;
  parseRuns: Record<string, any>[];
  campaigns: Record<string, any>[];
  insertions: Record<string, any>[];
}): IntakeRecovery | null;
