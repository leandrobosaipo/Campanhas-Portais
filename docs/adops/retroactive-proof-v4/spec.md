# SPEC — Reconstrução retroativa v4

## Estado — 07/10, 20:57 UTC

A correção compartilhada abaixo está integrada na main 674/PR126, com CI aprovada, mas ainda não publicada. A tentativa terminou com código 28 após o switch, durante a consulta de containers; rollback CD3 e quatro serviços ativos/sem pausa foram conferidos. O GET de leitura pós-switch deve reutilizar as tentativas limitadas de `portainer_get_json`; não reenviar PUT por resposta desconhecida. Checkpoint mantido em 53/237.

## Correção compartilhada mensal — integrada, publicação pendente

Em `build-current-month-evidence-report.mjs`, `api()` deve priorizar `options.baseUrl`; sem override da chamada, respeitar `ADOPS_PUBLIC_API_BASE_URL` quando configurada. Sem essa configuração, usar `deliveryApiBase` diretamente para todas as RPCs. A ponte legada encaminha ao mesmo destino, mas aborta em 60000 ms, abaixo dos limites de 120000 ms da fonte e 360000 ms do batch. `apiBase` continua sendo a base das URLs públicas de download. Não alterar endpoints, payloads, lote de três PIs, `asOfDate`, fingerprint, idempotência ou polling.

A tentativa de publicar main8f42 parou antes da troca; readback de 07/10 19:58 UTC confirma CD3 e quatro serviços running/sem pausa. O batch do job77ca falhou com 502/503 e a validação final recusou o relatório por falta de ZIPs completos. GET da fonte/POST aceito não são entrega. Preservar esse bloqueio e consultar IDs/chaves já criados antes de nova produção.

## Histórico — 07/10, 18:26 UTC, CD3/checkpoint53

CD3 `cd3a1d3708faa34e27a96edaf37278d0f7721f6b` está publicada. Recibos `release-final-openapi-list-filters.json` e `openapi-list-filters-source-review.json`: quatro serviços running/sem pausa, backup/restauração verificados, dez filtros, OpenAPI 174 operações/157 caminhos. Checkpoint53: **53/237 confirmadas; 184 restantes** (148 não-vídeo, 26 vídeo, uma retenção técnica #2278/27Aug, nove identidades #1944); sem novas capturas, 26 protegidos fora da execução.

A correção C67 do viewport final foi entregue pelo canário #2645/24Aug e confirmada no consumidor (`2645-c67-delivered-canary.json`, `2645-c67-canary-consumer-readback.json`). #2693/AFL/PI 91159, 21–24/08, foi confirmada nas quatro datas; PI 91134/AFL tem pacote de 11 páginas PDF/JPEG validado. Em todos, os dois relógios representam a referência histórica; origem e instante real ficam fora do PNG.

O job mensal `c216f66b-f253-4124-8a23-297088b8d995` falhou com HTTP 503 na fonte de 24/08, avanço parcial 2/4, sem entrega completa. O job `5a7eb7ae-2b67-4476-9e16-e57750a8faa2` também falhou com 503; no snapshot de 07/10 às 18:50 UTC, `657af4ff-2066-4f8b-9cf7-cb72054b7810` estava `ready_for_runner`, origem não confirmada. Uma conexão foi observada em 60184 ms sem `statusCode`, compatível com interrupção no limite de 60 s; duração/conclusão da consulta à fonte não confirmada. Para #2278/27Aug, a autorização de leitura/backup SSH não removeu a recusa da tentativa real.

A correção local, ainda não publicada, encaminha apenas o GET de `evidence-monthly-source` à `deliveryApiBase` pública, com timeout de 120000 ms; `operationsBase`, demais rotas e URLs de download não mudam. O teste VM stub verifica URL, timeout e header de autorização, sem provar resposta ou latência em produção. Nenhuma conclusão/entrega mensal é inferida desses checks.

### Histórico — checkpoint38

Estado em07/10: main e aplicação `839c98963d7186e68cf1e95538bf98bbf9c61b02`, PR121/CI37617379579 e37617823529 aprovados; conferência real12:15:55UTC com backup/restauração/quatro serviços/fonte/asset/OpenAPI174/157. Cache API `private,no-store` e fetch do relatório `cache:'no-store'` publicados e conferidos. Checkpoint38/237,199 restantes=162 não vídeo liberados+1 técnico2278/27Aug+27 vídeo+9 identidades1944.

Candidato2645/24Aug020a53e9, job1791375503114-nvvrj5, recusado visualmente por relógio do site fora do PNG, apesar da aprovação automática. Não promovido; original intacto. A Task23 exigiu verificação de viewport/oclusão e prova de pixels da região do relógio após a recaptura final. Enquadramento maior é um viewport real; não permite mover relógio, cabeçalho costurado ou carimbo. A agenda64b4 era histórica e retida até novo canário completo.

#2278/27Aug permanecia retida: correção local do adaptador AdRotate converte somente a comparação de preview para o domínio de timestamp local WordPress. Não altera o instante absoluto da origem, calendário contratado ou referência20:20. Sete casos PHP e lint passaram; a fonte instalada/backup/rollback ainda não puderam ser conferidos pelo acesso SSH autorizado. Publicar a API/main não publica automaticamente essa correção no WordPress.

### Histórico — publicação64b4 e checkpoint36

Release API `64b4f560309fccc8386b19bf9333b039bda5263a`, PR119/CI37608283896/37608827821, conferida em 07/10 às10:55:27 UTC. O canário VIDEO3064/01Oct passou auditoria final, revisão individual, promoção/archive/hash/status e miniatura/modal. Checkpoint36:36/237 confirmados,201 restantes:164 não vídeo liberados,1 não vídeo retido tecnicamente (#2278/27Aug),27 vídeos retidos até a Task22 e9 identidades1944 retidas. Inclui quatro datas2278/22–25Aug com consumidor confirmado. Os26 protegidos e1157 unknown não entram na execução.

Main `11e674ba6cd94bf6d8ea70d446343572e1444bb8` integrada pelo PR120, CI37613541656/37614027155 aprovadas. HTML com `cache:'no-store'` publicado às11:31:46 UTC, hash normalizado474f67f7e24812b5b50913b73dbd80346fbcdfce2af9e7af8ed075859ccbb165; sessão, filtros, paginação e “Atualizar” preservados. A resposta mensal API `private, no-store` ainda aguarda publicação conjunta com a Task22. A API publicada ainda emite `public, max-age=30, stale-while-revalidate=120`; essa política permite reutilização de snapshot antigo por até150s. Não mudar consulta/contagens nem criar nonce; publicação e leitura fresca do consumidor são gates distintos.

Agenda `ready_video` qualificada:27 pares/10 grupos em snapshot imutável próprio com hash/release64b4 e prova do canário, excluindo3064 já confirmado. O primeiro grupo parou após AFL2645/24Aug falhar antes do upload;25/26Aug não foram executados. Não renomear como ready_nonvideo, relaxar proteção de arquivo/substituição, identidade1944 ou origem desconhecida. Liberação significa somente elegibilidade para candidato; auditoria final, revisão de cada PNG, CAS/promoção e consumer readback permanecem obrigatórios.

## Elegibilidade operacional da inserção

Antes de preparar/regenerar, ler a inserção atual. archivedAt não nulo ou supersededByInsertionId não nulo bloqueiam nova captura antes de abrir navegador/gerar mídia, para todos os callers do capturador. GET/readback e provas já persistidas permanecem acessíveis; não reescrever jobs anteriores. O operador exige os dois marcadores explicitamente nulos; o capturador conserva compatibilidade dos DTOs antigos sem esses campos, mas recusa qualquer marcador presente. Status/mídia/formato/identidade continuam sujeitos aos gates existentes.

Inventário é histórico e inclui registros protegidos; não equivale ao conjunto executável. #1826→1841 confirma arquivamento/substituição; #1860→2192 tem mídia/formato diferentes e exige preservar essa diferença. Nunca copiar PNG para a sucessora nem reativar/apagar registros por inferência.

## Identidade e relógios

Novas reconstruções usam reconstruction.provenanceVersion=4. Não criar um timestamp concorrente: requestedCaptureAt é a referência de apresentação (screenshot date/time), targetDate/date é o dia contratual, capturedAt e reconstruction.reconstructedAt são o instante real ISO com timezone. Os dois últimos continuam iguais e dentro do estágio slot_captured do job original. Fechar esse estágio somente após a última screenshot e medição do viewport, inclusive recaptura dos controles nativos; iniciar final_composed depois. Não retroceder o timestamp para caber numa etapa encerrada. historicalDisplayConfirmed=false significa que não houve comprovação independente de veiculação passada; não descreve a aparência dos relógios.

v2 mantém seu contrato legado; v3 mantém página histórica e relógio da moldura real; v4 exige ambos os relógios históricos. A exceção de v4 vale somente para historical_recovery com período, mídia, conteúdo histórico, job, URL e política correlacionados. Nenhuma exceção remove erros de outros gates. Capturas scheduled/same_day_retry continuam iguais.

API, pré-upload, validação de candidato e capturer devem reconhecer v4 explicitamente. Datas inválidas, reconstructedAt retroativo fingindo criação real, capturedAt fora do estágio, job errado ou historicalDisplayConfirmed=true continuam recusados. O PNG não recebe tarja/rodapé; a classificação e a data real permanecem nos dados e no relatório.

## Relógio no PNG final — nova validação de candidato

Para candidato historical_recovery/v4 cuja regra do servidor exige requireVisiblePageDate, a auditoria e a promoção exigem visiblePageDateAudit.version=2. Essa decisão vem do caller interno e da regra resolvida, nunca de uma opção pública ou somente dos requiredGates enviados pelo produtor. A promoção repete o gate antes de arquivar o original, inclusive quando existe aprovação de candidato anterior à correção.

- source=final_viewport_page_clock; requestedCaptureAt igual à referência registrada; renderedText corresponde à data e hora completas.
- box positivo e inteiro dentro do viewport; ancestrais visíveis e sem recorte; hit-test desobstruído. Datas de notícias e atributos escondidos não substituem texto do relógio renderizado.
- pixelAudit usa auditFinalPngSlotPixels_page_clock_roi e viewportPng_page_clock_roi. Box, crop, escala e deslocamento da moldura precisam coincidir; similaridade mínima0.82, desvio de conteúdo mínimo4 e zero issues.
- Captura definitiva ocorre antes do fechamento de slot_captured. capturedAt/reconstructedAt são registrados após essa screenshot; pageDateObserved/pageDateText vêm da prova final aprovada na lane estrita.
- Quando necessário, o viewport real cresce em altura, mantendo largura/escala e scroll0. Recalcular após o redimensionamento, pois o layout pode deslocar o alvo. A convergência é limitada a quatro passagens com duas pinturas do navegador após ajuste; somente geometria estável e inteira dentro do viewport pode ser aceita. Crescimento não convergente ou acima do orçamento falha. Usa a geometria do kit e respeita os limites existentes do candidato:40 milhões de pixels e20MiB. O PNG final repete esses limites antes do upload. Não mover relógio ou montar faixa de cabeçalho. Falhas preservam a geometria inicial/final e as tentativas nos dados de diagnóstico, sem copiar URLs assinadas ou texto da página.

A comparação de pixels verifica preservação da região; não é OCR nem prova independente de veiculação passada. Revisão visual ligada ao SHA256 continua obrigatória. Canônicos legados não recebem o novo contexto de candidato; provas novas versionadas continuam verificadas. Falha final_page_clock_unverified bloqueia a nova aprovação; candidate_final_audit_failed bloqueia promoção sem trocar a evidência. Origem e criação real permanecem fora do PNG.

## Coerência editorial AFL

Na página interna AFL, selecionar o post histórico pela origem e pathname da URL efetivamente aberta, normalizando somente a barra final e ignorando a query de preview. Não usar o primeiro post da lista. Headline e título observado da aba devem corresponder ao post selecionado antes da alteração; identidade ausente gera `article_identity_mismatch` e títulos incompatíveis geram `article_content_mismatch`. Corpo, títulos e links originais permanecem; imagem/data vêm desse mesmo post. `articleVerified` exige pathname real coerente, título visível e data normalizada, sem tomar um link sobrescrito pelo próprio reconstrutor como prova. Esse gate não declara que a reconstrução comprova veiculação passada.

A API de auditoria também deve rejeitar `article_context_mismatch` quando `pageUrl`, `retroContentManifest.expectedPosts[0].url`, `retroContentManifest.visiblePosts[0].url` e `editorialSamples[0].url` não identificarem a mesma matéria no portal configurado. Ausência ou URL inválida bloqueia. O escopo é AFL/article/historical_recovery/v4; home, rotina diária e versões antigas mantêm seus contratos. O título textual da aba é conferido no capturer; a metadata existente persiste somente `tabTitleRendered`, sem permitir que a API alegue ter comparado esse texto.

## Slots históricos ausentes: perfis delimitados

Lane publicada em be10: candidato histórico v4, referência explícita dentro do período expirado e configuração exata. PPMT1 exige `allowAuditedReconstruction=true`; PERR9 é exceção fixa somente nesse perfil novo, pois sua configuração não tem a flag, sem alterar painel/configuração ou a lane legada. Perfis: PERR9/home, `#cod5-bottom-popup-ad .g.g-9` dentro de `#cod5-bottom-popup-ad`; PPMT1/home, `div.hidden.lg\\:block .g.g-1`, mantendo a âncora desktop única existente em `#block-8` e as verificações de header visível/indisponibilidade. PERR pode criar exatamente um container conhecido quando ausente, preservando markup/estilo/botão fechar do renderer; container duplicado/ocupado bloqueia. Não ampliar `late_publication_recovery`, criar slot genérico nem substituir criativo existente.

Reutilizar o GET de status da evidência canônica. Inserção/data/sourceJobId, URL alcançável, mídia exata, grupo/contexto, pixels, visibilidade e conteúdo devem corresponder à fonte. Aceitar original aprovado ou exclusivamente `desktop_time_mismatch` no audit e `metadata_desktop_time_mismatch` no checklist; qualquer outro bloqueador recusa. Preservar a reprovação antiga. Registrar URL/job da fonte, códigos antigos e origem reconstruída fora do PNG. A API de status não fornece SHA: hashes/bytes exatos permanecem nos guards de preparação/promoção; só registrar hash no capturer se calculado dos bytes efetivamente lidos. Capturas diárias, período atual, fonte desconhecida, slot ocupado ou âncora ambígua permanecem bloqueados. A lane legada de publicação tardia/v2 mantém suas regras.

## ROO/home/grupo1: fonte legada de posição e criativo

Contrato publicado na release d1e1974; correção da âncora publicada em04cd98ba906e, canário #2641/23Aug promovido com archive/hash/status e consumidor conferidos. Somente roonoticias.com, home, grupo1, slot/contexto `.g.g-1`, candidato histórico v4 sem gravação canônica, referência explícita igual à fonte e ao preview assinado, data contratual dentro de período encerrado. Reutilizar o GET canônico: original com audit/checklist totalmente aprovados, não preliminar, zero bloqueadores, inserção/data/job/URL alcançável/mídia/contexto/pixels/identidade/visibilidade correlacionados. Hash e bytes reais do original permanecem nos guards de preparação/promoção.

A fonte parcial aceita exclusivamente retroContentProof ausente/null e timeline empty_samples, com zero amostras e zero datas interpretadas. Ausência não equivale a aprovação editorial. Fonte editorial rejeitada, falha de relógio ou qualquer outro bloqueador não entram nessa exceção. Preservar o contrato e o arquivo legados. Reutilizar `reconstruction.sourceEvidence`, acrescentando `proofScope:position_only` e `sourceEditorialProofStatus:missing_legacy`; URL/job/origem continuam identificando o original. Não duplicar objetos de prova nem atribuir manifest hash editorial à fonte sem prova.

Criar o slot somente no anchor desktop vazio e único `header .omt-header-top div.hidden.lg\:block > div.flex.justify-center > #block-8`, dentro de header único/visível e largura desktop válida. Recusar slot ocupado, anchor ausente/duplicado/oculto/mobile; nenhum fallback genérico para header/main na nova lane. O plano novo requer opt-in do candidato v4; a mesma configuração no fluxo legado v2 mantém o plano anterior.

Antes do upload, exigir marker de preview ativo e data-cutoff real equivalente a effectiveCaptureAt, por instante. Aceitar ISO com timezone ou timestamp local Cuiabá não ambíguo; ausência, formato inválido, data diferente ou marker inativo geram roo_candidate_preview_cutoff_unverified. Uma URL assinada ou uma data solicitada não substitui essa verificação do DOM. O escopo é somente ROO candidate v4; demais lanes mantêm seu contrato.

Antes do upload, o candidato novo produz a prova editorial existente: retroContentManifest, editorialSamples, retroContentProof. Exigir pelo menos três posts esperados, três amostras válidas e três matches, zero conteúdo futuro, hash de 64 hexadecimais e status aprovado. Não reduzir o mínimo por feed escasso nessa extensão. Prova ausente/rejeitada bloqueia a nova captura; não aproveitar o checklist legado como prova editorial nova. Os demais gates finais, auditoria/revisão visual/promoção/CAS/readback continuam obrigatórios. PNG sem carimbo e historicalDisplayConfirmed=false.

PERR9/PPMT1 mantêm a prova editorial original estrita e os códigos temporais autorizados; não ampliar late_publication_recovery, alterar configuração ou reinterpretar originais.

Somente no perfil `roo-desktop-top-1`, âncora vazia permite nós de texto com espaços e no máximo um comentário literal do AdRotate: `Erro, o Anúncio não está disponível neste momento devido às restrições de agendamento/geolocalização!`. Preservar esses nós ao acrescentar o slot. Texto não vazio, outro comentário, comentário duplicado ou elemento filho bloqueiam. A presença desse comentário não comprova veiculação nem dispensa fonte, preview e prova editorial.

A API final também verifica o contrato position_only, antes da promoção. Exige perfil ROO/home/grupo1/historical_recovery/v4, configuração allowAuditedReconstruction/requireRetroContentProof habilitada e sourceEditorialProofStatus=missing_legacy. Recalcula pelo menos três matches de URLs HTTPS da origem ROO, datas esperadas/amostras válidas sem futuras e contagens inteiras mínimas; hash64 e status aprovado permanecem obrigatórios. Ausência/divergência gera partial_source_editorial_unverified e common.ok=false; não confiar só no status declarado pelo capturer.

## Coleta AFL e diagnóstico de falha

O fetch WordPress deve conservar o ID numérico real do post na normalização. Testar a resposta REST bruta pelo caminho de fetch padrão, sem injetar posts já normalizados. ID ausente/zero continua bloqueado; não gerar um ID substituto.

O collector AFL/article reconstruído deve persistir expectedPosts e editorialSamples da mesma matéria selecionada pela URL efetivamente aberta e título verificado. A lista geral do WordPress não pode manter outro post em expectedPosts[0]. Validar origem HTTPS configurada, pathname real, post identificado e fonte afl-wp-rest; ausência/divergência falha com retro_content_article_identity_unverified. A API mantém article_context_mismatch, inclusive quando o PNG é coerente mas o manifest esperado é de outra matéria.

nativeProgressAudit e finalPngProgressAudit precisam permanecer no escopo de main acessível pelo catch. Preservar as medições disponíveis nos dois caminhos de diagnóstico/outbox, sem ReferenceError ocultando a falha original e sem converter diagnóstico em aprovação.

## Proveniência mensal

A fonte mensal não pode declarar auditoria final com base apenas em captureProofLogs.status=ok. Metadata preliminary=true ou checklistValidation.preliminary=true não é prova final. Nas novas promoções, persistir checklist final no finalLogId após audit. Para logs existentes, usar somente promotion.status=approved e audit final aprovado com finalLogId, insertionId, targetDate, sourceJobId, URL, hash/bytes do candidato correlacionados; consulta em batch na mensal. Nunca aproveitar metadata de outra inserção/data/arquivo/job nem transformar preliminary em final por ordenação. Status e mensal compartilham a resolução pura, sem reescrever legado durante leitura; sem fonte confiável, manter provenance_unverified.

A resolução de recibo é adicional: históricos runner com metadata final já aprovada e correlação válida mantêm seu contrato. Não exigir recibo de promoção para capturas que não vieram de candidato. O readback de nova promoção ainda em awaiting_readback deve funcionar pelo snapshot final recém-persistido. A API mensal expõe requestedCaptureAt:string|null somente de proof confiável/correlacionado e timestamp válido, junto de capturedAt real. O relatório distingue origem, referência visual e momento real de geração.

## API e operação

Criação: POST /api/insertions/{id}/capture-proof/jobs, candidate=true, promote=false, replace=false, date, captureAt preservado e Idempotency-Key estável. Novo job responde 202; a repetição da mesma chave responde 200 com o job existente. POST candidate=true,promote=true continua 409 candidate_promotion_requires_persisted_approval. Conclusão do job candidato representa captura para revisão; não significa evidência canônica aprovada.

Promoção: POST /api/internal/insertions/{id}/capture-proof/candidates com sourceJobId; POST /api/internal/capture-proof-candidates/{candidateId}/audit; POST /api/internal/capture-proof-candidates/{candidateId}/promote. candidateId é UUID string. O job precisa ser concluído, candidato e conter estágio/URL válidos. Aprovação persistida e hash/bytes/readback são obrigatórios. Credenciais só no servidor, nunca no HTML. Rota pública usa a sessão já implementada.

Substituição na mesma rota promote: `replaceHistoricalPresentation` explicita evidenceId, arquivoUrl, sha256 e bytes esperados da evidência canônica, com shape estrito. Sem esse objeto, `canonical_already_approved` permanece. A exceção aceita somente canônico classificado pela auditoria final atual como historical_recovery, fora do par completo proveniência v4/moldura v5, e candidato aprovado dentro desse par. Captura diária ou evidência já no contrato novo nunca recebem esse bypass; um log histórico antigo não autoriza a troca de canônico diário. O hash atual e o archive devem coincidir com a expectativa; locks/revisão/aprovação, compensação e leitura pública continuam. Recibo e log de promoção registram reason=presentation_upgrade e expectedOriginal com identidade/hash/bytes; GET promotions expõe essa projeção compacta. Não apagar nem invalidar o canônico para viabilizar a substituição.

Preservar captureAt/requestedCaptureAt original nos upgrades. Jobs comuns da UI omitem reconstructionReason: late_publication_recovery não é o motivo genérico de uma imagem ausente e exige fonte específica confirmando publicação tardia. Esse motivo continua opção explícita documentada da API, sem ser aplicado indiscriminadamente pelo consumidor.

Rollback de ponteiro usa a rota existente `PATCH /api/evidences/{id}` com tipo/arquivoUrl/titulo originais, após conferir que o canônico ainda é o promovido e que o objeto original preservado corresponde ao hash/bytes salvos. Revalidar status/mensal/PNG depois. A promoção já implementa compensação automática no readback falhado. Não existe rota dedicada de restore na base atual; não afirmar que exista. Não executar gravação externa no storage para contornar esse contrato.

Inventário implementado e revisado: GET `/api/insertions/capture-proof/audit?scope=historical_inventory&limit=50&cursor=<id>`, reutilizando a rota existente com consulta projetada antes do enriquecimento legado. Limite padrão 50, máximo 200; cursor positivo até 2147483647 e paginação estável por evidenceId. Consulta somente evidências `tipo=print`, seleciona a mais recente por inserção/data e preserva cada ID sem data como unknown/targetDate=null. Retorna identidade, classe, versões de proveniência/moldura, URL, requestedCaptureAt, capturedAt real correlacionado, status persistido e próxima página. nextCursor deve ser seguido mesmo quando a página fica vazia após excluir capturas diárias.

Inclui históricos aprovados e origens desconhecidas separadamente; não infere histórico por data UTC. A correlação usa log/URL/job e, quando aplicável, recibo final aprovado de identidade/hash/bytes exatos. Logs ficam limitados aos 50 mais recentes por par; status pending/unknown não é uma auditoria viva recomputada. A consulta não executa captura, auditoria remota por item, enriquecimento global nem retorna DOM/base64/secrets. Sem scope, a auditoria legada continua com seu próprio contrato. Antes de substituir uma evidência, usar os gates vivos de candidato/promoção e o canário do harness.

## Player de vídeo

No hit-test CDP, converter somente o centro da timeline de coordenadas viewport para documento, somando scrollX/scrollY medidos junto ao retângulo no mesmo Runtime.callFunctionOn. Conservar `nativeProgressAudit.box` no viewport para a ROI do PNG; não somar scroll à comparação de pixels. Oclusão desconhecida ou cobertura real continuam bloqueadas. A Task22 corrige essa conversão, sem mudar o piso0.82, a proveniência ou o contrato da API.

O bloqueio de rotação usa `data-adops-capture-active-ad="1"` no criativo selecionado. Os dois passes de `forceMatchedAdVisible` devem gravar esse valor exato e remover o atributo dos inativos. Atributo vazio não satisfaz o seletor CSS e mantém `pointer-events:none` no player. Não corrigir esse erro relaxando a auditoria de oclusão ou reativando anúncios inativos.

Para reconstrução VIDEO com `reconstruction.provenanceVersion=4`, `videoProof` isolado não basta. `nativeProgressAudit` no topo da metadata tem `version=1`, `source=chromium_ua_shadow_timeline`, identifica o INPUT range de pseudo `-webkit-media-controls-timeline` dentro do vídeo correto e mede value/max contra currentTime/duration com tolerância de 0,25 segundo. A visibilidade considera ancestrais, opacidade efetiva, viewport, limites do vídeo e oclusão exatamente `clear`; `visibleRatio` é a menor fração entre largura/altura após clipping e deve ser finita, pelo menos 0,95. O vídeo é pausado antes da captura e `videoProof` recebe tempo/duração/paused/controls medidos no mesmo estado final. `artificialOverlayCount=0` é medido no DOM. Não usar `aria-valuetext`, que ficou desatualizado na fixture Chromium, nem o atributo `controls` como prova de pixels.

`finalPngProgressAudit` reutiliza `auditFinalPngSlotPixels` na ROI dessa timeline, comparando viewport capturado após hover com o PNG final. A ROI, escala e offset da moldura devem coincidir com a medição nativa. A barra nativa exige `minSimilarity >= 0.82`; o capturador aplica esse piso na função compartilhada e preserva configurações mais rigorosas. O limiar do slot geral, como0.48, permanece independente e não pode reduzir a exigência da barra. Conteúdo útil mantém os critérios existentes. A API/checklist compartilham a decisão, rejeitam ROI diferente, pixel audit ausente/falho, barra oculta/coberta e overlay artificial. Os checks genéricos de conteúdo pintado ou similaridade do slot inteiro não comprovam, sozinhos, a barra nativa. É obrigatória a revisão visual independente do PNG exato antes da promoção.

O gate novo aplica-se a VIDEO v4. v2/v3 e capturas diárias conservam o contrato persistido; a auditoria identifica a origem legada da barra, sem declarar nativa uma barra artificial. Imagens/GIFs não recebem esse gate. O candidato #3064 de 01/10/2026 da release `6422f688968796544d84408f0632f2d770566d30` foi concluído e tecnicamente aprovado pelo contrato anterior, mas rejeitado visualmente por duas barras; ele permanece candidato, sem promoção. Não alterar esse job para `failed` nem reescrever sua auditoria para justificar outra chave.

Uma nova tentativa desse candidato exige rejeição visual explícita ligada ao ID/job/release/PNG SHA-256/bytes, readback sem promoção e canônico original intacto. O helper operacional privado permite esse caso somente com `--supersede-visually-rejected` em um novo SHA revisado e publicado, grava o vínculo antigo→novo e conserva os registros anteriores. Request sem ACK, job em execução, resultado desconhecido, aprovação visual ou intento/recibo de promoção continuam bloqueando. A nova captura é candidata e repete auditoria, revisão visual, promoção persistida e readback; não existe endpoint de supersession nem mudança de estado fictícia.

## Moldura

Nova apresentação é distinguível pelo kit `windows11-chrome-light-similar-v5`; aceitar kit anterior v4 sem reinterpretá-lo. Preserva o viewport real, a seleção do slot e o checklist; alturas e offsets da moldura vêm do layout e da metadata do kit efetivamente usado. Gerar em resolução adequada, evitar ampliar raster 1280 para saída 3320; relógio em duas linhas hh:mm e dd/MM/yyyy no extremo direito. Toolbar usa SVGs oficiais/licenciados ou desenhos vetoriais, nunca glifos Unicode. URL/título/logo são reais; fonte e ícones têm origem/licença. O usuário autorizou Selawik e recursos gráficos abertos; a moldura é reconstruída e não pode ser anunciada como screenshot nativo de Windows nem como Segoe UI original. Não adicionar clima, perfil ou abas fictícios.

Favicon da aba v5 usa o link de ícone efetivamente observado no DOM público, com URL/fonte registrada. A marca local de proporção 4:1 não deve ser recortada nem apresentada como favicon presumido. O fetch não transmite cookies ou headers AdOps; admite a mesma origem e somente a CDN explicitamente conhecida do portal, com HTTPS, timeout e limites de bytes/dimensões. Hosts arbitrários e redirecionamentos continuam recusados. Se a fonte estiver ausente ou inválida, `tabIconFallback=true` indica fallback gráfico e o gate existente de evidência final continua bloqueando. Dock central e controles vetoriais não indicam aplicativos extras abertos; não fabricar favoritos, perfil ou clima.

As origens externas permitidas são pareadas com o domínio configurado, que deve coincidir com o hostname observado da página (ou seu `www`):

| Domínio do portal | Origem externa exata |
| --- | --- |
| afolhalivre.com | https://afolhalivre.nyc3.digitaloceanspaces.com |
| roonoticias.com | https://roonoticias.nyc3.digitaloceanspaces.com |
| perrenguematogrosso.com | https://cdn.perrenguematogrosso.com |
| portalnortemt.com | https://portalnortemt.nyc3.digitaloceanspaces.com |
| portalpantanalmt.com | https://portalpantanalmt.nyc3.digitaloceanspaces.com |

O Matogrossense usa o ícone declarado na mesma origem. Não há wildcard de buckets. Se o fetch do navegador falhar para uma origem externa permitida, a coleta Node usa somente o mesmo URL observado no DOM, revalidado como HTTPS, sem userinfo ou porta não padrão. Não recebe URL do operador nem reutiliza cookies, Authorization ou headers do capturer; bloqueia redirect, exige MIME de imagem e limita timeout a 3 s, stream a 1 MiB e imagem decodificada a 512×512. A conversão final conserva a fonte real do link. Os headers de cache são retirados só no scope do favicon e restaurados em `finally`; falha de restauração reprova a coleta.
