CREATE TABLE IF NOT EXISTS monthly_report_refreshes (
  competencia TEXT PRIMARY KEY,
  target_date TEXT NOT NULL,
  dirty_revision INTEGER NOT NULL DEFAULT 0,
  published_revision INTEGER NOT NULL DEFAULT 0,
  active_job_id TEXT,
  debounce_until TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS monthly_report_refreshes_active_idx
ON monthly_report_refreshes(active_job_id, updated_at);
