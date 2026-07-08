# HARNESS - Importacao de PI v1

## Objetivo

Validar o fluxo de importacao de PI sem criar duplicidade.

## Comando

```bash
pnpm --dir scripts run harness:pi-import-v1
```

## Checks

- Documentos PRD/SPEC existem.
- Pasta de entrada pode ser analisada sem mutacao.
- Deduplicacao possui chave documentada.
- Sync e reconcile estao disponiveis.
- Endpoint de jobs de print esta acessivel.

## Execucao real

Importacao com mutacao deve exigir flag explicita:

```bash
ADOPS_HARNESS_ALLOW_MUTATION=true ADOPS_PI_INPUT_DIR="/caminho/da/pi" pnpm --dir scripts run harness:pi-import-v1
```

## Saidas

- `docs/harness-reports/pi-import-v1/<timestamp>/summary.md`
- `docs/harness-reports/pi-import-v1/<timestamp>/results.json`

## Aceite

- PI conhecida nao cria campanha duplicada.
- Cliente/agencia ficam sincronizados.
- Midia vinculada ou marcada para revisao.
- Prints retroativos enfileirados apenas apos cadastro consistente.

