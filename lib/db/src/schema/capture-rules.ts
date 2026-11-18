import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const captureRulesTable = pgTable(
  "capture_rules",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    siteSigla: text("site_sigla").notNull(),
    groupId: integer("group_id").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    page: text("page").notNull().default("home"),
    slotSelector: text("slot_selector").notNull(),
    contextSelector: text("context_selector"),
    scrollMode: text("scroll_mode").notNull().default("slot"),
    proofStyle: text("proof_style").notNull().default("viewport_only"),
    auditConfig: jsonb("audit_config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    articleFallbackUrl: text("article_fallback_url"),
    enabled: boolean("enabled").notNull().default(true),
    statusPublished: boolean("status_published").notNull().default(false),
    ruleVersionHash: text("rule_version_hash"),
    publishedVersionId: integer("published_version_id"),
    supersededByRuleId: integer("superseded_by_rule_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("capture_rules_site_group_published_uq")
      .on(table.siteSigla, table.groupId)
      .where(sql`${table.statusPublished} = true`),
    index("capture_rules_site_published_updated_idx").on(table.siteSigla, table.statusPublished, table.updatedAt),
    index("capture_rules_archived_idx").on(table.archivedAt),
  ],
);

export const captureRuleVersionsTable = pgTable(
  "capture_rule_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ruleId: integer("rule_id").notNull(),
    siteSigla: text("site_sigla").notNull(),
    groupId: integer("group_id").notNull(),
    status: text("status").notNull().default("draft"),
    ruleVersionHash: text("rule_version_hash").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("capture_rule_versions_rule_created_idx").on(table.ruleId, table.createdAt),
    index("capture_rule_versions_site_group_created_idx").on(table.siteSigla, table.groupId, table.createdAt),
  ],
);

export const captureRuleValidationsTable = pgTable(
  "capture_rule_validations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ruleId: integer("rule_id").notNull(),
    ruleVersionId: integer("rule_version_id"),
    status: text("status").notNull().default("failed"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    artifacts: jsonb("artifacts").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("capture_rule_validations_rule_created_idx").on(table.ruleId, table.createdAt)],
);

export const captureRulePublishEventsTable = pgTable(
  "capture_rule_publish_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ruleId: integer("rule_id").notNull(),
    siteSigla: text("site_sigla").notNull(),
    groupId: integer("group_id").notNull(),
    eventType: text("event_type").notNull(),
    previousVersionId: integer("previous_version_id"),
    nextVersionId: integer("next_version_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("capture_rule_publish_events_rule_created_idx").on(table.ruleId, table.createdAt)],
);

export const captureRuleRuntimeCacheTable = pgTable(
  "capture_rule_runtime_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    ruleVersionHash: text("rule_version_hash").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("capture_rule_runtime_cache_expires_idx").on(table.expiresAt)],
);

export type CaptureRule = typeof captureRulesTable.$inferSelect;
export type CaptureRuleVersion = typeof captureRuleVersionsTable.$inferSelect;
export type CaptureRuleValidation = typeof captureRuleValidationsTable.$inferSelect;
