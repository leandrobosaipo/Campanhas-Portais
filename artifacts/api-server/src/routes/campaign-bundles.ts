import { previewAfterRegistration } from "../lib/registration-preview";
import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { CreateCampaignBody, CreateInsertionBody } from "@workspace/api-zod";
import { findProvisionalIdentityMatches, normalizeBundlePosition, provisionalIdentity } from "../lib/campaign-bundle-identity";

const router: IRouter = Router();

async function previewCommittedBundle(ids: number[]) {
  try {
    const { rows } = await pool.query(`SELECT id, site_id AS "siteId", periodo_inicio AS "periodoInicio",
      periodo_fim AS "periodoFim", local_formato AS "localFormato", local_formato_normalizado AS "localFormatoNormalizado",
      status_normalizado AS "statusNormalizado", media_url AS "mediaUrl" FROM insertions WHERE id = ANY($1::int[]) ORDER BY id`, [ids]);
    const previews = [];
    for (const row of rows) {
      const preview = await previewAfterRegistration(row.id, row);
      if (preview) previews.push(preview);
    }
    return previews;
  } catch {
    return ids.map(insertionId => ({ insertionId, status: "needs_review", retryUrl: `/api/insertions/${insertionId}/visual-previews` }));
  }
}


type Campaign = ReturnType<typeof CreateCampaignBody.parse>;
type Insertion = Omit<ReturnType<typeof CreateInsertionBody.parse>, "campanhaId">;
type Bundle = { campaign: Campaign; insertions: Insertion[]; requestedBy?: string; source?: string };
type CampaignBundleConflict = { code: string; message: string; campaignId?: number; rowIndexes?: number[] };

function parseBundle(value: unknown): { success: true; data: Bundle } | { success: false; details: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { success: false, details: "O corpo precisa ser um objeto." };
  const input = value as Record<string, unknown>;
  const campaign = CreateCampaignBody.safeParse(input.campaign);
  if (!campaign.success) return { success: false, details: campaign.error.message };
  if (!Array.isArray(input.insertions) || input.insertions.length < 1 || input.insertions.length > 100) {
    return { success: false, details: "Informe de 1 a 100 inserções." };
  }
  const insertions: Insertion[] = [];
  for (const raw of input.insertions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { success: false, details: "Cada inserção precisa ser um objeto." };
    const parsed = CreateInsertionBody.safeParse({ ...(raw as Record<string, unknown>), campanhaId: 1 });
    if (!parsed.success) return { success: false, details: parsed.error.message };
    const { campanhaId: _campanhaId, ...insertion } = parsed.data;
    insertions.push(insertion);
  }
  const optionalString = (key: "requestedBy" | "source", maxLength: number) => {
    const raw = input[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || !raw.trim() || raw.trim().length > maxLength) return null;
    return raw.trim();
  };
  const requestedBy = optionalString("requestedBy", 160);
  const source = optionalString("source", 80);
  if (requestedBy === null || source === null) return { success: false, details: "requestedBy/source inválido." };
  return { success: true, data: { campaign: campaign.data, insertions, requestedBy, source } };
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findDuplicateRows(insertions: Bundle["insertions"]) {
  const seen = new Map<string, number[]>();
  insertions.forEach((item, index) => {
    const identity = [
      item.siteId ?? "sem-site",
      normalizeIdentity(item.localFormatoNormalizado ?? item.localFormato),
      item.periodoInicio ?? "sem-inicio",
      item.periodoFim ?? "sem-fim",
    ].join(":");
    seen.set(identity, [...(seen.get(identity) ?? []), index]);
  });
  return [...seen.values()].filter((indexes) => indexes.length > 1).map((rowIndexes) => ({
    code: "duplicate_insertion_in_request",
    message: `As inserções ${rowIndexes.map((index) => index + 1).join(", ")} repetem site, formato e período.`,
    rowIndexes,
  }));
}

function readIdempotencyKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:-]{8,160}$/.test(key) ? key : null;
}

async function inspectBundle(client: { query: (text: string, values?: unknown[]) => Promise<any> }, bundle: Bundle) {
  const conflicts: CampaignBundleConflict[] = findDuplicateRows(bundle.insertions);
  const siteIds = [...new Set(bundle.insertions.map((item) => item.siteId).filter((id): id is number => id != null))];
  if (bundle.campaign.clienteId != null) {
    const result = await client.query("SELECT id FROM clients WHERE id = $1 LIMIT 1", [bundle.campaign.clienteId]);
    if (!result.rows[0]) conflicts.push({ code: "missing_reference", message: `clienteId=${bundle.campaign.clienteId} não existe.` });
  }
  if (bundle.campaign.agenciaId != null) {
    const result = await client.query("SELECT id FROM agencies WHERE id = $1 LIMIT 1", [bundle.campaign.agenciaId]);
    if (!result.rows[0]) conflicts.push({ code: "missing_reference", message: `agenciaId=${bundle.campaign.agenciaId} não existe.` });
  }
  if (siteIds.length) {
    const result = await client.query("SELECT id FROM sites WHERE id = ANY($1::int[])", [siteIds]);
    const existing = new Set(result.rows.map((row: { id: number }) => Number(row.id)));
    for (const siteId of siteIds) if (!existing.has(siteId)) conflicts.push({ code: "missing_reference", message: `siteId=${siteId} não existe.` });
  }

  const piCodigo = bundle.campaign.piCodigo?.trim();
  if (piCodigo) {
    const existingCampaigns = await client.query("SELECT id, nome FROM campaigns WHERE lower(trim(pi_codigo)) = lower(trim($1)) ORDER BY id DESC LIMIT 5", [piCodigo]);
    for (const row of existingCampaigns.rows) conflicts.push({
      code: "campaign_pi_exists",
      campaignId: Number(row.id),
      message: `A PI ${piCodigo} já está vinculada à campanha #${row.id} (${row.nome}).`,
    });
  } else {
    const source = bundle.campaign.origem?.trim() || bundle.source?.trim() || "";
    for (const [index, insertion] of bundle.insertions.entries()) {
      const identity = provisionalIdentity({ ...insertion, source });
      if (!identity) {
        conflicts.push({
          code: "provisional_identity_incomplete",
          rowIndexes: [index],
          message: `Inserção ${index + 1}: campanha sem PI exige origem, site, período, posição e mediaUrl para dedupe seguro.`,
        });
        continue;
      }
      const position = normalizeBundlePosition(insertion.localFormatoNormalizado ?? insertion.localFormato);
      const existing = await client.query(
        `SELECT DISTINCT c.id, c.origem,
                i.local_formato_normalizado AS "localFormatoNormalizado",
                i.local_formato AS "localFormato"
         FROM campaigns c
         JOIN insertions i ON i.campanha_id = c.id
         WHERE i.site_id = $1
           AND i.periodo_inicio = $2
           AND i.periodo_fim = $3
           AND trim(COALESCE(i.media_url, '')) = trim($4)
         ORDER BY c.id DESC`,
        [insertion.siteId, insertion.periodoInicio, insertion.periodoFim, insertion.mediaUrl],
      );
      // Compare canonical position names in JS so accents and repeated spaces
      // follow the same normalization as the provisional identity key.
      const samePositionRows = existing.rows.filter((row: { localFormatoNormalizado?: string | null; localFormato?: string | null }) =>
        normalizeBundlePosition(row.localFormatoNormalizado ?? row.localFormato) === position,
      );
      const match = findProvisionalIdentityMatches(samePositionRows as { id: number; origem: string | null }[], source);
      if (match.kind === "ambiguous") conflicts.push({
        code: "provisional_identity_ambiguous",
        rowIndexes: [index],
        message: `Inserção ${index + 1}: identidade provisória corresponde a várias campanhas (${match.campaignIds.map((id) => `#${id}`).join(", ")}); revisão manual obrigatória.`,
      });
      else if (match.kind === "exists") conflicts.push({
        code: "campaign_operational_identity_exists",
        campaignId: match.campaignIds[0],
        rowIndexes: [index],
        message: `Inserção ${index + 1}: já existe campanha com a mesma origem, site, período, posição e peça (#${match.campaignIds[0]}).`,
      });
      else if (match.kind === "source_review") conflicts.push({
        code: "provisional_identity_source_review",
        campaignId: match.campaignIds[0],
        rowIndexes: [index],
        message: `Inserção ${index + 1}: existe a mesma peça no mesmo site, período e posição, mas com outra origem; revisão manual obrigatória (#${match.campaignIds[0]}).`,
      });
    }
  }

  return {
    ok: conflicts.length === 0,
    canApply: conflicts.length === 0,
    conflicts,
    summary: {
      campaignName: bundle.campaign.nome,
      piCodigo: bundle.campaign.piCodigo ?? null,
      competencia: bundle.campaign.competencia ?? null,
      insertionCount: bundle.insertions.length,
      siteCount: siteIds.length,
    },
  };
}

router.post("/campaign-bundles/preflight", async (req, res): Promise<void> => {
  const parsed = parseBundle(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_campaign_bundle", details: parsed.details });
    return;
  }
  const result = await inspectBundle(pool, parsed.data);
  res.status(result.canApply ? 200 : 409).json(result);
});

router.post("/campaign-bundles", async (req, res): Promise<void> => {
  const parsed = parseBundle(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_campaign_bundle", details: parsed.details });
    return;
  }
  const idempotencyKey = readIdempotencyKey(req.header("idempotency-key"));
  if (!idempotencyKey) {
    res.status(400).json({ error: "invalid_idempotency_key", details: "Informe Idempotency-Key com 8 a 160 caracteres seguros." });
    return;
  }

  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");
    // Low-volume creation: serialize the preflight+insert critical section so distinct idempotency keys cannot duplicate a PI/placement.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["campaign-bundle-create-global:v1"]);
    const requestHash = crypto.createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    const previous = await client.query(
      `SELECT result_json, payload_json FROM ops_jobs
       WHERE kind = 'campaign-bundle-create'
         AND payload_json::jsonb ->> 'idempotencyKey' = $1
         AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [idempotencyKey],
    );
    if (previous.rows[0]?.result_json) {
      const storedPayload = typeof previous.rows[0].payload_json === "string"
        ? JSON.parse(previous.rows[0].payload_json)
        : previous.rows[0].payload_json;
      if (storedPayload?.requestHash !== requestHash) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "idempotency_key_payload_mismatch" });
        return;
      }
      await client.query("COMMIT");
      const result = typeof previous.rows[0].result_json === "string" ? JSON.parse(previous.rows[0].result_json) : previous.rows[0].result_json;
      client.release();
      released = true;
      res.status(200).json({ ...result, duplicate: true, idempotencyKey, visualPreviews: await previewCommittedBundle(result.insertionIds || []) });
      return;
    }

    const preflight = await inspectBundle(client, parsed.data);
    if (!preflight.canApply) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "campaign_bundle_conflict", ...preflight });
      return;
    }

    const campaign = parsed.data.campaign;
    const created = await client.query(
      `INSERT INTO campaigns (
         nome, cliente_id, agencia_id, pi_codigo, projeto, plano, planilha_ref,
         produto, praca, condicao_pagamento, faturamento_tipo, valor_liquido,
         competencia, origem, observacoes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
       RETURNING id, nome, pi_codigo AS "piCodigo", competencia`,
      [campaign.nome, campaign.clienteId ?? null, campaign.agenciaId ?? null, campaign.piCodigo ?? null,
        campaign.projeto ?? null, campaign.plano ?? null, campaign.planilhaRef ?? null, campaign.produto ?? null,
        campaign.praca ?? null, campaign.condicaoPagamento ?? null, campaign.faturamentoTipo ?? null,
        campaign.valorLiquido ?? null, campaign.competencia ?? null, campaign.origem ?? parsed.data.source ?? "campaign-bundle",
        campaign.observacoes ?? null],
    );
    const createdCampaign = created.rows[0] as { id: number; nome: string; piCodigo: string | null; competencia: string | null };
    const insertionIds: number[] = [];
    for (const insertion of parsed.data.insertions) {
      const result = await client.query(
        `INSERT INTO insertions (
           campanha_id, site_id, local_formato, local_formato_normalizado,
           periodo_inicio, periodo_fim, periodo_original, status_legado,
           status_normalizado, banner_publicado_no_site, print_gerado,
           processo_enviado_agencia, docs_enviados, data_envio_agencia,
           media_url, atrasado, observacoes, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
         RETURNING id`,
        [createdCampaign.id, insertion.siteId ?? null, insertion.localFormato ?? null,
          insertion.localFormatoNormalizado ?? insertion.localFormato ?? null, insertion.periodoInicio ?? null,
          insertion.periodoFim ?? null, insertion.periodoOriginal ?? null, insertion.statusLegado ?? null,
          insertion.statusNormalizado, insertion.bannerPublicadoNoSite ?? false, insertion.printGerado ?? false,
          insertion.processoEnviadoAgencia ?? false, insertion.docsEnviados ?? false, insertion.dataEnvioAgencia ?? null,
          insertion.mediaUrl ?? null, false, insertion.observacoes ?? null],
      );
      insertionIds.push(Number(result.rows[0].id));
    }
    const result = { ok: true, duplicate: false, idempotencyKey, campaign: createdCampaign, insertionIds, createdInsertions: insertionIds.length };
    const jobId = crypto.randomUUID();
    await client.query(
      `INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
       VALUES ($1, 'campaign-bundle-create', 'completed', $2, $3, NULL, $4, NULL, NOW(), NOW())`,
      [jobId, JSON.stringify({ idempotencyKey, requestHash, source: parsed.data.source ?? "campaign-bundle", campaignName: campaign.nome }),
        JSON.stringify(result), parsed.data.requestedBy ?? "adops-panel"],
    );
    await client.query("COMMIT");
    client.release();
    released = true;
    res.status(201).json({ ...result, jobId, visualPreviews: await previewCommittedBundle(insertionIds) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    req.log?.error({ err: error }, "campaign bundle creation failed");
    res.status(500).json({ error: "campaign_bundle_failed", details: "A transação foi revertida; nenhum cadastro parcial foi mantido." });
  } finally {
    if (!released) client.release();
  }
});

export default router;
