CREATE TABLE IF NOT EXISTS cod5_runner_heartbeats (
  runner_id text PRIMARY KEY,
  version text,
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_cycle_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
