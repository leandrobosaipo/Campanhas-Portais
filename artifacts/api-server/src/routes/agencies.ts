import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agenciesTable } from "@workspace/db";
import {
  CreateAgencyBody,
  UpdateAgencyParams,
  UpdateAgencyBody,
  UpdateAgencyResponse,
  ListAgenciesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/agencies", async (_req, res): Promise<void> => {
  const agencies = await db.select().from(agenciesTable).orderBy(agenciesTable.nome);
  res.json(ListAgenciesResponse.parse(agencies));
});

router.post("/agencies", async (req, res): Promise<void> => {
  const parsed = CreateAgencyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [agency] = await db.insert(agenciesTable).values(parsed.data).returning();
  res.status(201).json(agency);
});

router.patch("/agencies/:id", async (req, res): Promise<void> => {
  const params = UpdateAgencyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAgencyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome != null) updateData.nome = parsed.data.nome;
  if (parsed.data.ativo != null) updateData.ativo = parsed.data.ativo;

  const [agency] = await db.update(agenciesTable).set(updateData).where(eq(agenciesTable.id, params.data.id)).returning();
  if (!agency) {
    res.status(404).json({ error: "Agency not found" });
    return;
  }
  res.json(UpdateAgencyResponse.parse(agency));
});

export default router;
