# AdOps Ops API Runbook

## Objetivo

Operar o AdOps sem escrita direta no banco.

Este runbook consolida os endpoints que outro agente, terminal, Telegram, WhatsApp ou painel podem usar para:

- cadastrar/intake de nova campanha a partir de pasta do Google Drive;
- gerar print retroativo de uma data;
- gerar retroativos pendentes;
- garantir pacote por PI + site;
- resolver e validar checklist de auditoria;
- acompanhar fila e progresso.

## Glossário rápido

- `PI`: identificação comercial da campanha enviada pela agência ou cliente.
  Exemplo: `4500152231`, `25206089`, `14589`.
- `API`: endpoint HTTP da ferramenta AdOps para operar sem escrita direta no
  banco. Exemplo: `POST /api/ops/jobs/print-backfill`.
- `campanha`: registro do AdOps que agrupa uma ou mais inserções da mesma PI.
- `inserção`: veiculação específica da campanha em portal, posição e período.
- `print/evidência`: imagem auditada gerada pelo runner oficial e validada pelo
  checklist central.

## Variáveis locais

Use sempre variável de ambiente para token. Nunca cole token em comando salvo, Git ou chat.

```bash
export ADOPS_API_BASE_URL="https://adops-api.codigo5.com.br"
export OPS_API_TOKEN="..." # token operacional
```

Comandos `GET` públicos podem funcionar sem token, mas toda mutação exige:

```bash
-H "Authorization: Bearer $OPS_API_TOKEN"
```

## Catálogo vivo da API

A própria API expõe o catálogo operacional:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/api-catalog"
```

Esse endpoint é a fonte rápida para outro agente descobrir os comandos principais.

Para uma leitura humana no navegador:

```text
https://adops-api.codigo5.com.br/api/ops/api-catalog.html
```

Para uma leitura visual em padrão Swagger/FastAPI:

```text
https://adops-api.codigo5.com.br/api/ops/docs
```

Para ferramentas que leem padrão OpenAPI/Swagger:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/openapi.json"
```

O JSON mantém duas visões:

- `sections[]`: agrupado por objetivo operacional;
- `endpoints[]`: lista plana para automações e agentes.

Regra de arquitetura: o operador usa estes endpoints. A escrita direta no banco fica restrita ao runtime da API e às migrações controladas.

## Saúde e fila

Conferir API:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/healthz"
```

Conferir fila:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/queue/overview"
```

Conferir prontidão de integrações sem expor segredos:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/runtime-readiness"
```

Esse endpoint responde apenas nomes e presença/ausência de variáveis de
ambiente. Ele serve para saber se o runtime atual consegue operar API, Drive,
Telegram, runner e política de mutação. Ele nunca deve retornar valores de
tokens, chaves, URLs privadas com credenciais ou paths sensíveis além dos nomes
das variáveis.

Consultar job:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID"
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
```

## Checklist de auditoria

Resolver regra antes de gerar print:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/audit-checklists/resolve?insertionId=1663&date=2026-07-01"
```

Validar evidência depois do print:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/audit-checklists/validate-proof" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Status final integrado:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/insertions/1663/capture-proof/status?date=2026-07-01"
```

Aceite mínimo:

- `status=audited`;
- `inPeriod=true`;
- `hasEvidence=true`;
- `isReachable=true`;
- `checklistValidation.approved=true` quando presente;
- `blockingIssues=[]`.

## Gerar print de uma data

Use para print atual ou retroativo específico.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-single" \
  -d '{
    "insertionId": 1663,
    "date": "2026-07-01",
    "replace": true
  }'
```

Depois, acompanhe:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
```

Antes de aceitar a imagem, valide o checklist:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/audit-checklists/validate-proof" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Aceite apenas `approved=true` e `blockingIssues=[]`.

## Gerar retroativos pendentes

Por inserção:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"insertionId":1663}'
```

Por campanha:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"campaignId":944}'
```

Por PI + site:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"piCodigo":"4500152231","siteSigla":"PERRENGUE","fromDate":"2026-07-01","toDate":"2026-07-07"}'
```

Por site:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"siteId":1}'
```

Por competência:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
-d '{"competencia":"JULHO/2026"}'
```

Comportamento do backfill por `campaignId` ou `piCodigo + siteSigla`:

- resolve automaticamente as inserções da campanha/PI;
- usa o período oficial de cada inserção;
- aceita `fromDate` e `toDate` para limitar a janela;
- se o print já estiver `audited` e aprovado, não sobrescreve;
- se faltar print ou o checklist reprovar, recaptura e revalida;
- `replace=true` força regeração mesmo quando já existe evidência aprovada.

## Gerar lote de uma data

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-batch" \
  -d '{"siteId":1,"date":"2026-07-01"}'
```

## Garantir pacote por PI + site

Este fluxo é o melhor para entrega completa.

Ele garante cobertura de evidências, documentos operacionais e ZIP por PI/site.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/pi-site-export" \
  -d '{"piCodigo":"16628","siteSigla":"PERRENGUE"}'
```

## Reconciliar Planilha + AdRotate

Use para conferir divergências entre a planilha operacional, AdOps e AdRotate
sem abrir painel nem escrever direto no banco.

Auditoria sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":false}'
```

Aplicar correções automáticas suportadas pelo script real:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":true}'
```

Política:

- `apply=false` roda o harness sem mutação e gera diagnóstico.
- `apply=true` roda `scripts/src/reconcile-planilha-adrotate.ts`.
- O operador acompanha por `/api/ops/jobs/JOB_ID` e não acessa banco direto.
- Se o job apontar pendência manual, corrigir origem oficial antes de gerar prints.

## Vincular anúncio AdRotate existente

Use quando a campanha/inserção já existe no AdOps e o anúncio já existe no
WordPress/AdRotate, mas falta alinhar os campos técnicos de vínculo.

Prévia sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":false}'
```

Aplicar vínculo:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":true}'
```

Política:

- `apply=false` é o padrão e chama o WP-CLI em modo preview.
- `apply=true` chama `wp adrotate adops link ... --apply` no portal correto.
- O job não cria anúncio novo e não escolhe posição sozinho.
- Antes de gerar prints, validar relação AdOps x AdRotate e checklist central.

## Reenviar evidência auditada no Telegram

Use quando o print já existe e precisa ser enviado novamente no grupo.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/telegram-send-evidence" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

O runner faz duas validações antes de enviar:

1. chama `/api/audit-checklists/validate-proof`;
2. só chama o bot Telegram se `approved=true`.

Se o checklist recusar, o job falha com `blockingIssues` no resultado.

Credenciais:

- o operador usa apenas `OPS_API_TOKEN`;
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_DEFAULT_GROUP_ID` ficam no ambiente do runner/Portainer;
- se o Worker do bot estiver indisponível, o runner pode enviar direto pela API do Telegram usando essas variáveis.

## Intake de nova PI por pasta do Drive

### 1. Preflight sem mutação

Use primeiro quando a pasta do Drive já contém PI e mídia, mas você ainda quer
conferir período, formato, mídia, planilha, deduplicação e rollout antes de
publicar.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-preflight" \
  -d '{
    "folderUrl": "https://drive.google.com/drive/folders/ID_DA_PASTA"
  }'
```

Esse job usa o mesmo parser, agente e validações do cadastro real, mas envia
`preflightOnly=true` para o runner. Mesmo que o ambiente produtivo tenha flags
de auto-apply ligadas, esse job não cria campanha, não cria inserção e não
publica anúncio.

Aceite do preflight:

- job `completed`;
- `result.execution.preflightOnly=true`;
- campos de PI encontrados em `result.execution.fields`;
- `validation.ok=true`;
- `packageReadiness.ok=true`;
- sem `dedupe_conflict`;
- sem `rollout_blocked`;
- `reviewReasons` contendo `preflight_only` quando tudo está pronto para aplicação.

Pendência comum:

- `drive_folder_empty_or_not_shared`: a API conseguiu receber a pasta, mas o
  runner não listou PDF/mídia. Normalmente a pasta não está compartilhada com a
  credencial Google Drive do runner/monitor. Corrija o compartilhamento da
  pasta e rode o preflight novamente.

### 2. Intake/cadastro operacional

Use quando a pasta do Drive já contém PI e mídia.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-folder" \
  -d '{
    "folderUrl": "https://drive.google.com/drive/folders/ID_DA_PASTA"
  }'
```

Esse job usa o runner oficial.

Regra operacional: só use este endpoint depois do preflight ou quando a PI já
tiver sido conferida por outra fonte oficial.

O comportamento depende das flags do `.env`:

- `DRIVE_PI_MONITOR_ENABLED`;
- `GOOGLE_DRIVE_*`;
- `ADOPS_DRIVE_PI_ALLOW_MUTATION`;
- `ADOPS_PI_AGENT_ENABLED`;
- `ADOPS_PI_AGENT_AUTO_APPLY`;
- `ADOPS_TELEGRAM_BOT_URL`.

Política segura:

- sem PI ou mídia: bloquear em diagnóstico;
- sem confiança suficiente: `needs_review`;
- sem `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`: não aplicar cadastro;
- sem `ADOPS_PI_AGENT_AUTO_APPLY=true`: analisar, mas não publicar automaticamente.

O intake correto precisa registrar no job:

- pasta Drive;
- PDFs e mídias detectadas;
- PI/campanha/cliente/agência/site/período/formato extraídos;
- divergências contra planilha;
- decisão `applied`, `needs_review` ou `failed`.

O job não deve publicar quando faltar dado crítico, mídia pública ou posição resolvida sem ambiguidade.

## Regras de auditoria que a API deve bloquear

O contrato real está em `GET /api/audit-checklists/resolve`.

Resumo dos gates:

- período correto;
- mídia vinculada;
- horário retroativo entre `18:00` e `21:59` em `America/Cuiaba`;
- grupo AdRotate correto;
- seletor do slot correto;
- contexto do slot correto;
- frame `windows11-chrome-light-similar-v4`;
- tema claro;
- URL real do portal;
- scrollbar quando a página excede o viewport;
- banner visível no PNG final;
- header sticky quando o portal/formato exige;
- sem 404;
- sem modal/overlay cobrindo a página;
- vídeo com controles e progresso visíveis;
- GIF em frame permitido quando configurado;
- `finalPngSlotAudit.ok=true` quando exigido.

Se qualquer item obrigatório falhar, o fluxo deve corrigir a origem antes de gerar lote:

```text
AdOps/planilha/PI -> AdRotate/portal -> HTML público -> captura -> checklist -> entrega
```

Não liberar exceção para slot errado. O caso Iguá provou o comportamento correto: a API recusou enquanto o criativo estava no grupo `3` e só aprovou quando a fonte foi corrigida para grupo `2`.

## Deploy no Mac Mini

O runtime atual é o stack Portainer em:

```text
ops/portainer/adops-stack/
```

Serviços esperados:

- `adops-api`;
- `adops-runner`;
- `adops-runner-print-single`;
- `adops-postgres`;
- `adops-web`;
- `adops-telegram` quando habilitado.

O `.env` privado deve ficar fora do Git. Use:

```text
/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env
```

## Próximos incrementos

1. Criar testes de API para os wrappers `/ops/jobs/*`.
2. Garantir que o deploy público use `OPS_JOB_KINDS` com todos os jobs:
   `sync-planilha,print-batch,print-backfill,print-single,analytics-report,pi-site-export,drive-pi-ingest,reconcile-adrotate,adrotate-link,telegram-send-evidence`.
3. Criar adaptador Telegram chamando estes endpoints.
4. Criar adaptador WhatsApp chamando estes endpoints.
5. Criar painel autenticado consumindo o catálogo JSON, sem rotas novas fora da API.
6. Evoluir painel com login para usar a mesma API, sem rota paralela.
