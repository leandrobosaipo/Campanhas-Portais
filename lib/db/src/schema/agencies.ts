import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agenciesTable = pgTable("agencies", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  razaoSocial: text("razao_social"),
  cnpj: text("cnpj"),
  telefone: text("telefone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  emailFaturamento: text("email_faturamento"),
  endereco: text("endereco"),
  cidade: text("cidade"),
  uf: text("uf"),
  cep: text("cep"),
  prazoPagamento: text("prazo_pagamento"),
  prazoEnvioDocs: text("prazo_envio_docs"),
  descontoPadraoPercentual: text("desconto_padrao_percentual"),
  instrucoesFaturamento: text("instrucoes_faturamento"),
  exigeAceiteFormal: boolean("exige_aceite_formal").notNull().default(false),
  exigeNotaFiscalDetalhada: boolean("exige_nota_fiscal_detalhada").notNull().default(false),
  exigeDeclaracaoArt299: boolean("exige_declaracao_art299").notNull().default(false),
  exigeComprovanteAssinado: boolean("exige_comprovante_assinado").notNull().default(false),
  exigePrintDiario: boolean("exige_print_diario").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgencySchema = createInsertSchema(agenciesTable).omit({ id: true, createdAt: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agenciesTable.$inferSelect;
