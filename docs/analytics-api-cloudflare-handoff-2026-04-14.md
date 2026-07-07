# Analytics API no Cloudflare: handoff operacional

Data: 2026-04-14

## 🎯 Objetivo

Consolidar a frente de Analytics por API no ambiente público do Cloudflare para que:

- o painel em Pages possa solicitar relatórios a partir da própria inserção/PI
- a API pública decida período, dimensão e integração com a automação já existente
- o runner execute o job fora do ambiente local
- a outra aplicação de print possa consumir jobs, status e artefatos por contrato HTTP estável

## 🌐 Ambientes publicados

- Pages oficial: `https://adops-campanhas-portais.pages.dev`
- Último Pages validado nesta rodada: `https://3d4162b9.adops-campanhas-portais.pages.dev`
- API pública oficial: `https://adops-api-public.leandro471.workers.dev`
- Conta Cloudflare usada no deploy: `Código5 Web - Leandro Bosaipo`

## 🧱 Arquitetura consolidada

### Pages

- hospeda o frontend público
- usa a API viva via `VITE_API_BASE_URL=https://adops-api-public.leandro471.workers.dev`
- expõe no detalhe da inserção a frente `Analytics por API`

### Worker público

- projeto: `ops/cloudflare-public-api`
- concentra os endpoints públicos de Analytics
- usa D1 `adops-ops` para persistir jobs e artefatos
- usa Queue `adops-ops-queue` para acordar runners
- continua fazendo proxy de leitura para a API privada nos endpoints que ainda dependem da origem viva

### Runner remoto

- projeto: `ops/cloudflare-remote-runner`
- consome jobs via `/api/ops/runner/claim-next`
- executa o fluxo real da automação GA4 integrada ao projeto Maton
- em produção, o job `analytics-report` usa hook HTTP para o serviço `codigo5_perrengue-ga4-relatorio-analytics`
- publica o PDF final no DigitalOcean Spaces
- devolve `downloadUrl`/`previewUrl` no resultado do job

### Automação GA4

- projeto operacional usado pelo runner:
  `/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/projects/perrengue-ga4-relatorio-analytics`
- comando-base:
  `python -m src.main --env configs/<site>.env --start-date <ini> --end-date <fim> --only-pdf`

## ✅ O que foi implementado

### Worker público

- novo kind de job: `analytics-report`
- resolução da configuração de Analytics por site/sigla
- derivação de requirements a partir da inserção/PI
- criação de job de Analytics protegido por Bearer token
- leitura pública de status do job
- leitura pública de relatórios por inserção
- download público por redirect para o artefato final

### Frontend

- bloco `Analytics por API` no detalhe da inserção
- botão `Pedir relatório`
- leitura de requirements
- polling de job ativo
- listagem de relatórios gerados
- link de download do artefato

### Runner

- suporte ao kind `analytics-report`
- execução do projeto GA4 existente por `propertyKey`
- fallback local por Python continua disponível
- em VPS, prioridade para `ANALYTICS_REPORT_HOOK_URL`
- publicação automática no Spaces
- retorno estruturado do resultado para a API pública

## 🔌 Endpoints publicados

### 1. GET `/api/analytics/insertions/:id/requirements`

Uso:

- informar ao frontend ou agente externo se a inserção tem suporte a Analytics
- retornar período efetivo, property key e recomendações operacionais
- retornar também as janelas disponíveis para solicitação:
  - `pi`
  - `full_month`
  - `custom`

Exemplo:

```bash
curl -sS \
  https://adops-api-public.leandro471.workers.dev/api/analytics/insertions/857/requirements
```

Resposta real desta rodada:

```json
{
  "insertionId": 857,
  "campaignId": 616,
  "piCodigo": "PI 41025- GOV",
  "siteSigla": "OMT",
  "requiresAnalytics": false,
  "analyticsSource": "ga4",
  "propertyKey": "omatogrossense-ga4",
  "periodStart": "2026-04-02",
  "periodEnd": "2026-04-10",
  "periodOptions": [
    {
      "mode": "pi",
      "label": "Período da PI",
      "description": "Usa exatamente a janela da inserção/PI.",
      "periodStart": "2026-04-02",
      "periodEnd": "2026-04-10"
    },
    {
      "mode": "full_month",
      "label": "Mês completo",
      "description": "Usa o mês inteiro da competência da inserção.",
      "periodStart": "2026-04-01",
      "periodEnd": "2026-04-30"
    },
    {
      "mode": "custom",
      "label": "Período customizado",
      "description": "Permite escolher manualmente o início e o fim do relatório.",
      "periodStart": null,
      "periodEnd": null
    }
  ],
  "recommendedDimensions": ["city"],
  "recommendedMetrics": [
    "activeUsers",
    "engagedSessions",
    "engagementRate",
    "userEngagementDuration"
  ],
  "notes": [
    "A regra operacional não marcou Analytics como obrigatório, mas a integração pode ser solicitada se o site suportar GA4.",
    "A automação atual gera o relatório GA4 em modo Cidade.",
    "O período final segue a janela real da inserção/PI."
  ]
}
```

### 2. POST `/api/analytics/jobs/request-report`

Uso:

- solicitar geração do relatório
- a API decide período e configuração final com base na inserção

Autenticação:

- pública para o fluxo do Pages
- não exige Bearer token quando usada para solicitar relatório a partir do painel público
- os demais endpoints operacionais em `/api/ops/...` continuam protegidos por `Authorization: Bearer <OPS_API_TOKEN>`

Payload mínimo:

```json
{
  "insertionId": 857,
  "requestedBy": "adops-ui",
  "source": "cloudflare-pages"
}
```

Payloads suportados de período:

- padrão da PI:

```json
{
  "insertionId": 857,
  "periodMode": "pi"
}
```

- mês completo:

```json
{
  "insertionId": 857,
  "periodMode": "full_month"
}
```

- período customizado:

```json
{
  "insertionId": 857,
  "periodMode": "custom",
  "customPeriodStart": "2026-04-01",
  "customPeriodEnd": "2026-04-15"
}
```

Observação operacional:

- quando `periodMode` for `full_month` e a competência ainda estiver no mês atual, a API limita `periodEnd` a hoje em Cuiabá
- isso evita erro do provedor GA4/Maton ao receber datas futuras dentro do mesmo mês

Exemplo:

```bash
curl -sS \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"insertionId":857,"requestedBy":"print-app","source":"print-app"}' \
  https://adops-api-public.leandro471.workers.dev/api/analytics/jobs/request-report
```

Resposta:

```json
{
  "ok": true,
  "jobId": "3fe81255-d2f5-48ba-8f42-80012136f223",
  "status": "queued",
  "payload": {
    "campaignId": 616,
    "insertionId": 857,
    "piCodigo": "PI 41025- GOV",
    "siteSigla": "OMT",
    "siteNome": "O Matogrossense",
    "propertyKey": "omatogrossense-ga4",
    "reportConfigName": "omatogrossense",
    "periodStart": "2026-04-02",
    "periodEnd": "2026-04-10",
    "dimensions": ["city"],
    "metrics": [
      "activeUsers",
      "engagedSessions",
      "engagementRate",
      "userEngagementDuration"
    ],
    "requestedBy": "print-app",
    "source": "print-app",
    "analyticsSource": "ga4"
  }
}
```

### 3. GET `/api/analytics/jobs/:jobId`

Uso:

- acompanhar fila, execução e conclusão

Exemplo:

```bash
curl -sS \
  https://adops-api-public.leandro471.workers.dev/api/analytics/jobs/3fe81255-d2f5-48ba-8f42-80012136f223
```

Resposta real resumida:

```json
{
  "id": "3fe81255-d2f5-48ba-8f42-80012136f223",
  "status": "completed",
  "kind": "analytics-report",
  "campaignId": 616,
  "insertionId": 857,
  "piCodigo": "PI 41025- GOV",
  "siteSigla": "OMT",
  "result": {
    "ok": true,
    "execution": {
      "propertyKey": "omatogrossense-ga4",
      "reportConfigName": "omatogrossense",
      "periodStart": "2026-04-02",
      "periodEnd": "2026-04-10",
      "downloadUrl": "https://perrenguematogrosso.nyc3.cdn.digitaloceanspaces.com/app/uploads/omatogrossense/O Matogrossense Cidade Abril 26 - Analytics.pdf?v=202604141939"
    }
  },
  "error": null
}
```

### 4. GET `/api/analytics/insertions/:id/reports`

Uso:

- listar todos os relatórios já registrados para a inserção

Exemplo:

```bash
curl -sS \
  https://adops-api-public.leandro471.workers.dev/api/analytics/insertions/857/reports
```

### 5. GET `/api/analytics/reports/:id/download`

Uso:

- baixar o artefato final
- o endpoint responde com `302` para o arquivo publicado

Exemplo:

```bash
curl -L -O \
  https://adops-api-public.leandro471.workers.dev/api/analytics/reports/3fe81255-d2f5-48ba-8f42-80012136f223/download
```

## 🗺️ Sites suportados nesta fase

Mapeamento atual:

- `AFL` -> `afolhalivre-ga4` -> `configs/afolhalivre.env`
- `OMT` -> `omatogrossense-ga4` -> `configs/omatogrossense.env`
- `PERRENGUE` -> `perrenguemt-ga4` -> `configs/perrenguemt.env`
- `PNMT` -> `portalnortemt-ga4` -> `configs/portalnortemt.env`
- `PPMT` -> `portalpantanalmt-ga4` -> `configs/portalpantanalmt.env`
- `ROO` -> `roonoticias-ga4` -> `configs/roonoticias.env`

Regra atual:

- a automação gera relatório GA4 em modo `Cidade`
- o período final vem da própria inserção/PI
- a UI pode pedir, mas a API decide os parâmetros efetivos

## 🔐 Credenciamento para a outra aplicação

O agente ou aplicação externa precisa de:

- `baseUrl`: `https://adops-api-public.leandro471.workers.dev`
- para pedir relatório de Analytics pelo fluxo público, não precisa Bearer
- token Bearer com o mesmo valor de `OPS_API_TOKEN` segue necessário apenas para:
  - endpoints operacionais em `/api/ops/...`
  - runner claim/complete/fail

Fluxo recomendado para a aplicação de print:

1. chamar `GET /api/analytics/insertions/:id/requirements`
2. validar se existe `analyticsSource` e `propertyKey`
3. chamar `POST /api/analytics/jobs/request-report`
4. fazer polling em `GET /api/analytics/jobs/:jobId`
5. após `completed`, opcionalmente listar em `GET /api/analytics/insertions/:id/reports`
6. baixar pelo endpoint `/download`

## 🖥️ Variáveis obrigatórias no runner remoto

No VPS/runner que processa jobs, manter:

```bash
OPS_API_BASE_URL=https://adops-api-public.leandro471.workers.dev
OPS_API_TOKEN=<token>
OPS_JOB_KINDS=sync-planilha,print-batch,print-backfill,print-single,analytics-report
ANALYTICS_REPORT_HOOK_URL=http://codigo5_perrengue-ga4-relatorio-analytics:8080/api/run-report
ANALYTICS_REPORT_PROJECT_ROOT=/caminho/do/projeto/perrengue-ga4-relatorio-analytics
ANALYTICS_REPORT_PYTHON=/caminho/do/projeto/perrengue-ga4-relatorio-analytics/.venv/bin/python
```

Observação:

- nesta rodada o teste real do job foi concluído usando o runner local apontando para a API pública
- atualização concluída no VPS:
  - `OPS_JOB_KINDS` inclui `analytics-report`
  - `ANALYTICS_REPORT_HOOK_URL` aponta para o serviço GA4 interno no Swarm
  - `RUNNER_ID=runner-vps-1`

## 🚀 Comandos de publicação usados nesta rodada

### Worker

```bash
cd /Users/leandrobosaipo/Projetos/AdOps/ops/cloudflare-public-api
npx wrangler deploy --keep-vars
```

Resultado:

- Worker publicado em `https://adops-api-public.leandro471.workers.dev`
- version id: `c9b35436-347f-4dfe-9e09-3f0cc4122ab7`

### Pages

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
VITE_API_BASE_URL=https://adops-api-public.leandro471.workers.dev \
  pnpm --filter @workspace/adops run build

cd /Users/leandrobosaipo/Projetos/AdOps/ops/cloudflare-public-api
npx wrangler pages deploy \
  /Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/dist/public \
  --project-name adops-campanhas-portais \
  --branch main
```

Resultado:

- deployment validado: `https://3d4162b9.adops-campanhas-portais.pages.dev`

## 🧪 Evidências de teste desta rodada

### Teste 1: requirements

- endpoint respondeu `200`
- confirmou `propertyKey=omatogrossense-ga4`
- confirmou `periodStart=2026-04-02`
- confirmou `periodEnd=2026-04-10`

### Teste 2: criação de job

- job criado com sucesso
- `jobId=3fe81255-d2f5-48ba-8f42-80012136f223`
- status inicial `queued`

### Teste 2b: criação pública sem Bearer

- inserção validada: `860`
- request sem Bearer aceito com sucesso
- `jobId=0e602dff-6296-456a-82b6-c856796c7615`
- período usado: `2026-04-01` até `2026-04-15`

### Teste 3: execução do runner

- runner recebeu o job `analytics-report`
- executou o projeto GA4 existente
- publicou o PDF no Spaces
- finalizou o job como `completed`

### Teste 4: status final

- endpoint de job respondeu `completed`
- artefato final disponível em:
  `https://perrenguematogrosso.nyc3.cdn.digitaloceanspaces.com/app/uploads/omatogrossense/O Matogrossense Cidade Abril 26 - Analytics.pdf?v=202604141939`

### Teste 4b: status final da inserção 860

- endpoint de job respondeu `completed`
- artefato final disponível em:
  `https://perrenguematogrosso.nyc3.cdn.digitaloceanspaces.com/app/uploads/perrenguemt/Perrengue Cidade Abril 26 - Analytics.pdf?v=202604142115`

### Teste 4c: runner definitivo + hook no VPS

- o serviço `codigo5_adops-runner` foi religado no Swarm
- logs confirmaram:
  - `kinds=sync-planilha,print-batch,print-backfill,print-single,analytics-report`
  - claim automático do job `5511b063-5a77-4ed6-98b6-d5e0987c88bf`
  - conclusão automática via hook
- o job da inserção `865` foi concluído pelo runner do VPS com:
  - `runnerId=runner-vps-1`
  - `hook=true`
  - `hookUrl=http://codigo5_perrengue-ga4-relatorio-analytics:8080/api/run-report`
- artefato final disponível em:
  `https://perrenguematogrosso.nyc3.cdn.digitaloceanspaces.com/app/uploads/perrenguemt/Perrengue Cidade Abril 26 - Analytics.pdf?v=202604150346`

### Teste 5: download

- `GET /api/analytics/reports/:id/download` respondeu com sucesso
- verificação HTTP final do download: `200`

### Teste 6: Pages publicado

- `GET` no deployment `https://3d4162b9.adops-campanhas-portais.pages.dev` respondeu `HTTP 200`

## ⚠️ Pontos pendentes

- atualizar o runner hospedado fora do local para processar `analytics-report` continuamente
- feito em 2026-04-15 com hook HTTP no serviço GA4 do VPS
- decidir se os endpoints GET de Analytics seguirão públicos ou se também ganharão autenticação
- decidir se a próxima fase vai persistir metadados adicionais de documento final além do resultado do job
- fechar a documentação final de credenciais para o time/serviço consumidor

## ✅ Resumo para outro agente

Se outro agente assumir daqui:

1. considere `Pages + Worker público` como origem oficial
2. use a API pública `adops-api-public.leandro471.workers.dev`
3. trate `analytics-report` como novo kind suportado
4. não deixe o frontend decidir período nem config do relatório
5. atualize o runner hospedado com os mesmos envs desta documentação
6. use o job `3fe81255-d2f5-48ba-8f42-80012136f223` como evidência de contrato funcionando ponta a ponta
