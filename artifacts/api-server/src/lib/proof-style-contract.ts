export function resolveChecklistFinalProofStyle(
  resolvedRuleProofStyle: string,
  metadata: Record<string, unknown> | null,
) {
  const capturedStyle = typeof metadata?.finalProofStyle === "string"
    ? metadata.finalProofStyle.trim()
    : "";
  return capturedStyle || String(resolvedRuleProofStyle || "").trim();
}
