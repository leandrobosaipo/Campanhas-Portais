# Perrengue: filtro editorial nos prints retroativos

Data: 2026-07-15

## Problema

O preview retroativo do AdOps reconstruia os destaques e a secao `Agora` do
Perrengue usando todos os posts anteriores ao horario da captura. Isso permitia
que posts da categoria `memes-do-vovo` aparecessem nessas areas, embora o
template publico permita memes somente na secao dedicada `Memes`.

## Correcao

- O reconstrutor historico agora remove posts de meme antes de preencher areas
  editoriais da home.
- O filtro reconhece slug, nome e classe da categoria.
- Uma validacao final reprova o preview com
  `retro_editorial_meme_leak` se Destaques ou Agora ainda contiverem a
  categoria proibida.
- A metadata registra `totalPostsAvailable`, `excludedMemePosts` e
  `editorialMemeLeaks`.
- O teste `test:perrengue-static-retro-sparse` passou a fazer parte do CI.

## Escopo preservado

- A secao dedicada `Memes`, o menu e o arquivo da categoria continuam
  permitidos.
- O template publico do Perrengue nao foi alterado.
- A midia e a evidencia anterior so sao substituidas depois que a nova captura
  passa pelos gates existentes.

## Validacao

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run test:perrengue-static-retro-sparse
pnpm --dir scripts run test:strict-capture-readiness
pnpm --dir scripts run audit:capture-rules-integrity
```
