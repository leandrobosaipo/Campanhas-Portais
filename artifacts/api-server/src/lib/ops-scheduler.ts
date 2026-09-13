const COD5_SCHEDULER_TIMEZONE = "America/Cuiaba" as const;

type SchedulerRoutine = {
  routineKind: "campaign-publication-reconcile" | "daily-print" | "daily-print-recovery" | "daily-print-morning-recovery" | "daily-print-escalation" | "evidence-monthly-report" | "nightly-retroactive-backfill";
  jobKind: "campaign-publication-reconcile" | "print-batch" | "print-backfill" | "evidence-monthly-report" | null;
  dispatchWindow: string;
  targetDate: "today" | "yesterday";
  maxAttempts: number;
};

const COD5_SCHEDULER_ROUTINES: readonly SchedulerRoutine[] = [
  { routineKind: "daily-print-morning-recovery", jobKind: "print-batch", dispatchWindow: "08:00", targetDate: "yesterday", maxAttempts: 1 },
  { routineKind: "daily-print-escalation", jobKind: null, dispatchWindow: "08:30", targetDate: "yesterday", maxAttempts: 1 },
  { routineKind: "campaign-publication-reconcile", jobKind: "campaign-publication-reconcile", dispatchWindow: "17:30", targetDate: "today", maxAttempts: 1 },
  { routineKind: "daily-print", jobKind: "print-batch", dispatchWindow: "18:00", targetDate: "today", maxAttempts: 8 },
  ...["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"].map((dispatchWindow) => ({
    routineKind: "daily-print-recovery" as const,
    jobKind: "print-batch" as const,
    dispatchWindow,
    targetDate: "today" as const,
    maxAttempts: 8,
  })),
  { routineKind: "evidence-monthly-report", jobKind: "evidence-monthly-report", dispatchWindow: "22:15", targetDate: "today", maxAttempts: 1 },
  { routineKind: "nightly-retroactive-backfill", jobKind: "print-backfill", dispatchWindow: "23:00", targetDate: "today", maxAttempts: 3 },
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

const COD5_RETRYABLE_ERROR_CODES = new Set(["expired", "runner_interrupted", "external_transient"]);

export function buildRetryJobInput(input: {
  parentJobId: string;
  jobKind: string;
  payload: Record<string, unknown>;
  failedAt: string;
  errorCode: string;
}) {
  const rootIdempotencyKey = typeof input.payload.rootIdempotencyKey === "string" ? input.payload.rootIdempotencyKey : null;
  const attempt = Number(input.payload.attempt);
  const maxAttempts = Number(input.payload.maxAttempts);
  if (!rootIdempotencyKey || !Number.isInteger(attempt) || !Number.isInteger(maxAttempts)) return null;
  if (attempt < 1 || maxAttempts < 1 || attempt >= maxAttempts) return null;
  if (!COD5_RETRYABLE_ERROR_CODES.has(input.errorCode)) return null;

  const nextAttempt = attempt + 1;
  const { idempotencyKey: _previousIdempotencyKey, parentJobId: _previousParentJobId, ...previousPayload } = input.payload;
  return {
    jobKind: input.jobKind,
    idempotencyKey: `${rootIdempotencyKey}:attempt:${nextAttempt}`,
    payload: {
      ...previousPayload,
      parentJobId: input.parentJobId,
      attempt: nextAttempt,
      maxAttempts,
      recoveryReason: input.errorCode,
      previousFailedAt: input.failedAt,
    },
  };
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

type DailyAuditCounts = {
  expectedTotal?: unknown;
  totalEligible?: unknown;
  ok?: unknown;
  missing?: unknown;
  invalid?: unknown;
};

type RecoveryAuditGateCacheEntry = { complete: boolean; checkedAt: number };

export async function suppressCompletedPrintRecoveries(
  decisions: readonly CanonicalScheduleDecision[],
  readAudit: (targetDate: string) => Promise<DailyAuditCounts>,
  windowCache = new Map<string, RecoveryAuditGateCacheEntry>(),
  nowMs = Date.now(),
) {
  return Promise.all(decisions.map(async (decision) => {
    if (!decision.due || !["daily-print-recovery", "daily-print-morning-recovery"].includes(decision.routineKind)) {
      return decision;
    }
    const scheduleId = buildScheduleId(decision.routineKind, decision.targetDate, decision.dispatchWindow);
    const cached = windowCache.get(scheduleId);
    const morningRecheckUntil = Date.parse(decision.scheduledFor) + 30 * 60_000;
    const cacheTtlMs = decision.routineKind === "daily-print-morning-recovery" && nowMs <= morningRecheckUntil
      ? 5 * 60_000
      : Number.POSITIVE_INFINITY;
    let complete = cached && nowMs - cached.checkedAt < cacheTtlMs ? cached.complete : undefined;
    if (complete === undefined) {
      try {
        const audit = await readAudit(decision.targetDate);
        const expectedTotal = Number(audit.expectedTotal);
        const totalEligible = Number(audit.totalEligible);
        const approved = Number(audit.ok);
        const missing = Number(audit.missing);
        const invalid = Number(audit.invalid);
        complete = Number.isInteger(expectedTotal)
          && expectedTotal > 0
          && totalEligible === expectedTotal
          && approved === totalEligible
          && missing === 0
          && invalid === 0;
      } catch {
        complete = false;
      }
      // ponytail: process-local window cache; move to persisted schedule state only if the API gains multiple replicas.
      if (windowCache.size >= 100) windowCache.delete(windowCache.keys().next().value as string);
      windowCache.set(scheduleId, { complete, checkedAt: nowMs });
    }
    return complete ? { ...decision, due: false, nextRecoveryAt: null } : decision;
  }));
}

export function resolveCanonicalSchedule(now: Date): CanonicalScheduleDecision[] {
  const today = cod5_date_formatter.format(now);
  const yesterday = previousDate(today);
  const routines = localDateTime(now).slice(11, 16) <= "08:00"
    ? [{ routineKind: "evidence-monthly-report" as const, jobKind: "evidence-monthly-report" as const, dispatchWindow: "22:15", targetDate: "yesterday" as const, maxAttempts: 1 }, ...COD5_SCHEDULER_ROUTINES]
    : COD5_SCHEDULER_ROUTINES;
  const scheduled = routines.map((routine, routineIndex) => {
    const targetDate = routine.targetDate === "yesterday" ? yesterday : today;
    const previousDayReport = routineIndex === 0 && routines.length > COD5_SCHEDULER_ROUTINES.length;
    const scheduleDate = previousDayReport ? yesterday : routine.targetDate === "yesterday" ? today : targetDate;
    const scheduledFor = localScheduleToUtc(scheduleDate, routine.dispatchWindow);
    return {
      routineKind: routine.routineKind,
      jobKind: routine.jobKind,
      targetDate,
      timezone: COD5_SCHEDULER_TIMEZONE,
      scheduledFor: scheduledFor.toISOString(),
      dispatchWindow: routine.dispatchWindow,
      due: false,
      maxAttempts: routine.maxAttempts,
      nextRecoveryAt: null,
    } satisfies CanonicalScheduleDecision;
  });

  const activeJobIndexes = new Map<string, number>();
  scheduled.forEach((decision, index) => {
    if (!decision.jobKind || Date.parse(decision.scheduledFor) > now.getTime()) return;
    const family = decision.jobKind === "print-batch" ? "evidence" : decision.jobKind;
    activeJobIndexes.set(family, index);
  });
  const activeSignalIndex = scheduled.reduce((latest, decision, index) => (
    !decision.jobKind && Date.parse(decision.scheduledFor) <= now.getTime() ? index : latest
  ), -1);

  return scheduled.map((rawDecision, index) => {
    const decision = {
      ...rawDecision,
      due: [...activeJobIndexes.values()].includes(index)
        || (activeSignalIndex > Math.max(-1, ...activeJobIndexes.values()) && index === activeSignalIndex),
    };
    if (decision.routineKind !== "daily-print" && decision.routineKind !== "daily-print-recovery") return decision;
    const next = scheduled.slice(index + 1).find((candidate) => candidate.routineKind === "daily-print-recovery");
    return { ...decision, nextRecoveryAt: next?.scheduledFor ?? null };
  });
}

export function buildSchedulerReadback(now: Date, provider: string) {
  const decisions = resolveCanonicalSchedule(now);
  const nextDecision = decisions.find((decision) => Date.parse(decision.scheduledFor) >= now.getTime()) ?? null;
  return {
    provider: provider || null,
    timezone: COD5_SCHEDULER_TIMEZONE,
    evaluatedAt: now.toISOString(),
    nextDecision,
    decisions,
  };
}
