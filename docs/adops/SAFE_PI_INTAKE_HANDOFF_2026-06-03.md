# Safe PI Intake - handoff operacional

Atualizado em: 2026-06-03

## Estado atual

- Branch: `codex/adops-safe-pi-intake`
- Commit publicado para deploy parcial: `36fc1da`
- Commit: `feat: harden safe PI intake flow`
- Destino de runtime: Mac Mini / Portainer / volume `adops_app_source`
- Motivo do deploy parcial: o worktree local tem mudanças não relacionadas; não usar build ou upload completo a partir dele.
- Deploy parcial aplicado em 2026-06-03.
- Backup local do volume: `/var/folders/2b/r3j9swtn7vv8vp7sqf1nj1h00000gn/T/adops-safe-pi-intake-backup-36fc1da-20260603-181326.tar`

## O que o commit entrega

- Runner bloqueia auto-apply sem PDF e mídia suficientes.
- Runner registra `packageReadiness`, `reviewReasons` e `dedupe`.
- `dedupe_conflict` bloqueia mutação quando há campanhas ou inserções concorrentes.
- Telegram Worker e adapter local mostram motivo objetivo de revisão.
- Script de intake complementar por WhatsApp fica protegido por flag.
- Harness v4 cobre o contrato do Safe PI Intake.

## Intakes WhatsApp já criados

Não recriar estes intakes:

| Intake | Job | Resultado |
| --- | --- | --- |
| `PERR-ALMT-CIDADANIA-MEGABANNER-TOPO` | `6eb545f9-9bef-49c3-af89-fc161d0b2a1d` | `completed / needs_review` |
| `PERR-ALMT-CIDADANIA-VIDEO` | `83921a67-87a2-4ba1-bf64-40f8e463edf9` | `completed / needs_review` |
| `ROO-CAMPANHA-2026-06-05` | `14237c55-744b-494b-b5be-2801f99542ea` | `completed / needs_review` |
| `AFL-CAMPANHA-2026-06-09` | `9b188512-a0c8-490a-9c91-cc1525eb2420` | `completed / needs_review` |

Esses jobs servem como trava/rastreabilidade. Eles não devem gerar campanha ou inserção até a PI real chegar por PDF/Drive/planilha.

## Deploy incremental

Usar somente:

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
ops/portainer/adops-stack/scripts/deploy-safe-pi-intake-partial.sh
```

Depois reiniciar somente:

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh restart adops-runner --endpoint 3
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh restart adops-telegram --endpoint 3
```

Não usar:

```bash
ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh
ops/portainer/adops-stack/scripts/build-image-portainer.sh
```

enquanto o worktree estiver com mudanças alheias.

## Validação obrigatória

Antes do deploy:

```bash
node --check ops/cloudflare-remote-runner/src/runner.mjs
node --check ops/telegram-adapter/server.mjs
pnpm --dir ops/cloudflare-telegram-bot run typecheck
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
pnpm --dir scripts run harness:pi-automation-v3
pnpm --dir scripts run audit:capture-rules-integrity
```

Depois do deploy:

```bash
curl -fsS https://adops-api.codigo5.com.br/api/healthz
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh containers --endpoint 3 --filter adops
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
```

Resultado observado em 2026-06-03:

- API Mac Mini: HTTP 200.
- API publica Worker: HTTP 200.
- `adops-runner`: `running`.
- `adops-telegram`: `running`.
- Logs do runner: inicio limpo e `drive-pi-ingest` habilitado.
- Logs do adapter: `listening on 4022`.
- Smoke vivo: `ok=true`.
- Smoke job: `f9b546f1-4f47-4ce8-af48-22defc5de43c`.
- Smoke final: `completed / needs_review`.
- Replay: `duplicate=true`.
- Runner que consumiu o smoke: `runner-vps-1`.

Nota: o runner do Mac Mini foi atualizado e ficou saudavel, mas a fila viva ainda pode ser consumida pelo runner legado. Para provar consumo exclusivo do Mac Mini, pausar o runner legado ou segmentar o teste por runner antes de novo smoke.

Aceite:

- API pública HTTP 200.
- `adops-runner` e `adops-telegram` em `running`.
- Smoke vivo fecha `completed`.
- Stage final sintético fica `needs_review`.
- Telegram mostra motivo de revisão.
- Nenhuma campanha/inserção nasce sem PI completa.

## Rollback

O script parcial gera backup dos caminhos alterados no volume `adops_app_source`.

Se falhar:

1. Restaurar o backup gerado pelo script no mesmo volume.
2. Reiniciar `adops-runner`.
3. Reiniciar `adops-telegram`.
4. Rodar health e smoke vivo novamente.

Não remover volumes, banco, monitor do Drive, API ou web.
