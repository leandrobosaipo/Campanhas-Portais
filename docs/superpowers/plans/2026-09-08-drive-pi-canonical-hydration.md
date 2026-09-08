# Drive PI Canonical Hydration Implementation Plan

**Goal:** Corrigir o auto-cadastro para reaproveitar campanha e inserção canônicas quando a PI/mídia foram reconhecidas, mas `agenciaId` ou `siteId` ficaram ausentes.

## Plano

- [ ] Adicionar regressão para PI reconhecida com campanha/inserção canônicas únicas.
- [ ] Hidratar somente campos ausentes por PI + competência + portal + formato + período.
- [ ] Manter `needs_review` em ambiguidades ou divergências.
- [ ] Rodar teste focal, sintaxe e builds do runner/API.
- [ ] Implantar release isolada com backup e rollback canônicos.
- [ ] Reprocessar pela API com chave idempotente e acompanhar o mesmo `jobId`.
- [ ] Confirmar campanha/inserção, mídia, AdRotate, página pública e evidência auditada.
- [ ] Se houver falha, registrar causa observada, aplicar o menor reparo e repetir a validação.

## Restrições

- Não inventar IDs, destino ou mídia.
- Não escolher entre duplicatas.
- Reusar mídia entre portais somente com formato compatível e checksum confirmado.
- Não concluir em `queued`, `running` ou apenas HTTP 200.
