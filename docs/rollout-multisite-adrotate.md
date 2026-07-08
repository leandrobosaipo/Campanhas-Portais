# Rollout Multisite — AdRotate ↔ AdOps

## O que foi confirmado em 2026-04-08

A integração que antes estava centrada no `PERRENGUE` passou a ter um catálogo multisite com base em três fontes:

- documentação já produzida do Perrengue
- inventário público dos sites
- inventário remoto via `ssh + wp-cli` no servidor `facilnam`

## Documentação já existente que cobre Perrengue

### No projeto AdOps
- `docs/integracao-adrotate-adops.md`
- `docs/central-de-sincronizacao.md`
- `docs/base-de-conhecimento-do-projeto.md`
- `docs/status-do-projeto.md`

### No workspace WordPress do Perrengue
- `MVP_STATUS_PERRENGUE_RUNBOOK.md`
- `RELATORIO_CONFERENCIA_ADS_2026-02-19.md`
- `MIGRATION_ZERO_TOUCH_PLAN.md`
- `ADOPS_ADROTATE_SYNC_RUNBOOK.md`

## O que foi confirmado nos outros portais

Todos os sites do servidor `facilnam` estão com:

- plugin `adrotate` ativo, versão `5.17.2-c5.7`
- `wp-rocket` ativo
- `redis-cache` ativo

Temas ativos:

- `OMT`: `omt-theme`
- `AFL`: `tailpress`
- `PNMT`: `tailpress`
- `PPMT`: `tailpress`
- `ROO`: `tailpress`

## Domínios e siglas

- `PERRENGUE` -> `perrenguematogrosso.com`
- `OMT` -> `omatogrossense.com`
- `AFL` -> `afolhalivre.com`
- `PNMT` -> `portalnortemt.com`
- `PPMT` -> `portalpantanalmt.com`
- `ROO` -> `roonoticias.com`

## Grupos públicos detectados por site

- `PERRENGUE`: `1, 10, 11, 6, 7, 8`
- `OMT`: `1, 2, 4, 5, 6, 7, 8, 9`
- `AFL`: `1, 2, 3, 6, 7, 8`
- `PNMT`: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12`
- `PPMT`: `1, 2, 3, 6, 7, 8`
- `ROO`: `1, 2, 3, 6, 7, 8`

## O que foi implementado

### 1. Catálogo multisite
Arquivo novo:
- `config/adrotate-sites.json`

Esse catálogo centraliza por site:
- domínio
- home URL
- fallback de página interna
- nome do site para a moldura do print
- host label
- aliases de formatos da planilha
- grupo AdRotate por formato
- seletor do slot
- tipo de página (`home` ou `article`)

### 2. API refatorada para multisite
Arquivos:
- `artifacts/api-server/src/lib/adrotate-sites.ts`
- `artifacts/api-server/src/routes/insertions.ts`

Ganhos:
- `planned` agora é configurável por site
- `live-preview` agora tenta funcionar para todos os sites configurados
- `relation` da inserção deixa de depender só do Perrengue
- `media/sync-related` pode rodar por site ou em todos os sites configurados
- auditoria e batch de prints passam a respeitar o mapeamento por site

### 3. Captura semi-automática preparada para multisite
Arquivos:
- `scripts/src/adrotate-sites.cjs`
- `scripts/src/capture-insertion-proof.cjs`

Ganhos:
- o script de print passa a ler o mesmo catálogo por site
- a moldura usa `browserTitle` e `hostLabel` de cada portal
- páginas internas passam a tentar detecção do primeiro artigo dentro do domínio do portal

### 4. Central de Sincronização com seleção de site
Arquivo:
- `artifacts/adops/src/pages/SyncCenter.tsx`

Ganhos:
- seleção de competência
- seleção do site
- mesma tela para comparar `planilha -> AdOps -> site público`

## Regra de rollout

### Seguro para uso agora
- leitura pública dos grupos
- preview do planejado por site
- relation da inserção por site
- sincronização de mídia relacionada quando houver equivalência segura dentro do mesmo site

### Exige validação operacional antes de automatizar em lote
- prints automáticos em todos os grupos de todos os sites
- rename em lote de anúncios no AdRotate fora do Perrengue
- sincronização administrativa direta com o banco do AdRotate de todos os sites

## Motivo da cautela

A estrutura do plugin é comum, mas:

- os grupos mudam por site
- os layouts variam por tema
- alguns formatos da planilha são ambíguos (`VIDEO`, `INTERNO`, `MEGABANNER`)
- nem todo grupo visível na home equivale ao mesmo papel operacional entre portais

## Próxima etapa recomendada

1. confirmar por site os formatos que já podem gerar print com segurança
2. inspecionar grupos reais no banco AdRotate por domínio
3. aplicar nos outros sites o mesmo contrato de identificação AdOps que já foi iniciado no Perrengue
4. só depois ligar sincronização administrativa mais forte
