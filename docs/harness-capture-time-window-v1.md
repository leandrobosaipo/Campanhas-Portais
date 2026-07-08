# HARNESS - Janela de horário dos prints AdOps v1

## Comando

```bash
pnpm --dir scripts run harness:capture-time-window-v1
```

## O que valida

- `buildRetroCaptureAt` usa janela `18:00-22:00`.
- Amostras reais variam por inserção e data.
- Nenhuma amostra sai fora da janela.
- O Worker público não contém horário global fixo `18:00`.
- O runner não contém fallback fixo `10:30`.
- A API privada contém bloqueio para `captureAt` fora da janela.

## Aceite

O comando precisa retornar `ok: true` antes de publicar alterações de captura, runner, Worker diário ou reprocessamento automático.
