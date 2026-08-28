# SPEC AdOps Fila + Progresso v1

## 1) Fonte de verdade

Contratos derivados de:

- `artifacts/adops/src/lib/ops-queue.ts`

Endpoints de leitura esperados:

- `GET /api/ops/queue/overview`
- `GET /api/ops/jobs/:jobId/progress`

O runtime é híbrido: Worker/D1 controla os jobs que nascem no Worker; Mac Mini/PostgreSQL controla os jobs canônicos privados. Toda leitura, claim, lease e prova terminal deve permanecer no control plane de origem do job.

## 2) Contrato `JobProgress`

```ts
type OpsJobKind =
  | "print-batch"
  | "print-backfill"
  | "print-single"
  | "sync-planilha"
  | "analytics-report"
  | "pi-site-export";

type OpsJobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed";

type JobProgress = {
  jobId: string;
  kind: OpsJobKind;
  status: OpsJobStatus;
  stageKey: string;
  stageLabel: string;
  percentStage: number | null;
  percentTotal: number | null;
  itemsDone: number | null;
  itemsTotal: number | null;
  etaSeconds: number | null;
  startedAt: string | null;
  updatedAt: string;
  createdAt: string;
  runnerId: string | null;
  error: string | null;
};
```

### Contrato `liveProgress` do lote diário

```ts
type DailyPrintLiveProgress = {
  completedInsertionIds: number[];
  runningInsertionId: number | null;
  pendingInsertionIds: number[];
  failedInsertionIds: number[];
  blockedInsertionIds: number[];
};
```

Os cinco estados visíveis são `completed`, `running`, `pending`, `failed` e `blocked`. Cada inserção pertence a no máximo um estado; `runningInsertionId` é `null` quando não houver execução. O cliente trata payload malformado como vazio e não mostra erros brutos.

## 3) Contrato `QueueOverview`

```ts
type QueueOverview = {
  now: JobProgress | null;
  queue: JobProgress[];
  scheduled: JobProgress[];
  totals: {
    running: number;
    queued: number;
    readyForRunner: number;
    completedToday: number;
    failedToday: number;
  };
  generatedAt: string;
};
```

## 4) Regras de labels por kind

Mapeamento obrigatório:

- `print-single` -> `Print individual`
- `print-backfill` -> `Retroativos`
- `print-batch` -> `Lote de prints`
- `sync-planilha` -> `Sincronização`
- `analytics-report` -> `Relatório Analytics`
- `pi-site-export` -> `Pacote PI por site`

Fallback:

- kind desconhecido: exibir o valor bruto de `kind`.

## 5) Regras de labels por status

- `queued` -> `Na fila`
- `ready_for_runner` -> `Aguardando execução`
- `running` -> `Executando`
- `completed` -> `Concluído`
- `failed` -> `Falhou`

Fallback:

- status desconhecido: exibir valor bruto.

## 6) Regras de fallback de progresso

Ordem para barra principal:

1. `percentTotal` válido (0..100)
2. `percentStage` válido (0..100)
3. `status === "completed"` => `100`
4. `status === "running"` => `20`
5. demais casos => `0`

Resumo textual:

- incluir `%` se `percentTotal != null`
- incluir `itemsDone/itemsTotal` somente se ambos não nulos
- incluir ETA:
  - `etaSeconds` nulo/inválido => ocultar ETA
  - `etaSeconds <= 0` => `Finalizando`
  - `etaSeconds > 0` => `ETA X min`

Falhas parciais sem bloquear UI:

- `now === null`: mostrar banner sem job ativo.
- `queue` vazio: mostrar estado `sem itens na fila`.
- `scheduled` vazio: mostrar `sem agendamentos`.
- `runnerId` nulo: mostrar `runner não informado`.
- `startedAt` nulo: manter timeline com `createdAt/updatedAt`.
- `error` preenchido em `failed`: destacar mensagem de erro do job.

## 7) Regras de robustez

- Campos de data devem aceitar ISO string. Valor inválido vira fallback `—`.
- Percentuais devem ser normalizados para intervalo `0..100`.
- Contrato não deve depender de novos campos para funcionar em v1.

## 8) Critérios de aceite técnico

- Typecheck e build dos pacotes relevantes passam.
- Testes locais de auth/guards passam.
- Harness gera artefatos em `docs/harness-reports/adops-ux-v1/<timestamp>/`.
- Falha de gate crítico encerra com código de saída não zero.
- O relatório mensal é um snapshot estático; a camada viva faz somente GET em `daily-print-status`, `queue/overview`, `jobs/:jobId/progress` e, para conclusão nova, no status da evidência.
- A camada viva promove uma miniatura somente após auditoria final aprovada; sua falha preserva o snapshot estático. O polling para em estado terminal, salvo recuperação já agendada.
- Atualização incremental consolida o snapshot, não renderiza o progresso vivo; ZIP só é reutilizado com fingerprint idêntico e ZIP incompatível bloqueia publicação.
- Nenhuma página pública, payload vivo ou log do harness pode conter segredo.
