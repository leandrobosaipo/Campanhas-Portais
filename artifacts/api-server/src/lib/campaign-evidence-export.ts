import crypto from "node:crypto";

export class CampaignEvidenceExportConflict extends Error {
  readonly statusCode = 409;
}

function normalizePi(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCompetencia(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function parseCampaignEvidenceIdentity(input: { piCodigo?: unknown; competencia?: unknown }) {
  const piCodigo = normalizePi(input?.piCodigo);
  const competencia = normalizeCompetencia(input?.competencia);
  if (!piCodigo) throw new CampaignEvidenceExportConflict("A campanha precisa de PI canônica para gerar o pacote completo.");
  if (!competencia) throw new CampaignEvidenceExportConflict("A competência é obrigatória para isolar o pacote da campanha.");
  return { piCodigo, competencia };
}

export function selectCampaignEvidenceInsertions<T extends {
  piCodigo?: unknown;
  competencia?: unknown;
  statusNormalizado?: unknown;
  bannerPublicadoNoSite?: unknown;
  mediaUrl?: unknown;
}>(insertions: T[], identity: { piCodigo: string; competencia: string }) {
  return (insertions || []).filter((item) => (
    normalizePi(item.piCodigo) === identity.piCodigo
    && normalizeCompetencia(item.competencia) === identity.competencia
    && String(item.statusNormalizado || "").trim().toLowerCase() !== "cancelado"
    && item.bannerPublicadoNoSite === true
    && Boolean(String(item.mediaUrl || "").trim())
  ));
}

export type CampaignEvidenceReadinessItem = {
  insertionId: number;
  requiredDates: string[];
  evidenceDates: string[];
  invalidDates: string[];
  inaccessibleDates: string[];
};

export function validateCampaignEvidenceReadiness(items: CampaignEvidenceReadinessItem[]) {
  const missingDates: Array<{ insertionId: number; date: string }> = [];
  const invalidDates: Array<{ insertionId: number; date: string }> = [];
  const inaccessibleDates: Array<{ insertionId: number; date: string }> = [];
  for (const item of items || []) {
    const evidenceDates = new Set(item.evidenceDates || []);
    for (const date of item.requiredDates || []) {
      if (!evidenceDates.has(date)) missingDates.push({ insertionId: item.insertionId, date });
    }
    invalidDates.push(...(item.invalidDates || []).map((date) => ({ insertionId: item.insertionId, date })));
    inaccessibleDates.push(...(item.inaccessibleDates || []).map((date) => ({ insertionId: item.insertionId, date })));
  }
  return {
    ready: missingDates.length === 0 && invalidDates.length === 0 && inaccessibleDates.length === 0,
    missingDates,
    invalidDates,
    inaccessibleDates,
  };
}

export function buildCampaignEvidenceExportIdempotencyKey(input: {
  piCodigo: string;
  competencia: string;
  evidences: Array<{ insertionId: number; evidenceId: number; portal: string; date: string }>;
}) {
  const identity = parseCampaignEvidenceIdentity(input);
  const evidences = (input.evidences || []).map((item) => ({
    insertionId: Number(item.insertionId),
    evidenceId: Number(item.evidenceId),
    portal: String(item.portal || "").trim().toUpperCase(),
    date: String(item.date || ""),
  })).sort((left, right) => (
    left.portal.localeCompare(right.portal)
    || left.date.localeCompare(right.date)
    || left.insertionId - right.insertionId
    || left.evidenceId - right.evidenceId
  ));
  const digest = crypto.createHash("sha256").update(JSON.stringify({ ...identity, evidences })).digest("hex");
  return `campaign-evidence-v1-${digest}`;
}
