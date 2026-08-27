# Mac Mini Control Plane Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a API/Postgres do Mac Mini a única autoridade de agendamento e estado do AdOps, com disparo idempotente, claim/heartbeat, recuperação e cutover seguro sem segundo control plane.

**Architecture:** Estender `ops_jobs` e as rotas `/api/ops/*` existentes. O cron Mac Mini chama uma reconciliação autenticada; a API resolve a rotina versionada, cria um job único e o runner existente faz claim, heartbeat e execução. Cloudflare permanece somente em shadow/rollback durante a migração.

**Tech Stack:** Node.js/TypeScript, `node:test`, Express, Postgres, runner Node.js, Cloudflare Worker/D1 apenas para shadow/rollback e Portainer para runtime.

**Spec:** `docs/superpowers/specs/2026-08-26-macmini-control-plane-scheduler-design.md`

## Estado de execução em 2026-08-26

- Tasks 1–6: implementadas, testadas, revisadas e publicadas no runtime.
- Task 7, steps 1–3: concluídos; testes, preflight, shadow e corte para writer único no Mac Mini foram validados.
- Task 7, step 4: canários diário e de recuperação chegaram a estados terminais; o alerta/escalonamento natural de 08h30 ainda precisa do ciclo seguinte.
- Task 7, step 5: em andamento; gates de 17h30, 18h, recuperações até 21h30 e relatório público de 22h15 foram validados. Restam 08h/08h30 e completar as 72 horas.
- Task 7, step 6: pendente até concluir o monitoramento e integrar a branch limpa.
- Evidência operacional e incidentes: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`.

## Global Constraints

- API/Postgres Mac Mini é a única fonte canônica de agenda, decisão, job e estado.
- Não criar nova fila, banco, tabela de agenda, container, serviço, plataforma ou dependência.
- Instantes persistidos e transportados são UTC; decisões editoriais usam `America/Cuiaba`.
- Reutilizar `ops_jobs`, `payload_json`, `result_json`, `error_text`, `runner_id`, `created_at` e `updated_at`.
- Ausência de dado é `null`/`unknown`, nunca zero ou sucesso implícito.
- Evidência auditada nunca é sobrescrita; retries criam job-filho idempotente.
- Nenhum deploy nesta execução do plano sem cumprir o gate da tarefa G.

## Mapa de arquivos e interfaces

- `artifacts/api-server/src/lib/ops-scheduler.ts`: criar; registro versionado, resolução de janela, IDs e decisões puras.
- `artifacts/api-server/src/routes/ops.ts`: rotas de reconciliação, criação idempotente, claim, heartbeat, watchdog e overview.
- `artifacts/api-server/src/lib/runner-heartbeats.ts`: persistência/readback de liveness já existente.
- `ops/cloudflare-remote-runner/src/runner.mjs`: cliente de claim, heartbeat e conclusão do runner existente.
- `ops/cloudflare-public-api/src/index.ts`: trigger Cloudflare temporário, marcado como shadow/rollback e sem escrita canônica.
- `ops/cloudflare-public-api/wrangler.jsonc`: cron temporário e flags de cutover.
- `ops/portainer/adops-stack/migrations/`: somente migração reversível se inspeção provar necessidade de índice/coluna; sem tabela de agenda.
- `scripts/src/test-ops-scheduler.ts`: criar; testes `node:test` das decisões, contratos e concorrência simulada.
- `scripts/src/test-ops-scheduler-contract.mjs`: criar; teste estático das rotas, SQL e integração runner/Worker.
- `scripts/package.json`: registrar `test:ops-scheduler`.
- `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md`: atualizar runbook somente na fatia F.
- `docs/superpowers/specs/2026-08-26-macmini-control-plane-scheduler-design.md`: contrato já aprovado; não editar durante implementação.

---

### Task 1: Contrato canônico, estados e timezone (Fatia A)

**Files:**
- Create: `artifacts/api-server/src/lib/ops-scheduler.ts`.
- Modify: `artifacts/api-server/src/routes/ops.ts` nas rotas e helpers de jobs.
- Create: `scripts/src/test-ops-scheduler.ts`.
- Modify: `scripts/package.json`.

**Interfaces:**
- Produces `resolveCanonicalSchedule(now: Date): CanonicalScheduleDecision[]`.
- Produces `buildScheduleId(kind: string, targetDate: string, dispatchWindow: string): string`.
- Produces `buildRootIdempotencyKey(kind: string, targetDate: string, dispatchWindow: string): string`.
- `CanonicalScheduleDecision` contém `routineKind`, `targetDate`, `timezone`, `scheduledFor`, `dispatchWindow`, `due`, `nextRecoveryAt`.

- [ ] **Step 1: Escrever testes vermelhos de Cuiabá e contrato**

```ts
it("resolve 18:00 de Cuiaba a partir de UTC", () => {
  const result = resolveCanonicalSchedule(new Date("2026-08-26T22:00:00.000Z"));
  expect(result.find((x) => x.routineKind === "daily-print")).toMatchObject({
    targetDate: "2026-08-26", dispatchWindow: "18:00", timezone: "America/Cuiaba", due: true,
  });
});

it("não transforma ausência em zero", () => {
  expect(serializeQueueCount(undefined)).toBeNull();
});
```

- [ ] **Step 2: Rodar o teste vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: FAIL porque as funções canônicas ainda não existem ou o valor não contém `America/Cuiaba`.

- [ ] **Step 3: Implementar o mínimo**

Usar `Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })`; comparar janelas `18:00`, `18:30`…`22:15`, `08:00`, `08:30`; retornar `null` para métricas ausentes. Não aceitar shell, URL ou rotina enviada pelo caller.

- [ ] **Step 4: Rodar teste verde e typecheck**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler` e `pnpm run typecheck`.  
Expected: PASS, sem mudança de contrato público de status.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/ops-scheduler.ts artifacts/api-server/src/routes/ops.ts scripts/src/test-ops-scheduler.ts scripts/package.json
git commit -m "feat: define canonical scheduler contract"
```

Risco: interpretação errada de data próxima da meia-noite. Rollback: reverter somente o commit. Dependências: nenhuma. Responsável: executor da fatia A. Paralelismo: não paralelizar com Task 2, pois compartilha helpers. Evidência: teste verde e saída de typecheck.

### Task 2: Reconciliador idempotente no Postgres (Fatia B)

**Files:**
- Modify: `artifacts/api-server/src/routes/ops.ts` nos helpers de `ops_jobs` e nova rota autenticada de reconciliação.
- Modify: `scripts/src/test-ops-scheduler.ts`, adicionando casos de `created`, `duplicate`, `not_due`, `blocked` e payload canônico.
- Create: `scripts/src/test-ops-scheduler-contract.mjs` para provar rota protegida, SQL atômico e replay sem update.
- Inspect only: schema/migrations de `ops_jobs`; não criar tabela de agenda.

**Interfaces:**
- `POST /api/ops/schedules/reconcile` recebe `{ dryRun?: boolean }` em produção; a API calcula a agenda.
- Resposta `{ ok: true, decisions: Array<{ outcome: "created"|"duplicate"|"not_due"|"blocked"|"failed", scheduleId: string, idempotencyKey: string, jobId: string|null, nextRecoveryAt: string|null }> }`.
- `createOpsJob(kind, payload, requestedBy)` mantém assinatura existente e retorna job/idempotency result.

- [ ] **Step 1: Escrever testes vermelhos de criação única**

```ts
it("duas reconciliações retornam o mesmo job", async () => {
  const first = await requestReconcile(api);
  const second = await requestReconcile(api);
  expect(first.decisions[0].outcome).toBe("created");
  expect(second.decisions[0]).toMatchObject({ outcome: "duplicate", jobId: first.decisions[0].jobId });
  expect(await countJobsByIdempotency(first.decisions[0].idempotencyKey)).toBe(1);
});
```

- [ ] **Step 2: Rodar vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: FAIL porque a rota ou a decisão atômica ainda não existe.

- [ ] **Step 3: Implementar criação atômica**

Validar autenticação, chamar `resolveCanonicalSchedule(new Date())`, montar `scheduleId`, `rootIdempotencyKey`, `idempotencyKey`, `parentJobId: null`, `attempt: 1`, `maxAttempts: 8`, `timezone: "America/Cuiaba"`; usar a deduplicação SQL existente. O replay retorna o registro sem reescrever payload/result/evidência.

- [ ] **Step 4: Testar concorrência e estados**

```ts
const results = await Promise.all([requestReconcile(api), requestReconcile(api), requestReconcile(api)]);
expect(results.filter((x) => x.decisions[0].outcome === "created")).toHaveLength(1);
expect(new Set(results.map((x) => x.decisions[0].jobId)).size).toBe(1);
```

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/ops.ts scripts/src/test-ops-scheduler.ts scripts/src/test-ops-scheduler-contract.mjs scripts/package.json
git commit -m "feat: reconcile schedules idempotently in postgres"
```

Risco: corrida entre inserts sem índice único. Rollback: desativar a rota e reverter commit; não habilitar Worker em escrita simultânea. Dependências: Task 1. Responsável: executor da fatia B. Paralelismo: testes podem rodar em paralelo com revisão documental, código não. Evidência: três chamadas, um job, mesmo `jobId`.

### Task 3: Claim, heartbeat e watchdog (Fatia C/D)

**Files:**
- Modify: `artifacts/api-server/src/routes/ops.ts` nas rotas `/ops/runner/claim-next`, `/ops/runner/heartbeat`, update/fail e overview.
- Modify: `artifacts/api-server/src/lib/runner-heartbeats.ts` somente para expor os campos já persistidos e `null` quando ausentes.
- Modify: `ops/cloudflare-remote-runner/src/runner.mjs` para enviar `claimedAt`, `heartbeatAt`, `attempt` e usar o endpoint Mac Mini configurado.
- Modify: `scripts/src/test-ops-scheduler.ts` com claim/heartbeat/expiry.
- Modify: `scripts/src/test-ops-scheduler-contract.mjs` e `scripts/src/test-runner-job-kind-isolation.mjs`.

**Interfaces:**
- `POST /api/ops/runner/claim-next` retorna no máximo um job e grava `runner_id`/`claimedAt`.
- `POST /api/ops/runner/heartbeat` aceita `{ jobId, runnerId, heartbeatAt, progress }` e atualiza somente o dono do claim.
- `reconcileExpiredJobs(now: Date)` cria filho apenas para erro retryable e ausência de job ativo equivalente.

- [ ] **Step 1: Escrever testes vermelhos de claim exclusivo e expiração**

```ts
it("dois runners não fazem claim do mesmo job", async () => {
  const [a, b] = await Promise.all([claim("runner-a"), claim("runner-b")]);
  expect([a?.id, b?.id].filter(Boolean)).toHaveLength(1);
});

it("heartbeat expirado cria um único filho", async () => {
  const parent = await seedRunningJob({ heartbeatAt: "2026-08-26T20:00:00Z" });
  const first = await reconcileExpiredJobs(new Date("2026-08-26T21:01:00Z"));
  const second = await reconcileExpiredJobs(new Date("2026-08-26T21:02:00Z"));
  expect(first.createdJobId).toBeTruthy();
  expect(second.createdJobId).toBeNull();
  expect(await getJob(parent.id)).toMatchObject({ status: "failed", errorCode: "expired" });
});
```

- [ ] **Step 2: Rodar vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: FAIL se houver dois claims ou nenhuma recuperação filho.

- [ ] **Step 3: Implementar atualização condicional**

Manter `UPDATE ... WHERE status='ready_for_runner'`; heartbeat exige `job_id` e `runner_id` atuais. Watchdog marca o pai `status=failed`, `errorCode=expired`, e cria filho com `parentJobId`, `rootIdempotencyKey`, `idempotencyKey=root:attempt:n`, `attempt=n`, sem ultrapassar `maxAttempts`. Bloqueios de segurança/contrato não geram retry.

- [ ] **Step 4: Rodar verde e validar runner**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`, `node scripts/src/test-runner-job-kind-isolation.mjs` e `node --check ops/cloudflare-remote-runner/src/runner.mjs`.  
Expected: PASS; heartbeat ausente aparece `null` no overview.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src ops/cloudflare-remote-runner/src/runner.mjs
git commit -m "feat: add exclusive runner lease recovery"
```

Risco: recuperar job ainda executando por heartbeat atrasado. Rollback: desligar watchdog/retry, manter jobs terminais e investigar; não apagar histórico. Dependências: Task 2. Responsável: executor da fatia C/D. Paralelismo: API e runner não devem ser editados em paralelo. Evidência: teste concorrente, job pai/filho e heartbeat readback.

### Task 4: Trigger mínimo no runner do Mac Mini e shadow Cloudflare (Fatia C/E)

**Files:**
- Modify: `ops/cloudflare-remote-runner/src/runner.mjs`; o loop de manutenção já existente apenas chama a reconciliação por intervalo, enquanto a API decide a agenda.
- Modify: `ops/portainer/adops-stack/docker-compose.yml` e `ops/portainer/adops-stack/docker-compose.volume.yml` para provider/intervalo, sem novo container.
- Modify: `ops/cloudflare-public-api/src/index.ts` somente para chamar `/api/ops/schedules/reconcile` em `shadow=true` e não criar D1 job durante shadow.
- Modify: `ops/cloudflare-public-api/wrangler.jsonc`, preservando cron necessário para rollback.
- Modify: `scripts/src/test-ops-scheduler-contract.mjs` e `scripts/src/test-daily-print-recovery-contract.mjs`.

**Interfaces:**
- Trigger Mac Mini: o runner chama `POST http://adops-api:4011/api/ops/schedules/reconcile` com autenticação interna, corpo vazio e intervalo padrão de 60 segundos; não escolhe rotina.
- Shadow Worker: mesma chamada com header/flag de observação, sem escrita D1.

- [ ] **Step 1: Escrever teste vermelho**

```ts
it("shadow não cria job em D1", async () => {
  const result = await scheduledWorker({ mode: "shadow" });
  expect(result.writes.d1).toBe(0);
  expect(result.apiCall).toMatchObject({ path: "/api/ops/schedules/reconcile", shadow: true });
});
```

- [ ] **Step 2: Rodar vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: FAIL porque o Worker atual ainda agenda/cria no D1.

- [ ] **Step 3: Implementar trigger mínimo**

Adicionar ao loop de manutenção do runner do Mac Mini somente o POST autenticado; a API determina rotina e horário. No Worker, separar `shadow` de `rollback`, registrar comparação de decisão e impedir criação D1 em shadow. Manter provider configurável, com apenas um provider em modo de escrita.

- [ ] **Step 4: Rodar verde e dry-run**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`, `node --check ops/cloudflare-remote-runner/src/runner.mjs` e Worker dry-run com `pnpm --dir ops/cloudflare-public-api exec wrangler deploy --dry-run`.  
Expected: PASS; nenhum segredo no output e nenhum job duplicado.

- [ ] **Step 5: Commit**

```bash
git add ops/cloudflare-remote-runner/src/runner.mjs ops/cloudflare-public-api/src/index.ts ops/cloudflare-public-api/wrangler.jsonc ops/portainer/adops-stack/docker-compose.yml ops/portainer/adops-stack/docker-compose.volume.yml scripts/src/test-ops-scheduler-contract.mjs scripts/src/test-daily-print-recovery-contract.mjs
git commit -m "feat: route scheduler trigger to mac mini control plane"
```

Risco: cron antigo continuar em escrita. Rollback: marcar provider Cloudflare, congelar Mac Mini e reativar antigo somente após reconciliação. Dependências: Task 2. Responsável: executor da fatia E. Paralelismo: Worker e cron são um mesmo contrato, executar sequencialmente. Evidência: shadow com zero escrita D1 e POST canônico.

### Task 5: Recuperação, alertas e relatório canônico (Fatias D/F)

**Files:**
- Modify: `artifacts/api-server/src/routes/ops.ts` para `nextRecoveryAt`, `failedInsertionIds` e overview.
- Reuse/Modify only if the new API shape requires it: `scripts/src/build-current-month-evidence-report.mjs` and `ops/cloudflare-telegram-bot/src/index.ts`; both already implement incident/recovery behavior from release `be813b5`.
- Modify: `scripts/src/test-ops-scheduler.ts`, `scripts/src/test-daily-print-recovery-contract.mjs` and `scripts/src/test-daily-print-status.mjs`.
- Modify: `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md` and `docs/START_HERE_ADOPS.md`.

**Interfaces:**
- `GET /api/ops/queue/overview` retorna rotina, contagens reais, heartbeat, incidentes e `nextRecoveryAt`.
- Claim de alerta mantém fingerprint/data/lista pendente e retorna `claimed: boolean`.
- Relatório recebe estado API, nunca cron local como prova.

- [ ] **Step 1: Escrever testes vermelhos**

```ts
it("alerta uma vez, atualiza somente quando pendências mudam", async () => {
  expect(await claimAlert({ date: "2026-08-26", pending: [1, 2] })).toBe(true);
  expect(await claimAlert({ date: "2026-08-26", pending: [1, 2] })).toBe(false);
  expect(await claimAlert({ date: "2026-08-26", pending: [1] })).toBe(true);
});

it("relatório parcial mostra incidente e próxima recuperação", () => {
  expect(renderReport({ complete: false, pendingIds: [2713], nextRecoveryAt: "2026-08-27T12:00:00Z" }))
    .toContain("Incidente de geração");
});
```

- [ ] **Step 2: Rodar vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`, `node scripts/src/test-daily-print-recovery-contract.mjs` e `node scripts/src/test-daily-print-status.mjs`.  
Expected: FAIL se repetição gerar alerta ou relatório marcar parcial como normal.

- [ ] **Step 3: Implementar recuperação segura**

Consultar auditoria canônica antes de criar job; selecionar somente faltantes/invalidas. Recuperação 08:00 usa `candidate=true`, `promote=true`, `reconstructionReason=late_publication_recovery`; exigir regra autorizadora e checklist final aprovado. Telegram: primeira falha, mudança de lista, resolução e escalonamento 08:30. Relatório distingue não publicado, faltante, inválido, recuperação e bloqueado.

- [ ] **Step 4: Rodar verde e validar payloads**

Run: os três testes anteriores e `pnpm --dir scripts run audit:capture-rules-integrity`.  
Expected: PASS; IDs e códigos aparecem; tokens não aparecem.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/ops.ts scripts/src/test-ops-scheduler.ts scripts/src/test-daily-print-recovery-contract.mjs scripts/src/test-daily-print-status.mjs scripts/src/build-current-month-evidence-report.mjs ops/cloudflare-telegram-bot/src/index.ts docs/adops/macmini-control-plane-migration-plan-2026-06-03.md docs/START_HERE_ADOPS.md
git commit -m "feat: expose canonical recovery and incident state"
```

Risco: relatório cacheado divergente da API. Rollback: manter relatório anterior, mas sinalizar incidente; não declarar normalidade. Dependências: Task 3. Responsável: executor da fatia F. Paralelismo: relatório e alerta podem ser implementados em arquivos distintos após contrato da API; commits separados são aceitáveis. Evidência: testes de fingerprint, HTML parcial e overview.

### Task 6: Contratos, OpenAPI e preflight de migração (Fatia F/E)

**Files:**
- Modify: `lib/api-spec/openapi.yaml` e o documento operacional montado em `artifacts/api-server/src/routes/ops.ts`.
- Modify: `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md`.
- Create only if repository convention requires: runbook diário em `docs/adops/` com horários e rollback; preferir extensão do documento existente.
- Modify: `scripts/src/test-ops-scheduler-contract.mjs`.

**Interfaces:** Documentar request/response de reconcile, overview, claim, heartbeat, retry filho e provider/shadow; documentar `null`/`unknown`, `America/Cuiaba` e códigos de camada.

- [ ] **Step 1: Escrever teste vermelho do contrato**

```ts
it("OpenAPI documenta reconcile e campos canônicos", async () => {
  const spec = await loadOpenApi();
  expect(spec.paths["/api/ops/schedules/reconcile"].post).toBeDefined();
  expect(JSON.stringify(spec)).toContain("nextRecoveryAt");
  expect(JSON.stringify(spec)).toContain("America/Cuiaba");
});
```

- [ ] **Step 2: Rodar vermelho**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler`.  
Expected: FAIL até a documentação refletir o contrato.

- [ ] **Step 3: Atualizar contrato e runbook**

Registrar preflight, snapshot, shadow, canário, cutover, 72h, rollback e remoção gradual do Worker/D1/Queue. Não registrar credenciais nem inventar endpoint não implementado.

- [ ] **Step 4: Rodar verde e revisão de completude**

Run: `pnpm --filter @workspace/scripts run test:ops-scheduler` e `git diff --check`.  
Expected: contrato PASS e nenhuma falha de whitespace.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/ops.ts lib/api-spec/openapi.yaml scripts/src/test-ops-scheduler-contract.mjs docs
git commit -m "docs: document mac mini scheduler migration contract"
```

Risco: documentação divergir do runtime. Rollback: reverter documentação, mantendo código só se contrato publicado continuar compatível. Dependências: Tasks 1–5. Responsável: executor da fatia F. Paralelismo: revisão pode ocorrer em paralelo com Task 5 após interfaces estabilizadas. Evidência: OpenAPI e runbook revisados.

### Task 7: Validação integrada, canário e produção controlada (Fatia G)

**Files:**
- Modify only as required by failing preflight: configs de provider/cron e arquivos já listados nas Tasks 1–6.
- No new production service/container.

**Interfaces:** readback obrigatório de API, Postgres, runner, Portainer, relatório público e consumidor real.

- [ ] **Step 1: Executar validações locais completas**

Run: `node --check ops/cloudflare-remote-runner/src/runner.mjs`; `pnpm run typecheck`; `pnpm --filter @workspace/api-server run build`; `pnpm --dir scripts run audit:capture-rules-integrity`; testes de contrato, concorrência, fuso e recuperação; `pnpm --filter @workspace/adops run build`.  
Expected: todos PASS; warnings existentes devem ser registrados, não ignorados silenciosamente.

- [ ] **Step 2: Fazer preflight sem mutação**

Confirmar branch/worktree limpa de alterações alheias, backup Postgres/D1, contagens reconciliadas, env provider, health API e heartbeat. Expected: nenhum job ativo equivalente em ambos os providers.

- [ ] **Step 3: Executar shadow e comparar**

Por um ciclo completo, chamar Worker em shadow e API canônica; comparar `scheduleId`, `rootIdempotencyKey`, data/janela e decisão. Expected: mesmas decisões, zero escrita D1/Queue.

- [ ] **Step 4: Executar canário Mac Mini**

Uma rotina diária e uma recuperação: confirmar job único, claim, heartbeat, resultado terminal, auditoria, evidência/consumidor e alerta. Não aceitar `queued`/`running` como conclusão.

- [ ] **Step 5: Fazer cutover e monitorar 72 horas**

Ativar somente cron Mac Mini em escrita; manter Cloudflare em rollback. Ler `/api/ops/queue/overview`, logs correlacionados e relatório em cada janela. Confirmar recuperação 08:00 e alerta 08:30 quando aplicável.

- [ ] **Step 6: Commit de integração**

```bash
git add artifacts ops scripts docs
git commit -m "chore: validate mac mini scheduler cutover"
```

Risco: falha no canário ou divergência de consumidor. Rollback: congelar Mac Mini, reativar provider Cloudflare com snapshot/reconciliação e nunca executar ambos em escrita. Dependências: Tasks 1–6. Responsável: principal da task; subagentes não fazem deploy nem declaram produção. Paralelismo: somente leituras e validações independentes; cutover, rollback e polling são sequenciais. Evidência: logs, jobs terminais, API/health, SHA ativo, containers saudáveis e consumidor real.

## Autorrevisão obrigatória do plano

- [x] Cada requisito 1–12 da spec possui tarefa e teste/critério.
- [x] Os caminhos foram confrontados com o release `be813b5`; arquivos novos estão nomeados explicitamente.
- [x] Não há marcador de trabalho pendente nem comando de teste inexistente.
- [x] Retry, expiração, shadow e rollback preservam um único writer e jobs terminais.
- [x] Task 7 exige runtime, job terminal e consumidor real; build local não encerra a entrega.
