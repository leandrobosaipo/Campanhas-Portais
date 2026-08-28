# AdOps Live Report Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar progresso real dos prints no relatório público, atualizar evidências aprovadas no navegador e preservar o snapshot estático e os ZIPs como fallback seguro.

**Architecture:** O runner acumula estados por inserção no progresso já persistido do `print-batch`; API privada e Worker público projetam o mesmo `liveProgress`. O relatório continua estático, mas o JavaScript consulta somente APIs GET existentes com polling finito e atualiza o DOM. A atualização incremental reutiliza ZIPs anteriores quando o fingerprint das evidências não mudou.

**Tech Stack:** Node.js ESM, TypeScript, Express, Cloudflare Worker/D1, HTML/CSS/JavaScript nativo, `node:test`, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-27-adops-live-report-progress-design.md`

## Global Constraints

- Fuso operacional obrigatório: `America/Cuiaba`.
- Nenhum endpoint, fila, serviço, banco, WebSocket, SSE ou dependência nova.
- Captura continua serial; não alterar concorrência da rotina diária.
- A página pública pode executar somente requisições GET sem segredo.
- Auditoria canônica decide aprovação; arquivo existente ou HTTP 200 não basta.
- Snapshot mensal, filtros, modal e os dois downloads ZIP precisam continuar funcionais quando a API estiver indisponível.
- Polling: 15 segundos com job ativo; 60 segundos aguardando recuperação; 30/60/120 segundos após erros; parar em terminal sem recuperação.
- Atualização incremental nunca cria exportação quando `ADOPS_REPORT_SKIP_EXPORTS=1`.
- Mudanças de produção exigem release SHA, job terminal e validação no consumidor real.
- Não trabalhar no checkout raiz sujo. Usar a worktree limpa e a branch `codex/adops-live-report-progress`.

## Ondas e propriedade de arquivos

### Onda 1 — contratos independentes

- Task 1: contrato de progresso. Propriedade: `ops/shared/daily-print-status.mjs`, APIs, OpenAPI e teste do contrato.
- Task 2: cache incremental de ZIP. Propriedade: `scripts/src/monthly-evidence-contract.mjs`, gerador mensal e teste incremental.
- Podem executar em paralelo porque não compartilham arquivos.

### Onda 2 — produtores e consumidores

- Task 3: runner. Propriedade: `ops/cloudflare-remote-runner/src/runner.mjs` e teste do runner.
- Task 4: interface viva. Propriedade: gerador do relatório e testes de UI.
- Só começam após a Onda 1. Podem executar em paralelo porque Task 3 não altera arquivos da Task 4.

### Onda 3 — documentação e harness

- Task 5 começa após Tasks 1–4 e consolida contratos, harness e documentação.

### Onda 4 — integração e produção

- Task 6 executa gates, revisão, deploy autorizado e readback real em série.

---

### Task 1: Contrato canônico `liveProgress`

**Files:**
- Modify: `ops/shared/daily-print-status.mjs`
- Modify: `artifacts/api-server/src/routes/ops.ts`
- Modify: `ops/cloudflare-public-api/src/index.ts`
- Modify: `lib/api-spec/openapi.yaml`
- Create: `scripts/src/test-daily-print-live-progress.mjs`
- Modify: `scripts/package.json`

**Interfaces:**
- Consumes: arrays operacionais `captured`, `skipped`, `failed`, lista ordenada de candidatos e inserção corrente.
- Produces: `normalizeDailyPrintLiveProgress(value)` e `buildDailyPrintLiveProgress({candidateInsertionIds, captured, skipped, failed, runningInsertionId})`.
- Produces no HTTP: `JobProgress.liveProgress` com cinco campos de IDs.

- [ ] **Step 1: Escrever o teste falho do normalizador**

Criar `scripts/src/test-daily-print-live-progress.mjs`:

```js
import assert from "node:assert/strict";
import {
  buildDailyPrintLiveProgress,
  normalizeDailyPrintLiveProgress,
} from "../../ops/shared/daily-print-status.mjs";

const live = buildDailyPrintLiveProgress({
  candidateInsertionIds: [2693, 2650, 2278, 2712],
  captured: [{ insertionId: 2693, status: "audited" }],
  skipped: [{ insertionId: 2650, status: "skipped_existing" }],
  failed: [{ insertionId: 2712, status: "blocked_reconstruction" }],
  runningInsertionId: 2278,
});

assert.deepEqual(live, {
  completedInsertionIds: [2693, 2650],
  runningInsertionId: 2278,
  pendingInsertionIds: [],
  failedInsertionIds: [],
  blockedInsertionIds: [2712],
});

assert.deepEqual(normalizeDailyPrintLiveProgress({
  completedInsertionIds: [1, 1, "2", -1],
  runningInsertionId: 2,
  pendingInsertionIds: [2, 3, 4],
  failedInsertionIds: [3],
  blockedInsertionIds: [4],
}), {
  completedInsertionIds: [1, 2],
  runningInsertionId: null,
  pendingInsertionIds: [],
  failedInsertionIds: [3],
  blockedInsertionIds: [4],
});

console.log("daily print live progress: passed");
```

- [ ] **Step 2: Confirmar a falha esperada**

Run:

```bash
node scripts/src/test-daily-print-live-progress.mjs
```

Expected: FAIL informando que `buildDailyPrintLiveProgress` ou `normalizeDailyPrintLiveProgress` não foi exportada.

- [ ] **Step 3: Implementar o menor contrato compartilhado**

Adicionar em `ops/shared/daily-print-status.mjs`:

```js
function insertionIds(values) {
  return [...new Set((values || [])
    .map((value) => Number(value?.insertionId ?? value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

export function normalizeDailyPrintLiveProgress(value = {}) {
  const blockedInsertionIds = insertionIds(value.blockedInsertionIds);
  const failedInsertionIds = insertionIds(value.failedInsertionIds)
    .filter((id) => !blockedInsertionIds.includes(id));
  const completedInsertionIds = insertionIds(value.completedInsertionIds)
    .filter((id) => !blockedInsertionIds.includes(id) && !failedInsertionIds.includes(id));
  const terminal = new Set([...blockedInsertionIds, ...failedInsertionIds, ...completedInsertionIds]);
  const runningCandidate = Number(value.runningInsertionId);
  const runningInsertionId = Number.isInteger(runningCandidate) && runningCandidate > 0 && !terminal.has(runningCandidate)
    ? runningCandidate
    : null;
  const pendingInsertionIds = insertionIds(value.pendingInsertionIds)
    .filter((id) => !terminal.has(id) && id !== runningInsertionId);
  return { completedInsertionIds, runningInsertionId, pendingInsertionIds, failedInsertionIds, blockedInsertionIds };
}

export function buildDailyPrintLiveProgress({ candidateInsertionIds = [], captured = [], skipped = [], failed = [], runningInsertionId = null } = {}) {
  const completedInsertionIds = insertionIds([...captured, ...skipped]);
  const blockedInsertionIds = insertionIds(failed.filter((item) => item?.status === "blocked_reconstruction" || item?.status === "blocked_upstream"));
  const failedInsertionIds = insertionIds(failed.filter((item) => item?.status !== "blocked_reconstruction" && item?.status !== "blocked_upstream"));
  const consumed = new Set([...completedInsertionIds, ...blockedInsertionIds, ...failedInsertionIds]);
  return normalizeDailyPrintLiveProgress({
    completedInsertionIds,
    runningInsertionId,
    pendingInsertionIds: insertionIds(candidateInsertionIds).filter((id) => !consumed.has(id) && id !== runningInsertionId),
    failedInsertionIds,
    blockedInsertionIds,
  });
}
```

- [ ] **Step 4: Projetar `liveProgress` nas duas APIs**

Importar `normalizeDailyPrintLiveProgress` em `artifacts/api-server/src/routes/ops.ts` e `ops/cloudflare-public-api/src/index.ts`. Em cada `computeJobProgress`, ler o valor do progresso acumulado:

```ts
const liveProgressRaw = asRecord(progress?.liveProgress) ?? asRecord(execution?.liveProgress) ?? asRecord(result?.liveProgress);
const liveProgress = liveProgressRaw ? normalizeDailyPrintLiveProgress(liveProgressRaw) : null;
```

Adicionar `liveProgress` ao objeto retornado. No Worker, ampliar `JobProgress` com:

```ts
liveProgress: {
  completedInsertionIds: number[];
  runningInsertionId: number | null;
  pendingInsertionIds: number[];
  failedInsertionIds: number[];
  blockedInsertionIds: number[];
} | null;
```

- [ ] **Step 5: Documentar OpenAPI**

Em `lib/api-spec/openapi.yaml`, criar `DailyPrintLiveProgress` e referenciá-lo na resposta de progresso:

```yaml
DailyPrintLiveProgress:
  type: object
  required: [completedInsertionIds, runningInsertionId, pendingInsertionIds, failedInsertionIds, blockedInsertionIds]
  properties:
    completedInsertionIds:
      type: array
      items: { type: integer }
    runningInsertionId:
      type: integer
      nullable: true
    pendingInsertionIds:
      type: array
      items: { type: integer }
    failedInsertionIds:
      type: array
      items: { type: integer }
    blockedInsertionIds:
      type: array
      items: { type: integer }
```

Na resposta de `GET /ops/jobs/{id}/progress`, manter `additionalProperties: true` para compatibilidade e acrescentar:

```yaml
properties:
  liveProgress:
    allOf:
      - $ref: "#/components/schemas/DailyPrintLiveProgress"
    nullable: true
```

Não mudar paths ou autenticação.

- [ ] **Step 6: Registrar e executar o teste**

Adicionar em `scripts/package.json`:

```json
"test:daily-print-live-progress": "node src/test-daily-print-live-progress.mjs"
```

Run:

```bash
pnpm --dir scripts run test:daily-print-live-progress
pnpm --filter @workspace/api-server run build
```

Expected: teste e build passam.

- [ ] **Step 7: Commit**

```bash
git add ops/shared/daily-print-status.mjs artifacts/api-server/src/routes/ops.ts ops/cloudflare-public-api/src/index.ts lib/api-spec/openapi.yaml scripts/src/test-daily-print-live-progress.mjs scripts/package.json
git commit -m "feat(adops): expose daily print live progress"
```

---

### Task 2: Reutilização segura dos ZIPs no refresh incremental

**Files:**
- Modify: `scripts/src/monthly-evidence-contract.mjs`
- Modify: `scripts/src/build-current-month-evidence-report.mjs`
- Modify: `scripts/src/test-monthly-evidence-contract.mjs`
- Modify: `scripts/src/test-monthly-report-incremental-refresh.mjs`

**Interfaces:**
- Consumes: inserções enriquecidas atuais e `data.json` público anterior.
- Produces: `buildMonthlyDeliveryFingerprint(item)`, `indexReusableMonthlyDownloads(previousData)` e `reuseMonthlyDownloadUrls(items, previousData)`.
- Preserva: `batchDownloadUrl` e `completeCampaignDownloadUrl` somente com fingerprints compatíveis.

- [ ] **Step 1: Escrever os testes falhos de compatibilidade**

Adicionar a `scripts/src/test-monthly-evidence-contract.mjs`:

```js
test("refresh incremental reutiliza ZIP apenas com as mesmas evidências", () => {
  const current = [{
    id: 10, piCodigo: "PI 91159", siteSigla: "AFL", competencia: "AGOSTO/2026",
    evidenceDays: [{ date: "2026-08-26", id: 88, status: "audited", url: "https://cdn.example/88.png" }],
  }];
  const previous = { insertions: [{
    ...current[0],
    batchDownloadUrl: "https://api.example/portal.zip",
    completeCampaignDownloadUrl: "https://api.example/all.zip",
  }] };
  assert.deepEqual(contract.reuseMonthlyDownloadUrls(current, previous), [{
    ...current[0],
    batchDownloadUrl: "https://api.example/portal.zip",
    completeCampaignDownloadUrl: "https://api.example/all.zip",
  }]);
  const changed = [{ ...current[0], evidenceDays: [...current[0].evidenceDays, { date: "2026-08-27", id: 89, status: "audited", url: "https://cdn.example/89.png" }] }];
  assert.equal(contract.reuseMonthlyDownloadUrls(changed, previous)[0].batchDownloadUrl, "");
});
```

Ampliar `scripts/src/test-monthly-report-incremental-refresh.mjs` para exigir leitura do snapshot anterior antes dos exports e `reuseMonthlyDownloadUrls`.

- [ ] **Step 2: Confirmar falha**

```bash
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-incremental-refresh.mjs
```

Expected: FAIL porque `reuseMonthlyDownloadUrls` ainda não existe.

- [ ] **Step 3: Implementar fingerprints e reuso**

Em `scripts/src/monthly-evidence-contract.mjs`, reutilizar `buildCampaignExportIdempotencyKey` para fingerprint por portal e calcular o completo com todas as inserções da mesma PI/competência:

```js
export function buildMonthlyDeliveryFingerprint(item) {
  const canonicalPi = canonicalCommercialPi(item?.piCodigo);
  if (!canonicalPi) return null;
  return buildCampaignExportIdempotencyKey({
    piCodigo: canonicalPi,
    siteSigla: item.siteSigla,
    competencia: item.competencia,
    evidences: (item.evidenceDays || []).filter((day) => String(day.status || "").startsWith("audited") && day.url),
  });
}
```

`reuseMonthlyDownloadUrls` deve:

1. agrupar anterior e atual por PI normalizada + portal + competência;
2. comparar fingerprint do portal;
3. agrupar por PI normalizada + competência para o ZIP completo;
4. comparar o conjunto ordenado de fingerprints dos portais;
5. aceitar somente URLs HTTPS;
6. devolver strings vazias quando incompatível.

- [ ] **Step 4: Ler o snapshot anterior antes dos exports**

Em `build-current-month-evidence-report.mjs`, criar uma leitura tolerante:

```js
async function readPreviousPublicData() {
  try {
    const response = await fetchWithTimeout(`${publicUrl}data.json?v=${Date.now()}`, {
      headers: { "cache-control": "no-cache" }, redirect: "follow",
    }, 20_000);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
```

Antes de materializar exports:

```js
const previousPublicData = refreshMode === "incremental" ? await readPreviousPublicData() : null;
const enrichedWithReusableDownloads = refreshMode === "incremental"
  ? reuseMonthlyDownloadUrls(enriched, previousPublicData)
  : enriched;
```

Usar `enrichedWithReusableDownloads` nas fases seguintes. Quando `materializeOptionalExports=false`, não sobrescrever URLs reaproveitadas com `""`. Quando for `true`, o resultado novo vence.

- [ ] **Step 5: Executar testes e geração seca incremental**

```bash
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-incremental-refresh.mjs
ADOPS_REPORT_REFRESH_MODE=incremental ADOPS_REPORT_SKIP_EXPORTS=1 ADOPS_REPORT_SKIP_PUBLISH=1 pnpm --filter @workspace/scripts run report:evidences-current-month
```

Expected: testes passam; geração local termina sem POST de exportação e mantém URLs compatíveis.

- [ ] **Step 6: Commit**

```bash
git add scripts/src/monthly-evidence-contract.mjs scripts/src/build-current-month-evidence-report.mjs scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-incremental-refresh.mjs
git commit -m "fix(adops): preserve report ZIPs during incremental refresh"
```

---

### Task 3: Runner publica progresso acumulado por inserção

**Files:**
- Modify: `ops/cloudflare-remote-runner/src/runner.mjs`
- Create: `scripts/src/test-daily-print-runner-live-progress.mjs`

**Interfaces:**
- Consumes: `buildDailyPrintLiveProgress` da Task 1.
- Produces: chamadas `progressJob(job.id, { ..., liveProgress })` antes, durante e depois de cada inserção.

- [ ] **Step 1: Criar teste de contrato do runner**

Criar `scripts/src/test-daily-print-runner-live-progress.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(source, /buildDailyPrintLiveProgress/);
assert.match(source, /candidateInsertionIds/);
assert.match(source, /liveProgress/);
assert.match(source, /itemsDone:\s*captured\.length \+ skipped\.length \+ failed\.length/);
assert.match(source, /percentTotal/);
console.log("daily print runner live progress: passed");
```

- [ ] **Step 2: Confirmar falha**

```bash
node scripts/src/test-daily-print-runner-live-progress.mjs
```

Expected: FAIL na ausência do import ou do resumo acumulado.

- [ ] **Step 3: Emitir o estado inicial**

Importar `buildDailyPrintLiveProgress` de `ops/shared/daily-print-status.mjs`. Após selecionar candidatos, calcular:

```js
const candidateInsertionIds = candidates
  .map((item) => readPositiveInteger(item?.adops?.insertionId))
  .filter(Boolean);
```

Enviar o primeiro progresso com `itemsDone: 0`, `itemsTotal: candidateInsertionIds.length`, `percentTotal: candidates.length ? 0 : 100` e todos os IDs em `pendingInsertionIds`.

- [ ] **Step 4: Emitir mudanças dentro do loop**

Antes de uma captura:

```js
const done = captured.length + skipped.length + failed.length;
await progressJob(job.id, {
  stage: "capture_async_dispatch",
  targetDate,
  itemsDone: done,
  itemsTotal: candidates.length,
  percentTotal: candidates.length ? Math.round((done / candidates.length) * 100) : 100,
  insertionId,
  liveProgress: buildDailyPrintLiveProgress({ candidateInsertionIds, captured, skipped, failed, runningInsertionId: insertionId }),
});
```

Depois de cada `captured`, `skipped` ou `failed`, emitir novamente com `runningInsertionId: null`. Não esperar a auditoria final para persistir o resumo.

- [ ] **Step 5: Preservar o resumo no resultado terminal**

Adicionar a `executionResult`:

```js
liveProgress: buildDailyPrintLiveProgress({
  candidateInsertionIds,
  captured,
  skipped,
  failed,
  runningInsertionId: null,
}),
```

Garantir que o caminho de erro usa o mesmo `error.jobResult` já existente.

- [ ] **Step 6: Executar testes**

Run:

```bash
node --check ops/cloudflare-remote-runner/src/runner.mjs
pnpm --dir scripts run test:daily-print-live-progress
node scripts/src/test-daily-print-runner-live-progress.mjs
```

Expected: todos passam.

- [ ] **Step 7: Commit**

```bash
git add ops/cloudflare-remote-runner/src/runner.mjs scripts/src/test-daily-print-runner-live-progress.mjs
git commit -m "feat(adops): track insertion progress in daily print batch"
```

---

### Task 4: Header vivo e atualização dos cards no relatório

**Files:**
- Modify: `scripts/src/monthly-evidence-contract.mjs`
- Modify: `scripts/src/build-current-month-evidence-report.mjs`
- Modify: `scripts/src/test-monthly-evidence-contract.mjs`
- Modify: `scripts/src/test-monthly-report-mobile-ui.mjs`
- Create: `scripts/src/test-monthly-report-live-polling.mjs`

**Interfaces:**
- Consumes: `daily-print-status`, `queue/overview`, `jobs/{id}/progress`, `capture-proof/status` e `liveProgress` da Task 1.
- Produces no HTML: `#livePrintProgress`, `#livePrintProgressBar`, `#livePrintSummary`, `#livePrintItems`, `#livePrintUpdatedAt`.
- Produces no JavaScript: polling finito, sem requisições mutáveis.

- [ ] **Step 1: Escrever testes falhos do estado e intervalo**

Adicionar a `scripts/src/test-monthly-evidence-contract.mjs`:

```js
test("polling vivo usa intervalos finitos", () => {
  assert.equal(contract.liveReportPollingDelay({ active: true, consecutiveErrors: 0 }), 15_000);
  assert.equal(contract.liveReportPollingDelay({ active: false, nextRecoveryAt: "2026-08-28T00:00:00Z", consecutiveErrors: 0 }), 60_000);
  assert.equal(contract.liveReportPollingDelay({ active: false, consecutiveErrors: 1 }), 30_000);
  assert.equal(contract.liveReportPollingDelay({ active: false, consecutiveErrors: 2 }), 60_000);
  assert.equal(contract.liveReportPollingDelay({ active: false, consecutiveErrors: 3 }), 120_000);
  assert.equal(contract.liveReportPollingDelay({ terminal: true, nextRecoveryAt: null, consecutiveErrors: 0 }), null);
});
```

Criar `scripts/src/test-monthly-report-live-polling.mjs` para renderizar o HTML e afirmar:

```js
assert.match(html, /id="livePrintProgress"/);
assert.match(html, /role="progressbar"/);
assert.match(html, /\/api\/ops\/daily-print-status/);
assert.match(html, /\/api\/ops\/queue\/overview/);
assert.match(html, /\/api\/ops\/jobs\/.*\/progress/);
assert.match(html, /\/api\/insertions\/.*\/capture-proof\/status/);
assert.doesNotMatch(html, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
```

- [ ] **Step 2: Confirmar falhas**

```bash
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-live-polling.mjs
```

Expected: FAIL pelas funções e elementos ainda ausentes.

- [ ] **Step 3: Implementar decisão pura de polling**

Em `scripts/src/monthly-evidence-contract.mjs`:

```js
export function liveReportPollingDelay({ active = false, terminal = false, nextRecoveryAt = null, consecutiveErrors = 0 } = {}) {
  if (consecutiveErrors > 0) return [30_000, 60_000, 120_000][Math.min(consecutiveErrors, 3) - 1];
  if (active) return 15_000;
  if (terminal && !nextRecoveryAt) return null;
  return nextRecoveryAt ? 60_000 : null;
}
```

O JavaScript inline deve possuir o mesmo contrato; o teste de UI garante os valores literais.

- [ ] **Step 4: Renderizar a estrutura acessível**

Adicionar ao header de `renderHtml`:

```html
<section id="livePrintProgress" class="live-print-progress" aria-labelledby="livePrintTitle">
  <div class="live-print-heading">
    <div><h2 id="livePrintTitle">Prints de hoje</h2><p id="livePrintSummary" aria-live="polite">Consultando a rotina…</p></div>
    <time id="livePrintUpdatedAt">—</time>
  </div>
  <div id="livePrintProgressBar" class="live-print-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
  <details><summary id="livePrintDetailsSummary">Ver campanhas e prints</summary><div id="livePrintItems"></div></details>
  <button id="livePrintRetry" type="button" hidden>Tentar atualizar</button>
</section>
```

CSS deve usar as variáveis de cor existentes, respeitar `prefers-reduced-motion` e empilhar conteúdo abaixo de 760px.

- [ ] **Step 5: Implementar cliente GET finito**

No script inline:

```js
const liveApiBase = "https://adops-api.codigo5.com.br";
let liveTimer = null;
let liveRequest = null;
let liveErrors = 0;
let knownCompleted = new Set();

async function liveGet(path) {
  const response = await fetch(`${liveApiBase}${path}`, { method: "GET", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
```

`refreshLiveProgress()` deve:

1. abortar a requisição anterior antes de iniciar outra;
2. ler `/api/ops/daily-print-status?date=${targetDate}` e `/api/ops/queue/overview`;
3. escolher o job ativo `print-batch` ou `lastAttempt.jobId`;
4. ler `/api/ops/jobs/{id}/progress`;
5. renderizar percentual e cinco grupos usando o mapa de inserções embutido no snapshot;
6. para cada ID recém-concluído, ler `capture-proof/status` uma única vez;
7. promover a célula somente com checklist final aprovado;
8. agendar a próxima leitura conforme as regras da spec;
9. após três erros, mostrar `Dados vivos indisponíveis` e o botão manual;
10. usar no mínimo 60 segundos enquanto `document.hidden === true`.

Não inserir `innerHTML` com erro bruto. Nomes vêm do snapshot escapado; estados usam `textContent`.

- [ ] **Step 6: Atualizar célula auditada sem alterar o snapshot**

Cada célula deve receber identificadores estáveis na renderização:

```html
data-live-insertion-id="2278" data-live-date="2026-08-27"
```

Cada card também recebe `data-live-insertion-container="2278"`. Se a célula do dia ainda não existir por causa do corte anterior às 18h, a camada viva cria uma célula temporária dentro desse container antes de aplicar classe `live-audited`, selo `Atualização ao vivo`, miniatura e link HTTPS. Não alterar totais históricos, ZIPs ou `data.json` em memória.

- [ ] **Step 7: Executar testes de UI**

Run:

```bash
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-mobile-ui.mjs
node scripts/src/test-monthly-report-live-polling.mjs
node --check scripts/src/build-current-month-evidence-report.mjs
```

Expected: todos passam, incluindo a verificação sintática do JavaScript inline.

- [ ] **Step 8: Commit**

```bash
git add scripts/src/monthly-evidence-contract.mjs scripts/src/build-current-month-evidence-report.mjs scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-mobile-ui.mjs scripts/src/test-monthly-report-live-polling.mjs
git commit -m "feat(adops): show live print progress in evidence report"
```

---

### Task 5: Harness rígido e documentação vigente

**Files:**
- Modify: `scripts/src/harness-adops-ux-fila-progresso.mjs`
- Modify: `scripts/package.json`
- Modify: `docs/START_HERE_ADOPS.md`
- Modify: `docs/status-do-projeto.md`
- Modify: `docs/spec-adops-fila-progresso-v1.md`
- Modify: `docs/harness-adops-ux-fila-progresso-v1.md`
- Modify: `docs/adops/evidence-monthly-report/runbook.md`
- Modify: `docs/adops/evidence-monthly-report/harness.md`
- Modify: `docs/PROJECT_MAP_ADOPS.md`

**Interfaces:**
- Consumes: scripts e contratos das Tasks 1–4.
- Produces: um comando canônico que falha diante de regressão funcional, de segurança ou de ZIP.

- [ ] **Step 1: Registrar os testes adicionados nas Tasks 3 e 4**

Adicionar em `scripts/package.json`:

```json
"test:daily-print-runner-live-progress": "node src/test-daily-print-runner-live-progress.mjs",
"test:monthly-report-live-polling": "node src/test-monthly-report-live-polling.mjs"
```

- [ ] **Step 2: Adicionar os novos gates ao harness**

Em `scripts/src/harness-adops-ux-fila-progresso.mjs`, incluir gates críticos:

```js
{
  id: "daily_print_live_progress",
  command: "pnpm",
  args: ["--dir", "scripts", "run", "test:daily-print-live-progress"],
  critical: true,
},
{
  id: "daily_print_runner_live_progress",
  command: "pnpm",
  args: ["--dir", "scripts", "run", "test:daily-print-runner-live-progress"],
  critical: true,
},
{
  id: "monthly_report_live_polling",
  command: "pnpm",
  args: ["--dir", "scripts", "run", "test:monthly-report-live-polling"],
  critical: true,
},
```

Manter os gates existentes de typecheck, build, auth e inventário.

- [ ] **Step 3: Atualizar contratos documentais**

Registrar explicitamente:

- Worker/D1 continua controlando os jobs que nascem no Worker; Mac Mini/PostgreSQL controla os jobs canônicos privados;
- `liveProgress` e seus cinco estados;
- relatório é snapshot estático com camada GET viva;
- atualização incremental consolida o snapshot, não desenha o progresso;
- ZIP e captura são responsabilidades separadas;
- falha viva não remove snapshot;
- polling para em estado terminal;
- nenhuma página pública possui segredo.

Remover afirmações contraditórias de que todo job pertence exclusivamente a um único control plane.

- [ ] **Step 4: Tornar os requisitos do relatório gates explícitos**

Adicionar ao harness mensal:

- header, percentual e detalhe por inserção são obrigatórios;
- cinco estados são obrigatórios;
- somente GET na camada viva;
- auditoria obrigatória antes da miniatura;
- fallback estático obrigatório;
- modal, filtros e dois ZIPs obrigatórios;
- reuso incremental exige fingerprint idêntico;
- ZIP incompatível bloqueia publicação;
- relatório nunca reduz dias auditados silenciosamente.

- [ ] **Step 5: Executar o harness completo**

```bash
pnpm --dir scripts run harness:adops-ux-fila-progresso-v1
pnpm --dir scripts run audit:capture-rules-integrity
```

Expected: `ok: true`, todos os gates críticos aprovados e novo diretório timestampado em `docs/harness-reports/adops-ux-v1/`.

- [ ] **Step 6: Commit**

Não versionar logs volumosos gerados se a política atual os mantiver ignorados. Versionar apenas contratos e resumo exigido pelo harness.

```bash
git add scripts/src/harness-adops-ux-fila-progresso.mjs scripts/package.json docs/START_HERE_ADOPS.md docs/status-do-projeto.md docs/spec-adops-fila-progresso-v1.md docs/harness-adops-ux-fila-progresso-v1.md docs/adops/evidence-monthly-report/runbook.md docs/adops/evidence-monthly-report/harness.md docs/PROJECT_MAP_ADOPS.md
git commit -m "docs(adops): lock live report progress harness"
```

---

### Task 6: Integração, deploy e readback real

**Files:**
- Review only: todo o diff de `codex/adops-live-report-progress`
- Runtime targets: API, runner geral, Worker público e relatório mensal conforme os arquivos realmente alterados.

**Interfaces:**
- Consumes: commits das Tasks 1–5.
- Produces: release validada, job terminal e evidência pública do comportamento.

- [ ] **Step 1: Revisar escopo e limpeza**

```bash
git status --short
git diff main...HEAD --check
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: somente arquivos previstos, nenhum segredo, nenhuma alteração alheia e working tree limpa.

- [ ] **Step 2: Executar gates finais**

```bash
node --check scripts/src/build-current-month-evidence-report.mjs
node --check ops/cloudflare-remote-runner/src/runner.mjs
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-mobile-ui.mjs
node scripts/src/test-monthly-report-incremental-refresh.mjs
pnpm --dir scripts run test:daily-print-live-progress
pnpm --dir scripts run test:daily-print-runner-live-progress
pnpm --dir scripts run test:monthly-report-live-polling
pnpm --dir scripts run harness:adops-ux-fila-progresso-v1
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

Expected: todos passam.

- [ ] **Step 3: Fazer deploy isolado após autorização operacional**

Usar os scripts canônicos do Portainer e Wrangler descritos nos runbooks. Publicar somente os componentes afetados. Antes de aplicar, registrar o SHA anterior e o mecanismo de rollback.

Expected: API, runner e Worker informam o mesmo SHA candidato onde aplicável; containers permanecem saudáveis.

- [ ] **Step 4: Validar progresso em job real**

Não criar job concorrente. Observar o próximo `print-batch` canônico ou um job explicitamente autorizado e acompanhar o mesmo `jobId`:

```bash
curl -fsSL "https://adops-api.codigo5.com.br/api/ops/jobs/JOB_ID/progress"
curl -fsSL "https://adops-api.codigo5.com.br/api/ops/jobs/JOB_ID"
```

Expected durante execução:

- `itemsTotal > 0` quando houver elegíveis;
- percentual crescente;
- um único `runningInsertionId`;
- grupos de IDs mutuamente exclusivos;
- job termina `completed` ou `failed`, nunca fica como aceite final em `queued` ou `running`.

- [ ] **Step 5: Validar relatório público em desktop e celular**

Confirmar:

- barra e percentual;
- lista de campanhas;
- atualização do ID corrente;
- miniatura somente após auditoria;
- filtro, modal e navegação por teclado;
- ZIP de todos os portais;
- ZIP somente do portal;
- layout em 390×844, 768×1024 e desktop.

- [ ] **Step 6: Validar fallback e polling finito**

No navegador, bloquear temporariamente as requisições GET da API pelo DevTools ou usar fixture local. Confirmar:

- snapshot continua visível;
- mensagem `Dados vivos indisponíveis`;
- botão `Tentar atualizar` após três erros;
- nenhuma requisição mutável;
- polling para após terminal sem recuperação.

- [ ] **Step 7: Validar refresh incremental e ZIPs**

Depois de uma evidência aprovada, acompanhar o job incremental pelo mesmo `jobId` até terminal. Confirmar que:

- não cria jobs de exportação;
- mantém URLs ZIP compatíveis;
- publica o novo snapshot;
- uma incompatibilidade simulada em ambiente de teste falha fechada e preserva a versão anterior.

- [ ] **Step 8: Integrar Git somente após aceite real**

```bash
git status --short
git rev-parse HEAD
git push -u origin codex/adops-live-report-progress
```

Depois do aceite, integrar na `main` pelo fluxo solicitado, repetir os gates aplicáveis e confirmar `origin/main` pelo SHA. Não fazer novo deploy a partir de uma `main` com alterações não revisadas.

## Critério final de conclusão

A entrega só termina quando código, testes, documentação, harness, release, job terminal e consumidor público concordarem. Build local ou HTTP 200 isolado não encerra a atividade.
