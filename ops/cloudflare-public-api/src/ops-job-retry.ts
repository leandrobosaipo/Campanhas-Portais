export function shouldRetryFailedOpsJob(status: string, retryFailed: boolean): boolean {
  return retryFailed && status === "failed";
}

export function nextOperationalAttempt(value: unknown): number {
  return Math.max(1, Number(value) || 1) + 1;
}
