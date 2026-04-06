import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, insertionsTable, campaignsTable, sitesTable, clientsTable, agenciesTable } from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardBySiteQueryParams,
  GetDashboardByClientQueryParams,
  GetDashboardCriticalQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isAtrasado(ins: { periodoInicio: string | null; bannerPublicadoNoSite: boolean; statusNormalizado: string }): boolean {
  if (ins.bannerPublicadoNoSite) return false;
  if (['concluido', 'cancelado'].includes(ins.statusNormalizado)) return false;
  if (!ins.periodoInicio) return false;
  try {
    return new Date(ins.periodoInicio) < new Date();
  } catch {
    return false;
  }
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const params = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let insertions = await db.select().from(insertionsTable);
  let campaigns = await db.select().from(campaignsTable);

  if (params.data.competencia) {
    const competencia = params.data.competencia;
    const filteredCampaignIds = campaigns
      .filter(c => c.competencia === competencia)
      .map(c => c.id);
    insertions = insertions.filter(i => filteredCampaignIds.includes(i.campanhaId));
    campaigns = campaigns.filter(c => c.competencia === competencia);
  }

  const ativas = insertions.filter(i => !['concluido', 'cancelado'].includes(i.statusNormalizado)).length;
  const concluidas = insertions.filter(i => i.statusNormalizado === 'concluido').length;
  const atrasadas = insertions.filter(i => i.atrasado).length;
  const aguardandoPublicacao = insertions.filter(i =>
    !i.bannerPublicadoNoSite && !['concluido', 'cancelado'].includes(i.statusNormalizado)
  ).length;
  const aguardandoPrint = insertions.filter(i =>
    i.bannerPublicadoNoSite && !i.printGerado && !['concluido', 'cancelado'].includes(i.statusNormalizado)
  ).length;
  const aguardandoEnvio = insertions.filter(i =>
    i.printGerado && !i.processoEnviadoAgencia && !['concluido', 'cancelado'].includes(i.statusNormalizado)
  ).length;
  const aguardandoDocs = insertions.filter(i =>
    i.processoEnviadoAgencia && !i.docsEnviados && !['concluido', 'cancelado'].includes(i.statusNormalizado)
  ).length;

  const valorTotal = campaigns.reduce((sum, c) => {
    return sum + (c.valorLiquido ? parseFloat(c.valorLiquido) : 0);
  }, 0);

  res.json({
    totalInsercoes: insertions.length,
    ativas,
    concluidas,
    atrasadas,
    aguardandoPublicacao,
    aguardandoPrint,
    aguardandoEnvio,
    aguardandoDocs,
    valorTotalLiquido: valorTotal,
    totalCampanhas: campaigns.length,
  });
});

router.get("/dashboard/by-site", async (req, res): Promise<void> => {
  const params = GetDashboardBySiteQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sites = await db.select().from(sitesTable).where(eq(sitesTable.ativo, true));
  let insertions = await db.select().from(insertionsTable);
  let campaigns = await db.select().from(campaignsTable);

  if (params.data.competencia) {
    const competencia = params.data.competencia;
    const filteredCampaignIds = campaigns.filter(c => c.competencia === competencia).map(c => c.id);
    insertions = insertions.filter(i => filteredCampaignIds.includes(i.campanhaId));
  }

  const result = sites.map(site => {
    const siteInsertions = insertions.filter(i => i.siteId === site.id);
    return {
      siteId: site.id,
      siteNome: site.nome,
      siteSigla: site.sigla,
      total: siteInsertions.length,
      ativas: siteInsertions.filter(i => !['concluido', 'cancelado'].includes(i.statusNormalizado)).length,
      concluidas: siteInsertions.filter(i => i.statusNormalizado === 'concluido').length,
      atrasadas: siteInsertions.filter(i => i.atrasado).length,
    };
  }).filter(s => s.total > 0);

  res.json(result);
});

router.get("/dashboard/by-client", async (req, res): Promise<void> => {
  const params = GetDashboardByClientQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clients = await db.select().from(clientsTable);
  let insertions = await db.select().from(insertionsTable);
  let campaigns = await db.select().from(campaignsTable);

  if (params.data.competencia) {
    const competencia = params.data.competencia;
    campaigns = campaigns.filter(c => c.competencia === competencia);
    const filteredCampaignIds = campaigns.map(c => c.id);
    insertions = insertions.filter(i => filteredCampaignIds.includes(i.campanhaId));
  }

  const result = clients.map(client => {
    const clientCampaigns = campaigns.filter(c => c.clienteId === client.id);
    const clientCampaignIds = clientCampaigns.map(c => c.id);
    const clientInsertions = insertions.filter(i => clientCampaignIds.includes(i.campanhaId));
    const valorLiquido = clientCampaigns.reduce((sum, c) => sum + (c.valorLiquido ? parseFloat(c.valorLiquido) : 0), 0);

    return {
      clienteId: client.id,
      clienteNome: client.nome,
      total: clientInsertions.length,
      ativas: clientInsertions.filter(i => !['concluido', 'cancelado'].includes(i.statusNormalizado)).length,
      concluidas: clientInsertions.filter(i => i.statusNormalizado === 'concluido').length,
      valorLiquido,
    };
  }).filter(c => c.total > 0);

  res.json(result);
});

router.get("/dashboard/by-competencia", async (_req, res): Promise<void> => {
  const campaigns = await db.select().from(campaignsTable);
  const insertions = await db.select().from(insertionsTable);

  const competencias = [...new Set(campaigns.map(c => c.competencia).filter(Boolean))];

  const result = competencias.map(comp => {
    const compCampaignIds = campaigns.filter(c => c.competencia === comp).map(c => c.id);
    const compInsertions = insertions.filter(i => compCampaignIds.includes(i.campanhaId));
    return {
      competencia: comp as string,
      total: compInsertions.length,
      ativas: compInsertions.filter(i => !['concluido', 'cancelado'].includes(i.statusNormalizado)).length,
      concluidas: compInsertions.filter(i => i.statusNormalizado === 'concluido').length,
      atrasadas: compInsertions.filter(i => i.atrasado).length,
    };
  });

  res.json(result);
});

router.get("/dashboard/critical", async (req, res): Promise<void> => {
  const params = GetDashboardCriticalQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let insertions = await db.select().from(insertionsTable);
  let campaigns = await db.select().from(campaignsTable);

  if (params.data.competencia) {
    const competencia = params.data.competencia;
    const filteredCampaignIds = campaigns.filter(c => c.competencia === competencia).map(c => c.id);
    insertions = insertions.filter(i => filteredCampaignIds.includes(i.campanhaId));
    campaigns = campaigns.filter(c => c.competencia === competencia);
  }

  const criticalInsertions = insertions.filter(i =>
    i.atrasado || (!i.printGerado && i.bannerPublicadoNoSite) || (i.printGerado && !i.processoEnviadoAgencia)
  ).slice(0, 20);

  const enriched = await Promise.all(criticalInsertions.map(async (ins) => {
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, ins.campanhaId));
    const [site] = ins.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, ins.siteId)) : [null];
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(
      await import("@workspace/db").then(m => m.evidencesTable)
    ).where(eq((await import("@workspace/db")).evidencesTable.insercaoId, ins.id));

    let clienteNome = null;
    let agenciaNome = null;
    if (campaign?.clienteId) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, campaign.clienteId));
      clienteNome = client?.nome ?? null;
    }
    if (campaign?.agenciaId) {
      const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, campaign.agenciaId));
      agenciaNome = agency?.nome ?? null;
    }

    return {
      ...ins,
      campanhaName: campaign?.nome ?? null,
      siteNome: site?.nome ?? null,
      siteSigla: site?.sigla ?? null,
      clienteNome,
      agenciaNome,
      competencia: campaign?.competencia ?? null,
      totalEvidencias: Number(countResult?.count ?? 0),
    };
  }));

  res.json(enriched);
});

export default router;
