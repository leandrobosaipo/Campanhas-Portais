# Plano - corrigir cadastro automatico de PI via Drive

Data: 2026-06-02

## Diagnostico

Fonte consultada:

- `docs/runbook-nova-pi-evidencias.md`
- `docs/adops/pi-automation-v3/runbook.md`
- API publica `GET /api/ops/jobs?kind=drive-pi-ingest`
- Google Drive raiz `18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6`
- Auditoria publica `GET /api/insertions/capture-proof/audit?date=2026-06-01`

Fluxo documentado para nova PI:

```text
Drive/PDF/midia
  -> extrair PI, cliente, agencia, portal, periodo, formato e destino
  -> sincronizar planilha
  -> conferir campanha/insercao canonica no AdOps
  -> conferir AdRotate/portal sem duplicar
  -> sincronizar mediaUrl e link de destino
  -> limpar cache
  -> gerar evidencia atual e retroativa
  -> auditar visualmente
```

## Logs encontrados

Entradas novas/recentes no Drive:

| Portal | PI | Status automatico | Motivo |
| --- | --- | --- | --- |
| AFL | 25206089 | `needs_review` | `siteId` nao resolvido para `SITE A FOLHA LIVRE` |
| ROO | 25206090 | `needs_review` / `failed` | periodo incompleto em um evento; outro tentou evidencia na insercao `1415` sem `mediaUrl` |
| PNMT | 25206091 | `needs_review` | `siteId` e/ou periodo nao resolvidos |
| OMT | 41389 | `needs_review` | `siteId` nao resolvido para `Site O Matogrossense - Cuiaba, MT` |
| PERRENGUE | 14452 | `applied` no PDF | criou campanha `898` e insercao `1407`; eventos de midia isolada ficaram em `needs_review` |

Causa tecnica principal:

- O cadastro mestre de sites usa nomes curtos:
  - `AFL Digital`
  - `OMT Online`
  - `Portal NMT`
  - `ROO News`
- As PIs chegam com nomes comerciais:
  - `SITE A FOLHA LIVRE`
  - `SITE O MATOGROSSENSE`
  - `SITE PORTAL NORTE MT`
  - `SITE ROO NOTICIAS`
- O matcher atual compara `sigla`/`nome` direto e nao tinha tabela de aliases.

Causa operacional secundaria:

- Alguns eventos chegam como midia solta.
- Midia solta nao tem cliente, agencia, competencia, periodo e insercao completa.
- O runner tenta continuar em alguns casos e pode chegar na captura antes de `mediaUrl` estar sincronizada.

## Correcao aplicada no codigo

Arquivo alterado:

```text
ops/cloudflare-remote-runner/src/runner.mjs
```

Mudanca:

- adicionada funcao `normalizeSiteAlias()`;
- aliases cobertos: `AFL`, `OMT`, `PERRENGUE`, `PNMT`, `PPMT`, `ROO`;
- `resolveDrivePiEntityIds()` agora tenta resolver `siteId` pelo alias antes do matcher antigo.
- evidencia automatica nao roda mais quando `mediaUrl` esta ausente; o job fica `needs_review` com `needs_media`, sem falhar e sem apagar cadastro.
- adicionada normalizacao de competencia para dedupe (`2026-06`, `06/2026`, `Junho/2026`).
- adicionada chave canonica de formato para dedupe de insercao (`Megabanner Topo - Banner 825x120` = `Megabanner Topo 825x120`).

Validacoes executadas:

```bash
node --check ops/cloudflare-remote-runner/src/runner.mjs
pnpm --dir scripts run harness:pi-automation-v3
pnpm --dir scripts run audit:capture-rules-integrity
```

Resultados:

- `node --check`: sem erro.
- `harness:pi-automation-v3`: `ok=true`, 11 checks.
- `audit:capture-rules-integrity`: `ok=true`, `errors=0`, 9 warnings nao bloqueantes de regras nao publicadas duplicadas.

## Execucao em producao - 2026-06-02

Deploys realizados no runner VPS:

| Tag | Objetivo | Resultado |
| --- | --- | --- |
| `aliasfix-20260602055057` | Resolver alias de portal das PIs do Drive | `codigo5_adops-runner` convergiu |
| `aliasfix2-20260602055745` | Nao falhar evidencia quando `mediaUrl` esta ausente | `codigo5_adops-runner` convergiu |
| `aliasfix3-20260602061530` | Melhorar dedupe de competencia/formato | `codigo5_adops-runner` convergiu |

Estado do runner:

- `RUNNER_ID=runner-vps-1`
- `DRIVE_PI_MONITOR_ENABLED=false` no runner VPS
- monitor standalone do Drive segue separado no Mac Mini
- `OPS_JOB_KINDS` inclui `drive-pi-ingest`

Backups remotos criados antes das trocas:

```text
/etc/easypanel/projects/codigo5/adops-campanhas-portais/state/runner.mjs.before-aliasfix2-20260602055745
/etc/easypanel/projects/codigo5/adops-campanhas-portais/state/runner.mjs.before-aliasfix3-20260602061530
```

Smoke publico:

```bash
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
```

Resultado:

- `ok=true`
- job sintetico `36ca06ff-4a6c-466d-a056-1ff21a64cecd`
- `status=completed`
- `stageKey=needs_review`
- `runnerId=runner-vps-1`

## Reprocessamento das PIs novas

Eventos reais reprocessados:

| Portal | PI | Job | Status | Resultado |
| --- | --- | --- | --- | --- |
| ROO | `25206090` | `03718822-069c-4906-bb7c-96556795cf7a` | `completed / needs_review` | criou campanha `905` e insercao `1419`; sem `mediaUrl` |
| AFL | `25206089` | `07417ae5-0c71-482d-a0e3-9714b1eac7b1` | `completed / needs_review` | criou campanha `911` e insercao `1461`; sem `mediaUrl` |
| PNMT | `25206091` | `e840d44a-940b-43ba-ad52-a54e8e865e26` | `completed / needs_review` | nao aplicou; faltaram `periodoInicio` e `periodoFim` na extracao |
| OMT | `41389` | `ad5ced77-2230-4a33-853e-50e589586d5d` | `completed / needs_review` | criou insercao `1467`; sem `mediaUrl` |

Validacao adicional de dedupe OMT apos `aliasfix3`:

| PI | Job | Resultado |
| --- | --- | --- |
| `41389` | `be397e4d-ecd5-4d42-b4af-16ac1a86a7bf` | reutilizou campanha `904`, `createdInsertions=[]`, `skippedInsertions=[1418]` |

Problema identificado durante a execucao:

- Antes do `aliasfix3`, o reprocessamento gerou duplicidades pendentes sem midia:
  - ROO: `1416` e `1419` para a PI `25206090`.
  - OMT: `1418` e `1467` para a PI `41389`.
- Essas duplicidades nao foram apagadas automaticamente nesta execucao para evitar acao destrutiva sem revisao humana.

## Evidencias de 2026-06-01

Auditoria agregada:

```text
GET /api/insertions/capture-proof/audit?date=2026-06-01
```

Resultado:

- `totalEligible=2`
- `ok=2`
- `missing=0`
- `invalid=0`

Insercoes elegiveis e auditadas:

| Insercao | Portal | Campanha | PI | Status |
| --- | --- | --- | --- | --- |
| 1335 | PERRENGUE | CONCESSAO - ENERGISA | PI 490711 | `ok`, URL 200, auditoria sem issues |
| 1396 | OMT | VACINA | PI 14415 | `ok`, URL 200, auditoria sem issues |

Conclusao:

- A PI ativa do OMT que deveria gerar evidencia em `2026-06-01` apareceu e foi auditada.
- A PI que "nao apareceu" provavelmente e a nova `PI 41389`, que nao virou insercao publicada por falha de `siteId`, nao por falha de captura.
- Revalidacao em producao em 2026-06-02 confirmou:
  - `totalEligible=2`
  - `ok=2`
  - `missing=0`
  - `invalid=0`
  - OMT elegivel em `2026-06-01`: insercao `1396`, campanha `VACINA`, PI `14415`, URL 200 e auditoria sem issues.

## Plano de correcao

1. Deployar o runner com o alias fix.
2. Rodar live smoke do fluxo Drive PI.
3. Reprocessar eventos das PIs:
   - `25206089`
   - `25206090`
   - `25206091`
   - `41389`
4. Antes de aplicar, validar se cada PI tem:
   - portal resolvido;
   - periodo completo;
   - formato mapeado;
   - midia associada;
   - destino quando exigido pela PI;
   - inexistencia de campanha/insercao canonica.
5. Aplicar somente PIs completas.
6. Para cada insercao criada:
   - sincronizar `mediaUrl`;
   - conferir AdRotate;
   - limpar cache;
   - gerar evidencia do dia;
   - auditar status e visual.
7. Bloquear evento de midia solta para nao tentar captura antes de `mediaUrl`.

## Mudanca adicional recomendada

Separar o pipeline em dois estados:

```text
document_parsed -> ready_to_apply -> applied -> media_synced -> evidence_ready
```

Regra:

- `capture-insertion-proof` so pode rodar depois de `media_synced`.
- Se `mediaUrl` estiver ausente, o job deve terminar em `needs_review` com motivo claro, nao `failed`.

## Pendencias

- Corrigir/conciliar duplicidades criadas antes do `aliasfix3`:
  - ROO `1416` x `1419`;
  - OMT `1418` x `1467`;
  - avaliar OMT `1456` como rascunho separado antes de cancelar/mesclar.
- Associar `mediaUrl` real das artes do Drive/AdRotate antes de gerar evidencia das novas PIs.
- Corrigir extracao da PNMT `25206091`, que perdeu `periodoInicio`/`periodoFim` no ultimo reprocessamento.
- Melhorar progresso/timeout do job: durante pacote real, o stage ficou `queue_received` por varios minutos mesmo com o runner trabalhando.
- Reprocessar evidencia somente depois de `media_synced`; nao gerar print sem publicacao real.
