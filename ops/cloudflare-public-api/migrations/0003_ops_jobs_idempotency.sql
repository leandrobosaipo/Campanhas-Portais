CREATE UNIQUE INDEX IF NOT EXISTS ops_jobs_idempotency_idx
ON ops_jobs(kind, json_extract(payload_json, '$.idempotencyKey'))
WHERE json_extract(payload_json, '$.idempotencyKey') IS NOT NULL;
