function hasPiDigits(value: string) {
  return /\b(?:PI\s*)?0*\d{3,}\b/i.test(value);
}

export function resolveDisplayPi(rawPiCodigo: string, canonicalPiCodigo: string | null | undefined) {
  if (hasPiDigits(rawPiCodigo)) {
    return { piCodigo: rawPiCodigo, rawPiCodigo, canonicalPiCodigo: rawPiCodigo, decision: "sheet" as const };
  }
  const canonical = canonicalPiCodigo ?? null;
  if (canonical && hasPiDigits(canonical)) {
    return { piCodigo: canonical, rawPiCodigo, canonicalPiCodigo: canonical, decision: "adops_fallback" as const };
  }
  return { piCodigo: "PI pendente", rawPiCodigo, canonicalPiCodigo: null, decision: "pending" as const };
}
