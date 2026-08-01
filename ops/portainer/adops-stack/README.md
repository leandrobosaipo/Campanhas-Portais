# AdOps Portainer Stack

Este diretório prepara e opera o AdOps via Portainer.

Existem dois usos diferentes de Portainer nesta rotina:

- `stack-admin`: administra o stack AdOps onde ficam `adops-api`,
  `adops-runner`, `adops-web` e banco.
- `perrengue-vm8`: usado de dentro do runner para executar WordPress/AdRotate
  do PMT/Perrengue no VM8 Hostinger.

Nao misture os dois. O primeiro controla onde o AdOps roda. O segundo e a
integracao que permite publicar campanha no AdRotate do Perrengue.

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

Arquivos locais organizados, ignorados pelo Git:

```text
ops/portainer/adops-stack/.env.stack-admin-portainer
  Credencial Portainer para administrar o proprio stack AdOps.
  Uso: PORTAINER_ENV_FILE=... scripts/upload-runtime-volumes.sh

ops/portainer/adops-stack/.env.perrengue-vm8-portainer
  Credencial Portainer VM8 e variaveis ADOPS_PERRENGUE_* para o runner operar
  o WordPress do Perrengue.
  Uso: copiar/mesclar no ADOPS_STACK_ENV_FILE de producao.
```

O arquivo de producao atual fica fora do Git:

```text
/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env
```

Ele deve conter `PORTAINER_URL`, `PORTAINER_API_KEY` e
`ADOPS_PERRENGUE_ADROTATE_EXEC_MODE=portainer` apontando para o VM8, nao para o
Portainer de administracao do stack.

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

## Deploy imutável e retomável

`scripts/deploy-production.sh` cria volumes identificados pelo SHA da release. O upload usa containers auxiliares com nome determinístico por volume.

Se Cloudflare/Portainer devolver timeout ou `524` depois de criar o container, a repetição consulta o nome existente e retoma o mesmo volume. Respostas não JSON nunca são enviadas diretamente ao `jq`.

O stack só é trocado depois de validar:

- manifesto `cod5-release.json` nos dois volumes;
- bundle da API e dependências no volume da aplicação;
- `index.html` no volume web.

Quando `DRIVE_INTEGRATION_MODE` não é informado no terminal, o deploy preserva o modo já configurado no stack; ele não regride automaticamente para `legacy`.

Se o smoke falhar depois da troca, o trap restaura os volumes anteriores. Não remova os volumes da release anterior antes do aceite público.

O script gera relatório em:

```text
docs/harness-reports/adops-portainer-migration/<timestamp>/verification.json
```

## Teste da rotina PMT/Perrengue

Validar sem mutacao:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-publish" \
  -d '{"insertionId":1683,"apply":false,"replaceExisting":true,"purgeCache":false,"generateEvidence":false,"date":"2026-07-09"}'
```

Aceite:

- job `completed`;
- `execution.executor=portainer`;
- `executorContext.containerName=cod5-pro119-perrenguematogrosso-app`;
- `wpCliResult.mode=preview`;
- `bannercode_contains_asset=true`.

Validar o acesso direto ao Portainer VM8 antes de investigar campanha:

```bash
ops/portainer/adops-stack/scripts/validate-perrengue-vm8-portainer.sh
```

Aceite:

- `portainer_status_http=200`;
- `perrengue_wp_container_count=1`;
- `perrengue_static_container_count=1`;
- `exec_exit_code=0`;
- `exec_output=wp-load-ok`.
