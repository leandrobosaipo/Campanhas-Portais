# RUNBOOK - Janela de horário dos prints AdOps v1

## Quando usar

Use este runbook sempre que alterar:

- geração de prints;
- retroativos vencidos;
- Worker público `adops-api-public`;
- runner VPS;
- rotas `capture-proof`;
- auditoria de evidências.

## Diagnóstico rápido

Se vários prints aparecem com o mesmo horário:

1. Verificar se o job recebeu `captureAt` global.
2. Verificar se o Worker diário voltou a usar `DAILY_PRINT_CAPTURE_TIME`.
3. Verificar se o runner voltou a usar fallback fixo.
4. Rodar o harness da janela.

## Correção esperada

- Remover `captureAt` global do lote diário.
- Deixar a API calcular por inserção/dia.
- Bloquear `captureAt` explícito fora de `18:00-22:00`.
- Reprocessar apenas as evidências afetadas quando necessário.

## Gates antes de deploy

```bash
pnpm --dir scripts run harness:capture-time-window-v1
pnpm --filter @workspace/api-server run build
pnpm --dir scripts run audit:capture-rules-integrity
```

## Resultado esperado

- Prints próximos variam entre `18:00` e `21:59`.
- Telegram não volta a relatar evidências válidas como problema por causa de horário fixo.
