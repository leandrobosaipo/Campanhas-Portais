# HARNESS - Reconciliacao Planilha, AdOps e AdRotate v1

## Objetivo

Validar a rotina que compara AdOps, planilha e AdRotate antes de aplicar correcao nos portais.

## Comando

```bash
pnpm --dir scripts run harness:reconcile-planilha-adrotate-v1
```

## Modo seguro

O harness roda em modo leitura por padrao. Ele valida:

- script `reconcile:planilha-adrotate` existe;
- auditoria de regras de captura;
- presenca da documentacao de deduplicacao;
- existencia de configuracao dos portais.

Execucao com mutacao exige:

```bash
ADOPS_HARNESS_ALLOW_MUTATION=true pnpm --dir scripts run harness:reconcile-planilha-adrotate-v1
```

## Saidas

- `docs/harness-reports/reconcile-planilha-adrotate-v1/<timestamp>/summary.md`
- `docs/harness-reports/reconcile-planilha-adrotate-v1/<timestamp>/results.json`

## Aceite

- Nenhuma duplicidade nova.
- Modelos desativados apenas nos grupos com anuncio real ativo.
- Divergencias ficam no relatorio com acao recomendada.

