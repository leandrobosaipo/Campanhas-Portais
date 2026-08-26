const COD5_SCHEDULER_TIMEZONE = "America/Cuiaba" as const;

type SchedulerRoutine = {
  routineKind: "daily-print" | "daily-print-recovery" | "daily-print-morning-recovery" | "daily-print-escalation" | "evidence-monthly-report";
  jobKind: "print-batch" | "evidence-monthly-report" | null;
  dispatchWindow: string;
  targetDate: "today" | "yesterday";
  maxAttempts: number;
};

const COD5_SCHEDULER_ROUTINES: readonly SchedulerRoutine[] = [
  { routineKind: "daily-print-morning-recovery", jobKind: "print-batch", dispatchWindow: "08:00", targetDate: "yesterday", maxAttempts: 1 },
  { routineKind: "daily-print-escalation", jobKind: null, dispatchWindow: "08:30", targetDate: "yesterday", maxAttempts: 1 },
  { routineKind: "daily-print", jobKind: "print-batch", dispatchWindow: "18:00", targetDate: "today", maxAttempts: 8 },
  ...["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"].map((dispatchWindow) => ({
    routineKind: "daily-print-recovery" as const,
    jobKind: "print-batch" as const,
    dispatchWindow,
    targetDate: "today" as const,
    maxAttempts: 8,
  })),
  { routineKind: "evidence-monthly-report", jobKind: "evidence-monthly-report", dispatchWindow: "22:15", targetDate: "today", maxAttempts: 1 },
];

export type CanonicalScheduleDecision = {
  routineKind: SchedulerRoutine["routineKind"];
  jobKind: SchedulerRoutine["jobKind"];
  targetDate: string;
  timezone: typeof COD5_SCHEDULER_TIMEZONE;
  scheduledFor: string;
  dispatchWindow: string;
  due: boolean;
  maxAttempts: number;
  nextRecoveryAt: string | null;
};

export type ScheduledJobInput = CanonicalScheduleDecision & {
  scheduleId: string;
  rootIdempotencyKey: string;
  idempotencyKey: string;
  parentJobId: null;
  attempt: 1;
};

export type ScheduleReconcileResult = {
  outcome: "created" | "duplicate" | "not_due" | "blocked";
  scheduleId: string;
  idempotencyKey: string;
  jobId: string | null;
  nextRecoveryAt: string | null;
};

const cod5_date_formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COD5_SCHEDULER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const cod5_datetime_formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COD5_SCHEDULER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function previousDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function localDateTime(date: Date) {
  return cod5_datetime_formatter.format(date).replace(", ", "T");
}

function localScheduleToUtc(targetDate: string, dispatchWindow: string) {
  const [year, month, day] = targetDate.split("-").map(Number);
  const [hour, minute] = dispatchWindow.split(":").map(Number);
  const approximate = Date.UTC(year, month - 1, day, hour, minute);
  const expected = `${targetDate}T${dispatchWindow}`;

  for (let offsetMinutes = -12 * 60; offsetMinutes <= 12 * 60; offsetMinutes += 15) {
    const candidate = new Date(approximate + offsetMinutes * 60_000);
    if (localDateTime(candidate) === expected) return candidate;
  }
  throw new Error(`Janela inválida para ${COD5_SCHEDULER_TIMEZONE}: ${expected}`);
}

export function buildScheduleId(routineKind: string, targetDate: string, dispatchWindow: string) {
  return `${routineKind}:${targetDate}:${dispatchWindow}`;
}

export function buildRootIdempotencyKey(routineKind: string, targetDate: string, dispatchWindow: string) {
  return buildScheduleId(routineKind, targetDate, dispatchWindow);
}

export function serializeOptionalCount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

export function validateDryRunNow(dryRun: boolean, value: unknown) {
  if (!dryRun || typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function reconcileDueSchedules(
  decisions: readonly CanonicalScheduleDecision[],
  createIfAbsent: (input: ScheduledJobInput) => Promise<{ jobId: string; created: boolean }>,
) {
  const results: ScheduleReconcileResult[] = [];
  for (const decision of decisions) {
    const scheduleId = buildScheduleId(decision.routineKind, decision.targetDate, decision.dispatchWindow);
    const idempotencyKey = buildRootIdempotencyKey(decision.routineKind, decision.targetDate, decision.dispatchWindow);
    if (!decision.due) {
      results.push({ outcome: "not_due", scheduleId, idempotencyKey, jobId: null, nextRecoveryAt: decision.nextRecoveryAt });
      continue;
    }
    if (!decision.jobKind) {
      results.push({ outcome: "blocked", scheduleId, idempotencyKey, jobId: null, nextRecoveryAt: decision.nextRecoveryAt });
      continue;
    }
    const created = await createIfAbsent({
      ...decision,
      scheduleId,
      rootIdempotencyKey: idempotencyKey,
      idempotencyKey,
      parentJobId: null,
      attempt: 1,
    });
    results.push({
      outcome: created.created ? "created" : "duplicate",
      scheduleId,
      idempotencyKey,
      jobId: created.jobId,
      nextRecoveryAt: decision.nextRecoveryAt,
    });
  }
  return results;
}

export function resolveCanonicalSchedule(now: Date): CanonicalScheduleDecision[] {
  const today = cod5_date_formatter.format(now);
  const yesterday = previousDate(today);
  const currentLocalMinute = localDateTime(now);
  const scheduled = COD5_SCHEDULER_ROUTINES.map((routine) => {
    const targetDate = routine.targetDate === "yesterday" ? yesterday : today;
    const scheduleDate = routine.targetDate === "yesterday" ? today : targetDate;
    const scheduledFor = localScheduleToUtc(scheduleDate, routine.dispatchWindow);
    return {
      routineKind: routine.routineKind,
      jobKind: routine.jobKind,
      targetDate,
      timezone: COD5_SCHEDULER_TIMEZONE,
      scheduledFor: scheduledFor.toISOString(),
      dispatchWindow: routine.dispatchWindow,
      due: currentLocalMinute === `${scheduleDate}T${routine.dispatchWindow}`,
      maxAttempts: routine.maxAttempts,
      nextRecoveryAt: null,
    } satisfies CanonicalScheduleDecision;
  });

  return scheduled.map((decision, index) => {
    if (decision.routineKind !== "daily-print" && decision.routineKind !== "daily-print-recovery") return decision;
    const next = scheduled.slice(index + 1).find((candidate) => candidate.routineKind === "daily-print-recovery");
    return { ...decision, nextRecoveryAt: next?.scheduledFor ?? null };
  });
}
