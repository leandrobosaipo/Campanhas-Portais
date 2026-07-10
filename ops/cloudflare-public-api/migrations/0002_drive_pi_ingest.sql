CREATE TABLE IF NOT EXISTS cod5_drive_events (
  event_id TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_folder_id TEXT,
  modified_time TEXT NOT NULL,
  web_view_link TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  job_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cod5_drive_events_file_idx ON cod5_drive_events(drive_file_id, modified_time);
CREATE INDEX IF NOT EXISTS cod5_drive_events_status_idx ON cod5_drive_events(status, updated_at);

CREATE TABLE IF NOT EXISTS cod5_inbound_documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  web_view_link TEXT,
  content_sha256 TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cod5_inbound_documents_event_idx ON cod5_inbound_documents(event_id);
CREATE INDEX IF NOT EXISTS cod5_inbound_documents_status_idx ON cod5_inbound_documents(status, updated_at);

CREATE TABLE IF NOT EXISTS cod5_document_parse_runs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL,
  fields_json TEXT,
  alerts_json TEXT,
  raw_text_excerpt TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cod5_document_parse_runs_document_idx ON cod5_document_parse_runs(document_id, created_at);
