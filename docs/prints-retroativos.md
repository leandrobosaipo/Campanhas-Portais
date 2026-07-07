# Prints Retroativos

## Objetivo
Permitir gerar provas visuais retroativas com data e hora simuladas, para que o print mostre:
- a primeira dobra completa do site
- o banner correto da insercao
- as noticias publicadas ate o momento simulado
- a data/hora exibida no cabecalho e na moldura do desktop em pt-BR

## Como funciona
1. O AdOps passa `captureAt` para a rotina de captura.
2. A rotina adiciona `adops_preview_at` na URL aberta pelo Playwright.
3. Nos portais que tiverem o preview implantado, um mu-plugin converte esse parametro em um timestamp simulado.
4. O tema usa esse timestamp no cabecalho.
5. O AdRotate usa esse timestamp para validar schedule dos anuncios.
6. O WordPress limita os loops de posts para exibir apenas conteudo publicado ate aquele momento.

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
5. Se precisar refazer um dia especifico, use `Apagar evidencia` no card daquele dia e depois gere novamente.

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

## Moldura oficial dos prints

O modelo visual atual dos prints e `windows11-chrome-light-similar-v4`.

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

Fluxo atual do gerador:
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
