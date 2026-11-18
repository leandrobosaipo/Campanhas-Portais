import { db, campaignsTable, insertionsTable, sitesTable } from "@workspace/db";
import { buildInsertionCanonicalIdentity } from "../../artifacts/api-server/src/lib/insertion-identity";

const [insertions, campaigns, sites] = await Promise.all([
  db.select().from(insertionsTable),
  db.select().from(campaignsTable),
  db.select().from(sitesTable),
]);
const campaignById = new Map(campaigns.map((item) => [item.id, item]));
const siteById = new Map(sites.map((item) => [item.id, item]));
const identities = new Map<string, number[]>();
const unresolved: number[] = [];
for (const insertion of insertions) {
  if (insertion.archivedAt || insertion.supersededByInsertionId) continue;
  const campaign = campaignById.get(insertion.campanhaId);
  const site = insertion.siteId ? siteById.get(insertion.siteId) : null;
  if (!campaign?.piCodigo || !site?.sigla) {
    unresolved.push(insertion.id);
    continue;
  }
  const identity = buildInsertionCanonicalIdentity({
    piCodigo: campaign.piCodigo,
    siteSigla: site.sigla,
    position: insertion.localFormatoNormalizado ?? insertion.localFormato,
    periodStart: insertion.periodoInicio,
    periodEnd: insertion.periodoFim,
  });
  identities.set(identity, [...(identities.get(identity) ?? []), insertion.id]);
}
const collisions = Array.from(identities.entries())
  .filter(([, ids]) => ids.length > 1)
  .map(([identity, insertionIds]) => ({ identity, insertionIds }));
console.log(JSON.stringify({ ok: collisions.length === 0, mutated: false, totalActive: Array.from(identities.values()).reduce((sum, ids) => sum + ids.length, 0), unresolved, collisions }, null, 2));
if (collisions.some((item) => !item.insertionIds.includes(1751) || !item.insertionIds.includes(1692))) process.exitCode = 2;
