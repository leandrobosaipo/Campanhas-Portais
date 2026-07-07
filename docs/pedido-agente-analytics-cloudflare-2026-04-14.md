# Pedido técnico para o agente da plataforma local

## Objetivo desta solicitação
Precisamos consolidar a publicação da plataforma no ambiente hospedado e abrir a frente de Analytics por API, para que o painel consiga solicitar relatórios com base nas regras das PIs.

Este pedido **não cobre ainda os documentos finais**.  
O foco desta rodada é:

1. publicação estável da plataforma no Cloudflare Pages
2. manutenção da API principal fora do local
3. integração por API para solicitar relatórios de Analytics por PI
4. retorno de jobs/status/artefatos para o painel

---

## Estado atual que já existe

### URLs em produção
- Pages: `https://adops-campanhas-portais.pages.dev`
- Worker/API pública: `https://adops-api-public.leandro471.workers.dev`

### O que já está homologado
- leitura viva do painel
- dashboard
- campanhas
- detalhe da campanha
- inserções
- detalhe da inserção
- sincronização
- falhas de prints
- jobs protegidos:
  - `sync-planilha`
  - `print-batch`
  - `print-backfill`
  - `print-single`
- exportação ZIP
- suíte pública `Pages + VPS` aprovada com `22/22`

### Arquitetura atual
- frontend público em Cloudflare Pages
- Worker público na borda
- API principal e runner no VPS
- jobs operacionais na borda com token de operador

---

## O que preciso que você entregue

## Bloco A — Consolidar a publicação da plataforma

### 1. Confirmar e manter o fluxo oficial hospedado
Quero que a plataforma local seja tratada como origem oficial do produto hospedado, garantindo que:

- o Pages continue usando a API pública correta
- o Worker continue proxyando/roteando corretamente para a API principal
- a API principal permaneça funcional fora do localhost
- o runner continue processando jobs operacionais no VPS

### 2. Garantir que páginas e detalhes usem sempre a base viva da API
O painel já teve bug em que listagens funcionavam, mas os detalhes ainda tentavam bater em `/api/...` no host do Pages.

Preciso que isso seja mantido correto no código da plataforma local:

- `apiFetch`
- client gerado da API
- páginas de detalhe
- mutações protegidas

### 3. Não reintroduzir dependência do local no fluxo principal
Quero evitar qualquer regressão que faça o fluxo principal voltar a depender do ambiente local.

Se ainda existirem referências locais, elas devem ficar restritas a:

- tooling
- scripts de auditoria
- fallbacks de desenvolvimento

e não à operação principal do painel público.

---

## Bloco B — Analytics por API, baseado na PI

### Objetivo funcional
Precisamos que o painel consiga pedir relatórios de Analytics conforme a necessidade operacional da PI.

O pedido do relatório deve sair do painel e a plataforma deve:

1. identificar a campanha/inserção
2. entender o período correto da PI
3. entender a dimensão correta exigida
4. chamar a automação/serviço de Analytics que já existe
5. armazenar o resultado
6. devolver status e artefatos para o painel

---

## Regra de negócio importante

### O relatório precisa nascer da PI, não de um filtro solto
A plataforma deve respeitar a lógica já existente de operação por:

- agência
- cliente
- campanha
- inserção
- período da inserção
- exigência de Analytics no perfil operacional

Hoje a base já tem perfil operacional com `requiresAnalytics`, então a integração precisa conversar com isso.

Exemplos já aprendidos no projeto:
- algumas PIs exigem Google Analytics como parte da comprovação
- o período deve seguir a inserção/PI
- não dá para assumir um único período genérico por campanha

---

## Endpoints que preciso

## 1. Descoberta da exigência de Analytics

### `GET /api/analytics/insertions/:id/requirements`
Objetivo:
- dizer ao painel se a inserção pede Analytics
- informar o período-base
- informar a configuração sugerida para geração do relatório

### Resposta esperada
```json
{
  "insertionId": 857,
  "campaignId": 616,
  "piCodigo": "PI 15494",
  "siteSigla": "OMT",
  "requiresAnalytics": true,
  "analyticsSource": "ga4",
  "periodStart": "2026-03-18",
  "periodEnd": "2026-03-30",
  "recommendedDimensions": ["date"],
  "recommendedMetrics": ["sessions", "users", "pageViews"],
  "notes": [
    "Seguir o período real da inserção.",
    "Se a PI exigir mês fechado, usar o mês da veiculação."
  ]
}
```

---

## 2. Criar pedido de relatório

### `POST /api/analytics/jobs/request-report`
Objetivo:
- o painel cria um job de Analytics
- a plataforma aciona a automação existente

### Payload mínimo esperado
```json
{
  "campaignId": 616,
  "insertionId": 857,
  "piCodigo": "PI 15494",
  "siteSigla": "OMT",
  "propertyKey": "omatogrossense-ga4",
  "periodStart": "2026-03-18",
  "periodEnd": "2026-03-30",
  "dimensions": ["date"],
  "metrics": ["sessions", "users", "pageViews"],
  "requestedBy": "adops-ui",
  "source": "cloudflare-pages"
}
```

### Resposta esperada
```json
{
  "ok": true,
  "jobId": "analytics-job-123",
  "status": "queued"
}
```

---

## 3. Consultar status do job

### `GET /api/analytics/jobs/:jobId`
Objetivo:
- o painel acompanha o processamento

### Resposta esperada
```json
{
  "id": "analytics-job-123",
  "status": "running",
  "kind": "analytics-report",
  "campaignId": 616,
  "insertionId": 857,
  "piCodigo": "PI 15494",
  "result": null,
  "error": null,
  "createdAt": "2026-04-14T10:00:00Z",
  "updatedAt": "2026-04-14T10:02:00Z"
}
```

---

## 4. Listar relatórios gerados de uma inserção

### `GET /api/analytics/insertions/:id/reports`
Objetivo:
- mostrar no painel os relatórios já gerados para aquela inserção/PI

### Resposta esperada
```json
{
  "insertionId": 857,
  "reports": [
    {
      "id": "report-001",
      "kind": "ga4",
      "periodStart": "2026-03-18",
      "periodEnd": "2026-03-30",
      "dimensions": ["date"],
      "metrics": ["sessions", "users", "pageViews"],
      "status": "completed",
      "downloadUrl": "https://...",
      "previewUrl": "https://...",
      "createdAt": "2026-04-14T10:03:00Z"
    }
  ]
}
```

---

## 5. Endpoint de artefato final

### `GET /api/analytics/reports/:id/download`
Objetivo:
- o painel baixa o arquivo final do relatório

Formatos aceitos:
- `.xlsx`
- `.csv`
- `.pdf`
- `.json`

Pode ser um redirect seguro para storage.

---

## Integração com a automação de Analytics já existente

### O que preciso
Não quero refazer a automação que já existe.

Quero que a plataforma local:

1. tenha um adapter para chamar essa automação
2. aceite os parâmetros estruturados do painel
3. normalize o retorno
4. persista status e artefatos

### Se a automação atual rodar fora da plataforma
Tudo bem, desde que a API da plataforma faça a ponte.

### Se a automação atual exigir parâmetros específicos
Quero que isso fique encapsulado na API e não no frontend.

---

## Regras importantes para a implementação

### 1. O frontend não deve decidir regra de Analytics sozinho
O painel pode sugerir, mas a verdade final deve sair da API.

### 2. O período deve seguir a inserção/PI
Não assumir mês genérico quando a PI exigir recorte diferente.

### 3. A API deve suportar override manual controlado
Se a operação precisar trocar dimensão ou período, isso pode existir, mas com rastreio.

### 4. Tudo precisa ter status de job
Não quero request longa sem acompanhamento.

### 5. Preparar para a próxima fase de documentos finais
Mesmo que os documentos não entrem agora, os relatórios precisam sair de forma reutilizável para a fase seguinte.

---

## O que o painel vai precisar depois que isso estiver pronto

### Na página da inserção
- ver se a PI exige Analytics
- solicitar relatório
- acompanhar status
- abrir/download do relatório gerado

### No dashboard/sincronização
- ver fila de jobs de Analytics
- ver falhas
- rerodar se necessário

---

## Critério de pronto desta entrega

Vou considerar essa etapa pronta quando:

1. a plataforma hospedada continuar estável no Pages + Worker + VPS
2. os endpoints acima existirem e responderem
3. o painel conseguir criar job de relatório por inserção/PI
4. a automação atual de Analytics puder ser acionada pela API
5. o relatório gerado puder ser consultado e baixado pelo painel

---

## Observação importante
Os documentos finais ficam para a próxima etapa.

Nesta rodada, quero apenas:

- publicação consolidada
- Analytics por API
- jobs/status/artefatos preparados para a fase seguinte
