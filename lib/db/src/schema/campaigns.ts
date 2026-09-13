import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  clienteId: integer("cliente_id"),
  agenciaId: integer("agencia_id"),
  piCodigo: text("pi_codigo"),
  projeto: text("projeto"),
  plano: text("plano"),
  planilhaRef: text("planilha_ref"),
  produto: text("produto"),
  praca: text("praca"),
  condicaoPagamento: text("condicao_pagamento"),
  faturamentoTipo: text("faturamento_tipo"),
  valorLiquido: numeric("valor_liquido", { precision: 12, scale: 2 }),
  competencia: text("competencia"),
  origem: text("origem"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("campaigns_competencia_idx").on(table.competencia)]);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
