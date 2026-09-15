import { canonicalCommercialPi, competenciaMonthKey } from "./monthly-evidence-contract.mjs";

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

export function isPartialCampaignExportBatch(pathname, status, payload) {
  return pathname === "/api/campaign-evidence-exports/jobs/batch"
    && status === 409
    && Array.isArray(payload?.items) && payload.items.length > 0
    && payload.items.every((item) => /^\d+$/.test(String(item?.piCodigo))
      && Number.isInteger(item?.httpStatus) && item.httpStatus >= 200 && item.httpStatus <= 599)
    && new Set(payload.items.map((item) => String(item.piCodigo))).size === payload.items.length;
}

export function completeCampaignExportBlocker(item, group) {
  if (item?.httpStatus !== 409 || item.error !== "campaign_evidence_incomplete" || item.readiness?.ready !== false
    || String(item.piCodigo) !== String(group.piCodigo)
    || !competenciaMonthKey(item.competencia)
    || competenciaMonthKey(item.competencia) !== competenciaMonthKey(group.competencia)) return "";
  const reasons = { not_published: "sem publicação", missing_media: "sem mídia" };
  const details = (Array.isArray(item.readiness.operationalBlockers) ? item.readiness.operationalBlockers : [])
    .filter((entry) => Number.isInteger(entry.insertionId) && reasons[entry.reason])
    .map((entry) => `inserção ${entry.insertionId} ${reasons[entry.reason]}`);
  for (const [key, label] of [["missingDates", "sem print"], ["invalidDates", "com auditoria inválida"], ["inaccessibleDates", "com print inacessível"]]) {
    for (const entry of Array.isArray(item.readiness[key]) ? item.readiness[key] : []) {
      if (Number.isInteger(entry.insertionId) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) details.push(`inserção ${entry.insertionId}, ${entry.date} ${label}`);
    }
  }
  if (Array.isArray(item.identityBlockers) && item.identityBlockers.some((entry) => entry?.reason === "canonical_insertion_missing")) details.push("inserção canônica ausente no cadastro");
  if (!details.length) return "";
  return `ZIP completo bloqueado pela API: ${details.slice(0, 12).join("; ")}${details.length > 12 ? "; há outras pendências" : ""}. Os prints aprovados continuam preservados.`;
}

export function validateCompleteCampaignExportLinks(items) {
  const completeGroups = completeExportGroupKeys(items, completeCampaignExportGroupKey);
  for (const item of items) {
    if (item.completeCampaignExportStatus === "blocked"
      && (item.completeCampaignDownloadUrl || !item.commercialExportBlocker)) {
      throw new Error(`Bloqueio de ZIP completo inconsistente na inserção ${item.id}.`);
    }
  }
  const missing = items.filter((item) => completeGroups.has(completeCampaignExportGroupKey(item))
    && !item.completeCampaignDownloadUrl && item.completeCampaignExportStatus !== "blocked");
  if (missing.length) throw new Error(`Relatório sem ZIP completo para inserções: ${missing.map((item) => item.id).join(", ")}.`);
}
