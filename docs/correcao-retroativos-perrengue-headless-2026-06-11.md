# Correcao de retroativos no Perrengue headless

## Problema

As evidencias retroativas podiam sair com `captureAt` correto, moldura correta e banner correto, mas com noticias da home estatica ainda atuais ou com datas dos cards inconsistentes.

No WordPress legado, o parametro `adops_preview_at` era interpretado no servidor pelo mu-plugin, pelo tema e pelo AdRotate. No Perrengue headless, a home ja chega como HTML estatico; por isso o recorte temporal precisa ser reconstruido no navegador antes do print.

## Causa raiz

O fluxo `capture-insertion-proof.cjs` tinha uma funcao especifica para Perrengue estatico, `applyPerrengueStaticRetroPreview()`, mas ela era tratada como tentativa silenciosa. Quando o recorte por `/assets/search-index.json` falhava, a captura continuava.

Tambem havia dois pontos fracos:

- os `<time>` dos cards reconstruidos nao eram atualizados de forma obrigatoria em todos os casos;
- a auditoria nao lia explicitamente `data-adops-retro-post-date` quando o marcador estava no proprio `<article>`.
- o datestamp mobile do Perrengue podia receber texto longo porque o helper verificava nomes de atributos, mas nao o valor `data-perr-datetime="short"`.

## Arquivos alterados

- `scripts/src/capture-insertion-proof.cjs`

## Regra implementada

Quando a captura for retroativa, para `perrenguematogrosso.com` e pagina `Home`:

1. a reconstrução da home por data retroativa e obrigatoria;
2. se o recorte temporal nao for aplicado, a captura falha com `perrengue_static_retro_preview_failed`;
3. todos os `<time>` dentro do card reconstruido recebem:
   - `datetime` com `publishedAt`/data absoluta;
   - `data-date` com a data local;
   - `data-datetime` com a data absoluta;
   - texto visivel `DD/MM/AAAA • HH:mm`;
4. o `<article>` recebe:
   - `data-adops-retro-post-date`;
   - `data-date`;
   - `data-datetime`;
5. a auditoria inclui `main article[data-adops-retro-post-date]` e le o atributo `data-adops-retro-post-date`.
6. o datestamp mobile preserva o formato abreviado quando o elemento usa `data-perr-datetime="short"`, por exemplo `08/06 19:17`.

## Como testar

Validacao sintatica:

```bash
node --check scripts/src/capture-insertion-proof.cjs
```

Validacao controlada com Playwright:

```bash
node /tmp/adops-perrengue-retro-harness.mjs
```

O harness deve confirmar:

- caso normal sem `captureAt`: a funcao retorna `false` e nao altera a home;
- retroativo `2026-06-08T19:18`: lead, cards e lista `Agora` ficam com datas `<= 2026-06-08T19:18`;
- retroativo `2026-06-09T19:18`: lead, cards e lista `Agora` ficam com datas `<= 2026-06-09T19:18`;
- card existente e lista reconstruida possuem `data-adops-retro-post-date`.

## Como confirmar no print

No metadata da captura, conferir:

- `requestedCaptureAt`;
- `pageDateObserved`;
- `contentDateSamples`;
- `retroGate.ok`;
- ausencia de `content_time_mismatch`.

No PNG, conferir:

- moldura com horario retroativo;
- topbar com horario retroativo;
- cards/noticias com datas coerentes com o dia retroativo.
- no mobile, datestamp abreviado no formato `DD/MM HH:mm`.

## Regra posterior para evidencias ativas mobile

Para campanhas ativas do Perrengue, a prova mobile deve usar uma noticia recente da categoria `vovo-de-olho`, e nao a home.

O desktop de `MEGABANNER TOPO` continua usando a home como evidencia canonica. O harness operacional fica em:

```bash
pnpm --dir scripts run harness:perrengue-vovo-mobile-evidence-v1
```
