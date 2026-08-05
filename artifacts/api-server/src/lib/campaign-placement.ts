export type CampaignPlacementCode =
  | "top"
  | "home_1"
  | "home_2"
  | "home_3"
  | "article_internal"
  | "first_fold"
  | "second_fold"
  | "lateral"
  | "lateral_first_fold"
  | "top_lateral"
  | "video"
  | "video_lateral"
  | "instagram"
  | `group_${number}`
  | `custom_${string}`;

function lexicalPlacement(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bMEGA\s+BANNER\b/g, "MEGABANNER")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function customPlacement(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? `custom_${slug}` as const : null;
}

/** Stable identity shared by sheet, AdOps, AdRotate, capture and delivery. */
export function resolveCampaignPlacementCode(
  value: string | null | undefined,
  groupId?: number | null,
): CampaignPlacementCode | null {
  const normalized = lexicalPlacement(value);
  if (!normalized) return typeof groupId === "number" && Number.isInteger(groupId) ? `group_${groupId}` : null;
  const home = normalized.match(/(?:^| )HOME ([123])(?: |$)/)?.[1];
  if (home === "1") return "home_1";
  if (home === "2") return "home_2";
  if (home === "3") return "home_3";
  if (/\bVIDEO\b/.test(normalized) && /\bLATERAL\b/.test(normalized)) return "video_lateral";
  if (/\bVIDEO\b/.test(normalized)) return "video";
  if (/\bINTERNO\b/.test(normalized) && /\bNOTIC/.test(normalized)) return "article_internal";
  if (/\bLATERAL\b/.test(normalized) && /\bPRIMEIRA DOBRA\b/.test(normalized)) return "lateral_first_fold";
  if (/\bTOPO LATERAL\b/.test(normalized)) return "top_lateral";
  if (normalized === "LATERAL") return "lateral";
  if (/\bPRIMEIRA DOBRA\b/.test(normalized)) return "first_fold";
  if (/\bSEGUNDA DOBRA\b/.test(normalized)) return "second_fold";
  if (/\bTOPO\b/.test(normalized)) return "top";
  if (/\bINSTAGRAM\b/.test(normalized)) return "instagram";
  if (typeof groupId === "number" && Number.isInteger(groupId)) return `group_${groupId}`;
  return customPlacement(normalized);
}

export function campaignPlacementsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftCode = resolveCampaignPlacementCode(left);
  const rightCode = resolveCampaignPlacementCode(right);
  return Boolean(leftCode && rightCode && leftCode === rightCode);
}
