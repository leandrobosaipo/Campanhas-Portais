# Audited Retroactive Page Recovery Implementation Plan

> **Execution gate:** This document does not authorize code, API mutation, AdRotate changes, branch integration, deploy, backfill, or Cloudflare removal. Start only after explicit human approval.

**Goal:** Corrigir o fluxo retroativo existente, recuperar de forma auditada as dez evidências inválidas das inserções `#1861`, `#2712`, `#2192`, `#2296` e `#2713`, corrigir os casos PI 91159 e PI 3172, tratar os 36 avisos de regras antigas, integrar branches com segurança e inventariar recursos Cloudflare além do túnel.

**Architecture:** Preservar o caminho existente `print-backfill -> página retroativa assinada -> capture-insertion-proof -> checklist -> promoção -> relatório`. Reusar `drive-pi-preflight`, `adrotate-publish`, `print-backfill`, auditoria e relatório. Nenhum endpoint, fila, serviço, container ou dependência nova.

**Tech Stack:** Node.js ESM, TypeScript, Express, PostgreSQL/Drizzle, runner Node.js, WordPress/AdRotate, Google Drive, Cloudflare Worker/Pages/D1, OpenAPI, pnpm e `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-27-audited-retroactive-page-recovery-design.md`

## Global Constraints

- Operar em `America/Cuiaba`; persistir timestamps ISO-8601.
- Não fabricar conteúdo histórico. Sem posts reais e proveniência, retornar `blocked_historical_content`.
- Não sobrescrever nem regenerar evidência já auditada.
- Um único `jobId` por execução; acompanhar até `completed` ou `failed`; sem espera por cron.
- `approved=false` sempre contém erro estruturado.
- `bannerPublicadoNoSite=true` não substitui observação viva da mídia.
- Limite de dois executores paralelos e um proprietário por arquivo em cada onda.
- Cloudflare é somente leitura nesta entrega; qualquer retirada exige outro HITL.
- Nenhum secret aparece em comando, log, relatório ou commit.

## Onda 0 — baseline somente leitura

### Task 1: Congelar o recorte e provar a causa atual

**Owner:** coordenador. **Parallel:** pode rodar junto das Tasks 2–5. **Files:** nenhum arquivo de código; saída futura em `docs/harness-reports/retroactive-recovery/2026-08-27-baseline/`.

- [ ] Confirmar worktree limpa, HEAD e release ativo com `git status --short --branch`, `git rev-parse HEAD` e `curl -fsSL --max-time 20 https://adops.codigo5.com.br/cod5-release.json | jq '{sha,builtAt}'`.
- [ ] Consultar, sem criar jobs, `GET /api/ops/queue/overview`, `GET /api/ops/runtime-readiness` e os jobs `print-backfill`/`print-single` relacionados às cinco inserções.
- [ ] Para cada par `1861|2712|2192|2296|2713 × 2026-08-24|2026-08-25`, consultar `GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD` e registrar status, checklist, `retroContentProof`, URL antiga e erro.
- [ ] Consultar a fonte mensal e o relatório público; confirmar se o universo continua exatamente em dez pares inválidos.
- [ ] Gate: causa atual classificada como `blocked_upstream`, `blocked_historical_content`, `audit_failed` ou falha de transporte. Se o universo mudou, parar antes de qualquer mutação e atualizar o recorte.

### Task 2: Reconciliar fontes das cinco inserções

**Owner:** leitor operacional A. **Parallel:** Task 1. **Files:** nenhum.

- [ ] Consultar PI/planilha, Drive, `GET /api/insertions/{id}`, relação AdRotate e HTML público de cada inserção.
- [ ] Registrar campanha canônica, PI normalizada, período, mídia/basename, formato, grupo, slot, publicação viva e divergências.
- [ ] Não corrigir nesta onda. Gate: cada inserção tem fonte canônica e ação upstream explícita ou está pronta para reconstrução.

### Task 3: Reproduzir o contrato retroativo sem promoção

**Owner:** leitor técnico B. **Parallel:** Tasks 1–2. **Files:** nenhum.

- [ ] Executar `pnpm --dir scripts run harness:retroactive-recovery -- --mode=check --output-dir=docs/harness-reports/retroactive-recovery/2026-08-27-contract-check`.
- [ ] Traçar `POST /api/ops/jobs/print-backfill` em `artifacts/api-server/src/routes/ops.ts`, `executePrintBackfill` em `ops/cloudflare-remote-runner/src/runner.mjs` e `applyPerrengueStaticRetroPreview`/`collectRetroContentEvidence` em `scripts/src/capture-insertion-proof.cjs`.
- [ ] Reproduzir localmente o caso com fixtures, sem upload/promoção, e confirmar se o defeito é coleta vazia, página sem marcadores, assinatura, cardinalidade ou checklist.
- [ ] Gate: um teste vermelho reproduz exatamente o erro vivo antes do patch.

### Task 4: Classificar os 36 avisos de regras

**Owner:** leitor técnico C. **Parallel:** Tasks 1–3. **Files:** nenhum.

- [ ] Rodar `ADOPS_CAPTURE_RULE_AUDIT_STRICT=0 pnpm --dir scripts run audit:capture-rules-integrity` e salvar a saída redigida.
- [ ] Consultar `GET /api/capture-rules`, versões e validações; comparar com `config/adrotate-sites.json`.
- [ ] Classificar cada aviso: duplicata exata sem referência, draft referenciado, regra distinta/inativa ou conflito real.
- [ ] Gate: tabela com os 36 IDs, regra publicada relacionada, referências e ação proposta. Contagem menor ou maior vira nova baseline; não se força “36”.

### Task 5: Inventariar branches e Cloudflare

**Owner:** coordenador. **Parallel:** Tasks 1–4. **Files:** nenhum.

- [ ] Inventariar `git branch -vv --all`, `git worktree list --porcelain`, `git log --left-right --cherry-pick --oneline <canonica>...<branch>` e mudanças não commitadas. Não escolher branch canônica apenas pelo nome; cruzar com release ativo e remoto.
- [ ] Usar autenticação Cloudflare já instalada, sem mostrar token, para listar conta, Workers/rotas, Pages/domínios, D1, KV, R2, Queues, cron triggers e tunnels. Usar comandos somente de listagem do Wrangler/API oficial encontrados no ambiente; não executar `deploy`, `delete` ou mudança de configuração.
- [ ] Cruzar cada recurso com `wrangler.jsonc`, bindings, DNS/rotas e referências do repositório.
- [ ] Gate: mapa de recursos com `manter`, `migrar`, `retirar` ou `investigar`; nenhuma retirada executada.

## Onda 1 — contratos e testes compartilhados

### Task 6: Corrigir a página histórica no menor ponto comum

**Owner:** executor retro. **Serial:** começa após Tasks 1–3. **Files:** `scripts/src/capture-insertion-proof.cjs`, `scripts/src/test-perrengue-static-retro-sparse.mjs`, `scripts/src/test-capture-content-date-parser.cjs`, `scripts/src/test-cross-portal-retro-reconstruction.mjs`.

- [ ] Adicionar fixture que representa os posts reais devolvidos por `fetchPerrengueAdminRetroPosts` e exigir cartões visíveis com URL, título, data e marcadores `data-adops-retro-*`.
- [ ] Adicionar teste que reproduz `metadata_retro_content_unverified` com `editorialSamples=[]` e prova que a página corrigida produz amostras válidas, `futureCount=0` e hash de manifesto.
- [ ] Rodar os testes e confirmar FAIL antes da mudança.
- [ ] Alterar somente `applyPerrengueStaticRetroPreview` ou `collectRetroContentEvidence`, conforme a causa observada. Reusar `adminRetroPosts`, `expectedPosts`, seletores existentes e `evaluateRetroContentProof`; não criar outro renderizador.
- [ ] Preservar página assinada, `noindex`, cutoff e validação de imagens. Conteúdo insuficiente continua bloqueado.
- [ ] Rodar `node --test scripts/src/test-perrengue-static-retro-sparse.mjs scripts/src/test-capture-content-date-parser.cjs scripts/src/test-cross-portal-retro-reconstruction.mjs` e `node --check scripts/src/capture-insertion-proof.cjs`.
- [ ] Gate: teste de regressão passa; o caso vazio continua falhando fechado; nenhuma dependência nova.

### Task 7: Fechar checklist e promoção sem afrouxar auditoria

**Owner:** executor auditoria. **Parallel:** somente se não tocar arquivos da Task 6. **Files:** `artifacts/api-server/src/lib/capture-audit.ts`, `artifacts/api-server/src/lib/audit-checklist.ts`, `artifacts/api-server/src/routes/insertions.ts`, `scripts/src/test-capture-provenance-flow.ts`, `scripts/src/test-capture-audit-immutability.ts`.

- [ ] Criar teste do metadata reproduzido para `#2713`: `pre_upload` aprova quando só restam gates pós-upload; `final` bloqueia sem artefato/proveniência persistidos.
- [ ] Criar teste que proíbe `approved=false` com `blockingIssues=[]`.
- [ ] Criar teste de imutabilidade: evidência auditada anterior não muda URL nem metadata.
- [ ] Se os testes já passarem, não alterar código. Se falharem, corrigir o cálculo compartilhado do checklist, não cada caller.
- [ ] Rodar `pnpm --dir scripts exec tsx --test src/test-capture-provenance-flow.ts src/test-capture-audit-immutability.ts`.
- [ ] Gate: auditoria final continua fechada e toda reprovação explica a causa.

### Task 8: Garantir backfill finito, isolado e idempotente

**Owner:** executor runner. **Serial:** depois das Tasks 6–7. **Files:** `artifacts/api-server/src/routes/ops.ts`, `ops/cloudflare-remote-runner/src/runner.mjs`, `scripts/src/test-retroactive-recovery-contract.mjs`, `scripts/src/test-runner-async-capture-contract.mjs`, `scripts/src/test-harness-retroactive-recovery.mjs`.

- [ ] Testar: uma falha não interrompe outro par; existente auditada vira `skipped_existing`; bloqueio upstream vira `blocked_upstream`; reconstrução insegura vira `blocked_reconstruction`.
- [ ] Testar duplicação do mesmo request: a chave existente retorna o mesmo job, sem concorrente.
- [ ] Testar que o pai termina `failed` com resultados parciais quando algum item falha e `completed` somente com auditoria completa.
- [ ] Confirmar FAIL antes de qualquer patch. Alterar apenas `executePrintBackfill` e o agregador já existente se necessário; não criar scheduler ou retry externo.
- [ ] Rodar `node --test scripts/src/test-retroactive-recovery-contract.mjs scripts/src/test-runner-async-capture-contract.mjs scripts/src/test-harness-retroactive-recovery.mjs` e `node --check ops/cloudflare-remote-runner/src/runner.mjs`.
- [ ] Gate: um POST, um `jobId`, timeout finito, estados terminais por par.

## Onda 2 — identidade e saúde operacional

### Task 9: Verificar e completar as prevenções já planejadas

**Owner:** executor identidade. **Parallel:** Task 10. **Files:** `artifacts/api-server/src/lib/campaign-operations-matching.ts`, `artifacts/api-server/src/lib/campaign-operations.ts`, `scripts/src/sync-planilha-latest.ts`, `scripts/src/reconcile-planilha-adrotate.ts`, `scripts/src/test-campaign-operations-match-ranking.ts`, `scripts/src/test-publication-health.ts`, `scripts/src/test-sync-planilha-identity.mjs`.

- [ ] Rodar primeiro os testes existentes. Não reimplementar contrato que já estiver correto.
- [ ] Exigir que `91159` e `PI 91159 - PREF PVA` gerem a mesma PI normalizada.
- [ ] Exigir unicidade por PI normalizada + portal + formato + período antes de criar campanha/inserção.
- [ ] Exigir `blocked_upstream` quando evidência antiga está aprovada, mas a mídia atual não é observada.
- [ ] Se falhar, corrigir o helper compartilhado já existente e seus callers; sem nova camada.
- [ ] Rodar `pnpm --dir scripts exec tsx --test src/test-campaign-operations-match-ranking.ts src/test-publication-health.ts` e `node --test scripts/src/test-sync-planilha-identity.mjs`.
- [ ] Gate: identidade e saúde de publicação independem do histórico de prints.

### Task 10: Detectar mídia/publicação antes da captura

**Owner:** executor prevenção. **Parallel:** Task 9. **Files:** `ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs`, `ops/shared/daily-print-candidates.mjs`, `scripts/src/test-publication-reconcile-policy.mjs`, `scripts/src/test-daily-print-status.mjs`.

- [ ] Testar PI 3172: MP4 presente no Drive e `mediaUrl=null` gera pendência preventiva antes do período.
- [ ] Testar que o scheduler não cria captura enquanto `publicationHealth.status=blocked_upstream`.
- [ ] Testar que, depois da confirmação viva, `print-backfill` recebe somente datas faltantes.
- [ ] Se necessário, ajustar apenas a política existente para usar `drive-pi-preflight` e `adrotate-publish` antes de liberar candidato diário.
- [ ] Rodar `node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs`.
- [ ] Gate: inserção bloqueada permanece visível e informa motivo/ação; nenhum print prematuro.

## Onda 3 — regras, relatório, alertas, OpenAPI e harness

### Task 11: Limpar regras antigas de forma recuperável

**Owner:** coordenador operacional. **Serial:** após Task 4 e antes de qualquer backfill. **Files:** `config/adrotate-sites.json` somente se houver divergência comprovada; relatório em `docs/harness-reports/capture-rules/2026-08-27/`.

- [ ] Exportar JSON completo das regras, versões e validações antes de mutar; calcular SHA-256 do backup.
- [ ] Desativar drafts distintos ou referenciados via `PATCH /api/capture-rules/{ruleId}` com `enabled=false`; não há endpoint de delete no contrato atual, portanto não inventar remoção física.
- [ ] Para duplicatas exatas sem referência, mantê-las desativadas e registrar candidata a retirada futura. Publicadas nunca são editadas diretamente.
- [ ] Rodar `pnpm --dir scripts run audit:capture-rules-integrity`.
- [ ] Gate: zero erro; avisos restantes individualmente justificados. Se o script ainda contar drafts desativados como aviso, corrigir `auditNonPublishedRules` para ignorar somente `enabled=false`, com teste pequeno; não apagar histórico para zerar contador.

### Task 12: Expor incidente sem confundir publicação e evidência

**Owner:** executor relatório. **Parallel:** Task 13. **Files:** `scripts/src/monthly-evidence-contract.mjs`, `scripts/src/build-current-month-evidence-report.mjs`, `scripts/src/test-monthly-evidence-contract.mjs`, `scripts/src/test-monthly-report-target-evidences.mjs`.

- [ ] Testar campanha com prints antigos aprovados e mídia atual não observada: relatório mostra `blocked_upstream`, não `ok`.
- [ ] Testar inserção não publicada: continua listada com motivo e ação; não vira print faltante cobrável.
- [ ] Testar incidente retroativo com último job, estado, IDs e causa; consumir estado da API.
- [ ] Alterar somente o contrato mensal e renderizador existentes se os testes falharem.
- [ ] Rodar `node --test scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-target-evidences.mjs scripts/src/test-monthly-report-incremental-refresh.mjs`.
- [ ] Gate: saúde de publicação e saúde de evidência aparecem separadas.

### Task 13: Atualizar contratos e harness finito

**Owner:** executor documentação/API. **Parallel:** Task 12. **Files:** `ops/fastapi-docs/main.py`, `ops/fastapi-docs/test_openapi.py`, `docs/prints-retroativos.md`, `docs/adops/retroactive-recovery-harness.md`, `docs/adops/ops-api-runbook.md`, `scripts/src/harness-retroactive-recovery.mjs` somente se teste falhar.

- [ ] Documentar `POST /api/ops/jobs/print-backfill`, idempotência, estados por item, página assinada, proveniência e promoção.
- [ ] Documentar execução finita `check -> execute -> verify`, sempre sobre o mesmo `jobId`; remover qualquer orientação de aguardar cron.
- [ ] Testar `check` sem POST, `execute` com recorte explícito e `verify` exigindo `audited`, URL, miniatura, modal e download.
- [ ] Rodar `node --test scripts/src/test-harness-retroactive-recovery.mjs` e `python ops/fastapi-docs/test_openapi.py` pelo ambiente documentado no repositório.
- [ ] Gate: OpenAPI, runner, harness e runbook usam os mesmos nomes e estados.

## Onda 4 — integração, deploy e operação real

### Task 14: Integrar branches em worktree limpa

**Owner:** coordenador. **Serial. Files:** nenhum arquivo fora dos commits aprovados.

- [ ] Determinar branch canônica pelo release ativo, remoto e documentação local.
- [ ] Criar worktree limpa da base correta; aplicar somente commits desta entrega e commits implantados ainda ausentes, usando cherry-pick em ordem causal.
- [ ] Resolver conflito por conteúdo, nunca com escolha ampla “ours/theirs”. Rodar `git diff --check`, testes da onda afetada e revisar `git diff <base>...HEAD`.
- [ ] Não usar `force-push`, reset destrutivo nem incluir worktree suja.
- [ ] Gate: histórico linear/rastreável, diff autorizado e rollback por commit.

### Task 15: Quality gates e deploy isolado

**Owner:** coordenador. **Serial. Files:** somente arquivos alterados nas Tasks 6–13.

- [ ] Rodar `node --check scripts/src/capture-insertion-proof.cjs`.
- [ ] Rodar `pnpm --dir scripts run audit:capture-rules-integrity`.
- [ ] Rodar todos os testes listados nas Tasks 6–13.
- [ ] Rodar `pnpm --filter @workspace/api-server run build` e `pnpm --filter @workspace/adops run build`.
- [ ] Confirmar lockfile sem mudança e `git diff --check`.
- [ ] Fazer backup/rollback conforme runbook e deploy pelo script canônico: `ADOPS_IMAGE_TAG="$(git rev-parse HEAD)" ADOPS_RELEASE_SHA="$(git rev-parse HEAD)" bash ops/portainer/adops-stack/scripts/deploy-production.sh`.
- [ ] Confirmar `cod5-release.json`, containers `adops-api`, `adops-runner`, `adops-runner-print-single`, `adops-web`, heartbeats e fila.
- [ ] Gate: SHA público igual ao commit implantado e runtime saudável. Build local sozinho não aprova.

### Task 16: Corrigir PI 91159 sem tocar nos prints auditados

**Owner:** coordenador operacional. **Serial.**

- [ ] Rodar `drive-pi-preflight`/reconciliação em modo leitura para `91159`, confirmar `#2693` como canônica e mapear `#2714` e `#2779`.
- [ ] Corrigir publicação pelo job existente `adrotate-publish` somente para `#2693`; acompanhar o mesmo `jobId`.
- [ ] Confirmar mídia esperada viva no grupo `14`, `exactLiveMatches` único, HTML público e relação AdOps/AdRotate.
- [ ] Desativar/reconciliar duplicidades somente após provar que não têm mídia nem referências; preservar backup.
- [ ] Reconsultar 21/08 a 26/08 e provar que URLs auditadas não mudaram.
- [ ] Gate: publicação viva canônica; zero regeneração de evidência auditada.

### Task 17: Publicar PI 3172 e gerar três retroativos

**Owner:** coordenador operacional. **Serial após Task 16.**

- [ ] Executar `drive-pi-preflight` para `#2645`; confirmar `SANEAR ESTIAGEM_V03.mp4`, formato `VIDEO`, período e grupo `6`.
- [ ] Executar `adrotate-publish`; acompanhar o mesmo `jobId` até terminal.
- [ ] Confirmar vídeo vivo no grupo `6`, mediaUrl no AdOps e renderização pública antes do backfill.
- [ ] Criar um `print-backfill` para `#2645`, `fromDate=2026-08-24`, `toDate=2026-08-26`; acompanhar o mesmo `jobId`.
- [ ] Validar cada data: `audited`, checklist aprovado, slot, frame real do vídeo, URL, miniatura, modal e download.
- [ ] Gate: três datas auditadas ou bloqueio explícito; nenhum print antes da publicação.

### Task 18: Recuperar os dez pares inválidos

**Owner:** coordenador operacional. **Serial por lote; no máximo dois jobs simultâneos.**

- [ ] Para cada inserção, corrigir primeiro qualquer divergência upstream encontrada na Task 2 usando fluxo existente.
- [ ] Lote 1: `#1861` e `#2712`; um `print-backfill` por inserção, 24/08 a 25/08.
- [ ] Lote 2: `#2192` e `#2296`; mesma regra.
- [ ] Lote 3: `#2713`; mesma regra.
- [ ] Acompanhar cada `jobId` até terminal. Em falha, registrar erro e corrigir só a causa observada antes de uma reexecução idempotente.
- [ ] Validar os dez pares por `capture-proof/status`: `audited`, checklist aprovado, `retroContentProof.status=approved`, `futureCount=0`, hash válido, mídia/slot/data/domínio/hora visíveis e URL acessível.
- [ ] Gate: dez pares auditados ou bloqueados individualmente com causa; nenhuma pendência silenciosa.

### Task 19: Atualizar consumidor real e encerrar

**Owner:** coordenador. **Serial.**

- [ ] Criar o job existente `evidence-monthly-report` para agosto/2026 e acompanhar até terminal.
- [ ] Validar HTML público, `data.json`, miniaturas, modal, download e filtros `evidence=invalid` e `evidence=missing`.
- [ ] Rodar o harness em `verify` para `#2645` e as cinco inserções recuperadas; salvar resultados redigidos.
- [ ] Publicar o inventário Cloudflare somente como relatório. Não remover recurso.
- [ ] Registrar SHA, jobs, URLs, regras antes/depois, branches integradas, riscos restantes e rollback.
- [ ] Gate final: consumidor real coerente, jobs terminais, worktree limpa e nenhum monitor recorrente criado.

## Ordem de commits

1. `test(adops): reproduce audited retro page failure`
2. `fix(adops): preserve historical editorial proof`
3. `test(adops): lock checklist and backfill contracts`
4. `fix(adops): isolate retroactive backfill items` somente se necessário
5. `fix(adops): reconcile normalized PI publication health` somente se necessário
6. `fix(adops): retire inactive capture-rule warnings` somente se necessário
7. `docs(adops): document finite audited recovery`

Cada commit passa pelos testes da própria fatia. O deploy usa somente a sequência aprovada.

## Stop conditions

- Fonte histórica não verificável.
- Mídia, PI, período, grupo ou inserção canônica ambíguos.
- Branch canônica não comprovável ou conflito material.
- Backup de regras indisponível.
- Release/runner sem readback saudável.
- Qualquer ação de retirada Cloudflare.

Nesses casos, parar a etapa afetada e apresentar evidência + alternativas. As demais etapas independentes podem continuar somente dentro do escopo aprovado.
