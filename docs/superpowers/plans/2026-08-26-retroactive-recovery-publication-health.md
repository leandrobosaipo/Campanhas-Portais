# Retroactive Recovery and Publication Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a identidade e a saúde de publicação, tornar `print-backfill` idempotente e finito, recuperar somente evidências realmente elegíveis e impedir novos loops de monitoramento conversacional.

**Architecture:** A API/Postgres do Mac Mini continua como control plane e o Worker público continua como proxy/rollback compatível. `campaign-operations` calcula identidade, saúde de publicação e saúde de evidências; jobs existentes fazem preflight, publicação, backfill, auditoria e relatório. O runner processa cada par inserção/data isoladamente, com retry temporário limitado dentro do mesmo job.

**Tech Stack:** TypeScript, Node.js ESM, Express, PostgreSQL/Drizzle, Cloudflare Worker/D1 como rollback, runner Node.js, WordPress/AdRotate, Google Drive, OpenAPI, `node:test`, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-26-retroactive-recovery-publication-health-design.md`

## Global Constraints

- Nenhum endpoint, fila, banco, container, serviço ou dependência nova.
- `POST /api/ops/jobs/print-backfill` é o único caminho de captura retroativa.
- `America/Cuiaba` decide data, período e elegibilidade; timestamps persistidos permanecem ISO-8601 UTC.
- Evidência auditada nunca é regenerada, sobrescrita ou movida entre inserções.
- `bannerPublicadoNoSite=true` isolado não comprova publicação viva.
- Reconstrução exige `candidate=true`, `promote=true`, `late_publication_recovery`, regra autorizadora e checklist final aprovado.
- Falha temporária recebe no máximo três tentativas no mesmo job; bloqueio de contrato ou segurança não recebe retry.
- Cada job operacional deve chegar a `completed` ou `failed`; `queued`, `ready_for_runner` e `running` não encerram tarefa.
- Nenhum monitor conversacional ou automação recorrente deve ser criado para aguardar horário futuro.
- PI 91159 / inserção `#2693`: não regenerar evidências auditadas de 21/08 a 26/08.
- PI 3172 / inserção `#2645`: publicar e confirmar o vídeo antes de gerar 24/08 a 26/08.
- Trabalhar somente na worktree limpa; preservar alterações alheias e secrets.
- Máximo de dois executores paralelos; arquivos têm dono único dentro de cada onda.

## File Ownership by Wave

| Onda | Fatia | Proprietário | Arquivos exclusivos |
|---|---|---|---|
| 1 | A — identidade | executor A | `artifacts/api-server/src/lib/campaign-operations-matching.ts`, `scripts/src/test-campaign-operations-match-ranking.ts` |
| 1 | B — saúde | executor B | `artifacts/api-server/src/lib/campaign-operations.ts`, `scripts/src/test-publication-health.ts` |
| 2 | A — sincronização | executor A | `scripts/src/sync-planilha-latest.ts`, `scripts/src/reconcile-planilha-adrotate.ts`, `scripts/src/test-sync-planilha-identity.mjs` |
| 2 | B — prevenção | executor B | `ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs`, `ops/shared/daily-print-candidates.mjs`, `scripts/src/test-publication-reconcile-policy.mjs`, `scripts/src/test-daily-print-status.mjs` |
| 3 | A — relatório/alerta | executor A | `scripts/src/monthly-evidence-contract.mjs`, `scripts/src/build-current-month-evidence-report.mjs`, `scripts/src/test-monthly-evidence-contract.mjs`, `scripts/src/test-monthly-report-target-evidences.mjs` |
| 3 | B — backfill/harness | executor B | `artifacts/api-server/src/routes/ops.ts`, `ops/cloudflare-public-api/src/index.ts`, `ops/cloudflare-remote-runner/src/runner.mjs`, `scripts/src/test-retroactive-recovery-contract.mjs`, `scripts/src/harness-retroactive-recovery.mjs` |
| 3 integração | coordenador | principal | `scripts/package.json`, `lib/api-spec/openapi.yaml`, `ops/fastapi-docs/main.py`, `ops/fastapi-docs/test_openapi.py`, runbooks |
| 4 | operação real | principal | nenhum arquivo compartilhado em paralelo; API, AdRotate, Drive, jobs e relatório em série |

Se uma fatia descobrir necessidade de editar arquivo pertencente a outra fatia, ela para e envia a alteração ao coordenador; não edita o arquivo.

---

### Task 1: Encerrar o monitor antigo e registrar baseline imutável

**Wave:** pré-onda, serial, somente após novo portão HITL.

**Files:**
- Modify: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`
- Read: `/Users/leandrobosaipo/.codex/automations/monitor-adops-scheduler-72h/automation.toml`

**Interfaces:**
- Consumes: automação `monitor-adops-scheduler-72h`, release público e fila canônica.
- Produces: monitor removido e baseline com SHA, fila, runners, pendências e URLs auditadas antes do código.

- [ ] **Step 1: Confirmar worktree e release sem mutação**

Run:

```bash
git status --short
git rev-parse HEAD
curl -fsSL --max-time 20 https://adops.codigo5.com.br/cod5-release.json | jq '{sha,builtAt}'
```

Expected: worktree limpa; SHA local conhecido; release público legível. Não exigir que SHA local e público coincidam antes do deploy.

- [ ] **Step 2: Ler estado da automação antes de remover**

Use `automation_update` com:

```text
id=monitor-adops-scheduler-72h
mode=view
```

Expected: resposta identifica exatamente a automação ativa deste incidente.

- [ ] **Step 3: Remover somente a automação confirmada**

Use `automation_update` com:

```text
id=monitor-adops-scheduler-72h
mode=delete
```

Expected: automação removida; nenhuma outra automação alterada.

- [ ] **Step 4: Capturar baseline operacional redigido**

Consultar pelos clientes autenticados existentes, sem imprimir headers:

```text
GET /api/ops/queue/overview
GET /api/ops/runtime-readiness
GET /api/campaign-operations/evidence-monthly-source?date=2026-08-26&competencia=AGOSTO/2026
GET /api/integrations/adrotate/insertions/2693/relation
GET /api/insertions/capture-proof/audit?date=2026-08-24&insertionIds=2645
GET /api/insertions/capture-proof/audit?date=2026-08-25&insertionIds=2645
GET /api/insertions/capture-proof/audit?date=2026-08-26&insertionIds=2645
```

Expected: registrar contagens reais, `null` quando ausente, IDs e estados; nunca secrets.

- [ ] **Step 5: Documentar por que o loop foi encerrado**

Adicionar ao rollout:

```markdown
## Monitor conversacional encerrado

O monitor de 72 horas foi removido antes da implementação. Validações futuras usam testes determinísticos, harness finito e jobs terminais. Nenhuma conversa fica ativa apenas para aguardar uma janela de cron.
```

- [ ] **Step 6: Commit documental isolado**

```bash
git add docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md
git commit -m "docs(adops): retire conversational scheduler monitor"
```

Gate: automação removida, nenhum job criado, baseline registrado, worktree limpa após commit.

---

### Task 2: Tornar identidade de PI e duplicidade um contrato canônico

**Wave:** 1A, paralelo com Task 3.

**Files:**
- Modify: `artifacts/api-server/src/lib/campaign-operations-matching.ts`
- Modify: `scripts/src/test-campaign-operations-match-ranking.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`, `normalizeFormato` e campos já retornados por `campaign-operations`.
- Produces:
  - `normalizeCampaignPiIdentity(value): string | null`
  - `buildCampaignInsertionIdentity(input): string | null`
  - `findDuplicateCampaignInsertions(input, candidates): Candidate[]`

- [ ] **Step 1: Escrever testes vermelhos para PI 91159**

Adicionar:

```ts
test("normaliza variantes textuais da PI 91159", () => {
  for (const value of ["91159", "PI 91159", "PI 91159 - PREF PVA"]) {
    assert.equal(normalizeCampaignPiIdentity(value), "91159");
  }
});

test("detecta duplicidade por PI portal formato e periodo", () => {
  const candidates = [
    { ...insertion({ id: 2693 }), piCodigo: "91159", siteSigla: "AFL", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" },
    { ...insertion({ id: 2714, mediaUrl: null, bannerPublicadoNoSite: false }), piCodigo: "PI 91159 - PREF PVA", siteSigla: "AFL", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" },
  ];
  assert.deepEqual(findDuplicateCampaignInsertions({ piCodigo: "PI 91159", siteSigla: "AFL", localFormato: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" }, candidates).map((item) => item.id), [2693, 2714]);
});
```

- [ ] **Step 2: Executar e confirmar falha**

```bash
pnpm --dir scripts exec tsx --test src/test-campaign-operations-match-ranking.ts
```

Expected: FAIL porque os três exports ainda não existem.

- [ ] **Step 3: Implementar a menor função compartilhada**

Adicionar ao arquivo existente:

```ts
export function normalizeCampaignPiIdentity(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || null;
}

export function buildCampaignInsertionIdentity(input: {
  piCodigo?: unknown;
  siteSigla?: unknown;
  localFormato?: unknown;
  periodoInicio?: unknown;
  periodoFim?: unknown;
}) {
  const pi = normalizeCampaignPiIdentity(input.piCodigo);
  const site = normalizeForMatch(String(input.siteSigla ?? ""));
  const format = normalizeFormato(String(input.localFormato ?? ""));
  const start = String(input.periodoInicio ?? "");
  const end = String(input.periodoFim ?? "");
  return pi && site && format && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    ? `${pi}:${site}:${format}:${start}:${end}`
    : null;
}
```

`findDuplicateCampaignInsertions` compara somente chaves não nulas. Reusar esta normalização em `findCampaignIdentityMatches`; remover a função local `piDigits`.

- [ ] **Step 4: Executar testes da identidade**

```bash
pnpm --dir scripts exec tsx --test src/test-campaign-operations-match-ranking.ts
```

Expected: PASS, inclusive os testes existentes de ranking.

- [ ] **Step 5: Commit da fatia**

```bash
git add artifacts/api-server/src/lib/campaign-operations-matching.ts scripts/src/test-campaign-operations-match-ranking.ts
git commit -m "fix(adops): canonicalize campaign insertion identity"
```

Gate: variantes `91159` coincidem; outra PI, portal, formato ou período não coincide.

---

### Task 3: Separar saúde de publicação e saúde de evidências

**Wave:** 1B, paralelo com Task 2.

**Files:**
- Modify: `artifacts/api-server/src/lib/campaign-operations.ts`
- Create: `scripts/src/test-publication-health.ts`

**Interfaces:**
- Consumes: relação viva já coletada por `campaign-operations`, `publicConfirmation`, `mediaUrl`, grupo esperado e auditoria existente.
- Produces:
  - `PublicationHealth`
  - `EvidenceHealth`
  - `classifyPublicationHealth(input)`
  - campos `publicationHealth` e `evidenceHealth` em `CampaignOperationItem` e `CampaignOperationUpcomingItem`.

- [ ] **Step 1: Escrever testes vermelhos de saúde independente**

Criar:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { classifyPublicationHealth } from "../../artifacts/api-server/src/lib/campaign-operations";

test("evidencia antiga nao oculta midia atual ausente", () => {
  const result = classifyPublicationHealth({
    inPeriod: true,
    mediaUrl: "https://cdn.example/vira-saude.gif",
    bannerPublicadoNoSite: true,
    expectedGroupId: 14,
    expectedMediaObserved: false,
    publicConfirmation: "reported_only",
    duplicateInsertionIds: [2714, 2779],
  });
  assert.equal(result.status, "blocked_upstream");
  assert.equal(result.reason, "expected_media_not_observed");
});

test("video no Drive sem mediaUrl bloqueia antes do periodo", () => {
  const result = classifyPublicationHealth({
    inPeriod: false,
    mediaUrl: null,
    bannerPublicadoNoSite: false,
    expectedGroupId: 6,
    expectedMediaObserved: false,
    publicConfirmation: "not_published",
    driveMediaAvailable: true,
    duplicateInsertionIds: [],
  });
  assert.equal(result.status, "prepublication_pending");
  assert.equal(result.reason, "drive_media_not_linked");
});
```

- [ ] **Step 2: Confirmar falha**

```bash
pnpm --dir scripts exec tsx --test src/test-publication-health.ts
```

Expected: FAIL porque o export não existe.

- [ ] **Step 3: Adicionar tipos fechados**

```ts
export type PublicationHealth = {
  status: "ok" | "prepublication_pending" | "blocked_upstream";
  reason: "confirmed" | "drive_media_not_linked" | "media_missing" | "adrotate_relation_missing" | "expected_media_not_observed" | "public_html_not_confirmed" | "duplicate_identity";
  requiredAction: "none" | "resolve_media" | "reconcile_duplicate" | "publish_adrotate" | "verify_publication";
  expectedGroupId: number | null;
  expectedMediaObserved: boolean;
  duplicateInsertionIds: number[];
};

export type EvidenceHealth = {
  status: "complete" | "missing" | "invalid" | "blocked_upstream" | "not_applicable";
  auditedDates: string[];
  missingDates: string[];
  invalidDates: string[];
};
```

Implementar `classifyPublicationHealth` com esta ordem: mídia, grupo, observação viva, confirmação pública, duplicidade e sucesso. Assim `#2693` conserva `expected_media_not_observed` como causa primária e ainda expõe `duplicateInsertionIds`. Fora do período com mídia Drive desvinculada retorna `prepublication_pending`; dentro do período retorna `blocked_upstream`.

- [ ] **Step 4: Anexar saúde sem mudar auditoria histórica**

No adaptador final de cada operação:

```ts
const publicationHealth = classifyPublicationHealth({
  inPeriod: Boolean(row.periodoInicio && row.periodoFim && targetDate >= row.periodoInicio && targetDate <= row.periodoFim),
  mediaUrl: insertion?.mediaUrl ?? null,
  bannerPublicadoNoSite: insertion?.bannerPublicadoNoSite ?? false,
  expectedGroupId,
  expectedMediaObserved: publicConfirmed,
  publicConfirmation,
  driveMediaAvailable: drive.mediaFiles.length > 0,
  duplicateInsertionIds,
});
```

`evidenceHealth` usa apenas as listas já produzidas por `resolveEvidence`; se `publicationHealth.status === "blocked_upstream"`, muda somente o estado agregado, não remove `auditedDates`.

Substituir `fetchHomeLiveSlots` por `fetchLiveSlotsForInsertion`: usar `homeUrl` quando o mapping for `page="home"` e `articleFallbackUrl` quando for `page="article"`. Isso permite observar o grupo 14 do AFL sem inventar URL. Manter cache por `siteSigla + page` durante uma leitura.

- [ ] **Step 5: Executar testes**

```bash
pnpm --dir scripts exec tsx --test src/test-publication-health.ts src/test-campaign-operations-match-ranking.ts
```

Expected: PASS.

- [ ] **Step 6: Commit da fatia**

```bash
git add artifacts/api-server/src/lib/campaign-operations.ts scripts/src/test-publication-health.ts
git commit -m "feat(adops): separate publication and evidence health"
```

Gate: prints auditados permanecem auditados; publicação atual pode estar bloqueada independentemente.

---

### Task 4: Aplicar PI normalizada antes de localizar ou criar campanha

**Wave:** 2A, paralelo com Task 5; começa após Tasks 2 e 3.

**Files:**
- Modify: `scripts/src/sync-planilha-latest.ts`
- Modify: `scripts/src/reconcile-planilha-adrotate.ts`
- Create: `scripts/src/test-sync-planilha-identity.mjs`

**Interfaces:**
- Consumes: `normalizeCampaignPiIdentity` e `buildCampaignInsertionIdentity` da Task 2.
- Produces: busca canônica antes de insert/update e diagnóstico de duplicatas sem exclusão automática.

- [ ] **Step 1: Escrever teste vermelho para comparação crua atual**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const syncSource = await readFile(new URL("./sync-planilha-latest.ts", import.meta.url), "utf8");
const reconcileSource = await readFile(new URL("./reconcile-planilha-adrotate.ts", import.meta.url), "utf8");

test("sincronizacao compara PI pela identidade normalizada", () => {
  assert.match(syncSource, /normalizeCampaignPiIdentity\(item\.piCodigo\)/);
  assert.doesNotMatch(syncSource, /\(item\.piCodigo \?\? ""\) === normalizedPiCode/);
});

test("reconciliacao usa a mesma identidade canonica", () => {
  assert.match(reconcileSource, /normalizeCampaignPiIdentity/);
  assert.match(reconcileSource, /buildCampaignInsertionIdentity/);
});
```

- [ ] **Step 2: Confirmar falha**

```bash
node --test scripts/src/test-sync-planilha-identity.mjs
```

Expected: FAIL porque `findCanonicalCampaignCandidate` ainda não existe.

- [ ] **Step 3: Substituir comparações cruas**

Em `sync-planilha-latest.ts`, trocar:

```ts
(item.piCodigo ?? "") === normalizedPiCode
```

por:

```ts
normalizeCampaignPiIdentity(item.piCodigo) === normalizeCampaignPiIdentity(piCodigo)
```

Antes de criar inserção, comparar também portal, formato normalizado e período pela chave da Task 2. Se houver mais de um candidato, produzir mudança `duplicate_identity` e não criar.

Em `reconcile-planilha-adrotate.ts`, usar a mesma normalização para a PI da planilha e do AdOps; manter `apply=false` como padrão.

- [ ] **Step 4: Executar testes da sincronização e ranking**

```bash
node --test scripts/src/test-sync-planilha-identity.mjs
pnpm --dir scripts exec tsx --test src/test-campaign-operations-match-ranking.ts
pnpm --filter @workspace/scripts run sync:planilha -- --dry-run
```

Expected: testes PASS; dry-run não cria campanha; PI 91159 aponta para a identidade existente.

- [ ] **Step 5: Commit da fatia**

```bash
git add scripts/src/sync-planilha-latest.ts scripts/src/reconcile-planilha-adrotate.ts scripts/src/test-sync-planilha-identity.mjs
git commit -m "fix(adops): deduplicate normalized PI identities"
```

Gate: nenhuma mutação real; dry-run lista duplicidades e reutiliza identidade canônica.

---

### Task 5: Detectar mídia/publicação preventivamente e bloquear captura prematura

**Wave:** 2B, paralelo com Task 4; começa após Tasks 2 e 3.

**Files:**
- Modify: `ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs`
- Modify: `ops/shared/daily-print-candidates.mjs`
- Modify: `scripts/src/test-publication-reconcile-policy.mjs`
- Modify: `scripts/src/test-daily-print-status.mjs`

**Interfaces:**
- Consumes: `publicationHealth`, `evidenceHealth`, jobs `drive-pi-preflight` e `adrotate-publish`.
- Produces: ação preventiva antes do período e exclusão explícita de `blocked_upstream` na seleção de captura.

- [ ] **Step 1: Escrever teste vermelho para PI 3172 antes do período**

Adicionar em `test-publication-reconcile-policy.mjs`:

```js
test("Sanear video no Drive sem mediaUrl exige preflight e publicacao", () => {
  const plan = planCampaignPublicationReconciliation([item({
    siteSigla: "AFL",
    piCodigo: "3172",
    format: { normalized: "VIDEO" },
    period: { start: "2026-08-24", end: "2026-08-26" },
    drive: { folderId: "sanear-folder", mediaStatus: "candidate_found", mediaFiles: [{ id: "sanear-mp4", name: "SANEAR ESTIAGEM_V03.mp4", mimeType: "video/mp4", kind: "video" }] },
    adops: { campaignId: 0, insertionId: 2645, mediaUrl: null, bannerPublicadoNoSite: false },
    publicationHealth: { status: "prepublication_pending", reason: "drive_media_not_linked" },
  })], "2026-08-23T12:00:00.000Z");
  assert.equal(plan.actions[0]?.type, "drive_pi_publish");
  assert.equal(plan.actions[0]?.insertionId, 2645);
});
```

- [ ] **Step 2: Escrever teste vermelho do scheduler**

Adicionar em `test-daily-print-status.mjs`:

```js
test("scheduler ignora insercao bloqueada upstream", () => {
  const selected = selectDailyPrintCandidates([{ adops: { insertionId: 2645, mediaUrl: null, bannerPublicadoNoSite: false }, publicationHealth: { status: "blocked_upstream" }, evidence: { requiredDates: ["2026-08-24"], missingDates: ["2026-08-24"] } }], "2026-08-24");
  assert.deepEqual(selected, []);
});
```

- [ ] **Step 3: Confirmar falhas**

```bash
node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs
```

Expected: FAIL nas novas expectativas.

- [ ] **Step 4: Implementar decisão preventiva mínima**

Em `publication-reconcile-policy.mjs`, priorizar:

```js
if (publicationHealth?.reason === "drive_media_not_linked" && drive?.folderId && adops?.insertionId) {
  actions.push({ type: "drive_pi_publish", insertionId: adops.insertionId, folderId: drive.folderId, generateEvidence: false });
  continue;
}
```

Em `daily-print-candidates.mjs`, exigir:

```js
if (item?.publicationHealth?.status === "blocked_upstream") return false;
```

Manter os gates já existentes de `publicConfirmation`, mídia e período.

- [ ] **Step 5: Executar testes**

```bash
node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs scripts/src/test-async-daily-print-batch-contract.mjs
```

Expected: PASS; nenhuma captura antes da publicação.

- [ ] **Step 6: Commit da fatia**

```bash
git add ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs ops/shared/daily-print-candidates.mjs scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs
git commit -m "fix(adops): block evidence before live publication"
```

Gate: mídia no Drive gera ação upstream; scheduler não cria print bloqueado.

---

### Task 6: Tornar `print-backfill` idempotente no control plane e rollback

**Wave:** 3B, serial antes da Task 7.

**Files:**
- Modify: `artifacts/api-server/src/routes/ops.ts`
- Modify: `ops/cloudflare-public-api/src/index.ts`
- Create: `scripts/src/test-retroactive-recovery-contract.mjs`

**Interfaces:**
- Consumes: `createIdempotentOpsJob`, filtros existentes do backfill.
- Produces: `buildPrintBackfillIdempotencyKey(payload)` e resposta `{ jobId, status, duplicate }` compatível nos dois providers.

- [ ] **Step 1: Escrever teste vermelho do contrato**

Criar:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");

test("backfill usa criacao idempotente nos dois providers", () => {
  for (const source of [api, worker]) {
    const start = source.indexOf('print-backfill");');
    const block = source.slice(start, start + 3200);
    assert.match(block, /createIdempotentOpsJob/);
    assert.match(block, /late_publication_recovery/);
    assert.match(block, /duplicate/);
  }
});
```

- [ ] **Step 2: Confirmar falha**

```bash
node --test scripts/src/test-retroactive-recovery-contract.mjs
```

Expected: FAIL porque as rotas usam `createOpsJob`.

- [ ] **Step 3: Construir chave determinística**

No Mac Mini e no Worker, usar o mesmo formato:

```ts
const scope = insertionId
  ? `insertion:${insertionId}`
  : campaignId
    ? `campaign:${campaignId}`
    : piCodigo && siteSigla
      ? `pi-site:${String(piCodigo).replace(/\D/g, "").replace(/^0+(?=\d)/, "")}:${siteSigla}`
      : siteId
        ? `site:${siteId}`
        : `competencia:${competencia}`;
const idempotencyKey = `print-backfill:${scope}:${fromDate ?? "period-start"}:${toDate ?? "period-end"}:late_publication_recovery`;
```

Criar com `createIdempotentOpsJob`; sempre persistir `reconstructionReason: "late_publication_recovery"`, `attempt: 1` e `maxAttempts: 3`. Responder `200` para duplicate e `202` para criação.

- [ ] **Step 4: Executar contrato e proxy**

```bash
node --test scripts/src/test-retroactive-recovery-contract.mjs scripts/src/test-campaign-evidence-public-proxy.mjs scripts/src/test-worker-runner-queue.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit da idempotência**

```bash
git add artifacts/api-server/src/routes/ops.ts ops/cloudflare-public-api/src/index.ts scripts/src/test-retroactive-recovery-contract.mjs
git commit -m "fix(adops): make retroactive backfill idempotent"
```

Gate: replay devolve mesmo `jobId`; não existe segundo job ativo equivalente.

---

### Task 7: Isolar pares e limitar retry dentro do mesmo backfill

**Wave:** 3B, após Task 6.

**Files:**
- Modify: `ops/cloudflare-remote-runner/src/runner.mjs`
- Modify: `scripts/src/test-retroactive-recovery-contract.mjs`

**Interfaces:**
- Consumes: payload idempotente da Task 6, `enqueueAndWaitCaptureProof`, `capture-proof/status`.
- Produces:
  - `isRetryableRetroactiveError(error): boolean`
  - `executeRetroactiveTarget(input): RetroactiveItemResult`
  - `RetroactiveItemResult.status = audited | failed | skipped_existing | blocked_reconstruction | blocked_upstream`.

- [ ] **Step 1: Adicionar testes vermelhos para retry e isolamento**

Adicionar ao contrato:

```js
test("backfill limita retry temporario e nao repete bloqueio", () => {
  assert.match(runner, /const RETROACTIVE_RETRY_DELAYS_MS = \[0, 2_000, 5_000\]/);
  assert.match(runner, /isRetryableRetroactiveError/);
  assert.match(runner, /blocked_reconstruction/);
  assert.match(runner, /blocked_upstream/);
  assert.match(runner, /skipped_existing/);
  assert.match(runner, /attempts/);
});
```

Adicionar testes executáveis:

```js
test("erro 503 passa na terceira tentativa", async () => {
  let attempts = 0;
  const result = await runner.executeRetroactiveTarget({
    identity: { insertionId: 2645, date: "2026-08-24" },
    readStatus: async () => attempts >= 3 ? { status: "audited", arquivoUrl: "https://cdn.example/2645-2026-08-24.png" } : { status: "missing" },
    capture: async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("503"), { code: "http_503" });
      return { item: { uploadedUrl: "https://cdn.example/2645-2026-08-24.png" } };
    },
    sleep: async () => undefined,
  });
  assert.equal(result.status, "audited");
  assert.equal(result.attempts, 3);
});

test("bloqueio de reconstrucao nao recebe retry", async () => {
  let attempts = 0;
  const result = await runner.executeRetroactiveTarget({
    identity: { insertionId: 2645, date: "2026-08-25" },
    readStatus: async () => ({ status: "missing" }),
    capture: async () => {
      attempts += 1;
      throw Object.assign(new Error("reconstruction not allowed"), { code: "reconstruction_not_allowed" });
    },
    sleep: async () => undefined,
  });
  assert.equal(result.status, "blocked_reconstruction");
  assert.equal(attempts, 1);
});
```

- [ ] **Step 2: Confirmar falha**

```bash
node --test scripts/src/test-retroactive-recovery-contract.mjs
```

Expected: FAIL.

- [ ] **Step 3: Classificar erros sem regex ampla**

```js
const RETROACTIVE_RETRY_DELAYS_MS = [0, 2_000, 5_000];
const RETROACTIVE_RETRYABLE_CODES = new Set(["http_429", "http_502", "http_503", "http_504", "network_timeout", "runner_interrupted", "upload_transient"]);

function isRetryableRetroactiveError(error) {
  return RETROACTIVE_RETRYABLE_CODES.has(String(error?.code || error?.errorCode || ""));
}
```

Mapear respostas HTTP e erros conhecidos para códigos antes do loop. Não usar `/retro|reconstru/i` para decidir retry.

- [ ] **Step 4: Implementar execução por par**

```js
async function executeRetroactiveTarget(input) {
  const before = await input.readStatus();
  if (isAuditApprovedStatus(before)) return { ...input.identity, status: "skipped_existing", attempts: 0, evidenceUrl: before.arquivoUrl ?? null, errorCode: null, error: null, checklistStatus: before.status ?? null };
  for (let index = 0; index < RETROACTIVE_RETRY_DELAYS_MS.length; index += 1) {
    if (RETROACTIVE_RETRY_DELAYS_MS[index]) await sleep(RETROACTIVE_RETRY_DELAYS_MS[index]);
    try {
      const capture = await input.capture();
      const after = await input.readStatus();
      if (!isAuditApprovedStatus(after)) throw Object.assign(new Error("Checklist final não aprovado."), { code: "final_checklist_blocked" });
      return { ...input.identity, status: "audited", attempts: index + 1, evidenceUrl: after.arquivoUrl ?? capture?.item?.uploadedUrl ?? null, errorCode: null, error: null, checklistStatus: after.status ?? null };
    } catch (error) {
      const classified = classifyRetroactiveError(error);
      if (!classified.retryable || index === RETROACTIVE_RETRY_DELAYS_MS.length - 1) return { ...input.identity, status: classified.status, attempts: index + 1, evidenceUrl: before?.arquivoUrl ?? null, errorCode: classified.code, error: classified.message, checklistStatus: before?.status ?? null };
    }
  }
}
```

`executePrintBackfill` continua o loop após cada resultado. Se qualquer item terminar `failed`, `blocked_reconstruction` ou `blocked_upstream`, anexar `error.jobResult` e lançar uma vez após processar todos; assim o pai termina `failed` com resultado parcial.

- [ ] **Step 5: Executar testes**

```bash
node --test scripts/src/test-retroactive-recovery-contract.mjs scripts/src/test-runner-async-capture-contract.mjs scripts/src/test-async-daily-print-batch-contract.mjs
```

Expected: PASS; três tentativas máximas; bloqueio uma tentativa; próxima inserção processada.

- [ ] **Step 6: Commit do runner**

```bash
git add ops/cloudflare-remote-runner/src/runner.mjs scripts/src/test-retroactive-recovery-contract.mjs
git commit -m "fix(adops): bound retroactive retries per evidence"
```

Gate: pai parcial é `failed`; resultados preservam contagens, IDs, tempos e causa por par.

---

### Task 8: Expor bloqueio upstream no relatório e nos alertas

**Wave:** 3A, paralelo com Tasks 6–7.

**Files:**
- Modify: `scripts/src/monthly-evidence-contract.mjs`
- Modify: `scripts/src/build-current-month-evidence-report.mjs`
- Modify: `scripts/src/test-monthly-evidence-contract.mjs`
- Modify: `scripts/src/test-monthly-report-target-evidences.mjs`

**Interfaces:**
- Consumes: `publicationHealth` e `evidenceHealth` das Tasks 3 e 5.
- Produces: estado visual `blocked_upstream`, causa, ação, filtros e fingerprint de alerta por transição.

- [ ] **Step 1: Escrever teste vermelho de campanha com print antigo e publicação quebrada**

```js
test("publicacao quebrada continua visivel com evidencias auditadas", () => {
  const metadata = buildCampaignFilterMetadata({ items: [{
    state: "blocked_upstream",
    publicationHealth: { status: "blocked_upstream", reason: "expected_media_not_observed" },
    requiredDays: ["2026-08-21"],
    auditedDays: 1,
    missingDates: [],
    invalidDates: [],
  }] }, "2026-08-26");
  assert.match(metadata.publicationStates, /blocked_upstream/);
  assert.match(metadata.evidenceStates, /complete/);
});
```

- [ ] **Step 2: Escrever sentinela `#2693`**

No teste focal, exigir:

```js
assert.equal(item.insertionId, 2693);
assert.equal(item.auditedDays, 6);
assert.deepEqual(item.missingDates, []);
assert.equal(item.publicationHealth.status, "blocked_upstream");
assert.equal(item.publicationHealth.reason, "expected_media_not_observed");
```

- [ ] **Step 3: Confirmar falhas**

```bash
node --test scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-target-evidences.mjs
```

Expected: FAIL porque o estado ainda é `not_published`/`ok` sem separação.

- [ ] **Step 4: Adaptar estado e texto**

Em `computeInsertionState`, priorizar:

```js
if (item.publicationHealth?.status === "blocked_upstream") return "blocked_upstream";
```

Adicionar rótulo `publicação bloqueada`. `evidenceDetails` mantém a contagem auditada e acrescenta motivo/ação da publicação. `buildCampaignFilterMetadata` inclui `blocked_upstream` em publicação sem remover `complete` de evidência.

Alertas usam fingerprint:

```text
publication-health:{insertionId}:{reason}:{expectedGroupId}
```

O relatório fornece `publicationFingerprint` estável para a integração serial da Task 10. Não envia alerta durante renderização.

- [ ] **Step 5: Executar testes de relatório**

```bash
node --test scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-target-evidences.mjs scripts/src/test-monthly-report-incremental-refresh.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit da fatia**

```bash
git add scripts/src/monthly-evidence-contract.mjs scripts/src/build-current-month-evidence-report.mjs scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-target-evidences.mjs
git commit -m "feat(adops): report upstream publication blockers"
```

Gate: `#2693` mostra evidência completa e publicação bloqueada ao mesmo tempo.

---

### Task 9: Criar harness finito com `check`, `execute` e `verify`

**Wave:** 3B, após Tasks 6–8; integração serial.

**Files:**
- Create: `scripts/src/harness-retroactive-recovery.mjs`
- Create: `scripts/src/test-harness-retroactive-recovery.mjs`
- Modify: `scripts/package.json`
- Create: `docs/adops/retroactive-recovery-harness.md`

**Interfaces:**
- Consumes: API base/token via env existente, jobs `drive-pi-preflight`, `adrotate-publish`, `print-backfill`, `evidence-monthly-report` e progresso de job.
- Produces: `runHarness(options)`, `harness:retroactive-recovery --mode=check|execute|verify`, `summary.md` e `results.json`.

- [ ] **Step 1: Escrever servidor simulado e testes vermelhos**

Cobrir:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runHarness } from "./harness-retroactive-recovery.mjs";

function sequenceClock(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function fakeApi(calls, scenario) {
  let progressIndex = 0;
  return {
    async get(path) {
      calls.push({ method: "GET", path });
      if (path.includes("/progress")) return { status: scenario.progress[Math.min(progressIndex++, scenario.progress.length - 1)] };
      if (path.includes("capture-proof/status")) return { status: "audited", checklistValidation: { approved: true }, arquivoUrl: "https://cdn.example/evidence.png" };
      return scenario.audit ?? scenario.queue ?? scenario.readiness ?? {};
    },
    async post(path) {
      calls.push({ method: "POST", path });
      return { jobId: scenario.createJobId, status: "ready_for_runner" };
    },
    async publicAsset(asset) {
      calls.push({ kind: "public_asset", asset });
      assert.ok(scenario.publicAssets.includes(asset));
      return { ok: true };
    },
  };
}

test("check nunca faz POST", async () => {
  const calls = [];
  await runHarness({ mode: "check", api: fakeApi(calls, { audit: { items: [] }, queue: {}, readiness: {} }) });
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("execute acompanha o mesmo job ate completed", async () => {
  const calls = [];
  const result = await runHarness({ mode: "execute", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { createJobId: "job-2645", progress: ["ready_for_runner", "running", "completed"] }), sleep: async () => undefined });
  assert.equal(result.jobId, "job-2645");
  assert.equal(result.status, "completed");
  assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/print-backfill")).length, 1);
});

test("failed nao cria segundo job", async () => {
  const calls = [];
  const result = await runHarness({ mode: "execute", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { createJobId: "job-failed", progress: ["running", "failed"] }), sleep: async () => undefined });
  assert.equal(result.status, "failed");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

test("timeout retorna job e ultimo progresso", async () => {
  const calls = [];
  await assert.rejects(() => runHarness({ mode: "execute", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", timeoutMs: 1, api: fakeApi(calls, { createJobId: "job-timeout", progress: ["running"] }), now: sequenceClock([0, 2]), sleep: async () => undefined }), (error) => error.code === "job_timeout" && error.jobId === "job-timeout");
});

test("verify consulta cada consumidor separadamente", async () => {
  const calls = [];
  await runHarness({ mode: "verify", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { auditedDates: ["2026-08-24", "2026-08-25", "2026-08-26"], publicAssets: ["html", "thumbnail", "modal", "download"] }) });
  assert.deepEqual(calls.filter((call) => call.kind === "public_asset").map((call) => call.asset), ["html", "thumbnail", "modal", "download"]);
});
```

- [ ] **Step 2: Confirmar falha**

```bash
node --test scripts/src/test-harness-retroactive-recovery.mjs
```

Expected: FAIL porque o harness não existe.

- [ ] **Step 3: Implementar parser fechado**

Aceitar somente:

```text
--mode=check|execute|verify
--insertion-id=<inteiro positivo>
--from-date=YYYY-MM-DD
--to-date=YYYY-MM-DD
--competencia=<texto>
--timeout-ms=<1..2700000>
--output-dir=<diretório dentro de docs/harness-reports/retroactive-recovery>
```

`execute` exige recorte explícito. O default de timeout é `2700000` ms. Reusar `fetch`, `AbortSignal.timeout`, `fs/promises` e `setTimeout`; nenhuma dependência.

- [ ] **Step 4: Implementar polling do mesmo job**

```js
async function waitForTerminalJob(api, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const progress = await api.get(`/api/ops/jobs/${encodeURIComponent(jobId)}/progress`);
    if (["completed", "failed"].includes(progress.status)) return progress;
    if (Date.now() >= deadline) throw Object.assign(new Error(`Timeout aguardando job ${jobId}.`), { code: "job_timeout", jobId, progress });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
```

Não chamar create novamente dentro deste loop.

- [ ] **Step 5: Implementar artefatos redigidos**

`results.json` contém modo, release, job IDs, estados, inserções/datas, URLs públicas, contagens e erros sanitizados. Remover chaves que correspondam a `/authorization|token|secret|cookie|password/i` antes de gravar.

- [ ] **Step 6: Adicionar comando e documentação**

Em `scripts/package.json`:

```json
"harness:retroactive-recovery": "node ./src/harness-retroactive-recovery.mjs"
```

Documentar exemplos `check`, `execute` e `verify`, estados terminais e regra anti-loop.

- [ ] **Step 7: Executar testes**

```bash
node --test scripts/src/test-harness-retroactive-recovery.mjs
pnpm --dir scripts run harness:retroactive-recovery -- --mode=check --output-dir=docs/harness-reports/retroactive-recovery/test
```

Expected: testes PASS; `check` não faz POST.

- [ ] **Step 8: Commit do harness**

```bash
git add scripts/src/harness-retroactive-recovery.mjs scripts/src/test-harness-retroactive-recovery.mjs scripts/package.json docs/adops/retroactive-recovery-harness.md
git commit -m "feat(adops): add finite retroactive recovery harness"
```

Gate: nenhuma automação; um `jobId`; timeout finito; artefatos sem secrets.

---

### Task 10: Publicar contratos OpenAPI e fechar quality gates locais

**Wave:** 3, integração serial.

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `ops/fastapi-docs/main.py`
- Modify: `ops/fastapi-docs/test_openapi.py`
- Modify: `artifacts/api-server/src/routes/ops.ts`
- Modify: `ops/cloudflare-telegram-bot/src/index.ts`
- Modify: `scripts/src/test-daily-print-recovery-contract.mjs`
- Modify: `docs/adops/ops-api-runbook.md`
- Modify: `docs/adops/evidence-monthly-report/spec.md`
- Modify: `docs/adops/evidence-monthly-report/harness.md`

**Interfaces:**
- Consumes: contratos finais das Tasks 2–9.
- Produces: schemas navegáveis de saúde, backfill, itens, duplicate e harness operacional.

- [ ] **Step 1: Escrever teste OpenAPI vermelho**

Exigir schemas:

```python
assert "PublicationHealth" in schemas
assert "EvidenceHealth" in schemas
assert "RetroactiveBackfillItem" in schemas
assert schemas["RetroactiveBackfillItem"]["properties"]["status"]["enum"] == [
    "audited", "failed", "skipped_existing", "blocked_reconstruction", "blocked_upstream"
]
```

- [ ] **Step 2: Confirmar falha**

```bash
uv run --with-requirements ops/fastapi-docs/requirements.txt python ops/fastapi-docs/test_openapi.py
```

Expected: FAIL por schemas ausentes.

- [ ] **Step 3: Documentar request/response exatos**

`POST /ops/jobs/print-backfill` documenta filtros existentes, `duplicate`, `reconstructionReason=late_publication_recovery`, `attempt=1`, `maxAttempts=3`. Resultados documentam os cinco estados por item e `status=failed` no pai quando houver bloqueio/falha.

- [ ] **Step 4: Atualizar runbooks**

Registrar:

```text
preflight Drive -> publicação AdRotate -> confirmação viva -> print-backfill -> auditoria -> relatório
```

Registrar que `#2693` não é pendência de print e `#2645` não pode capturar antes da publicação.

- [ ] **Step 5: Integrar alerta por transição sem nova rota**

Transformar `GET /ops/daily-print-alerts/evaluate` em handler assíncrono. Reusar `getActiveCampaignOperations({ date: decision.targetDate, includeEvidence: true })` e anexar:

```ts
const publicationBlockedIds = operations.items
  .filter((item) => item.publicationHealth?.status === "blocked_upstream")
  .map((item) => item.adops.insertionId)
  .filter((id): id is number => Number.isInteger(id));
res.json({ ...decision, publicationBlockedIds });
```

Em `/ops/daily-print-alerts/claim`, aceitar `publicationBlockedIds`, ordenar e incluir no fingerprint:

```ts
const fingerprint = `${date}:${state}:prints=${pendingInsertionIds.join(",")}:publication=${publicationBlockedIds.join(",")}`;
```

No Telegram, reutilizar evaluate/claim e acrescentar `Publicação bloqueada: <IDs>` somente quando a lista não estiver vazia. O claim existente evita repetição e permite nova mensagem quando a lista mudar.

Adicionar em `test-daily-print-recovery-contract.mjs`:

```js
test("alerta inclui bloqueio de publicacao no fingerprint", () => {
  assert.match(macMiniOps, /publicationBlockedIds/);
  assert.match(macMiniOps, /publication=\$\{publicationBlockedIds\.join/);
  assert.match(telegram, /Publicação bloqueada:/);
  assert.match(telegram, /daily-print-alerts\/claim/);
});
```

- [ ] **Step 6: Executar todos os quality gates**

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --dir scripts run test:runner-async-capture-contract
pnpm --dir scripts run test:ops-scheduler
node --test scripts/src/test-publication-reconcile-policy.mjs
node --test scripts/src/test-cross-portal-retro-reconstruction.mjs
node --test scripts/src/test-daily-print-recovery-contract.mjs
node --test scripts/src/test-monthly-report-incremental-refresh.mjs
node --test scripts/src/test-retroactive-recovery-contract.mjs scripts/src/test-harness-retroactive-recovery.mjs
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
uv run --with-requirements ops/fastapi-docs/requirements.txt python ops/fastapi-docs/test_openapi.py
git diff --check
```

Expected: todos PASS; warnings já conhecidas de bundle/sourcemap não escondem falha.

- [ ] **Step 7: Revisar escopo e dependências**

```bash
git diff --stat HEAD~10..HEAD
git diff -- package.json pnpm-lock.yaml
git status --short
```

Expected: nenhuma dependência nova; somente arquivos planejados; worktree limpa após commits.

- [ ] **Step 8: Commit de contratos e docs**

```bash
git add lib/api-spec/openapi.yaml ops/fastapi-docs/main.py ops/fastapi-docs/test_openapi.py artifacts/api-server/src/routes/ops.ts ops/cloudflare-telegram-bot/src/index.ts scripts/src/test-daily-print-recovery-contract.mjs docs/adops/ops-api-runbook.md docs/adops/evidence-monthly-report/spec.md docs/adops/evidence-monthly-report/harness.md
git commit -m "docs(api): publish retroactive recovery contracts"
```

Gate: spec, OpenAPI, código e testes usam os mesmos nomes e enums.

---

### Task 11: Deploy isolado e readback do runtime

**Wave:** 4, serial, após todos os gates locais.

**Files:**
- Modify: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`

**Interfaces:**
- Consumes: branch limpa, script de deploy existente e backup automático.
- Produces: release ativo, containers saudáveis, Worker em proxy e rollback identificado.

- [ ] **Step 1: Preflight de deploy**

```bash
git status --short
git rev-parse HEAD
/Users/leandrobosaipo/.agents/skills/portainer/portainer.sh status
```

Expected: worktree limpa; containers atuais identificados.

- [ ] **Step 2: Deploy pelo script canônico**

```bash
ADOPS_IMAGE_TAG="$(git rev-parse HEAD)" ADOPS_RELEASE_SHA="$(git rev-parse HEAD)" bash ops/portainer/adops-stack/scripts/deploy-production.sh
```

Expected: backup concluído; volumes versionados; deploy termina com readbacks estáveis.

- [ ] **Step 3: Confirmar SHA e saúde**

```bash
curl -fsSL --max-time 20 https://adops.codigo5.com.br/cod5-release.json | jq '{sha,builtAt}'
/Users/leandrobosaipo/.agents/skills/portainer/portainer.sh status
```

Expected: SHA igual ao commit implantado; API, web, Postgres e runners saudáveis.

- [ ] **Step 4: Confirmar contrato e proxy público**

```bash
curl -fsSL --max-time 20 https://adops-api.codigo5.com.br/api/openapi.json | jq '.components.schemas | {PublicationHealth,EvidenceHealth,RetroactiveBackfillItem}'
```

Consultar overview privado e Worker público; ambos devem reportar `provider=macmini` e mesma fila. Não expor token.

- [ ] **Step 5: Rodar harness `check` real**

```bash
pnpm --dir scripts run harness:retroactive-recovery -- --mode=check
```

Expected: nenhuma mutação; pendências e bloqueios reais registrados.

Gate: se SHA, container, proxy ou `check` falhar, parar antes de qualquer correção operacional.

---

### Task 12: Corrigir PI 91159 / `#2693` sem recaptura

**Wave:** 4, serial, após Task 11.

**Files:**
- Append runtime evidence: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`

**Interfaces:**
- Consumes: identidade normalizada, `campaign-publication-reconcile`, `adrotate-publish`, relação AdRotate e auditoria.
- Produces: inserção canônica publicada no grupo 14; duplicatas reconciliadas; URLs auditadas preservadas.

- [ ] **Step 1: Capturar URLs antes da correção**

Consultar `capture-proof/status` de `#2693` para 21/08 a 26/08 e salvar IDs/URLs no relatório do harness.

Expected: seis estados `audited`; nenhuma chamada POST de captura.

- [ ] **Step 2: Rodar reconciliação em preflight**

```text
POST /api/ops/jobs/campaign-publication-reconcile
{ "targetDate": "2026-08-26", "insertionId": 2693, "mode": "preflight" }
```

Acompanhar o `jobId` retornado até terminal. Expected: identidade canônica `#1008/#2693`; duplicatas `#2714` e `#1014/#2779`; ação de publicação/relação, não de captura.

- [ ] **Step 3: Aplicar reconciliação da inserção canônica**

Usar `adrotate-publish` primeiro com `apply=false`, validar payload esperado `insertionId=2693`, `groupId=14`, mídia canônica e `generateEvidence=false`. Depois criar um job autorizado com `apply=true`, ainda `generateEvidence=false`; não repetir enquanto estiver ativo.

Acompanhar cada `jobId` até terminal; não criar retry paralelo.

- [ ] **Step 4: Validar publicação viva**

```text
GET /api/integrations/adrotate/insertions/2693/relation
```

Expected:

```text
adrotateGroupId=14
canonicalSelection.decision=confirmed
expectedMediaObserved=true
exactLiveMatches.length>=1
publicConfirmation=confirmed
```

Abrir HTML público e confirmar mesma mídia no grupo 14.

- [ ] **Step 5: Revalidar URLs imutáveis**

Consultar novamente 21/08 a 26/08. Expected: seis `audited`; mesmas URLs da Step 1; zero job `print-single`/`print-backfill` para `#2693`.

- [ ] **Step 6: Registrar duplicidades sem apagar**

Registrar `#2714` e `#2779` como duplicidades sem mídia e bloqueadas para publicação. Nenhuma exclusão automática.

Gate: publicação saudável e evidências intactas. Se mídia viva não aparecer, terminar incidente de publicação; não recapturar.

---

### Task 13: Publicar PI 3172 / `#2645` e recuperar 24/08–26/08

**Wave:** 4, serial, após Task 12.

**Files:**
- Append runtime evidence: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`

**Interfaces:**
- Consumes: `drive-pi-preflight`, `drive-pi-publish`, `adrotate-publish`, `print-backfill`, auditoria e harness.
- Produces: MP4 canônico no grupo 6 e três evidências auditadas ou bloqueio terminal explícito.

- [ ] **Step 1: Confirmar estado upstream sem mutação**

Executar `drive-pi-preflight` para a pasta canônica da PI 3172. Acompanhar o `jobId` até terminal.

Expected: arquivo `SANEAR ESTIAGEM_V03.mp4`, formato `VIDEO`, inserção alvo `#2645`, grupo esperado `6`, sem nova campanha/inserção.

- [ ] **Step 2: Publicar mídia sem gerar evidência**

Criar `drive-pi-publish`/`adrotate-publish` com escopo estrito `#2645`, `generateEvidence=false`. Primeiro dry-run; depois apply. Acompanhar o mesmo `jobId` de cada etapa até terminal.

- [ ] **Step 3: Confirmar vídeo vivo**

Consultar relação `#2645` e HTML público.

Expected:

```text
mediaUrl aponta para SANEAR ESTIAGEM_V03.mp4
adrotateGroupId=6
expectedMediaObserved=true
publicConfirmation=confirmed
```

Validar que o elemento de vídeo/creative no slot público usa o arquivo esperado.

- [ ] **Step 4: Criar um único backfill**

```text
POST /api/ops/jobs/print-backfill
{
  "insertionId": 2645,
  "fromDate": "2026-08-24",
  "toDate": "2026-08-26",
  "replace": false,
  "force": false
}
```

Registrar o `jobId`. Não repetir o POST durante polling.

- [ ] **Step 5: Acompanhar até terminal**

```text
GET /api/ops/jobs/{jobId}/progress
```

Expected: `completed` com três itens `audited`; ou `failed` com resultados por data e causa explícita. Nunca encerrar em estado intermediário.

- [ ] **Step 6: Validar cada data**

Para 24/08, 25/08 e 26/08:

```text
GET /api/insertions/2645/capture-proof/status?date=YYYY-MM-DD
```

Exigir `audited`, checklist final aprovado, data correta, grupo 6, frame representativo do vídeo, URL acessível e mídia correspondente.

Gate: zero captura antes da publicação; somente três datas faltantes processadas; nenhuma evidência extra.

---

### Task 14: Recuperar demais pendências, regenerar relatório e validar consumidor

**Wave:** 4, serial, após Task 13.

**Files:**
- Modify: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`

**Interfaces:**
- Consumes: harness `check|execute|verify`, auditoria canônica e jobs terminais.
- Produces: todas as pendências atuais elegíveis auditadas ou bloqueadas com causa; relatório público coerente.

- [ ] **Step 1: Executar novo `check`**

```bash
pnpm --dir scripts run harness:retroactive-recovery -- --mode=check
```

Expected: lista exata de pares; itens `blocked_upstream` separados de capturáveis; evidências auditadas ausentes da lista de execução.

- [ ] **Step 2: Executar recortes finitos**

Para cada recorte aprovado pelo `check`, rodar `execute` uma vez. Acompanhar o `jobId` retornado até terminal. Não agrupar portais incompatíveis e não criar segundo job enquanto o primeiro estiver ativo.

- [ ] **Step 3: Classificar resultados**

Registrar por par:

```text
audited
skipped_existing
failed + errorCode
blocked_reconstruction + reason
blocked_upstream + requiredAction
```

Não promover reconstrução sem autorização.

- [ ] **Step 4: Regenerar relatório uma vez**

Após todos os backfills terminais:

```text
POST /api/ops/jobs/evidence-monthly-report
{ "targetDate": "2026-08-26", "competencia": "AGOSTO/2026", "idempotencyKey": "evidence-monthly-report:2026-08-26:retroactive-recovery-final" }
```

Acompanhar o mesmo `jobId` até terminal.

- [ ] **Step 5: Executar `verify`**

```bash
pnpm --dir scripts run harness:retroactive-recovery -- --mode=verify
```

Expected: status por data, URLs, relatório e assets públicos validados.

- [ ] **Step 6: Validar navegador real**

No relatório público com `evidence=missing`:

- conferir card de `#2693`: evidências completas e publicação saudável após correção;
- conferir `#2645`: três datas auditadas;
- abrir miniatura, modal e download separadamente;
- confirmar que bloqueios restantes continuam visíveis e explicados;
- confirmar zero erro de console relevante.

- [ ] **Step 7: Fechar documentação e commit**

Adicionar SHA, backups, containers, job IDs, resultados, URLs e bloqueios restantes ao rollout.

```bash
git add docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md
git commit -m "docs(adops): record finite retroactive recovery rollout"
git status --short
```

Gate final: worktree limpa; release ativo confirmado; jobs terminais; consumidor real validado; nenhuma automação de espera criada.

## Final Acceptance Checklist

- [ ] Monitor `monitor-adops-scheduler-72h` removido após HITL.
- [ ] PI normalizada antes de localizar/criar campanha.
- [ ] Duplicidade bloqueada por PI + portal + formato + período.
- [ ] Publicação e evidências expostas separadamente.
- [ ] `bannerPublicadoNoSite=true` isolado não retorna saúde `ok`.
- [ ] Mídia no Drive e ausente no AdOps gera pendência preventiva.
- [ ] Inserção iniciada e não publicada fica `blocked_upstream`.
- [ ] Scheduler não captura `blocked_upstream`.
- [ ] `print-backfill` é idempotente e usa no máximo três tentativas temporárias.
- [ ] Uma falha por par não interrompe os demais.
- [ ] `#2693` mantém URLs auditadas de 21/08 a 26/08.
- [ ] `#2693` confirma mídia viva no grupo 14 e duplicatas ficam reconciliadas.
- [ ] `#2645` confirma MP4 vivo no grupo 6 antes do backfill.
- [ ] `#2645` processa somente 24/08, 25/08 e 26/08.
- [ ] Todas as demais pendências terminam auditadas ou bloqueadas com causa.
- [ ] Relatório mostra card, miniatura, modal e download coerentes.
- [ ] OpenAPI, runbooks e harness correspondem ao runtime.
- [ ] Nenhuma dependência, serviço, fila ou endpoint novo.
- [ ] Nenhum segredo registrado.
- [ ] Nenhum monitoramento conversacional aberto.

## HITL Gate

Este plano não autoriza implementação. A execução começa somente após aprovação humana explícita de uma das opções de handoff. Até essa aprovação, não remover automação, modificar código, criar job, publicar mídia, alterar AdRotate ou fazer deploy.
