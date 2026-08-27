import { createHash } from "node:crypto";

export function normalizeIdentitySegment(value: unknown, fallback = "-") {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
  return normalized || fallback;
}

export function buildInsertionCanonicalIdentity(input: {
  piCodigo: unknown;
  siteSigla: unknown;
  position: unknown;
  groupId?: number | null;
  periodStart: unknown;
  periodEnd: unknown;
}) {
  const pi = String(input.piCodigo ?? "").replace(/\D/g, "") || "-";
  const portal = normalizeIdentitySegment(input.siteSigla);
  // localFormatoNormalizado is the persisted cross-system placement identity.
  // The group id is deliberately not used because it may change per portal rule revision.
  const placement = normalizeIdentitySegment(input.position);
  const start = normalizeIdentitySegment(input.periodStart);
  const end = normalizeIdentitySegment(input.periodEnd);
  const source = [pi, portal, placement, start, end].join("|");
  return `v1:${createHash("sha256").update(source).digest("hex")}`;
}
