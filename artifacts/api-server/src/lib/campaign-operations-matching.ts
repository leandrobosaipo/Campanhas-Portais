import {
  normalizeForMatch,
  normalizeFormato,
  type CurrentSheetCampaignRow,
} from "./current-sheet-campaigns";

type MatchRow = Pick<CurrentSheetCampaignRow, "localFormato" | "periodoInicio" | "periodoFim">;

type CampaignIdentityRow = Pick<CurrentSheetCampaignRow, "piCodigo" | "campaignName" | "blockSite" | "periodoInicio" | "periodoFim">;

type CampaignInsertionIdentityInput = {
  piCodigo?: unknown;
  siteSigla?: unknown;
  localFormato?: unknown;
  localFormatoNormalizado?: unknown;
  periodoInicio?: unknown;
  periodoFim?: unknown;
};

type CampaignIdentityCandidate = CampaignOperationMatchCandidate & {
  campaignName: string | null;
  piCodigo: string | null;
  siteSigla: string | null;
};

export type CampaignOperationMatchCandidate = {
  id: number;
  localFormato: string | null;
  localFormatoNormalizado: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  statusNormalizado: string | null;
  bannerPublicadoNoSite: boolean | null;
  mediaUrl: string | null;
};

export function normalizeCampaignPiIdentity(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || null;
}

export function buildCampaignInsertionIdentity(input: CampaignInsertionIdentityInput) {
  const pi = normalizeCampaignPiIdentity(input.piCodigo);
  const site = normalizeForMatch(String(input.siteSigla ?? ""));
  const format = normalizeFormato(String(input.localFormatoNormalizado ?? input.localFormato ?? ""));
  const start = String(input.periodoInicio ?? "");
  const end = String(input.periodoFim ?? "");
  return pi && site && format && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    ? `${pi}:${site}:${format}:${start}:${end}`
    : null;
}

export function findDuplicateCampaignInsertions<T extends CampaignOperationMatchCandidate & CampaignInsertionIdentityInput>(input: CampaignInsertionIdentityInput, candidates: T[]) {
  const identity = buildCampaignInsertionIdentity(input);
  return identity ? candidates.filter((candidate) => buildCampaignInsertionIdentity(candidate) === identity) : [];
}

export function findCampaignIdentityMatches<T extends CampaignIdentityCandidate>(row: CampaignIdentityRow, candidates: T[]) {
  const sheetPi = normalizeCampaignPiIdentity(row.piCodigo);
  return candidates.filter((candidate) => {
    if (normalizeForMatch(candidate.siteSigla) !== normalizeForMatch(row.blockSite)) return false;
    if (sheetPi) return normalizeCampaignPiIdentity(candidate.piCodigo) === sheetPi;
    const sheetCampaign = normalizeForMatch(row.campaignName);
    const adopsCampaign = normalizeForMatch(candidate.campaignName);
    return Boolean(sheetCampaign && adopsCampaign && (sheetCampaign === adopsCampaign || sheetCampaign.includes(adopsCampaign) || adopsCampaign.includes(sheetCampaign)))
      && candidate.periodoInicio === row.periodoInicio
      && candidate.periodoFim === row.periodoFim;
  });
}

export function isFormatCompatible(sheetFormat: string, adopsFormat: string | null | undefined) {
  const sheet = normalizeFormato(sheetFormat);
  const adops = normalizeFormato(adopsFormat);
  if (!sheet || !adops) return false;
  if (sheet === adops) return true;
  if (/^HOME [123]$/.test(sheet) && adops.endsWith(sheet)) return true;
  if (sheet === "INTERNO" && adops === "INTERNO DE NOTICIAS") return true;
  const exactAliasPairs = [
    ["TOPO", "MEGABANNER TOPO"],
    ["MEGABANNER TOPO", "MEGABANNER TOPO — HEADER — 825X120"],
    ["VIDEO", "VIDEO — LATERAL 01 — SIDEBAR — 300X250"],
  ];
  if (exactAliasPairs.some(([left, right]) => (sheet === left && adops === right) || (sheet === right && adops === left))) return true;
  const popupSitewideAliases = new Set(["POP UP", "POP UP — SITEWIDE — 970X90"]);
  if (popupSitewideAliases.has(sheet) && popupSitewideAliases.has(adops)) return true;
  if (sheet.startsWith("LATERAL 02") && adops.startsWith("LATERAL 02")) return true;
  if (sheet === "LATERAL" && adops.includes("LATERAL")) return true;
  return false;
}

function isInactiveInsertionStatus(value: string | null | undefined) {
  return ["CANCELADO", "CANCELADA", "INATIVO", "INATIVA", "ARQUIVADO", "ARQUIVADA"].includes(normalizeForMatch(value));
}

function periodsOverlap(row: MatchRow, insertion: CampaignOperationMatchCandidate) {
  if (!row.periodoInicio || !row.periodoFim || !insertion.periodoInicio || !insertion.periodoFim) return false;
  return insertion.periodoInicio <= row.periodoFim && insertion.periodoFim >= row.periodoInicio;
}

function scoreAdopsMatch(row: MatchRow, insertion: CampaignOperationMatchCandidate) {
  let score = 0;
  if (isInactiveInsertionStatus(insertion.statusNormalizado)) score -= 1_000;
  // A detailed commercial label is evidence only after it represents a real
  // publication. A draft must not displace an older creative that is live.
  if (insertion.bannerPublicadoNoSite !== true) score -= 80;
  const adopsFormat = insertion.localFormatoNormalizado ?? insertion.localFormato;
  // Commercial aliases remain compatible, but a fully specified sheet format
  // (for example, HEADER + dimensions) must win over its broader legacy alias
  // when both are already published for the same PI and period.
  if (normalizeFormato(row.localFormato) === normalizeFormato(adopsFormat)) score += 80;
  if (isFormatCompatible(row.localFormato, adopsFormat)) score += 100;
  if (insertion.periodoInicio === row.periodoInicio && insertion.periodoFim === row.periodoFim) score += 60;
  else if (periodsOverlap(row, insertion)) score += 30;
  if (insertion.mediaUrl) score += 20;
  if (insertion.bannerPublicadoNoSite === true) score += 20;
  if (["PUBLICADO", "EM_VEICULACAO", "PUBLICADO_NO_SITE"].includes(normalizeForMatch(insertion.statusNormalizado))) score += 10;
  return score;
}

export function selectBestAdopsMatch<T extends CampaignOperationMatchCandidate>(row: MatchRow, matches: T[]) {
  const compatible = matches.filter((insertion) => isFormatCompatible(row.localFormato, insertion.localFormatoNormalizado ?? insertion.localFormato));
  if (compatible.length === 0) return { insertion: null, compatible };
  const ranked = compatible
    .map((insertion) => ({ insertion, score: scoreAdopsMatch(row, insertion) }))
    .sort((a, b) => b.score - a.score || b.insertion.id - a.insertion.id);
  if (ranked.length === 1) return { insertion: ranked[0]!.insertion, compatible };
  const [best, second] = ranked;
  if (best && second && best.score > second.score) return { insertion: best.insertion, compatible };
  if (best && second && best.score === second.score) {
    const tied = ranked.filter((candidate) => candidate.score === best.score);
    const fingerprint = (candidate: T) => JSON.stringify({
      format: normalizeFormato(candidate.localFormatoNormalizado ?? candidate.localFormato),
      periodoInicio: candidate.periodoInicio,
      periodoFim: candidate.periodoFim,
      mediaUrl: candidate.mediaUrl,
    });
    if (new Set(tied.map(({ insertion }) => fingerprint(insertion))).size === 1) {
      return { insertion: tied.map(({ insertion }) => insertion).sort((a, b) => b.id - a.id)[0]!, compatible };
    }
  }
  return { insertion: null, compatible };
}
