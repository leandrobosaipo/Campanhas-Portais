const SAME_DAY_RECOVERY_TIMES = new Set(["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"]);

function dateInCuiaba(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildDailyPrintRecoveryWindow(cron: string, scheduledTime: number) {
  const scheduled = new Date(scheduledTime);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(scheduled);
  if (SAME_DAY_RECOVERY_TIMES.has(time)) {
    const date = dateInCuiaba(scheduled);
    return { date, window: `same_day_${time.replace(":", "")}`, mode: "same_day_retry" as const };
  }
  if (time === "08:00") {
    const date = dateInCuiaba(new Date(scheduledTime - 12 * 60 * 60_000));
    return { date, window: "next_day_0800", mode: "late_publication_recovery" as const };
  }
  return null;
}
