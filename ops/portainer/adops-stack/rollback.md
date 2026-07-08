# Rollback AdOps Portainer

## Rollback imediato

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

## Rollback de Telegram

- Manter Worker Telegram antigo ativo até o container Node ter webhook real e `message_id` validado.
- Se qualquer teste falhar, não alterar webhook do bot.
