import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  sigla: text("sigla").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiteSchema = createInsertSchema(sitesTable).omit({ id: true, createdAt: true });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sitesTable.$inferSelect;
