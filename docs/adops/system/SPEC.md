# SPEC - Stack AdOps Portainer

## Destino

- Host: Mac Mini `codigo5-cloud`
- Orquestração: Portainer `v2.39.1`
- Endpoint: `3 local`
- Stack: `adops`
- Base esperada: `/home/codigo5/portadeploy/adops`

## Serviços

| Serviço | Porta | Público | Persistência |
|---|---:|---|---|
| `adops-postgres` | `127.0.0.1:5432` | não | `adops_postgres_data` |
| `adops-api` | `4011` | via Tunnel `adops-api.codigo5.com.br` | prints temporários |
| `adops-runner` | nenhuma | não | `adops_runner_state` |
| `adops-drive-pi-monitor` | nenhuma | não | `adops_drive_pi_monitor_state` |
| `adops-web` | `80` | via Tunnel `adops.codigo5.com.br` | imagem imutável |
| `adops-telegram` | futura | via Tunnel `adops-telegram.codigo5.com.br` | pendente |

## Imagens

- `cod5/adops-runtime:<tag>`
- `cod5/adops-web:<tag>`

As imagens são construídas localmente no Docker do Mac Mini via Portainer API. Não dependem de registry externo.

## Runtime Ativo

Em 2026-05-19, o modo funcional publicado usa volumes Docker porque o build remoto grande via Docker API retornou timeout `524` no caminho Cloudflare.

- `docker-compose.volume.yml`
- `adops-api`: `mcr.microsoft.com/playwright:v1.59.1-noble` com source em `adops_app_source`
- `adops-web`: `nginx:1.27-alpine` com bundle em `adops_web_public`
- upload: `scripts/upload-runtime-volumes.sh`

O alvo de hardening continua sendo imagem imutável `cod5/adops-runtime:<tag>` e `cod5/adops-web:<tag>`.

## Arquivos

- `ops/portainer/adops-stack/docker-compose.yml`
- `ops/portainer/adops-stack/Dockerfile.portainer`
- `ops/portainer/adops-stack/.env.example`
- `ops/portainer/adops-stack/scripts/build-image-portainer.sh`
- `ops/portainer/adops-stack/scripts/deploy-stack.sh`
- `ops/portainer/adops-stack/scripts/migrate-data.sh`
- `ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh`
- `ops/portainer/adops-stack/scripts/restore-local-db-portainer.sh`

## Variáveis

Documentar apenas nomes. Valores reais ficam em env privado.

- `ADOPS_IMAGE_TAG`
- `ADOPS_POSTGRES_DB`
- `ADOPS_POSTGRES_USER`
- `ADOPS_POSTGRES_PASSWORD`
- `ADOPS_INTERNAL_API_TOKEN`
- `OPS_API_TOKEN`
- `DO_SPACES_ACCESS_KEY_ID`
- `DO_SPACES_SECRET_ACCESS_KEY`
- `SOURCE_DATABASE_URL`
- `TARGET_DATABASE_URL`

## Telegram

O Telegram atual é Worker puro. O serviço `adops-telegram` fica em `profile: phase2` até existir adaptador Node HTTP.

## Drive PI Monitor

O container vivo `adops-drive-pi-monitor` não deve ser duplicado no corte inicial. O stack já possui o serviço `adops-drive-pi-monitor` em `profile: phase2-drive-monitor`; ativar apenas depois de migrar o estado atual e pausar o container standalone.
