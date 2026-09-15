import { canonicalCommercialPi } from "./monthly-evidence-contract.mjs";

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, " ")
  .trim();

export function portalExportGroupKey(item) {
  const piCodigo = canonicalCommercialPi(item?.piCodigo);
  const siteSigla = normalize(item?.siteSigla);
  return piCodigo && siteSigla ? `${siteSigla}:${normalize(piCodigo)}` : null;
}

export function completeCampaignExportGroupKey(item) {
  const piCodigo = canonicalCommercialPi(item?.piCodigo);
  const competencia = normalize(item?.competencia);
  return piCodigo && competencia ? `${piCodigo}:${competencia}` : null;
}

export function hasCompleteEvidenceGroup(items) {
  const evidenceDays = items.flatMap((item) => item.evidenceDays.filter((day) => day.status.startsWith("audited") && day.url));
  const required = items.reduce((sum, item) => sum + item.requiredDays.length, 0);
  return required > 0 && evidenceDays.length === required;
}

export function completeExportGroupKeys(items, keyForItem) {
  const groups = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return new Set(Array.from(groups.entries())
    .filter(([, group]) => hasCompleteEvidenceGroup(group))
    .map(([key]) => key));
}
