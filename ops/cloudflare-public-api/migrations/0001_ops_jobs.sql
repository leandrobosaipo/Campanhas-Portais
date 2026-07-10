CREATE TABLE IF NOT EXISTS ops_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  result_json TEXT,
  error_text TEXT,
  requested_by TEXT,
  runner_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ops_jobs_status_idx ON ops_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS ops_jobs_kind_idx ON ops_jobs(kind, created_at);
