import { getAdRotateGroupId } from "./adrotate-sites";
import { normalizeFormato } from "./current-sheet-campaigns";

export function isFormatCompatible(
  siteSigla: string,
  sheetFormat: string,
  adopsFormat: string | null | undefined,
) {
  const sheetGroupId = getAdRotateGroupId(siteSigla, sheetFormat);
  const adopsGroupId = getAdRotateGroupId(siteSigla, adopsFormat);
  if (sheetGroupId && adopsGroupId) return sheetGroupId === adopsGroupId;

  const sheet = normalizeFormato(sheetFormat);
  const adops = normalizeFormato(adopsFormat);
  if (!sheet || !adops) return false;
  if (sheet === adops) return true;

  const sheetHome = sheet.match(/(?:^| )HOME ([1-9]\d*)$/)?.[1];
  const adopsHome = adops.match(/(?:^| )HOME ([1-9]\d*)$/)?.[1];
  if (sheetHome && sheetHome === adopsHome) return true;

  if (sheet === "TOPO" && adops === "MEGABANNER TOPO") return true;
  if (sheet === "VIDEO" && adops.includes("VIDEO")) return true;
  return false;
}
