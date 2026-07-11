# Rollback AdOps Portainer

## Rollback imediato

Cada release usa os volumes `adops_app_source_<sha12>` e
`adops_web_public_<sha12>`. Para rollback, reapontar explicitamente o stack para
o par anterior e executar:

```bash
ADOPS_IMAGE_TAG=<sha-anterior> \
ADOPS_APP_SOURCE_VOLUME=adops_app_source_<sha12-anterior> \
ADOPS_WEB_PUBLIC_VOLUME=adops_web_public_<sha12-anterior> \
DRIVE_INTEGRATION_MODE=legacy \
ADOPS_STACK_ENV_FILE=/caminho/seguro/adops.env \
bash ops/portainer/adops-stack/scripts/deploy-production.sh
```

O deploy cria antes um dump `adops-before-<sha>-<timestamp>.sql.gz`. Se o smoke
pós-troca falhar, o trap do script reaplica automaticamente os dois volumes e a
tag anteriores. As tabelas de inventário são aditivas e não exigem remoção no
rollback.

Antes de remover volumes antigos, executar a retenção em modo de simulação:

```bash
ADOPS_VOLUME_RETENTION_KEEP=3 \
bash ops/portainer/adops-stack/scripts/retire-release-volumes.sh
```

A remoção só ocorre com `ADOPS_VOLUME_RETENTION_APPLY=true`. Volumes com
referências ativas são preservados. Manter sempre três pares completos.

1. Reapontar frontend para `https://adops-api-public.leandro471.workers.dev`.
2. Manter ou restaurar Pages `https://adops-campanhas-portais.pages.dev`.
3. Pausar containers novos no Portainer:

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh stop adops-runner --endpoint 3
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh stop adops-api --endpoint 3
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh stop adops-web --endpoint 3
```

4. Não remover volumes até confirmar que não há dados novos exclusivos no Mac Mini.

## Rollback de banco

- O banco legado permanece fonte de rollback por 72h.
- Dumps gerados ficam em `docs/harness-reports/adops-portainer-migration/<timestamp>/`.
- Se houver escrita no banco novo durante teste, exportar antes de parar o stack.
- Não apagar `cod5_drive_inventory_scans` ou `cod5_drive_inventory_items`; voltar para `DRIVE_INTEGRATION_MODE=legacy` é suficiente.

## Rollback de Telegram

- Manter Worker Telegram antigo ativo até o container Node ter webhook real e `message_id` validado.
- Se qualquer teste falhar, não alterar webhook do bot.
