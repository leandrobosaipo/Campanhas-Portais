# Sincronizacao AdRotate x AdOps - 2026-04-08

## Resumo
- Fonte da planilha revisada: `/Users/leandrobosaipo/.openclaw/tmp-sheet-check/relacao-campanhas-latest.xlsx`
- Data do arquivo: `2026-04-07 18:41`
- Delta real encontrado em `ABRIL 2026` para `PERRENGUE`: campanha `ATUALIZAÇÃO SUS`
- Delta sincronizado no AdOps local:
  - campanha `770` / insercao `1068` / `PI 14072- PREF CBA` / `08/04/2026 a 30/04/2026`
  - campanha `771` / insercao `1069` / `PI 14073- PREF CBA` / `01/05/2026 a 07/05/2026`
- Midias completadas a partir do AdRotate/site:
  - insercao `867` -> `enfrentamento_ao_feminicidio_e_a_violAancia_domestica_825X120.gif`
  - insercao `869` -> `728x90-pva-1.gif`
  - insercao `1066` -> `programa_fila_zero_cirurgia_825x120.gif`

## Grupos lidos em producao
- `1` -> `G01 — Topo — 825x120 — Header (Home)`
- `6` -> `G06 — Lateral 01 — 300x250 — Sidebar (posição 1)`
- `10` -> `G10 - Topo lateral - 380x120 - Header`
- `11` -> `G11 — Interno — 728x90 — Meio da notícia`

## Anuncios ativos candidatos para vinculacao

### Correspondencias fortes
- `AdRotate 114`
  - titulo: `PI 14011- GOV - OBRAS - 01/04 - 20/04 - MEGABANNER TOPO`
  - grupo: `1`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/03/atualizacao_de_obras_em_cuiaba_825x120-1.gif`
  - sugestao AdOps: insercao `862`
  - detalhe: `http://localhost:4175/insercoes/862`
  - pagina para conferir: `https://perrenguematogrosso.com/`
- `AdRotate 115`
  - titulo: `PI 13 877 - PREF CBA - IPTU 2026 - 01/04- 15/04- MEGABANNER TOPO`
  - grupo: `1`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/03/825x120-pref-3.gif`
  - sugestao AdOps: insercao `860`
  - detalhe: `http://localhost:4175/insercoes/860`
  - pagina para conferir: `https://perrenguematogrosso.com/`
- `AdRotate 117`
  - titulo: `PI 13969- GOV - FEMINICIDIO - 03/04 - 18/04 - MEGABANNER TOPO`
  - grupo: `1`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/03/enfrentamento_ao_feminicidio_e_a_violAancia_domestica_825X120.gif`
  - sugestao AdOps: insercao `867`
  - detalhe: `http://localhost:4175/insercoes/867`
  - pagina para conferir: `https://perrenguematogrosso.com/`
- `AdRotate 118`
  - titulo: `PI 89011- PREF PVA - FTD - 01/04 - 12/04 - INTERNO DE NOTICIAS`
  - grupo: `11`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/04/728x90-pva-1.gif`
  - sugestao AdOps: insercao `869`
  - detalhe: `http://localhost:4175/insercoes/869`
  - pagina para conferir: `https://perrenguematogrosso.com/festa-celebracao-307-anos-cuiaba-parque-das-aguas-video/`

### Correspondencias com ressalva
- `AdRotate 116`
  - titulo: `PI 14028 - GOV - FILA ZERO - 03/04 - 18/04 - MEGABANNER TOPO`
  - grupo: `1`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/03/programa_fila_zero_cirurgia_825x120.gif`
  - AdOps tem duas insercoes na planilha/base:
    - `865` -> `03/04/2026 a 14/04/2026`
    - `1066` -> `15/04/2026 a 18/04/2026`
  - detalhe 865: `http://localhost:4175/insercoes/865`
  - detalhe 1066: `http://localhost:4175/insercoes/1066`
  - pagina para conferir: `https://perrenguematogrosso.com/`
  - observacao: o site consolidou duas janelas da planilha em um unico anuncio.
- `AdRotate 119`
  - titulo: `PI 14072 E PI 14073 - PREF CBA - ATUALIZAÇÃO SUS 08/04 - 07/05 - MEGABANNER TOPO`
  - grupo: `1`
  - imagem: `https://perrenguematogrosso.com/app/uploads/2026/04/atualizacaocadastro_825x120.gif`
  - AdOps agora tem duas insercoes sincronizadas da planilha:
    - `1068` -> `PI 14072- PREF CBA` / `08/04/2026 a 30/04/2026`
    - `1069` -> `PI 14073- PREF CBA` / `01/05/2026 a 07/05/2026`
  - detalhe 1068: `http://localhost:4175/insercoes/1068`
  - detalhe 1069: `http://localhost:4175/insercoes/1069`
  - pagina para conferir: `https://perrenguematogrosso.com/`
  - observacao: o site consolidou duas PIs em um unico anuncio.

### Sem correspondencia operacional
- `AdRotate 29`
  - placeholder lateral
- `AdRotate 101`
  - placeholder topo lateral
- `AdRotate 102`
  - placeholder topo lateral

## Proximo passo apos confirmacao
- Aplicar o sufixo do AdOps nos anuncios confirmados
- Para casos 1:1, usar o ID da insercao como chave principal
- Para casos consolidados (`116` e `119`), decidir se:
  - o sufixo aponta para a primeira insercao ativa
  - ou se o titulo recebe uma indicacao composta/manual
