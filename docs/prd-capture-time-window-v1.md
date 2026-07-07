# PRD - Janela de horário dos prints AdOps v1

## Problema

Os prints de evidência não podem sair todos com o mesmo horário. Quando todos aparecem às `18:00`, a prova visual fica artificial, reduz confiança operacional e facilita falso positivo de auditoria.

## Objetivo

Garantir que prints diários, retroativos vencidos e reprocessamentos automáticos usem uma janela determinística por inserção e data:

```text
18:00 <= captureAt < 22:00
timezone: America/Cuiaba
seed: targetDate + insertionId
```

## Requisitos

- A distribuição precisa variar por `insertionId + targetDate`.
- A mesma inserção no mesmo dia precisa gerar o mesmo horário.
- O sistema não deve aceitar `captureAt` explícito fora da janela `18:00-22:00`.
- O Worker diário não pode enviar um único `captureAt` global para todo o lote.
- O runner não pode usar fallback fixo como `10:30` ou `18:00`.

## Critério de aceite

- Amostras de várias inserções mostram horários diferentes.
- Nenhum horário gerado fica antes de `18:00`.
- Nenhum horário gerado fica em ou depois de `22:00`.
- Harness `capture-time-window-v1` passa antes de deploy.
