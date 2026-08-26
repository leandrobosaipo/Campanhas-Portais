CREATE TABLE IF NOT EXISTS daily_print_alerts (
  fingerprint TEXT PRIMARY KEY,
  target_date TEXT NOT NULL,
  state TEXT NOT NULL,
  pending_ids_json TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS daily_print_alerts_date_idx
  ON daily_print_alerts(target_date, claimed_at);
