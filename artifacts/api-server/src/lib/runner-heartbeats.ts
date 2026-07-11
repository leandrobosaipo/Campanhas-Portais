import { pool } from "@workspace/db";

export type RunnerHeartbeatInput = {
  runnerId: string;
  version: string | null;
  capabilities: Record<string, unknown>;
  lastCycleAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export async function ensureRunnerHeartbeatSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cod5_runner_heartbeats (
      runner_id text PRIMARY KEY,
      version text,
      capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_cycle_at timestamptz NOT NULL,
      last_success_at timestamptz,
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function upsertRunnerHeartbeat(input: RunnerHeartbeatInput) {
  await ensureRunnerHeartbeatSchema();
  await pool.query(
    `INSERT INTO cod5_runner_heartbeats
       (runner_id, version, capabilities_json, last_cycle_at, last_success_at, last_error, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6, now())
     ON CONFLICT (runner_id) DO UPDATE SET
       version = EXCLUDED.version,
       capabilities_json = EXCLUDED.capabilities_json,
       last_cycle_at = EXCLUDED.last_cycle_at,
       last_success_at = EXCLUDED.last_success_at,
       last_error = EXCLUDED.last_error,
       updated_at = now()`,
    [input.runnerId, input.version, JSON.stringify(input.capabilities), input.lastCycleAt, input.lastSuccessAt, input.lastError],
  );
}

export async function listRunnerHeartbeats() {
  await ensureRunnerHeartbeatSchema();
  const result = await pool.query<{
    runner_id: string;
    version: string | null;
    capabilities_json: Record<string, unknown> | null;
    last_cycle_at: string;
    last_success_at: string | null;
    last_error: string | null;
    updated_at: string;
  }>(`SELECT runner_id, version, capabilities_json, last_cycle_at::text, last_success_at::text, last_error, updated_at::text
        FROM cod5_runner_heartbeats
       ORDER BY updated_at DESC
       LIMIT 20`);
  return result.rows;
}
