import { pgTable, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

export const captureProofReviewsTable = pgTable("capture_proof_reviews", {
  id: text("id").primaryKey(),
  insertionId: integer("insertion_id").notNull(),
  targetDate: text("target_date").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  decision: text("decision").notNull(),
  note: text("note"),
  reviewedBy: text("reviewed_by").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("capture_proof_reviews_artifact_uidx").on(table.insertionId, table.targetDate, table.artifactSha256),
  index("capture_proof_reviews_lookup_idx").on(table.insertionId, table.targetDate, table.reviewedAt),
]);
