# SDD - Spec Driven Development AdOps

## Regra principal

Toda mudança nova do AdOps deve partir de contrato explícito antes de implementação.

Fluxo obrigatório:

```text
PRD -> SDD -> SPEC -> HARNESS -> RUNBOOK -> implementação -> validação -> relatório
```

## Contratos por módulo

- `intake-pi`: entrada de PDF, Drive, e-mail e WhatsApp.
- `campaigns-insertions`: campanha, inserção, período, cliente e agência.
- `adrotate-sync`: relação AdOps x AdRotate por portal/grupo/anúncio.
- `capture-proof`: geração e auditoria de evidência.
- `ops-queue`: jobs, progresso, watchdog e runner.
- `telegram`: comandos, webhook, permissões e notificações.
- `dashboard-read-model`: leituras do painel e métricas.
- `settings-master-data`: clientes, agências, sites e aliases.

## Política de mudança

- Toda mutação precisa ser idempotente.
- Toda integração externa precisa de timeout, retry e log claro.
- Toda credencial deve ficar fora do Git.
- Todo harness deve separar read-only de mutação.
- Toda migração precisa rollback explícito.
