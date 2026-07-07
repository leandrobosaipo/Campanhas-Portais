# Plano de Adequação para Dados Reais

## Objetivo

Adaptar o dashboard para operar com a planilha real da agência, mantendo a entrada manual, mas permitindo:

- importar histórico do Excel
- normalizar dados legados
- acompanhar operação por competência, site, cliente e agência
- evoluir depois para uma Fase 2 local em cima do código gerado

## Status atual do plano

- `Etapa 0`: concluída
- `Etapa 1`: concluída parcialmente
- `Etapa 2`: parcial
- `Produção`: não iniciada

## Situação atual

O projeto já tem:

- frontend Vite em `artifacts/adops`
- API Express em `artifacts/api-server`
- banco PostgreSQL com schema de campanhas, inserções, sites, clientes, agências e evidências
- base da planilha já extraída e organizada em Markdown para discovery e testes de importação
- projeto rodando localmente com frontend e API
- melhorias iniciais de usabilidade em dashboard, campanhas e inserções
- filtros por cliente e agência na fila operacional
- importador técnico local criado
- base local carregada com `207 inserções` e `151 campanhas` reais

## Fontes de verdade já preparadas

Durante a fase de análise, os dados históricos da planilha foram exportados para textos simples, o que facilita:

- revisar regras de normalização
- criar testes de importação
- validar competências, sites e formatos sem depender do Excel aberto

Arquivos-base:

- histórico por aba: `/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/abas-markdown`
- índice da extração: `/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/00-INDICE.md`
- validação da operação: `/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/validacao-fase-0.md`
- confirmações de negócio: `/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/confirmacoes-fase-0.md`

Esses arquivos devem ser usados como massa de teste para o importador.

O projeto ainda não tem:

- importação da planilha `.xlsx` feita por usuário final
- tabela de aliases para sites, formatos e status legados
- ingestão assistida do histórico real
- UI dedicada para importar, revisar e confirmar lotes
- ambiente de produção definido
- autenticação e perfis
- sincronização automática da planilha para a dashboard

## Estratégia sugerida

### Etapa 1 — Importação assistida do histórico

Status: `parcial`

Criar um fluxo de importação em duas fases:

1. `parse`
2. `review + commit`

#### Parse

Entrada:

- upload de `.xlsx`
- ou webhook/JSON normalizado vindo da planilha

Saída intermediária:

- competência detectada
- site detectado
- campanha
- PI
- agência
- valor líquido
- período original
- datas normalizadas
- local original
- local normalizado
- status original
- status normalizado
- flags operacionais

#### Review + commit

Antes de gravar no banco, o usuário deve revisar:

- duplicidades prováveis
- sites não reconhecidos
- formatos não reconhecidos
- status não reconhecidos
- clientes/agências não mapeados

### Etapa 2 — Operação contínua manual mais simples

Status: `parcial`

Depois da primeira carga histórica, o sistema deve suportar o fluxo manual diário:

1. chegada da demanda por email ou WhatsApp
2. cadastro da campanha
3. cadastro das inserções por site
4. marcação de publicação no site
5. confirmação do print obrigatório
6. marcação de envio para agência
7. marcação de envio dos documentos

### Etapa 3 — Gestão e cobrança

Status: `parcial`

Com histórico e operação corrente no banco, o dashboard deve permitir:

- ver pendências por site
- ver pendências por cliente e agência
- ver atrasos por competência
- localizar gargalos por etapa operacional
- auditar cada inserção com evidências e datas

## Tabelas auxiliares recomendadas

Adicionar tabelas ou estruturas de apoio para normalização:

- `site_aliases`
- `agency_aliases`
- `client_aliases`
- `status_aliases`
- `formato_aliases`
- `import_batches`
- `import_rows`

## Regras de normalização iniciais

### Status

- `FINALIZADA` -> `concluido`
- `FINALIZADO` -> `concluido`
- `Finalizada` -> `concluido`
- `finalizada` -> `concluido`
- `V` -> `concluido`
- `ATIVA` -> `aguardando_publicacao` ou `publicado_no_site`, dependendo das flags

### Fluxo operacional confirmado

- `processo enviado?` = banner cadastrado/publicado no site
- `processo realizado?` = enviado para agência/cliente
- `docs enviados?` = etapa adicional após envio
- `print` = obrigatório para toda inserção

### Formatos

Criar normalização por dicionário:

- `MEGA BANNER TOPO` -> `MEGABANNER TOPO`
- `MEGABANNER TPO` -> `MEGABANNER TOPO`
- `INTERNO NOTICIA` -> `INTERNO DE NOTICIAS`
- outras variações devem cair em revisão manual

## Mudanças de backend recomendadas

### Curto prazo

- endpoint `POST /api/imports/preview`
- endpoint `POST /api/imports/commit`
- endpoint `GET /api/imports/:id`
- endpoint `POST /api/sync/run`
- parser para `.xlsx` usando a estrutura real das abas mensais
- normalizador compartilhado para status, formato, site, agência e cliente
- detecção de duplicidade por `competência + campanha + site + período + local`

### Regras

- nunca gravar diretamente o arquivo bruto sem preview
- permitir importar por competência
- permitir merge com campanhas já existentes
- permitir ignorar linhas vazias ou cabeçalhos internos por site
- permitir reprocessar apenas abas alteradas durante a implantação

## Mudanças de frontend recomendadas

### Nova área

Criar tela `Importação` com:

- upload da planilha
- resumo do lote
- erros de normalização
- conflitos
- preview das linhas
- botão de confirmar importação
- botão `Sincronizar agora`

### Fluxos que essa tela precisa cobrir

- importar um mês inteiro
- importar apenas uma aba
- reimportar um lote com correção
- salvar rascunho de mapeamentos
- mostrar quantas linhas serão criadas, atualizadas, ignoradas ou bloqueadas

### Melhorias operacionais

- filtros persistentes por competência
- filtros por cliente e agência em campanhas e inserções
- legenda operacional clara
- tabela com colunas configuráveis
- ações em lote para progresso operacional

## Ordem recomendada de implementação

1. criar aliases e batch de importação
2. criar parser do `.xlsx` ou adaptador de webhook
3. criar preview da importação
4. criar confirmação do lote
5. conectar dashboard com dados históricos reais
6. adicionar validações de duplicidade
7. adicionar evidências e auditoria por inserção
8. criar ações em lote para a operação
9. automatizar sincronização de implantação

## Etapas já feitas

- análise da planilha real
- exportação das abas para Markdown
- confirmação das regras de negócio
- setup local do repositório
- revisão inicial de usabilidade
- validação do gap entre planilha e base demo
- carga local com dados reais da planilha
- remoção dos dados de modelo da base local

## O que falta fazer

- transformar o importador técnico em fluxo operacional
- validar competências importadas com usuários
- preparar deploy
- estruturar governança de manutenção
- automatizar sincronização de implantação

## Plano de MVP em ondas

### MVP 1 — Importação com preview

Entrega completa:

- subir planilha
- detectar aba e competência
- mostrar preview
- apontar conflitos
- confirmar importação

Teste de validação:

- importar uma competência inteira da base histórica
- validar contagem por site contra o Markdown exportado

### MVP 2 — Operação diária

Entrega completa:

- cadastrar campanha manual
- cadastrar inserções
- atualizar progresso operacional
- anexar ou registrar evidência

Teste de validação:

- rodar uma semana de operação sem depender da planilha como ferramenta principal

### MVP 3 — Gestão

Entrega completa:

- dashboard com dados reais
- filtros por competência, site, cliente e agência
- leitura de SLA operacional
- sincronização manual por botão

Teste de validação:

- gestor identifica atrasos e pendências em menos de 5 minutos
- sincronização atualiza a base sem intervenção manual linha a linha

## Critérios de aceite

- importar ao menos uma competência inteira sem correção manual no banco
- revisar conflitos antes de gravar
- conseguir filtrar o histórico importado por site, cliente, agência e competência
- manter fluxo manual de nova campanha funcionando em paralelo
