import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, pool, campaignsTable, clientsTable, agenciesTable, insertionsTable, evidencesTable } from "@workspace/db";
import { CAMPAIGN_COMMERCIAL_FILL_FIELDS, planCampaignCommercialFill, type CampaignCommercialFillValues } from "../lib/campaign-commercial-fill";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  ListCampaignsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const commercialDbColumns = {
  piCodigo: "pi_codigo",
  clienteId: "cliente_id",
  agenciaId: "agencia_id",
  competencia: "competencia",
  valorLiquido: "valor_liquido",
  planilhaRef: "planilha_ref",
} as const;

function readCommercialValues(row: Record<string, unknown>): CampaignCommercialFillValues {
  return {
    piCodigo: row.pi_codigo as string | null,
    clienteId: row.cliente_id as number | null,
    agenciaId: row.agencia_id as number | null,
    competencia: row.competencia as string | null,
    valorLiquido: row.valor_liquido == null ? null : Number(row.valor_liquido),
    planilhaRef: row.planilha_ref as string | null,
  };
}

function parseCommercialFillRequest(value: unknown):
  | { success: true; fields: CampaignCommercialFillValues; sourceRef: string; dryRun: boolean; expectedUpdatedAt: string | null }
  | { success: false; details: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { success: false, details: "O corpo precisa ser um objeto." };
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["mode", "dryRun", "sourceRef", "expectedUpdatedAt", ...CAMPAIGN_COMMERCIAL_FILL_FIELDS]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return { success: false, details: "Preenchimento comercial aceita somente PI, cliente, agência, competência, valor e referência de planilha." };
  if (input.mode !== "fill_missing_only" || typeof input.dryRun !== "boolean") return { success: false, details: "Informe mode=fill_missing_only e dryRun explícito." };
  const sourceRef = typeof input.sourceRef === "string" ? input.sourceRef.trim() : "";
  if (sourceRef.length < 3 || sourceRef.length > 512 || /[\u0000-\u001f\u007f]/.test(sourceRef)) {
    return { success: false, details: "sourceRef rastreável é obrigatório (3 a 512 caracteres, sem controles)." };
  }
  const expectedUpdatedAt = typeof input.expectedUpdatedAt === "string" ? input.expectedUpdatedAt.trim() : null;
  if (!input.dryRun && (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt)))) {
    return { success: false, details: "Apply exige expectedUpdatedAt retornado pelo preflight." };
  }
  const parsed = UpdateCampaignBody.safeParse(input);
  if (!parsed.success) return { success: false, details: parsed.error.message };
  const fields: CampaignCommercialFillValues = {};
  for (const field of CAMPAIGN_COMMERCIAL_FILL_FIELDS) {
    if (!(field in input)) continue;
    const requested = parsed.data[field];
    if (requested == null || (typeof requested === "string" && !requested.trim())) {
      fields[field] = requested as null;
      continue;
    }
    if ((field === "clienteId" || field === "agenciaId") && (typeof requested !== "number" || !Number.isInteger(requested) || requested <= 0)) {
      return { success: false, details: `${field} precisa ser um inteiro positivo.` };
    }
    if (field === "valorLiquido" && (typeof requested !== "number" || !Number.isFinite(requested) || requested < 0)) {
      return { success: false, details: "valorLiquido deve ser um número finito não negativo." };
    }
    fields[field] = requested as never;
  }
  if (!Object.keys(fields).length) return { success: false, details: "Informe pelo menos um campo comercial com valor da fonte." };
  return { success: true, fields, sourceRef, dryRun: input.dryRun, expectedUpdatedAt };
}

async function readCampaignCommercialFill(id: number) {
  const result = await pool.query(
    `SELECT id, pi_codigo, cliente_id, agencia_id, competencia, valor_liquido, planilha_ref, updated_at
     FROM campaigns WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function findCommercialReferenceConflicts(query: (text: string, values?: unknown[]) => Promise<any>, fields: CampaignCommercialFillValues) {
  const conflicts: Array<{ field: "clienteId" | "agenciaId"; code: "missing_reference"; requested: number }> = [];
  if (typeof fields.clienteId === "number") {
    const result = await query("SELECT id FROM clients WHERE id = $1 LIMIT 1", [fields.clienteId]);
    if (!result.rows[0]) conflicts.push({ field: "clienteId", code: "missing_reference", requested: fields.clienteId });
  }
  if (typeof fields.agenciaId === "number") {
    const result = await query("SELECT id FROM agencies WHERE id = $1 LIMIT 1", [fields.agenciaId]);
    if (!result.rows[0]) conflicts.push({ field: "agenciaId", code: "missing_reference", requested: fields.agenciaId });
  }
  return conflicts;
}

async function getCampaignDeletionGuard(id: number) {
  const insertions = await db.select().from(insertionsTable).where(eq(insertionsTable.campanhaId, id));

  if (!insertions.length) {
    return {
      canDelete: true,
      reason: null,
      insertions,
      evidenceCount: 0,
    };
  }

  const insertionIds = insertions.map((item) => item.id);
  const evidenceRows = await Promise.all(
    insertionIds.map((insertionId) =>
      db.select({ count: sql<number>`count(*)` }).from(evidencesTable).where(eq(evidencesTable.insercaoId, insertionId)),
    ),
  );
  const evidenceCount = evidenceRows.reduce((acc, rows) => acc + Number(rows[0]?.count ?? 0), 0);

  const hasOperationalHistory = insertions.some((item) =>
    item.bannerPublicadoNoSite ||
    item.printGerado ||
    item.processoEnviadoAgencia ||
    item.docsEnviados ||
    item.dataEnvioAgencia ||
    item.statusNormalizado === "concluido" ||
    item.statusNormalizado === "enviado_para_agencia" ||
    item.statusNormalizado === "print_gerado" ||
    item.statusNormalizado === "docs_enviados",
  );

  if (evidenceCount > 0 || hasOperationalHistory) {
    return {
      canDelete: false,
      reason: "A campanha já possui histórico operacional. Para preservar auditoria, a exclusão foi bloqueada.",
      insertions,
      evidenceCount,
    };
  }

  return {
    canDelete: true,
    reason: null,
    insertions,
    evidenceCount,
  };
}

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
    projeto: parsed.data.projeto ?? null,
    plano: parsed.data.plano ?? null,
    planilhaRef: parsed.data.planilhaRef ?? null,
    produto: parsed.data.produto ?? null,
    praca: parsed.data.praca ?? null,
    condicaoPagamento: parsed.data.condicaoPagamento ?? null,
    faturamentoTipo: parsed.data.faturamentoTipo ?? null,
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
  if (req.body && typeof req.body === "object" && Object.hasOwn(req.body, "mode")) {
    if (req.body.mode !== "fill_missing_only") {
      res.status(400).json({ error: "unsupported_campaign_update_mode" });
      return;
    }
    const request = parseCommercialFillRequest(req.body);
    if (!request.success) {
      res.status(400).json({ error: "invalid_commercial_fill", details: request.details });
      return;
    }
    const campaignId = params.data.id;
    if (request.dryRun) {
      const current = await readCampaignCommercialFill(campaignId);
      if (!current) {
        res.status(404).json({ error: "campaign_not_found" });
        return;
      }
      const plan = planCampaignCommercialFill(readCommercialValues(current), request.fields);
      const conflicts = [...plan.conflicts, ...await findCommercialReferenceConflicts(pool.query.bind(pool), request.fields)];
      res.status(200).json({
        ok: conflicts.length === 0,
        mode: "fill_missing_only",
        dryRun: true,
        canApply: conflicts.length === 0,
        campaignId,
        sourceRef: request.sourceRef,
        expectedUpdatedAt: current.updated_at instanceof Date ? current.updated_at.toISOString() : new Date(String(current.updated_at)).toISOString(),
        before: plan.before,
        proposed: plan.proposed,
        changedFields: plan.changedFields,
        conflicts,
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT id, pi_codigo, cliente_id, agencia_id, competencia, valor_liquido, planilha_ref, updated_at
         FROM campaigns WHERE id = $1 FOR UPDATE`,
        [campaignId],
      );
      const current = locked.rows[0] as Record<string, unknown> | undefined;
      if (!current) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "campaign_not_found" });
        return;
      }
      const currentUpdatedAt = current.updated_at instanceof Date ? current.updated_at.toISOString() : new Date(String(current.updated_at)).toISOString();
      const expectedUpdatedAt = new Date(request.expectedUpdatedAt!).toISOString();
      if (expectedUpdatedAt !== currentUpdatedAt) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "campaign_changed_since_preflight", campaignId, expectedUpdatedAt, currentUpdatedAt });
        return;
      }
      const before = readCommercialValues(current);
      const plan = planCampaignCommercialFill(before, request.fields);
      const conflicts = [...plan.conflicts, ...await findCommercialReferenceConflicts(client.query.bind(client), request.fields)];
      if (conflicts.length) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "commercial_fill_conflict", mode: "fill_missing_only", campaignId, sourceRef: request.sourceRef, before: plan.before, proposed: plan.proposed, conflicts });
        return;
      }
      if (!plan.changedFields.length) {
        await client.query("COMMIT");
        res.status(200).json({ ok: true, mode: "fill_missing_only", dryRun: false, applied: false, campaignId, sourceRef: request.sourceRef, changedFields: [], before: plan.before, proposed: plan.proposed, conflicts: [] });
        return;
      }

      const values: unknown[] = [campaignId];
      const assignments = plan.changedFields.map((field) => {
        values.push(field === "valorLiquido" ? String(plan.proposed[field]) : plan.proposed[field]);
        return `${commercialDbColumns[field]} = $${values.length}`;
      });
      const updated = await client.query(
        `UPDATE campaigns SET ${assignments.join(", ")}, updated_at = NOW()
         WHERE id = $1 RETURNING id, updated_at`,
        values,
      );
      const jobId = randomUUID();
      const now = new Date().toISOString();
      const auditPayload = {
        campaignId,
        mode: "fill_missing_only",
        sourceRef: request.sourceRef,
        expectedUpdatedAt,
        fields: request.fields,
        before: plan.before,
        after: plan.proposed,
        changedFields: plan.changedFields,
      };
      await client.query(
        `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
         VALUES ($1, 'campaign-commercial-fill', 'completed', $2, $3, NULL, 'campaign-api', NULL, $4, $4)`,
        [jobId, JSON.stringify(auditPayload), JSON.stringify({ ok: true, campaignId, changedFields: plan.changedFields, sourceRef: request.sourceRef }), now],
      );
      await client.query("COMMIT");
      const campaign = await buildCampaignWithMeta(campaignId);
      res.status(200).json({
        ok: true,
        mode: "fill_missing_only",
        dryRun: false,
        applied: true,
        campaignId,
        jobId,
        sourceRef: request.sourceRef,
        expectedUpdatedAt,
        updatedAt: updated.rows[0]?.updated_at,
        before: plan.before,
        proposed: plan.proposed,
        changedFields: plan.changedFields,
        conflicts: [],
        campaign,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if ("mode" in parsed.data) {
    res.status(400).json({ error: "invalid_campaign_update_mode" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome != null) updateData.nome = parsed.data.nome;
  if (parsed.data.clienteId !== undefined) updateData.clienteId = parsed.data.clienteId;
  if (parsed.data.agenciaId !== undefined) updateData.agenciaId = parsed.data.agenciaId;
  if (parsed.data.piCodigo !== undefined) updateData.piCodigo = parsed.data.piCodigo;
  if (parsed.data.projeto !== undefined) updateData.projeto = parsed.data.projeto;
  if (parsed.data.plano !== undefined) updateData.plano = parsed.data.plano;
  if (parsed.data.planilhaRef !== undefined) updateData.planilhaRef = parsed.data.planilhaRef;
  if (parsed.data.produto !== undefined) updateData.produto = parsed.data.produto;
  if (parsed.data.praca !== undefined) updateData.praca = parsed.data.praca;
  if (parsed.data.condicaoPagamento !== undefined) updateData.condicaoPagamento = parsed.data.condicaoPagamento;
  if (parsed.data.faturamentoTipo !== undefined) updateData.faturamentoTipo = parsed.data.faturamentoTipo;
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

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const deletionGuard = await getCampaignDeletionGuard(params.data.id);
  if (!deletionGuard.canDelete) {
    res.status(409).json({
      error: deletionGuard.reason,
      totalInsercoes: deletionGuard.insertions.length,
      totalEvidencias: deletionGuard.evidenceCount,
    });
    return;
  }

  for (const insertion of deletionGuard.insertions) {
    await db.delete(evidencesTable).where(eq(evidencesTable.insercaoId, insertion.id));
  }
  await db.delete(insertionsTable).where(eq(insertionsTable.campanhaId, params.data.id));
  await db.delete(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
