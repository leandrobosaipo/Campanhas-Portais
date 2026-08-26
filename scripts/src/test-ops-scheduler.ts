import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRootIdempotencyKey,
  buildRetryJobInput,
  buildSchedulerReadback,
  buildScheduleId,
  reconcileDueSchedules,
  resolveCanonicalSchedule,
  serializeOptionalCount,
  validateDryRunNow,
} from "../../artifacts/api-server/src/lib/ops-scheduler";
import { resolveDailyPrintAlertDecision } from "../../ops/shared/daily-print-alert-decision.mjs";
import { buildCloudflareSchedulerAction, shouldProxyOpsToMacMini } from "../../ops/cloudflare-public-api/src/scheduler-shadow";

test("resolve o lote das 18h de Cuiaba a partir de UTC", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T22:00:00.000Z"));
  const dailyPrint = decisions.find((decision) => decision.routineKind === "daily-print");

  assert.deepEqual(dailyPrint, {
    routineKind: "daily-print",
    jobKind: "print-batch",
    targetDate: "2026-08-26",
    timezone: "America/Cuiaba",
    scheduledFor: "2026-08-26T22:00:00.000Z",
    dispatchWindow: "18:00",
    due: true,
    maxAttempts: 8,
    nextRecoveryAt: "2026-08-26T22:30:00.000Z",
  });
});

test("resolve a reconciliacao editorial das 17h30 no Mac Mini", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T21:30:00.000Z"));
  const reconcile = decisions.find((decision) => decision.routineKind === "campaign-publication-reconcile");

  assert.equal(reconcile?.jobKind, "campaign-publication-reconcile");
  assert.equal(reconcile?.dispatchWindow, "17:30");
  assert.equal(reconcile?.targetDate, "2026-08-26");
  assert.equal(reconcile?.due, true);
});

test("resolve a recuperacao das 08h para o dia anterior em Cuiaba", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-27T12:00:00.000Z"));
  const recovery = decisions.find((decision) => decision.routineKind === "daily-print-morning-recovery");

  assert.equal(recovery?.targetDate, "2026-08-26");
  assert.equal(recovery?.dispatchWindow, "08:00");
  assert.equal(recovery?.scheduledFor, "2026-08-27T12:00:00.000Z");
  assert.equal(recovery?.due, true);
});

test("nao considera uma janela futura como devida", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T21:59:00.000Z"));
  const dailyPrint = decisions.find((decision) => decision.routineKind === "daily-print");

  assert.equal(dailyPrint?.targetDate, "2026-08-26");
  assert.equal(dailyPrint?.due, false);
  assert.equal(dailyPrint?.scheduledFor, "2026-08-26T22:00:00.000Z");
});

test("recupera a ultima janela perdida sem criar todos os lotes anteriores", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T23:37:00.000Z"));
  const duePrints = decisions.filter((decision) => decision.due && ["daily-print", "daily-print-recovery"].includes(decision.routineKind));
  assert.deepEqual(duePrints.map((decision) => decision.dispatchWindow), ["19:30"]);
});

test("payload matinal usa ontem e caminho de reconstrução auditada", () => {
  const decision = resolveCanonicalSchedule(new Date("2026-08-27T12:04:00.000Z"))
    .find((item) => item.routineKind === "daily-print-morning-recovery");
  assert.equal(decision?.due, true);
  assert.equal(decision?.targetDate, "2026-08-26");
});

test("escalonamento das 08h30 não suprime a recuperação matinal", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-27T12:30:00.000Z"));
  assert.equal(decisions.find((item) => item.routineKind === "daily-print-morning-recovery")?.due, true);
  assert.equal(decisions.find((item) => item.routineKind === "daily-print-escalation")?.due, true);
});

test("relatório perdido antes da meia-noite continua recuperável até 08h", () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-27T05:00:00.000Z"));
  const due = decisions.filter((item) => item.due && item.routineKind === "evidence-monthly-report");
  assert.equal(due.length, 1);
  assert.equal(due[0]?.targetDate, "2026-08-26");
  assert.equal(due[0]?.scheduledFor, "2026-08-27T02:15:00.000Z");
});

test("catch-up preserva relatório e recuperação como famílias independentes", () => {
  const late = resolveCanonicalSchedule(new Date("2026-08-27T02:16:00.000Z"));
  assert.equal(late.find((item) => item.routineKind === "daily-print-recovery" && item.dispatchWindow === "21:30")?.due, true);
  assert.equal(late.find((item) => item.routineKind === "evidence-monthly-report")?.due, true);

  const morning = resolveCanonicalSchedule(new Date("2026-08-27T12:00:00.000Z"));
  assert.equal(morning.find((item) => item.routineKind === "daily-print-morning-recovery")?.due, true);
  assert.equal(morning.find((item) => item.routineKind === "evidence-monthly-report" && item.targetDate === "2026-08-26")?.due, true);
});

test("gera identificadores estaveis por rotina data e janela", () => {
  assert.equal(buildScheduleId("daily-print", "2026-08-26", "18:00"), "daily-print:2026-08-26:18:00");
  assert.equal(buildRootIdempotencyKey("daily-print", "2026-08-26", "18:00"), "daily-print:2026-08-26:18:00");
});

test("preserva ausencia de contagem como null", () => {
  assert.equal(serializeOptionalCount(undefined), null);
  assert.equal(serializeOptionalCount(null), null);
  assert.equal(serializeOptionalCount(0), 0);
  assert.equal(serializeOptionalCount("3"), 3);
});

test("API canônica decide a janela de alerta Telegram", () => {
  assert.deepEqual(resolveDailyPrintAlertDecision(new Date("2026-08-27T12:30:00.000Z")), {
    due: true,
    localTime: "08:30",
    escalation: true,
    targetDate: "2026-08-26",
    timezone: "America/Cuiaba",
  });
  assert.equal(resolveDailyPrintAlertDecision(new Date("2026-08-27T12:35:00.000Z")).due, false);
});

test("readback identifica o control plane e a proxima decisao canonica", () => {
  const readback = buildSchedulerReadback(new Date("2026-08-26T21:29:00.000Z"), "macmini");
  assert.equal(readback.provider, "macmini");
  assert.equal(readback.timezone, "America/Cuiaba");
  assert.equal(readback.nextDecision?.routineKind, "campaign-publication-reconcile");
  assert.equal(readback.nextDecision?.scheduledFor, "2026-08-26T21:30:00.000Z");
});

test("duas reconciliacoes concorrentes retornam o mesmo job", async () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T22:00:00.000Z"));
  const jobs = new Map<string, string>();
  let sequence = 0;
  const createIfAbsent = async (input: { idempotencyKey: string }) => {
    await new Promise((resolve) => setImmediate(resolve));
    const existing = jobs.get(input.idempotencyKey);
    if (existing) return { jobId: existing, created: false };
    const jobId = `job-${++sequence}`;
    jobs.set(input.idempotencyKey, jobId);
    return { jobId, created: true };
  };

  const [first, second] = await Promise.all([
    reconcileDueSchedules(decisions, createIfAbsent),
    reconcileDueSchedules(decisions, createIfAbsent),
  ]);
  const firstDaily = first.find((decision) => decision.scheduleId === "daily-print:2026-08-26:18:00");
  const secondDaily = second.find((decision) => decision.scheduleId === "daily-print:2026-08-26:18:00");

  assert.equal(jobs.size, 2);
  assert.equal(firstDaily?.jobId, secondDaily?.jobId);
  assert.deepEqual(new Set([firstDaily?.outcome, secondDaily?.outcome]), new Set(["created", "duplicate"]));
});

test("reconciliacao recupera somente a janela ativa", async () => {
  const decisions = resolveCanonicalSchedule(new Date("2026-08-26T21:59:00.000Z"));
  let creates = 0;
  const result = await reconcileDueSchedules(decisions, async () => {
    creates += 1;
    return { jobId: "unexpected", created: true };
  });

  assert.equal(creates, 2);
  assert.deepEqual(result.filter((decision) => decision.outcome === "created").map((decision) => decision.scheduleId), [
    "daily-print-morning-recovery:2026-08-25:08:00",
    "campaign-publication-reconcile:2026-08-26:17:30",
  ]);
});

test("instante informado pelo caller só é aceito em dry-run", () => {
  assert.equal(validateDryRunNow(false, "2026-08-26T22:00:00.000Z"), null);
  assert.equal(validateDryRunNow(true, "invalid"), undefined);
  assert.equal(validateDryRunNow(true, "2026-08-26T22:00:00.000Z")?.toISOString(), "2026-08-26T22:00:00.000Z");
});

test("expiracao cria filho sem reabrir o job pai", () => {
  const retry = buildRetryJobInput({
    parentJobId: "job-parent",
    jobKind: "print-batch",
    payload: {
      routineKind: "daily-print",
      targetDate: "2026-08-26",
      dispatchWindow: "18:00",
      rootIdempotencyKey: "daily-print:2026-08-26:18:00",
      attempt: 1,
      maxAttempts: 8,
    },
    failedAt: "2026-08-26T23:00:00.000Z",
    errorCode: "expired",
  });

  assert.deepEqual(retry, {
    jobKind: "print-batch",
    idempotencyKey: "daily-print:2026-08-26:18:00:attempt:2",
    payload: {
      routineKind: "daily-print",
      targetDate: "2026-08-26",
      dispatchWindow: "18:00",
      rootIdempotencyKey: "daily-print:2026-08-26:18:00",
      parentJobId: "job-parent",
      attempt: 2,
      maxAttempts: 8,
      recoveryReason: "expired",
      previousFailedAt: "2026-08-26T23:00:00.000Z",
    },
  });
});

test("nao cria retry acima do limite ou para bloqueio de seguranca", () => {
  const base = {
    parentJobId: "job-parent",
    jobKind: "print-batch" as const,
    failedAt: "2026-08-26T23:00:00.000Z",
    errorCode: "expired",
  };
  assert.equal(buildRetryJobInput({ ...base, payload: { rootIdempotencyKey: "root", attempt: 8, maxAttempts: 8 } }), null);
  assert.equal(buildRetryJobInput({ ...base, errorCode: "blocked_security", payload: { rootIdempotencyKey: "root", attempt: 1, maxAttempts: 8 } }), null);
});

test("runner mantém heartbeat do job durante execução longa", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { runWithJobHeartbeat } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  const heartbeats: string[] = [];
  const result = await runWithJobHeartbeat(
    "job-lease",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 24));
      return "completed";
    },
    async (jobId: string) => {
      heartbeats.push(jobId);
    },
    5,
  );

  assert.equal(result, "completed");
  assert.ok(heartbeats.length >= 2);
  assert.deepEqual(new Set(heartbeats), new Set(["job-lease"]));
});

test("runner não conclui job depois de perder o lease", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { runWithJobHeartbeat } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  let calls = 0;
  await assert.rejects(
    runWithJobHeartbeat(
      "job-lost",
      async (assertLease: () => void) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        assertLease();
        return "unexpected";
      },
      async () => {
        calls += 1;
        if (calls > 1) throw new Error("lease_lost");
      },
      5,
    ),
    /lease_lost/,
  );
});

test("runner expira lease local após heartbeat sem resposta", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { runWithJobHeartbeat } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  let calls = 0;
  await assert.rejects(runWithJobHeartbeat(
    "job-network-partition",
    async (assertLease: () => void) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      assertLease();
    },
    async () => {
      calls += 1;
      if (calls > 1) throw new Error("network_unavailable");
    },
    5,
    12,
  ), /network_unavailable/);
});

test("runner expira lease mesmo com fetch de heartbeat pendurado", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { runWithJobHeartbeat } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  let calls = 0;
  await assert.rejects(runWithJobHeartbeat(
    "job-hanging-heartbeat",
    async (assertLease: () => void) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      assertLease();
    },
    async () => {
      calls += 1;
      if (calls > 1) await new Promise(() => undefined);
    },
    5,
    12,
  ), /lease_timeout/);
});

test("trigger do Mac Mini apenas pede reconciliacao para a API", async () => {
  process.env.ADOPS_RUNNER_TEST_MODE = "1";
  // @ts-expect-error runner de produção é um módulo JavaScript sem declarations.
  const { isAutomaticCampaignReconcileSource, runSchedulerTrigger } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");
  const calls: Array<{ path: string; body: unknown }> = [];
  const result = await runSchedulerTrigger("macmini", async (path: string, body: unknown) => {
    calls.push({ path, body });
    return { ok: true, decisions: [] };
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(calls, [{ path: "/api/ops/schedules/reconcile", body: {} }]);
  assert.equal(await runSchedulerTrigger("disabled", async () => ({ ok: false })), null);
  assert.equal(isAutomaticCampaignReconcileSource("macmini-canonical-scheduler"), true);
  assert.equal(isAutomaticCampaignReconcileSource("manual-operator"), false);
});

test("Cloudflare em modo Mac Mini observa sem escrever no D1", () => {
  assert.deepEqual(buildCloudflareSchedulerAction("macmini", 1787763600000), {
    mode: "shadow",
    writeD1: false,
    path: "/api/ops/schedules/reconcile",
    body: { shadow: true, dryRun: true, now: "2026-08-26T17:00:00.000Z" },
  });
  assert.deepEqual(buildCloudflareSchedulerAction("cloudflare", 1787763600000), {
    mode: "legacy",
    writeD1: true,
    path: null,
    body: null,
  });
});

test("Worker encaminha todo contrato ops para o control plane Mac Mini", () => {
  assert.equal(shouldProxyOpsToMacMini("macmini", "/api/ops/jobs/print-batch"), true);
  assert.equal(shouldProxyOpsToMacMini("macmini", "/api/ops/queue/overview"), true);
  assert.equal(shouldProxyOpsToMacMini("cloudflare", "/api/ops/jobs/print-batch"), false);
  assert.equal(shouldProxyOpsToMacMini("macmini", "/api/insertions/2713"), false);
});
