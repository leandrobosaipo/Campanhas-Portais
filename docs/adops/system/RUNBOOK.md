# RUNBOOK - Operação AdOps Portainer

## Diagnóstico rápido

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh status
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh endpoints
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh ps --endpoint 3 --filter adops
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh stack-logs --stack adops --endpoint 3 --tail 120
```

## Deploy

1. Rodar `upload-runtime-volumes.sh`.
2. Rodar `deploy-stack.sh` com `docker-compose.volume.yml`.
3. Restaurar dados com `restore-local-db-portainer.sh` ou `migrate-data.sh`.
4. Validar logs.
5. Validar endpoints.

## Rollback

Consultar:

```text
ops/portainer/adops-stack/rollback.md
```

Regra: não remover volumes até confirmar que não há escrita exclusiva no banco novo.

## Incidentes

- API sem health: olhar logs `adops-api` e conexão Postgres.
- Runner parado: só ativar depois do aceite do banco e da fila.
- Painel sem dados: validar `VITE_API_BASE_URL` da imagem `adops-web`.
- Telegram: manter Worker antigo até container validado.
- POST público `401`: esperado sem `Authorization: Bearer <OPS_API_TOKEN>`.
- DNS sem resposta local: confirmar em `dig @1.1.1.1`; pode ser cache do resolvedor do operador.
