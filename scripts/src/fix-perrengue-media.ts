import { execFileSync } from "node:child_process";
import process from "node:process";
import { eq } from "drizzle-orm";
import { db, campaignsTable, insertionsTable, sitesTable } from "@workspace/db";

type RemoteAd = {
  groupId: number;
  adId: number;
  title: string;
  image: string | null;
};

type PreviewItem = {
  groupId: number;
  adId: number;
  mediaUrl: string | null;
};

const API_BASE = (process.env.ADOPS_INTERNAL_API_BASE_URL ?? "http://127.0.0.1:4011/api").replace(/\/$/, "");
const SSH_HOST = process.env.ADOPS_PERRENGUE_SSH_HOST ?? "186.209.113.107";
const SSH_PORT = process.env.ADOPS_PERRENGUE_SSH_PORT ?? "1157";
const SSH_USER = process.env.ADOPS_PERRENGUE_SSH_USER ?? "perrengu";
const SSH_KEY_PATH = process.env.ADOPS_PERRENGUE_SSH_KEY_PATH ?? "";
const WP_PATH = process.env.ADOPS_PERRENGUE_WP_PATH ?? "/home/perrengu/public_html/wp";
const COMPETENCIA = process.env.ADOPS_TARGET_COMPETENCIA ?? "ABRIL/2026";

const GROUPS: Record<string, number> = {
  "MEGABANNER TOPO": 1,
  "HOME 1": 2,
  "PRIMEIRA DOBRA": 2,
  "HOME 2": 3,
  "SEGUNDA DOBRA": 3,
  "HOME 3": 4,
  "VIDEO": 6,
  "VIDEO - LATERAL": 6,
  "LATERAL PRIMEIRA DOBRA": 6,
  "TOPO LATERAL": 10,
  "INTERNO DE NOTICIAS": 11,
  "BANNER INTERNO NOTICIAS": 11,
};

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeForMatch(value: string | null | undefined) {
  return normalizeSpaces(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeFormato(value: string | null | undefined) {
  const normalized = normalizeForMatch(value).replace(/\./g, "").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "MEGA BANNER TOPO": "MEGABANNER TOPO",
    "BANNER INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "BANNER INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
  };
  return aliases[normalized] ?? normalized;
}

function extractPiNumber(value: string | null | undefined) {
  const normalized = normalizeForMatch(value);
  const match = normalized.match(/\bPI\s*([0-9]+)/) ?? normalized.match(/\b([0-9]{4,})\b/);
  return match?.[1] ?? null;
}

function parseRemoteTsv(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [groupId, adId, title, image] = line.split("\t");
      return {
        groupId: Number(groupId),
        adId: Number(adId),
        title: title ?? "",
        image: image ? image.trim() : null,
      } satisfies RemoteAd;
    })
    .filter((row) => Number.isFinite(row.groupId) && Number.isFinite(row.adId));
}

function isUsableMedia(url: string | null | undefined) {
  const value = String(url ?? "").trim();
  return value !== "" && !/placehold\.co/i.test(value);
}

function fetchRemoteAds() {
  const sql =
    "SELECT lm.group AS group_id,a.id AS ad_id,a.title,a.image FROM wp_adrotate a JOIN wp_adrotate_linkmeta lm ON lm.ad=a.id WHERE lm.group > 0 ORDER BY lm.group,a.id;";
  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=no",
  ];
  if (SSH_KEY_PATH) {
    sshArgs.push("-i", SSH_KEY_PATH);
  }
  const stdout = execFileSync(
    "ssh",
    [
      ...sshArgs,
      "-p",
      SSH_PORT,
      `${SSH_USER}@${SSH_HOST}`,
      `php /home/${SSH_USER}/wp-cli.phar --path=${WP_PATH} --allow-root db query "${sql}" --skip-column-names`,
    ],
    { encoding: "utf8" },
  );
  return parseRemoteTsv(stdout);
}

async function fetchPreviewItems() {
  const response = await fetch(`${API_BASE}/integrations/adrotate/live-preview?siteSigla=PERRENGUE`);
  if (!response.ok) {
    throw new Error(`Falha ao buscar live preview do Perrengue: ${response.status}`);
  }
  const payload = (await response.json()) as { items?: PreviewItem[] };
  return payload.items ?? [];
}

async function main() {
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.sigla, "PERRENGUE"));
  if (!site) {
    throw new Error("Site PERRENGUE não encontrado na base.");
  }

  const campaigns = await db.select().from(campaignsTable);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const insertions = (await db.select().from(insertionsTable))
    .filter((item) => item.siteId === site.id)
    .filter((item) => !item.mediaUrl)
    .filter((item) => {
      const campaign = campaignById.get(item.campanhaId);
      return (campaign?.competencia ?? null) === COMPETENCIA;
    });

  const remoteAds = fetchRemoteAds();
  const previewItems = await fetchPreviewItems();

  const updates: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const insertion of insertions) {
    const campaign = campaignById.get(insertion.campanhaId);
    if (!campaign) continue;
    const groupId = GROUPS[normalizeFormato(insertion.localFormatoNormalizado ?? insertion.localFormato)];
    if (!groupId) {
      skipped.push({ insertionId: insertion.id, reason: "Formato sem grupo aplicável no Perrengue." });
      continue;
    }
    const piNumber = extractPiNumber(campaign.piCodigo);
    if (!piNumber) {
      skipped.push({ insertionId: insertion.id, reason: "PI sem número identificável." });
      continue;
    }

    const adminMatches = remoteAds
      .filter((ad) => ad.groupId === groupId)
      .filter((ad) => normalizeForMatch(ad.title).includes(piNumber));
    const usableAdmin = adminMatches.filter((ad) => isUsableMedia(ad.image));

    let resolvedMediaUrl = usableAdmin.length === 1 ? usableAdmin[0]!.image : null;
    let source = usableAdmin.length === 1 ? "admin" : null;

    if (!resolvedMediaUrl) {
      const previewMatches = previewItems.filter((item) => item.groupId === groupId && isUsableMedia(item.mediaUrl));
      const uniquePreviewUrls = [...new Set(previewMatches.map((item) => item.mediaUrl).filter(Boolean))];
      if (uniquePreviewUrls.length === 1) {
        resolvedMediaUrl = uniquePreviewUrls[0]!;
        source = "live-preview";
      }
    }

    if (!resolvedMediaUrl) {
      skipped.push({
        insertionId: insertion.id,
        campaignName: campaign.nome,
        piCodigo: campaign.piCodigo,
        groupId,
        adminMatches: adminMatches.map((ad) => ({ adId: ad.adId, title: ad.title, image: ad.image })),
        previewCount: [...new Set(previewItems.filter((item) => item.groupId === groupId && isUsableMedia(item.mediaUrl)).map((item) => item.mediaUrl).filter(Boolean))].length,
        reason: "Não foi possível resolver mediaUrl único.",
      });
      continue;
    }

    await db.update(insertionsTable).set({ mediaUrl: resolvedMediaUrl, updatedAt: new Date() }).where(eq(insertionsTable.id, insertion.id));
    updates.push({
      insertionId: insertion.id,
      campaignName: campaign.nome,
      piCodigo: campaign.piCodigo,
      groupId,
      mediaUrl: resolvedMediaUrl,
      source,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    competencia: COMPETENCIA,
    totalCandidates: insertions.length,
    updated: updates.length,
    skipped: skipped.length,
    updates,
    skippedItems: skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
