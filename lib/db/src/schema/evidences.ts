import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const evidencesTable = pgTable("evidences", {
  id: serial("id").primaryKey(),
  insercaoId: integer("insercao_id").notNull(),
  tipo: text("tipo").notNull().default("print"),
  arquivoUrl: text("arquivo_url"),
  titulo: text("titulo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEvidenceSchema = createInsertSchema(evidencesTable).omit({ id: true, criadoEm: true });
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidencesTable.$inferSelect;
