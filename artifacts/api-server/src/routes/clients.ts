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

function serializeClient(client: typeof clientsTable.$inferSelect) {
  return {
    ...client,
    createdAt: client.createdAt.toISOString(),
  };
}

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.nome);
  res.json(ListClientsResponse.parse(clients.map(serializeClient)));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  res.status(201).json(serializeClient(client));
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
  if (parsed.data.razaoSocial !== undefined) updateData.razaoSocial = parsed.data.razaoSocial;
  if (parsed.data.cnpj !== undefined) updateData.cnpj = parsed.data.cnpj;
  if (parsed.data.telefone !== undefined) updateData.telefone = parsed.data.telefone;
  if (parsed.data.whatsapp !== undefined) updateData.whatsapp = parsed.data.whatsapp;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.emailFaturamento !== undefined) updateData.emailFaturamento = parsed.data.emailFaturamento;
  if (parsed.data.endereco !== undefined) updateData.endereco = parsed.data.endereco;
  if (parsed.data.cidade !== undefined) updateData.cidade = parsed.data.cidade;
  if (parsed.data.uf !== undefined) updateData.uf = parsed.data.uf;
  if (parsed.data.cep !== undefined) updateData.cep = parsed.data.cep;
  if (parsed.data.contatoResponsavel !== undefined) updateData.contatoResponsavel = parsed.data.contatoResponsavel;
  if (parsed.data.cargoResponsavel !== undefined) updateData.cargoResponsavel = parsed.data.cargoResponsavel;
  if (parsed.data.prazoPagamento !== undefined) updateData.prazoPagamento = parsed.data.prazoPagamento;
  if (parsed.data.prazoEnvioDocs !== undefined) updateData.prazoEnvioDocs = parsed.data.prazoEnvioDocs;
  if (parsed.data.faturamentoTipoPadrao !== undefined) updateData.faturamentoTipoPadrao = parsed.data.faturamentoTipoPadrao;
  if (parsed.data.instrucoesFaturamento !== undefined) updateData.instrucoesFaturamento = parsed.data.instrucoesFaturamento;
  if (parsed.data.observacoes !== undefined) updateData.observacoes = parsed.data.observacoes;
  if (parsed.data.exigeAceiteFormal !== undefined) updateData.exigeAceiteFormal = parsed.data.exigeAceiteFormal;
  if (parsed.data.exigeNotaFiscalDetalhada !== undefined) updateData.exigeNotaFiscalDetalhada = parsed.data.exigeNotaFiscalDetalhada;
  if (parsed.data.exigeDeclaracaoArt299 !== undefined) updateData.exigeDeclaracaoArt299 = parsed.data.exigeDeclaracaoArt299;
  if (parsed.data.exigeComprovanteAssinado !== undefined) updateData.exigeComprovanteAssinado = parsed.data.exigeComprovanteAssinado;
  if (parsed.data.exigePrintDiario !== undefined) updateData.exigePrintDiario = parsed.data.exigePrintDiario;
  if (parsed.data.ativo != null) updateData.ativo = parsed.data.ativo;

  const [client] = await db.update(clientsTable).set(updateData).where(eq(clientsTable.id, params.data.id)).returning();
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(UpdateClientResponse.parse(serializeClient(client)));
});

export default router;
