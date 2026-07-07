# AdOps Portainer Stack

Este diretório prepara a migração do AdOps para o Mac Mini via Portainer.

Estado seguro deste pacote:

- cria contratos e artefatos de deploy;
- não contém secrets;
- não desliga EasyPanel, Worker, Pages ou Telegram legado;
- exige env privado antes de qualquer deploy.

## Serviços

- `adops-postgres`: PostgreSQL 16 persistente.
- `adops-api`: API Node/Express na porta interna `4011`.
- `adops-runner`: runner de fila sem porta pública.
- `adops-drive-pi-monitor`: profile `phase2-drive-monitor`, desligado até migrar estado do container standalone.
- `adops-web`: painel Vite servido por Nginx.
- `adops-telegram`: profile `phase2`, bloqueado até existir adaptador Node para o Worker atual.

## Fluxo

```bash
cp ops/portainer/adops-stack/.env.example /secure/path/adops.env
# edite /secure/path/adops.env sem commitar secrets

PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
VITE_API_BASE_URL="https://adops-api.codigo5.com.br" \
ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh

PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
COMPOSE_FILE=/Users/leandrobosaipo/Projetos/AdOps/ops/portainer/adops-stack/docker-compose.volume.yml \
ADOPS_STACK_ENV_FILE=/secure/path/adops.env \
ops/portainer/adops-stack/scripts/deploy-stack.sh
```

Fallback de imagem imutável:

```bash
ADOPS_IMAGE_TAG="$(date +%Y%m%d-%H%M)" \
VITE_API_BASE_URL="https://adops-api.codigo5.com.br" \
ops/portainer/adops-stack/scripts/build-image-portainer.sh
```

## Migração de dados

```bash
ADOPS_MIGRATION_ENV_FILE=/secure/path/adops-migration.env \
ops/portainer/adops-stack/scripts/migrate-data.sh
```

Carga local inicial validada:

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
ADOPS_STACK_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env \
SOURCE_DATABASE_URL=postgresql:///campanhas_portais_local \
ops/portainer/adops-stack/scripts/restore-local-db-portainer.sh
```

O arquivo privado precisa definir:

```text
SOURCE_DATABASE_URL=...
TARGET_DATABASE_URL=...
```

O script gera relatório em:

```text
docs/harness-reports/adops-portainer-migration/<timestamp>/verification.json
```
