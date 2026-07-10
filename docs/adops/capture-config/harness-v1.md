# Harness v1 — Configuração de Captura/Auditoria

## Script
- `scripts/src/harness-capture-config-v1.mjs`

## Saídas
- `docs/harness-reports/capture-config/<timestamp>/summary.md`
- `docs/harness-reports/capture-config/<timestamp>/results.json`
- `docs/harness-reports/capture-config/<timestamp>/perf.json`

## Fases testadas
1. Health da API e métricas de perf.
2. CRUD draft de regra.
3. Validação da regra (individual).
4. Validação em lote (`validate-batch`).
5. Publish da regra.
6. Consulta runtime da regra publicada.
7. Rollback da regra.

## Critério de aprovação
- Todos os passos devem retornar `ok=true`.
- `publish` só após `validate passed`.
- `runtime` precisa retornar regra com `source=db_published` quando publicado.
- `perf/health` deve responder e conter métricas.
- Budget mínimo de qualidade:
  - `routeP95Ms <= 250` no final do teste.
  - `avgQueriesPerRuntimeCall <= 1.5`.

## Inputs obrigatórios
- `OPS_API_TOKEN`.
- `ADOPS_PUBLIC_API_BASE_URL` (opcional; default API pública).
- `ADOPS_TEST_ROLE` (opcional; default `admin`).
