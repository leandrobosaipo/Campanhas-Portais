# Evidencias de campanha: captura, auditoria, entrega e Telegram

## Objetivo

Este documento e o contrato operacional para gerar provas de veiculacao por API,
validar cada imagem, montar uma pasta limpa para o cliente e enviar provas
aprovadas ao Telegram.

O operador nunca grava evidencia diretamente no banco. A sequencia canonica e:

```text
preflight -> regra -> preview -> job -> progresso -> status -> checklist
          -> download do arquivoUrl -> pasta limpa -> Telegram
```

## Publico e pre-requisitos

Destinado a operadores e automacoes com acesso ao terminal. Requer:

- `curl`, `jq`, `file` e `zip`;
- `OPS_API_TOKEN` para chamadas `POST`;
- runner recentemente visto e habilitado para `print-backfill`, `print-single`,
  `runtime-readiness-probe` e `telegram-send-evidence`;
- insercao com periodo, `mediaUrl`, portal e regra de captura resolvidos.

Configure o terminal sem escrever o token no historico:

```bash
export ADOPS_API_BASE_URL="https://adops-api.codigo5.com.br/api"
read -rsp "OPS_API_TOKEN: " OPS_API_TOKEN; export OPS_API_TOKEN; printf '\n'
```

Chamadas `GET` sao somente leitura. Chamadas `POST` exigem:

```text
Authorization: Bearer $OPS_API_TOKEN
Content-Type: application/json
```

## Referencia dos endpoints

### Preflight

| Metodo | Endpoint | Funcao |
| --- | --- | --- |
| `GET` | `/healthz` | Confirma disponibilidade da API. |
| `GET` | `/ops/runtime-readiness` | Mostra capacidades da API sem valores secretos. |
| `GET` | `/ops/queue/overview` | Mostra jobs ativos e totais do dia. |
| `POST` | `/ops/jobs/runtime-readiness-probe` | Confirma capacidades no runner que executara o job. |
| `GET` | `/insertions/{id}` | Retorna PI, periodo, posicao, midia, evidencias e resumo de auditoria. |
| `GET` | `/integrations/adrotate/insertions/{id}/relation` | Cruza a insercao com grupo, anuncio e midia do AdRotate. |

O probe do runner e a fonte correta para Telegram. A API e o runner podem ter
variaveis diferentes. Exija no resultado:

```text
result.execution.runnerRuntimeReadiness.capabilities.privateApiReady=true
result.execution.runnerRuntimeReadiness.capabilities.opsApiReady=true
result.execution.runnerRuntimeReadiness.capabilities.telegramReady=true
```

### Regra, preview e captura

| Metodo | Endpoint | Funcao |
| --- | --- | --- |
| `GET` | `/audit-checklists/resolve?insertionId={id}&date=YYYY-MM-DD` | Resolve periodo, midia, grupo, seletores e gates. |
| `GET` | `/insertions/capture-proof/backfill-overdue/preview?insertionId={id}` | Lista datas faltantes sem criar job. |
| `POST` | `/ops/jobs/print-backfill` | Gera um intervalo ou todos os dias faltantes. |
| `POST` | `/ops/jobs/print-single` | Gera ou refaz uma data especifica. |

Payload de backfill:

```json
{
  "insertionId": 1666,
  "fromDate": "2026-07-16",
  "toDate": "2026-07-19",
  "replace": false,
  "force": true
}
```

Parametros:

- `insertionId`: insercao canonica; recomendado para operacao pontual;
- `fromDate` e `toDate`: limites inclusivos em `YYYY-MM-DD`;
- `replace=false`: preserva evidencia ja auditada;
- `replace=true`: substitui prova existente e exige justificativa;
- `force=true`: permite captura historica mesmo fora do dia corrente.

Payload individual:

```json
{
  "insertionId": 1666,
  "date": "2026-07-16",
  "captureAt": "2026-07-16T18:47",
  "replace": false,
  "force": true
}
```

`captureAt` deve ficar em `18:00 <= captureAt < 22:00`, timezone
`America/Cuiaba`. Quando omitido no backfill, a API distribui horarios de forma
deterministica por insercao e data.

O runner assina o preview historico, aplica a data ao portal, limita os posts ao
instante solicitado e valida a qualificacao historica do anuncio. O print deve
mostrar noticias diferentes quando os dias tiverem conteudo editorial diferente.

### Jobs e progresso

| Metodo | Endpoint | Funcao |
| --- | --- | --- |
| `GET` | `/ops/jobs/{jobId}` | Retorna payload, resultado, runner e erro. |
| `GET` | `/ops/jobs/{jobId}/progress` | Retorna etapa, percentual, itens e ETA. |
| `GET` | `/ops/jobs/{jobId}/log` | Procura logs de captura associados ao job. |
| `GET` | `/insertions/{id}/capture-proof/logs?date=YYYY-MM-DD` | Retorna tentativas e diagnostico detalhado da data. |

Estados: `queued`, `ready_for_runner`, `running`, `completed` e `failed`.
Somente `completed` permite seguir para auditoria. Um job pode terminar
`completed` e ainda exigir validacao individual das datas.

### Auditoria e checklist

| Metodo | Endpoint | Funcao |
| --- | --- | --- |
| `GET` | `/insertions/{id}/capture-proof/status?date=YYYY-MM-DD` | Consolida evidencia, URL, metadata e checklist. |
| `POST` | `/audit-checklists/validate-proof` | Reexecuta a validacao central da prova. |

Payload:

```json
{
  "insertionId": 1666,
  "date": "2026-07-16"
}
```

Aceite obrigatorio:

```text
status=audited
checklistValidation.approved=true
blockingIssues=[]
arquivoUrl presente e HTTP 200
```

Os gates podem exigir periodo, midia, horario, regra/slot, scrollbar, frame,
criativo, ausencia de overlay/404, frame final pintado e controles de video.
HTTP 200 isolado nao prova que a evidencia esta correta.

### Extracao e pacotes

O arquivo para entrega e baixado de `arquivoUrl`, retornado por
`capture-proof/status`, somente depois do checklist aprovado.

`GET /insertions/{id}/evidences/export.zip` gera o pacote operacional interno:

```text
00-LEIA-ME.txt
01-PRINTS/{POSICAO}/nome-original__ev-{evidenceId}.png
02-ANALYTICS/*.pdf
03-DOCUMENTOS-OPERACIONAIS/*.docx e *.pdf
```

`GET /pi-site-exports?piCodigo={PI}&siteSigla={PORTAL}&download=1` consolida
todas as insercoes exportaveis encontradas para a PI e o portal. Nao use esse
endpoint quando houver insercao duplicada ou outra posicao fora da entrega.

Os parametros `mode=prints-only` e `variant=web` nao fazem parte do contrato
atual. Para cliente, baixe somente os `arquivoUrl` aprovados e monte uma pasta
limpa.

## Convencao de entrega

Pasta:

```text
{PORTAL}-PI-{PI}-{CLIENTE}-{POSICAO}-{INICIO}-A-{FIM}/
```

Arquivo:

```text
{PORTAL}-PI-{PI}-{POSICAO}-{DATA}.png
```

Normalizacao:

- letras maiusculas;
- acentos removidos;
- espacos convertidos em hifen;
- sem `retroativo`, `retroativos` ou `evidencias`;
- uma pasta por insercao e posicao;
- somente PNG; sem JSON, CSV, PDF, README, `.DS_Store` ou `__MACOSX`.

Exemplos:

```text
PERRENGUE-PI-003121-SANEAR-VIDEO-2026-07-07-A-2026-07-19/
  PERRENGUE-PI-003121-VIDEO-2026-07-07.png

PERRENGUE-PI-492306-ENERGISA-LATERAL-PRIMEIRA-DOBRA-2026-06-20-A-2026-07-19/
  PERRENGUE-PI-492306-LATERAL-PRIMEIRA-DOBRA-2026-06-20.png
```

## Telegram

Endpoint:

```http
POST /ops/jobs/telegram-send-evidence
```

Payload:

```json
{
  "insertionId": 1666,
  "date": "2026-07-16"
}
```

`chatId` e opcional. Quando omitido, o runner usa o destino padrao. O job:

1. chama `validate-proof`;
2. bloqueia `approved=false`;
3. consulta `capture-proof/status`;
4. envia `arquivoUrl` pelo bridge ou diretamente;
5. registra resposta e `messageId` em `ops_jobs`.

Envie um canario e confirme:

```text
status=completed
result.execution.checklist.approved=true
result.execution.telegram.ok=true
result.execution.telegram.messageId presente
```

Nao repita datas ja entregues depois de falha parcial.

## Falhas e retomada

- `critical_image_not_loaded`: recurso critico nao terminou de carregar;
- `critical_image_not_painted`: recurso existe no DOM, mas nao foi confirmado no PNG;
- `retro_editorial_images_unavailable`: as capas historicas retornadas pelo
  WordPress nao carregaram; o runner descarta essas capas e falha se nenhuma
  alternativa valida existir;
- seletor critico ausente ou fora do frame: a captura e reprovada antes do
  upload, mesmo quando as outras imagens e o anuncio carregaram;
- `spawnSync python3 E2BIG`: payload visual excedeu o limite de argumentos; a
  implementacao envia o JSON ao Python por `stdin` para evitar recorrencia;
- `capture_metadata_missing`: captura falhou antes de persistir metadata;
- `layout_not_stable`: layout mudou durante as amostras;
- `final_viewport_changed`: viewport mudou entre validacao e screenshot;
- `resource_request_failed`: recurso critico falhou na rede;
- `content_time_mismatch`: noticias ou data da pagina nao correspondem ao dia;
- `telegramReady=false`: rode o probe no runner e corrija o bridge antes do envio.

Em falha, consulte o log da insercao/data, corrija a causa e use `print-single`
apenas na data afetada. Nunca use `force` para contornar checklist.

## Verificacao final

- preview retorna `totalJobs=0`;
- quantidade de PNGs corresponde a todos os dias inclusivos do periodo;
- nenhum arquivo diferente de PNG na pasta do cliente;
- amostras visuais confirmam portal, data, noticia, posicao e criativo;
- cada envio Telegram possui job concluido e identificador de mensagem.
