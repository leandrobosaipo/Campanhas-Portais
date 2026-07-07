import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const printJobsTable = pgTable("print_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  competencia: text("competencia"),
  siteId: integer("site_id"),
  requestedBy: text("requested_by"),
  source: text("source"),
  totalTargets: integer("total_targets").notNull().default(0),
  completedTargets: integer("completed_targets").notNull().default(0),
  failedTargets: integer("failed_targets").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  items: jsonb("items").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
  meta: jsonb("meta").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPrintJobSchema = createInsertSchema(printJobsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type PrintJob = typeof printJobsTable.$inferSelect;
