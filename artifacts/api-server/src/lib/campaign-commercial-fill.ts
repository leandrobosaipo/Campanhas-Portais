export const CAMPAIGN_COMMERCIAL_FILL_FIELDS = [
  "piCodigo",
  "clienteId",
  "agenciaId",
  "competencia",
  "valorLiquido",
  "planilhaRef",
] as const;

export type CampaignCommercialFillField = typeof CAMPAIGN_COMMERCIAL_FILL_FIELDS[number];
export type CampaignCommercialFillValues = Partial<Record<CampaignCommercialFillField, string | number | null>>;
export type CampaignCommercialFillConflict = {
  field: CampaignCommercialFillField;
  code: "empty_value_rejected" | "non_empty_value_differs";
  current: string | number | null;
  requested: string | number | null;
};

function isEmpty(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? null : Number(value);
}

export function planCampaignCommercialFill(current: CampaignCommercialFillValues, requested: CampaignCommercialFillValues) {
  const before: CampaignCommercialFillValues = {};
  const proposed: CampaignCommercialFillValues = {};
  const conflicts: CampaignCommercialFillConflict[] = [];
  const changedFields: CampaignCommercialFillField[] = [];

  for (const field of CAMPAIGN_COMMERCIAL_FILL_FIELDS) {
    const existing = normalize(current[field]);
    before[field] = (current[field] ?? null) as never;
    proposed[field] = (current[field] ?? null) as never;
    if (!(field in requested)) continue;

    const incoming = normalize(requested[field]);
    if (isEmpty(incoming) || (typeof incoming === "number" && !Number.isFinite(incoming))) {
      conflicts.push({ field, code: "empty_value_rejected", current: (existing ?? null) as never, requested: (incoming ?? null) as never });
      continue;
    }
    if (isEmpty(existing)) {
      proposed[field] = incoming as never;
      changedFields.push(field);
      continue;
    }
    if (existing !== incoming) conflicts.push({ field, code: "non_empty_value_differs", current: existing as never, requested: incoming as never });
  }

  return { before, proposed, conflicts, changedFields };
}
