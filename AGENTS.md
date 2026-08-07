# AdOps — Instruções do Projeto Codex

Este projeto é a fonte operacional do AdOps fora do OpenClaw.

Raiz oficial:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

Origem histórica migrada:

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

Não assuma que a pasta antiga é a fonte atual. Use a pasta deste projeto para código, documentação, scripts, `.env` locais e runbooks.

## Postura obrigatória

- Detectar contexto real antes de alterar.
- Reutilizar scripts existentes.
- Não inventar endpoints, variáveis, credenciais, PIs, dados de planilha ou configurações de AdRotate.
- Não expor tokens, secrets, headers de autorização ou credenciais.
- Preferir correção simples, auditável e reversível.
- Preservar operação em produção: nunca quebrar prints, planilha, AdRotate, Telegram ou Cloudflare por mudança não testada.
- Ao trabalhar com PI, a prioridade de fonte é: PDF/email da PI, depois planilha, depois AdOps, depois AdRotate.
- Em caso de divergência, registrar a divergência e corrigir sem duplicar anúncio, campanha ou inserção.

## Mapa rápido

- Visão inicial: `docs/START_HERE_ADOPS.md`
- Mapa técnico: `docs/PROJECT_MAP_ADOPS.md`
- Credenciais e `.env`: `docs/CREDENTIALS_AND_ENV_ADOPS.md`
- Migração OpenClaw -> Codex: `docs/MIGRATION_FROM_OPENCLAW_ADOPS.md`
- Base ampla do projeto: `docs/base-de-conhecimento-do-projeto.md`
- Status consolidado: `docs/status-do-projeto.md`
- Configuração de captura/auditoria: `docs/adops/capture-config/README.md`
- Prints retroativos: `docs/prints-retroativos.md`
- Sincronização planilha/AdRotate: `docs/spec-reconcile-planilha-adrotate-v1.md`
- Telegram: `docs/fluxos-telegram-bot-adops.md`
- Cloudflare/VPS: `docs/operacao-pages-vps-2026-04-14.md`
- Fila de campanhas aguardando mídia: `docs/adops/fila-midias-planilha.md`

## Fluxo para nova PI

1. Conferir PI/email/PDF e identificar campanha, cliente, agência, portal, posição, período, mídia e destino.
2. Sincronizar planilha.
3. Verificar se campanha/inserção já existem no AdOps.
4. Verificar AdRotate do portal e evitar duplicidade.
5. Vincular anúncio existente ao AdOps quando já houver publicação.
6. Atualizar mídia e status no AdOps.
7. Limpar cache do portal.
8. Gerar prints obrigatórios, incluindo retroativos em aberto.
9. Validar auditoria por data.
10. Confirmar `pixelDateProof.ok=true` no PNG final.
11. Para retroativo, correção ou retrabalho rejeitado, aprovar o hash exato pela API.
12. Enviar somente pelo job assíncrono; nunca montar ZIP ou enviar manualmente.

## Campanha cadastrada sem mídia

- Consultar a planilha e sincronizar somente pelo endpoint `POST /api/ops/jobs/sync-planilha`.
- Manter a inserção cadastrada enquanto a mídia não chega; não inventar URL nem publicar placeholder.
- A fila oficial é `POST /api/ops/jobs/media-monitor`, executada pelo monitor do Drive a cada 15 minutos.
- O monitor é determinístico e não usa LLM. Ele só vincula mídia quando PI, portal, posição e um único arquivo compatível estiverem resolvidos.
- Toda mutação deve passar pela API AdOps. Agente e runner não escrevem diretamente no banco.
- Conflito de PI, posição ambígua ou mais de um arquivo compatível bloqueiam a automação e exigem revisão humana.

## Comandos operacionais principais

Antes de mexer em captura, auditoria ou regra de print:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Sincronizar planilha localmente:

```bash
pnpm --filter @workspace/scripts run sync:planilha
```

Reconciliar planilha + AdRotate:

```bash
pnpm --filter @workspace/scripts run reconcile:planilha-adrotate
```

Gerar print por runner/API pública:

```bash
POST https://adops-api-public.leandro471.workers.dev/api/ops/jobs/print-single
```

Consultar status de evidência:

```bash
GET https://adops-api-public.leandro471.workers.dev/api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD
```

## Entrega final obrigatória por PI + portal

Para cadastrar/publicar uma campanha e gerar a entrega final, usar o job único da API AdOps:

```text
POST /api/campaign-fulfillments/jobs
  Idempotency-Key=fulfillment:<pi>:<portal>:v1
  { piCodigo, siteSigla, sendTelegram: true }
GET /api/campaign-fulfillments/jobs/{jobId}
GET /api/campaign-fulfillments/jobs/{jobId}/report
GET /api/campaign-fulfillments/jobs/{jobId}/report.pdf
```

- Não encadear sincronização, cadastro, mídia, publicação, prints e exportação manualmente quando o fulfillment estiver disponível.
- O job é idempotente, não duplica inserções e bloqueia correspondência ambígua de PI, portal, período, posição ou mídia.
- Ele atualiza Drive, sincroniza planilha, publica, gera/backfill de evidências, audita, entrega e envia ao Telegram.
- O resultado inclui checklist, divergências, recorte da linha da planilha e prévia do PDF do pedido da agência.
- Preservar os PNGs auditados no storage; a compressão ocorre apenas na cópia de entrega.
- Cada posição gera seu próprio ZIP e seu próprio PDF. O ZIP contém JPEGs progressivos, auditoria, contact sheet e `SHA256SUMS.txt`; nunca reúne posições diferentes.
- Os PDFs são artefatos separados por posição/banner. Nunca juntar TOPO, HOME 1, HOME 2, LATERAL ou VIDEO no mesmo PDF.
- A API envia sequencialmente um par ZIP + PDF por posição e persiste os IDs das mensagens.
- Nomes externos devem ser neutros: `PI-<codigo>-<portal>-<posicao>.zip` e `PI-<codigo>-<portal>-<posicao>.pdf`. Não usar `final`, `revisada`, `auditada` ou equivalentes em pastas e arquivos.
- Logs completos e fontes PNG continuam internos. O ZIP de entrega inclui somente a auditoria mínima, contact sheet e checksums necessários para conferência.
- Antes de liberar: `status=completed`, soma das páginas de `artifacts.pdfs` = JPEGs, um PDF por posição, ZIP sem PNG/PDF, somente JSON de auditoria e TXT de checksums além dos JPEGs/contact sheet, e amostragem visual com topbar/domínio/data/hora/banner visíveis.
- Contrato navegável: `https://adops-api.codigo5.com.br/api/docs`; OpenAPI: `https://adops-api.codigo5.com.br/api/openapi.json`.
- `POST /api/pi-site-exports/jobs` permanece para regenerar apenas os artefatos quando cadastro e publicação já estão resolvidos.
- Guia operacional canônico: `docs/adops/campaign-fulfillment-api.md`.

## Gate obrigatório de captura/auditoria

Bloqueia publicação ou regeneração em lote se houver:

- Mais de uma regra publicada para o mesmo `siteSigla + groupId`.
- `slotSelector` igual apontando para grupos diferentes no mesmo site/página.
- Alias operacional igual em grupos diferentes do mesmo site.
- Divergência entre `config/adrotate-sites.json` e regras publicadas no painel/API.
- Campos inválidos: `scrollMode`, `proofStyle`, `slotSelector`.
- Em página de notícia com `requireEditorialDateMatchTarget=true`, a data editorial visível deve coincidir com a data-alvo; não aprovar uma matéria repetida em dias diferentes.
- Retroativos, correções e retrabalhos rejeitados exigem OCR do PNG final e revisão humana vinculada ao `artifactSha256`.
- `status=audited` sem `pixelDateProof.ok=true` não libera uma entrega histórica.
- Mídia ambígua fica em `media_ambiguous`; seleção explícita usa `POST /api/insertions/{id}/media-selection`.
- Inserção duplicada é arquivada e ligada por `supersededByInsertionId`; nunca apagar o histórico para corrigir identidade.
- Publicação AdRotate precisa gerar snapshot histórico; não republicar campanha expirada para produzir prova.

## Contrato de revisão e release

```text
GET  /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD
POST /api/insertions/{id}/capture-proof/reviews
POST /api/pi-site-exports/jobs
```

- Aprovação usa `expectedArtifactSha256`; regeneração invalida a aprovação anterior.
- O job usa `awaiting_human_review` e só volta à fila quando todos os hashes estiverem aprovados.
- Deploy parte de worktree limpo, aplica migração idempotente após backup e publica o SHA exato do merge.
- API, painel, runners, documentação e conhecimento do agente devem pertencer à mesma release.

## Serviços relacionados

- Painel público: `https://adops-campanhas-portais.pages.dev`
- API pública: `https://adops-api-public.leandro471.workers.dev`
- API privada/VPS: serviço `codigo5_adops-api`
- Runner/VPS: serviço `codigo5_adops-runner`
- Telegram bot: `ops/telegram-bot` e `ops/cloudflare-telegram-bot`
- WordPress/AdRotate multisite: `ops/wordpress/adrotate-adops.php`
- Configuração por portal/posição: `config/adrotate-sites.json`

## Segurança

- Arquivos `.env*` foram migrados e devem ficar com permissão `600`.
- Nunca colar valores de tokens no chat.
- Ao gerar relatório, mostrar apenas nomes de variáveis e status `presente/ausente`.
- Não commitar secrets sem pedido explícito e revisão.

## Validação mínima antes de concluir tarefa

Escolha os testes conforme a mudança:

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run test:pixel-date-proof
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

Para tarefas operacionais, além dos comandos, validar no sistema vivo:

- status da inserção;
- relação AdOps x AdRotate;
- evidência por data;
- URL pública do print;
- auditoria sem issues;
- Telegram enviado, se solicitado.
