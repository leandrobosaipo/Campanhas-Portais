import {
  normalizeForMatch,
  normalizeFormato,
  type CurrentSheetCampaignRow,
} from "./current-sheet-campaigns";
import { campaignPlacementsMatch } from "./campaign-placement";

type MatchRow = Pick<CurrentSheetCampaignRow, "localFormato" | "periodoInicio" | "periodoFim">;

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

export function isFormatCompatible(sheetFormat: string, adopsFormat: string | null | undefined) {
  const sheet = normalizeFormato(sheetFormat);
  const adops = normalizeFormato(adopsFormat);
  if (!sheet || !adops) return false;
  if (sheet === adops) return true;
  if (campaignPlacementsMatch(sheet, adops)) return true;
  if (sheet === "TOPO" && adops.includes("TOPO")) return true;
  if (sheet === "INTERNO" && adops === "INTERNO DE NOTICIAS") return true;
  if (sheet === "LATERAL" && adops.includes("LATERAL")) return true;
  if (sheet === "VIDEO" && adops.includes("VIDEO")) return true;
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
  const adopsFormat = insertion.localFormatoNormalizado ?? insertion.localFormato;
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
  return { insertion: null, compatible };
}
