# Plano: runtime completo dentro do container AdOps

Data: 2026-06-03

Objetivo:

- Remover dependencia de instalacao manual dentro do container `adops-runner`.
- Garantir que o runner sempre tenha `uvx`, `pdftotext`, `pnpm/corepack`, Node, Playwright e acesso somente leitura aos secrets do Drive quando for recriado.
- Manter tudo dentro de container/imagem Docker, sem depender de pacote instalado no host Mac Mini.

## Diagnostico

O fluxo de nova PI falhou em etapas diferentes porque o runner atual foi recriado manualmente usando a imagem base:

```text
mcr.microsoft.com/playwright:v1.59.1-noble
```

Essa imagem base nao contem todo o runtime operacional do AdOps.

Erros observados:

- `ENOENT: no such file or directory, open '/data/secrets/google-drive-service-account.json'`
  - causa: `adops-runner` nao montava o volume do monitor do Drive em `/data`.
- `pdftotext` ausente
  - causa: o PDF era baixado, mas o runner nao conseguia extrair texto da PI.
- `spawnSync uvx ENOENT`
  - causa: `uvx` foi instalado manualmente no container antigo e sumiu apos recriacao.

Estado desejado:

- `adops-runner` deve rodar com a imagem imutavel `cod5/adops-runtime:<tag>`.
- A imagem deve conter `uv/uvx` e `poppler-utils`.
- O Compose/Portainer deve montar:
  - `adops_app_source:/app` somente se estiver usando modo volume/dev;
  - `adops_runner_state:/var/lib/adops`;
  - `adops_pnpm_store:/var/lib/adops/.pnpm-store`;
  - `adops_ssh:/root/.ssh:ro`;
  - `adops-drive-pi-monitor-data:/data:ro`.

## Decisao tecnica

Usar a imagem imutavel ja prevista no projeto:

```text
ops/portainer/adops-stack/Dockerfile.portainer
```

Ela ja instala:

- `poppler-utils`, que fornece `pdftotext` e `pdfinfo`;
- `curl`, `git`, `openssh-client`, `postgresql-client`;
- `uv`, instalado por `https://astral.sh/uv/install.sh`;
- `pnpm` via Corepack;
- dependencias Node do monorepo;
- build da API.

Mudanca principal:

- Parar de tratar `mcr.microsoft.com/playwright:v1.59.1-noble` como runtime final do runner.
- Usar `cod5/adops-runtime:<tag>` para `adops-api` e `adops-runner`.

## Plano de execucao

### 1. Congelar estado atual

Antes de qualquer mutacao:

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh containers --endpoint 3 | rg '^adops-'
curl -fsS https://adops-api.codigo5.com.br/api/healthz
```

Salvar evidencias:

- status dos containers;
- tag atual do runner;
- env do runner com valores sensiveis mascarados;
- lista de mounts do runner;
- ultimo job `drive-pi-ingest`.

Comandos remotos:

```bash
docker inspect adops-runner --format '{{json .Mounts}}'
docker inspect adops-runner --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | sed -E 's/(TOKEN|SECRET|KEY|JSON)([^=]*=).+/\1\2presente/'
```

### 2. Ajustar Dockerfile se necessario

Verificar se a imagem final expoe `uvx` no `PATH`.

O Dockerfile atual define:

```Dockerfile
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:/root/.local/bin:$PATH
```

Como o instalador do `uv` coloca binarios em `/root/.local/bin`, isso deve bastar.

Validacao esperada dentro da imagem:

```bash
command -v uv
command -v uvx
command -v pdftotext
command -v pdfinfo
command -v pnpm
node --version
pnpm --version
```

Se `uvx` nao aparecer, ajustar o Dockerfile para instalar binario fixo:

```Dockerfile
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
 && /root/.local/bin/uvx --version
```

Nao instalar `uvx` no host.

### 3. Construir imagem imutavel no Portainer

Usar o script real do projeto:

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
ADOPS_IMAGE_TAG=20260603-runner-runtime \
VITE_API_BASE_URL=https://adops-api.codigo5.com.br \
ops/portainer/adops-stack/scripts/build-image-portainer.sh
```

Imagens esperadas:

```text
cod5/adops-runtime:20260603-runner-runtime
cod5/adops-web:20260603-runner-runtime
```

### 4. Ajustar Compose para o runner de producao

Preferir `ops/portainer/adops-stack/docker-compose.yml`, nao o volume compose, para producao duravel.

Garantir no servico `adops-runner`:

```yaml
image: cod5/adops-runtime:${ADOPS_IMAGE_TAG}
command: ["node", "ops/cloudflare-remote-runner/src/runner.mjs"]
volumes:
  - adops_runner_state:/var/lib/adops
  - adops_pnpm_store:/var/lib/adops/.pnpm-store
  - adops_ssh:/root/.ssh:ro
  - adops-drive-pi-monitor-data:/data:ro
```

Garantir envs:

```text
GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=/data/secrets/google-drive-service-account.json
DRIVE_PI_ARCHIVE_DIR=/var/lib/adops/drive-pi-archive
ADOPS_PI_AGENT_ENABLED=true
ADOPS_PI_AGENT_AUTO_APPLY=true
ADOPS_DRIVE_PI_ALLOW_MUTATION=true
ADOPS_TELEGRAM_BOT_URL=http://adops-telegram:4022
```

Regra:

- o runner pode ler `/data/secrets`;
- o runner nao deve escrever no volume do monitor;
- o estado proprio do runner continua em `/var/lib/adops`.

### 5. Deploy controlado

Atualizar env privado do deploy:

```text
ADOPS_IMAGE_TAG=20260603-runner-runtime
```

Aplicar stack pelo script real:

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
COMPOSE_FILE=/Users/leandrobosaipo/Projetos/AdOps/ops/portainer/adops-stack/docker-compose.yml \
ADOPS_STACK_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env \
ops/portainer/adops-stack/scripts/deploy-stack.sh
```

Nao usar `docker run` manual como caminho final.

## Validacao obrigatoria

### 1. Runtime dentro do container

```bash
docker exec adops-runner sh -lc '
set -eu
command -v uv
command -v uvx
command -v pdftotext
command -v pdfinfo
command -v pnpm
test -r /data/secrets/google-drive-service-account.json
node --version
pnpm --version
uvx --version
'
```

### 2. API e containers

```bash
curl -fsS https://adops-api.codigo5.com.br/api/healthz
docker ps --format '{{.Names}} {{.Status}}' | grep '^adops-'
```

Esperado:

- `adops-api` healthy;
- `adops-runner` up;
- `adops-telegram` up;
- `adops-drive-pi-monitor` up;
- `adops-postgres` healthy.

### 3. Sync de planilha

```bash
docker exec adops-runner sh -lc '
cd /app
CI=true POLARS_SKIP_CPU_CHECK=1 npm_config_confirm_modules_purge=false \
pnpm --filter @workspace/scripts run sync:planilha
'
```

Esperado:

- `ok: true`;
- sem `spawnSync uvx ENOENT`;
- sem erro de `polars`;
- sem reinstalacao manual.

### 4. PDF real

Usar uma pasta real de PI ou PDF ja arquivado:

```bash
docker exec adops-runner sh -lc '
pdftotext /var/lib/adops/drive-pi-archive/2026-06-03/6f2505886e37-feminicidio_teste_pi14999.pdf - | wc -c
'
```

Esperado:

- contagem maior que zero para PDF textual;
- se for scan/imagem, registrar necessidade de OCR separado.

### 5. Fluxo Drive PI

Reprocessar uma pasta de teste com novo `eventId`, ou criar uma pasta nova no Drive.

Critérios:

- Telegram inicial enviado;
- pacote classificado como `pi_and_media_present`;
- `agentAnalysis.provider=openai`;
- campos mínimos extraídos quando a PI tem texto;
- se faltar campo real, status `needs_review`, nao `failed`;
- se validar, cadastro criado;
- `sync:planilha` executado sem `uvx ENOENT`;
- canario removido ao final.

## Rollback

Antes do deploy, preservar:

- container atual renomeado ou imagem/tag anterior;
- env anterior do runner;
- compose anterior;
- tag anterior de `ADOPS_IMAGE_TAG`.

Rollback por Portainer:

```bash
ADOPS_IMAGE_TAG=<tag_anterior> \
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
COMPOSE_FILE=/Users/leandrobosaipo/Projetos/AdOps/ops/portainer/adops-stack/docker-compose.yml \
ADOPS_STACK_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env \
ops/portainer/adops-stack/scripts/deploy-stack.sh
```

Rollback manual somente se Portainer falhar:

```bash
docker stop adops-runner
docker rename adops-runner adops-runner-failed-<timestamp>
docker rename adops-runner-backup-<timestamp> adops-runner
docker start adops-runner
```

## Riscos e mitigacoes

### Risco: recriacao apagar dependencia manual

Mitigacao:

- nenhuma dependencia deve ser instalada manualmente no container final;
- `uvx` e `pdftotext` devem vir da imagem.

### Risco: runner escrever no volume do monitor

Mitigacao:

- montar `adops-drive-pi-monitor-data:/data:ro`.

### Risco: build quebrar por worktree sujo

Mitigacao:

- revisar diff antes de build;
- incluir apenas mudancas necessarias no contexto;
- usar tag nova;
- manter rollback.

### Risco: secrets no log

Mitigacao:

- nunca imprimir conteudo de env;
- validar apenas `presente/ausente`;
- mascarar `TOKEN`, `SECRET`, `KEY`, `JSON`.

## Resultado esperado

Depois da execucao:

- recriar `adops-runner` nao remove `uvx`;
- recriar `adops-runner` nao remove `pdftotext`;
- runner consegue ler a credencial do Drive por mount readonly;
- IA recebe texto real da PI;
- `sync:planilha` nao falha por runtime ausente;
- Telegram informa cada etapa;
- falhas reais de dados ficam em `needs_review`, nao em erro de infraestrutura.

## Pendencia posterior

Adicionar harness permanente:

```bash
pnpm --dir scripts run test:drive-pi-event-flow
```

O harness deve validar:

- runtime tools presentes;
- acesso readonly a `/data/secrets/google-drive-service-account.json`;
- `pdftotext` em PDF real;
- `uvx agent-xlsx` com `polars[rtcompat]`;
- evento Drive com pacote `pi_and_media_present`;
- Telegram inicial e final.

## Implementacao executada em 2026-06-03

Tag criada no Docker do Mac Mini:

```text
cod5/adops-runtime:20260603-runner-runtime
```

Motivo de build fora da API do Portainer:

- build via Portainer API retornou HTTP `524`;
- a imagem nao apareceu no Docker apos o timeout;
- build foi refeito no Docker local do Mac Mini por SSH, usando o mesmo `Dockerfile.portainer` e o mesmo contexto tar do projeto.

Alteracoes versionadas:

- `ops/portainer/adops-stack/Dockerfile.portainer`
  - valida `uv`, `uvx`, `pdftotext`, `pdfinfo` e `pnpm` durante o build.
- `ops/portainer/adops-stack/docker-compose.yml`
  - `adops-runner` monta `adops-drive-pi-monitor-data:/data:ro`;
  - `adops-runner` monta `adops_pnpm_store:/var/lib/adops/.pnpm-store`;
  - `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE` padrao aponta para `/data/secrets/google-drive-service-account.json`.
- `scripts/src/sync-planilha-latest.ts`
  - `agent-xlsx` roda com `--with click --with polars[rtcompat]`.
- `scripts/src/reconcile-planilha-adrotate.ts`
  - `agent-xlsx` roda com `--with click --with polars[rtcompat]`.
- `ops/cloudflare-remote-runner/src/runner.mjs`
  - `pnpm` usa fallback por `corepack`;
  - `pnpm` roda com `CI=true`, `npm_config_confirm_modules_purge=false` e `POLARS_SKIP_CPU_CHECK=1`;
  - falha de reconcile AdRotate fica como pendencia sem desfazer cadastro.

Deploy aplicado:

- `adops-runner` recriado com a imagem `cod5/adops-runtime:20260603-runner-runtime`.
- O volume `/app` nao foi montado no runner novo; o codigo vem da imagem.
- Rollback preservado: `adops-runner-backup-immutable-20260603T144313Z`.
- Um segundo rollback foi preservado apos corrigir `PATH`: `adops-runner-backup-immutable-path-20260603T144411Z`.
- `ADOPS_IMAGE_TAG` do env privado local atualizado para `20260603-runner-runtime`.

Validacao do runtime:

```text
uv=/root/.local/bin/uv
uvx=/root/.local/bin/uvx
pdftotext=/usr/bin/pdftotext
pdfinfo=/usr/bin/pdfinfo
pnpm=/usr/bin/pnpm
node=/usr/bin/node
drive_secret=readable
node=v24.14.1
pnpm=10.14.0
uvx=0.11.18
```

Validacao de planilha:

- Comando: `pnpm --filter @workspace/scripts run sync:planilha`.
- Resultado: `ok=true`.
- `rawRows=282`.
- `invalidDateCount=0`.
- Erro antigo `spawnSync uvx ENOENT` nao ocorreu.

Validacao Drive PI real:

- Pasta testada: `/PNMT/PI 14999`.
- Job: `fa23a747-ba70-4a49-9831-f2674ccfa0b2`.
- Pacote: `pi_and_media_present`.
- IA: `provider=openai`, `model=gpt-4.1-mini`.
- PDF lido com texto real:
  - cliente identificado;
  - agencia identificada;
  - site identificado;
  - periodo identificado;
  - formato identificado;
  - PI identificada a partir do PDF.
- Validacao: `ok=true`.
- Aplicacao:
  - campanha deduplicada por `pi_campaign_competencia`;
  - insercao deduplicada como existente.
- `sync:planilha` executou com sucesso dentro do job.
- Telegram:
  - inicial `messageId=1081`;
  - final `messageId=1092`.

Resultado final do job:

- `stage=needs_review`.
- Motivos:
  - insercao sem `mediaUrl`, entao evidencia automatica foi pulada;
  - `reconcile:planilha-adrotate` falhou por credencial/porta SSH do Perrengue ausente no runner.

Interpretacao:

- O plano de runtime containerizado foi implementado e testado.
- A falha de infraestrutura `uvx ENOENT` foi eliminada.
- A falha de PDF sem texto foi eliminada para PDFs textuais.
- Pendencias restantes sao operacionais, nao de runtime containerizado:
  - resolver `mediaUrl` publica para gerar evidencia;
  - configurar credenciais/rota SSH do Perrengue para reconcile AdRotate.

## Comunicacao Telegram humanizada

Atualizado em 2026-06-03.

Problema observado:

- As notificacoes pareciam log tecnico de maquina.
- O operador nao via claramente que as mensagens pertenciam ao mesmo fluxo.
- `needs_review` aparecia como estado tecnico sem explicar a acao humana esperada.

Mudanca aplicada:

- `ops/telegram-adapter/server.mjs` passou a montar mensagens curtas por estado.
- Cada mensagem comeca com emoji de status.
- Cada mensagem mostra `Fluxo: <PI ou pasta>`.
- Cada mensagem inclui uma proxima acao objetiva.
- Erros longos sao truncados para nao poluir o Telegram.

Padrao novo:

```text
🟡 AdOps iniciou uma nova PI
Fluxo: PI 12345
Pasta: ...
Status: processamento automático em andamento
Próxima ação: aguardar a próxima mensagem
```

Exemplos de estados:

- `🟡` iniciado;
- `📦` pasta/pacote conferido;
- `🤖` IA lendo ou leitura concluida;
- `✅` validado, cadastrado ou finalizado;
- `🧾` cadastro em andamento;
- `🖼️` evidencia conferida;
- `🟠` evidencia pendente;
- `🔄` sincronizacao;
- `⚠️` pendencia operacional preservando cadastro;
- `📝` precisa de revisao;
- `❌` falha tecnica.

Deploy aplicado:

- Nova imagem criada: `cod5/adops-runtime:20260603-human-telegram`.
- `adops-runner` recriado com essa imagem.
- `adops-telegram` recriado com essa imagem.
- `ADOPS_IMAGE_TAG` do env privado local atualizado para `20260603-human-telegram`.
- Rollback do Telegram preservado: `adops-telegram-backup-image-20260603T150010Z`.
- Rollback do runner preservado: `adops-runner-backup-human-telegram-20260603T151002Z`.

Validacao:

- `adops-telegram` respondeu `/healthz`.
- `adops-runner` manteve:
  - `uvx`;
  - `pdftotext`;
  - credencial Drive legivel;
  - `pnpm`.
- Teste visual enviado ao Telegram:
  - `messageId=1093`;
  - `messageId=1094`.

## Safe PI Intake e deploy conjunto

Atualizado em 2026-06-03.

O contrato Safe PI Intake adiciona campos e mensagens usados pelo runner e pelo Telegram:

- `packageReadiness`: bloqueia auto-apply sem PDF e midia suficientes.
- `reviewReasons`: explica pendencias como `missing_pi_pdf`, `missing_media`, `needs_media` e `dedupe_conflict`.
- `dedupe`: registra conflitos antes de qualquer mutacao.

Regra de deploy:

- publicar `adops-runner` e `adops-telegram` com a mesma tag de imagem;
- nao atualizar apenas o runner quando o adapter local ainda nao entende `reviewReasons`;
- manter Worker Telegram legado como fallback ate o adapter local estar validado;
- nao usar build/deploy a partir de worktree com mudancas alheias misturadas.

Validacao obrigatoria apos deploy:

```bash
curl -fsS https://adops-api.codigo5.com.br/api/healthz
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
```

Esperado:

- evento sintetico retorna `202`;
- replay retorna `duplicate=true`;
- job fecha `completed`;
- pacote incompleto termina em `needs_review`;
- Telegram mostra proxima acao e motivo objetivo;
- nenhuma campanha/insercao nova aparece sem PI completa.

## Deploy incremental Safe PI Intake

Atualizado em 2026-06-03.

Publicacao aplicada:

- Branch: `codex/adops-safe-pi-intake`.
- Commit: `36fc1da feat: harden safe PI intake flow`.
- Rota: deploy parcial por Portainer API no volume `adops_app_source`.
- Script usado: `ops/portainer/adops-stack/scripts/deploy-safe-pi-intake-partial.sh`.
- Motivo: evitar `upload-runtime-volumes.sh` ou build completo enquanto o worktree local contem mudancas alheias.

Arquivos enviados para `/app`:

- `ops/cloudflare-remote-runner/src/runner.mjs`.
- `ops/telegram-adapter/server.mjs`.
- `ops/cloudflare-telegram-bot/src/index.ts`.
- `scripts/src/harness-drive-pi-monitor-first-v4.mjs`.
- `scripts/src/create-spm-whatsapp-print-intakes-2026-06-03.mjs`.
- `scripts/package.json`.
- `docs/adops/pi-automation-v4-monitor-first-ai-gate.md`.
- `docs/adops/pi-automation-v3/runbook.md`.
- `docs/adops/containerized-runner-runtime-fix-plan-2026-06-03.md`.
- `docs/harness-reports/drive-pi-monitor-first-v4/2026-06-03T21-33-07-815Z/summary.md`.
- `docs/harness-reports/drive-pi-monitor-first-v4/2026-06-03T21-33-07-815Z/results.json`.
- `docs/harness-reports/pi-automation-v3/2026-06-03T21-33-18-249Z/summary.md`.
- `docs/harness-reports/pi-automation-v3/2026-06-03T21-33-18-249Z/results.json`.

Backup preservado:

- Arquivo local gerado pelo deploy parcial: `/var/folders/2b/r3j9swtn7vv8vp7sqf1nj1h00000gn/T/adops-safe-pi-intake-backup-36fc1da-20260603-181326.tar`.
- Conteudo: backup dos mesmos caminhos alterados no volume `adops_app_source`.
- Uso: restaurar esse tar no volume e reiniciar os mesmos containers se o smoke vivo falhar.

Containers reiniciados:

- `adops-runner`.
- `adops-telegram`.

Containers nao recriados:

- `adops-api`.
- `adops-web`.
- Banco.
- Volumes persistentes.
- Monitor Drive.

Validacao pre-deploy:

- `node --check ops/cloudflare-remote-runner/src/runner.mjs`: OK.
- `node --check ops/telegram-adapter/server.mjs`: OK.
- `pnpm --dir ops/cloudflare-telegram-bot run typecheck`: OK.
- `pnpm --dir scripts run harness:drive-pi-monitor-first-v4`: OK, 10 checks.
- `pnpm --dir scripts run harness:pi-automation-v3`: OK, 11 checks.
- `pnpm --dir scripts run audit:capture-rules-integrity`: `ok=true`, `errors=0`, `warnings=9`.

Validacao pos-deploy:

- `https://adops-api.codigo5.com.br/api/healthz`: HTTP 200.
- `https://adops-api-public.leandro471.workers.dev/api/healthz`: HTTP 200.
- `adops-runner`: `running`.
- `adops-telegram`: `running`.
- Logs do runner: inicio limpo com `kinds=sync-planilha,print-batch,print-backfill,drive-pi-ingest,analytics-report,pi-site-export,operational-documents`.
- Logs do Telegram adapter: `listening on 4022`.

Smoke vivo:

- Comando: `ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow`.
- Resultado: `ok=true`.
- Job: `f9b546f1-4f47-4ce8-af48-22defc5de43c`.
- Evento: `drive:cod5synthetic1780524952210:2026-06-03T22:15:52.209Z`.
- Status: `completed`.
- Stage final: `needs_review`.
- Replay: `duplicate=true`.
- Runner que consumiu a fila: `runner-vps-1`.

Observacao operacional:

- O runtime do Mac Mini foi atualizado e os containers `adops-runner`/`adops-telegram` foram reiniciados com logs saudaveis.
- O smoke vivo foi aceito e fechado em `needs_review`, mas foi consumido por `runner-vps-1`.
- Enquanto houver runner legado concorrente na mesma fila, o teste vivo valida o contrato do fluxo, mas nao prova exclusividade de consumo pelo Mac Mini.
- Para provar consumo exclusivo do Mac Mini, pausar o runner legado ou segmentar a fila por `runnerId` antes de um novo smoke.
