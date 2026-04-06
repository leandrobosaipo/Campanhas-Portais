import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, campaignsTable, clientsTable, agenciesTable, insertionsTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  ListCampaignsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildCampaignWithMeta(id: number) {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return null;

  const [client] = campaign.clienteId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, campaign.clienteId))
    : [null];
  const [agency] = campaign.agenciaId
    ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, campaign.agenciaId))
    : [null];

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(insertionsTable)
    .where(eq(insertionsTable.campanhaId, id));

  return {
    ...campaign,
    valorLiquido: campaign.valorLiquido ? parseFloat(campaign.valorLiquido) : null,
    clienteNome: client?.nome ?? null,
    agenciaNome: agency?.nome ?? null,
    totalInsercoes: Number(countResult?.count ?? 0),
  };
}

router.get("/campaigns", async (req, res): Promise<void> => {
  const params = ListCampaignsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);

  if (params.data.competencia) {
    campaigns = campaigns.filter(c => c.competencia === params.data.competencia);
  }
  if (params.data.clienteId) {
    campaigns = campaigns.filter(c => c.clienteId === params.data.clienteId);
  }
  if (params.data.agenciaId) {
    campaigns = campaigns.filter(c => c.agenciaId === params.data.agenciaId);
  }

  const result = await Promise.all(campaigns.map(async (campaign) => {
    const [client] = campaign.clienteId
      ? await db.select().from(clientsTable).where(eq(clientsTable.id, campaign.clienteId))
      : [null];
    const [agency] = campaign.agenciaId
      ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, campaign.agenciaId))
      : [null];
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(insertionsTable)
      .where(eq(insertionsTable.campanhaId, campaign.id));

    return {
      ...campaign,
      valorLiquido: campaign.valorLiquido ? parseFloat(campaign.valorLiquido) : null,
      clienteNome: client?.nome ?? null,
      agenciaNome: agency?.nome ?? null,
      totalInsercoes: Number(countResult?.count ?? 0),
    };
  }));

  res.json(result);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [campaign] = await db.insert(campaignsTable).values({
    nome: parsed.data.nome,
    clienteId: parsed.data.clienteId ?? null,
    agenciaId: parsed.data.agenciaId ?? null,
    piCodigo: parsed.data.piCodigo ?? null,
    valorLiquido: parsed.data.valorLiquido != null ? String(parsed.data.valorLiquido) : null,
    competencia: parsed.data.competencia ?? null,
    origem: parsed.data.origem ?? null,
    observacoes: parsed.data.observacoes ?? null,
  }).returning();

  const enriched = await buildCampaignWithMeta(campaign.id);
  res.status(201).json(enriched);
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const campaign = await buildCampaignWithMeta(params.data.id);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const insertions = await db.select().from(insertionsTable).where(eq(insertionsTable.campanhaId, params.data.id));
  const { sitesTable } = await import("@workspace/db");
  const { evidencesTable } = await import("@workspace/db");

  const enrichedInsertions = await Promise.all(insertions.map(async (ins) => {
    const [site] = ins.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, ins.siteId)) : [null];
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(evidencesTable).where(eq(evidencesTable.insercaoId, ins.id));
    return {
      ...ins,
      campanhaName: campaign.nome,
      siteNome: site?.nome ?? null,
      siteSigla: site?.sigla ?? null,
      clienteNome: campaign.clienteNome,
      agenciaNome: campaign.agenciaNome,
      competencia: campaign.competencia,
      totalEvidencias: Number(countResult?.count ?? 0),
    };
  }));

  res.json({ ...campaign, insertions: enrichedInsertions });
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome != null) updateData.nome = parsed.data.nome;
  if (parsed.data.clienteId !== undefined) updateData.clienteId = parsed.data.clienteId;
  if (parsed.data.agenciaId !== undefined) updateData.agenciaId = parsed.data.agenciaId;
  if (parsed.data.piCodigo !== undefined) updateData.piCodigo = parsed.data.piCodigo;
  if (parsed.data.valorLiquido !== undefined) updateData.valorLiquido = parsed.data.valorLiquido != null ? String(parsed.data.valorLiquido) : null;
  if (parsed.data.competencia !== undefined) updateData.competencia = parsed.data.competencia;
  if (parsed.data.origem !== undefined) updateData.origem = parsed.data.origem;
  if (parsed.data.observacoes !== undefined) updateData.observacoes = parsed.data.observacoes;

  const [campaign] = await db.update(campaignsTable).set(updateData).where(eq(campaignsTable.id, params.data.id)).returning();
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const enriched = await buildCampaignWithMeta(campaign.id);
  res.json(enriched);
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
