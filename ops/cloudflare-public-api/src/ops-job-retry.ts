export function shouldRetryFailedOpsJob(status: string, retryFailed: boolean): boolean {
  return retryFailed && status === "failed";
}
