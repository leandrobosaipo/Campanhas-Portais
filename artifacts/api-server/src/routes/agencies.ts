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

function serializeAgency(agency: typeof agenciesTable.$inferSelect) {
  return {
    ...agency,
    createdAt: agency.createdAt.toISOString(),
  };
}

router.get("/agencies", async (_req, res): Promise<void> => {
  const agencies = await db.select().from(agenciesTable).orderBy(agenciesTable.nome);
  res.json(ListAgenciesResponse.parse(agencies.map(serializeAgency)));
});

router.post("/agencies", async (req, res): Promise<void> => {
  const parsed = CreateAgencyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [agency] = await db.insert(agenciesTable).values(parsed.data).returning();
  res.status(201).json(serializeAgency(agency));
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
  if (parsed.data.prazoPagamento !== undefined) updateData.prazoPagamento = parsed.data.prazoPagamento;
  if (parsed.data.prazoEnvioDocs !== undefined) updateData.prazoEnvioDocs = parsed.data.prazoEnvioDocs;
  if (parsed.data.descontoPadraoPercentual !== undefined) updateData.descontoPadraoPercentual = parsed.data.descontoPadraoPercentual;
  if (parsed.data.instrucoesFaturamento !== undefined) updateData.instrucoesFaturamento = parsed.data.instrucoesFaturamento;
  if (parsed.data.exigeAceiteFormal !== undefined) updateData.exigeAceiteFormal = parsed.data.exigeAceiteFormal;
  if (parsed.data.exigeNotaFiscalDetalhada !== undefined) updateData.exigeNotaFiscalDetalhada = parsed.data.exigeNotaFiscalDetalhada;
  if (parsed.data.exigeDeclaracaoArt299 !== undefined) updateData.exigeDeclaracaoArt299 = parsed.data.exigeDeclaracaoArt299;
  if (parsed.data.exigeComprovanteAssinado !== undefined) updateData.exigeComprovanteAssinado = parsed.data.exigeComprovanteAssinado;
  if (parsed.data.exigePrintDiario !== undefined) updateData.exigePrintDiario = parsed.data.exigePrintDiario;
  if (parsed.data.ativo != null) updateData.ativo = parsed.data.ativo;

  const [agency] = await db.update(agenciesTable).set(updateData).where(eq(agenciesTable.id, params.data.id)).returning();
  if (!agency) {
    res.status(404).json({ error: "Agency not found" });
    return;
  }
  res.json(UpdateAgencyResponse.parse(serializeAgency(agency)));
});

export default router;
