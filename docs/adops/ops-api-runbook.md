# Referência — API operacional AdOps

> Estado: vigente
> Público: equipe operacional e agentes
> Última validação: 2026-08-13
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
| Retomar publicação | `POST /api/ops/jobs/campaign-publication-reconcile` | `/progress` | campanha existente ou blocker rastreável | aceita `insertionId`; exige identidade autoritativa ou operacional única |

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
3. **Após o lote:** a auditoria agregada decide a conclusão. Se houver `missing` ou `invalid`, o Worker registra incidente idempotente com camada provável, job, versão, duração, dados de auditoria e próxima ação.
4. **22h15 Cuiabá:** o relatório consulta a fonte mensal, não a fonte diária. Campanhas encerradas continuam visíveis e suas datas continuam auditáveis.

O Worker grava a transição terminal do job e o incidente em um único `D1Database.batch`. Se o incidente falhar, a transição também é revertida. O fingerprint inclui job, tipo, data-alvo, competência, portal/inserção e causa normalizada; payload e resultado são redigidos recursivamente antes de entrar no incidente.

Incidente não autoriza alteração ou deploy automático de código. Ele fornece dados reproduzíveis para revisão, teste, documentação, release e validação do consumidor real. Capturas idempotentes podem ser retomadas de forma serial; uma falha persistente exige revisão técnica.

O reconciliador de publicação roda às 17h30 de Cuiabá e também é agendado por mudança observada no Drive. Ele não libera campanha por nome. Com PDF textualmente completo, usa `authoritative_pi`. Sem PDF, usa `operational_identity` apenas quando todos os gates operacionais são únicos; envia `pi_code=null` ao AdRotate e mantém faturamento e ZIP por PI bloqueados. Quando o PDF existe, mas os dados estão divididos entre a planilha e os arquivos da pasta, usa `sheet_drive_composite`: exige concordância da PI entre planilha, AdOps, pasta e nome do PDF, além de um único PDF, banner compatível e redirect HTTPS. Nos três modos, o runner relê as fontes e limita a mutação à campanha/inserção já cadastradas.

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
