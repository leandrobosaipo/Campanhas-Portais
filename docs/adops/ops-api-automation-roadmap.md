# Roadmap — AdOps Operavel por API

## Objetivo

Tornar o AdOps operavel por API, sem escrita direta no banco e sem depender de um operador usando Codex manualmente.

O estado desejado e:

```text
Drive / planilha / portal / AdRotate
  -> API operacional
  -> runner oficial
  -> checklist central
  -> evidencia aprovada
  -> Telegram / WhatsApp / painel
```

## Estado atual validado

Base publica:

```bash
export ADOPS_API_BASE_URL="https://adops-api.codigo5.com.br"
```

Catalogo JSON:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/api-catalog"
```

Catalogo HTML:

```text
https://adops-api.codigo5.com.br/api/ops/api-catalog.html
```

O catalogo publicado expõe:

- saude, fila e progresso;
- checklist central de auditoria;
- geracao de print especifico;
- geracao de retroativos;
- exportacao por PI + site;
- intake por pasta do Google Drive.

Validacao feita em `2026-07-07`:

- `GET /api/healthz`: `200`;
- `GET /api/ops/api-catalog.html`: `200`;
- `GET /api/ops/api-catalog`: `sections[]` e `endpoints[]`;
- `POST /api/ops/jobs/print-single`: criou job;
- runner `runner-print-single`: consumiu job;
- resultado: `completed`, sem escrita direta no banco pelo operador.
- `POST /api/ops/jobs/telegram-send-evidence`: job de reenvio Telegram via API, com checklist antes do envio.
- `POST /api/ops/jobs/drive-pi-preflight`: diagnostico de pasta Drive sem mutacao, antes de qualquer cadastro/publicacao.
- `POST /api/ops/jobs/reconcile-adrotate`: auditoria/aplicação controlada de Planilha + AdRotate pelo runner.

## Principio obrigatorio

Nenhuma automacao externa deve acessar o banco diretamente.

Permitido:

- chamar API com `Authorization: Bearer $OPS_API_TOKEN`;
- consultar status, progresso e checklist;
- criar jobs;
- anexar ou enviar resultado pelo Telegram/WhatsApp.

Restrito ao runtime interno:

- escrita nas tabelas;
- alteracao de campanha/insercao;
- status de job;
- log de auditoria;
- gravacao de evidencias.

## Fluxos principais

### 1. Gerar print de uma data

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-single" \
  -d '{"insertionId":1663,"date":"2026-07-01","replace":true}'
```

Depois acompanhar:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID"
```

Aceite:

- job `completed`;
- `validate-proof.approved=true`;
- `blockingIssues=[]`.

### 2. Gerar retroativos de uma insercao

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"insertionId":1663}'
```

### 3. Exportar pacote por PI + site

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/pi-site-export" \
  -d '{"piCodigo":"4500152231","siteSigla":"PERRENGUE"}'
```

### 4. Intake por pasta do Drive

Preflight sem mutacao:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-preflight" \
  -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA"}'
```

Se o preflight retornar campos, pacote, dedupe e rollout saudaveis, iniciar o
cadastro operacional:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-folder" \
  -d '{"folderUrl":"https://drive.google.com/drive/folders/ID_DA_PASTA"}'
```

Esse fluxo deve:

1. listar PDF e midia;
2. extrair PI, cliente, campanha, portal, periodo, formato e destino;
3. conferir planilha;
4. deduplicar AdOps/AdRotate;
5. publicar ou bloquear com diagnostico;
6. gerar evidencia canario;
7. validar checklist;
8. so entao gerar lote/retroativos.

### 5. Reenviar evidencia no Telegram

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/telegram-send-evidence" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Esse job:

1. valida `/api/audit-checklists/validate-proof`;
2. bloqueia se `approved=false`;
3. chama o bot Telegram para reenviar a imagem auditada;
4. registra o resultado em `ops_jobs`.

### 6. Reconciliar Planilha + AdRotate

Auditoria sem mutacao:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":false}'
```

Aplicacao controlada:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":true}'
```

Regra: `apply=false` é o padrão operacional para outro agente inspecionar
divergencias. `apply=true` só deve ser usado quando a origem oficial já foi
conferida, pois executa o script real de reconciliação.

### 7. Vincular AdRotate existente

Prévia sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":false}'
```

Aplicação controlada:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":true}'
```

Regra: este job só corrige vínculo de anúncio existente via WP-CLI. Se não há
anúncio correto, a automação deve bloquear a publicação e devolver diagnóstico
em vez de inventar posição ou mídia.

## Checklist central

Resolver contrato:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/audit-checklists/resolve?insertionId=1663&date=2026-07-01"
```

Validar evidencia:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/audit-checklists/validate-proof" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Gates que devem bloquear:

- data fora do periodo;
- midia ausente;
- slot ou grupo diferente da regra;
- HTML publico sem criativo no slot esperado;
- frame diferente de `windows11-chrome-light-similar-v4`;
- scrollbar ausente quando obrigatoria;
- header sticky ausente quando obrigatorio;
- video sem controles/progresso;
- banner/GIF em frame ruim quando houver regra;
- 404, modal ou overlay;
- `finalPngSlotAudit.ok=false`.

## Fase 1 — Fechar API operacional

Status: em andamento.

Entregas:

- catalogo JSON/HTML publicado;
- wrappers `/api/ops/jobs/*`;
- runner consumindo API nova;
- checklist central publicado;
- documentacao de uso por cURL.
- reenvio Telegram por API, sem expor token do bot ao operador.
- preflight de PI por pasta Drive, sem mutacao, antes do cadastro/publicacao.
- reconcile Planilha + AdRotate por API, com modo auditoria sem mutação por padrão.

Faltas:

- testes automatizados dos wrappers `/api/ops/jobs/*`;
- endpoint dedicado para republicar anúncio AdRotate quando a peça precisa ser criada/reativada no WordPress.

## Fase 2 — Telegram e WhatsApp

Criar adaptadores finos, sem regra de negocio duplicada.

Telegram:

```text
/print insertionId=1663 date=2026-07-01 replace=true
/retroativos insertionId=1663
/pi folderUrl=https://drive.google.com/drive/folders/...
/status jobId=...
```

WhatsApp:

```text
print 1663 2026-07-01
retroativos 1663
nova pi <link drive>
status <jobId>
```

Ambos devem chamar somente a API operacional e devolver:

- jobId;
- progresso;
- links de evidencia;
- erro de checklist quando houver bloqueio.

## Fase 3 — Painel com login

O painel deve consumir o catalogo e endpoints existentes.

Telas minimas:

- fila de jobs;
- nova PI por Drive;
- gerar print por insercao/data;
- retroativos por PI/site;
- status de checklist por data;
- tela de bloqueios com causa objetiva.

Nao criar regra paralela no frontend.

## Fase 4 — Hardening

- RBAC por papel: operador, auditor, admin;
- rate limit por rota mutavel;
- trilha de auditoria por usuario;
- idempotencia por `idempotencyKey`;
- webhook de conclusao;
- alertas Telegram para falhas de checklist;
- backup documentado de `.env` e credenciais.

## Repositorio e deploy

Repositorio privado esperado:

```text
Campanhas-Portais
```

Branch operacional:

```text
codex/adops-safe-pi-intake
```

Deploy atual:

```text
Portainer stack: adops
API publica: https://adops-api.codigo5.com.br
Frontend: https://adops-campanhas-portais.pages.dev
```

Arquivos sensiveis ficam fora do Git:

```text
.env.adops-operator.local
ops/cloudflare-public-api/.env.ops.local
ops/telegram-bot/.env
/Users/leandrobosaipo/Projetos/macmini/.env.portainer
```

Publicar segredo no Git, chat ou issue e incidente de seguranca.
