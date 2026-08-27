export type DailyPrintCandidate = {
  adops?: {
    insertionId?: number | string | null;
    competencia?: string | null;
    publicConfirmation?: string | null;
    bannerPublicadoNoSite?: boolean | null;
    mediaUrl?: string | null;
  };
  evidence?: {
    requiredDates?: string[];
    missingDates?: string[];
    invalidDates?: string[];
  };
};

export type DailyPrintCandidateOptions = {
  pendingInsertionIds?: Array<number | string>;
  competencia?: string | null;
};

export function selectDailyPrintCandidates<T extends DailyPrintCandidate>(
  items: T[],
  targetDate: string,
  options?: DailyPrintCandidateOptions,
): T[];

export function summarizeDailyPrintCandidates(
  candidates: DailyPrintCandidate[],
  targetDate: string,
): {
  totalEligible: number;
  ok: number;
  missing: number;
  invalid: number;
};
