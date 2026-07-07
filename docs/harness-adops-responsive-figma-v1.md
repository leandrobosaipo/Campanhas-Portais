# Harness AdOps Responsive + Figma v1

## Objetivo

Validar implementação responsiva guiada por Figma com gates técnicos e smoke visual por viewport.

## Comando

```bash
pnpm --dir scripts run harness:adops-responsive-figma-v1
```

## Variáveis opcionais

- `ADOPS_BASE_URL` (default: `https://adops-campanhas-portais.pages.dev`)
- `FIGMA_URL`
- `FIGMA_FILE_KEY`
- `FIGMA_NODE_ID`

## Fases e gates

### Fase 1 — Contexto Figma

- `figma_input_contract` (não crítico no v1)
  - valida presença de:
    - `FIGMA_URL` ou (`FIGMA_FILE_KEY` + `FIGMA_NODE_ID`)
    - ou `docs/figma-context/adops-responsive-v1/design-context.json`

### Fase 2 — Build

- `adops_build` (crítico)
  - `pnpm --dir artifacts/adops run build`

### Fase 3 — Smoke responsivo

- `responsive_smoke` (crítico)
  - `node ./src/test-adops-responsive-figma.mjs`
  - gera screenshots por rota e viewport
  - falha em overflow horizontal

## Saídas

`docs/harness-reports/adops-responsive-figma-v1/<timestamp>/`

- `summary.md`
- `gate-results.json`
- `logs/*.stdout.log`
- `logs/*.stderr.log`
- `artifacts/responsive/*.png`

## Política de saída

- Falha em gate crítico => `exit code 1`
- Falha apenas não crítica => `exit code 0` com aviso
- Todos os gates ok => `exit code 0`
