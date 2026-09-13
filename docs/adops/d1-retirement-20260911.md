# Retirada do D1 — AdOps

Release baseado em c80f1995e3a82ca40812fa4f415e9d213f422c2e, isolado de alterações locais alheias. PostgreSQL16 e API Express existentes no Mac Mini passam a ser autoridade de todos os jobs. Worker antigo vira ponte HTTPS sem D1/Queue/cron, mantendo URLs legadas. Bot permanece na Cloudflare e usa Bearer ao solicitar PI; nenhum envio de teste em produção.

## Dados e segurança

Importador offline `scripts/src/prepare-d1-retirement.py` recebe SQLite D1, snapshots JSONL PG e resoluções explícitas com hashes. Gera transação SQL em lotes25, verifica conflitos e equivalência coluna a coluna, arquiva8tabelas e cria índice parcial da fila. Repetir o SQL não duplica registros. Não aplicar snapshot diferente ao mesmo archive.

44jobs antigos não terminados ficam em `awaiting_human_review`; não reexecutar automaticamente. Duas divergências Drive preservam PG e arquivam origem. O archive `cod5_d1_archive_20260911.origem` guarda a origem; `resolucoes` guarda decisões; `alteracoes` registra INSERT/UPDATE/DELETE posteriores nas8tabelas. Os jobs existentes no PG são preservados.

Backups privados e evidências desta execução: `/Users/leandrobosaipo/Projetos/macmini/backups/adops-d1-20260911` e `/Users/leandrobosaipo/Projetos/macmini/reports/d1-migracao-20260911`. Não publicar backups, SQL gerado, dados nem configurações de ambiente.

## Gates e corte

1. Export D1 íntegro, backup PG restaurado em HML isolada.
2. Importação/repetição equivalentes; runtime HML valida claim concorrente, lease, dependências, notBefore, revisão e PI idempotente.
3. Congelar produtores/runners, fila Cloudflare vazia, impedir gravações pela API durante snapshot final.
4. Backup/snapshot final; revalidar divergências e importar transação. Se falhar, rollback transacional automático.
5. Publicar release pelo stack4/endpoint3 preservando Env, serviços e volumes de dados. Runner dedicado aponta `http://adops-api:4011`.
6. Remover consumer da Queue e cron do Worker; publicar ponte sem D1. Manter Queue e banco original preservados.
7. Validar autenticação e acesso real, jobs importados, downloads, estado dos runners e bindings sem D1.

## Reversão

Antes de novas gravações, restaurar backup PG final validado e release original. Depois de novas gravações, congelar escritores e exportar o journal com `SELECT row_to_json(cod5_linha) FROM cod5_d1_archive_20260911.alteracoes cod5_linha ORDER BY sequencia`; exportar resoluções da mesma forma. Usar `prepare-d1-rollback.py` em cópia para gerar SQLite reconciliado e SQL revisável. Ele recusa conflito não resolvido e mudança de PK. O dump SQL completo destina-se a banco vazio de recuperação validado; não executar sobre D1 existente sem reconciliação explícita. Preservar PG como autoridade até comprovar restauração e equivalência. O retorno à versão antiga que usa D1 também reintroduz o limite diário; preferir corrigir avançando quando dados estão íntegros.

Manter D1, backup e volume de release anterior por pelo menos30dias e até aprovação final. Nunca apagar D1 como parte automática do corte. Não rodar os44jobs retidos nem reenviar mensagens como validação.

## Checks reproduzíveis

- `python3 scripts/src/test-prepare-d1-rollback.py`
- `pnpm --dir scripts exec tsx --test src/test-d1-retirement-api-contract.mjs src/test-d1-retirement-bridge.mjs src/test-d1-retirement-polling.mjs`
- `pnpm --filter @workspace/api-server run build`
- `test-d1-retirement-runtime.mjs` exige ambiente `cod5_adops_hml`, token fixture e base local; recusa produção.

Runners usam backoff compartilhado por pool, preservam concorrência útil e abrem circuito até reset UTC se uma versão antiga ainda reportar quota D1. Banco e API mantêm restart automático existente via Compose. A origem só pode ser eliminada após validação operacional e restauração independente dos backups.
