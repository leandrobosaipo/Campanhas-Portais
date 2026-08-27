export function classifyDailyReconciliationOperation(item = {}) {
  const sourceStatus = String(item.status ?? "");
  const blockers = Array.isArray(item.blockingIssues) ? item.blockingIssues.filter((value) => typeof value === "string" && value.trim()) : [];
  const insertionId = Number(item.adops?.insertionId ?? 0);
  const hasMedia = typeof item.adops?.mediaUrl === "string" && item.adops.mediaUrl.trim().length > 0;
  const reportedPublished = item.adops?.bannerPublicadoNoSite === true;
  const publicConfirmed = item.adops?.publicConfirmation === "confirmed";

  if (sourceStatus === "needs_create_in_adops") return { status: "missing_in_adops", reason: "linha_da_planilha_sem_insercao_canonica" };
  if (blockers.length > 0 || ["source_conflict", "drive_missing", "ambiguous_drive_match", "divergent_period", "divergent_format", "blocked"].includes(sourceStatus)) {
    return { status: "blocked", reason: blockers[0] ?? sourceStatus };
  }
  if (publicConfirmed && insertionId > 0) return { status: "public_confirmed", reason: "adrotate_e_html_publico_confirmados" };
  if (reportedPublished && insertionId > 0) return { status: "reported_published", reason: "adops_reporta_publicado_sem_confirmacao_publica" };
  if (insertionId > 0 && hasMedia) return { status: "ready_for_publication", reason: "insercao_e_midia_prontas_para_preflight" };
  return { status: "draft", reason: sourceStatus === "needs_media" ? "insercao_sem_midia_canonica" : "insercao_ainda_nao_publicada" };
}

export function buildDailyReconciliationJobs(date, syncJobId) {
  return {
    sync: {
      id: syncJobId,
      kind: "sync-planilha",
      payload: { targetDate: date, source: "cloudflare-cron-daily-reconciliation", idempotencyKey: `daily-sheet-sync:${date}` },
    },
    reconcile: {
      kind: "campaign-publication-reconcile",
      payload: {
        targetDate: date,
        source: "cloudflare-cron-campaign-publication-reconcile",
        idempotencyKey: `campaign-publication-reconcile:${date}`,
        dependsOnJobId: syncJobId,
      },
    },
  };
}

function uniqueDates(values = []) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")))];
}

export function classifyDailyPrintOutcome(input) {
  const audit = input.audit;
  const expectedTotal = Number.isInteger(input.expectedTotal) ? input.expectedTotal : null;
  const exactScope = expectedTotal == null || audit?.totalEligible === expectedTotal;
  const complete = Boolean(audit && exactScope && audit.totalEligible > 0 && audit.ok === audit.totalEligible && audit.missing === 0 && audit.invalid === 0);
  if (complete) return { status: input.transportError ? "recovered" : "completed", incident: null };
  const affectedDates = uniqueDates([...(audit?.missingDates ?? []), ...(audit?.invalidDates ?? []), audit?.date]);
  const layer = String(input.transportError ?? "").includes("checklist_pre_upload_failed")
    ? "api_checklist_contract"
    : input.transportError ? "api_or_runner_transport" : "audit";
  return {
    status: "incident_required",
    incident: {
      fingerprint: ["daily-print", input.jobId, input.childJobId ?? "none", audit?.date ?? "unknown", layer].join(":"),
      layer,
      affectedDates,
      summary: input.transportError
        ? "O lote diário não confirmou a resposta da API e a auditoria permaneceu incompleta."
        : "O lote diário terminou, mas a auditoria ainda possui evidências pendentes ou inválidas.",
    },
  };
}
