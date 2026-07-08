# Performance v1 — Configuração de Captura/Auditoria

## Objetivos
- Evitar N+1 em listagens.
- Limitar query count no hot path.
- Reduzir latência de resolução da regra de runtime.
- Reduzir custo de validação em lote.

## Estratégia
- Cache L1 (memória processo) com TTL curto.
- Cache L2 (`capture_rule_runtime_cache`) com expiração.
- Consulta O(1) por `siteSigla + groupId` quando disponível.
- Snapshot publicado (`rule_version_hash`) para short-circuit de cache.
- Validação batch (`/validate-batch`) para processar N regras em 1 request.

## Budgets
- `GET /api/capture-rules/runtime`:
  - cache hit: p95 <= 50ms
  - cache miss: <= 1 query principal de regra publicada (+ cache write async)
- Listagens paginadas:
  - sem carregar histórico junto.
- `POST /api/capture-rules/validate-batch`:
  - até 80 regras por execução.
  - sem query por item para leitura inicial (1 leitura paginada + 1 insert em lote).

## Métricas
- `cache_hit_rate`
- `db_query_count`
- `db_time_ms`
- `avgQueriesPerRuntimeCall`
- `routeP50Ms`, `routeP95Ms`
- `validateP95Ms`
- `validationsInFlight`

## Anti-regressão
- Harness compara baseline e resultado atual.
- Publicação bloqueada sem validação.
- Release gate exige orçamento de query e latência no relatório de harness.
