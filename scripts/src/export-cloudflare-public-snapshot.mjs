import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API_BASE = process.env.ADOPS_API_BASE_URL ?? 'http://127.0.0.1:4011';
const OUT_PATH = process.env.ADOPS_SNAPSHOT_OUT ?? resolve('/Users/leandrobosaipo/Projetos/AdOps/ops/cloudflare-public-api/data/snapshot.ts');

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Failed ${path}: ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await iteratee(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJsonOrNull(path) {
  try {
    return await fetchJson(path);
  } catch {
    return null;
  }
}

function getEvidenceDateKey(title) {
  if (!title) return null;
  const match = title.match(/Print\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

async function main() {
  const [sites, clients, agencies, campaigns, insertions, byCompetencia] = await Promise.all([
    fetchJson('/api/sites'),
    fetchJson('/api/clients'),
    fetchJson('/api/agencies'),
    fetchJson('/api/campaigns'),
    fetchJson('/api/insertions'),
    fetchJson('/api/dashboard/by-competencia'),
  ]);

  const competencias = uniq([
    ...campaigns.map((item) => item.competencia),
    ...insertions.map((item) => item.competencia),
    ...byCompetencia.map((item) => item.competencia),
  ]);

  const siteSiglas = uniq(sites.map((site) => site.sigla));
  const competenciaSitePairs = uniq(
    insertions
      .filter((item) => item.competencia && item.siteSigla)
      .map((item) => `${item.competencia}|||${item.siteSigla}`),
  );

  const [campaignDetails, insertionDetails, dashboards, syncDiagnostics, syncPreview] = await Promise.all([
    mapLimit(campaigns, 8, async (item) => [String(item.id), await fetchJson(`/api/campaigns/${item.id}`)]),
    mapLimit(insertions, 8, async (item) => [String(item.id), await fetchJson(`/api/insertions/${item.id}`)]),
    mapLimit(competencias, 4, async (competencia) => {
      const qp = `?competencia=${encodeURIComponent(competencia)}`;
      const [summary, bySite, byClient, critical] = await Promise.all([
        fetchJson(`/api/dashboard/summary${qp}`),
        fetchJson(`/api/dashboard/by-site${qp}`),
        fetchJson(`/api/dashboard/by-client${qp}`),
        fetchJson(`/api/dashboard/critical${qp}`),
      ]);
      return [competencia, { summary, bySite, byClient, critical }];
    }),
    fetchJsonOrNull('/api/sync/planilha/diagnostics'),
    fetchJsonOrNull('/api/sync/planilha/preview'),
  ]);

  const [relations, adrotatePlanned, adrotateLivePreview] = await Promise.all([
    mapLimit(insertions, 6, async (item) => [String(item.id), await fetchJsonOrNull(`/api/integrations/adrotate/insertions/${item.id}/relation`)]),
    mapLimit(competenciaSitePairs, 3, async (pair) => {
      const [competencia, siteSigla] = pair.split('|||');
      return [
        pair,
        await fetchJsonOrNull(`/api/integrations/adrotate/planned?competencia=${encodeURIComponent(competencia)}&siteSigla=${encodeURIComponent(siteSigla)}`),
      ];
    }),
    mapLimit(siteSiglas, 2, async (siteSigla) => [siteSigla, await fetchJsonOrNull(`/api/integrations/adrotate/live-preview?siteSigla=${encodeURIComponent(siteSigla)}`)]),
  ]);

  const evidenceStatusTargets = [];
  for (const detail of insertionDetails.map(([, value]) => value)) {
    for (const evidence of detail?.evidences ?? []) {
      const dateKey = getEvidenceDateKey(evidence?.titulo);
      if (dateKey) evidenceStatusTargets.push([String(detail.id), dateKey]);
    }
  }

  const captureStatusEntries = await mapLimit(
    evidenceStatusTargets,
    6,
    async ([insertionId, dateKey]) => [
      `${insertionId}:${dateKey}`,
      await fetchJsonOrNull(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(dateKey)}`),
    ],
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    sites,
    clients,
    agencies,
    campaigns,
    insertions,
    byCompetencia,
    campaignDetails: Object.fromEntries(campaignDetails),
    insertionDetails: Object.fromEntries(insertionDetails),
    dashboards: Object.fromEntries(dashboards),
    relations: Object.fromEntries(relations),
    captureStatuses: Object.fromEntries(captureStatusEntries),
    syncDiagnostics,
    syncPreview,
    adrotatePlanned: Object.fromEntries(adrotatePlanned),
    adrotateLivePreview: Object.fromEntries(adrotateLivePreview),
  };

  const source = `export const snapshot = ${JSON.stringify(snapshot, null, 2)} as const;\n`;
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, source, 'utf8');
  console.log(`snapshot written to ${OUT_PATH}`);
  console.log(`sites=${sites.length} clients=${clients.length} agencies=${agencies.length} campaigns=${campaigns.length} insertions=${insertions.length} competencias=${competencias.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
