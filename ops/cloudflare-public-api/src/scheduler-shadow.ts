export function buildCloudflareSchedulerAction(provider: string | null | undefined, scheduledTime: number) {
  if (provider?.trim() !== "macmini") {
    return { mode: "legacy" as const, writeD1: true, path: null, body: null };
  }
  return {
    mode: "shadow" as const,
    writeD1: false,
    path: "/api/ops/schedules/reconcile",
    body: {
      shadow: true,
      dryRun: true,
      now: new Date(scheduledTime).toISOString(),
    },
  };
}

export function shouldProxyOpsToMacMini(provider: string | null | undefined, path: string) {
  return provider?.trim() === "macmini"
    && !path.startsWith("/api/ops/runner/")
    && (path === "/api/ops" || path.startsWith("/api/ops/"));
}
