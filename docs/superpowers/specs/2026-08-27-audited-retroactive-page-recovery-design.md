# Recuperação retroativa auditada e consolidação operacional do AdOps

**Data:** 2026-08-27  
**Status:** design aprovado em chat; implementação bloqueada até novo HITL  
**Escopo:** evidências inválidas de 24 e 25/08/2026, API retroativa existente, regras antigas, branches e inventário Cloudflare

## Objetivo

Recuperar evidências retroativas reais das inserções `#1861`, `#2712`, `#2192`, `#2296` e `#2713`, reutilizando a API que já constrói páginas históricas. A página temporária deve conter posts reais da data, mídia correta, slot correto e todos os metadados exigidos pelo checklist. A entrega também deve planejar e executar a limpeza conservadora dos 36 avisos de regras antigas, consolidar as branches com segurança e inventariar recursos Cloudflare além do túnel.

## Problema observado

O relatório público classifica as evidências de 24 e 25/08 como inválidas, não como ausentes. O bloqueio observado anteriormente foi `metadata_retro_content_unverified`: a reconstrução não comprovou amostras editoriais históricas suficientes e, corretamente, não promoveu as capturas.

A primeira etapa da execução deve reconfirmar a causa no runtime atual usando a API canônica, planilha, Drive, AdRotate, jobs e relatório. Evidência histórica ou memória não substitui esse readback.

## Decisões aprovadas

- Usar auditoria real; nunca fabricar prova histórica.
- Reutilizar e, se necessário, corrigir a API retroativa existente.
- Não criar endpoint, fila, container, serviço ou dependência externa.
- Construir uma página temporária assinada, não indexada e com expiração curta.
- Preservar evidências inválidas anteriores como histórico; a nova captura nasce candidata.
- Promover somente após checklist final aprovado.
- Integrar branches em worktree limpa, sem `force-push` e sem misturar mudanças alheias.
- Inventariar Cloudflare nesta entrega, sem remover recursos.
- Tratar os 36 avisos com limpeza conservadora e backup anterior.

## Escopo operacional fechado

| Inserção | Portal | Datas-alvo | Estado inicial apresentado no relatório |
|---|---|---|---|
| `#1861` | PERRENGUE | 24 e 25/08/2026 | evidência inválida |
| `#2712` | PERRENGUE | 24 e 25/08/2026 | evidência inválida |
| `#2192` | PERRENGUE | 24 e 25/08/2026 | evidência inválida |
| `#2296` | PERRENGUE | 24 e 25/08/2026 | evidência inválida |
| `#2713` | PERRENGUE | 24 e 25/08/2026 | evidência inválida |

Nenhuma outra inserção ou data entra em backfill por inferência. Uma ampliação depende de nova evidência e autorização.

## Fontes e precedência

Para publicação e identidade comercial:

1. PI/PDF ou email autoritativo;
2. planilha canônica;
3. API AdOps;
4. Drive;
5. AdRotate e HTML público.

Para reconstrução editorial:

1. posts do próprio portal com `published_at` correspondente à data-alvo em `America/Cuiaba`;
2. resposta ou snapshot produzido pela API retroativa existente;
3. conteúdo público arquivado cuja origem, URL, data e assinatura sejam verificáveis.

Conteúdo atual, post de outra data ou imagem sem proveniência não pode preencher uma lacuna histórica.

## Arquitetura mínima

O fluxo continua sendo:

```text
print-backfill
  -> API retroativa existente
  -> página temporária assinada
  -> runner de captura existente
  -> checklist pre_upload
  -> upload candidato
  -> checklist final
  -> promoção auditada
  -> refresh incremental do relatório
```

A execução deve localizar a rota real no OpenAPI e seus consumidores antes de editar. O contrato existente é preservado; qualquer correção ocorre dentro do produtor ou consumidor já usado pelo `print-backfill`.

## Contrato da página retroativa

Cada página temporária deve carregar:

- `insertionId`, `campaignId`, PI, portal e data-alvo;
- timezone `America/Cuiaba`;
- posts realmente publicados na data-alvo;
- ao menos a cardinalidade editorial exigida pela regra publicada;
- URL, ID, título, `published_at` e assinatura/hash de cada amostra editorial;
- mídia exata da inserção, incluindo URL, basename e checksum quando disponível;
- grupo AdRotate, seletor do slot e posição esperados;
- banner renderizado no slot correto;
- domínio, data e hora visíveis no print;
- resposta HTTP válida e ausência de página 404, overlay ou erro visual;
- token/assinatura de uso único ou curta duração;
- `noindex` e ausência de navegação pública permanente;
- correlação com o job pai e a tentativa operacional.

Se qualquer item obrigatório não puder ser comprovado, a página não é elegível para promoção.

## Estados e falhas

- `ready_for_reconstruction`: fontes históricas e mídia comprovadas.
- `blocked_upstream`: planilha, mídia, publicação ou AdRotate divergente.
- `blocked_historical_content`: posts históricos insuficientes ou sem proveniência.
- `candidate_captured`: PNG candidato criado, ainda não válido.
- `audit_failed`: checklist final reprovado com ao menos um erro estruturado.
- `audited`: checklist final aprovado e URL alcançável.

`approved=false` com `blockingIssues=[]` permanece proibido. Uma falha de uma inserção não interrompe as demais.

## Fluxo por inserção

1. Consultar planilha, Drive, AdOps, AdRotate e evidências por data.
2. Confirmar campanha/inserção canônica, período, formato, mídia e grupo.
3. Corrigir divergência upstream pelo fluxo existente, sem duplicar campanha, inserção ou anúncio.
4. Validar a página retroativa em preflight, sem promover artefato.
5. Criar um único `print-backfill` para as datas explicitamente inválidas.
6. Acompanhar o mesmo `jobId` até `completed` ou `failed`.
7. Em falha, corrigir somente a causa observada antes de retry idempotente.
8. Confirmar cada data por `capture-proof/status`.
9. Fazer refresh incremental por data e validar o relatório público.

## Regras antigas

Antes de mutar regras:

- exportar regras publicadas e não publicadas;
- registrar ID, portal, grupo, seletor, alias, versão, status e referências;
- comparar com a configuração versionada e regras efetivamente consumidas;
- guardar backup recuperável.

Classificação:

- duplicata exata sem referência: elegível para remoção;
- versão antiga referenciada: permanece inativa;
- regra diferente potencialmente reutilizável: permanece arquivada e identificada;
- conflito com regra publicada: corrigir antes de capturas.

A meta é zero erro e zero aviso justificável no gate de integridade, sem apagar histórico útil para apenas reduzir contagem.

## Branches e worktrees

- Inventariar branches locais/remotas, worktrees, commits exclusivos e mudanças não commitadas.
- Identificar o commit do release ativo por `cod5-release.json`.
- Criar ou selecionar uma worktree limpa baseada na linha canônica comprovada.
- Integrar somente commits desta entrega e commits já implantados que ainda não estejam na branch canônica.
- Não usar `force-push`, reset destrutivo ou checkout sobre mudanças alheias.
- Parar para novo HITL se a branch canônica não puder ser determinada ou houver conflito material.

## Inventário Cloudflare

Consultar de forma somente leitura:

- Workers e rotas;
- Pages e domínios;
- D1;
- KV;
- R2;
- Queues;
- Cron Triggers;
- Tunnel;
- logs/analytics disponíveis e referências no repositório.

O relatório deve informar para cada recurso: identificador não secreto, finalidade, consumidor, tráfego observável, dependência, custo conhecido, estado e recomendação `manter`, `migrar`, `retirar` ou `investigar`.

Nenhum recurso Cloudflare será removido nesta execução. Retirada exige plano e HITL separado.

## Ondas sem conflito

### Onda 0 — baseline read-only

- Trilha A: cinco inserções, planilha, Drive, AdOps e AdRotate.
- Trilha B: API retroativa, checklist, jobs anteriores e relatório.
- Trilha C: branches, worktrees e release.
- Trilha D: Cloudflare.
- Trilha E: regras e referências.

### Onda 1 — contrato retroativo

Serial no fluxo compartilhado: teste de reprodução, correção mínima, testes de contrato, documentação e revisão independente.

### Onda 2 — prevenção e preparação

Paralelo somente em arquivos/responsabilidades distintas: regras, checklist/harness, runbook e worktree de integração.

### Onda 3 — deploy

Serial: gates, backup, deploy, SHA, containers, runners e fila.

### Onda 4 — operação real

No máximo duas inserções simultâneas, cada uma com job próprio:

- lote 1: `#1861`, `#2712`;
- lote 2: `#2192`, `#2296`;
- lote 3: `#2713`.

### Onda 5 — consumidor e integração

Refresh por data, relatório mensal, miniaturas, modal, downloads, filtros, harness finito, integração segura das branches e entrega do inventário Cloudflare.

## Quality gates

Código e contratos:

- testes que reproduzem o bloqueio editorial;
- testes de posts históricos, timezone, mídia, slot, idempotência e promoção;
- `node --check scripts/src/capture-insertion-proof.cjs`;
- `pnpm --dir scripts run audit:capture-rules-integrity`;
- build da API;
- build do painel;
- revisão independente sem achado bloqueante.

Runtime:

- SHA público igual ao commit implantado;
- API, web, banco, runners e monitor saudáveis;
- fila sem job órfão ou concorrente;
- backup e rollback identificados.

Evidência:

- dez pares inserção/data em `status=audited`;
- `checklistValidation.approved=true`;
- `blockingIssues=[]` somente quando aprovado;
- URL HTTP 200;
- posts da data, banner, slot, domínio, data e hora visíveis;
- miniatura, modal e download corretos;
- filtro `evidence=invalid` não lista os pares recuperados;
- evidências anteriores preservadas no histórico.

## Critérios de aceite

- A causa atual das dez evidências inválidas está documentada com fonte viva.
- A API retroativa existente constrói página histórica auditável sem conteúdo inventado.
- As cinco inserções ficam reconciliadas entre planilha, Drive, AdOps e AdRotate.
- Os dez prints ficam auditados ou permanecem bloqueados com causa técnica explícita.
- Os 36 avisos são eliminados ou individualmente justificados sem perda de configuração útil.
- A branch canônica contém somente commits aprovados e o release implantado continua rastreável.
- O inventário Cloudflare identifica qualquer recurso além do túnel e propõe a ação, sem remover nada.
- O harness termina de forma finita; nenhuma espera por cron ou janela conversacional faz parte do aceite.

## Fora de escopo

- Novo serviço de reconstrução.
- Nova fila ou container.
- Captura atual apresentada como histórica.
- Remoção de recursos Cloudflare.
- `force-push`, reescrita destrutiva de histórico ou limpeza ampla de worktrees.
- Regeneração de evidência já aprovada.

## Portão de implementação

Esta spec não autoriza código, mutação operacional, limpeza de regras, alteração de branches, deploy, backfill ou remoção Cloudflare. A execução começa somente após aprovação humana explícita da spec e do plano de implementação subsequente.
