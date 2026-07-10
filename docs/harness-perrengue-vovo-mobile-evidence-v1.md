# Harness Perrengue Vovo Mobile Evidence v1

## Objetivo

Validar a regra operacional das evidencias mobile do Perrengue:

- evidencia mobile deve abrir uma noticia recente da categoria `vovo-de-olho`;
- nao deve usar a home como prova mobile;
- deve mostrar o criativo da insercao no artigo;
- GIF deve usar frame com texto/identidade suficiente do anuncio;
- video deve mostrar controles/barra de progresso em tempo pseudoaleatorio;
- para `MEGABANNER TOPO`, a evidencia desktop oficial continua sendo a home.

## Execucao

```bash
pnpm --dir scripts run harness:perrengue-vovo-mobile-evidence-v1
```

Com lista de campanhas:

```bash
ADOPS_HARNESS_ITEMS_FILE=/tmp/perrengue-active-items.json \
ADOPS_EVIDENCE_OUTPUT_DIR=/Users/leandrobosaipo/Downloads/PERRENGUE-evidencias-ativas-YYYY-MM-DD \
pnpm --dir scripts run harness:perrengue-vovo-mobile-evidence-v1
```

## Saidas

- `docs/harness-reports/perrengue-vovo-mobile-evidence-v1/<timestamp>/results.json`
- `docs/harness-reports/perrengue-vovo-mobile-evidence-v1/<timestamp>/summary.md`
- `docs/harness-reports/perrengue-vovo-mobile-evidence-v1/<timestamp>/artifacts/*-media.png`
- `<ADOPS_EVIDENCE_OUTPUT_DIR>/mobile/*.png`
- `<ADOPS_EVIDENCE_OUTPUT_DIR>/mobile-audit.json`

## Gates

O harness falha quando:

- nao encontra artigo recente em `vovo-de-olho`;
- a pagina aberta e a home;
- a categoria do artigo nao e reconhecida;
- o banner da insercao nao fica visivel no viewport mobile;
- `identityFrameOk` nao e `true`;
- GIF nao tem frame aprovado com texto/identidade da campanha;
- video nao tem `videoProgressOk=true`;
- video nao registra `currentTime`, `duration`, `targetTime`, `randomSeed` e barra de progresso visivel;
- a documentacao nao cita a regra `desktop topo` e `vovo-de-olho`.

## Regra de frame identificavel

O harness nao aceita frame vazio, branco, loader, transicao ou peca decorativa sem identificacao clara da campanha.

Sem adicionar OCR pesado, o gate usa:

- ranges aprovados quando existirem;
- contraste;
- area util nao branca;
- densidade de bordas finas compativel com texto;
- score `identityFrameScore`.

Para GIF, o harness baixa a midia, escolhe um frame aprovado e injeta esse PNG estatico no artigo mobile. Isso evita que o screenshot caia em um frame aleatorio sem texto.

## Regra de video

Para video, o harness:

- carrega metadata do player;
- calcula `targetTime` pseudoaleatorio por insercao/data/mobile;
- posiciona o video nesse tempo;
- pausa o frame escolhido;
- exibe controles e overlay com barra de progresso;
- registra `videoProof`.
