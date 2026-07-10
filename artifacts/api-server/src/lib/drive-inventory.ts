import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const DEFAULT_STALE_MS = 10 * 60_000;

export type DriveInventoryItemInput = {
  driveFileId: string;
  name: string;
  mimeType: string;
  path: string;
  parentFolderId: string | null;
  modifiedTime: string;
  webViewLink: string | null;
  size: string | null;
  checksum: string | null;
};

export async function ensureDriveInventorySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cod5_drive_inventory_scans (
      scan_id TEXT PRIMARY KEY,
      root_folder_id TEXT NOT NULL,
      status TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cod5_drive_inventory_items (
      drive_file_id TEXT NOT NULL,
      modified_time TEXT NOT NULL,
      scan_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      path TEXT NOT NULL,
      parent_folder_id TEXT,
      web_view_link TEXT,
      size_bytes BIGINT,
      checksum TEXT,
      is_current BOOLEAN NOT NULL DEFAULT true,
      scanned_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (drive_file_id, modified_time)
    );
    CREATE INDEX IF NOT EXISTS cod5_drive_inventory_items_current_idx
      ON cod5_drive_inventory_items(is_current, path);
    CREATE INDEX IF NOT EXISTS cod5_drive_inventory_items_scan_idx
      ON cod5_drive_inventory_items(scan_id);
  `);
}

export async function syncDriveInventory(input: {
  scanId: string;
  rootFolderId: string;
  scannedAt: string;
  items: DriveInventoryItemInput[];
}) {
  await ensureDriveInventorySchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ status: string }>(
      "SELECT status FROM cod5_drive_inventory_scans WHERE scan_id = $1 FOR UPDATE",
      [input.scanId],
    );
    if (existing.rows[0]?.status === "completed") {
      await client.query("ROLLBACK");
      return { duplicate: true, scanId: input.scanId, itemCount: input.items.length };
    }
    await client.query(
      `INSERT INTO cod5_drive_inventory_scans
        (scan_id, root_folder_id, status, item_count, started_at, completed_at)
       VALUES ($1, $2, 'syncing', 0, $3, NULL)
       ON CONFLICT (scan_id) DO UPDATE SET status = 'syncing', error_text = NULL`,
      [input.scanId, input.rootFolderId, input.scannedAt],
    );
    await client.query("UPDATE cod5_drive_inventory_items SET is_current = false WHERE is_current = true");
    for (const item of input.items) {
      await client.query(
        `INSERT INTO cod5_drive_inventory_items
          (drive_file_id, modified_time, scan_id, name, mime_type, path, parent_folder_id,
           web_view_link, size_bytes, checksum, is_current, scanned_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
         ON CONFLICT (drive_file_id, modified_time) DO UPDATE SET
           scan_id = EXCLUDED.scan_id,
           name = EXCLUDED.name,
           mime_type = EXCLUDED.mime_type,
           path = EXCLUDED.path,
           parent_folder_id = EXCLUDED.parent_folder_id,
           web_view_link = EXCLUDED.web_view_link,
           size_bytes = EXCLUDED.size_bytes,
           checksum = EXCLUDED.checksum,
           is_current = true,
           scanned_at = EXCLUDED.scanned_at`,
        [
          item.driveFileId,
          item.modifiedTime,
          input.scanId,
          item.name,
          item.mimeType,
          item.path,
          item.parentFolderId,
          item.webViewLink,
          item.size && /^\d+$/.test(item.size) ? item.size : null,
          item.checksum,
          input.scannedAt,
        ],
      );
    }
    await client.query(
      `UPDATE cod5_drive_inventory_scans
          SET status = 'completed', item_count = $1, completed_at = $2
        WHERE scan_id = $3`,
      [input.items.length, input.scannedAt, input.scanId],
    );
    await client.query("COMMIT");
    return { duplicate: false, scanId: input.scanId, itemCount: input.items.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCurrentDriveInventoryItems() {
  await ensureDriveInventorySchema();
  const result = await pool.query<{
    drive_file_id: string;
    name: string;
    mime_type: string;
    path: string;
    parent_folder_id: string | null;
    modified_time: string;
    web_view_link: string | null;
    size_bytes: string | null;
    checksum: string | null;
  }>(`SELECT drive_file_id, name, mime_type, path, parent_folder_id, modified_time,
             web_view_link, size_bytes::text, checksum
        FROM cod5_drive_inventory_items
       WHERE is_current = true
       ORDER BY path`);
  return result.rows.map((row) => ({
    id: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    path: row.path,
    parentFolderId: row.parent_folder_id,
    modifiedTime: row.modified_time,
    webViewLink: row.web_view_link,
    size: row.size_bytes,
    md5Checksum: row.checksum,
  }));
}

export async function getDriveInventoryStatus() {
  await ensureDriveInventorySchema();
  const latest = await pool.query<{
    scan_id: string;
    root_folder_id: string;
    status: string;
    item_count: number;
    completed_at: string | null;
    error_text: string | null;
  }>(`SELECT scan_id, root_folder_id, status, item_count, completed_at::text, error_text
        FROM cod5_drive_inventory_scans
       ORDER BY COALESCE(completed_at, started_at) DESC
       LIMIT 1`);
  const row = latest.rows[0] ?? null;
  const snapshotAt = row?.completed_at ?? null;
  const ageMs = snapshotAt ? Math.max(0, Date.now() - Date.parse(snapshotAt)) : null;
  const staleMs = Number.parseInt(process.env.ADOPS_DRIVE_INVENTORY_STALE_MS ?? String(DEFAULT_STALE_MS), 10);
  const stale = ageMs === null || ageMs > staleMs;
  return {
    snapshotStatus: !row ? "unavailable" : row.status === "completed" ? (stale ? "stale" : "fresh") : row.status,
    snapshotAt,
    snapshotAgeSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
    stale,
    scanId: row?.scan_id ?? null,
    rootFolderId: row?.root_folder_id ?? null,
    itemCount: row?.item_count ?? 0,
    error: row?.error_text ?? null,
  };
}

export async function enqueueDriveInventoryRefresh(requestedBy: string) {
  await ensureDriveInventorySchema();
  const existing = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM ops_jobs
      WHERE kind = 'drive-inventory-refresh'
        AND status IN ('queued', 'ready_for_runner', 'running')
      ORDER BY created_at DESC LIMIT 1`,
  );
  if (existing.rows[0]) return { jobId: existing.rows[0].id, duplicate: true, status: existing.rows[0].status };
  const jobId = randomUUID();
  const scanId = randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO ops_jobs
      (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
     VALUES ($1, 'drive-inventory-refresh', 'ready_for_runner', $2, NULL, NULL, $3, NULL, $4, $4)`,
    [jobId, JSON.stringify({ scanId, source: requestedBy }), requestedBy, now],
  );
  return { jobId, scanId, duplicate: false, status: "ready_for_runner" };
}
