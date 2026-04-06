import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, evidencesTable } from "@workspace/db";
import {
  CreateEvidenceParams,
  CreateEvidenceBody,
  DeleteEvidenceParams,
  ListEvidencesParams,
  ListEvidencesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  res.status(201).json(evidence);
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
