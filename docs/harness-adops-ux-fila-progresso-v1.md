# Harness AdOps UX Fila + Progresso v1

## Objetivo

Executar validações mínimas de regressão técnica para a entrega da UX de fila/progresso com saída rastreável por timestamp.

## Comando

```bash
pnpm --dir scripts run harness:adops-ux-fila-progresso-v1
```

## Estrutura de saída

Diretório por execução:

`docs/harness-reports/adops-ux-v1/<timestamp>/`

Arquivos:

- `gate-results.json`: relatório estruturado de fases/gates.
- `summary.md`: visão resumida para leitura humana.
- `logs/<gate-id>.stdout.log`: stdout de cada gate.
- `logs/<gate-id>.stderr.log`: stderr de cada gate.

## Fases e gates

### Fase 1: Typecheck

- `scripts_typecheck` (crítico)
  - `pnpm --dir scripts run typecheck`
- `adops_typecheck` (crítico)
  - `pnpm --dir artifacts/adops run typecheck`
- `api_server_typecheck` (crítico)
  - `pnpm --dir artifacts/api-server run typecheck`

### Fase 2: Build

- `adops_build` (crítico)
  - `pnpm --dir artifacts/adops run build`
- `api_server_build` (crítico)
  - `pnpm --dir artifacts/api-server run build`

### Fase 3: Testes locais relevantes

- `scripts_runtime_auth_tests` (crítico)
  - `pnpm --dir scripts run test:runtime-auth`
- `scripts_mutation_inventory` (crítico)
  - `pnpm --dir scripts run test:mutation-inventory`
- `daily_print_live_progress` (crítico)
  - `pnpm --dir scripts run test:daily-print-live-progress`
- `daily_print_runner_live_progress` (crítico)
  - `pnpm --dir scripts run test:daily-print-runner-live-progress`
- `monthly_report_live_polling` (crítico)
  - `pnpm --dir scripts run test:monthly-report-live-polling`
- `monthly_evidence_contract` (crítico)
  - `node scripts/src/test-monthly-evidence-contract.mjs`
- `monthly_report_mobile_ui` (crítico)
  - `node scripts/src/test-monthly-report-mobile-ui.mjs`
- `monthly_report_incremental_refresh` (crítico)
  - `node scripts/src/test-monthly-report-incremental-refresh.mjs`

## Contrato rígido do relatório mensal

Os gates vivos exigem header, percentual, detalhe por inserção e os cinco estados (`completed`, `running`, `pending`, `failed`, `blocked`). A camada viva usa somente GET, para em estado terminal e não expõe segredo. Antes de promover miniatura, exige auditoria final aprovada; em falha, o snapshot estático continua visível.

Os gates também exigem fallback estático, modal, busca/filtros e os dois ZIPs (por portal e completo). Atualização incremental somente consolida o snapshot e reusa ZIP com fingerprint idêntico. ZIP ausente ou incompatível bloqueia a publicação; o relatório não pode reduzir dias auditados silenciosamente.

## Gate policy

- Gate crítico falhou: execução termina com `exit code 1`.
- Só gates não críticos falharam: execução termina com `exit code 0`.
- Todos passaram: execução termina com `exit code 0`.

## Regras de implementação

- Não remover arquivos de relatórios anteriores.
- Sempre criar timestamp novo por execução.
- Registrar comando, cwd, duração e status de cada gate.
- Preservar logs completos por gate.

## Exemplo de timestamp

- `20260422T103012Z`
