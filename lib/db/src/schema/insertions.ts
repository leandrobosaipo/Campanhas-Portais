import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const insertionsTable = pgTable("insertions", {
  id: serial("id").primaryKey(),
  campanhaId: integer("campanha_id").notNull(),
  siteId: integer("site_id"),
  localFormato: text("local_formato"),
  localFormatoNormalizado: text("local_formato_normalizado"),
  periodoInicio: text("periodo_inicio"),
  periodoFim: text("periodo_fim"),
  periodoOriginal: text("periodo_original"),
  statusLegado: text("status_legado"),
  statusNormalizado: text("status_normalizado").notNull().default("rascunho"),
  bannerPublicadoNoSite: boolean("banner_publicado_no_site").notNull().default(false),
  printGerado: boolean("print_gerado").notNull().default(false),
  processoEnviadoAgencia: boolean("processo_enviado_agencia").notNull().default(false),
  docsEnviados: boolean("docs_enviados").notNull().default(false),
  dataEnvioAgencia: text("data_envio_agencia"),
  mediaUrl: text("media_url"),
  atrasado: boolean("atrasado").notNull().default(false),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInsertionSchema = createInsertSchema(insertionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInsertion = z.infer<typeof insertInsertionSchema>;
export type Insertion = typeof insertionsTable.$inferSelect;
