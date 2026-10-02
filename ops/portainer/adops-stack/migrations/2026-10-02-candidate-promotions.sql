BEGIN;
CREATE TABLE IF NOT EXISTS capture_proof_candidate_promotions (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES capture_proof_candidates(id),
  insertion_id integer NOT NULL,
  target_date text NOT NULL,
  source_job_id text NOT NULL,
  candidate_url text NOT NULL,
  candidate_sha256 text NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  candidate_bytes integer NOT NULL CHECK (candidate_bytes > 0),
  original_evidence jsonb,
  original_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  archive jsonb,
  final_log_id text,
  status text NOT NULL CHECK (status IN ('archived','promoting','awaiting_readback','approved','rolled_back','blocked')),
  audit jsonb,
  failure text,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capture_proof_candidate_promotions_candidate_idx
  ON capture_proof_candidate_promotions(candidate_id, received_at DESC);
CREATE INDEX IF NOT EXISTS capture_proof_candidate_promotions_insertion_date_idx
  ON capture_proof_candidate_promotions(insertion_id, target_date, received_at DESC);
COMMIT;
