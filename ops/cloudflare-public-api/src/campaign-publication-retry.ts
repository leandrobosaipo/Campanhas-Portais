type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

export function shouldRetryCompletedCampaignPublication(rawResult: unknown): boolean {
  let parsed = rawResult;
  if (typeof rawResult === "string") {
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      return false;
    }
  }
  const result = asRecord(parsed);
  const execution = asRecord(result?.execution);
  if (!result || !execution) return false;
  if (result.ok === false) return true;
  const stage = String(execution.stage || "").toLowerCase();
  if (["waiting_sources", "needs_review", "failed"].includes(stage)) return true;
  const planned = Number(execution.actionsPlanned || 0);
  const completed = Number(execution.actionsCompleted || 0);
  if (planned > completed) return true;
  const results = Array.isArray(execution.results) ? execution.results : [];
  return results.some((item) => {
    const action = asRecord(item);
    const actionResult = asRecord(action?.result);
    if (actionResult?.applied) return false;
    if (Array.isArray(actionResult?.publicationResults) && actionResult.publicationResults.length > 0) return false;
    return ["waiting_sources", "needs_review", "failed"].includes(String(actionResult?.stage || "").toLowerCase());
  });
}
