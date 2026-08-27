# Harness de recuperação retroativa

O harness executa uma fatia explícita de uma inserção. Ele não agenda automação e não cria retry de job: depois de um único `POST /api/ops/jobs/print-backfill`, acompanha o mesmo `jobId` até `completed`, `failed` ou o timeout finito (máximo de 45 minutos).

Use a base da API já configurada em `ADOPS_PUBLIC_API_BASE_URL`. Quando o endpoint exigir autenticação, use a variável operacional existente (`ADOPS_OPS_API_TOKEN`, `OPS_API_TOKEN` ou `ADOPS_INTERNAL_API_TOKEN`); o harness não imprime seus valores.

## Check somente leitura

```bash
pnpm --dir scripts run harness:retroactive-recovery -- \
  --mode=check \
  --output-dir=docs/harness-reports/retroactive-recovery/check-2026-08-27
```

`check` consulta preflight do Drive, publicação AdRotate, fila e readiness. Não faz `POST`.

## Executar uma fatia

```bash
pnpm --dir scripts run harness:retroactive-recovery -- \
  --mode=execute \
  --insertion-id=2645 \
  --from-date=2026-08-24 \
  --to-date=2026-08-26 \
  --timeout-ms=2700000 \
  --output-dir=docs/harness-reports/retroactive-recovery/2645-2026-08-24-a-26
```

`execute` exige `insertion-id`, `from-date` e `to-date`; não há recorte implícito. A resposta `failed` encerra a execução sem criar outro job.

## Verificar consumidores

```bash
pnpm --dir scripts run harness:retroactive-recovery -- \
  --mode=verify \
  --insertion-id=2645 \
  --from-date=2026-08-24 \
  --to-date=2026-08-26 \
  --output-dir=docs/harness-reports/retroactive-recovery/2645-verify
```

`verify` confirma o status auditado e checklist aprovado para cada data e testa separadamente os consumidores `html`, `thumbnail`, `modal` e `download` na URL pública da evidência. Ele não cria jobs.

Cada execução escreve apenas `results.json` e `summary.md` dentro de `docs/harness-reports/retroactive-recovery/`. Campos com nomes de segredo são removidos antes da gravação.
