# SPEC - Reconciliacao Planilha, AdOps e AdRotate v1

## Objetivo

Conferir e corrigir divergencias entre AdOps, planilha e AdRotate dos portais.

## Escopo

- Confirmar anuncios ativos por portal, grupo e periodo.
- Desativar anuncio modelo somente quando houver anuncio real ativo no mesmo grupo.
- Atualizar `external_id`, titulo e metadados dos anuncios reais.
- Vincular midia publicada no WordPress/Spaces ao cadastro da insercao.
- Gerar lista de revisao quando houver ambiguidade.

## Regras de deduplicacao

- Um anuncio real por `insertionId` no AdRotate.
- Um anuncio modelo por grupo pode existir, mas deve ficar inativo quando houver campanha real ativa.
- Duplicidade de PI em AdOps nao deve ser apagada automaticamente; deve ser marcada para revisao.
- Quando a planilha confirmar que dois recortes representam o mesmo formato e periodo continuo, manter uma insercao canonica publicada e cancelar as duplicadas com observacao de auditoria.

## Criterios de divergencia

- AdOps ativo sem anuncio AdRotate.
- AdRotate ativo sem insercao correspondente no AdOps.
- Midia do AdRotate diferente da midia do AdOps.
- AdRotate com `image` preenchido e `bannercode` sem `%asset%`.
- Grupo do AdRotate diferente do `groupId` esperado.
- Periodo publicado divergente da PI.

## Perrengue estatico / VM8

- Para banner que aparece na home publica do Perrengue, conferir o AdRotate que alimenta o rebuild estatico na VM8.
- O container fonte do shortcode e `cod5-pro119-perrenguematogrosso-app`.
- Corrigir somente o host legado/cPanel pode deixar o site publico sem o banner.
- Antes de concluir, validar:
  - AdRotate VM8 com `type=active`;
  - schedule vigente;
  - vinculo no grupo correto em `wp_adrotate_linkmeta`;
  - origin estatico contendo o anuncio;
  - URL publica apos purge contendo o mesmo anuncio.
- Para PI `16283- GOV`, o formato `FEMINICIDIO / MEGABANNER TOPO` foi consolidado na insercao canonica `#1400` com periodo `01/06 - 22/06`; duplicidades devem permanecer canceladas, nao recriadas.

## Regra obrigatoria de AdCode

- Todo anuncio AdRotate com arquivo selecionado em `image` deve usar `%asset%` dentro do `bannercode`.
- Nunca sincronizar `mediaUrl` para o AdOps quando o anuncio remoto tem `image` preenchido, mas o `bannercode` aponta direto para a URL absoluta ou esta vazio.
- Antes de corrigir evidencias, corrigir primeiro o AdRotate: `bannercode` com `%asset%`, `type` valido e grupo correto.
- Orfaos antigos sem vinculo AdOps podem ser deixados expirados, mas nao podem permanecer como `type=error` por falta de `%asset%`.

## Performance

- Carregar anuncios por portal/grupo em lote.
- Evitar SSH/WP-CLI repetido por insercao quando uma consulta por grupo resolve.
- Aplicar rate limit entre portais.

## Seguranca

- Nao imprimir credenciais SSH, tokens ou headers.
- Mutacoes em WordPress devem ser reversiveis por backup de titulo/metadados.
