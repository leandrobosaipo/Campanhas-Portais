import { Router, type IRouter } from "express";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, campaignsTable, insertionsTable } from "@workspace/db";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.env.ADOPS_PROJECT_ROOT ?? process.cwd();
const TSX_BIN_CANDIDATES = [
  process.env.ADOPS_TSX_BIN,
  path.join(PROJECT_ROOT, "node_modules/.bin/tsx"),
  path.join(PROJECT_ROOT, "scripts/node_modules/.bin/tsx"),
].filter((value): value is string => Boolean(value));
const TSX_BIN = TSX_BIN_CANDIDATES.find((candidate) => existsSync(candidate)) ?? TSX_BIN_CANDIDATES[0] ?? "tsx";

function monthLabel(month: number) {
  return ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"][month] ?? "MÊS";
}

function deriveCompetencia(periodoInicio: string | null | undefined, fallback: string | null | undefined) {
  if (!periodoInicio) return fallback ?? null;
  const [year, month] = periodoInicio.split("-").map(Number);
  if (!year || !month) return fallback ?? null;
  return `${monthLabel(month)}/${year}`;
}

router.post("/sync/planilha/latest", async (_req, res): Promise<void> => {
  try {
    const { stdout } = await execFileAsync(
      TSX_BIN,
      ["./scripts/src/sync-planilha-latest.ts"],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? "postgresql:///campanhas_portais_local",
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const jsonStart = stdout.indexOf("{");
    const jsonEnd = stdout.lastIndexOf("}");
    const payload = jsonStart >= 0 && jsonEnd > jsonStart ? stdout.slice(jsonStart, jsonEnd + 1) : stdout;
    res.json(JSON.parse(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao sincronizar a planilha.", details: message });
  }
});

router.get("/sync/planilha/preview", async (_req, res): Promise<void> => {
  try {
    const { stdout } = await execFileAsync(
      TSX_BIN,
      ["./scripts/src/sync-planilha-latest.ts", "--dry-run"],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? "postgresql:///campanhas_portais_local",
          SYNC_DRY_RUN: "1",
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const jsonStart = stdout.indexOf("{");
    const jsonEnd = stdout.lastIndexOf("}");
    const payload = jsonStart >= 0 && jsonEnd > jsonStart ? stdout.slice(jsonStart, jsonEnd + 1) : stdout;
    res.json(JSON.parse(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Falha ao gerar preview da sincronização.", details: message });
  }
});

router.get("/sync/planilha/diagnostics", async (_req, res): Promise<void> => {
  const campaigns = await db.select().from(campaignsTable);
  const insertions = await db.select().from(insertionsTable);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const insertionsByCampaign = new Map<number, typeof insertions>();
  for (const item of insertions) {
    const current = insertionsByCampaign.get(item.campanhaId) ?? [];
    current.push(item);
    insertionsByCampaign.set(item.campanhaId, current);
  }

  const invalidDates = insertions
    .filter((item) => (item.periodoInicio && Number(item.periodoInicio.slice(0, 4)) < 2000) || (item.periodoFim && Number(item.periodoFim.slice(0, 4)) < 2000))
    .map((item) => ({
      insertionId: item.id,
      campaignId: item.campanhaId,
      campaignName: campaignById.get(item.campanhaId)?.nome ?? null,
      competencia: campaignById.get(item.campanhaId)?.competencia ?? null,
      periodoOriginal: item.periodoOriginal,
      periodoInicio: item.periodoInicio,
      periodoFim: item.periodoFim,
    }));

  const competenciaMismatch = insertions
    .map((item) => {
      const campaign = campaignById.get(item.campanhaId);
      const expectedCompetencia = deriveCompetencia(item.periodoInicio, campaign?.competencia ?? null);
      if (!campaign || !expectedCompetencia || campaign.competencia === expectedCompetencia) return null;
      return {
        insertionId: item.id,
        campaignId: campaign.id,
        campaignName: campaign.nome,
        piCodigo: campaign.piCodigo,
        competenciaAtual: campaign.competencia,
        competenciaSugerida: expectedCompetencia,
        periodoOriginal: item.periodoOriginal,
        periodoInicio: item.periodoInicio,
        periodoFim: item.periodoFim,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  const campaignReview = Array.from(
    competenciaMismatch.reduce((acc, item) => {
      const current = acc.get(item.campaignId) ?? [];
      current.push(item);
      acc.set(item.campaignId, current);
      return acc;
    }, new Map<number, typeof competenciaMismatch>()),
  ).map(([campaignId, items]) => {
    const campaign = campaignById.get(campaignId);
    const insertionCount = insertionsByCampaign.get(campaignId)?.length ?? 0;
    const suggestionSet = [...new Set(items.map((item) => item.competenciaSugerida))];
    const action =
      insertionCount === 1
        ? "safe_update_campaign"
        : suggestionSet.length === 1
          ? "review_split_campaign"
          : "review_multiple_period_rules";
    return {
      campaignId,
      campaignName: campaign?.nome ?? null,
      competenciaAtual: campaign?.competencia ?? null,
      suggestionSet,
      insertionCount,
      action,
      items,
    };
  });

  res.json({
    invalidDates,
    competenciaMismatch,
    campaignReview,
    summary: {
      invalidDates: invalidDates.length,
      competenciaMismatch: competenciaMismatch.length,
      safeCampaignUpdates: campaignReview.filter((item) => item.action === "safe_update_campaign").length,
      needsManualReview: campaignReview.filter((item) => item.action !== "safe_update_campaign").length,
    },
  });
});

router.post("/sync/competencia/apply-safe", async (req, res): Promise<void> => {
  const requestedCampaignIds = Array.isArray(req.body?.campaignIds)
    ? req.body.campaignIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
    : null;

  const campaigns = await db.select().from(campaignsTable);
  const insertions = await db.select().from(insertionsTable);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const insertionsByCampaign = new Map<number, typeof insertions>();
  for (const item of insertions) {
    const current = insertionsByCampaign.get(item.campanhaId) ?? [];
    current.push(item);
    insertionsByCampaign.set(item.campanhaId, current);
  }

  const updates: Array<{ campaignId: number; from: string | null; to: string }> = [];
  const skipped: Array<{ campaignId: number; reason: string }> = [];

  for (const [campaignId, rows] of insertionsByCampaign.entries()) {
    if (requestedCampaignIds && !requestedCampaignIds.includes(campaignId)) continue;
    if (rows.length !== 1) {
      skipped.push({ campaignId, reason: "Campanha com múltiplas inserções; exige revisão manual." });
      continue;
    }
    const campaign = campaignById.get(campaignId);
    if (!campaign || !rows[0]?.periodoInicio) continue;
    const suggested = deriveCompetencia(rows[0].periodoInicio, campaign.competencia);
    if (!suggested || suggested === campaign.competencia) continue;
    await db.update(campaignsTable).set({ competencia: suggested }).where(eq(campaignsTable.id, campaignId));
    updates.push({ campaignId, from: campaign.competencia, to: suggested });
  }

  res.json({
    ok: true,
    updated: updates.length,
    updates,
    skipped,
  });
});

export default router;
