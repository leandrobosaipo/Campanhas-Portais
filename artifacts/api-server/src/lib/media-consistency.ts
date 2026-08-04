export function normalizeMediaFileKey(value: string | null | undefined) {
  const raw = String(value ?? "").split("/").pop() ?? "";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(\d+\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d{3,4}x\d{2,4}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mediaNamesCompatible(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeMediaFileKey(left);
  const b = normalizeMediaFileKey(right);
  return Boolean(a && b && a === b);
}
