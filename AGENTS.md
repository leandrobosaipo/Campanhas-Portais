# AdOps — Instruções do Projeto Codex

Este projeto é a fonte operacional do AdOps fora do OpenClaw.

Raiz oficial:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

O repositório anterior do OpenClaw é apenas registro de migração. Ele não é entrada de comandos, código, documentação, configuração ou deploy. Use exclusivamente a raiz oficial acima; consulte `docs/MIGRATION_FROM_OPENCLAW_ADOPS.md` somente para histórico.

## Postura obrigatória

- Detectar contexto real antes de alterar.
- Reutilizar scripts existentes.
- Não inventar endpoints, variáveis, credenciais, PIs, dados de planilha ou configurações de AdRotate.
- Não expor tokens, secrets, headers de autorização ou credenciais.
- Preferir correção simples, auditável e reversível.
- Preservar operação em produção: nunca quebrar prints, planilha, AdRotate, Telegram ou Cloudflare por mudança não testada.
- Ao trabalhar com PI, a prioridade de fonte é: PDF/email da PI, depois planilha, depois AdOps, depois AdRotate.
- Link de direcionamento é opcional. Sem link, publique o banner sem clique. Se houver link, aceite somente um HTTPS público e inequívoco; link inseguro, inválido ou ambíguo bloqueia a publicação.
- Valide o arquivo real da mídia. GIF ou MP4 só são aceitos quando o perfil da posição declarar o tipo e as dimensões. Preserve o original e normalize somente a cópia de entrega.
- Em caso de divergência, registrar a divergência e corrigir sem duplicar anúncio, campanha ou inserção.

## Mapa rápido

### Relatório canônico de acompanhamento

- O relatório operacional dinâmico e permanente é exclusivamente `https://sites.codigo5.com.br/reports/adops-evidencias/`.
- Seu gerador é `scripts/src/build-dynamic-evidence-report.mjs` e o comando é `pnpm --dir scripts run report:evidences-dynamic`.
- Pedidos de melhoria do “relatório de acompanhamento”, “relatório dinâmico” ou da URL acima devem alterar esse gerador e validar essa mesma URL.
- Relatórios mensais versionados, como `/reports/adops-evidencias-setembro-2026/`, são artefatos de entrega/snapshot e nunca substituem o relatório de acompanhamento.
- Antes de implementar ou publicar interface de relatório, confirme a URL-alvo no briefing e neste bloco; não reaproveite outro gerador apenas por semelhança visual.

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

## Fluxo para nova PI

1. Conferir PI/email/PDF e identificar campanha, cliente, agência, portal, posição, período, mídia e destino, quando houver.
2. Sincronizar planilha.
3. Verificar se campanha/inserção já existem no AdOps.
4. Verificar AdRotate do portal e evitar duplicidade.
5. Vincular anúncio existente ao AdOps quando já houver publicação.
6. Atualizar mídia e status no AdOps.
7. Limpar cache do portal.
8. Gerar prints obrigatórios, incluindo retroativos em aberto.
9. Validar auditoria por data.
10. Enviar resumo e prints no Telegram quando solicitado.

## Feedback operacional obrigatório

Ao explicar uma falha ao usuário, não entregue somente códigos técnicos. Use frases simples e informe, nesta ordem:

1. campanha, PI, portal e insertion ID;
2. datas afetadas;
3. o que já existe;
4. por que parou;
5. o que ainda falta;
6. o que o sistema tentará fazer;
7. o que depende de informação humana;
8. link para conferir.

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

Para qualquer entrega final de evidências, usar somente o fluxo assíncrono da API AdOps:

```text
POST /api/pi-site-exports/jobs
  mode=full-pdf
  variant=web
  Idempotency-Key=<chave estável>
GET /api/pi-site-exports/jobs/{jobId}
GET /api/pi-site-exports/jobs/{jobId}/download
```

- Não montar o pacote final manualmente quando a API estiver disponível.
- Não usar o endpoint síncrono para pacotes grandes.
- Preservar os PNGs auditados no storage; a compressão ocorre apenas na cópia de entrega.
- O ZIP final deve conter PDF, JPEGs progressivos independentes, auditoria, contact sheet e `SHA256SUMS.txt`.
- Antes de liberar: `status=completed`, páginas do PDF = JPEGs, zero PNG na cópia web, checksums válidos e amostragem visual com topbar/domínio/data/hora/banner visíveis.
- Contrato navegável: `https://adops-api.codigo5.com.br/api/docs`; OpenAPI: `https://adops-api.codigo5.com.br/api/openapi.json`.

## Gate obrigatório de captura/auditoria

Bloqueia publicação ou regeneração em lote se houver:

- Mais de uma regra publicada para o mesmo `siteSigla + groupId`.
- `slotSelector` igual apontando para grupos diferentes no mesmo site/página.
- Alias operacional igual em grupos diferentes do mesmo site.
- Divergência entre `config/adrotate-sites.json` e regras publicadas no painel/API.
- Campos inválidos: `scrollMode`, `proofStyle`, `slotSelector`.

## Rotina diária e relatório mensal

- Às 17h30 de Cuiabá, `sync-planilha` deve terminar antes de `campaign-publication-reconcile`. A sincronização cadastra de forma idempotente somente linhas canônicas realmente ausentes.
- A publicação automática determinística usa somente a API AdOps, a planilha canônica e o snapshot interno do Drive. Ela depende de `ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED=true`; não habilite as flags do agente IA para esse fluxo.
- Falha transitória do monitor do Drive não pode atrasar job já autorizado: a varredura best-effort roda em loop separado do consumidor da fila de publicação.
- Antes de qualquer mutação automática, o reconciliador deve sincronizar a planilha, repetir a deduplicação e validar PI, portal, período, formato, mídia única, HTTPS, grupo/slot e HTML público. Qualquer divergência termina em `needs_review`.
- Para uma inserção canônica já resolvida na fonte mensal, portal, formato e período vêm sempre da planilha/API mensal. O PDF confirma PI, mídia e destino, mas nunca amplia o período contratado nem troca o slot da linha canônica.
- Quando a campanha canônica já existe, cliente e agência também vêm da campanha/planilha. Diferença de nomenclatura comercial no PDF permanece auditável, mas não pode substituir nem bloquear o alvo já confirmado por PI, portal, formato e período.
- A automação jamais substitui uma `mediaUrl` existente nem remove anúncio de outra inserção. Relação rotativa válida é preservada; `replaceExisting=false` é obrigatório no fluxo automático.
- `campaign-publication-reconcile` aceita `mode=preflight|apply`. Eventos do Drive e cron só aplicam quando o gate explícito está ativo; com ele desligado retornam plano e bloqueios, sem mutar campanha, AdRotate ou evidência.
- A reconciliação só cadastra/publica; ela nunca captura evidência do próprio dia. Após a confirmação do HTML público, a primeira captura continua exclusiva do `print-batch` das 18h.
- Às 18h, `print-batch` captura apenas a data do dia, limitado pela competência calculada da data e, quando informado, pelo portal. A auditoria agregada é a prova de conclusão.
- Toda captura deve preservar uma classificação imutável: `scheduled` (rotina do dia), `same_day_retry` (nova tentativa ainda no mesmo dia) ou `historical_recovery` (recuperação posterior). O registro guarda `targetDate`, `capturedAt`, `sourceJobId` e `auditPolicyVersion`; uma captura `scheduled` não vira retroativa só porque o calendário avançou.
- Uma execução antiga `inline-*` só pode ser reconciliada como `same_day_retry` pela rota interna, em `dryRun` antes de `apply`, quando log, arquivo, mídia, inserção, período e data em `America/Cuiaba` coincidirem. A reconciliação nunca troca a evidência nem sua URL.
- A aprovação exige proveniência correlacionável entre banco (`capture_proof_logs`), job original e artefato armazenado. Reconciliar um registro antigo pode corrigir sua classificação, mas não recaptura, substitui ou atribui arquivo a outra inserção. Sem correlação suficiente, o estado permanece bloqueado.
- Após o lote das 18h, itens `missing` ou `invalid` recebem recuperação individual persistida em +5, +10 e +15 minutos. Cada tentativa tem inserção, data, causa humana/técnica, job, horário e próxima ação; aprovação interrompe o ciclo, evidência aprovada nunca é tocada e a terceira falha abre bloqueio sem retry adicional.
- O status histórico deve respeitar `?date=YYYY-MM-DD`: não use a última rotina para responder outra data. A rotina normal é determinística e não chama IA; ao final pode emitir somente JSON compacto `complete`, `retryable` ou `blocked` para o avaliador econômico.
- Às 22h15, `evidence-monthly-report` usa `campaign-operations/evidence-monthly-source`; essa fonte inclui toda campanha cujo período toca o mês, inclusive encerradas antes da data-alvo.
- Cada evidência aprovada por `print-single`, `print-backfill` ou `print-batch` marca a competência como suja. O Worker agrupa aprovações por 60 segundos, mantém somente um job mensal ativo por competência e republica em modo incremental sem criar captura ou exportação nova.
- Se uma aprovação chegar enquanto a revisão incremental estiver executando, ela cria a próxima revisão após o job atual. Falha de revisão mantém a competência suja e agenda retry; não esconda pendências para “destravar” o relatório.
- `campaign-operations/active` continua sendo a fonte diária. Não use esse endpoint isoladamente para construir um relatório mensal.
- O filtro visual inicial `Ativas` não reduz o conjunto persistido: `Encerradas` permanecem no HTML/JSON durante toda a competência.
- É proibido recuar silenciosamente da fonte mensal para `campaign-operations/active`. Se a fonte mensal falhar, preserve a última publicação válida.
- Antes das 18h, e enquanto o lote diário estiver em fila ou execução, o dia corrente é `aguardando captura`, nunca `pendente`. Ausência vira pendência somente após conclusão canônica ou fechamento da janela.
- Restaurar campanha encerrada reutiliza evidências auditadas existentes e não autoriza `print-single`, `print-backfill` nem qualquer captura retroativa.
- `bannerPublicadoNoSite=true` é somente publicação reportada. Confirmação pública exige a relação AdRotate e a mídia no HTML público.
- `GET /api/ops/daily-print-status` é a leitura compacta da última rotina diária e da próxima execução. Não exponha payloads, tokens ou logs internos nessa resposta.
- Uma falha terminal de job deve ser gravada junto do incidente na mesma operação transacional. Incidentes e logs nunca podem persistir credenciais.
- Em 24/08/2026, a captura regular só é elegível após 18h de Cuiabá. Antes disso o dia corrente é `aguardando captura`; não crie backfill antecipado nem marque pendência.

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

## Rotação AdRotate e evidências

- Mais de um anúncio no mesmo grupo pode ser rotação legítima; não desativar ou
  reatribuir histórico por esse sinal isolado.
- A decisão canônica deve registrar PI, portal, formato, período e mídia.
  Sem vencedora determinística, bloquear publicação/captura e expor a causa.
- Em grupo rotativo, aprovar evidência somente se o audit confirmar a mídia
  esperada da inserção. Retry idempotente é somente para datas não aprovadas.
- Toda aprovação deve marcar a competência para revisão incremental do relatório;
  antes das 18h de Cuiabá, o dia corrente fica aguardando captura.
