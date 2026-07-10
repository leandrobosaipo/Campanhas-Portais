# HARNESS - Migração AdOps Portainer

## Antes do deploy

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/scripts run audit:wordpress-managed-versions
pnpm --filter @workspace/scripts run test:public-auth-smoke
pnpm --filter @workspace/scripts run test:mutation-inventory
```

## Build de imagem

Modo ativo validado em 2026-05-19: runtime por volumes Docker, evitando timeout `524` no build remoto grande via Cloudflare.

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
VITE_API_BASE_URL=https://adops-api.codigo5.com.br \
ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh
```

Fallback de imagem imutável:

```bash
ADOPS_IMAGE_TAG="$(date +%Y%m%d-%H%M)" \
VITE_API_BASE_URL="https://adops-api.codigo5.com.br" \
ops/portainer/adops-stack/scripts/build-image-portainer.sh
```

Esperado:

- imagem `cod5/adops-runtime:<tag>` criada.
- imagem `cod5/adops-web:<tag>` criada.
- nenhum secret impresso.

## Deploy de stack

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
COMPOSE_FILE=/Users/leandrobosaipo/Projetos/AdOps/ops/portainer/adops-stack/docker-compose.volume.yml \
ADOPS_STACK_ENV_FILE=/secure/path/adops.env \
ops/portainer/adops-stack/scripts/deploy-stack.sh
```

Esperado:

- containers `adops-postgres`, `adops-api`, `adops-web`.
- `adops-runner` só entra quando o profile operacional for ativado.
- `adops-api` healthy.
- `adops-web` healthy.

## Migração de banco

Carga inicial local validada:

```bash
PORTAINER_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/.env.portainer \
ADOPS_STACK_ENV_FILE=/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env \
SOURCE_DATABASE_URL=postgresql:///campanhas_portais_local \
ops/portainer/adops-stack/scripts/restore-local-db-portainer.sh
```

Dump/restore completo quando `SOURCE_DATABASE_URL` produtiva estiver disponível:

```bash
ADOPS_MIGRATION_ENV_FILE=/secure/path/adops-migration.env \
ops/portainer/adops-stack/scripts/migrate-data.sh
```

Esperado:

- `verification.json` com `match=true` em todas as tabelas críticas.

## Público

```bash
curl -I https://adops.codigo5.com.br
curl -I https://adops-api.codigo5.com.br/api/healthz
```

Se o resolvedor local ainda não enxergar o DNS, validar com `dig @1.1.1.1` e `curl --resolve`.

Resultado vivo:

```text
docs/harness-reports/adops-portainer-migration/20260519T081200/RESULTS.md
```
