import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const captureProofCandidatesTable = pgTable("capture_proof_candidates", {
  id: text("id").primaryKey(),
  insertionId: integer("insertion_id").notNull(),
  targetDate: text("target_date").notNull(),
  sourceJobId: text("source_job_id").notNull(),
  artifactUrl: text("artifact_url").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  artifactBytes: integer("artifact_bytes").notNull(),
  requestedCaptureAt: text("requested_capture_at"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  captureStageStartedAt: timestamp("capture_stage_started_at", { withTimezone: true }).notNull(),
  captureStageFinishedAt: timestamp("capture_stage_finished_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  checklistVersion: text("checklist_version").notNull(),
  historicalDisplayConfirmed: boolean("historical_display_confirmed").notNull().default(false),
  state: text("state").notNull().default("registered"),
}, (table) => [
  uniqueIndex("capture_proof_candidates_job_artifact_uidx").on(table.sourceJobId, table.artifactSha256),
  uniqueIndex("capture_proof_candidates_identity_uidx").on(table.id, table.insertionId, table.targetDate, table.artifactSha256),
  index("capture_proof_candidates_insertion_date_idx").on(table.insertionId, table.targetDate, table.receivedAt),
]);

export const captureProofCandidateReviewsTable = pgTable("capture_proof_candidate_reviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull(),
  insertionId: integer("insertion_id").notNull(),
  targetDate: text("target_date").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  decision: text("decision").notNull(),
  checklistVersion: text("checklist_version").notNull(),
  auditPolicyVersion: text("audit_policy_version"),
  checklist: jsonb("checklist").$type<Record<string, unknown>>().notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  evaluatedBy: text("evaluated_by").notNull(),
}, (table) => [
  index("capture_proof_candidate_reviews_candidate_idx").on(table.candidateId, table.evaluatedAt),
]);

export type CaptureProofCandidate = typeof captureProofCandidatesTable.$inferSelect;
export type CaptureProofCandidateReview = typeof captureProofCandidateReviewsTable.$inferSelect;
