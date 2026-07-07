# Plugin retroativo multisite

## Objetivo

O modo retroativo existe para que o AdOps consiga gerar prints de prova com:

- a data e hora simuladas no topo do site
- os anuncios que estavam validos naquele instante
- as noticias coerentes com aquela data e hora
- a moldura do desktop com o mesmo horario da simulacao

Ele nao usa IA. O fluxo e deterministico.

## Componentes

A solucao funciona em camadas.

### 1. Mu-plugin `cod5-adops-retro-preview.php`

Responsavel por:

- ler `adops_preview_at`
- validar `adops_preview_sig`
- converter a string em `DateTimeImmutable`
- expor helpers globais:
  - `cod5_adops_preview_active()`
  - `cod5_adops_preview_timestamp()`
  - `cod5_adops_preview_current_time()`

Esse mu-plugin precisa existir em:

- `web/app/mu-plugins/cod5-adops-retro-preview.php`

### 2. Patch do AdRotate

Responsavel por:

- trocar o uso de `current_time('timestamp')`
- usar `adrotate_adops_now()` quando o preview estiver ativo
- fazer schedules e validade dos anuncios obedecerem a data simulada

Arquivos sensiveis:

- `web/app/plugins/adrotate/adrotate.php`
- `web/app/plugins/adrotate/adrotate-functions.php`
- `web/app/plugins/adrotate/adrotate-output.php`
- `web/app/plugins/adrotate/adrotate-adops.php`

### 3. Patch do tema

Responsavel por:

- fazer o cabeçalho mostrar a mesma data simulada
- impedir que JavaScript do tema substitua o horario do preview pelo horario real do navegador
- manter coerencia visual no print final

Isso varia por tema.

#### Temas `tailpress`

Arquivos normalmente envolvidos:

- `src/HeaderData.php`
- `template-parts/header/bar-top.php`

#### Tema `omt-theme`

Arquivos normalmente envolvidos:

- `includes/class-helpers.php`
- `parts/header-datestamp.php`

## Como o fluxo funciona

1. O AdOps escolhe uma data/hora, por exemplo `2026-04-09T19:10`.
2. O script de captura assina esse valor com o segredo do portal.
3. A URL aberta pelo Playwright recebe:
   - `adops_preview_at`
   - `adops_preview_sig`
   - `adops_preview_bust`
4. O site interpreta o preview.
5. O AdRotate considera a data simulada.
6. O tema mostra a data simulada no cabeçalho.
7. O Playwright gera o print com primeira dobra + banner + noticias do momento simulado.

## Pre-requisitos

Para funcionar bem, cada portal precisa ter:

- acesso SSH e WP-CLI
- cache do WordPress limpavel
- cache do Cloudflare contornavel ou neutralizado no preview
- um segredo proprio por dominio para assinar `adops_preview_at`
- um mapeamento confiavel de posicao -> grupo do AdRotate
- tema com ponto claro onde o datestamp e renderizado

## Riscos de update

Os updates que mais podem quebrar o retroativo sao:

- update do tema que troque o cabeçalho
- update do tema que adicione JS novo para data/hora local
- update do AdRotate que volte a chamar `current_time()` diretamente
- mudanca de layout que empurre o banner alvo para fora da primeira dobra
- cache agressivo do Cloudflare ignorando a query do preview

## O que conferir depois de atualizar tema ou plugin

Checklist minimo:

1. o mu-plugin ainda existe em `mu-plugins`
2. `adrotate-adops.php` continua incluído em `adrotate.php`
3. `adrotate-functions.php` e `adrotate-output.php` continuam usando o fallback do preview
4. o cabeçalho do tema nao voltou a usar `new Date()` ou relogio local sem respeitar preview
5. a home com `?adops_preview_at=...` mostra a data simulada
6. a materia interna com preview tambem mostra a data simulada
7. um print retroativo real abre com anuncio + noticias coerentes

## Replicacao para novos portais

A ordem recomendada e:

1. descobrir tema ativo
2. copiar `cod5-adops-retro-preview.php`
3. copiar `adrotate-adops.php`
4. aplicar patch no AdRotate
5. aplicar patch no tema
6. flush de cache do WordPress
7. limpar cache do WP Rocket quando existir
8. validar via URL com preview
9. validar com print real do AdOps

## Particularidades aprendidas por portal

### Perrengue

- preview publico validado
- o cache do Cloudflare exigiu bypass pela origem no modo retroativo

### OMT

- o tema tinha um relogio JavaScript proprio em `parts/header-datestamp.php`
- o preview so ficou correto depois de remover esse relogio local e voltar para renderizacao server-side
- alem disso, o helper do tema usava `date_i18n()` de forma que a data renderizada voltava para `22:57` quando a simulacao era `18:57`
- a correcao definitiva foi trocar para `wp_date( $format, $now, wp_timezone() )`
- esse ajuste precisa ser preservado em futuras atualizacoes do `omt-theme`
- durante preview assinado, o datestamp precisa sair com `data-preview-active="1"` e o tick JS deve sair sem `new Date()` nesse estado
- se o tema voltar a sobrescrever `datetime` via JS em preview, o gate retroativo reprova a captura com `page_time_mismatch`

### AFL

- preview validado na primeira dobra
- datestamp retroativo funcionando
- o tema `tailpress` usa pool cacheado de posts na home
- durante preview retroativo, esse cache agora e desligado para nao misturar home atual com home historica

### PNMT

- preview validado na primeira dobra
- houve um erro transitorio `ERR_NETWORK_CHANGED` durante um teste, mas o portal passou no rerun
- o tema `tailpress` recebeu a mesma blindagem de cache retroativo da homepage

### PPMT

- a data retroativa funciona
- a posicao `HOME 1` pode ficar abaixo da primeira dobra nesse tema
- entao o preview temporal esta certo, mas a prova visual do banner pode exigir estrategia propria de captura da posicao
- o tema `tailpress` recebeu a mesma blindagem de cache retroativo da homepage

### ROO

- a data retroativa funciona
- a posicao `HOME 1` tambem pode ficar abaixo da primeira dobra dependendo do layout
- o tema `tailpress` recebeu a mesma blindagem de cache retroativo da homepage

## Script de rollout atual

Arquivo:

- `/Users/leandrobosaipo/Projetos/AdOps/scripts/src/deploy-retro-preview-multisite.sh`
- smoke de lock retroativo OMT:
  - `/Users/leandrobosaipo/Projetos/AdOps/scripts/src/test-omt-retro-preview-lock.mjs`

Ele:

- sobe o mu-plugin generico
- sobe `adrotate-adops.php`
- aplica patches do AdRotate
- aplica patches do tema
- roda manutencao do AdRotate
- limpa cache do WordPress
- limpa cache do WP Rocket quando existir
- aplica o ajuste de `wp_date()` no `omt-theme` durante a replicacao

## Catalogo de segredos por dominio

Hoje o projeto usa segredos dedicados por dominio no mu-plugin e no catalogo de sites.

Esses valores precisam continuar alinhados entre:

- `ops/wordpress/cod5-adops-retro-preview.php`
- `config/adrotate-sites.json`

## Limites atuais

- a simulacao retroativa ja esta validada por data/hora
- nem toda posicao cabe naturalmente na primeira dobra de todos os temas
- para posicoes como `HOME 1`, alguns portais podem precisar de uma estrategia de print especifica por posicao
