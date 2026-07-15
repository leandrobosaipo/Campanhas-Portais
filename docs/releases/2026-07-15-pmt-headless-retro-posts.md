# PMT: posts historicos no preview retroativo

Data: 2026-07-15

## Problema

O `captureAt` era enviado ao WordPress no formato `YYYY-MM-DDTHH:mm`. O endpoint
REST exige segundos. A resposta `HTTP 400` era tratada como fim de paginacao,
deixando `adminPosts=0` e fazendo o headless reconstruir a home apenas com um
indice estatico desatualizado.

O resultado alterava a data do print, mas podia repetir as mesmas noticias em
dias diferentes.

## Correcao

- Normaliza `captureAt` para `YYYY-MM-DDTHH:mm:ss` antes de preencher `before`.
- Erros da primeira pagina do WordPress deixam de ser ignorados.
- A fonte administrativa passa a ser obrigatoria no retroativo do PMT.
- A consulta para quando ja existem posts e imagens suficientes para a home.
- Destaques e Agora recebem slugs rastreaveis no DOM.
- A captura falha com `retro_editorial_content_mismatch` quando os slugs
  esperados e renderizados forem diferentes.
- A auditoria registra fonte, quantidade de posts e slugs esperados/renderizados.

## Validacao

O probe contra o PMT publico confirmou conjuntos diferentes:

- `2026-07-07T19:17`: Entregador corre para escapar de homem armado.
- `2026-07-10T19:41`: Thiago Mendes torce tornozelo durante treino.
- `2026-07-13T21:14`: Egito lota estadio no retorno da selecao.

Nos tres casos, `adminPosts=100` e `editorialContentMatches=true`.

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run test:perrengue-static-retro-sparse
pnpm --dir scripts run test:strict-capture-readiness
pnpm --dir scripts run audit:capture-rules-integrity
pnpm run typecheck
```
