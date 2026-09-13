import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const evidencesTable = pgTable("evidences", {
  id: serial("id").primaryKey(),
  insercaoId: integer("insercao_id").notNull(),
  tipo: text("tipo").notNull().default("print"),
  arquivoUrl: text("arquivo_url"),
  titulo: text("titulo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("evidences_insertion_created_idx").on(table.insercaoId, table.criadoEm)]);

export const insertEvidenceSchema = createInsertSchema(evidencesTable).omit({ id: true, criadoEm: true });
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidencesTable.$inferSelect;
