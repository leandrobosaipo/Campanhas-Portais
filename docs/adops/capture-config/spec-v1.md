# SPEC v1 — Configuração de Captura/Auditoria

## Escopo funcional
- Cadastro/edição de regras de captura por `siteSigla + groupId`.
- Versionamento imutável de alterações.
- Validação operacional antes de publicação.
- Publicação e rollback com invalidação de cache.
- Resolução runtime em hot path com leitura O(1) por chave direta.

## Recursos de dados
- `capture_rules`: estado editável + ponteiro para versão publicada.
- `capture_rule_versions`: histórico imutável da regra.
- `capture_rule_validations`: resultados de validação (individual e batch).
- `capture_rule_publish_events`: trilha de publish/rollback.
- `capture_rule_runtime_cache`: cache distribuído para resolução runtime.

## Endpoints
- `GET /api/capture-rules?siteSigla=&page=&status=&cursor=&limit=`
- `GET /api/capture-rules/:ruleId`
- `POST /api/capture-rules`
- `PATCH /api/capture-rules/:ruleId`
- `POST /api/capture-rules/:ruleId/validate`
- `POST /api/capture-rules/validate-batch`
- `POST /api/capture-rules/:ruleId/publish`
- `POST /api/capture-rules/:ruleId/rollback`
- `GET /api/capture-rules/:ruleId/versions?cursor=&limit=`
- `GET /api/capture-rules/:ruleId/validations?cursor=&limit=`
- `GET /api/capture-rules/runtime?siteSigla=&groupId=|localFormato=`
- `GET /api/capture-rules/perf/health`
- `GET /api/capture-rules/presets`

## Contratos e invariantes
- Fluxo obrigatório: `draft -> validate -> publish`.
- `publish` exige última validação com `status = passed`.
- `rollback` exige `versionId` explícito.
- Runtime usa regra publicada quando existir; fallback JSON local só quando DB não resolver.
- Sanitização obrigatória de `slotSelector`, `contextSelector` e `articleFallbackUrl`.

## Estados
- Regra: `statusPublished=true|false`.
- Validação: `passed|failed`.
- Evento: `publish|rollback`.

## Performance
- Hot path:
  - cache hit L1: `0 query`.
  - cache hit L2: `1 query`.
  - cache miss com `groupId`: `1 query principal` (+ write cache).
- Listagem sempre paginada (sem histórico embutido para evitar N+1).
- Validação em lote para reduzir round-trips de rede e custos de conexão.

## Segurança
- RBAC por papel:
  - `viewer`: leitura.
  - `operator`: draft + validate.
  - `admin`: publish + rollback.
- Rate limit em mutações.
- Circuit breaker de validação por concorrência.
