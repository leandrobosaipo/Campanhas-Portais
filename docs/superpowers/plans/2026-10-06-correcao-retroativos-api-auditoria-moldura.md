# Correção de retroativos, auditoria e moldura — Implementation Plan

> Para workers: usar subagent-driven-development, uma tarefa de implementação por vez, com revisão de contrato e qualidade. Não criar subagentes adicionais. Ler o brief próprio e registrar arquivos/testes/resultados.

**Goal:** Produzir novas reconstruções com os dois relógios retroativos, proveniência real preservada, leitura mensal final correta e moldura legível; corrigir o conjunto autorizado por API e publicar main com backup/readback.

**Architecture:** Base operacional limpa e11c7cc37a27f0787fdead8381d32f06c1b17acc. Contrato aditivo de proveniência v4 reutiliza requestedCaptureAt e preserva v2/v3; componentes existentes de auditoria/candidato/mensal recebem pequenas correções. Sem migração destrutiva, biblioteca nova ou mudança de autenticação.

**Tech Stack:** Node/Express/TypeScript, Drizzle/PostgreSQL, CJS capturer/Playwright/Pillow, MJS geradores e testes, OpenAPI FastAPI, pnpm workspace, Portainer via runbook existente.

**Spec:** docs/adops/retroactive-proof-v4/{prd,spec,harness}.md.

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

Inventário terminado em 17 páginas: 263 históricos fora do par v4/v5 (250 pendentes, 13 aprovados), 1157 unknown separados. Canário #3047/job `1791303736001-f5yuyn` falhou com `tab_icon_fallback`, sem promoção nem alteração do original. O lote continua bloqueado pelo canário. OpenAPI vivo main39: catálogo v4, 174 operações/157 paths; contagem separada dos gates locais de contrato.

### Task 9: Hotfix do favicon observado e título da aba

**Owner:** Luna (somente `scripts/src/capture-insertion-proof.cjs` e `scripts/src/test-observed-tab-favicon.mjs`); Sol (docs/plano/harness/README); root (PR/CI/main/deploy e canário). **Base:** branch isolada `codex/adops-retroativos-favicon-20261006`, main39; nenhuma edição nos checkouts dirty ou mutação de produção pelo worker.

**Consumes:** prova pareada no Chromium real `favicon-paired-diagnostic-result.json`: mesmos browser/DOM/source, headers presentes falham, retirados passam, restaurados falham. **Produces:** coleta do favicon sem os dois headers de cache e política original restaurada, título real observado; gate de fallback preservado.

- [x] Reproduzir em fixture a falha sob `Cache-Control`/`Pragma`, sem rede externa; corrigir somente durante a coleta, preservando demais headers e restaurando o objeto original em `finally` mesmo na falha. `no-store`/credenciais omitidas/redirect bloqueado/allowlist/limites ficam intactos. Chamadas antigas não alteram headers desconhecidos; falha de restauração propaga e reprova.
- [x] Usar título real de `page.title()`, fallback somente se vazio e clipping existente; testes comportamentais para título diferente da configuração e retorno à política de headers nas requisições seguintes.
- [x] Revisão Sol e testes afetados favicon/moldura/histórico/sintaxe/diff-check aprovados; integridade viva 41/41, zero erros, dois avisos conhecidos não publicados. Fonte 39 e artefatos originais preservados.
- [ ] PR/CI/main novo SHA e readback de release por root.
- [ ] Root: backup/restauração/readback do novo release, novo canário revisado e aprovado antes de retomar Task7. O job reprovado não é reclassificado como sucesso nem repetido cegamente.

### Task 8: Substituição explícita de apresentação histórica aprovada

**Owner:** Luna; revisão Sol+root; implementar após Task2 e antes de Task7. **Modify:** artifacts/api-server/src/lib/capture-proof-candidate-promotion.ts, artifacts/api-server/src/routes/capture-proof-candidate-promotions.ts, helper puro pequeno se necessário, ops/fastapi-docs/main.py. **Test:** scripts/src/test-capture-candidate-promotion.integration.ts e teste puro de guard de substituição.

**Consumes:** aprovação persistida, identidade/hash/bytes do original e contrato v4/framev5. **Produces:** exceção estreita ao bloqueio canonical_already_approved, sem DELETE/invalidação nem recaptura implícita.

- [x] Testar default approved bloqueado; daily/same_day_retry bloqueados mesmo com pedido; par completo v4/v5 bloqueado, componentes parciais elegíveis; original histórico fora contrato novo e candidato aprovado v4/v5 aceita somente parâmetros corretos. Hash/bytes/id/URL/data divergentes bloqueiam.
- [x] Reusar a mesma rota promote com objeto replaceHistoricalPresentation={evidenceId,arquivoUrl,sha256,bytes}. Fazer opt-in explícito de operador interno e validar shape estrito. Não habilitar replace genérico do capturer.
- [x] Conferir metadata canônica pelo loader comum e classe histórica da auditoria final atual; candidato já aprovado v4/framev5, período/regra/mídia/conteúdo/checklist preservados. Comparar hash/bytes reais do original antes da mutação e do archive; manter locks e invariantes de mudança canônica/review.
- [x] Reusar archive/promotion receipt/readback/compensation existentes. Recibo/auditoria e summarylog registram reason=presentation_upgrade e expectedOriginal com identidade/hash/bytes; GET promotions expõe esses campos compactos. Sem parâmetro preserva erro canonical_already_approved. Idempotência, falha de archive/readback e aprovação concorrente validadas em DB isolada.
- [x] Revisão Sol aprovada: guard 5/5, integração PostgreSQL isolada com SQL oficial 16/16 sem skips, build/typecheck e OpenAPI focado passaram. Teste geral OpenAPI ainda tem assert legado de catálogo v2, corrigido na Task4. Não promover produção antes de Task3+5+7 canário.
