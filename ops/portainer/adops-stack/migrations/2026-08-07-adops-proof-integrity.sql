BEGIN;

ALTER TABLE insertions ADD COLUMN IF NOT EXISTS canonical_identity_key text;
ALTER TABLE insertions ADD COLUMN IF NOT EXISTS superseded_by_insertion_id integer;
ALTER TABLE insertions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE insertions ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS superseded_by_rule_id integer;
ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS archive_reason text;
CREATE INDEX IF NOT EXISTS capture_rules_archived_idx ON capture_rules(archived_at);

UPDATE capture_rules AS draft
SET superseded_by_rule_id = published.id,
    archived_at = COALESCE(draft.archived_at, now()),
    archive_reason = COALESCE(draft.archive_reason, 'superseded_by_published_rule_2026_08_07')
FROM capture_rules AS published
WHERE draft.status_published = false
  AND draft.archived_at IS NULL
  AND published.status_published = true
  AND published.site_sigla = draft.site_sigla
  AND published.group_id = draft.group_id;

CREATE INDEX IF NOT EXISTS insertions_superseded_by_idx ON insertions(superseded_by_insertion_id);

CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE insertions i
SET canonical_identity_key = 'v1:' || encode(digest(
  concat_ws('|',
    COALESCE(NULLIF(regexp_replace(c.pi_codigo, '[^0-9]', '', 'g'), ''), '-'),
    COALESCE(NULLIF(trim(BOTH '_' FROM regexp_replace(upper(translate(s.sigla, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', '_', 'g')), ''), '-'),
    COALESCE(NULLIF(trim(BOTH '_' FROM regexp_replace(upper(translate(COALESCE(i.local_formato_normalizado, i.local_formato), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9]+', '_', 'g')), ''), '-'),
    COALESCE(NULLIF(trim(BOTH '_' FROM regexp_replace(upper(COALESCE(i.periodo_inicio, '')), '[^A-Z0-9]+', '_', 'g')), ''), '-'),
    COALESCE(NULLIF(trim(BOTH '_' FROM regexp_replace(upper(COALESCE(i.periodo_fim, '')), '[^A-Z0-9]+', '_', 'g')), ''), '-')
  ), 'sha256'), 'hex')
FROM campaigns c, sites s
WHERE i.campanha_id = c.id
  AND i.site_id = s.id
  AND i.canonical_identity_key IS NULL
  AND NULLIF(regexp_replace(c.pi_codigo, '[^0-9]', '', 'g'), '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS insertion_identity_reconciliation_log (
  insertion_id integer PRIMARY KEY,
  canonical_insertion_id integer NOT NULL,
  canonical_identity_key text NOT NULL,
  reason text NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capture_proof_reviews (
  id text PRIMARY KEY,
  insertion_id integer NOT NULL,
  target_date text NOT NULL,
  artifact_sha256 text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  note text,
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS capture_proof_reviews_artifact_uidx ON capture_proof_reviews(insertion_id,target_date,artifact_sha256);
CREATE INDEX IF NOT EXISTS capture_proof_reviews_lookup_idx ON capture_proof_reviews(insertion_id,target_date,reviewed_at DESC);

CREATE TABLE IF NOT EXISTS insertion_media_selections (
  id text PRIMARY KEY,
  insertion_id integer NOT NULL,
  drive_file_id text NOT NULL,
  file_name text,
  mime_type text,
  width integer,
  height integer,
  bytes bigint,
  md5 text,
  sha256 text,
  canonical_url text,
  site_sigla text,
  position text,
  group_id integer,
  reason text NOT NULL,
  selected_by text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS insertion_media_selections_file_uidx ON insertion_media_selections(insertion_id,drive_file_id);

CREATE TABLE IF NOT EXISTS adrotate_publication_snapshots (
  id text PRIMARY KEY,
  insertion_id integer NOT NULL,
  site_sigla text NOT NULL,
  group_id integer,
  ad_id integer,
  media_url text,
  media_hash text,
  redirect_url text,
  period_start text,
  period_end text,
  public_page_url text,
  source text NOT NULL,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS adrotate_publication_snapshots_hash_uidx ON adrotate_publication_snapshots(insertion_id,snapshot_hash);
CREATE INDEX IF NOT EXISTS adrotate_publication_snapshots_lookup_idx ON adrotate_publication_snapshots(insertion_id,observed_at DESC);

-- Duplicata confirmada da PI 14609: preserva histórico e vincula à inserção canônica.
UPDATE insertions AS duplicate
SET superseded_by_insertion_id = canonical.id,
    archived_at = COALESCE(duplicate.archived_at, now()),
    archive_reason = COALESCE(duplicate.archive_reason, 'duplicate_pi_14609_linked_to_1692')
FROM insertions canonical
JOIN campaigns canonical_campaign ON canonical_campaign.id = canonical.campanha_id
JOIN campaigns duplicate_campaign ON duplicate_campaign.pi_codigo = canonical_campaign.pi_codigo
WHERE duplicate.id = 1751
  AND canonical.id = 1692
  AND duplicate.campanha_id = duplicate_campaign.id
  AND duplicate.site_id = canonical.site_id;

INSERT INTO insertion_identity_reconciliation_log (
  insertion_id, canonical_insertion_id, canonical_identity_key, reason
)
SELECT id, superseded_by_insertion_id, canonical_identity_key, archive_reason
FROM insertions
WHERE id = 1751
  AND superseded_by_insertion_id = 1692
  AND canonical_identity_key IS NOT NULL
ON CONFLICT (insertion_id) DO NOTHING;

-- Concilia o passivo real antes do índice. A escolha é determinística, prioriza
-- a canônica conhecida da PI 14609 e, nos demais grupos, a linha com mais
-- evidência operacional. Nada é excluído.
WITH evidence_counts AS (
  SELECT insercao_id, count(*)::integer AS total
  FROM evidences
  GROUP BY insercao_id
), ranked AS (
  SELECT
    i.id,
    i.canonical_identity_key,
    first_value(i.id) OVER (
      PARTITION BY i.canonical_identity_key
      ORDER BY
        CASE WHEN i.id = 1692 THEN 1 ELSE 0 END DESC,
        CASE WHEN i.status_normalizado <> 'cancelado' THEN 1 ELSE 0 END DESC,
        CASE WHEN i.processo_enviado_agencia THEN 1 ELSE 0 END DESC,
        CASE WHEN i.docs_enviados THEN 1 ELSE 0 END DESC,
        CASE WHEN i.print_gerado THEN 1 ELSE 0 END DESC,
        CASE WHEN i.banner_publicado_no_site THEN 1 ELSE 0 END DESC,
        CASE WHEN NULLIF(i.media_url, '') IS NOT NULL THEN 1 ELSE 0 END DESC,
        COALESCE(ec.total, 0) DESC,
        i.updated_at DESC,
        i.id DESC
    ) AS canonical_id,
    count(*) OVER (PARTITION BY i.canonical_identity_key) AS identity_count
  FROM insertions i
  LEFT JOIN evidence_counts ec ON ec.insercao_id = i.id
  WHERE i.canonical_identity_key IS NOT NULL
    AND i.superseded_by_insertion_id IS NULL
    AND i.archived_at IS NULL
), archived AS (
  UPDATE insertions duplicate
  SET superseded_by_insertion_id = ranked.canonical_id,
      archived_at = now(),
      archive_reason = COALESCE(duplicate.archive_reason, 'canonical_identity_backfill_duplicate')
  FROM ranked
  WHERE duplicate.id = ranked.id
    AND ranked.identity_count > 1
    AND ranked.id <> ranked.canonical_id
  RETURNING duplicate.id, ranked.canonical_id, duplicate.canonical_identity_key
)
INSERT INTO insertion_identity_reconciliation_log (
  insertion_id, canonical_insertion_id, canonical_identity_key, reason
)
SELECT id, canonical_id, canonical_identity_key, 'canonical_identity_backfill_duplicate'
FROM archived
ON CONFLICT (insertion_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS insertions_canonical_identity_active_uidx
ON insertions(canonical_identity_key)
WHERE canonical_identity_key IS NOT NULL AND superseded_by_insertion_id IS NULL AND archived_at IS NULL;

COMMIT;
