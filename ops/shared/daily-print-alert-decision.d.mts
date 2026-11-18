export type DailyPrintAlertDecision = {
  due: boolean;
  localTime: string | null;
  escalation: boolean;
  targetDate: string;
  timezone: "America/Cuiaba";
};

export function resolveDailyPrintAlertDecision(
  now?: Date,
  catchUpMinutes?: number,
): DailyPrintAlertDecision;
