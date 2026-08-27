CREATE TABLE IF NOT EXISTS daily_print_alerts (
  fingerprint text PRIMARY KEY,
  target_date date NOT NULL,
  state text NOT NULL,
  pending_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_print_alerts_date_idx
  ON daily_print_alerts(target_date, claimed_at);
