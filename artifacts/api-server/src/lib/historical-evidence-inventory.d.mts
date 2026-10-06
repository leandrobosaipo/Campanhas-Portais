export type HistoricalInventoryPagination = { limit: number; cursor: number | null };
export function parseHistoricalInventoryPagination(query: Record<string, unknown>): { ok: true; limit: number; cursor: number | null } | { ok: false; error: string };
export function selectCanonicalHistoricalEvidenceRows<T extends { evidenceId: number; insertionId: number; targetDate: string | null; createdAt?: Date | string | null }>(rows: T[]): T[];
export function pageHistoricalInventoryRows<T extends { evidenceId: number }>(canonicalRows: T[], pagination: HistoricalInventoryPagination): { rows: T[]; nextCursor: string | null };
export function classifyHistoricalInventorySource(input: { trustedClass: string | null; reconstructionPresent: boolean }): "historical" | "daily" | "unknown";
