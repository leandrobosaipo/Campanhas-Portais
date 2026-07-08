import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";

export const captureProofLogsTable = pgTable("capture_proof_logs", {
  id: text("id").primaryKey(),
  insertionId: integer("insertion_id").notNull(),
  targetDate: text("target_date").notNull(),
  jobId: text("job_id"),
  runnerJobId: text("runner_job_id"),
  captureAt: text("capture_at"),
  siteSigla: text("site_sigla"),
  status: text("status").notNull().default("ok"),
  uploadedUrl: text("uploaded_url"),
  cacheBustedUrl: text("cache_busted_url"),
  frameSelectionMode: text("frame_selection_mode"),
  frameSelectionDowngraded: boolean("frame_selection_downgraded").notNull().default(false),
  probableCause: text("probable_cause"),
  confidence: integer("confidence"),
  nextAction: text("next_action"),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  stages: jsonb("stages").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
  artifacts: jsonb("artifacts").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CaptureProofLog = typeof captureProofLogsTable.$inferSelect;
