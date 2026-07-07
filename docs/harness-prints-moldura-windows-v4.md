# HARNESS - Prints com Moldura Windows v4

## Objetivo

Validar que a moldura Windows 11 + Chrome claro esta pronta para publicar prints sem regredir auditoria, data/hora, barra de rolagem ou selecao de banner.

## Comando principal

```bash
pnpm --dir scripts run harness:prints-windows-frame-v4
```

Com amostras locais sem upload:

```bash
ADOPS_RUN_CAPTURE_SAMPLES=true \
ADOPS_CAPTURE_PYTHON=/Users/leandrobosaipo/.openclaw/venvs/whoispdf/bin/python \
pnpm --dir scripts run harness:prints-windows-frame-v4
```

## Gates

- Sintaxe do compositor.
- Sintaxe do gerador de kit.
- Teste de contrato da moldura.
- Teste estrito dos assets reais/similares.
- Auditoria de integridade das regras de captura.
- Opcional: capturas locais sem upload para ROO, PNMT e OMT.

## Saidas

O harness grava:

- `docs/harness-reports/prints-windows-frame-v4/<timestamp>/summary.md`
- `docs/harness-reports/prints-windows-frame-v4/<timestamp>/results.json`

## Aceite

- `frameTemplateVersion = windows11-chrome-light-similar-v4`
- `chromeTopTheme = light`
- `tabSurfaceRendered = true`
- `tabTitleRendered = true`
- `tabIconRendered = true`
- `tabIconFallback = false` nas amostras com logo local
- Nenhum texto `Wikipedia` no topo
- Nenhum icone de Wikipedia no topo
- Data/hora do rodape preservada
- Barra de rolagem preservada

