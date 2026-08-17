CREATE TABLE IF NOT EXISTS ops_incidents (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  layer TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  error_text TEXT,
  evidence_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ops_incidents_status_idx ON ops_incidents(status, updated_at);
CREATE INDEX IF NOT EXISTS ops_incidents_job_idx ON ops_incidents(job_id, updated_at);
