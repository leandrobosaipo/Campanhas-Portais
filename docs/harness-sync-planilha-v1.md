# HARNESS - Sincronizacao Planilha v1

## Objetivo

Validar que a sincronizacao da planilha continua idempotente e segura antes de rodar em producao.

## Comando

```bash
pnpm --dir scripts run harness:sync-planilha-v1
```

## Modo seguro

Por padrao o harness nao altera banco nem WordPress. Ele valida:

- script `sync:planilha` existe;
- documentos de deduplicacao existem;
- rotina de reconcile existe para pos-sync;
- modo de mutacao esta desabilitado por padrao.

Para permitir execucao real:

```bash
ADOPS_HARNESS_ALLOW_MUTATION=true pnpm --dir scripts run harness:sync-planilha-v1
```

## Saidas

- `docs/harness-reports/sync-planilha-v1/<timestamp>/summary.md`
- `docs/harness-reports/sync-planilha-v1/<timestamp>/results.json`

## Aceite

- Nenhuma variavel sensivel aparece no relatorio.
- Harness passa sem mutacao.
- Quando mutacao for habilitada, a rotina deve retornar contadores e nao criar duplicidades.

