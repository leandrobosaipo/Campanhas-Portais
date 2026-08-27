CREATE TABLE IF NOT EXISTS daily_print_recoveries (
  target_date TEXT NOT NULL,
  insertion_id INTEGER NOT NULL,
  source_batch_job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER NOT NULL DEFAULT 0,
  active_job_id TEXT,
  next_attempt_at TEXT,
  human_cause TEXT,
  technical_cause TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (target_date, insertion_id)
);

CREATE INDEX IF NOT EXISTS daily_print_recoveries_status_idx
  ON daily_print_recoveries(status, next_attempt_at);
