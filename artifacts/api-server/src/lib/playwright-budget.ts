import { pool } from "@workspace/db";

type PoolClient = {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

const LOCK_NAMESPACE = "cod5-adops-playwright";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const concurrency = positiveInteger(process.env.ADOPS_PLAYWRIGHT_CONCURRENCY, 1);
const queueTimeoutMs = positiveInteger(process.env.ADOPS_PLAYWRIGHT_QUEUE_TIMEOUT_MS, 2 * 60 * 60_000);
const pollMinMs = positiveInteger(process.env.ADOPS_PLAYWRIGHT_LOCK_POLL_MIN_MS, 200);
const pollMaxMs = Math.max(pollMinMs, positiveInteger(process.env.ADOPS_PLAYWRIGHT_LOCK_POLL_MAX_MS, 1_000));

type LocalWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type BudgetCounters = {
  completed: number;
  failed: number;
  timedOut: number;
  totalDurationMs: number;
  totalQueueWaitMs: number;
};

let localActive = 0;
let globalWaiting = 0;
let active = 0;
let draining = false;
const localQueue: LocalWaiter[] = [];
const idleWaiters = new Set<() => void>();
const counters: BudgetCounters = {
  completed: 0,
  failed: 0,
  timedOut: 0,
  totalDurationMs: 0,
  totalQueueWaitMs: 0,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs() {
  return Math.round(pollMinMs + Math.random() * (pollMaxMs - pollMinMs));
}

function notifyIdle() {
  if (localActive !== 0 || localQueue.length !== 0 || globalWaiting !== 0 || active !== 0) return;
  for (const resolve of idleWaiters) resolve();
  idleWaiters.clear();
}

function releaseLocal() {
  localActive = Math.max(0, localActive - 1);
  while (!draining && localActive < concurrency && localQueue.length > 0) {
    const waiter = localQueue.shift();
    if (!waiter) break;
    clearTimeout(waiter.timer);
    localActive += 1;
    waiter.resolve();
  }
  notifyIdle();
}

async function acquireLocal(): Promise<() => void> {
  if (draining) throw new Error("playwright_budget_draining");
  if (localActive < concurrency && localQueue.length === 0) {
    localActive += 1;
    return releaseLocal;
  }

  await new Promise<void>((resolve, reject) => {
    const waiter: LocalWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = localQueue.indexOf(waiter);
        if (index >= 0) localQueue.splice(index, 1);
        const error = new Error("playwright_queue_timeout");
        error.name = "PlaywrightQueueTimeoutError";
        reject(error);
        notifyIdle();
      }, queueTimeoutMs),
    };
    localQueue.push(waiter);
  });
  return releaseLocal;
}

async function acquireGlobal(deadline: number): Promise<{ client: PoolClient; slot: number }> {
  globalWaiting += 1;
  try {
    while (!draining && Date.now() < deadline) {
      for (let slot = 0; slot < concurrency; slot += 1) {
        const client = await pool.connect() as PoolClient;
        try {
          const result = await client.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock(hashtext($1), $2) AS acquired",
            [LOCK_NAMESPACE, slot],
          );
          if (result.rows[0]?.acquired) return { client, slot };
        } catch (error) {
          client.release();
          throw error;
        }
        client.release();
      }
      await sleep(jitterMs());
    }
    const error = new Error(draining ? "playwright_budget_draining" : "playwright_queue_timeout");
    error.name = draining ? "PlaywrightBudgetDrainingError" : "PlaywrightQueueTimeoutError";
    throw error;
  } finally {
    globalWaiting = Math.max(0, globalWaiting - 1);
    notifyIdle();
  }
}

async function releaseGlobal(client: PoolClient, slot: number) {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1), $2)", [LOCK_NAMESPACE, slot]);
  } finally {
    client.release();
  }
}

function isTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = String((error as Error & { code?: string }).code ?? "");
  return error.name.includes("Timeout") || code.includes("TIMEOUT") || /timeout/i.test(error.message);
}

export async function withPlaywrightPermit<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const queuedAt = Date.now();
  let release: (() => void) | null = null;
  let globalLock: { client: PoolClient; slot: number } | null = null;
  let startedAt = 0;
  try {
    release = await acquireLocal();
    globalLock = await acquireGlobal(queuedAt + queueTimeoutMs);
    counters.totalQueueWaitMs += Date.now() - queuedAt;
    active += 1;
    startedAt = Date.now();
    const result = await operation();
    counters.completed += 1;
    return result;
  } catch (error) {
    counters.failed += 1;
    if (isTimeout(error)) counters.timedOut += 1;
    if (error instanceof Error && !error.message.includes(label)) {
      error.message = `${label}: ${error.message}`;
    }
    throw error;
  } finally {
    if (startedAt > 0) counters.totalDurationMs += Date.now() - startedAt;
    if (startedAt > 0) active = Math.max(0, active - 1);
    if (globalLock) await releaseGlobal(globalLock.client, globalLock.slot).catch(() => undefined);
    release?.();
    notifyIdle();
  }
}

export function getPlaywrightBudgetSnapshot() {
  const finished = counters.completed + counters.failed;
  return {
    limit: concurrency,
    queued: localQueue.length + globalWaiting,
    active,
    draining,
    queueTimeoutMs,
    sinceProcessStart: {
      ...counters,
      averageDurationMs: finished > 0 ? Math.round(counters.totalDurationMs / finished) : 0,
      averageQueueWaitMs: finished > 0 ? Math.round(counters.totalQueueWaitMs / finished) : 0,
    },
  };
}

export function beginPlaywrightDrain() {
  draining = true;
  const error = new Error("playwright_budget_draining");
  error.name = "PlaywrightBudgetDrainingError";
  for (const waiter of localQueue.splice(0)) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  notifyIdle();
}

export async function waitForPlaywrightIdle(timeoutMs: number) {
  if (localActive === 0 && localQueue.length === 0 && globalWaiting === 0 && active === 0) return true;
  return new Promise<boolean>((resolve) => {
    const onIdle = () => {
      clearTimeout(timer);
      idleWaiters.delete(onIdle);
      resolve(true);
    };
    const timer = setTimeout(() => {
      idleWaiters.delete(onIdle);
      resolve(false);
    }, timeoutMs);
    idleWaiters.add(onIdle);
  });
}
