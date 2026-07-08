# Runbook Rollout v1 — Sem parada

## Fase 0 — Baseline
- Capturar p50/p95 atual das rotas de leitura e validação.
- Capturar query count médio no hot path.
- Confirmar token operacional e papéis RBAC.

## Fase 1 — Backend em feature flag
- Aplicar schema + índices.
- Deploy da API com endpoints novos sem ativar consumo runtime.
- Validar `/api/capture-rules/perf/health`.

## Fase 2 — Validador assíncrono e batch
- Ativar validação individual e em lote.
- Habilitar circuit breaker para concorrência.
- Garantir rate limit e logs estruturados.

## Fase 3 — Painel shadow
- Publicar tela `/captura-config` somente para leitura/validação.
- Manter publicação com acesso restrito (`admin`).

## Fase 4 — Dual-read canário
- Runtime de 1 site piloto consulta DB/cache.
- Demais sites seguem fallback JSON.
- Monitorar SLOs e eventos de erro.

## Fase 5 — Expansão gradual
- Ativar site a site após 24h sem regressão crítica.
- Rodar harness a cada lote de ativação.

## Fase 6 — Estabilização
- DB passa a ser fonte primária.
- JSON vira fallback de contingência/export.
- Congelar mudanças sem validação aprovada.

## Rollback
- Em regressão pontual: `POST /api/capture-rules/:ruleId/rollback`.
- Em regressão sistêmica: desligar feature flag de leitura runtime DB e voltar para fallback JSON.
- Cache runtime é invalidado em publish/rollback.

## Guardrails
- Não publicar sem validação `passed`.
- Não editar regra publicada diretamente.
- Registrar motivo em toda ação de publish/rollback.
- Não promover fase sem passar budgets do harness.
