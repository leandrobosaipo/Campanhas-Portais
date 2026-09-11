import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, evidencesTable, insertionsTable } from "@workspace/db";
import {
  CreateEvidenceParams,
  CreateEvidenceBody,
  DeleteEvidenceParams,
  ListEvidencesParams,
  ListEvidencesResponse,
} from "@workspace/api-zod";
import { cod5_criarJobOperacional, cod5_obterJobOperacional } from "../lib/ops-job-store";
import { CampaignEvidenceExportConflict, normalizeCompetenciaMonthKey } from "../lib/campaign-evidence-export";
import { describeCampaignEvidenceExport } from "./insertions";

const router: IRouter = Router();

function cod5_lerInteiroLimitado(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

async function cod5_criarJobExportacaoEvidencias(
  body: Record<string, unknown>,
  requestedKey = "",
  allowHistoricalCutoff = false,
) {
  const piCodigo = String(body.piCodigo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const competencia = normalizeCompetenciaMonthKey(body.competencia);
  const asOfDate = typeof body.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.asOfDate)
    ? body.asOfDate
    : "";
  if (body.asOfDate !== undefined && !allowHistoricalCutoff) return { status: 403, payload: { error: "as_of_date_requires_authenticated_batch" } };
  if (body.asOfDate !== undefined && !asOfDate) {
    return { status: 400, payload: { error: "bad_request", details: "asOfDate deve estar no formato YYYY-MM-DD." } };
  }
  if (!piCodigo) {
    return { status: 409, payload: { error: "campaign_identity_conflict", details: "A campanha precisa de PI canônica para gerar o pacote completo." } };
  }
  if (!competencia) {
    return { status: 400, payload: { error: "bad_request", details: "Informe competencia para gerar o pacote completo da campanha." } };
  }

  const descriptor = await describeCampaignEvidenceExport(piCodigo, competencia, asOfDate || undefined);
  if (!descriptor) {
    return { status: 404, payload: { error: "Campaign not found" } };
  }
  if (descriptor.readiness?.ready !== true) {
    return {
      status: 409,
      payload: { error: "campaign_evidence_incomplete", details: "Há evidências ausentes, inválidas ou inacessíveis.", ...descriptor },
    };
  }

  const imageMaxWidth = cod5_lerInteiroLimitado(body.imageMaxWidth, 800, 2560, 1600);
  const imageQuality = cod5_lerInteiroLimitado(body.imageQuality, 45, 90, 72);
  if (requestedKey && !/^[A-Za-z0-9._:-]{8,160}$/.test(requestedKey)) {
    return { status: 400, payload: { error: "bad_request", details: "Idempotency-Key inválida." } };
  }
  const evidenceFingerprint = Array.isArray(descriptor.evidences) ? descriptor.evidences : [];
  const idempotencyKey = `campaign-evidence-v1-${createHash("sha256").update(JSON.stringify({
    piCodigo,
    competencia,
    asOfDate: asOfDate || null,
    mode: "prints-only",
    variant: "web",
    imageMaxWidth,
    imageQuality,
    requestedKey: requestedKey || null,
    evidences: evidenceFingerprint,
  })).digest("hex")}`;
  const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy : "adops-public-api";
  const created = await cod5_criarJobOperacional({
    kind: "campaign-evidence-export",
    payload: {
      piCodigo,
      competencia,
      asOfDate: asOfDate || null,
      mode: "prints-only",
      variant: "web",
      imageMaxWidth,
      imageQuality,
      evidenceFingerprint,
      evidenceFingerprintSignature: descriptor.evidenceFingerprintSignature,
      insertionIds: descriptor.insertionIds,
      siteSiglas: descriptor.siteSiglas,
      evidenceCount: descriptor.evidenceCount,
      campaignName: descriptor.campaignName,
      requestedBy,
      source: typeof body.source === "string" ? body.source : "api-server",
    },
    requestedBy,
    idempotencyKey,
    retryFailed: true,
  });
  return {
    status: created.duplicate ? 200 : 202,
    payload: {
      ok: true,
      jobId: created.job.id,
      kind: "campaign-evidence-export",
      status: created.job.status,
      duplicate: created.duplicate,
      cacheHit: created.duplicate && created.job.status === "completed",
      piCodigo,
      competencia,
      asOfDate: asOfDate || null,
      mode: "prints-only",
      variant: "web",
      imageMaxWidth,
      imageQuality,
      insertionIds: descriptor.insertionIds,
      siteSiglas: descriptor.siteSiglas,
      evidenceCount: descriptor.evidenceCount,
    },
  };
}

function cod5_respostaJobExportacaoEvidencias(job: NonNullable<Awaited<ReturnType<typeof cod5_obterJobOperacional>>>) {
  const payload = job.payload ?? {};
  const result = job.result ?? {};
  const execution = result.execution && typeof result.execution === "object" && !Array.isArray(result.execution)
    ? result.execution as Record<string, unknown>
    : result;
  return {
    id: job.id,
    jobId: job.id,
    kind: "campaign-evidence-export",
    status: job.status,
    stage: typeof execution.stage === "string" ? execution.stage : null,
    piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
    competencia: typeof payload.competencia === "string" ? payload.competencia : null,
    mode: "prints-only",
    variant: "web",
    insertionIds: Array.isArray(execution.insertionIds) ? execution.insertionIds : [],
    siteSiglas: Array.isArray(execution.siteSiglas) ? execution.siteSiglas : [],
    evidenceCount: typeof execution.evidenceCount === "number" ? execution.evidenceCount : null,
    downloadUrl: typeof execution.downloadUrl === "string" ? execution.downloadUrl : null,
    artifactBytes: typeof execution.artifactBytes === "number" ? execution.artifactBytes : null,
    artifactSha256: typeof execution.artifactSha256 === "string" ? execution.artifactSha256 : null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
  };
}

router.post("/campaign-evidence-exports/jobs", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const result = await cod5_criarJobExportacaoEvidencias(
      req.body as Record<string, unknown>,
      req.header("idempotency-key")?.trim() ?? "",
    );
    res.status(result.status).json(result.payload);
  } catch (error) {
    const status = error instanceof CampaignEvidenceExportConflict ? error.statusCode : 500;
    res.status(status).json({
      error: status === 409 && error instanceof Error ? error.message : "Falha ao criar o pacote completo da campanha.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/campaign-evidence-exports/jobs/batch", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const body = req.body as Record<string, unknown>;
  const competencia = normalizeCompetenciaMonthKey(body.competencia);
  const campaigns = Array.isArray(body.campaigns) ? body.campaigns : [];
  const piCodes = Array.from(new Set(campaigns
    .map((item) => String((item as Record<string, unknown>)?.piCodigo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, ""))
    .filter(Boolean)));
  if (!competencia) {
    res.status(400).json({ error: "bad_request", details: "Informe competencia para gerar o lote de campanhas." });
    return;
  }
  if (!piCodes.length) {
    res.status(400).json({ error: "bad_request", details: "Informe ao menos uma campanha com PI canônica." });
    return;
  }
  if (piCodes.length > 25) {
    res.status(400).json({ error: "bad_request", details: "O lote operacional aceita no máximo 25 campanhas." });
    return;
  }

  const items: Array<Record<string, unknown> & { piCodigo: string; httpStatus: number }> = [];
  for (let offset = 0; offset < piCodes.length; offset += 3) {
    const chunk = await Promise.all(piCodes.slice(offset, offset + 3).map(async (piCodigo) => {
      try {
        const result = await cod5_criarJobExportacaoEvidencias({ ...body, piCodigo, competencia }, "", true);
        return { piCodigo, httpStatus: result.status, ...result.payload };
      } catch (error) {
        const httpStatus = error instanceof CampaignEvidenceExportConflict ? error.statusCode : 500;
        return { piCodigo, httpStatus, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    items.push(...chunk);
  }
  const cacheHits = items.filter((item) => item.cacheHit === true).length;
  const accepted = items.filter((item) => item.httpStatus === 200 || item.httpStatus === 202).length;
  res.setHeader("Cache-Control", "no-store");
  res.status(accepted !== items.length ? 409 : cacheHits === items.length ? 200 : 202).json({
    ok: accepted === items.length,
    competencia,
    counts: { total: items.length, accepted, cacheHits, queued: accepted - cacheHits, blocked: items.length - accepted },
    items,
  });
});

router.get("/campaign-evidence-exports/jobs/:jobId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const job = await cod5_obterJobOperacional(req.params.jobId, "campaign-evidence-export");
  if (!job) {
    res.status(404).json({ error: "Campaign evidence export job not found" });
    return;
  }
  res.json(cod5_respostaJobExportacaoEvidencias(job));
});

router.get("/campaign-evidence-exports/jobs/:jobId/download", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const job = await cod5_obterJobOperacional(req.params.jobId, "campaign-evidence-export");
  if (!job) {
    res.status(404).json({ error: "Campaign evidence export job not found" });
    return;
  }
  const payload = cod5_respostaJobExportacaoEvidencias(job);
  if (payload.status !== "completed" || !payload.downloadUrl) {
    res.status(409).json({ error: "export_not_ready", details: "O pacote completo da campanha ainda não terminou.", job: payload });
    return;
  }
  res.redirect(302, payload.downloadUrl);
});

router.get("/insertions/:insertionId/evidences", async (req, res): Promise<void> => {
  const params = ListEvidencesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const evidences = await db
    .select()
    .from(evidencesTable)
    .where(eq(evidencesTable.insercaoId, params.data.insertionId))
    .orderBy(evidencesTable.criadoEm);
  res.json(ListEvidencesResponse.parse(evidences));
});

router.post("/insertions/:insertionId/evidences", async (req, res): Promise<void> => {
  const params = CreateEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateEvidenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [evidence] = await db.insert(evidencesTable).values({
    insercaoId: params.data.insertionId,
    tipo: parsed.data.tipo,
    arquivoUrl: parsed.data.arquivoUrl ?? null,
    titulo: parsed.data.titulo ?? null,
  }).returning();
  if (parsed.data.tipo === "print") {
    await db.update(insertionsTable)
      .set({ printGerado: true, updatedAt: new Date() })
      .where(eq(insertionsTable.id, params.data.insertionId));
  }
  res.status(201).json(evidence);
});

router.patch("/evidences/:id", async (req, res): Promise<void> => {
  const params = DeleteEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateEvidenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [evidence] = await db.update(evidencesTable).set({
    tipo: parsed.data.tipo,
    arquivoUrl: parsed.data.arquivoUrl ?? null,
    titulo: parsed.data.titulo ?? null,
  }).where(eq(evidencesTable.id, params.data.id)).returning();

  if (!evidence) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }

  res.json(evidence);
});

router.delete("/evidences/:id", async (req, res): Promise<void> => {
  const params = DeleteEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(evidencesTable).where(eq(evidencesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
