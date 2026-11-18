export type ProvisionalIdentityInput = {
  source?: string | null;
  siteId?: number | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  localFormato?: string | null;
  localFormatoNormalizado?: string | null;
  mediaUrl?: string | null;
};

export function normalizeBundlePosition(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function provisionalIdentity(input: ProvisionalIdentityInput) {
  const source = input.source?.trim().toLowerCase() ?? "";
  const position = normalizeBundlePosition(input.localFormatoNormalizado ?? input.localFormato);
  const piece = input.mediaUrl?.trim() ?? "";
  if (!source || input.siteId == null || !input.periodoInicio || !input.periodoFim || !position || !piece) return null;
  return JSON.stringify([source, input.siteId, input.periodoInicio, input.periodoFim, position, piece]);
}

export function findProvisionalIdentityMatches<T extends { id: number; origem?: string | null }>(rows: T[], requestedSource: string) {
  const ids = [...new Set(rows.map((row) => Number(row.id)))];
  if (ids.length > 1) return { kind: "ambiguous" as const, campaignIds: ids };
  if (ids.length === 1) {
    const sources = [...new Set(rows.map((row) => row.origem?.trim().toLowerCase() ?? ""))];
    if (sources.some((source) => source !== requestedSource.trim().toLowerCase())) {
      return { kind: "source_review" as const, campaignIds: ids };
    }
    return { kind: "exists" as const, campaignIds: ids };
  }
  return { kind: "none" as const, campaignIds: [] as number[] };
}
