# SPEC - Janela de horário dos prints AdOps v1

## Contrato

O horário simulado da evidência é calculado por `buildRetroCaptureAt(targetDate, insertionId)`.

Regra:

```text
seed = `${targetDate}:${insertionId}`
hash determinístico
janela = 240 minutos
resultado = targetDate + horário entre 18:00 e 21:59
```

## Fontes autorizadas

- API privada: `artifacts/api-server/src/lib/capture-audit.ts`
- Batch privado: `POST /api/insertions/capture-proof/batch`
- Captura individual: `POST /api/insertions/:id/capture-proof`
- Worker diário: deve enviar `captureAt: null` e `captureWindow`, deixando a API privada calcular por item.

## Bloqueios obrigatórios

- Rejeitar `captureAt` explícito fora da janela `18:00-22:00`.
- Não usar `DAILY_PRINT_CAPTURE_TIME`.
- Não usar fallback fixo `T10:30:00-04:00`.
- Não usar módulo de janela antiga (`% 120` ou `% 180`), porque isso concentra ou extrapola o intervalo operacional.

## Exceção

Testes locais diretos do compositor podem usar horários fora da janela apenas quando não publicam evidência nem passam pela API de produção. A API operacional não deve aceitar.
