# Decision Log — Capture Config

## 2026-04-23
- Fonte de verdade de configuração: DB/API.
- Fluxo obrigatório: `draft -> validate -> publish`.
- Runtime com cache em duas camadas e fallback local.
- Publicação e rollback somente por perfil `admin`.
- Listagens com paginação para evitar N+1 e payload excessivo.
- Índice parcial de unicidade para regra publicada (`siteSigla + groupId` quando `statusPublished=true`).
- Validação batch (`POST /api/capture-rules/validate-batch`) para reduzir round-trips.
- Circuit breaker de validação para segurar carga em horários de pico.
