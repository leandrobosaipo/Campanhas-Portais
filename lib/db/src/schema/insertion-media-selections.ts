import { pgTable, text, timestamp, integer, bigint, uniqueIndex } from "drizzle-orm/pg-core";

export const insertionMediaSelectionsTable = pgTable("insertion_media_selections", {
  id: text("id").primaryKey(),
  insertionId: integer("insertion_id").notNull(),
  driveFileId: text("drive_file_id").notNull(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  bytes: bigint("bytes", { mode: "number" }),
  md5: text("md5"),
  sha256: text("sha256"),
  canonicalUrl: text("canonical_url"),
  siteSigla: text("site_sigla"),
  position: text("position"),
  groupId: integer("group_id"),
  reason: text("reason").notNull(),
  selectedBy: text("selected_by").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("insertion_media_selections_file_uidx").on(table.insertionId, table.driveFileId),
]);
