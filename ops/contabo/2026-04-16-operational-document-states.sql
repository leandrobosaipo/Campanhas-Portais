CREATE TABLE IF NOT EXISTS operational_document_states (
  id serial PRIMARY KEY,
  insertion_id integer NOT NULL,
  kind text NOT NULL,
  hidden_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS operational_document_states_insertion_kind_idx
  ON operational_document_states (insertion_id, kind);
