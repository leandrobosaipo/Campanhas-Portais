import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const adrotatePublicationSnapshotsTable = pgTable("adrotate_publication_snapshots", {
  id: text("id").primaryKey(),
  insertionId: integer("insertion_id").notNull(),
  siteSigla: text("site_sigla").notNull(),
  groupId: integer("group_id"),
  adId: integer("ad_id"),
  mediaUrl: text("media_url"),
  mediaHash: text("media_hash"),
  redirectUrl: text("redirect_url"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  publicPageUrl: text("public_page_url"),
  source: text("source").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("adrotate_publication_snapshots_hash_uidx").on(table.insertionId, table.snapshotHash),
  index("adrotate_publication_snapshots_lookup_idx").on(table.insertionId, table.observedAt),
]);
