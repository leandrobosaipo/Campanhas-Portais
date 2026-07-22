# Credenciais e variáveis do AdOps

Este arquivo documenta nomes e donos. Nunca adicione valores reais ao Git.

## API

- `DATABASE_URL`: PostgreSQL do AdOps.
- `OPS_API_TOKEN`: autenticação dos endpoints operacionais.
- `ADOPS_INTERNAL_API_TOKEN` ou `PRIVATE_ADOPS_API_TOKEN`: comunicação serviço a serviço.
- `DRIVE_INTEGRATION_MODE=monitor`: força leitura pelo snapshot do monitor.

## Monitor do Drive

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` ou `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE`.
- `DRIVE_PI_MONITOR_ROOT_FOLDER_ID`.
- `PRIVATE_ADOPS_API_BASE_URL` e token interno.

As credenciais Google pertencem ao `adops-drive-pi-monitor`, em rede interna. API pública, painel e Cloudflare não devem recebê-las.

## Runner

- `OPS_API_BASE_URL` e `OPS_API_TOKEN`.
- `PRIVATE_ADOPS_API_BASE_URL` e `PRIVATE_ADOPS_API_TOKEN`.
- `OPS_JOB_KINDS`.
- Portainer/WordPress específicos do PMT quando o modo for `portainer`.
- Telegram direto ou URL do bridge interno.

O runner executa jobs; não é fonte canônica do inventário Drive.

## Arquivos locais fora do Git

```text
.env.adops-operator.local
ops/portainer/adops-stack/.env.stack-admin-portainer
ops/portainer/adops-stack/.env.perrengue-vm8-portainer
/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env
```

Permissão recomendada: `600`.

## Verificação segura

```bash
GET  /api/ops/runtime-topology
GET  /api/ops/runtime-readiness
POST /api/ops/jobs/runtime-readiness-probe
```

Esses contratos retornam presença/capacidade, nunca valores.
