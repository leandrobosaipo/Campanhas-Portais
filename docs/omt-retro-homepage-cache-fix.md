# OMT retroativo — correção de cache da homepage

## Sintoma
No modo retroativo, a data/hora do site e do desktop ficam corretas, mas alguns blocos de destaques da home repetem notícias atuais ou a mesma notícia em múltiplas posições.

## Causa raiz
O tema `omt-theme` usa transients em `includes/class-homepage.php` para guardar IDs de posts por categoria.

No preview retroativo:
- o mu-plugin filtra `WP_Query` por `post_date <= captureAt`
- mas o cache da homepage pode devolver IDs já montados em tempo real
- quando isso acontece, a home reaproveita destaques atuais e quebra a coerência histórica

## Correção aplicada localmente
Arquivo:
- `/Users/leandrobosaipo/valet/Sites/omatogrossense.com/web/app/themes/omt-theme/includes/class-homepage.php`

Ajuste:
- criar `OMT_Homepage::is_adops_retro_preview()`
- desligar `get_transient()` no método `get_cached_category_posts()` quando `cod5_adops_preview_active()` estiver ativo
- também não gravar transient durante o preview retroativo

## Efeito esperado
No modo retroativo, cada seção da homepage volta a consultar os posts reais daquele instante em vez de reutilizar IDs da home atual.

## Status
- patch aplicado no `OMT` público em `2026-04-10`
- o acesso correto do servidor veio do runbook:
  - host `66.253.112.200`
  - porta `215`
  - usuário `facilnam`
- o problema dos destaques repetidos não era da data retroativa em si, e sim do cache editorial da homepage

## Generalização para outros portais
Os portais `tailpress` (`AFL`, `PNMT`, `PPMT`, `ROO`) também usam pool cacheado de posts na home, no arquivo `src/Homepage.php`.

Foi aplicada a mesma regra:
- se `cod5_adops_preview_active()` estiver ativo
- não ler transient de pool
- não gravar transient novo durante o preview retroativo

Isso reduz o risco de:
- repetir notícia atual em preview retroativo
- misturar home atual com home histórica
