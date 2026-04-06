import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, insertionsTable, campaignsTable, sitesTable, clientsTable, agenciesTable, evidencesTable } from "@workspace/db";
import {
  CreateInsertionBody,
  GetInsertionParams,
  UpdateInsertionParams,
  UpdateInsertionBody,
  DeleteInsertionParams,
  ListInsertionsQueryParams,
  BulkUpdateInsertionsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichInsertion(ins: typeof insertionsTable.$inferSelect) {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, ins.campanhaId));
  const [site] = ins.siteId ? await db.select().from(sitesTable).where(eq(sitesTable.id, ins.siteId)) : [null];
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(evidencesTable).where(eq(evidencesTable.insercaoId, ins.id));

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
}

function computeAtrasado(ins: { periodoInicio?: string | null; bannerPublicadoNoSite: boolean; statusNormalizado: string }): boolean {
  if (ins.bannerPublicadoNoSite) return false;
  if (['concluido', 'cancelado'].includes(ins.statusNormalizado)) return false;
  if (!ins.periodoInicio) return false;
  try {
    const inicio = new Date(ins.periodoInicio);
    return inicio < new Date();
  } catch {
    return false;
  }
}

router.get("/insertions", async (req, res): Promise<void> => {
  const params = ListInsertionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let allInsertions = await db.select().from(insertionsTable).orderBy(insertionsTable.createdAt);

  if (params.data.siteId) {
    allInsertions = allInsertions.filter(i => i.siteId === params.data.siteId);
  }
  if (params.data.status) {
    allInsertions = allInsertions.filter(i => i.statusNormalizado === params.data.status);
  }
  if (params.data.atrasado === true || params.data.atrasado === "true" as unknown) {
    allInsertions = allInsertions.filter(i => i.atrasado === true);
  }
  if (params.data.campanhaId) {
    allInsertions = allInsertions.filter(i => i.campanhaId === params.data.campanhaId);
  }

  const enriched = await Promise.all(allInsertions.map(enrichInsertion));

  let result = enriched;
  if (params.data.competencia) {
    result = result.filter(i => i.competencia === params.data.competencia);
  }
  if (params.data.clienteId) {
    result = result.filter(i => {
      const [campaign] = [{ clienteId: null }];
      return true;
    });
  }
  if (params.data.agenciaId) {
    const agId = params.data.agenciaId;
    result = result.filter(i => {
      return true;
    });
  }

  res.json(result);
});

router.post("/insertions/bulk-update", async (req, res): Promise<void> => {
  const parsed = BulkUpdateInsertionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ids, updates } = parsed.data;
  if (ids.length === 0) {
    res.json({ updated: 0 });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.siteId !== undefined) updateData.siteId = updates.siteId;
  if (updates.localFormato !== undefined) updateData.localFormato = updates.localFormato;
  if (updates.localFormatoNormalizado !== undefined) updateData.localFormatoNormalizado = updates.localFormatoNormalizado;
  if (updates.periodoInicio !== undefined) updateData.periodoInicio = updates.periodoInicio;
  if (updates.periodoFim !== undefined) updateData.periodoFim = updates.periodoFim;
  if (updates.statusNormalizado !== undefined) updateData.statusNormalizado = updates.statusNormalizado;
  if (updates.bannerPublicadoNoSite != null) updateData.bannerPublicadoNoSite = updates.bannerPublicadoNoSite;
  if (updates.printGerado != null) updateData.printGerado = updates.printGerado;
  if (updates.processoEnviadoAgencia != null) updateData.processoEnviadoAgencia = updates.processoEnviadoAgencia;
  if (updates.docsEnviados != null) updateData.docsEnviados = updates.docsEnviados;
  if (updates.dataEnvioAgencia !== undefined) updateData.dataEnvioAgencia = updates.dataEnvioAgencia;
  if (updates.observacoes !== undefined) updateData.observacoes = updates.observacoes;

  const updated = await db.update(insertionsTable).set(updateData).where(inArray(insertionsTable.id, ids)).returning();

  res.json({ updated: updated.length });
});

router.post("/insertions", async (req, res): Promise<void> => {
  const parsed = CreateInsertionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertData = {
    campanhaId: parsed.data.campanhaId,
    siteId: parsed.data.siteId ?? null,
    localFormato: parsed.data.localFormato ?? null,
    localFormatoNormalizado: parsed.data.localFormatoNormalizado ?? null,
    periodoInicio: parsed.data.periodoInicio ?? null,
    periodoFim: parsed.data.periodoFim ?? null,
    periodoOriginal: parsed.data.periodoOriginal ?? null,
    statusLegado: parsed.data.statusLegado ?? null,
    statusNormalizado: parsed.data.statusNormalizado,
    bannerPublicadoNoSite: parsed.data.bannerPublicadoNoSite ?? false,
    printGerado: parsed.data.printGerado ?? false,
    processoEnviadoAgencia: parsed.data.processoEnviadoAgencia ?? false,
    docsEnviados: parsed.data.docsEnviados ?? false,
    dataEnvioAgencia: parsed.data.dataEnvioAgencia ?? null,
    observacoes: parsed.data.observacoes ?? null,
    atrasado: false,
  };

  insertData.atrasado = computeAtrasado(insertData);

  const [ins] = await db.insert(insertionsTable).values(insertData).returning();
  const enriched = await enrichInsertion(ins);
  res.status(201).json(enriched);
});

router.get("/insertions/:id", async (req, res): Promise<void> => {
  const params = GetInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ins] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!ins) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const enriched = await enrichInsertion(ins);
  const evidences = await db.select().from(evidencesTable).where(eq(evidencesTable.insercaoId, ins.id)).orderBy(evidencesTable.criadoEm);

  res.json({ ...enriched, evidences });
});

router.patch("/insertions/:id", async (req, res): Promise<void> => {
  const params = UpdateInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInsertionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Insertion not found" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.siteId !== undefined) updateData.siteId = parsed.data.siteId;
  if (parsed.data.localFormato !== undefined) updateData.localFormato = parsed.data.localFormato;
  if (parsed.data.localFormatoNormalizado !== undefined) updateData.localFormatoNormalizado = parsed.data.localFormatoNormalizado;
  if (parsed.data.periodoInicio !== undefined) updateData.periodoInicio = parsed.data.periodoInicio;
  if (parsed.data.periodoFim !== undefined) updateData.periodoFim = parsed.data.periodoFim;
  if (parsed.data.statusNormalizado !== undefined) updateData.statusNormalizado = parsed.data.statusNormalizado;
  if (parsed.data.bannerPublicadoNoSite != null) updateData.bannerPublicadoNoSite = parsed.data.bannerPublicadoNoSite;
  if (parsed.data.printGerado != null) updateData.printGerado = parsed.data.printGerado;
  if (parsed.data.processoEnviadoAgencia != null) updateData.processoEnviadoAgencia = parsed.data.processoEnviadoAgencia;
  if (parsed.data.docsEnviados != null) updateData.docsEnviados = parsed.data.docsEnviados;
  if (parsed.data.dataEnvioAgencia !== undefined) updateData.dataEnvioAgencia = parsed.data.dataEnvioAgencia;
  if (parsed.data.observacoes !== undefined) updateData.observacoes = parsed.data.observacoes;

  const merged = { ...existing, ...updateData };
  updateData.atrasado = computeAtrasado({
    periodoInicio: merged.periodoInicio as string | null,
    bannerPublicadoNoSite: merged.bannerPublicadoNoSite as boolean,
    statusNormalizado: merged.statusNormalizado as string,
  });

  const [updated] = await db.update(insertionsTable).set(updateData).where(eq(insertionsTable.id, params.data.id)).returning();
  const enriched = await enrichInsertion(updated);
  res.json(enriched);
});

router.delete("/insertions/:id", async (req, res): Promise<void> => {
  const params = DeleteInsertionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(insertionsTable).where(eq(insertionsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
