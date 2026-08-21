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
- Link de direcionamento é opcional. Sem link, publique o banner sem clique. Se houver link, aceite somente um HTTPS público e inequívoco; link inseguro, inválido ou ambíguo bloqueia a publicação.
- Valide o arquivo real da mídia. GIF ou MP4 só são aceitos quando o perfil da posição declarar o tipo e as dimensões. Preserve o original e normalize somente a cópia de entrega.
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
- Às 18h, `print-batch` captura apenas a data do dia, limitado pela competência calculada da data e, quando informado, pelo portal. A auditoria agregada é a prova de conclusão.
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
