export type DailyPrintAudit = {
  date: string;
  totalEligible: number;
  ok: number;
  missing: number;
  invalid: number;
  missingDates?: string[];
  invalidDates?: string[];
};

export type DailyPrintOutcomeInput = {
  jobId: string;
  childJobId: string | null;
  audit: DailyPrintAudit | null;
  transportError?: string | null;
};

export type DailyPrintIncident = {
  fingerprint: string;
  layer: "api_or_runner_transport" | "audit";
  affectedDates: string[];
  summary: string;
};

export type DailyReconciliationStatus = "missing_in_adops" | "draft" | "ready_for_publication" | "reported_published" | "public_confirmed" | "blocked";

export type DailyReconciliationOperation = {
  status?: unknown;
  piCodigo?: unknown;
  siteSigla?: unknown;
  campaignName?: unknown;
  blockingIssues?: unknown;
  adops?: {
    campaignId?: unknown;
    insertionId?: unknown;
    mediaUrl?: unknown;
    bannerPublicadoNoSite?: unknown;
    publicConfirmation?: unknown;
  } | null;
};

export function buildDailyReconciliationJobs(date: string, syncJobId: string) {
  return {
    sync: {
      id: syncJobId,
      kind: "sync-planilha" as const,
      payload: { targetDate: date, source: "cloudflare-cron-daily-reconciliation", idempotencyKey: `daily-sheet-sync:${date}` },
    },
    reconcile: {
      kind: "campaign-publication-reconcile" as const,
      payload: {
        targetDate: date,
        source: "cloudflare-cron-campaign-publication-reconcile",
        mode: "apply",
        idempotencyKey: `campaign-publication-reconcile:${date}`,
        dependsOnJobId: syncJobId,
      },
    },
  };
}
