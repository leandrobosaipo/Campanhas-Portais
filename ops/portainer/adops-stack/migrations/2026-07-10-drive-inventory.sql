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
