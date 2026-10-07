# HARNESS — Reconstrução retroativa v4

## Checkpoint atual — 07/10/2026

Release606cf05b70ee076bc613ef4d7bb5529f2d9c0b61 publicada e conferida às10:08:36 UTC pelo PR118, CI37601935185 aprovada. Backup fresco e restauração completa, quatro serviços sem pausa, fonte real, JavaScript público e OpenAPI174/157 conferidos. Registro do novo VIDEO3064/01Oct passou nas12 condições de proveniência: capturedAt10:10:04.382Z dentro de slot_captured terminado10:10:04.747Z. Auditoria final ainda bloqueou: ROI com score1.0 declarou minSimilarity0.48 herdado desta regra do slot, enquanto API exige0.82. Original preservado; sem promoção ou aprovação visual do candidatof0c33dbd-4b60-4d5e-96a6-1ef8f084dc46. Correção localizada: piso0.82 só na ROI nativa, mantendo configurações maiores e gate da API. Regressão real com0.48 reproduz RED antes do ajuste, passa após;0.91 preservado e ROI adulterada bloqueada. Publicação dessa correção e novo canário seguem pendentes.

Checkpoint do consumidor às10:32 UTC:30/237 pares operáveis confirmados,207 restantes (170 não-vídeo prontos,28 vídeos retidos,9 identidades1944 retidas). AFL1842/22–25Aug passou auditoria/revisão individual e promoção com original arquivado; status/hash, quatro miniaturas e quatro modais foram conferidos. Os26 pares protegidos permanecem fora do lote. O snapshot anterior26 abaixo conserva a qualificação inicial.

### Histórico — qualificação e checkpoint26

O plano inicial do consumidor separava as211 datas ainda não confirmadas em174 não-vídeo prontas,28 vídeo retidas e9 datas1944 retidas por identificação da PI. #1944 e2296 têm mídia/PI literal diferentes; ausência de documento não autoriza declarar duplicidade nem transferir evidências. GrupoAFL1842/22–25Aug tinha passado em quatro auditorias finais; revisão individual, promoção e consumidor ainda eram gates pendentes nesse snapshot.

Main/release `04cd98ba906ec57efc86ffd1a44390b5c666c5c2`, PR117 e CI37594453308 conferidos. Readback em 08:50:26 UTC: backup novo/restauração completa/quatro serviços/fonte/JavaScript público/OpenAPI. **26/237 evidências confirmadas, 211 restantes**. AFL #2692/21Aug e ROO #2641/23Aug passaram em auditoria final, PNG individual, promoção, archive/hash/status e miniatura/modal. Recibos privados `release-final-retro-canary-followup.json` e `checkpoint-26-confirmed.json`. Os checkpoints abaixo são históricos.

Qualificação posterior por GET das53 inserções: zero desconhecidos/divergências de campanha/site/período/formato. Inventário263 =237 pares operáveis +26 protegidos. #1826 arquivada e substituída por1841 (12pares); #1860 com vínculo de substituição para2192 (14pares). Nenhum protegido pertence às26 entregas confirmadas. #1860 e sucessora diferem em formato/mídia/identityKey: não declarar duplicidade idêntica nem transferir provas. As quatro reconstruções1826/01–04Aug foram promovidas antes dessa qualificação, com originais preservados, mas não contam como entrega no consumidor; relatório exclui1826 corretamente. Guard privado exige marcadores explícitos nulos antes de preparar/capturar. Proteger também execução comum antes de abrir navegador. Recibos privados de identidade/qualificação e exceção conservados; nenhuma reativação, remoção ou alteração de sucessora.

Os três canários d1 falharam antes da promoção, com originais preservados:

- AFL #2692/21Aug, job1791359711274-xcytml: o fetch descartava o ID WP. A regressão usa resposta REST bruta, caminho padrão de fetch e collector real, exigindo ID69702; posts ausentes continuam recusados.
- ROO #2641/23Aug, job1791359993006-on5gzx: `#block-8` continha comentário literal de indisponibilidade AdRotate. Focal ROO/PNMT admite apenas espaços e zero/um comentário conhecido, preservando nós e ordem; recusa comentário desconhecido/duplicado, texto, elementos e âncoras inválidas.
- VIDEO #3064/01Oct, job1791360198866-54n4dk: os dois passes de lock criavam atributo ativo vazio, enquanto CSS exigia `"1"`. Comparação somente leitura no mesmo DOM assinado: vazio→falha/pointer none; valor1→timeline clear; vazio restaurado→falha. A fixture executa `forceMatchedAdVisible` com dois criativos e CSS real; confirma valor1 inicial/periódico, sibling inativo, timeline nativa aprovada e negativos de cobertura/recorte/barra artificial intactos.

Os focais AFL, ROO/PNMT e vídeo nativo passaram com revisão independente Sol, sintaxe/diff-check e CI; publicados no PR117. Nenhum gate de oclusão/editorial foi reduzido.

### Recaptura final nativa: bloqueio de proveniência

VIDEO #3064/01Oct, job1791363572087-igd8ad na release04cd: PNG concluído e timeline nativa aprovada, mas registro HTTP409 `candidate_provenance_blocked`/`candidate_metadata_provenance_mismatch`. O validator puro aplicado à metadata real aprovou 11/12 condições: capturedAt=reconstructedAt=09:00:07.378Z ultrapassou slot_captured.finishedAt=09:00:05.307Z em 2071 ms. A etapa fechava antes da recaptura final nativa. Sem candidato registrado ou promoção; original preservado.

Correção em branch: fechar slot_captured somente após a última screenshot e medição, antes de iniciar final_composed. Preservar instantes reais e validator estrito. Regressão executável, revisão Sol, CI/publicação e novo canário são gates distintos. Nunca ajustar a metadata antiga nem registrar rejeição visual fictícia para repetir a captura.

## Verificação local

Executar na branch isolada baseada em e11c7cc37a27f0787fdead8381d32f06c1b17acc, usando lockfile existente. Registrar comando, SHA e resultado; uma etapa skip não prova sua propriedade.

1. node --check scripts/src/capture-insertion-proof.cjs.
2. No diretório scripts: node --import tsx src/test-preupload-reconstruction-clock.ts.
3. No diretório scripts: node --import tsx --test src/test-capture-proof-candidates.ts src/test-capture-provenance-flow.ts src/test-monthly-report-query.ts.
4. node scripts/src/test-historical-reconstruction-frame.mjs e node scripts/src/test-windows-frame-template.mjs; validar que Pillow existe, sem aceitar skip visual como aprovação.
5. pnpm --dir scripts run audit:capture-rules-integrity; builds API e painel.
6. Regressões de reconstrução, candidato, readback/restore e mensal/export em arquivos existentes, mais testes específicos criados para fonte final e inventário. O teste test-monthly-report-target-evidences.mjs consulta snapshot público de agosto e contém contagem histórica fixa: registrar sua divergência separadamente, sem tratá-la como regressão deste código nem mudar o snapshot público para passar teste.
7. Python unittest/pytest dos contratos OpenAPI existentes e teste de payload/202/UUID.

### Integração de promoção em PostgreSQL isolado

Não executar essa suíte contra produção. O schema criado apenas por `drizzle push` não reproduz todos os checks, FKs e triggers das migrations oficiais de candidatos/reviews/promotions. A fixture isolada deve aplicar o SQL oficial completo e conferir os dois triggers de imutabilidade, checks de hash/decisão e FKs de identidade antes de aprovar o teste. Essa paridade foi conferida na DB local `candidate_audit_test`, PostgreSQL 14.17, socket privado `/tmp/adops-candidate-pg-socket-retro20261006`, porta 55437 sem escuta TCP. A lifecycle da fixture é responsabilidade do root; não criar nem remover cluster implicitamente.

O workflow CI também prepara essa paridade: somente na DB de teste `candidate_audit_test` recém-criada, recria as três tabelas vazias de candidatos/reviews/promotions pelo SQL oficial depois do push. `CREATE TABLE IF NOT EXISTS` isolado não acrescentaria os checks/FKs que o push omitiu e poderia produzir falso teste positivo. Esse preparo não altera migrations nem bancos de produção; o root validou YAML, ordem e URL isolada com Ruby Psych.

Executar serialmente no diretório `scripts`, com `DATABASE_URL` apontando somente para a fixture e `ADOPS_PROMOTION_TEST=1`:

```bash
node --import tsx --test src/test-capture-candidate-promotion.integration.ts
```

A revisão Task8 registrou 16/16 aprovados, zero skips, nessa fixture com SQL oficial. O root repetiu integração de promoção e registro em sequência: 17/17 aprovados, zero skips, log privado `outputs/adops-retroativos-20261006/test-final-candidate-integration.log`. Para o decoder de registro/export, `ADOPS_EVIDENCE_EXPORT_PYTHON` deve apontar para Python com Pillow; para compositor/hash, usar `ADOPS_CAPTURE_PYTHON`. No ambiente local verificado, ambos usam `/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`; o `python3` padrão local não tem Pillow. A tentativa inicial de registro recebeu 409 por esse decoder ausente e passou após corrigir apenas o ambiente, sem mudar código.

O gate final repete as suítes afetadas após alterações posteriores. Para typecheck, gerar antes os projetos referenciados: `pnpm exec tsc -b lib/db lib/api-zod`; depois `pnpm --filter @workspace/api-server run typecheck`. Um dist ausente não é uma falha comportamental da API.

Após Task4 e atualização do YAML/clientes gerados, o root executou `pnpm run typecheck` completo: passou em libs, API, painel, scripts e mockup. Após Task5, builds API/painel, regras 41/41 sem erros e diff-check passaram. A suíte final serial promoção+registro+inventário passou 18/18, zero skips, na fixture com SQL oficial; log privado `outputs/adops-retroativos-20261006/test-final-all-db-integration.log`.

Na integração final anterior ao release, o root também registrou 49/49 testes dos contratos da API e 69/69 regressões do consumidor/contagens/export/download/deadline aprovados. OpenAPI Python e TypeScript passaram com catálogo v4; esses gates locais são distintos da contagem do documento vivo. O readback da release main `39ff4a1b38a8ec21e5eefb5495e12f23a23d0997` confirmou 174 operações e 157 paths, sem adição/remoção em relação ao documento anterior observado. A contagem anterior de 171 operações neste registro era incorreta. O YAML mensal e os clientes gerados preservaram `requestedCaptureAt` local literal e `capturedAt` real na convenção existente. Esses resultados aprovam o código local; correção das evidências exige os readbacks abaixo.

Com `DATABASE_URL` isolada e os dois caminhos Python configurados, executar registro e promoção na mesma sequência, sem outro teste usando essa DB:

```bash
ADOPS_PROMOTION_TEST=1 ADOPS_CANDIDATE_REGISTRY_TEST=1 node --import tsx --test --test-concurrency=1 src/test-capture-candidate-promotion.integration.ts src/test-capture-proof-candidate-registry.integration.ts
```

### Consumidor e fuso horário

O teste `scripts/src/test-retroactive-report-candidate-ui.mjs` executa o JavaScript gerado do relatório. Confere thumb sem elevar aceite, job candidato com `promote=false`, correspondência exata de inserção/data/URL, erro HTTP e preservação do job não confirmado. O modal diferencia a referência `2026-10-01T20:30` da criação real `2026-10-06T09:41:51.403Z`; a referência sem offset é interpretada em Cuiabá, sem reescrever a string recebida.

```bash
TZ=UTC node scripts/src/test-retroactive-report-candidate-ui.mjs
TZ=America/New_York node scripts/src/test-retroactive-report-candidate-ui.mjs
```

Esse caso reproduziu a divergência sob UTC antes da correção e passou sob os dois fusos depois. O teste local não substitui a abertura do modal autenticado, PNG e download após deploy.

## Matriz comportamental

| Caso | Resultado |
| --- | --- |
| v4, página e SO em requestedCaptureAt, criação real correlacionada | Aceitável com todos os outros gates |
| v4, SO em reconstructedAt distante da referência | desktop_time_mismatch |
| v3, SO real e página histórica | Comportamento preservado |
| v2 legado | Comportamento preservado |
| reconstructedAt antigo falsificado, job/data/hash errado | Bloqueado |
| metadata apenas preliminar ou sem correlação | Origem a conferir |
| artefato canônico e auditoria final aprovados, log pré-final antigo | Reconstrução tecnicamente aceita |
| usuário conclui job candidato | Aguarda revisão, sem promoção automática |
| inventário paginado | Sem duplicatas/lacunas e limite respeitado |

O teste SQL real `scripts/src/test-historical-evidence-inventory.integration.ts` usa `ADOPS_HISTORICAL_INVENTORY_TEST=1` e a mesma DB isolada, serialmente. Valida título com caixa/espaços, canônico mais recente, recibo final aprovado e data divergente, booleano JSON malformado, undated com ID próprio, diário excluído e página vazia cujo cursor continua. Fixtures usam IDs exatos; cleanup do candidato é transacional e confere trigger habilitado em `pg_trigger`. Passou 1/1 abrangente, zero skips; helper/parser passou 4/4. Cursor acima do int4 é recusado e a allowlist de fixture aceita somente loopback explícito ou socket local nomeado.

## Canário e liberação (root)

### Vídeo nativo: regressão e gate local

O candidato #3064 de 01/10/2026, `c5111b5e-e76b-42a4-9739-b4f48911e3a8`, job `1791307251205-4gge30`, permaneceu `completed`/`candidate_approved` pelo contrato da release 6422, mas foi rejeitado pelo root ao ver duas barras. PNG original do canônico preservado; esse candidato não foi promovido. A auditoria anterior aceitava `progressVisible || overlayInjected`, sem medir a timeline nativa.

O teste API `scripts/src/test-native-video-progress-audit.ts` exercita a rejeição desse padrão v4, timeline/ROI válidas, barra invisível/coberta/recortada, oclusão desconhecida, frame em reprodução, tempo/duração divergentes, ROI/crop/escala alterados, ausência/falha de pixel audit e compatibilidade v2/v3/diários/GIF. Com imutabilidade e decisão de checklist, passou 66/66, zero skips. O teste de decisão importa a DB, mas não a consulta; nesse gate puro usa-se uma DATABASE_URL de teste local, sem flags de integração. Não usar URL de produção.

O capturer tem fixture local H.264 real `scripts/src/test-native-video-progress-audit.mjs`: Chromium mede a timeline pelo CDP, captura o mesmo player pausado com deviceScaleFactor=2 e compõe pelo compositor real. A ROI nativa intacta passou com similaridade 1 e crop 960×48 nos critérios produtivos existentes; screenshot oculto/coberto/recortado ou ROI final alterada foram rejeitados. O resultado desse caso real também é passado diretamente ao helper API `evaluateVideoPlayerProof` pelo child Node/tsx com JSON em stdin, que o aprova e identifica a origem nativa. São 10 cenários locais, sem rede externa, DB ou API writes; comprovam a mecânica local, não o portal vivo. Configurar `ADOPS_CAPTURE_PYTHON` com Pillow e usar FFmpeg/Chromium já presentes no harness.

```bash
node --import tsx --test src/test-native-video-progress-audit.ts src/test-capture-audit-immutability.ts
```

Antes de nova captura, o helper privado `capture-candidate.mjs` exige opt-in `--supersede-visually-rejected`, rejeição wx/600 ligada ao PNG rehash, ACK/job completed candidate-only exatos, GET candidato correlacionado, GET promotions vazio e canônico original ID/URL/hash/bytes intacto. O novo namespace conserva os recibos GET e o `supersession-intent.json` com releases anterior/nova. Teste privado `outputs/adops-retroativos-20261006/test-capture-candidate-supersession.mjs`: 43 casos locais, incluindo a rejeição real, sem API writes ou alteração dos registros antigos. Sem ACK/running/unknown/visual approval/promotion request ou receipt, parar.

A release `262d907c0bb18fb11c1b9b3434701118aab7c176` foi publicada com dump novo, restauração completa e readback dos quatro serviços, fonte/volumes e JavaScript público; recibo privado `release-final-native-video-retry1.json`. O novo job VIDEO #3064 `1791346109508-yoq6go` falhou no gate nativo antes do upload. Fixture local e verificação somente leitura no portal passaram, mas a causa dessa falha individual em produção permanece desconhecida; não concluir que o canário passou. Antes de promover: PNG real com uma única barra nativa, domínio/ícone/título/relógios/banner corretos; auditoria final e hash exatos; recibo persistido e archive; status e PNG público com hash igual. Não contabilizar uma correção por job concluído ou auditoria técnica isolada.

### Coerência editorial AFL: regressão de 07/10/2026

O candidato #2692 de 21/08/2026 `892e58f0-cb48-48f8-9184-cded617aafa9`, job `1791346556496-fpl6me`, passou a auditoria técnica anterior, mas ficou sem promoção: URL/título da aba/corpo eram da Expo Primavera e headline/imagem foram trocados pelo primeiro post histórico, sobre um acidente. A reprodução local devolveu `articleVerified=true` nesse estado misto. O ramo AFL verificava o link que ele próprio havia sobrescrito; a amostra editorial comum confiava nesse resultado.

O teste existente `scripts/src/test-afl-retro-date-and-config-isolation.mjs` reproduziu RED (post 123/acidente escolhido em vez do 124/Expo) e passou após selecionar a URL real. Confere dois posts, query de preview, corpo/título/hero/links preservados e rejeita post ausente, outra origem, headline ou título da aba incompatível antes da mutação. Normalização limitada, sintaxe, diff-check e integridade viva 41/41 passaram (zero erros, dois avisos conhecidos). Sol e root repetiram o focal; a correção está local, ainda não publicada. Executar no diretório `scripts`: `node --import tsx src/test-afl-retro-date-and-config-isolation.mjs`. Uma nova captura AFL exige release/readback e revisão do PNG exato; preservar o candidato misto e o canônico original.

O gate local da API compara a URL aberta com as amostras esperada/visível/editorial e rejeita `article_context_mismatch` no escopo AFL/article/histórico v4. O negativo com os quatro URLs iguais em outro portal falhou antes do bound e passou após exigir a origem configurada; HTTP e userinfo também são recusados. Sol repetiu `node --import tsx --test src/test-capture-audit-immutability.ts src/test-preupload-reconstruction-clock.ts`: 20/20 passaram; typecheck da API passou. O escopo diário/home/legado foi preservado. Publicação e novo canário permanecem pendentes.

### Slots ausentes: diagnóstico de 07/10/2026

PERR #1861 em 22/08, job `1791347447355-vbscqh`, e PPMT #2980 em 16/09, job `1791347980032-oat8mi`, falharam após três tentativas antes do upload; originais preservados. A mensagem genérica de páginas internas não demonstra navegação interna: ambos os perfis usam home. O período expirado permite recuperação, mas o helper atual recusa a criação do slot sem motivo explícito de publicação tardia. Não inventar esse motivo.

O original PERR tem audit/checklist aprovados. O PPMT tem exclusivamente falha de relógio antigo, com mídia, pixels, conteúdo, grupo/contexto e URL válidos. A lane PERR9/PPMT1 da SPEC foi implementada/revisada e publicada em be10; os dois canários foram promovidos com readback. Sol repetiu `test-pnmt-static-retro-anchor.mjs` e `test-cross-portal-retro-reconstruction.mjs`: ambos passaram. Cobrem positivos dos dois perfis e negativos de fonte/data/job/mídia/contexto divergentes, fonte ausente, bloqueador não temporal, rotina diária, período atual, slot ocupado e âncora duplicada/oculta. PERR sem container cria exatamente um popup com inner/close e marcador de slot reconstruído; duplicado/ocupado bloqueia. PPMT preserva âncora/header/comentário existentes. Root também qualificou as duas fontes reais pelo guard final, sem mutação (`slot-source-qualification-final.json`, privado). A falha intermediária de teste por fixture PPMT sombreada sem groupId foi corrigida; o focal final passou. API/regressões 68/68, typecheck completo e builds API/painel passaram segundo o root. Não registrar conclusão operacional antes de CI, publicação e novo candidato auditado/revisado/promovido com readback.

### ROO/home/grupo1: contrato de fonte parcial, em implementação

ROO #2641 em 23/08 permanece bloqueado após slot ausente, sem novo candidato desta extensão. O original id1295 tem checklist legado aprovado e provas de posição/criativo, mas retroContentProof=null e contentTimeline empty_samples/zero amostras. Isso não demonstra conteúdo editorial histórico.

Validar positivamente somente o perfil ROO/home/grupo1, candidato v4 sem gravação canônica, período encerrado, referência explícita igual à fonte/preview, identidade/mídia/contexto/pixels/visibilidade/URL aprovados e anchor desktop único/vazio/visível. reconstruction.sourceEvidence deve registrar proofScope=position_only e sourceEditorialProofStatus=missing_legacy; não copiar aprovação editorial nem duplicar os objetos de prova.

Negativos obrigatórios: origem/data/job/mídia/contexto divergentes, audit parcial/reprovado/preliminar, prova editorial antiga rejeitada em vez de ausente, amostras antigas não vazias, clock-only, daily/período atual, slot ocupado, anchor/header ambíguo ou oculto/mobile. No candidato final exigir três expectedPosts, três amostras válidas e três matches, zero futuros, hash64 e status aprovado; feed com dois posts, prova ausente/rejeitada ou hash inválido bloqueia antes do upload. PERR/PPMT e legado v2 mantêm os gates existentes.

Revisão local: o plano ROO novo é explícito somente no candidato v4; o caminho legado v2 conserva header/main com a mesma configuração. O teste de API cobre o positivo e negativos do contrato position_only, incluindo contagens/datas/URLs/hash/configuração; suíte common+pre-upload 21/21 foi repetida por Sol e passou. Sol repetiu os focais ROO/PNMT e AFL: passaram. Cutoff real do marker deve equivaler ao captureAt; teste inclui timezone equivalente e negativos ausente/errado/inválido/inativo. CI/release e novo canário permanecem pendentes. Não contar ROO #2641 entre as correções confirmadas.

O candidato AFL be10 15cf8c3e-c2fc-491e-b2d7-537c69264d07, job1791352721123-roziuo, foi visualmente coerente e bloqueado corretamente por article_context_mismatch. Projeção PG somente leitura confirmou pageUrl/visiblePosts/editorialSamples da Expo PCD e apenas expectedPosts[0] da notícia de acidente. Recibo privado sol-afl-be10-candidate-context-projection.json, sem query. A fixture deve reproduzir duas matérias no feed e exigir o mesmo post selecionado nas quatro URLs; missing/foreign rejeitam.

O teste nativo verifica com o checker TypeScript o binding lexical dos dois audits no catch, além de screenshot/ROI/controle nativo reais. Isso detecta variáveis declaradas dentro do try que ficariam inacessíveis em falha; não substitui o diagnóstico do vídeo de produção nem aprova o canário failed.

### Hotfix do favicon: reprodução de 06/10/2026

O preflight posterior dos seis portais (`site-favicon-preflight.json` privado) encontrou quatro buckets públicos antes bloqueados pela allowlist. ROO e PNMT também responderam imagem sem ACAO, impedindo o fetch no navegador. A correção deve usar somente as origens exatas da SPEC e o URL declarado no DOM, com fallback Node sem credenciais e os mesmos limites de redirect, MIME, stream e dimensões. O teste focal `scripts/src/test-observed-tab-favicon.mjs` cobre os seis fluxos, incluindo fixture sem CORS, pareamento do portal, host arbitrário/outro portal, userinfo, porta, redirect e tamanho; conferir restauração dos headers também após o fallback. Sucesso local ou GET público do ícone não substitui o canário de captura da release publicada.

Checkpoint operacional em 07/10/2026: release be10 publicada; 17/263 correções confirmadas e 246 restantes. Entre as confirmações anteriores na release 262 estão OMT #1940 em 22/08, promoção `d88bd570-099e-43b6-ad0e-d170e2146e4b`, ROO #2310 em 22/08, promoção `10fca696-f1fc-4283-ae12-9638f811d67e`, PNMT #2423 em 22/08, promoção `0f9eae0e-f922-4c8a-a886-aec700e9e4c7`, e OMT #1940 em 23/08, promoção `a035ec6e-7fa5-473e-9159-7590c3ccb4c0`, com revisão individual/archive/recibo/hash conferidos. OMT também passou pelo consumidor Chrome: thumb 3320×2516 e detalhes com referência 22/08 19:40 e criação real 07/10 00:23. ROO #2310 em 23/08 também foi confirmado, promoção 628b9630-f71e-4073-b031-8fd2a91d2203; checkpoint-15-confirmed.json privado. Main be10fe436009775312f6dd02e8e929a16143a857 publicada, CI 37575662289 aprovada; dump novo/restauração completa/readback dos serviços e JavaScript público confirmados (recibo privado release-final-retro-context-slots.json). Os 1157 unknown continuam separados. AFL misto permanece candidato sem promoção; VIDEO falhou antes do upload, com diagnóstico individual pendente. As falhas antigas PERR9/PPMT1 por slot ausente permanecem preservadas. PERR #1861/22Aug passou em be10, promoção aa27029c-ad0a-4298-a50c-2972153110ef; PPMT #2980/16Sep passou, promoção db52caf4-913a-4bbc-b6e8-7185f44af27f. Ambos têm archive/status/hash público e consumidor Chrome com thumb/modal 3320×2696 conferidos. Referências PERR22Aug20:42/PPMT16Sep20:19 e reconstruções reais 07Oct02:12/02:15; screenshots privados report-corrected-1861.jpg/report-corrected-2980.jpg. O primeiro job failed e o candidato #3064 visualmente rejeitado da release 6422 permanecem intactos.

A release main39 e o relatório canônico foram publicados e conferidos; ver os recibos privados `outputs/adops-retroativos-20261006/release-final39.json` e `report-deploy-receipt.json` no checkout operacional original. Backup custom, restauração completa e rollback da primeira troca foram comprovados; a continuação revisada reutilizou essa prova, sem novo dump/restore, e conferiu os volumes novos antes de pular upload. O prazo oficial de polling é 300 segundos, não cancelamento do exec remoto; ver o README do stack.

O canário `1791303736001-f5yuyn` de `#3047` falhou por `tab_icon_fallback`; original intacto, sem promoção. A coleta pública limpa não cobria a política de headers do capturer. A prova pareada privada `outputs/adops-retroativos-20261006/favicon-paired-diagnostic-result.json` registra, no mesmo browser/DOM e ícone declarado: `withHeaders=false`, `withoutHeaders=true`, `restoredHeaders=false`. Não atribuir a falha a head descartado ou rede congelada: esses caminhos não existem no capturer observado. A categoria detalhada de rede não foi inferida a partir do TypeError.

No hotfix baseado em main39, o teste `scripts/src/test-observed-tab-favicon.mjs` reproduziu a rejeição do favicon na fixture com os headers globais e passou com retirada somente de `Cache-Control`/`Pragma` durante a coleta. Conferiu preservação dos demais headers, restauração em `finally` após sucesso/TimeoutError, rejeição quando a restauração falha e chamadas antigas sem alteração de headers desconhecidos. `fetch` mantém `cache:no-store`, `credentials:omit`, `redirect:error`, allowlist, timeout e limites. O título vem de `page.title()` observado, com recorte pelo compositor e fallback apenas se vazio; pixels diferenciam título real/configurado e conferem clipping. Favicon, moldura v5 e histórico passaram com Pillow; sintaxe dos dois arquivos e diff-check passaram. Sol conferiu integridade viva 41/41, zero erros e dois avisos conhecidos de rascunhos PERRENGUE:10/:7. O bloqueio `tab_icon_fallback` foi preservado. Esses gates locais não comprovam o novo canário de produção.

Inventário concluído: 17 páginas, 263 alvos históricos e 1157 unknown separados (`historical-inventory/manifest.json` privado). Isso não comprova correção. Dez substituições foram conferidas na release 6422; OMT #1940 em duas datas, ROO #2310 em duas datas e PNMT #2423 passaram na release 262; PERR #1861 e PPMT #2980 passaram na be10. As 246 restantes continuam sujeitas à auditoria, revisão individual, promoção e readback, mantendo backup/restauração/readback como gates de release.

A revisão local da moldura v5 foi concluída em 1280, 1660 e 3320 px. Executar `ADOPS_CAPTURE_PYTHON=/caminho/python-com-Pillow node scripts/src/test-windows-frame-v5.mjs` e `node scripts/src/test-observed-tab-favicon.mjs` com o mesmo ambiente; Sol repetiu ambos com sucesso. Luna também validou template, contrato DOM, histórico, pixels, retro-content e harness 5/5. As prévias sintéticas não provam campanha nem veiculação; usam fallback explicitamente marcado. Um GET real no Chromium isolado em Perrengue resolveu o favicon CDN declarado e o converteu para PNG sem enviar cookies/auth; seu domínio, timeout, tamanho e dimensões são limitados. O canário de campanha deve ter `tabIconFallback=false`.

Inventariar primeiro por API, salvar páginas e manifest de IDs/datas/URLs/hashes/status, incluindo aprovados. Não repetir job com delivery_unknown. Antes de cada substituição salvar identidade/URL/bytes/hash/original e aprovação; manter originais arquivados no fluxo existente. Canário: uma data de #3047 e comparação visual independente de página/moldura/banner, relógios e ausência de carimbo. Gerar candidato com chave estável; auditar, persistir aprovação, promover e ler o mesmo ID/hash via status e mensal. Uma fila ou HTTP 200 não conclui.

Só após o canário aprovado executar serialmente o conjunto inventariado e autorizado, excluindo capturas diárias e originais corretos. Relatório canônico deve abrir o PNG correto e mostrar origem/data real; API status/mensal devem concordar. Download/pacote PI usa a API assíncrona obrigatória. Registrar cada falha sem nova tentativa cega.

Antes de deploy, backup oficial do banco, volumes anteriores, SHA da API/runner/web, HTML anterior e hash. Publicar o SHA testado pelos scripts oficiais. Readback: health/release SHA, runner, consumer autenticado, relatório/PNG e candidato→promoção. Se canário falhar, restaurar par de volumes anterior e HTML salvo; a promoção já compensa automaticamente readback falhado. Para substituição já aprovada, conferir ponteiro promovido e hash/bytes do original intacto antes de PATCH /api/evidences/{id} com tipo/arquivoUrl/titulo originais; repetir status/mensal/PNG. Não existe restoreAPI dedicada na base nem se copia arquivo por fora. Main só integra arquivos revisados da branch isolada; original dirty permanece intacto.
