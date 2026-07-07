# HARNESS - Monitoramento Drive PI v1

## Objetivo

Validar que o fluxo de entrada de PI pelo Google Drive esta conectado ao trilho operacional existente.

## Comando

```bash
pnpm --dir scripts run harness:drive-pi-monitor-v1
```

## Checks

- Apps Script do monitor existe.
- Migracao D1 das tabelas `cod5_*` existe.
- Worker expoe `POST /api/ops/drive-pi-events`.
- Runner suporta o kind `drive-pi-ingest`.
- Runner suporta autenticacao por conta de servico do Google Drive.
- Telegram possui rota operacional para aviso de PI do Drive.
- Mutacao automatica depende de `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`.

## Aceite

- Evento repetido por `eventId` nao cria job duplicado.
- Evento novo cria job `drive-pi-ingest`.
- Job sem campos suficientes termina como `needs_review`.
- Job com campos completos e mutacao habilitada cria campanha/insercoes sem duplicar.
- Nenhum token aparece no resultado do job, logs ou Telegram.
