import { jsonb, pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

/** Appendable promotion ledger. Snapshot fields preserve the exact canonical row/log state. */
export const captureProofCandidatePromotionsTable = pgTable("capture_proof_candidate_promotions", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  insertionId: integer("insertion_id").notNull(),
  targetDate: text("target_date").notNull(),
  sourceJobId: text("source_job_id").notNull(),
  candidateUrl: text("candidate_url").notNull(),
  candidateSha256: text("candidate_sha256").notNull(),
  candidateBytes: integer("candidate_bytes").notNull(),
  originalEvidence: jsonb("original_evidence").$type<Record<string, unknown> | null>(),
  originalLogs: jsonb("original_logs").$type<Array<Record<string, unknown>>>().notNull().default([]),
  archive: jsonb("archive").$type<Record<string, unknown> | null>(),
  finalLogId: text("final_log_id"),
  status: text("status").notNull(),
  audit: jsonb("audit").$type<Record<string, unknown> | null>(),
  failure: text("failure"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("capture_proof_candidate_promotions_candidate_idx").on(table.candidateId, table.receivedAt),
  index("capture_proof_candidate_promotions_insertion_date_idx").on(table.insertionId, table.targetDate, table.receivedAt),
]);
