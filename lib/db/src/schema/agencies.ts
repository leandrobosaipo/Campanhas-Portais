import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agenciesTable = pgTable("agencies", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgencySchema = createInsertSchema(agenciesTable).omit({ id: true, createdAt: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agenciesTable.$inferSelect;
