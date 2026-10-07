# Prints Retroativos

## Mídia efetivamente visível — 07/10/2026

O preparo de mídia deve usar interseção positiva com o viewport real: largura e altura positivas, bottom>0, top<altura, right>0 e left<largura. Não contar os120px abaixo da imagem como viewport. Esse predicado atende imagens, fundos e vídeos; a validação própria da mídia do slot continua obrigatória. Um vídeo com1px visível entra na auditoria e deve estar carregado. Não alterar playback/load para contornar o gate.

#2693/29Aug job1791410115391-jhwe8k revelou a diferença: vídeo y1277 fora do PNG de1200px, contado1/0 pelo predicado antigo. Falhou antes do upload; original preservado. A correção é local e depende de nova publicação/canário;30/31nãoexecutados. O lote25–28/08 está entregue no consumidor: checkpoint57/237,8/11 capturas nessa inserção.

O modal deve apresentar a imagem alinhada ao topo e centralizada horizontalmente, mantendo proporção e PNG integral. A faixa preta superior observada vinha do alinhamento vertical da janela, não do arquivo. Origem e data real continuam nos detalhes, fora do PNG; nenhum carimbo adicional.

## Continuação — 07/10/2026, 20:57 UTC

PR126 está na main 674, com CI aprovada. A publicação encerrou com código 28 na consulta de containers após a troca; o rollback foi executado. Readback independente confirmou CD3, quatro serviços ativos/sem pausa e API/web saudáveis. Nenhum PNG foi substituído nessa tentativa: **53/237 confirmadas; 184 restantes**. Não executar lotes dependentes nem declarar 674 publicado antes de nova publicação qualificada.

## Histórico — 07/10/2026, 19:58 UTC

As 53/237 correções confirmadas e o pacote PI91134/AFL permanecem preservados. A aplicação continua na release CD3: o deploy8f42 parou antes da troca dos serviços e restaurou o runner. Atualização de main/CI não comprova publicação.

O relatório mensal77ca falhou por ZIPs completos ausentes após batch502/503, apesar de um GET200 da fonte. A correção seguinte deve remover a ponte de 60 s das RPCs padrão do gerador, sem mudar bases explicitamente configuradas, URLs de download, corte histórico ou idempotência. Publicação exige os ZIPs e readback; não relaxar o gate nem reenviar resultados desconhecidos.

## Contrato de apresentação v4 — decisão de 06/10/2026

Para novas reconstruções `historical_recovery`, a proveniência v4 usa
`requestedCaptureAt` como data/hora visível na página **e** na moldura do desktop,
em `America/Cuiaba`. O PNG não recebe carimbo, faixa ou rodapé de reconstrução.
`capturedAt` e `reconstruction.reconstructedAt` continuam sendo o instante real
de criação, correlacionado com o job, disponível na API e no relatório junto da
origem reconstruída. Isso não comprova sozinho que o banner foi veiculado naquela
data; `historicalDisplayConfirmed=false` continua indicando essa limitação.

Esse contrato aplica-se a novas capturas v4, depois do rollout validado.
Não reinterpreta v2 legado, v3 (página histórica e relógio da moldura real),
capturas `scheduled` ou `same_day_retry`, nem altera arquivos antigos.
As instruções históricas abaixo devem ser lidas conforme a versão do artefato.
Substituições atuais usam candidato, auditoria e promoção persistida com backup,
hash e readback; não apagar evidência aprovada para solicitar outra captura.

Contrato e validação: [PRD](./adops/retroactive-proof-v4/prd.md),
[SPEC](./adops/retroactive-proof-v4/spec.md),
[HARNESS](./adops/retroactive-proof-v4/harness.md).

### Última conferência comprovada — 07/10/2026, 18:26 UTC, CD3/checkpoint53

CD3 `cd3a1d3708faa34e27a96edaf37278d0f7721f6b` está publicada e conferida. Os recibos `release-final-openapi-list-filters.json` e `openapi-list-filters-source-review.json` registram quatro serviços ativos/sem pausa, backup/restauração verificados, dez filtros e OpenAPI com 174 operações/157 caminhos.

Há **53/237 pares confirmados; 184 restantes**: 148 não-vídeo, 26 vídeo, uma retenção técnica (#2278/27Aug) e nove retenções de identidade (#1944). Os 26 protegidos e 1157 origens desconhecidas continuam fora da execução. Não houve novas capturas desde o checkpoint53.

C67 entregou o canário de vídeo #2645/24Aug após a correção do viewport final: os dois relógios históricos, a barra nativa e os pixels passaram; promoção e consumidor foram conferidos. A reconstrução #2693/AFL/PI 91159 de 21–24/08 também está confirmada nas quatro datas. A origem reconstruída e o instante real de criação permanecem nos dados e no relatório, fora do PNG. O pacote PI 91134/AFL foi entregue e validado com 11 páginas PDF/JPEG, zero PNG e checksums conferidos.

#2278/27Aug segue retida: a leitura/backup SSH dos quatro arquivos foi autorizada pelo usuário, mas a tentativa real continuou recusada. Os jobs mensais `c216f66b-f253-4124-8a23-297088b8d995` e `5a7eb7ae-2b67-4476-9e16-e57750a8faa2` falharam com HTTP 503 na fonte de 24/08; avanço parcial 2/4 não é entrega completa. No snapshot de 07/10 às 18:50 UTC, `657af4ff-2066-4f8b-9cf7-cb72054b7810` estava `ready_for_runner`, ainda sem origem confirmada. Uma conexão foi observada em 60184 ms sem `statusCode`, compatível com interrupção no limite de 60 s; a duração/conclusão da consulta à fonte não foi confirmada. Correção local desse cliente está pendente.

### Histórico — consumidor em07/10/2026, checkpoint38

Main e aplicação839c publicadas pelo PR121, CI aprovada, backup/restauração e quatro serviços/fonte/asset/OpenAPI conferidos. Cache mensal API e cliente no-store confirmado. Havia38/237 pares confirmados;199 restantes=162 não vídeo liberados+1 técnico2278/27Aug+27 vídeos+9 identidades1944. Os26 protegidos continuavam fora do lote.

O candidato2645/24Aug020a53e9 passou na API, mas foi recusado visualmente porque o relógio do site ficou fora do PNG. Original preservado, sem promoção. A correção exigiu o relógio original completamente visível, sem cobertura, na última captura e na composição final. Usou viewport real mais alto quando necessário; não permitiu mover o relógio nem acrescentar carimbo ou faixa de cabeçalho. Datas de notícias não substituem esse relógio. Origem e criação real continuam nos dados e no relatório.

### Histórico — consumidor em07/10/2026, checkpoint32

Release `64b4f560309fccc8386b19bf9333b039bda5263a` (PR119) conferida às 10:55:27 UTC; CI `37608283896`/`37608827821`, quatro serviços/fonte/asset/OpenAPI174/157 e backup fresco/restauração completa aprovados. Há 32/237 pares operáveis confirmados e 205 restantes: 169 não vídeo prontos, 27 vídeos aguardando agenda própria e 9 alvos `#1944` retidos. Os 26 protegidos ficam fora do lote.

VIDEO `#3064`/01/10 foi confirmado: job `1791370618360-irjtai`, candidato `452e8465-2651-4eac-b5fa-fa2ab47a59b7`, promoção `a4012955-4f98-4b5e-926f-aa2a574b253b`; auditoria final sem issues, PNG individual, archive/hash/status e miniatura/modal. Prova privada `video-canary-64b4-completion-proof.json` (SHA256 `a1a35cd1b150f2c9fd1bc67d4c53e980a26887f48cd626474af82625fd7547f6`). Não repetir esse par nem aprovar os outros vídeos por inferência.

Correção de atualização do mensal está local, ainda não publicada: API `private, no-store` e fetch `cache:'no-store'`, preservando sessão e paginação. Agenda dos demais vídeos será separada como `ready_video`, mantendo auditoria/revisão/promoção/readback individuais.

### Histórico — consumidor em 07/10/2026, 10:32 UTC

Release `606cf05b70ee076bc613ef4d7bb5529f2d9c0b61` (PR118) foi conferida ao vivo às 10:08:36 UTC; CI `37601313114` e `37601935185` passou. Neste snapshot do consumidor há 30/237 pares operáveis confirmados; dos 207 restantes, 170 não vídeo estão prontos, 28 vídeos estão retidos e 9 alvos `#1944` aguardam resolução de identidade. Os 26 pares protegidos permanecem fora do lote. AFL `#1842`/22–25/08 está confirmada após auditoria, promoção com arquivamento dos originais, readback de status/hash e conferência de quatro miniaturas/modais em que as imagens carregaram a 3320×2696; já está incluída nos 30.

Após a publicação, o canário `#3064`/01/10, capturado às 10:10:04 UTC (`1791367753908-7m0esk`, candidato `f0c33dbd-4b60-4d5e-96a6-1ef8f084dc46`), passou proveniência 12/12 e verificações nativas/pixels, mas foi bloqueado porque o limiar de similaridade da barra nativa era `0.48`, abaixo do piso da API `0.82`; não foi promovido. A correção local ajusta esse piso sem alterar limites maiores nem o limiar desta regra do slot `0.48`. Os 10 cenários nativos passaram e a revisão independente aprovou a mudança, que ainda não foi publicada. Não contar o candidato como entrega.

### ROO/home/grupo1: fonte parcial e canário conferido

Um original legado totalmente aprovado para posição/criativo, sem prova editorial
e com empty_samples/zero amostras, pode sustentar apenas essa parte da reconstrução
ROO/home/grupo1. A origem e a ausência editorial antigas permanecem registradas em
reconstruction.sourceEvidence (proofScope=position_only,
sourceEditorialProofStatus=missing_legacy). O candidato v4 novo exige referência
explícita, período encerrado, fonte exata e anchor desktop único/vazio/visível;
antes do upload deve produzir três posts/amostras/matches, zero futuros, hash64 e
prova editorial aprovada. Sem carimbo ou alegação de veiculação passada.

O contrato foi publicado em d1e1974. A correção04cd98ba906e permite somente espaços e zero/um comentário literal conhecido de indisponibilidade AdRotate na âncora, preservando nós; demais conteúdos continuam bloqueados. ROO #2641/23Aug foi auditado, revisado e promovido, com original arquivado, hash/status e miniatura/modal conferidos.

Em vídeo, `slot_captured` inclui a última recaptura nativa e sua medição. `capturedAt`/`reconstructedAt` registram esse instante real; `final_composed` começa depois. O estado do job #3064/01/10 em 04cd, recusado no registro porque a etapa fechava 2071 ms antes da recaptura, é um diagnóstico histórico. O candidato posterior da release606 foi bloqueado pelo piso de similaridade descrito no histórico acima e não foi promovido. Sua metadata permanece intacta; o candidato novo64b4 foi confirmado no checkpoint31.
PERR/PPMT mantêm prova editorial original estrita; não ampliar publicação tardia.
Critérios completos e negativos estão na SPEC/HARNESS acima.

## Escopo do fluxo legado abaixo

As seções de preview e operação abaixo registram o fluxo implantado em abril de
2026 e o contrato histórico v2. Elas descrevem `captureAt`/`adops_preview_at`
como referência para renderizar o conteúdo do portal; esse valor não é o instante
real da captura. Para novas reconstruções v4, prevalece o contrato no início
deste documento e na [SPEC v4](./adops/retroactive-proof-v4/spec.md):
`requestedCaptureAt` aparece nos relógios do site e do desktop, enquanto
`capturedAt` e `reconstruction.reconstructedAt` permanecem tempos reais na API
e no relatório. O PNG não recebe carimbo. A entrega final continua assíncrona:
`full-pdf`/`web`, leitura até `completed` e download validado; ACK ou criação do
job não comprova a entrega.

## Objetivo

Antes de gerar um novo print, conferir a inserção atual: registros arquivados ou com supersededByInsertionId ficam fora do lote operacional. O capturador bloqueia esses marcadores antes de abrir o navegador. Preservar provas antigas e GET/readback; não reativar ou copiar a imagem para a sucessora. Inventário histórico pode incluir esses registros e deve ser qualificado antes da execução.
Permitir gerar provas visuais retroativas com data e hora simuladas, para que o print mostre:
- a primeira dobra completa do site
- o banner correto da insercao
- as noticias publicadas ate o momento simulado
- a data/hora exibida no cabecalho e na moldura do desktop em pt-BR

O contrato atualizado de API, checklist, extracao, nomes e entrega esta em
[`adops/evidence-print-delivery-api.md`](./adops/evidence-print-delivery-api.md).

## Como funciona
1. O AdOps passa `captureAt` para a rotina de captura.
2. A rotina adiciona `adops_preview_at` na URL aberta pelo Playwright.
3. Nos portais que tiverem o preview implantado, um mu-plugin converte esse parametro em um timestamp simulado.
4. O tema usa esse timestamp no cabecalho.
5. O AdRotate usa esse timestamp para validar schedule dos anuncios.
6. O WordPress limita os loops de posts para exibir apenas conteudo publicado ate aquele momento.
7. Para banner interno, o capturador consulta os posts publicados ate `captureAt`
   em `/wp-json/wp/v2/posts`; a descoberta pela home fica como fallback.

O resolvedor de pagina interna aceita apenas materia publicada no mesmo dominio.
Se nao existir materia elegivel para a data, o print falha em vez de reutilizar
uma materia atual ou de outro portal.

## Estado atual
- AdOps aceita `captureAt` na captura individual e em lote.
- Perrengue local recebeu o mu-plugin de preview retroativo.
- OMT local recebeu o mu-plugin de preview retroativo.
- AdRotate local de Perrengue e OMT passou a respeitar o tempo simulado no frontend.
- Cabecalho de Perrengue e OMT local passou a respeitar o tempo simulado.
- Perrengue publico recebeu o rollout em `10/04/2026`.
- OMT publico recebeu a correcao final em `10/04/2026`.
- O primeiro teste publico falhou por cache do Cloudflare ignorando a query do preview.
- O gerador foi ajustado para falar com a origem apenas no modo retroativo, mantendo o dominio publico no request.
- O caso `insercao 860` foi validado com sucesso em `2026-04-06 10:30`.
- O caso `insercao 857` foi revalidado com sucesso em `2026-04-07 18:57`.

## Limitacao atual
Os dominios locais `.test` de Perrengue e OMT estao com erro de conexao no banco neste ambiente, entao a validacao visual local do preview nao pode ser concluida agora.
Nos portais publicos, o modo retroativo ja foi validado em Perrengue e OMT.

## Proximo rollout
1. Definir um segredo `ADOPS_PREVIEW_SECRET` por portal.
2. Implantar o mu-plugin em cada portal.
3. Atualizar o AdRotate customizado de cada portal para usar o tempo simulado.
4. Testar `?adops_preview_at=...&adops_preview_sig=...` em home e pagina interna.
5. Liberar a geracao retroativa no AdOps para os portais validados.

## Como usar
### Na pagina da insercao
1. Abra a insercao.
2. Preencha o campo de data/hora ao lado do botao de print.
3. Clique em `Gerar print`.
4. Se ja existir uma evidencia valida para aquele dia, o sistema nao sobrescreve automaticamente.
5. Para refazer um dia, preserve a evidencia atual e seu registro de identidade, URL, SHA-256 e bytes. Solicite uma captura candidata para a mesma insercao, data e referencia visual, com `candidate=true`, `promote=false` e `replace=false`.
6. Audite o candidato pela API e confira visualmente o PNG exato. Geracao concluida ou auditoria tecnica aprovada, isoladamente, nao autorizam a substituicao.
7. Promova somente o candidato aprovado pelo fluxo persistido, com os gates de identidade, archive, hash e readback. Para um canonico historico ja aprovado fora do contrato atual, use a substituicao explicita documentada na [SPEC v4](./adops/retroactive-proof-v4/spec.md). Nao apague nem invalide o original para liberar outra captura.

### Na lista de insercoes
1. Abra `Insercoes`.
2. Escolha a competencia.
3. Preencha a data/hora do lote no topo.
4. Gere os prints das linhas desejadas.

### Na dashboard
1. Abra a dashboard.
2. Defina a data/hora retroativa no topo.
3. Clique em `Prints do dia`.
4. O lote aplica a mesma data simulada a todas as insercoes elegiveis.

### Retroativos vencidos
1. Abra a dashboard ou a lista de insercoes.
2. Selecione a competencia que deseja regularizar.
3. Clique em `Retroativos vencidos`.
4. O sistema gera apenas os dias passados que ainda estao sem print valido.
5. Os horarios sao distribuidos automaticamente na janela `18:00 <= captureAt < 22:00`, variando por insercao e dia.
6. Dias que ja possuem print valido entram como `ja existentes` e nao sao sobrescritos.

### Entrega ao cliente

- O pacote interno `export.zip` inclui README, Analytics e documentos operacionais.
- A pasta do cliente deve ser montada apenas com os `arquivoUrl` aprovados.
- Use uma pasta por insercao/posicao.
- Inclua portal, PI, posicao e data no nome de cada PNG.
- Nao use `retroativo`, `retroativos` ou `evidencias` nos nomes.
- Valide que as noticias e a capa pertencem ao instante historico solicitado.

## Caso validado
- Site: `Perrengue`
- Insercao: `860`
- Data simulada: `2026-04-06 10:30`
- Confirmado no print:
  - cabecalho com `segunda-feira, 06 de abril de 2026 10:30`
  - banner correto
  - noticias coerentes com a data simulada

## Caso validado apos correcao de timezone
- Site: `OMT`
- Insercao: `857`
- Data simulada: `2026-04-07 18:57`
- Confirmado na auditoria:
  - desktop com `terca-feira, 07/04/2026, 18:57`
  - cabecalho do site com `terca-feira, 7 de abril de 2026, as 18:57:00`
  - `15/15` imagens da primeira dobra carregadas
  - `2/2` imagens do slot carregadas
  - `5/5` backgrounds da primeira dobra carregados
  - print marcado como `audited`

## Auditoria automatica
Agora a auditoria oficial e resolvida pela [API de Checklist de Auditoria](./adops/audit-checklist-api.md).

Antes de aprovar uma evidencia, consulte:

```http
GET /api/audit-checklists/resolve?insertionId={id}&date=YYYY-MM-DD
POST /api/audit-checklists/validate-proof
GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD
```

`status=audited` so vale quando `validate-proof.approved=true`.

A auditoria nao verifica so se a URL do print responde `200`.

Ela tambem valida:
- data/hora do desktop da moldura
- data/hora exibida pelo site
- coerencia temporal do conteudo da home (datas dos cards/blocos <= captureAt)
- ausência de datas editoriais relativas não resolvidas quando a regra exige datas absolutas; `contentRelativeTimeSamples=[]` comprova que a verificação foi executada
- imagens visiveis da primeira dobra
- imagens do slot do anuncio
- backgrounds da primeira dobra
- videos ou posters visiveis na primeira dobra
- visibilidade real do slot no viewport final quando configurado por posicao
- frame oficial `windows11-chrome-light-similar-v4`
- barra de rolagem da moldura
- seletor e grupo AdRotate resolvidos pela regra publicada
- sticky header quando exigido pelo portal/formato
- auditoria do PNG final entregue ao cliente
- controles e progresso do player em evidencias de video
- frame aprovado de GIF quando `gifAllowedFrameRanges` estiver configurado
- ausencia de overlay/modal e erro 404 quando o metadata estiver disponivel

Os metadados ficam salvos no `meta.json` da captura e a API marca como `invalid_audit` quando:
- o horario nao bate com o `captureAt`
- o site mostra data divergente
- o conteudo do site mostra itens posteriores ao `captureAt`
- o slot nao fica visivel na posicao esperada do viewport final
- ou ainda existe carregamento incompleto na viewport auditada
- a posicao nao bate com o contrato resolvido pela API
- o PNG final nao confirma o banner no slot
- o video nao mostra controles/progresso
- o sticky header obrigatorio nao aparece

## Revisao visual antes de ZIP/envio

Quando a entrega for um ZIP de evidencias por PI, a validacao final deve incluir amostragem visual dos PNGs corrigidos ou recem-regenerados.

Checklist obrigatorio:

- o banner da insercao aparece legivel;
- a pagina nao esta coberta por modal, lightbox, popup, dialog ou overlay de post;
- os blocos de publicidade laterais que aparecem na primeira dobra carregaram quando fazem parte do contexto visual;
- a moldura oficial mantem data/hora, dominio e barra de rolagem coerentes;
- `captureAt` fica entre `18:00` e `21:59`, com horario deterministico por `insertionId + data`;
- o pacote operacional contem `prints/`, `metadata/`, `diagnostics/`, `manifest.json`, `status.csv`, `visual-contact-sheet.png` e `00-LEIA-ME.txt`;
- quando o cliente pedir somente imagens, gerar um ZIP separado apenas com PNGs a partir de `prints/`.

## Entrega comprimida por PI e site

O endpoint consolidado aceita tres modos:

```text
GET /api/pi-site-exports?piCodigo={PI}&siteSigla={SITE}&mode={full|prints-only|pdf|full-pdf}&variant={original|web}&download=1
POST /api/pi-site-exports/jobs
GET /api/pi-site-exports/jobs/{jobId}
GET /api/pi-site-exports/jobs/{jobId}/download
```

- `mode=full`: mantém os PNGs originais no ZIP para compatibilidade;
- `mode=prints-only&variant=web`: entrega ZIP somente com JPEGs progressivos comprimidos;
- `mode=pdf`: retorna um PDF comprimido com uma evidência auditada por página;
- `mode=full-pdf`: mantém documentos e Analytics no ZIP e inclui:
  - `01-PRINTS-PDF/*.pdf`, com uma evidência por página;
  - `01-PRINTS-PDF/IMAGENS-INDEPENDENTES/**/*.jpg`, com cada evidência também como imagem comprimida independente.

A compressao nunca sobrescreve o PNG auditado nem altera a URL da evidencia.
Ela atua somente na copia de entrega:

1. reduz a largura da cópia web para no máximo `1600 px` por padrão;
2. usa reamostragem `LANCZOS`;
3. converte a cópia de entrega para JPEG RGB progressivo sobre fundo branco;
4. incorpora cada pagina no PDF com qualidade JPEG `68`;
5. no `full-pdf`, grava a mesma página como JPEG independente e progressivo;
6. confirma número de páginas, imagens, bytes de origem, bytes finais e razão de compressão.

Parâmetros opcionais e limites:

- `pdfMaxWidth`: `800` a `2560`;
- `pdfQuality`: `45` a `85`;
- `pdfResolution`: `72` a `180`.
- `imageMaxWidth`: `800` a `2560`, padrão `1600`;
- `imageQuality`: `45` a `90`, padrão `72`.

Um ZIP comum não comprime bem screenshots PNG porque o conteúdo do PNG já usa
compressão interna. Por isso `variant=web` não promete mais um "PNG otimizado":
ele entrega JPEG progressivo comprimido. Para preservar os PNGs sem alteração,
usar `variant=original`.

O endpoint assíncrono `POST /api/pi-site-exports/jobs` cria o mesmo job local
do runner oficial. O runner materializa o arquivo pela rede interna, publica o
artefato final no Spaces e devolve uma URL pronta, evitando timeout do
Cloudflare em pacotes grandes. Analytics é anexo opcional e não bloqueia a
entrega das evidências.

Para entrega final, `mode=full-pdf` e `variant=web` são os padrões do contrato.
Envie uma `Idempotency-Key` estável, faça polling até `status=completed` e só
então use o endpoint `/download`. O GET síncrono fica restrito a diagnóstico ou
artefatos pequenos.

O runner captura somente inserções efetivamente publicadas
(`bannerPublicadoNoSite=true`) e com mídia resolvida. Rascunhos, aliases
provisórios e linhas sem mídia continuam visíveis no descritor como
`skippedInsertions`, mas não geram evidência falsa nem bloqueiam as
veiculações válidas da mesma PI.

Falhas transitórias de captura passam por até três tentativas com espera
progressiva. Antes de repetir, o runner consulta novamente o status da data;
se a evidência já estiver auditada, ele segue sem gerar uma cópia duplicada.
As tentativas adicionais usam 18:00 e 20:00 na mesma data, dentro da janela
operacional permitida, para contornar slots que não aparecem em determinado
horário do preview sem alterar a data comprovada.

## Regra Perrengue mobile em noticia

Para evidencias ativas do `PERRENGUE` em mobile:

- a prova mobile deve abrir uma noticia recente da categoria `vovo-de-olho`;
- a prova mobile nao deve usar a home como pagina base;
- o criativo da insercao precisa ficar visivel no viewport mobile;
- a categoria do artigo precisa ser reconhecida como `Vovo de Olho` / `vovo-de-olho`;
- para `MEGABANNER TOPO`, a evidencia desktop oficial continua sendo a home;
- apenas a evidencia desktop do topo usa pagina inicial como enquadramento canonico.

Harness:

```bash
pnpm --dir scripts run harness:perrengue-vovo-mobile-evidence-v1
```

Com campanhas:

```bash
ADOPS_HARNESS_ITEMS_FILE=/tmp/perrengue-active-items.json \
ADOPS_EVIDENCE_OUTPUT_DIR=/Users/leandrobosaipo/Downloads/PERRENGUE-evidencias-ativas-YYYY-MM-DD \
pnpm --dir scripts run harness:perrengue-vovo-mobile-evidence-v1
```

Aprendizado de `2026-05-26`:

- `PI 15948 / IPVA 2026 / PERRENGUE / 2026-05-22` passou a exigir remocao de overlay antes do screenshot final, pois um modal de post podia abrir sobre a home retroativa;
- `PI 16134 / Obras / PERRENGUE / 2026-05-15` precisou ser regenerada ate mostrar o banner lateral carregado no contexto da primeira dobra;
- a API publica pode estar atrasada em relacao a API interna viva logo apos uma regeneracao; para empacotar ZIP retroativo, validar a URL final pela API interna ou pelo download real do PNG.

## Auditoria de GIF e frames aprovados

Para banners GIF, a evidencia nao pode passar apenas porque o arquivo carregou.

A auditoria deve rejeitar:

- loader/spinner;
- frame branco;
- frame de transicao parcial;
- frame sem mensagem legivel da campanha;
- frame com imagem decorativa sem identificacao suficiente do anunciante/oferta.

Regra atualizada: `slotLegibilityOk=true` sozinho nao basta. A captura nova tambem precisa gravar `identityFrameOk=true`.

O gate de identidade usa score visual leve, sem OCR pesado:

- contraste;
- area util diferente do fundo;
- tons medios;
- densidade de bordas finas compativel com texto/logotipo/oferta.

Quando `identityFrameOk=false`, a auditoria deve falhar com:

```text
ad_identity_frame_missing
```

Quando a campanha tiver GIF com muitos frames, configurar intervalos aprovados no mapa do portal:

```json
"gifAllowedFrameRanges": [[99, 195], [206, 285], [318, 389]]
```

O campo fica em `config/adrotate-sites.json`, dentro de `auditOverrides` da posicao.

O capturador deve registrar:

- `gifChosenFrameIndex`;
- `gifAllowedFrameRanges`;
- `gifChosenFrameAllowed`;
- `slotFrameSamples[].approvedFrame`.

Se `gifChosenFrameAllowed=false`, a auditoria deve falhar com:

```text
gif_frame_not_approved
```

Aprendizado consolidado no caso `PI 490711 / Energisa / Perrengue G06` em `2026-05-23`:

- prints antigos estavam HTTP `200`, mas visualmente ruins;
- o problema so apareceu na revisao por folha visual;
- a regeneracao final foi feita em serie, nao em paralelo;
- todas as 12 evidencias ficaram `audited`, HTTP `200`, `gif_source` e frame aprovado.

## Moldura oficial dos prints — contrato legado v4

Este trecho conserva o modelo `windows11-chrome-light-similar-v4` e seu identificador histórico `windows11_chrome_real_template`; esse nome não certifica screenshot nativa do Windows. Para o novo kit v5 reconstruído e sua precedência, seguir o [contrato v4 de proveniência e v5 de apresentação](./adops/retroactive-proof-v4/spec.md), sem reinterpretar os arquivos antigos.

Regras obrigatorias:
- topo do Chrome em tema claro
- aba ativa sem texto ou icone fixo de outro site
- icone da aba vindo do logo local do portal
- titulo da aba vindo de `browserTitle`
- URL/dominio real na barra de endereco
- data/hora do rodape vindo de `captureAt` ou da data efetiva da captura
- barra de rolagem baseada em `pageScrollMetrics`

O metadata da captura deve registrar:
- `frameTheme = windows11_chrome_real_template`
- `frameTemplateVersion = windows11-chrome-light-similar-v4`
- `chromeTopTheme = light`
- `tabSurfaceRendered = true`
- `tabTitleRendered = true`
- `tabIconRendered = true`
- `tabIconFallback = false` quando o site tem logo local

Docs tecnicos:
- [SPEC da moldura v4](/Users/leandrobosaipo/Projetos/AdOps/docs/spec-prints-moldura-windows-v4.md)
- [HARNESS da moldura v4](/Users/leandrobosaipo/Projetos/AdOps/docs/harness-prints-moldura-windows-v4.md)
- [PRD da janela de horario v1](/Users/leandrobosaipo/Projetos/AdOps/docs/prd-capture-time-window-v1.md)
- [SPEC da janela de horario v1](/Users/leandrobosaipo/Projetos/AdOps/docs/spec-capture-time-window-v1.md)
- [HARNESS da janela de horario v1](/Users/leandrobosaipo/Projetos/AdOps/docs/harness-capture-time-window-v1.md)
- [RUNBOOK da janela de horario v1](/Users/leandrobosaipo/Projetos/AdOps/docs/runbook-capture-time-window-v1.md)

## Politica visual OMT HOME 1

- Insercoes `OMT / HOME 1 (groupId=2)` usam prova em **posicao real no site**.
- Desde a nova home publicada em `2026-05-10`, o slot fica depois da primeira dobra editorial, dentro de `.homepage-banner-single`.
- O seletor operacional atual e `.homepage-banner-single .g.g-2`, com contexto `.homepage-banner-single`.
- O PNG final nao usa mais o card fixo de inset no rodape para esse slot.
- Se o slot nao ficar visivel no enquadramento final, a captura falha com `slot_position_mismatch` e nao publica evidencia.
- Os containers inferiores `.homepage-banner-video-grid` / `.homepage-banner-video-item` existem como grade tripla, mas em `2026-05-10` estavam renderizando placeholders, sem `.g.g-4`, `.g.g-5` ou `.g.g-6` na home publica. Nao remapear esses grupos para placeholder, para evitar evidencia falsa de campanha nao renderizada.

## Log estruturado resiliente

- Persistencia de log agora usa retry com backoff.
- Se o endpoint da API falhar, o runner guarda o log em fila local `pending-capture-logs.jsonl`.
- A cada nova captura, a fila pendente e reenviada automaticamente antes da execucao.

## Onde ver o detalhe da falha
Na pagina da insercao, cada card do dia agora mostra:
- hora da moldura do desktop
- hora exibida pelo site
- contagem de imagens da viewport
- contagem de imagens do slot
- contagem de backgrounds
- contagem de videos/posters
- lista das regras que falharam quando o status vier como `invalid_audit`

## Regra especifica para prints de video

Para formatos de `VIDEO`, a prova operacional nao deve mostrar apenas um frame qualquer do anuncio.

O print precisa tentar reproduzir o que um operador veria ao passar o cursor sobre o player:
- player visivel
- frame do video carregado
- controles do player aparentes
- barra de progresso visivel
- tempo pseudoaleatorio por evidencia, quando o navegador permitir
- variacao real do ponto do video entre datas, evitando pacote inteiro parado no mesmo frame
- metadados `playerProof.currentTime`, `playerProof.duration`, `playerProof.targetTime`, `playerProof.randomSeed`, `controlsVisible` e `progressVisible`

### Fluxo vigente para vídeo v4

O capturador não adiciona barra artificial. Ele faz seek/pausa, passa o cursor sobre o player e mede a timeline nativa do Chromium pelo UA shadow DOM. `nativeProgressAudit` verifica tempo, duração, visibilidade efetiva, limites e oclusão; `finalPngProgressAudit` compara essa mesma região do viewport com o PNG final. A API exige ambos para VIDEO v4. Atributo `controls`, frame pintado e flag `progressVisible` isolados não comprovam a barra visível. Revisar visualmente o PNG exato antes de promover. Consulte a [SPEC v4](./adops/retroactive-proof-v4/spec.md).

### Registro do fluxo legado, até a release 6422

O fluxo abaixo documenta a implementação anterior; não é orientação para novas capturas v4. A barra injetada causou duplicação no candidato #3064 de 01/10/2026, que ficou retido sem promoção.

Fluxo legado do gerador:
1. localiza o elemento `video` dentro do anuncio validado
2. ativa `controls`
3. carrega metadata do video em `mute`
4. escolhe `targetTime` pseudoaleatorio e reprodutivel por insercao/data/viewport
5. faz seek, pausa no frame escolhido e injeta overlay de progresso
6. move o mouse para o centro do player antes do screenshot
7. captura o slot e a primeira dobra com os controles ainda visiveis

Observacoes:
- essa regra vale para o print final e para a miniatura do slot
- se o navegador nao fornecer duracao/metadados do video, a evidencia de video nao deve ser aprovada automaticamente
- essa regra foi consolidada a partir do caso `HANSENIASE / ALMT / insercao 1193`
- o tempo do player e variado por captura para nao concentrar todas as provas no mesmo segundo
- a auditoria agora expoe um bloco proprio `playerProof`, com:
  - tempo atual
  - duracao
  - `targetTime`
  - `randomSeed`
  - controles visiveis
  - progresso visivel
  - `playerProofOk`

## Como a UI mostra isso

- na pagina da insercao:
  - aparece o selo `Video com controles visiveis`
  - o card do dia mostra tempo atual / total
- na lista de insercoes:
  - a coluna de captura mostra o selo `Video com controles`
  - o detalhe da falha inclui um bloco proprio `Player do video`

## Operacao assistida no AdOps

Agora a interface tem tres apoios novos para retroativos:

- `Previa dos vencidos`
  - mostra quantos dias faltam antes de rodar o lote
  - lista as insercoes mais impactadas
- `Filtrar dias faltando`
  - na fila operacional, mostra apenas insercoes que ainda tem dias sem print
- relatorio visual no dashboard
  - resume o total de retroativos faltando no recorte atual

Endpoint da previa:

- `GET /api/insertions/capture-proof/backfill-overdue/preview`

## Aprendizado novo de 2026-04-10

- O mecanismo de preview assinado tambem precisa ser usado para os prints "de hoje" nos portais que ja suportam `adops_preview_at`.
- Sem isso, o desktop pode mostrar a hora real de Cuiaba enquanto o site ainda exibe um horario congelado do cache publico.
- A leitura da data/hora do site passou a ser configurada por dominio em `adrotate-sites.json`, usando `pageDateSelectors`.
- Essa parametrizacao e por portal, nao global:
  - cada tema pode ter seletor de data diferente
  - cada layout pode ter slot/contexto diferente
  - cada portal pode exigir enquadramento proprio para `HOME 1`, `VIDEO` ou `INTERNO`
- A auditoria tambem deixou de depender apenas de substring literal de data e passou a entender formatos como:
  - `10/04/2026`
  - `10 de abril de 2026`
- Para `VIDEO`, o padrao de prova passou a exigir hover no player, controles visiveis e barra de progresso aparente sempre que o navegador permitir.

## Contrato editorial retroativo v2 — 2026-07-31

Este contrato se aplica exclusivamente a `historical_recovery`, isto é, captura executada em data posterior à data-alvo. `scheduled` e `same_day_retry` executados na própria data em `America/Cuiaba` não são retroativos e não podem passar a exigir esta prova apenas porque o calendário avançou. Registros legados só recebem essa classificação por reconciliação interna auditável; a presença de um arquivo, sozinha, nunca autoriza aprovação.

Alterar apenas a data da moldura ou do cabeçalho não comprova veiculação retroativa. Toda captura com `requestedCaptureAt` deve provar também o conteúdo editorial visível naquele corte.

Requisitos:

- preview HMAC assinado e marcador `cod5-adops-retro-preview=active` confirmado;
- consultas WordPress limitadas a `post_date <= requestedCaptureAt`;
- no mínimo três notícias históricas correspondentes na home;
- um artigo correspondente em página interna;
- nenhuma notícia posterior ao corte;
- correspondência das URLs visíveis com posts elegíveis consultados pela API REST do WordPress;
- até 25 amostras sanitizadas e manifesto com SHA-256 persistidos na evidência;
- reconstrução aceita somente com manifesto e quantidade mínima comprovada.

Falhas novas:

- `retro_preview_not_active`;
- `retro_content_unverified`;
- `content_time_mismatch`;
- `retro_content_expected_mismatch`;
- `retro_reconstruction_failed`.

`contentDateSamples=[]` é falha. O exportador só libera PDF/ZIP quando todas as datas retornarem `audited` e `retroContentProof.status=approved`.

### Captura assíncrona e promoção auditada

Capturas que podem ultrapassar o timeout da borda devem usar:

```http
POST /api/insertions/{id}/capture-proof/jobs
Idempotency-Key: retro-v2:<rodada>:<insercao>:<data>:<hora>
Content-Type: application/json

{
  "date": "2026-07-24",
  "captureAt": "2026-07-24T20:00:00-04:00",
  "candidate": true,
  "promote": true
}
```

Consultar `GET /api/insertions/{id}/capture-proof/jobs/{jobId}` até
`completed`. O candidato fica isolado; com `promote=true`, a troca ocorre
somente depois da prova editorial local ser aprovada. Em seguida, confirmar
`GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD` com
`status=audited` e `retroContentProof.status=approved`.

O GET preserva os campos anteriores do job e acrescenta:

```json
{
  "status": "running",
  "progress": {
    "percent": 60,
    "stage": "slot_captured",
    "message": "Captura realizada. Estamos montando a evidência.",
    "updatedAt": "2026-09-02T12:01:00.000Z"
  },
  "support": null
}
```

Etapas e percentuais: `queued` 0, `running` 5, `page_resolved` 15,
`slot_found` 25, `creative_matched` 35, `frame_selected` 45,
`slot_captured` 60, `critical_assets` 70, `final_composed` 80, `uploaded` 90,
`audit_evaluated` 95 e `completed` 100. São eventos reais emitidos pelo
capturador; o valor persistido nunca retrocede. Em `failed`, o percentual fica
no último avanço e `support` contém apenas código correlacionável e orientação
segura. A mensagem técnica permanece interna.

Em página interna reconstruída, URL pública, título, data e corpo precisam
pertencer ao mesmo post histórico. Cards relacionados atuais não substituem
nem invalidam a data editorial do artigo principal verificado.

O MU-plugin compatível é `Código5 AdOps Retro Preview 1.0.2`. Sem parâmetros de preview, o portal continua com comportamento normal.

### Conteúdo obrigatório do pacote `full-pdf`

Além do PDF e dos JPEGs progressivos, a API inclui:

- `04-AUDITORIA/AUDITORIA-RETRO-CONTENT.json`;
- um manifesto editorial sanitizado para cada inserção/data;
- `04-AUDITORIA/CONTACT-SHEET-PRIMEIRA-INTERMEDIARIA-ULTIMA.jpg`;
- `SHA256SUMS.txt`, cobrindo todos os demais arquivos do ZIP;
- zero PNG no pacote web; os PNGs originais continuam preservados na fonte da evidência.

O relatório e os manifestos são gerados pela API. Não devem ser montados manualmente depois do download.

Capturas originais `scheduled`/`same_day_retry` aprovadas pelo auditor canônico
são preservadas sem exigir um manifesto de reconstrução. A exportação confere
job de origem, política de auditoria, data-alvo e data real de captura em Cuiabá.
O manifesto informa `auditBasis=same_day_capture` e mantém `proof=null` quando
não existe prova editorial. Reconstruções continuam exigindo prova editorial
aprovada, hash do manifesto e zero conteúdo futuro (`auditBasis=editorial_proof`).
Os totais de originais e reconstruções ficam separados na auditoria do pacote.

### Prompt operacional recomendado

> Use somente os endpoints da API AdOps. Consulte a PI e o site. Para cada captura retroativa, gere um candidato isolado (`candidate=true`, `promote=false`), aguarde o job terminar, audite e confira visualmente o PNG exato. Registre a revisão e promova somente pelo fluxo persistido, depois de todos os gates. Confirme o status/readback da evidência antes da exportação. Crie o job assíncrono `mode=full-pdf` e `variant=web`, com `Idempotency-Key` estável; polling até `status=completed` e download são etapas obrigatórias. Confirme no ZIP: mesma quantidade de JPEGs progressivos, páginas de PDF e manifestos; zero PNG; `futureCount=0`; contact sheet presente; e `SHA256SUMS.txt` válido. Um ACK ou job criado não é prova de entrega. Não entregue pacote parcial.
