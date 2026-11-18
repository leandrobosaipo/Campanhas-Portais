export function resolveChecklistFinalProofStyle(
  resolvedRuleProofStyle: string,
  metadata: Record<string, unknown> | null,
) {
  const capturedStyle = typeof metadata?.finalProofStyle === "string"
    ? metadata.finalProofStyle.trim()
    : "";
  return capturedStyle || String(resolvedRuleProofStyle || "").trim();
}

export function requiresPerrengueHomeEditorialAudit(siteSigla: string, page: string) {
  return String(siteSigla || "").trim().toUpperCase() === "PERRENGUE"
    && String(page || "").trim().toLowerCase() === "home";
}
