# Referência — API operacional AdOps

> Estado: vigente
> Público: equipe operacional e agentes
> Última validação: 2026-08-24
> Release-base: c71350e; política sem PDF validada no commit que contém este documento
> Fonte autoritativa: OpenAPI vivo e runtime público

## Finalidade

Esta referência explica qual interface usar, em que ordem e com quais gates. O contrato de campos permanece no [OpenAPI vivo](https://adops-api.codigo5.com.br/api/openapi.json).

Defina a base sem registrar valores sensíveis:

```bash
export ADOPS_API_BASE_URL="https://adops-api.codigo5.com.br"
```

Mutações exigem o token operacional em variável de ambiente. Nunca copie seu valor para documentação, chat ou Git.

## Leituras canônicas

| Objetivo | Interface | Autenticação | Entrada mínima | Resultado | Bloqueador / rollback |
|---|---|---|---|---|---|
| Saúde da API | `GET /api/healthz` | pública | nenhuma | runtime saudável | não muta |
| Runners e dependências | `GET /api/ops/runtime-readiness` | conforme OpenAPI | nenhuma | capacidades e heartbeat | não muta |
| Campanhas canônicas | `GET /api/campaign-operations/active` | pública | `date` opcional | inserções ativas, sem rascunho duplicado | não muta |
| Pendências compactas | `GET /api/campaign-operations/pending-publication` | pública | `date` | fatos e `resolutionStatus` | identidade ambígua continua bloqueada |
| Fonte mensal | `GET /api/campaign-operations/evidence-monthly-source` | pública | `date` + competência correspondente | todas as inserções canônicas cujo período toca o mês, inclusive encerradas | rejeita competência divergente; não infira datas fora da resposta |
| Auditoria por data | `GET /api/insertions/{id}/capture-proof/status` | pública | `date` | estado, URL e checklist | leitura não aprova evidência |
| Fila resumida | `GET /api/ops/queue/overview` | protegida | nenhuma | contagens e atividade | usar visão completa só em incidente |
| Incidentes operacionais | `GET /api/ops/incidents` | protegida | nenhuma | causa, job, camada e evidências sanitizadas | não contém tokens ou logs brutos |

Exemplo seguro:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/healthz"
curl -fsSL "$ADOPS_API_BASE_URL/api/campaign-operations/active?date=YYYY-MM-DD"
curl -fsSL "$ADOPS_API_BASE_URL/api/campaign-operations/pending-publication?date=YYYY-MM-DD"
```

## Jobs e entregas

| Objetivo | Criação | Acompanhamento | Conclusão | Gate |
|---|---|---|---|---|
| Print do dia | `POST /api/ops/jobs/print-single` | `GET /api/ops/jobs/{id}/progress` | status por evidência | publicação real e integridade das regras |
| Retroativos | `POST /api/ops/jobs/print-backfill` | `/progress` | status por data | captura serial; excluir duplicados |
| Reconciliação | jobs `planilha-sync` e `adrotate-reconcile` | `/progress` | job completo no final | não criar entidade duplicada |
| PI + portal | `POST /api/pi-site-exports/jobs` | `GET /api/pi-site-exports/jobs/{id}` | `/download` | somente evidências aprovadas |
| Campanha completa | `POST /api/campaign-evidence-exports/jobs` | `GET /api/campaign-evidence-exports/jobs/{id}` | `/download` | PI canônica e fingerprint válido |
| Lote mensal | `POST /api/campaign-evidence-exports/jobs/batch` | jobs individuais | cache ou ZIP novo | no máximo três exportações simultâneas |
| Relatório mensal | job `evidence-monthly-report` | `/progress` | leitura pública | staging inteiro precisa passar |
| Reconciliação/publicação automática | `POST /api/ops/jobs/campaign-publication-reconcile` | `/progress` | plano, publicação ou blocker rastreável | aceita `insertionId` e `mode=preflight|apply`; exige identidade autoritativa ou operacional única |

Para retroativos encerrados, `sourceMode=audited_reconstruction` indica que o runner remontou a página somente na sessão de captura. Em OMT e AFL, as notícias vêm da API WordPress com corte na data pedida e o banner vem da `mediaUrl` canônica do AdOps. Isso não reativa a campanha nem altera o portal. Checklist, data visível, identidade criativa e URL acessível continuam obrigatórios.

Para qualquer criação de job:

- use `Authorization: Bearer` vindo do ambiente quando o contrato exigir;
- envie `Idempotency-Key` estável;
- trate `409` como bloqueio de negócio, não como erro para repetir cegamente;
- use polling progressivo em `/progress`;
- leia o objeto completo apenas ao concluir ou diagnosticar;
- não reenvie enquanto o mesmo job estiver ativo.

Jobs destinados ao runner nascem em D1 como `ready_for_runner`. A Cloudflare Queue continua somente para compatibilidade com jobs antigos. O watchdog promove uma vez um legado preso em `queued`; falhas seguintes ficam visíveis. Jobs diários `failed` podem ser repetidos, mas jobs ativos ou concluídos não são duplicados.

A API canônica `adops-api.codigo5.com.br` encaminha criação, listagem e progresso desses jobs ao Worker/D1. Não grave um job operacional somente na tabela PostgreSQL legada: os runners atuais não consomem essa fila. O teste integrado de release deve criar um job pela API canônica e confirmar que o mesmo ID aparece no `/progress` e na fila D1.

### Rotina diária

1. **17h30 Cuiabá:** cria `sync-planilha` e faz o reconciliador depender da conclusão desse job. A comparação planilha → Drive → AdOps classifica cada linha como ausente, rascunho, pronta, publicação reportada, publicação confirmada ou bloqueada. `public_confirmed` exige AdRotate e HTML público; o booleano do AdOps sozinho resulta em `reported_published`.
2. **18h00 Cuiabá:** `print-batch` consulta as inserções canônicas, cria capturas assíncronas por inserção e acompanha somente o progresso. Não mantém uma requisição HTTP aberta durante todo o lote.
3. **18h30 até 21h30, a cada 30 minutos:** o Worker consulta a auditoria canônica. Se estiver completa, não cria job. Se houver pendências, cria outro `print-batch` idempotente limitado aos IDs faltantes ou inválidos; um job ainda ativo impede concorrência.
4. **08h00 do dia seguinte:** pendências de ontem entram como `late_publication_recovery`, sempre em candidato isolado. A promoção exige `allowAuditedReconstruction=true` na regra publicada e checklist final aprovado; caso contrário permanece bloqueada, sem fabricar evidência.
5. **Após cada lote:** a auditoria agregada decide a conclusão. Se houver `missing` ou `invalid`, o Worker registra incidente idempotente com camada provável, job, versão, duração, IDs afetados e próxima ação.

Uma falha individual não interrompe as demais inserções do lote. No PERRENGUE, o ativo institucional pequeno `/assets/perrengue-sublogo.png` não é uma peça publicitária e não conta como mídia concorrente; qualquer outro banner ou vídeo adicional no slot continua bloqueando a aprovação.
6. **22h15 Cuiabá:** o relatório consulta a fonte mensal e o estado canônico da rotina. Pendências aparecem como incidente de geração, com job, IDs, causa e próxima recuperação; campanhas encerradas continuam visíveis e suas datas continuam auditáveis.

### Proveniência e recuperação automática

Cada evidência mantém uma classificação permanente: `scheduled`, `same_day_retry` ou `historical_recovery`. O registro deve conter `targetDate`, `capturedAt`, `sourceJobId` e `auditPolicyVersion`. A data atual nunca reclassifica uma captura feita no dia como retroativa. A política editorial adicional é exigida somente em `historical_recovery`.

`scheduled` identifica o lote oficial do dia. `same_day_retry` identifica uma recuperação executada ainda na mesma data em `America/Cuiaba`. `historical_recovery` identifica captura feita em data posterior e sempre exige a prova editorial retroativa. Para logs antigos `inline-*`, use `POST /api/insertions/capture-proof/reconcile-scheduled` primeiro com `mode=dryRun` e `sourceKind=same_day_inline`; aplique apenas se URL, mídia, período, auditoria visual, insertion ID e timestamps coincidirem. A rota apenas completa a proveniência do log e não edita nem substitui a evidência.

A auditoria só confia no arquivo quando consegue correlacionar banco (`capture_proof_logs`), job que o gerou, inserção, data-alvo e URL do artefato. A reconciliação de 22/08 reutiliza os 18 arquivos originais e ajusta somente metadados comprovados; não gera print, não sobrescreve artefato e não promove uma evidência de outra inserção. Falta de correlação resulta em `blocked`.

Ao terminar o lote diário, o Worker compara cada inserção elegível com a auditoria aprovada. A recuperação curta existente em 5, 10 e 15 minutos continua como primeira resposta. As janelas fixas de 18h30 a 21h30 fazem nova conferência global e trabalham somente nos IDs ainda pendentes. A aprovação encerra a recuperação; evidência aprovada não recebe novo job. Depois da terceira falha curta, o item permanece rastreado, e as janelas posteriores continuam partindo da auditoria real, sem retry cego nem sobrescrita de evidência aprovada.

O checklist aceita `phase=pre_upload|final`. No pré-upload, `approved=true` significa somente que contrato, metadata e gates mecânicos/visuais disponíveis passaram; proveniência, URL persistida e correlação do job continuam obrigatórias no `final`. Toda reprovação contém ao menos um `blockingIssues` estruturado.

`GET /api/ops/daily-print-status?date=YYYY-MM-DD` deve filtrar a rotina pedida pela data informada. A resposta compacta expõe estado, contagens, última tentativa e próxima ação, sem payload bruto ou segredo. O script de recuperação é determinístico e não usa IA; seu avaliador de baixo custo recebe apenas `{"status":"complete|retryable|blocked"}`. `retryable` retorna ao loop via API e `blocked` abre incidente para intervenção.

Em 24/08/2026, a rotina diária não deve capturar antes das 18h de Cuiabá. Antes da janela, o dia corrente aparece como `aguardando captura`; depois do lote, ausências entram no ciclo de recuperação.

O Worker grava a transição terminal do job e o incidente em um único `D1Database.batch`. Se o incidente falhar, a transição também é revertida. O fingerprint inclui job, tipo, data-alvo, competência, portal/inserção e causa normalizada; payload e resultado são redigidos recursivamente antes de entrar no incidente.

Incidente não autoriza alteração ou deploy automático de código. Ele fornece dados reproduzíveis para revisão, teste, documentação, release e validação do consumidor real. Capturas idempotentes podem ser retomadas de forma serial; uma falha persistente exige revisão técnica.

O reconciliador de publicação roda às 17h30 de Cuiabá e também é agendado por mudança observada no Drive. Ele sincroniza a planilha antes de decidir, para que uma linha canônica ausente possa ser cadastrada pelo sincronizador idempotente. `mode=preflight` só devolve ações, bloqueios e próxima ação; `mode=apply` executa a sequência somente quando `ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED=true` para fontes automáticas. Ele não libera campanha por nome. Com PDF textualmente completo, usa `authoritative_pi`. Sem PDF, usa `operational_identity` apenas quando todos os gates operacionais são únicos. Quando o PDF existe, mas os dados estão divididos entre a planilha e os arquivos da pasta, usa `sheet_drive_composite`: exige concordância da PI entre planilha, AdOps, pasta e nome do PDF, além de um único PDF e banner compatível. Zero redirect significa anúncio sem clique; um redirect fornecido precisa ser HTTPS público e único. Nos três modos, o runner relê as fontes, não troca mídia já existente e não remove anúncio pertencente a outra inserção.

### Automação determinística de publicação

O gate `ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED` é independente do intake por IA. Deixe `ADOPS_DRIVE_PI_ALLOW_MUTATION` e `ADOPS_PI_AGENT_AUTO_APPLY` no estado já aprovado para o intake genérico; não os habilite para automatizar a planilha.

Para cada linha, a API deve confirmar: PI canônica, portal, período, formato/slot, inserção única, mídia única compatível, checksum, URL HTTPS, destino HTTPS quando houver, relação AdRotate e HTML público. Mídia existente, conflito de rotação, PDF ambíguo, URL inválida ou divergência de período retornam `needs_review` e não são reexecutados cegamente. A desativação do gate interrompe novas mutações, mas mantém monitoramento e preflight.

### Status diário compacto

`GET /api/ops/daily-print-status` retorna somente a auditoria canônica gravada pelo próprio `print-batch`: última tentativa, contagens aprovadas/ausentes/inválidas, último dia totalmente aprovado e próxima execução às 18h de Cuiabá. A resposta não inclui payload completo, logs internos ou credenciais. O relatório usa esse endpoint para o painel e o contador regressivo.

Backfills que reconstroem uma veiculação tardia usam `reconstructionReason=late_publication_recovery`. O log registra data contratada, horário real da reconstrução, mídia e hash quando a URL content-addressed o disponibiliza. Uma captura diária comum nunca deve receber essa permissão.

## Matriz de evidência

| Estado | Pode entregar? | Ação |
|---|---:|---|
| `missing` | não | capturar somente após publicação real |
| `invalid` | não | corrigir causa e recapturar a data |
| `audited` | sim | confirmar URL acessível e checklist aprovado |
| `audited_best_effort` | sim, com rastreabilidade | confirmar ausência de blocker |

HTTP 200, arquivo existente e `printGerado` isolado não aprovam uma evidência.

## Exportações

O materializador do ZIP recebe um descritor imutável e assinado. O fingerprint cobre evidência, data, URL e auditoria. O ZIP:

- não captura, repara ou reaudita;
- reutiliza cache quando o fingerprint não mudou;
- preserva o PNG canônico;
- entrega JPEG progressivo e `SHA256SUMS.txt`.

Campanhas com o mesmo nome não são agrupadas sem PI canônica.

## Incidentes e rollback

Antes de publicar uma release que use incidentes, faça backup/export do D1 e aplique as migrações remotas antes do `wrangler deploy`:

```bash
wrangler d1 migrations apply adops-ops --remote --config ops/cloudflare-public-api/wrangler.jsonc
```

Na release que introduz incidentes, confirme que `0004_ops_incidents.sql` aparece como aplicada. Depois do deploy, consulte `GET /api/ops/incidents?limit=1` com autenticação operacional. `404` ou erro de tabela bloqueia a ativação do Worker; volte ao deployment anterior e não deixe jobs novos entrarem no fluxo.

- `401`: confirme presença da variável, escopo do endpoint e proxy; nunca imprima o token.
- `409`: leia os blockers e corrija identidade/auditoria; não force o job.
- runner sem heartbeat: consulte readiness, fila e logs antes de reenfileirar.
- incidente aberto: consulte `GET /api/ops/incidents`, leia a camada e o job vinculado; primeiro corrija a fonte, depois execute teste real e encerre somente com auditoria aprovada.
- job demorado: diferencie fila, execução e travamento pelo estágio/heartbeat.
- rebuild do Perrengue: espere o `reason` único do trigger terminar no health; jobs editoriais anteriores podem manter a fila ocupada. Publicação e rollback usam razões diferentes para impedir deduplicação indevida.
- exportação falha: o PNG e o ZIP cacheado anterior permanecem intactos.
- relatório falha: staging é descartado e a última versão pública continua ativa.

## Regras aprendidas

- Inserções canônicas vêm de `campaign-operations/active`; `#1826` não entra em backfill.
- RADAR/OMT PI 17190 não pode absorver RADAR/PERRENGUE sem PI.
- Zeros à esquerda são ignorados somente na comparação de PIs puramente numéricas; o valor original continua exibido.
- Polling compacto reduz tempo, tráfego e tokens.
- Captura é serial; apenas exportações usam concorrência três.
