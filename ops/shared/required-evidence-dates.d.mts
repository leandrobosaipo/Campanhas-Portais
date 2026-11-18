export function parseRequiredEvidenceDates(raw: unknown): Record<string, string[]> | null;
export function assertRequiredInsertionScope(scope: Record<string, string[]> | null, ids: Iterable<number>): void;
export function selectRequiredEvidenceRows<T>(rows: T[], insertionId: number, scope: Record<string, string[]> | null, dateForRow: (row: T) => string | null): T[];
