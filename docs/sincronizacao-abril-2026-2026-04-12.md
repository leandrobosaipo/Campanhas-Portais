# Sincronização de Abril/2026 — 12/04/2026

## Objetivo da rodada

- revisar a documentação antes de agir
- alinhar os plugins gerenciados em todos os portais
- sincronizar o recorte de `ABRIL/2026` entre planilha, AdOps e AdRotate
- deixar o sistema pronto para a próxima etapa de geração dos prints do dia e dos retroativos em atraso

## Documentação consultada antes da execução

- [rollout-multisite-adrotate.md](/Users/leandrobosaipo/Projetos/AdOps/docs/rollout-multisite-adrotate.md)
- [central-de-sincronizacao.md](/Users/leandrobosaipo/Projetos/AdOps/docs/central-de-sincronizacao.md)
- [versionamento-plugins-portais.md](/Users/leandrobosaipo/Projetos/AdOps/docs/versionamento-plugins-portais.md)
- [ADOPS_MULTISITE_SYNC.md](/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/maintenance-facilnamao/docs/ADOPS_MULTISITE_SYNC.md)

## Resultado executivo

- `AdRotate` alinhado nos 6 portais com a mesma revisão: `5.17.2-c5.8`
- `cod5-avif-fallback.php` alinhado nos 6 portais: `1.0.0`
- `cod5-adops-retro-preview.php` padronizado nos 6 portais: `1.0.1`
- sincronização da planilha reaplicada com sucesso
- recorte de `ABRIL/2026` validado com `20` inserções planejadas
- as `20/20` inserções planejadas de abril estão com:
  - grupo AdRotate resolvido
  - `mediaUrl` preenchida
  - vínculo planejado no AdOps
- o sistema ficou pronto para a próxima rodada de geração de prints de `12/04/2026` e para os retroativos em atraso

## Sincronização da planilha

Endpoint executado:

- `POST /api/sync/planilha/latest`

Resumo da aplicação:

- `rawRows`: `220`
- `createdCampaigns`: `0`
- `updatedCampaigns`: `4`
- `createdInsertions`: `0`
- `updatedInsertions`: `220`
- `invalidDateCount`: `0`

## Estado do recorte de abril por portal

### Planejado no AdOps

- `PERRENGUE`: `11` inserções
- `OMT`: `4` inserções
- `AFL`: `2` inserções
- `PNMT`: `1` inserção
- `PPMT`: `1` inserção
- `ROO`: `1` inserção

Total: `20` inserções

### Consistência do planejado

Validação via `GET /api/integrations/adrotate/planned?competencia=ABRIL/2026&siteSigla=<SIGLA>`:

- `20/20` com `mediaUrl`
- `20/20` com `adrotateGroupId`
- `0` inserções sem mídia no recorte de abril
- `0` inserções sem grupo no recorte de abril

### Leitura operacional

O ruído de conciliação fora de abril continuava aparecendo em rotinas mais amplas, mas no recorte certo de `ABRIL/2026` o estado válido ficou limpo: não havia mais lacunas de mídia nem de grupo nas inserções planejadas.

## Relação com o AdRotate

Validação via `GET /api/integrations/adrotate/insertions/:id/relation` para as `20` inserções de abril:

- `20/20` com `plannedSelf`
- `20/20` com link de admin resolvível pela configuração do portal
- inserções encerradas antes de `12/04/2026` ou dependentes de página interna podem não aparecer como `exactLiveMatches` na leitura pública do momento, sem isso significar perda do vínculo administrativo

Casos observados:

- `OMT / 857` e `AFL / 863` não apareceram como `exactLiveMatches` na leitura pública de agora
- isso é compatível com o fato de:
  - uma inserção já estar fora do período atual (`857`)
  - outra depender de leitura de página interna e já estar encerrada (`863`)
- ambos continuaram com `plannedSelf`, grupo e relação administrativa preservados

## Versionamento dos plugins gerenciados

Auditoria nova criada e executada:

- comando:
  - `pnpm --filter @workspace/scripts run audit:wordpress-managed-versions`
- relatório:
  - [auditoria-versionamento-wordpress-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/auditoria-versionamento-wordpress-2026-04-12.md)

### Estado confirmado

- `AdRotate`: igual nos 6 portais
  - versão `5.17.2-c5.8`
  - md5 `de33005b77388a69f1af659b27a14c3b`
- `cod5-avif-fallback.php`: igual nos 6 portais
  - versão `1.0.0`
  - md5 `3850c9c17ba2fa3efa077d0f1d85dc76`
- `cod5-adops-retro-preview.php`: igual nos 6 portais
  - versão `1.0.1`
  - md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`

## Estado dos prints de hoje em 12/04/2026

Validação via `GET /api/insertions/capture-proof/audit?competencia=ABRIL/2026&targetDate=2026-04-12`:

- elegíveis hoje: `17`
- auditados hoje: `0`
- faltando hoje: `17`
- inválidos hoje: `0`

### Leitura operacional

Isso não indica falha de sincronização. Indica apenas que a rodada dos prints de `12/04/2026` ainda não foi executada.

Portanto o sistema ficou em estado bom para a próxima etapa:

- gerar `Prints do dia`
- rodar `Retroativos vencidos`

## Ganhos de conhecimento consolidados nesta rodada

- a validação de paridade entre portais não pode depender de memória; precisa de auditoria de hash e versão
- `Version:` ajuda na leitura humana, mas o hash ainda é o melhor verificador técnico de rollout completo
- MU-plugins próprios também precisam de header de versão para facilitar operação e suporte
- o ruído de reconciliação fora do recorte pode esconder que o mês atual já está sincronizado; o diagnóstico correto precisa ser sempre por competência e por portal
- `exactLiveMatches` sozinho não é indicador absoluto de quebra, porque depende do que está público naquele momento e da natureza do formato (`home` x `interno`)

## Próxima etapa recomendada

1. gerar os prints de `12/04/2026`
2. em seguida rodar os retroativos em atraso
3. usar a fila de auditoria para tratar apenas o que ficar com falha visual real
