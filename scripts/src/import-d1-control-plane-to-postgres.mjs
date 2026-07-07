#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

const dumpPath = process.argv[2] ? resolve(process.argv[2]) : "";
if (!dumpPath || !existsSync(dumpPath)) {
  console.error("Uso: node scripts/src/import-d1-control-plane-to-postgres.mjs <snapshot-d1.sql>");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL ausente.");
  process.exit(2);
}

const migrationPath = resolve("ops/portainer/adops-stack/migrations/2026-06-03-macmini-control-plane.sql");
if (!existsSync(migrationPath)) {
  console.error(`Migration ausente: ${migrationPath}`);
  process.exit(2);
}

const tables = [
  {
    name: "ops_jobs",
    pk: "id",
    columns: ["id", "kind", "status", "payload_json", "result_json", "error_text", "requested_by", "runner_id", "created_at", "updated_at"],
  },
  {
    name: "cod5_drive_events",
    pk: "event_id",
    columns: ["event_id", "drive_file_id", "name", "mime_type", "path", "parent_folder_id", "modified_time", "web_view_link", "event_type", "payload_json", "job_id", "status", "created_at", "updated_at"],
  },
  {
    name: "cod5_inbound_documents",
    pk: "id",
    columns: ["id", "source", "event_id", "drive_file_id", "original_name", "mime_type", "path", "web_view_link", "content_sha256", "status", "created_at", "updated_at"],
  },
  {
    name: "cod5_document_parse_runs",
    pk: "id",
    columns: ["id", "document_id", "status", "fields_json", "alerts_json", "raw_text_excerpt", "error_text", "created_at", "updated_at"],
  },
];

function sqliteJson(dbPath, sql) {
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", maxBuffer: 1024 * 1024 * 80 });
  return output.trim() ? JSON.parse(output) : [];
}

function normalizeRow(row, columns) {
  const normalized = {};
  for (const column of columns) normalized[column] = row[column] ?? null;
  return normalized;
}

function stablePayload(row, columns) {
  return JSON.stringify(normalizeRow(row, columns));
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const tmp = mkdtempSync(join(tmpdir(), "adops-d1-import-"));
const sqliteDb = join(tmp, "snapshot.sqlite");

try {
  const sqlite = spawnSync("sqlite3", [sqliteDb], {
    input: readFileSync(dumpPath),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  });
  if (sqlite.status !== 0) {
    throw new Error(`sqlite3 import falhou: ${sqlite.stderr || sqlite.stdout}`);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query(readFileSync(migrationPath, "utf8"));

  const report = {
    ok: true,
    dumpPath,
    migrationPath,
    tables: [],
    conflicts: 0,
  };

  for (const table of tables) {
    const rows = sqliteJson(sqliteDb, `SELECT ${table.columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table.name)} ORDER BY ${quoteIdent(table.pk)}`);
    let inserted = 0;
    let identicalSkipped = 0;
    let conflicts = 0;
    const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
    const columnsSql = table.columns.map(quoteIdent).join(", ");
    const insertSql = `INSERT INTO ${quoteIdent(table.name)} (${columnsSql}) VALUES (${placeholders}) ON CONFLICT (${quoteIdent(table.pk)}) DO NOTHING`;

    for (const row of rows) {
      const values = table.columns.map((column) => row[column] ?? null);
      const result = await pool.query(insertSql, values);
      if (result.rowCount === 1) {
        inserted += 1;
        continue;
      }

      const existing = await pool.query(`SELECT ${columnsSql} FROM ${quoteIdent(table.name)} WHERE ${quoteIdent(table.pk)} = $1 LIMIT 1`, [row[table.pk]]);
      const existingRow = existing.rows[0];
      if (existingRow && stablePayload(existingRow, table.columns) === stablePayload(row, table.columns)) {
        identicalSkipped += 1;
        continue;
      }

      conflicts += 1;
      await pool.query(
        `INSERT INTO cod5_control_plane_migration_conflicts (table_name, primary_key, source_payload, target_payload)
         VALUES ($1, $2, $3, $4)`,
        [table.name, String(row[table.pk]), stablePayload(row, table.columns), existingRow ? stablePayload(existingRow, table.columns) : "null"],
      );
    }

    report.tables.push({
      table: table.name,
      source: rows.length,
      inserted,
      identicalSkipped,
      conflicts,
      target: Number((await pool.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table.name)}`)).rows[0]?.count ?? 0),
    });
    report.conflicts += conflicts;
  }

  if (report.conflicts > 0) report.ok = false;
  await pool.end();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
