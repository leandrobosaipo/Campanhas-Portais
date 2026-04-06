import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  CreateClientBody,
  UpdateClientParams,
  UpdateClientBody,
  UpdateClientResponse,
  ListClientsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.nome);
  res.json(ListClientsResponse.parse(clients));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  res.status(201).json(client);
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome != null) updateData.nome = parsed.data.nome;
  if (parsed.data.ativo != null) updateData.ativo = parsed.data.ativo;

  const [client] = await db.update(clientsTable).set(updateData).where(eq(clientsTable.id, params.data.id)).returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(UpdateClientResponse.parse(client));
});

export default router;
