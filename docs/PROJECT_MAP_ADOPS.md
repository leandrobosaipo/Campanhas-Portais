# AdOps — Mapa do Projeto

## Estrutura

```text
/Users/leandrobosaipo/Projetos/AdOps
  artifacts/adops                 Frontend do painel
  artifacts/api-server            API privada Node
  lib/db                          Schema do banco
  lib/api-spec                    OpenAPI
  lib/api-client-react            Cliente React gerado
  lib/api-zod                     Tipos/validações geradas
  scripts                         Rotinas operacionais
  config/adrotate-sites.json      Mapa portal/posição/slot
  ops/cloudflare-public-api       Worker público
  ops/cloudflare-remote-runner    Runner de fila
  ops/cloudflare-telegram-bot     Bot Telegram em Worker
  ops/telegram-bot                Config local do bot
  ops/wordpress                   Plugin/integração AdRotate
  docs                            PRDs, specs, harness e runbooks
  docs/runbook-nova-pi-evidencias.md
                                  Runbook curto para nova PI, evidencias e entrega
  docs/adops/system               Hub canonico de arquitetura, contratos e migracao Portainer
  ops/portainer/adops-stack       Stack Portainer alvo do Mac Mini
```

## Hub de documentação

- `docs/README.md` é o índice central.
- `docs/runbook-nova-pi-evidencias.md` é o caminho curto para onboarding operacional: cadastrar PI, sincronizar planilha/AdOps/AdRotate, gerar evidencias atuais/retroativas, auditar e entregar.
- `docs/adops/system/` é a fonte primária para arquitetura, contratos, migração Portainer, harness, runbook, playbook e prompts operacionais.
- `docs/adops/pi-automation-v3/` é o pacote oficial para automação de PI, Drive, WhatsApp, e-mail, planilha, AdRotate, GIF capture-only e evidências retroativas.
- `docs/adops/pi-automation-v4-monitor-first-ai-gate.md` é o contrato atual para monitor-first: `intake_locked`, Telegram inicial, classificador de pacote e gate IA/OpenAI antes do auto-apply.
- `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md` é o plano de migração do control plane Cloudflare/D1/Queue/Telegram para Mac Mini/Portainer, preservando todo histórico e evitando duplicidade.
- `docs/adops/ga4-monthly-report-ui/` é o pacote atual para fechamento mensal de Analytics usando a página do Google Analytics, sem API personalizada.
- `docs/adops/roo-layout-drive-pi-v2/` fica como referência histórica. Não usar como fonte principal para novas decisões.

## Serviços vivos

- Painel: `https://adops-campanhas-portais.pages.dev`
- API pública: `https://adops-api-public.leandro471.workers.dev`
- VPS/Easypanel:
  - `codigo5_adops-api`
  - `codigo5_adops-runner`
- WordPress/AdRotate:
  - Perrengue
  - O Matogrossense
  - A Folha Livre
  - Portal Norte MT
  - Portal Pantanal MT
  - Roo Notícias

## Rotinas principais

### Sincronização da planilha

Arquivos:

- `scripts/src/sync-planilha-latest.ts`
- `docs/spec-sync-planilha-v1.md`
- `docs/harness-sync-planilha-v1.md`

### Reconciliação Planilha + AdRotate

Arquivos:

- `scripts/src/reconcile-planilha-adrotate.ts`
- `docs/spec-reconcile-planilha-adrotate-v1.md`
- `docs/harness-reconcile-planilha-adrotate-v1.md`

### Prints e auditoria

Arquivos:

- `scripts/src/capture-insertion-proof.cjs`
- `config/adrotate-sites.json`
- `docs/prints-retroativos.md`
- `docs/spec-prints-moldura-windows-v4.md`
- `docs/harness-prints-moldura-windows-v4.md`
- `docs/adops/pi-automation-v3/spec.md`

Regra atual de GIF:

- GIF continua publicado.
- Captura pode aplicar frame normalizado somente no DOM.
- Metadata deve registrar `captureOnly`, `originalGifUrl`, `gifChosenFrameIndex`, `frameSelectionReason` e `syntheticHoldMs`.
- Quando uma campanha tiver frames ruins/sem mensagem legivel, configurar `gifAllowedFrameRanges` em `config/adrotate-sites.json`.
- A auditoria da API deve rejeitar frame fora do intervalo aprovado com `gif_frame_not_approved`.
- Caso de referencia: `PI 490711 / Energisa / PERRENGUE G06`, intervalos `99-195`, `206-285`, `318-389`.

### Automação de PI v3

Arquivos:

- `docs/adops/pi-automation-v3/prd.md`
- `docs/adops/pi-automation-v3/blueprint.md`
- `docs/adops/pi-automation-v3/sdd.md`
- `docs/adops/pi-automation-v3/spec.md`
- `docs/adops/pi-automation-v3/harness.md`
- `docs/adops/pi-automation-v3/tests.md`
- `docs/adops/pi-automation-v3/playbook.md`
- `docs/adops/pi-automation-v3/runbook.md`
- `docs/adops/pi-automation-v3/prompts.md`
- `scripts/src/harness-pi-automation-v3.mjs`

Comando:

```bash
pnpm --dir scripts run harness:pi-automation-v3
```

### Drive PI monitor-first v4

Arquivos:

- `docs/adops/pi-automation-v4-monitor-first-ai-gate.md`
- `scripts/src/harness-drive-pi-monitor-first-v4.mjs`
- `ops/cloudflare-public-api/src/index.ts`
- `ops/cloudflare-remote-runner/src/runner.mjs`
- `ops/cloudflare-telegram-bot/src/index.ts`

Fluxo:

```text
Drive detectou pasta/arquivo
  -> Worker cria drive-pi-ingest
  -> runner marca intake_locked
  -> Telegram avisa inicio e pede para nao cadastrar manualmente
  -> runner classifica pacote: folder_empty | missing_pi_pdf | missing_media | pi_and_media_present
  -> OpenAI/Structured Outputs identifica campos
  -> validacao deterministica aplica ou envia needs_review
```

Comandos:

```bash
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
```

Simulação de sucesso:

- harness v4 local precisa retornar `ok: true`;
- smoke vivo cria evento sintético, deve retornar `202` no primeiro POST, `duplicate=true` no replay e progresso final com stage `needs_review`;
- para PI real completa, o sucesso operacional é Telegram inicial + `packageClassification=pi_and_media_present` + `agent_analysis` com campos citados + `applied` ou `needs_review` acionável sem cadastro duplicado.

### Migração control plane para Mac Mini

Arquivo:

- `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md`

Contrato:

```text
Cloudflare deixa de executar compute do AdOps.
Cloudflare fica apenas DNS/Tunnel/Access.
Historico D1/Queue/Telegram/Drive PI precisa snapshot + import idempotente.
Nao cortar Worker/D1 antes de contagens, conflitos e rollback 72h.
```

Historico que não pode ser omitido:

- `ops_jobs`
- `cod5_drive_events`
- `cod5_inbound_documents`
- `cod5_document_parse_runs`
- `drive-pi-monitor-state.json`
- logs/metadata de evidencias e jobs

Regra anti-duplicidade:

- `ops_jobs.id`
- `cod5_drive_events.event_id`
- `cod5_inbound_documents.id`
- `cod5_document_parse_runs.id`
- campanha por `piCodigo + cliente + agencia + competencia`
- insercao por `campanha + site + localFormato + periodo`

### Regras de captura

Arquivos:

- `docs/adops/capture-config/README.md`
- `docs/adops/capture-config/spec-v1.md`
- `docs/adops/capture-config/runbook-rollout-v1.md`
- `scripts/src/audit-capture-rules-integrity.mjs`

### Fila e progresso

Arquivos:

- `ops/cloudflare-public-api/src/index.ts`
- `ops/cloudflare-remote-runner/src/runner.mjs`
- `docs/spec-adops-fila-progresso-v1.md`
- `docs/harness-adops-ux-fila-progresso-v1.md`

### Telegram

Arquivos:

- `ops/telegram-bot/.env`
- `ops/cloudflare-telegram-bot/src/index.ts`
- `docs/fluxos-telegram-bot-adops.md`
- `docs/telegram-setup-copiar-colar.md`

## Portais e grupos

A fonte local do mapeamento é:

```bash
config/adrotate-sites.json
```

A chave operacional de posição é:

```text
siteSigla + groupId
```

Não criar regra duplicada publicada para a mesma chave.

## Deploy

Cloudflare Worker:

```bash
cd ops/cloudflare-public-api
wrangler deploy
```

Telegram Worker:

```bash
cd ops/cloudflare-telegram-bot
wrangler deploy
```

VPS/Easypanel:

```bash
bash ops/contabo/deploy_vps_easypanel.sh
```

Mac Mini / Portainer:

```bash
ADOPS_IMAGE_TAG="$(date +%Y%m%d-%H%M)" \
VITE_API_BASE_URL="https://adops-api.codigo5.com.br" \
ops/portainer/adops-stack/scripts/build-image-portainer.sh

ADOPS_STACK_ENV_FILE=/secure/path/adops.env \
ops/portainer/adops-stack/scripts/deploy-stack.sh
```

Frontend Pages:

Ver documentação em:

```bash
docs/cloudflare-pages-deploy.md
```
