import { enqueueVisualPreview } from "./visual-previews";

type Registration = {
  siteId?: number | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  localFormato?: string | null;
  localFormatoNormalizado?: string | null;
  mediaUrl?: string | null;
  observacoes?: string | null;
  statusNormalizado?: string | null;
};

export async function previewAfterRegistration(
  id: number,
  row: Registration,
  previous?: Registration,
) {
  const format = row.localFormatoNormalizado || row.localFormato;
  if (
    !row.siteId ||
    !row.mediaUrl ||
    !format ||
    !row.periodoInicio ||
    !row.periodoFim ||
    row.periodoFim <
      new Date().toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" }) ||
    ["cancelado", "concluido", "rascunho"].includes(row.statusNormalizado || "")
  )
    return undefined;
  const materialFields = [
    "siteId",
    "periodoInicio",
    "periodoFim",
    "localFormato",
    "localFormatoNormalizado",
    "mediaUrl",
  ] as const;
  if (
    previous &&
    !["rascunho", "concluido", "cancelado"].includes(
      previous.statusNormalizado || "",
    ) &&
    materialFields.every((key) => previous[key] === row[key]) &&
    previous.observacoes === row.observacoes
  )
    return undefined;
  try {
    return await enqueueVisualPreview(id);
  } catch {
    // Registration is committed. Retrying the preview endpoint reuses the same snapshot.
    return {
      insertionId: id,
      status: "needs_review",
      retryUrl: `/api/insertions/${id}/visual-previews`,
    };
  }
}
