import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  sigla: text("sigla").notNull(),
  dominio: text("dominio"),
  siteUrl: text("site_url"),
  artigoExemploUrl: text("artigo_exemplo_url"),
  logoUrl: text("logo_url"),
  serverLabel: text("server_label"),
  sshHost: text("ssh_host"),
  sshPort: text("ssh_port"),
  sshUser: text("ssh_user"),
  webrootPath: text("webroot_path"),
  wpPath: text("wp_path"),
  wpCliPath: text("wp_cli_path"),
  phpBin: text("php_bin"),
  tablePrefix: text("table_prefix"),
  adrotateVersao: text("adrotate_versao"),
  cloudflareZoneId: text("cloudflare_zone_id"),
  cloudflareProjectName: text("cloudflare_project_name"),
  pagesSubdomain: text("pages_subdomain"),
  spacesBucket: text("spaces_bucket"),
  spacesBasePath: text("spaces_base_path"),
  maintenanceWorkspacePath: text("maintenance_workspace_path"),
  deploymentNotes: text("deployment_notes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiteSchema = createInsertSchema(sitesTable).omit({ id: true, createdAt: true });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sitesTable.$inferSelect;
