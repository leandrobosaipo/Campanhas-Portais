# PRD — Reconstrução retroativa v4

## Continuação comprovada — 07/10, 19:58 UTC

A publicação do PR125/main `8f42d460e8952f12c2145dea511228bd530ed4b8` parou no preparo do volume web, antes da troca dos serviços. Backup e restauração completos passaram; o runner CD3 foi reativado e os quatro serviços anteriores estão running/sem pausa. Main atualizada não equivale a aplicação publicada. Permanecem 53/237 evidências confirmadas, com 184 pendentes.

O relatório mensal `77ca4a4c-2c57-4cd4-9639-5ac96e571f8d` falhou em 19:44 UTC porque faltaram ZIPs completos após erros 502/503 no batch. O GET da fonte chegou a responder 200; corrigir somente esse GET não resolve as chamadas de exportação. A próxima correção local deve retirar a ponte legada de 60 s das RPCs padrão, preservando bases explicitamente configuradas, links públicos, corte histórico e idempotência. Não liberar relatório sem ZIP completo nem reenviar jobs de resultado desconhecido.

## Problema e decisão

O usuário confirmou em 06/10/2026 que os dois relógios visíveis de uma nova reconstrução devem representar a data e hora contratadas. O PNG não deve ter carimbo, faixa ou rodapé de reconstrução. A origem reconstruída e o instante real de criação continuam acessíveis nos dados e no relatório; não há declaração de que uma reconstrução prove veiculação passada.

A v3 legada mostra a referência histórica na página e o instante real na moldura. A v4 introduz o novo comportamento sem reinterpretar arquivos v2/v3, capturas agendadas ou retries do próprio dia. Outra falha confirmada ocorre quando a fonte mensal usa metadata preliminar mesmo após auditoria final aprovada do mesmo artefato, como em #3047 em 01/10/2026.

## Resultados e critérios de aceite

- Nova reconstrução: ambos os relógios representam requestedCaptureAt em America/Cuiaba; capturedAt e reconstruction.reconstructedAt representam o instante real e correlacionam com o job.
- Nenhum carimbo adicional no PNG. Origem reconstruída e data real ficam no relatório e na API.
- Auditoria, corte editorial, criativo esperado, checklist, hashes e aprovação persistida permanecem obrigatórios.
- Página interna AFL mantém URL, título da aba, headline, imagem e corpo da mesma matéria. Um post histórico diferente não pode substituir parcialmente a matéria aberta; identidade ausente ou títulos incompatíveis bloqueiam a reconstrução.
- Nos perfis PERR9/pop-up inferior e PPMT1/topo desktop, slot ausente exige candidato histórico v4, período expirado e original correlacionado com provas válidas de mídia, posição, pixels e conteúdo. Aceitar original aprovado ou exclusivamente rejeitado pelo relógio antigo não transforma o original rejeitado em aprovado.
- ROO/home/grupo1: original legado totalmente aprovado, com prova editorial ausente e empty_samples/zero amostras, comprova somente posição e criativo. O candidato novo exige três posts esperados, três amostras e três matches válidos, zero conteúdo futuro, hash editorial de 64 hexadecimais e prova editorial aprovada antes do upload. Não atribuir conteúdo comprovado ao original nem ampliar os perfis PERR/PPMT. Âncora sem elementos pode conservar espaços e um único comentário literal conhecido do AdRotate.
- Mensal e status utilizam a mesma evidência final correlacionada; uma auditoria preliminar não suplanta a final. Ausência ou identidade divergente continua bloqueada.
- Moldura legível, proporcional e neutra, com URL/título reais e relógio em duas linhas à direita; sem clima, perfil ou abas inventados. Assets têm licença registrada.
- Inventário por API identifica o conjunto retroativo completo, inclusive aprovados, com paginação limitada e sem retornar DOM/base64 ou secrets.
- Correção de arquivos existentes usa candidato, auditoria e promoção persistida, com backup, hash e readback. Evidências antigas não são alteradas apenas pela mudança de política.
- Inserção arquivada ou com vínculo de substituição não gera nova captura operacional. Conferir identidade/estado atual antes do lote e bloquear na execução comum antes de abrir navegador. Preservar provas/GET/readback e registros antigos; não transferir imagem para sucessora ou declarar duplicidade idêntica apenas pelo vínculo.
- Vídeo v4 mostra uma única barra nativa do player. Auditoria exige timeline nativa visível, desobstruída e preservada nos pixels finais, com piso de similaridade0.82 próprio para a barra; o limiar do banner não o reduz. `controls=true` ou barra artificial não comprovam esse resultado. Revisão visual individual continua obrigatória.
- Main e release publicada correspondem ao SHA validado; relatório canônico mantém contagens, campanhas encerradas, filtros e download.

## Checkpoint

Última conferência comprovada em 07/10 às 18:26 UTC, checkpoint53: **53/237 confirmadas; 184 restantes** (148 não-vídeo, 26 vídeo, uma retenção técnica #2278/27Aug e nove identidades #1944). CD3 `cd3a1d3708faa34e27a96edaf37278d0f7721f6b` está publicada; `release-final-openapi-list-filters.json` e `openapi-list-filters-source-review.json` registram quatro serviços running/sem pausa, backup/restauração, dez filtros e OpenAPI 174/157. Sem novas capturas desde o checkpoint; os26 protegidos permanecem fora da execução.

A correção C67 de enquadramento final foi validada pelo canário #2645/24Aug, com auditoria, revisão visual, promoção e consumidor confirmados (`2645-c67-delivered-canary.json` e `2645-c67-canary-consumer-readback.json`). #2693/AFL/PI 91159, 21–24/08, foi confirmada nas quatro datas (`2693-four-c67-consumer-readback.json`). PI 91134/AFL foi entregue/validada com 11 páginas PDF/JPEG, zero PNG e checksums.

O job mensal `c216f66b-f253-4124-8a23-297088b8d995` falhou com HTTP 503 na fonte de 24/08 após avanço parcial 2/4; não é entrega completa. O job `5a7eb7ae-2b67-4476-9e16-e57750a8faa2` também falhou com 503. No snapshot de 07/10 às 18:50 UTC, `657af4ff-2066-4f8b-9cf7-cb72054b7810` estava `ready_for_runner`, ainda sem confirmação da origem. Uma conexão foi observada em 60184 ms sem `statusCode`, compatível com interrupção no limite de 60 s; a duração/conclusão da consulta à fonte não foi confirmada. #2278/27Aug continua retida: leitura/backup via SSH foram autorizados, mas a tentativa real foi recusada.

O cliente mensal foi ajustado localmente para encaminhar somente o GET de `evidence-monthly-source` pela `deliveryApiBase` pública com timeout de 120000 ms. `operationsBase`, as demais rotas e as URLs de download permanecem preservados. O teste VM verifica rota, limite e autenticação com fetch simulado; não comprova latência/resposta viva nem conclusão do relatório mensal.

### Histórico — checkpoint38

Estado de 07/10: **38/237 confirmadas;199 restantes** (162 não vídeo liberadas,1 retenção técnica2278/27Aug,27 vídeos e9 identidades1944 retidas). Main e aplicação839c publicadas; backup/restauração/quatro serviços/fonte/asset/OpenAPI conferidos. Cache mensal API e cliente no-store conferidos no consumidor. Os26 protegidos continuavam fora da execução.

O candidato2645/24Aug da release839c passou na API, mas foi recusado visualmente porque o relógio do site ficou fora do PNG. Original preservado; nenhuma promoção. A correção Task23 exigiu visibilidade e prova de pixels no instante final. Enquadramento mantém o relógio original e o anúncio em viewport real, sem mover relógio, desenhar carimbo ou costurar cabeçalho. Uma data de notícia não substitui o relógio do site.

### Histórico — checkpoint32

Em 07/10/2026, checkpoint32: **32/237 correções confirmadas; 205 restantes** (169 não vídeo prontos, 27 vídeos aguardando agenda e 9 identidades1944 retidas). Release `64b4f560309fccc8386b19bf9333b039bda5263a` publicada às10:55:27 UTC pelo PR119, CI37608283896/37608827821 aprovadas; quatro serviços/fonte/asset/OpenAPI174/157 e backup fresco/restauração completa conferidos. VIDEO3064/01Oct passou em auditoria final, PNG individual, promoção `a4012955-4f98-4b5e-926f-aa2a574b253b`, archive/hash/status e miniatura/modal. Job `1791370618360-irjtai`, candidato `452e8465-2651-4eac-b5fa-fa2ab47a59b7`; prova privada `video-canary-64b4-completion-proof.json`, SHA256 `a1a35cd1b150f2c9fd1bc67d4c53e980a26887f48cd626474af82625fd7547f6`.

“Atualizar” deve consultar estado atual preservando autenticação e paginação. Correção local de cache (API private/no-store e fetch no-store) ainda não publicada. A agenda futura libera somente vídeos qualificados como ready_video, vinculados à release/prova do canário; cada imagem mantém seus próprios gates. Origem reconstruída e criação real permanecem fora do PNG; não inferir veiculação passada.

### Histórico — checkpoint26

Em 07/10/2026: **26/237 correções confirmadas; 211 restantes**. Main04cd98ba906ec57efc86ffd1a44390b5c666c5c2 publicada pelo PR117, CI37594453308 aprovada; dump novo/restauração completa/quatro serviços/fonte/JavaScript público/OpenAPI conferidos às08:50:26 UTC (`release-final-retro-canary-followup.json` privado). AFL #2692/21Aug e ROO #2641/23Aug auditadas, revisadas, promovidas e conferidas no consumidor. VIDEO #3064/01Oct continua sem promoção: a recaptura final ocorreu 2071 ms após o fechamento de slot_captured; API recusou o registro. Corrigir a ordem das etapas, sem alterar instante real ou relaxar proveniência. Não contar testes locais ou PNG concluído como entrega de evidências.

## Fora do escopo

O inventário original contém263 pares; a qualificação dos53 IDs separou237 operáveis e26 protegidos (#1826:12; #1860:14). As quatro reconstruções já promovidas em1826 foram preservadas como histórico e não aumentam a contagem de entrega no relatório. Nenhuma das26 entregas confirmadas pertence a inserção protegida.

Não sincronizar planilha, alterar PI/AdRotate, desativar rotação, enviar Telegram ou mudar autenticação. Não instalar bibliotecas nem copiar fontes proprietárias sem licença. O usuário confirmou ícones abertos oficiais, medidas fiéis e Selawik existente; não se afirma que esses assets sejam Windows/Segoe UI originais.
