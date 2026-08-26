const SAME_DAY_RECOVERY_CRONS = new Set([
  "30 22 * * *",
  "0 23 * * *",
  "30 23 * * *",
  "0 0 * * *",
  "30 0 * * *",
  "0 1 * * *",
  "30 1 * * *",
]);

const MORNING_RECOVERY_CRON = "0 12 * * *";

function dateInCuiaba(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildDailyPrintRecoveryWindow(cron: string, scheduledTime: number) {
  if (SAME_DAY_RECOVERY_CRONS.has(cron)) {
    const date = dateInCuiaba(new Date(scheduledTime));
    return { date, window: cron.replaceAll(" ", "_"), mode: "same_day_retry" as const };
  }
  if (cron === MORNING_RECOVERY_CRON) {
    const date = dateInCuiaba(new Date(scheduledTime - 12 * 60 * 60_000));
    return { date, window: "next_day_0800", mode: "late_publication_recovery" as const };
  }
  return null;
}
