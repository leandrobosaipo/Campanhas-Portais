-- Índices de leitura do relatório mensal dinâmico.
-- Rollback: remover somente estes quatro índices com DROP INDEX IF EXISTS.
CREATE INDEX IF NOT EXISTS campaigns_competencia_idx
  ON campaigns (competencia);
CREATE INDEX IF NOT EXISTS insertions_campaign_period_idx
  ON insertions (campanha_id, periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS evidences_insertion_created_idx
  ON evidences (insercao_id, criado_em);
CREATE INDEX IF NOT EXISTS capture_proof_report_idx
  ON capture_proof_logs (insertion_id, target_date, updated_at DESC);
