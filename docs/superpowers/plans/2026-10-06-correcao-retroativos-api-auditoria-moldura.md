# Correção de retroativos, auditoria e moldura — Implementation Plan

> Para workers: usar subagent-driven-development, uma tarefa de implementação por vez, com revisão de contrato e qualidade. Não criar subagentes adicionais. Ler o brief próprio e registrar arquivos/testes/resultados.

**Goal:** Produzir novas reconstruções com os dois relógios retroativos, proveniência real preservada, leitura mensal final correta e moldura legível; corrigir o conjunto autorizado por API e publicar main com backup/readback.

**Architecture:** Base operacional limpa e11c7cc37a27f0787fdead8381d32f06c1b17acc. Contrato aditivo de proveniência v4 reutiliza requestedCaptureAt e preserva v2/v3; componentes existentes de auditoria/candidato/mensal recebem pequenas correções. Sem migração destrutiva, biblioteca nova ou mudança de autenticação.

**Tech Stack:** Node/Express/TypeScript, Drizzle/PostgreSQL, CJS capturer/Playwright/Pillow, MJS geradores e testes, OpenAPI FastAPI, pnpm workspace, Portainer via runbook existente.

**Spec:** docs/adops/retroactive-proof-v4/{prd,spec,harness}.md.

## Estado atual — 07/10/2026

**Checkpoint do consumidor de 07/10 às10:32 UTC:30/237 confirmadas;207 restantes.** Main606cf05b70ee076bc613ef4d7bb5529f2d9c0b61 publicada pelo PR118, CI37601313114/37601935185 e backup/restauração/readback integral conferidos às10:08:36 UTC. Recibo privado `release-final-native-final-stage-retry1.json`. Restam170 pares não-vídeo liberados,28 de vídeo bloqueados pelo canário posterior e9 de #1944 bloqueados por identidade no consumidor. Os26 pares protegidos1826/1860 ficam fora dos237 operáveis. AFL1842/22–25Aug passou auditoria/revisão individual, promoção com original arquivado, hash/status e quatro miniaturas/modais conferidos. Recibo `checkpoint-30-confirmed.json`. As tarefas abaixo conservam registros anteriores; publicação de código não encerra o lote.

Worktree atual: `/Users/leandrobosaipo/.codex/worktrees/adops-roo-legacy-position-20261007/AdOps`, branch `codex/adops-native-progress-threshold-20261007`; checkout original preservado.

### Task 16: Corrigir causas dos três canários d1

**Owner:** Luna implementa pequenas alterações seriais no capturer/focais; Sol reproduz e revisa; root atualiza docs, integra, publica e opera. Sem nova dependência ou redução da auditoria.

1. [x] AFL: conservar ID numérico da resposta WP; regressão usa fetch padrão/REST bruto/collector, com RED→GREEN e ID69702 real.
2. [x] ROO: reconhecer somente espaços e zero/um comentário literal conhecido de AdRotate no perfil desktop-top-1. Preservar nós, rejeitar texto/comentários/elementos/âncoras inválidos; RED→GREEN.
3. [x] VIDEO: dois passes do lock devem marcar ativo com valor `1`, removendo atributo dos inativos. Comparação pareada readonly confirmou causa; focal real conserva negativos de oclusão/ROI e siblings inativos.
4. [x] Sol repetiu os três focais e aprovou os patches; sintaxe e diff-check passaram. Atualizar SPEC/HARNESS/PRD/manual com causa, escopo e estado real.
5. [x] CI do SHA exato, merge main, nova publicação com dump/restauração/rollback/readback e quatro serviços/fonte/JavaScript/OpenAPI (PR117/04cd).
6. [ ] Repetidos os três canários: AFL e ROO conferidos e promovidos; VIDEO completou PNG mas registro409 por fechamento antecipado de slot_captured. Sem promoção; seguir Task17.
7. [ ] Retomar os demais pares em grupos de até quatro, mantendo gates individuais. Checkpoint só cresce após entrega conferida; unknown e duplicidades sem fonte permanecem preservados.

### Task 17: Fechar a captura depois da recaptura final nativa

**Owner:** Luna possui capturer/teste focal; Sol revisa e qualifica helper privado de repetição; root possui docs/Git/publicação/API/consumidor. Sem dependências novas.

1. [x] Diagnóstico Sol: job1791363572087-igd8ad completou PNG, mas capturedAt=09:00:07.378Z ultrapassou slot_captured.finishedAt=09:00:05.307Z. Validator real11/12, diferença2071ms; nenhum candidato registrado. Preservar job/artifact/canônico.
2. [x] Luna moveu o mesmo finish da etapa para após a última screenshot/medição e antes de final_composed. Não alterar relógios, policy ou validator.
3. [x] Regressão RED→GREEN no teste existente: ordem das chamadas e recusa/aceite do mesmo instante real conforme janela da etapa. Focal5/5, nativo10, syntax/diff-check aprovados por Luna.
4. [x] Revisão independente Sol; typecheck com runtime existente; documentação consistente. CI37599924758 passou no commit650bcebe; a proteção operacional/qualificação adicionadas depois exigem CI do novo SHA.
5. [x] Opt-in privado separado --supersede-provenance-blocked qualificado:87 checks offline, erro409/diagnóstico exatos, tuple/release/referência/bytes/hash/lista completa sem candidato e sem aprovação/promoção; canonicalCAS. Decisão root registration_provenance_blocked preserva timestamps/job/artefatos, sem rejeição visual fictícia.
6. [x] PR118/CI37601313114 e mainCI37601935185 do606 exato; publicação com backup/restauração/readback integral. A primeira tentativa parou antes de trocar fonte/stack por identificação incorreta do processo pausado; retomada com namespace novo e parser revisado31checks. Sem repetir PUT após timeout. Não publicar enquanto houver captura ativa.
7. [ ] Novo canário VIDEO, auditoria final, revisão individual, promoção/archive/hash/status/miniatura/modal. Só então aumentar a contagem.
8. [ ] Continuar somente os237 pares operáveis:26confirmados/211restantes. Inventário263 também inclui26 protegidos, preservados. Pacotes PI/portal somente pela API assíncrona. PI textual “PI - TCE” depende da escolha solicitada ao usuário; não inventar número.

### Task 18: Excluir inserções arquivadas/substituídas da execução

**Owner:** Sol qualifica IDs/agenda; Luna protege capturador/teste existente; root protege operador privado, docs/Git/publicação/consumidor. Nenhuma remoção ou transferência de provas.

1. [x] Qualificação53/53 GETs,0unknown/failed/mismatch de campanha/site/período/formato.237pares operáveis =26confirmados+211restantes (183 não-vídeo/28 vídeo).26protegidos:1826→1841 com12pares,1860→2192 com14; nenhuma entrega confirmada afetada.
2. [x] Registrar exceção: quatro PNGs1826/01–04Aug promovidos antes da qualificação; originais/archive/hash preservados, não contam como consumidor. Relatório corretamente mostra1841. Não declarar1860 duplicidade idêntica: sucessora difere em mídia/formato/identityKey.
3. [x] Guard privado compartilhado antes de preparo/captura exige archivedAt=null e supersededByInsertionId=null. Positivo e negativos de arquivamento/vínculo/campos ausentes passaram; supersession87/87 segue passando.
4. [x] Guard no main comum após fetchInsertion e antes de mapping/browser/mídia recusa qualquer marcador de arquivo/substituição; DTO antigo sem campos compatível. Teste RED→GREEN no harness existente; focal6/6 e contrato candidato aprovados. Typecheck/syntax/diff-check aprovados pelo root; revisão independente Sol aprovada.
5. [x] CI/integração/publicação606 junto com Task17. Agenda com identidade/hash/readback do consumidor mantém refs literais/IDs e grupos≤4, sem targets protegidos;9pares1944 também retidos. NovoVIDEOcanário ainda bloqueado, seguir Task19 antes dos28 pares de vídeo.

### Task 19: Alinhar o limiar nativo do vídeo com a auditoria

**Owner:** Luna possui capturer/teste existente; Sol revisa e qualifica repetição privada; root possui docs/Git/publicação/API/consumidor. Não reduzir exigências da API nem alterar metadata já registrada.

1. [x] Canário606 #3064/01Oct job1791367753908-7m0esk: proveniência12/12, estágio final correto, controles nativos/pixels aprovados com score1.0. Candidatof0c33dbd-4b60-4d5e-96a6-1ef8f084dc46 bloqueado porque minSimilarity0.48 herdado do slot é inferior ao mínimo0.82 da auditoria nativa. Original preservado; nenhuma promoção.
2. [x] Aplicar piso0.82 no comparador final nativo compartilhado, preservar valor maior configurado e manter comparação genérica do slot0.48 independente. Patch mínimo, sem dependência.
3. [x] Regressão RED→GREEN existente: configuração0.48 resulta0.82, configuração0.91 preservada, ROI adulterada continua recusada.10 cenários nativos passaram; revisão independente Sol aprovada.
4. [x] Repetição privada separada --supersede-audit-policy-blocked:133 checks offline, auditoria final/códigos exatos, PNG/metadata/proveniência/job/candidato/CAS e ausência de promoção. Exigir revisão da fonte vinculada à nova SHA publicada. Não reescrever o candidato606 nem criar rejeição visual fictícia.
5. [ ] Commit/PR/CI do SHA exato/main, nova publicação com backup/restauração/rollback/readback dos quatro serviços, fonte, asset e OpenAPI. Nenhuma captura/promoção ativa durante publicação.
6. [ ] Novo canário3064 com referência histórica, auditoria final sem issues, revisão individual, promoção com arquivo preservado, hash/status e miniatura/modal no consumidor. Só então liberar os demais vídeos e contar a entrega.
7. [ ] Continuar lotes não-vídeo≤4 e pacotes finais PI/portal pela API assíncrona. #1944 permanece pendente da fonte/decisão; não inventar PI nem transferir evidências.

## Global Constraints

- Worktree: /Users/leandrobosaipo/.codex/worktrees/adops-retroativos-20261006/AdOps; branch codex/adops-retroativos-20261006. Não editar checkout original com 161 alterações.
- User confirmou contrato temporal e assets oficiais abertos com Selawik existente; não copiar assets proprietários nem afirmar fonte Windows original.
- Root possui inventário vivo, backup, integração final, commits/main e deploy. Sol possui plano/docs/ledger/revisões. Luna executa tarefas pequenas 1–5 serialmente, preservando alterações de outros.
- Não operar banco/storage por fora para corrigir evidências; promoção/restore API e readback obrigatório. Não alterar PI, planilha, AdRotate, daily scheduler ou aprovar sem hash.
- Capturas diárias/legadas não são reclassificadas. Ausência de prova permanece bloqueada; nenhuma aceitação inferida de URL/status HTTP.
- Antes de escrever código executar baseline proporcional; reutilizar lockfile offline sem nova dependência.

## Review Focus

Identidade correta da metadata final; negação por hash/job/data; v2/v3 e daily invariantes; timezone Cuiabá; v4 sem instante real falso; PNG sem selo; filtro mensal/contagens; ausência de secrets/DOM; inventário paginado; SHA e rollback/restauração verificáveis.

### Task 1: API e auditoria do contrato temporal v4

**Owner:** Luna; revisão Sol. **Modify:** artifacts/api-server/src/lib/capture-audit.ts, artifacts/api-server/src/routes/audit-checklists.ts, artifacts/api-server/src/lib/capture-proof-candidate-provenance.mjs. **Test:** scripts/src/test-preupload-reconstruction-clock.ts, scripts/src/test-capture-proof-candidates.ts, teste de auditoria atual scripts/src/test-capture-provenance-flow.ts ou novo teste específico.

**Consumes:** metadata/source job reais, contrato v4 do SPEC. **Produces:** auditoria e candidato v4 compatíveis, versões antigas intactas.

- [x] Baseline dos testes relevantes; adicionar casos v4 aprovando referência histórica e rejeitando SO real distante/instante de criação falso. Falha anterior demonstrada por Luna.
- [x] Reconhecer version4 sem alterar a interpretação v2/v3. expectedDesktopAt para v4=requestedCaptureAt; reconstructedAt mantém correlação real/recência/estágio. Outros gates preservados.
- [x] Candidate validator aceita v3 ou v4 com mesmas exigências de identity/hash/readback/aprovação.
- [x] Rodar testes:28/28, buildAPI e diff-check. Sol revisou contrato/qualidade, incluindo testeFINAL e fixturev2 intacta. Sem commit/deploy.

### Task 2: Mensal usando prova final correlacionada

**Owner:** Luna; revisão Sol. **Modify:** artifacts/api-server/src/lib/monthly-evidence-report-query.ts, artifacts/api-server/src/lib/audit-checklist.ts, artifacts/api-server/src/lib/capture-proof-candidate-promotion.ts, artifacts/api-server/src/routes/insertions.ts; helper puro de metadata final correlacionada somente se necessário. **Test:** scripts/src/test-monthly-report-query.ts, scripts/src/test-capture-candidate-promotion.integration.ts e teste específico novo de metadata final correlacionada sem DB.

**Consumes:** evidência canônica/log/job/promoção; Task1 estável. **Produces:** mensal/status consistentes, origem/data real preservadas.

- [x] Reproduzir #3047: mesma URL, final approved e preliminary antigo; testar missing/preliminary, legacy e divergência de insertion/date/job/hash.
- [x] Causa confirmada na base: capture-proof-candidate-promotion.ts insere metadata do candidato e atualiza finalLog somente status/updatedAt após finalAudit; metadata preliminar fica antiga. Persistido snapshot final no log das novas promoções. Para log antigo, helper resolve checklist final somente de promotion.status=approved com finalLogId, insertionId, targetDate, sourceJobId, URL, hash/bytes e candidato correlacionados. Receipts em batch na mensal e função compartilhada com loader; nenhuma escrita de legado por leitura.
- [x] Receipt como overlay opcional, runner histórico correto/readback awaiting_readback preservados. Mensal seleciona evidence canônica; requestedCaptureAt raw string|null seguro inclui referência Cuiabá sem offset; mesma identidade final do status. Nenhum aceite inferido de URL.
- [x] Testes 57/57, API build e typecheck passaram; revisão Sol aprovada. Root validou integração inicial 11/11 e final promoção+registro 17/17, zero skips, em PostgreSQL isolado com SQL oficial completo (FKs, checks e triggers). O preparo Drizzle parcial foi corrigido na fixture local e no CI. Sem deploy nesta etapa.

### Task 3: Capturer v4 e PNG sem carimbo

**Owner:** Luna; revisão Sol. **Modify:** scripts/src/capture-insertion-proof.cjs; scripts/src/pixel-date-proof.cjs somente para reutilizar ADOPS_CAPTURE_PYTHON no hashImageRegion se necessário. **Test:** scripts/src/test-historical-reconstruction-frame.mjs, scripts/src/test-retro-content-time.mjs, scripts/src/test-pixel-date-proof.mjs e teste específico necessário.

**Consumes:** Task1 v4; **Produces:** reconstruction.provenanceVersion4, ambos relógios requestedCaptureAt, capturedAt/reconstructedAt reais, sem carimbo.

- [x] Adicionar teste comportamental com referência e criação separadas por dias; preservar testes v3 e v2.
- [x] Alterar somente geração de NOVA reconstruction para v4 e clock de apresentação; manter campos reais e gate editorial, inclusive handshake de preview v2.
- [x] Validar pixels/dimensões e que faixa/rodapé não são adicionados; hashImageRegion existente respeita ADOPS_CAPTURE_PYTHON. Node checks, histórico/retro-content/pixel PASS, gate 41/41 com zero erros e dois avisos baseline. Sem novas dependências.
- [x] Revisão Sol aprovada após remover asserts que espelhavam source. Rerun visual com Pillow PASS; kit ainda v4, Task5 gera v5. Sem captura real ou produção.

### Task 4: Inventário retroativo compacto e contrato API

**Owner:** Luna; revisão Sol. **Modify:** artifacts/api-server/src/routes/insertions.ts, helper puro existente ou arquivo próximo somente se necessário, ops/fastapi-docs/main.py. **Test:** scripts/src/test-ops-openapi-contract.ts, ops/fastapi-docs/test_openapi.py e teste paginado novo.

**Consumes:** queries e auth existentes; **Produces:** GET somente leitura limitado, aprovado e pendente, sem enrich global/DOM/secrets.

- [x] Reutilizar GET /api/insertions/capture-proof/audit?scope=historical_inventory&limit=50&cursor=<id>, com branch compacta antes da auditoria global; max200 e cursor determinístico int4. A rota antiga sem scope continua igual. Inclui históricos aprovados e origens desconhecidas/undated por ID, sem inferência UTC.
- [x] Parser/helper 4/4 e SQL real isolado 1/1 abrangente passaram: limite, canônico/tie, receipt aprovado/data divergente, booleano malformado, daily excluído e página filtrada vazia com cursor. Sem auditoria global por item; cleanup por IDs exatos transacional e trigger habilitado verificado.
- [x] Projeção compacta de identidade/versões/URL/status/data real/nextCursor implementada. Sem modificar dados ou disparar jobs no endpoint.
- [x] OpenAPI revisado: candidate promote=false; jobs202/200/409, id path preservado e header de chave, captureAt/reason opcional, candidateId UUID e registro/review201/200/409. Mensal requestedCaptureAt local e capturedAt real; auditoria 200 distingue legado/inventory. Catálogo v4, Python/TS contracts, auth12, build/typecheck PASS. Revisão Sol aprovada; Task5 liberada.

### Task 5: Moldura v5 e assets proporcionais

**Owner:** Luna; revisão visual Sol+root. **Modify:** scripts/src/build-windows-frame-kit.mjs, scripts/src/capture-insertion-proof.cjs, scripts/assets/desktop-frame/windows11-chrome-light/ e helper/checklist de versão existente se necessário. **Test:** scripts/src/test-windows-frame-template.mjs, scripts/src/test-reference-frame-dom-contract.mjs, scripts/src/harness-prints-windows-frame-v4.mjs (compatibilidade) e teste v5.

**Consumes:** Task3 estável e decisão de assets do usuário; **Produces:** kit v5, v4 ainda aceito, PNG legível na resolução final.

- [x] Assets abertos e Selawik autorizados; créditos ISC/Expat/OFL locais, sem afirmar fonte Segoe ou screenshot nativo. Nenhuma dependência nova.
- [x] Kit v5 reconstruído, tema explícito, v4 preservado. Dock central sem estado de apps aberto; clocks em duas linhas, sem clima/perfil/abas/favoritos fictícios. Tune no início do omnibox, estrela no fim interno, puzzle/menu à direita e close X. Rasterizador apenas no build offline; runtime usa Pillow.
- [x] Favicon observado no DOM, origem registrada, sem derivar da marca horizontal. Same-origin e CDN HTTPS exata de Perrengue validada pelo domínio configurado; fetch sem cookies/auth, timeout 3 s, limite 1 MiB e 512×512. Host arbitrário, redirect, tipo/tamanho inválidos recusados; fallback permanece bloqueado. GET real público no Chromium passou, confirmado independentemente por Sol.
- [x] PNGs preparados em 1280/1660/3320 sem ampliação da base pequena; testes de metadata/dimensões/clocks/pixels e compatibilidade aprovados. Slot/checklist preservados.
- [x] Sol/root aprovaram as três prévias sintéticas finais. Sol repetiu favicon e frame-v5: PASS; node-check/diff-check PASS. Luna validou histórico/template/DOM/pixel/retro/harness e regras; root builds API/painel PASS. Publicação permanece na Task7.

### Task 6: Gerador, documentos e integração local

**Owner:** Sol (docs); root (gerador e integração); Luna somente tarefa pequena explícita se pedida. **Modify:** scripts/src/build-dynamic-evidence-report.mjs, docs/prints-retroativos.md, docs/spec-prints-moldura-windows-v4.md, docs/status-do-projeto.md, docs/adops/reconstruction-technical-policy.md, docs/adops/retroactive-proof-v4/{prd,spec,harness}.md e docs/adops/evidence-monthly-report/{prd,spec,harness}.md onde aplicável. **Test:** teste isolado de relatório candidato e regressões mensais/export existentes.

**Consumes:** Tasks1–5 e evidência de teste; **Produces:** contrato inequívoco e gerador durável.

- [x] Portar somente correções revisadas do relatório: thumb por technicalStatus, aviso origem, promote=false, término aguardando revisão, HTTP erro claro e captura/data real disponíveis. Jobs comuns omitem reconstructionReason especial sem fonte de publicação tardia; canário preserva captureAt original. Sol rerun do teste VM sob UTC/NewYork PASS.
- [x] Documentar versão4 e precedência sobre instrução antiga; preservar histórico v2/v3 e significado de historicalDisplayConfirmed=false. PRD/SPEC/HARNESS do mensal linkam novo consumidor API+UI; snapshots antigos ficam como registros históricos.
- [x] Revisão local concluída: builds API/painel e typecheck completo passaram; API 49/49, consumidor 69/69, PostgreSQL isolado final 18/18 sem skips com SQL oficial. OpenAPI Python/TS e regras 41/41 passaram. Manifest exclui outputs privados e caches; release e consumer readback vivo permanecem na Task7.
- [x] Commit revisado `06bd3cc`, PR111/CI aprovados e main integrada como `39ff4a1b38a8ec21e5eefb5495e12f23a23d0997`; original dirty preservado. Hotfix posterior tem gates próprios na Task9.

### Task 7: Release, recuperação via API e consumer readback

**Owner:** root; revisão de evidência Sol. **Files:** manifests/backups/receipts de execução em outputs e docs/harness-reports próprios, sem secrets.

**Consumes:** SHA aprovado, inventário paginado, backup/restauração; **Produces:** main publicada e evidências corrigidas conferidas pelo consumidor.

- [x] Guardar SHA/volumes/HTML/hash, dump oficial e restauração completa comprovada; gates/build/CI de main39 aprovados. Timeout do polling não cancelou o backup; continuação revisada reutilizou a mesma prova após rollback, sem repetir dump/restore.
- [x] Publicar main39 em API/runner/painel/assets e conferir SHA/mounts/health. Relatório canônico publicado com backup/hash. Recibos privados `release-final39.json` e `report-deploy-receipt.json`.
- [ ] Inventário completo por API; canário candidato→audit→approval→promote→readback da mesma data/hash. Não repetir delivery_unknown.
- [ ] Após Task8 e canário executar serialmente os alvos retroativos errados autorizados, preservando originais e registro de rollback. Usar replaceHistoricalPresentation com identidade/hash/bytes esperados; nunca invalidar/delete aprovado para substituir. Sem regenerar rotina do dia ou correto já aprovado.
- [ ] Conferir API status/mensal, abrir PNG e relatório canônico, fonte/data real e os dois relógios. Pacote final só via API assíncrona obrigatória se solicitado.
- [x] Integrar main39 validada e conferir publicação da release; o aceite das evidências continua pendente. Se falhar, volumes+HTML anteriores; compensação automática cobre falha de promote. Rollback de aprovado usa PATCH /api/evidences/{id} com ponteiro/tipo/titulo originais, após checkcanônico+hash/bytes do original intacto e readback final; não inventar restoreAPI dedicada.

Inventário terminado em 17 páginas: 263 históricos fora do par v4/v5 (snapshot persistido: 250 pendentes, 13 aprovados), 1157 unknown separados. O primeiro canário #3047/job `1791303736001-f5yuyn` falhou com `tab_icon_fallback`, sem promoção nem alteração do original; esse resultado foi preservado. Dez correções foram confirmadas na release 6422: oito datas de #3047 (18–24/09 e 01/10), #3063 e #3055 em 01/10. Na release 262 publicada, OMT #1940, ROO #2310 e PNMT #2423 em 22/08 e OMT #1940 em 23/08 também foram promovidos/conferidos, somando 14 confirmações nessa etapa. ROO #2310 em 23/08 também passou, promoção `628b9630-f71e-4073-b031-8fd2a91d2203`; checkpoint-15-confirmed.json privado. PERR #1861 e PPMT #2980 passaram na be10, totalizando 17/263 confirmadas e 246 restantes. Main be10fe436009775312f6dd02e8e929a16143a857 publicada, CI 37575662289 aprovada; dump novo/restauração completa/readback dos serviços e JavaScript público confirmados (recibo privado release-final-retro-context-slots.json). Cada correção tem archive, revisão visual, recibo de promoção e PNG canônico com hash conferido; OMT também passou por thumb/modal no Chrome. Task7 continua aberta. AFL #2692 mantém o candidato misto antigo sem promoção; o candidato be10 visualmente coerente foi bloqueado por expectedPosts divergente, com correção local do collector ainda não publicada; VIDEO #3064 falhou antes do upload, causa individual pendente. Falhas antigas PERR #1861/PPMT #2980 foram preservadas; novos candidatos be10 passaram e foram promovidos/archive/readback com consumidor Chrome confirmado. OpenAPI vivo conferido: catálogo v4, 174 operações/157 paths; contagem separada dos gates locais de contrato.

### Task 9: Hotfix do favicon observado e título da aba

**Owner:** Luna (somente `scripts/src/capture-insertion-proof.cjs` e `scripts/src/test-observed-tab-favicon.mjs`); Sol (docs/plano/harness/README); root (PR/CI/main/deploy e canário). **Base:** branch isolada `codex/adops-retroativos-favicon-20261006`, main39; nenhuma edição nos checkouts dirty ou mutação de produção pelo worker.

**Consumes:** prova pareada no Chromium real `favicon-paired-diagnostic-result.json`: mesmos browser/DOM/source, headers presentes falham, retirados passam, restaurados falham. **Produces:** coleta do favicon sem os dois headers de cache e política original restaurada, título real observado; gate de fallback preservado.

- [x] Reproduzir em fixture a falha sob `Cache-Control`/`Pragma`, sem rede externa; corrigir somente durante a coleta, preservando demais headers e restaurando o objeto original em `finally` mesmo na falha. `no-store`/credenciais omitidas/redirect bloqueado/allowlist/limites ficam intactos. Chamadas antigas não alteram headers desconhecidos; falha de restauração propaga e reprova.
- [x] Usar título real de `page.title()`, fallback somente se vazio e clipping existente; testes comportamentais para título diferente da configuração e retorno à política de headers nas requisições seguintes.
- [x] Revisão Sol e testes afetados favicon/moldura/histórico/sintaxe/diff-check aprovados; integridade viva 41/41, zero erros, dois avisos conhecidos não publicados. Fonte 39 e artefatos originais preservados.
- [x] PR112 mergeado, CI da PR e main aprovados; release `6422f688968796544d84408f0632f2d770566d30` publicada e conferida por root em `release-final-favicon.json`.
- [x] Root: backup custom, restauração completa e readback da release 6422 comprovados; novo canário revisado, promovido e conferido antes das dez substituições confirmadas. O primeiro job reprovado permaneceu preservado, sem reclassificação nem repetição cega.

### Task 10: Barra nativa do vídeo e supersession do candidato rejeitado

**Owner:** Luna (capturer/teste Chromium); Sol (API/checklist/testes/docs e guard privado); root (CI/main/publicação/canário).

- [x] Remover a barra artificial do capturer atual; medir timeline UA-shadow, visibilidade/clipping/oclusão, estado pausado e ROI do PNG composto. API/checklist compartilham o gate VIDEO v4; contratos legados permanecem identificados.
- [x] Validar API/checklist 66/66, Chromium real e prova ROI→API 10/10, guard privado de supersession 43/43. CI recebeu os dois comandos nativos; YAML conferido por root.
- [x] Revisão concluída e PR113 mergeada: main `18bf1d2ca7f519cf98991b096cf6b9a64602905b`, árvore igual ao commit revisado `a106c0e`. #3064 permanece candidato rejeitado, sem promoção; nova tentativa exige rejeição/identidade/hash e ausência de recibo de promoção.
- [x] Publicar a release nativa+favicon `262d907c0bb18fb11c1b9b3434701118aab7c176` com dump novo/restauração completa e readback dos quatro serviços, fonte/volumes e JavaScript público. Recibo `release-final-native-video-retry1.json`.
- [ ] Conferir o canário VIDEO real: job `1791346109508-yoq6go` de #3064 falhou no gate nativo antes do upload. Fixture local e leitura no portal passaram, mas a causa da falha individual em produção ainda é desconhecida; não aprovar nem declarar correção.

### Task 11: Favicons dos quatro portais com origem pública externa

**Owner:** Luna (helper existente e teste focal); Sol (revisão e SPEC/HARNESS mínimos); root (PR/CI/main/publicação).

- [x] Preflight público dos seis portais identificou quatro origens exatas antes bloqueadas: AFL, ROO, PNMT e PPMT. OMT same-origin e a CDN Perrengue já foram resolvidos; recibo privado `site-favicon-preflight.json`.
- [x] Parear as quatro origens HTTPS exatas com domínio configurado e observado, sem wildcard; fetch Node restrito ao link observado quando Chromium falha, com credenciais omitidas/no-store, redirect/userinfo/porta recusados, timeout/stream/MIME/dimensões limitados e decoder único. Focal local, sintaxe e diff-check passaram; SPEC/HARNESS atualizados. O preflight público dos seis portais foi aprovado pela Luna; captura real da release ainda depende do canário.
- [x] PR114 integrada e release 262 publicada com backup/restauração/readback oficiais; preflight final dos seis portais em `site-favicon-preflight-final.json`. A publicação não conclui o lote de evidências.

### Task 12: Coerência da matéria interna AFL

**Owner:** Sol (ramo AFL do capturer, teste existente e docs/revisão); Luna (gate de identidade na API/testes); root (revisão/integração/publicação/nova captura). **Base:** branch `codex/adops-retro-context-native-audit-20261007`, release 262; auditoria nativa permanece intacta.

- [x] Confirmar candidato #2692 de 21/08, `892e58f0-cb48-48f8-9184-cded617aafa9`, job `1791346556496-fpl6me`, com URL/título/corpo da Expo e headline/hero do acidente; auditoria antiga aprovada, sem promoção. Reproduzir localmente `articleVerified=true` apesar da mistura.
- [x] Selecionar o post pela origem/path da URL aberta, verificar headline/título da aba antes da mutação e recusar identidade ausente/incompatível. Preservar corpo/títulos/links; hero/data pertencem ao mesmo post. Teste existente RED→GREEN com dois posts, corpo/path/query/links e negativos; focal repetido por Sol/root, normalização, regras 41/41, sintaxe e diff-check passaram.
- [x] Fechar revisão do gate local da API: URL aberta/esperada/visível/editorial devem coincidir no portal configurado, com `article_context_mismatch` para ausência/divergência. Negativo dos quatro URLs no mesmo outro portal RED→GREEN; HTTP/userinfo recusados. Suite Sol immutability+preupload 20/20 e typecheck passaram. Publicação continua pendente.
- [ ] Integrar/publicar o fix local pelos gates oficiais e conferir nova captura AFL com contexto único, PNG exato e auditoria/promoção/readback. Preservar candidato misto e canônico original; o lote permanece aberto.

### Task 13: Recuperação delimitada de slots históricos ausentes

**Owner:** Luna (CJS/testes); Sol (revisão/docs); root (integração/release/operação). **Estado:** implementação local revisada; CI/publicação/canários pendentes.

- [x] Diagnosticar PERR #1861/22Aug e PPMT #2980/16Sep: perfis home corretos, três tentativas failed por slot ausente, sem upload/original intacto. Helper permite período expirado, mas criação exige late_publication_recovery explícito. PERR original aprovado; PPMT exclusivamente clock mismatch com demais provas válidas.
- [x] Reutilizar GET de status e guard determinístico somente candidate-only/histórico v4/período expirado/configuração exata PERR9 ou PPMT1. PERR9 é exceção fixa apenas nessa lane, sem mudar config/painel; PPMT exige allowAuditedReconstruction=true. Fonte correlacionada por inserção/data/job/URL/mídia/contexto/pixels/conteúdo: aprovada ou exclusivamente códigos temporais autorizados, sem reclassificação do original. Lane legada v2 preservada. Guard final qualificou as duas fontes reais sem mutação.
- [x] Reutilizar criação de popup e âncora desktop existentes somente para slot ausente, recusando ambiguidades/slot ocupado. Preservar markup/close e marcar slot PERR reconstruído. Registrar origem/URL/job/códigos/hash editorial fora do PNG; não inventar hash do PNG fornecido pela API. Focais finais slots/crossportal repetidos por Sol/root passaram; API68/typecheck/builds passaram.
- [x] Integrar CI/release/readback be10 e novos candidatos PERR #1861/22Aug e PPMT #2980/16Sep. PNGs individuais, auditoria, promoção/archive/CAS/status/hash público e consumidor Chrome confirmados; originais e falhas anteriores preservados. Demais pares da Task7 continuam pendentes.

### Task 14: ROO/home/grupo1 com fonte legada de posição

**Owner:** Luna CJS/teste; Sol documentos/revisão; root integração/operação. **Worktree:** /Users/leandrobosaipo/.codex/worktrees/adops-roo-legacy-position-20261007/AdOps, branch codex/adops-roo-legacy-position-20261007, base main be10. **Estado:** implementação/revisão local aprovadas; integração e publicação pendentes; nenhuma nova captura ou promoção ROO #2641.

- [x] Diagnosticar fonte parcial: ROO #2641/23Aug, original id1295 totalmente aprovado para posição/criativo, retroContentProof ausente e timeline empty_samples/zero; preview assinado sem slot e anchor desktop único/vazio. Não inferir editorial aprovado nem veiculação histórica real.
- [x] Implementar exceção exclusivamente ROO/home/grupo1 candidate-v4/sem gravação canônica/período encerrado/referência explícita, com GET e identidade/mídia/contexto/pixels/visibilidade/URL correlacionados. Fonte deve ser fullyapproved, editorial ausente/null e zero amostras. Reutilizar reconstruction.sourceEvidence com proofScope=position_only/sourceEditorialProofStatus=missing_legacy; preservar arquivo e contrato antigo.
- [x] Reutilizar anchor desktop exato/único/vazio/header visível, sem fallback genérico. Candidato precisa de pelo menos três posts/amostras/matches, zero futuros, manifest hash64 e editorial aprovado antes do upload. Provas editoriais existentes permanecem no candidato, sem objetos duplicados; PNG sem carimbo/historicalDisplayConfirmed=false.
- [x] Revisão Sol/API 21/21 common+pre-upload, focais ROO/PNMT e AFL, native 10 casos reais com ROI/API/checker lexical, sintaxe/diff-check passaram. Plano legado v2 mesma config e marker/cutoff equivalente conferidos; CI/release/canário continuam pendentes.
- [ ] Integrar main/release e canário serial ROO #2641 somente após gates; revisão individual, auditoria, promoção/archive/CAS e consumidor/hash. Não marcar operacionalmente concluído por job/audit isolados.

Main be10fe436009775312f6dd02e8e929a16143a857 publicada, CI 37575662289 aprovada; dump novo/restauração completa/readback dos serviços e JavaScript público confirmados (recibo privado release-final-retro-context-slots.json). Checkpoint atual: 17/263 confirmadas, 246 restantes. Task7 continua aberta.

### Task 15: Collector AFL e persistência do diagnóstico nativo

**Owner:** Luna CJS/focais; root API/regressões/operação; Sol revisão/documentos. **Estado:** correções locais, ainda não integradas/publicadas.

- [x] Confirmar no PG em leitura que AFL be10 15cf8c3e/job1791352721123-roziuo tem página/amostras Expo PCD e expectedPosts[0] acidente. Preservar candidato bloqueado e original canônico; recibo privado sol-afl-be10-candidate-context-projection.json.
- [x] Revisar collector com duas matérias: expectedPosts/editorialSamples do mesmo post afl-wp-rest selecionado por URL real/título verificado; origem/path/identidade ausentes ou foreign bloqueiam. Manter gate API article_context_mismatch.
- [x] Revisar escopo externo de nativeProgressAudit/finalPngProgressAudit e teste semântico do binding no catch, além da fixture nativa real; falha original continua diagnóstico, não aprovação.
- [ ] Integrar CI/main/release e novos canários serialmente com PNG individual, auditoria/promoção/archive/readback. Não reutilizar aprovação de candidatos held/failed nem declarar lote concluído.

### Task 8: Substituição explícita de apresentação histórica aprovada

**Owner:** Luna; revisão Sol+root; implementar após Task2 e antes de Task7. **Modify:** artifacts/api-server/src/lib/capture-proof-candidate-promotion.ts, artifacts/api-server/src/routes/capture-proof-candidate-promotions.ts, helper puro pequeno se necessário, ops/fastapi-docs/main.py. **Test:** scripts/src/test-capture-candidate-promotion.integration.ts e teste puro de guard de substituição.

**Consumes:** aprovação persistida, identidade/hash/bytes do original e contrato v4/framev5. **Produces:** exceção estreita ao bloqueio canonical_already_approved, sem DELETE/invalidação nem recaptura implícita.

- [x] Testar default approved bloqueado; daily/same_day_retry bloqueados mesmo com pedido; par completo v4/v5 bloqueado, componentes parciais elegíveis; original histórico fora contrato novo e candidato aprovado v4/v5 aceita somente parâmetros corretos. Hash/bytes/id/URL/data divergentes bloqueiam.
- [x] Reusar a mesma rota promote com objeto replaceHistoricalPresentation={evidenceId,arquivoUrl,sha256,bytes}. Fazer opt-in explícito de operador interno e validar shape estrito. Não habilitar replace genérico do capturer.
- [x] Conferir metadata canônica pelo loader comum e classe histórica da auditoria final atual; candidato já aprovado v4/framev5, período/regra/mídia/conteúdo/checklist preservados. Comparar hash/bytes reais do original antes da mutação e do archive; manter locks e invariantes de mudança canônica/review.
- [x] Reusar archive/promotion receipt/readback/compensation existentes. Recibo/auditoria e summarylog registram reason=presentation_upgrade e expectedOriginal com identidade/hash/bytes; GET promotions expõe esses campos compactos. Sem parâmetro preserva erro canonical_already_approved. Idempotência, falha de archive/readback e aprovação concorrente validadas em DB isolada.
- [x] Revisão Sol aprovada: guard 5/5, integração PostgreSQL isolada com SQL oficial 16/16 sem skips, build/typecheck e OpenAPI focado passaram. Teste geral OpenAPI ainda tem assert legado de catálogo v2, corrigido na Task4. Não promover produção antes de Task3+5+7 canário.
