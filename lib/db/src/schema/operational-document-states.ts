import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const operationalDocumentStatesTable = pgTable(
  "operational_document_states",
  {
    id: serial("id").primaryKey(),
    insertionId: integer("insertion_id").notNull(),
    kind: text("kind").notNull(),
    hiddenAt: timestamp("hidden_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    insertionKindUnique: uniqueIndex("operational_document_states_insertion_kind_idx").on(table.insertionId, table.kind),
  }),
);

export type OperationalDocumentState = typeof operationalDocumentStatesTable.$inferSelect;
