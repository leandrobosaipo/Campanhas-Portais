# PRD v1 — Configuração de Captura/Auditoria

## Objetivo
Padronizar a configuração de captura e auditoria de anúncios com:
- edição controlada por painel,
- validação antes de publicar,
- rollback imediato,
- operação contínua sem parada.

## Problema atual
- Regras em JSON exigem deploy para mudar.
- Mudanças de layout geram regressões de print/auditoria.
- Falta trilha clara de versão/publicação por regra.

## Resultado esperado
- Fonte de verdade em API/DB.
- Fluxo `draft -> validate -> publish`.
- Runtime com cache e fallback seguro.
- Painel responsivo para operação diária.
- Rollout faseado sem parada da operação.

## KPIs
- p95 de leitura de regra no runtime <= 50ms com cache hit.
- 0 regressão crítica de captura por mudança de configuração sem validação.
- MTTR de rollback <= 5 minutos.
- redução de jobs falhos por seletor/layout.

## Jornada operacional
1. Operador cria/edita draft.
2. Operador valida regra.
3. Operador publica versão validada.
4. Runtime passa a usar versão publicada.
5. Em problema, operador executa rollback.

## Requisitos não funcionais
- Segurança:
  - RBAC (`viewer/operator/admin`).
  - sanitização de seletor/URL.
- Performance:
  - budget de p95 no hot path.
  - budget de query por resolução runtime.
- Operação contínua:
  - dual-read e feature flags.
  - rollback imediato por site/regra.
