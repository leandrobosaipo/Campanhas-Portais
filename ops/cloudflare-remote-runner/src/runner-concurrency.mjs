export function buildRunnerPools(kinds, requestedCampaignConcurrency) {
  const uniqueKinds = Array.from(new Set((kinds || []).filter(Boolean)));
  const campaignKinds = uniqueKinds.filter((kind) => kind === "campaign-evidence-export");
  const piSiteExportKinds = uniqueKinds.filter((kind) => kind === "pi-site-export");
  const serialKinds = uniqueKinds.filter((kind) => kind !== "campaign-evidence-export" && kind !== "pi-site-export");
  const concurrency = Math.max(1, Math.min(3, Number.parseInt(String(requestedCampaignConcurrency || 1), 10) || 1));
  const pools = [];
  if (serialKinds.length) pools.push({ kinds: serialKinds, concurrency: 1, maintenance: true });
  if (piSiteExportKinds.length) pools.push({ kinds: piSiteExportKinds, concurrency: 1, maintenance: serialKinds.length === 0 });
  if (campaignKinds.length) pools.push({ kinds: campaignKinds, concurrency, maintenance: serialKinds.length === 0 && piSiteExportKinds.length === 0 });
  return pools;
}
