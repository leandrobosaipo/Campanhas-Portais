BEGIN;

CREATE TABLE IF NOT EXISTS capture_proof_candidates (
  id text PRIMARY KEY,
  insertion_id integer NOT NULL,
  target_date text NOT NULL,
  source_job_id text NOT NULL,
  artifact_url text NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_bytes integer NOT NULL CHECK (artifact_bytes > 0),
  requested_capture_at text,
  captured_at timestamptz NOT NULL,
  capture_stage_started_at timestamptz NOT NULL,
  capture_stage_finished_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL,
  checklist_version text NOT NULL,
  historical_display_confirmed boolean NOT NULL DEFAULT false CHECK (historical_display_confirmed = false),
  state text NOT NULL DEFAULT 'registered' CHECK (state = 'registered')
);
CREATE UNIQUE INDEX IF NOT EXISTS capture_proof_candidates_job_artifact_uidx
  ON capture_proof_candidates(source_job_id, artifact_sha256);
CREATE UNIQUE INDEX IF NOT EXISTS capture_proof_candidates_identity_uidx
  ON capture_proof_candidates(id, insertion_id, target_date, artifact_sha256);
CREATE INDEX IF NOT EXISTS capture_proof_candidates_insertion_date_idx
  ON capture_proof_candidates(insertion_id, target_date, received_at DESC);

CREATE TABLE IF NOT EXISTS capture_proof_candidate_reviews (
  id text PRIMARY KEY,
  candidate_id text NOT NULL REFERENCES capture_proof_candidates(id),
  insertion_id integer NOT NULL,
  target_date text NOT NULL,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  decision text NOT NULL CHECK (decision IN ('candidate_approved','candidate_blocked')),
  checklist_version text NOT NULL,
  audit_policy_version text,
  checklist jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  evaluated_by text NOT NULL,
  CONSTRAINT capture_proof_candidate_review_identity_fk
    FOREIGN KEY (candidate_id, insertion_id, target_date, artifact_sha256)
    REFERENCES capture_proof_candidates(id, insertion_id, target_date, artifact_sha256)
);
CREATE INDEX IF NOT EXISTS capture_proof_candidate_reviews_candidate_idx
  ON capture_proof_candidate_reviews(candidate_id, evaluated_at DESC);

CREATE OR REPLACE FUNCTION reject_capture_candidate_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'capture candidate records are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS capture_proof_candidates_immutable ON capture_proof_candidates;
CREATE TRIGGER capture_proof_candidates_immutable
  BEFORE UPDATE OR DELETE ON capture_proof_candidates
  FOR EACH ROW EXECUTE FUNCTION reject_capture_candidate_mutation();
DROP TRIGGER IF EXISTS capture_proof_candidate_reviews_immutable ON capture_proof_candidate_reviews;
CREATE TRIGGER capture_proof_candidate_reviews_immutable
  BEFORE UPDATE OR DELETE ON capture_proof_candidate_reviews
  FOR EACH ROW EXECUTE FUNCTION reject_capture_candidate_mutation();

COMMIT;
