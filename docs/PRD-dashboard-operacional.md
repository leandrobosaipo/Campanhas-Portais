# PRD: Dashboard Operacional de Campanhas

## Objetivo do produto

Centralizar o controle manual de campanhas publicitárias da agência em um sistema simples, com atualização fácil, reduzindo dependência de planilha, email e WhatsApp dispersos.

O produto deve atender três frentes:

- operação que cadastra campanhas e inserções
- equipe que publica e gera o print de comprovação
- gestão que acompanha prazo, pendência e execução

## Problema atual

Hoje o controle é manual e distribuído:

- demandas chegam por email e WhatsApp
- os dados são consolidados manualmente em planilha
- não existe visão operacional única e auditável
- o acompanhamento por competência, site e campanha exige conferência manual
- o histórico real nao está no sistema atual

## Usuários

### Operação

Responsável por registrar campanhas e inserções.

Precisa:

- cadastrar rápido
- evitar erro de digitação
- localizar campanhas e inserções por competência

### Publicação e comprovação

Responsável por cadastrar o banner no portal e gerar print.

Precisa:

- enxergar sua fila de trabalho
- marcar progresso por etapa
- anexar ou registrar evidências

### Gestão

Responsável por acompanhar execução e cobrar prazo.

Precisa:

- ver atraso por site e competência
- ver pendências por cliente e agência
- localizar gargalos de operação

## Escopo funcional

### Módulo 1: Campanhas

- cadastro manual de campanha
- cadastro guiado por PI em etapas
- duplicação de PI anterior
- presets reutilizáveis
- rascunho local durante implantação
- vínculo com cliente e agência
- valor líquido
- PI
- projeto
- plano
- planilha de referência
- produto
- praça
- condição de pagamento
- tipo de faturamento
- competência

### Módulo 2: Inserções

- cadastro de inserções por site
- local e formato
- período
- status normalizado
- ações em lote
- duplicação de linhas
- reordenação manual
- mídia opcional por inserção
- revisão inteligente antes de salvar
- flags operacionais:
  - publicado no site
  - print gerado
  - enviado para agência
  - docs enviados

### Módulo 3: Importação

- upload da planilha
- leitura por abas mensais
- preview antes de gravar
- normalização
- detecção de conflito e duplicidade
- confirmação de lote

### Módulo 3.1: Sincronização de Implantação

- sincronização manual por botão
- sincronização automática por webhook
- reprocessamento apenas do que mudou
- histórico de lotes sincronizados

### Módulo 4: Dashboard

- KPIs gerais
- pendências por etapa
- inserções por site
- histórico por competência
- visão por cliente
- itens críticos

### Módulo 5: Auditoria

- histórico por lote importado
- histórico por inserção
- evidências vinculadas
- datas de atualização

### Módulo 6: Tabelas Mestre

- gestão de clientes
- gestão de agências
- gestão de sites
- cadastro completo da agência com regras documentais e fiscais
- ativar e inativar registros
- corrigir grafia
- consolidar duplicados com migração dos vínculos

### Módulo 7: Perfis Operacionais por agência + cliente

- sobrescrever regras padrão da agência quando um cliente exigir fluxo diferente
- configurar:
  - aceite formal
  - prazo de envio de documentos
  - faturamento direto cliente/agência
  - necessidade de print diário
  - necessidade de bonificação em linha separada
  - instruções de parser/importação

## Regras de negócio já confirmadas

- `V` significa `concluído`
- `processo enviado?` no legado significa `publicado no site`
- `processo realizado?` no legado significa `enviado para agência/cliente`
- `docs enviados?` é etapa posterior ao envio principal
- `print` é obrigatório para toda inserção
- `print` só fica atrasado se não for registrado dentro do período da inserção
- `envio para agência` e `docs` ficam atrasados em `D+1` após o fim do período
- a visão padrão das telas operacionais deve abrir na competência atual
- leitura gerencial precisa cruzar `site + cliente/agência`
- parte das regras mudam por agência
- parte das regras muda por combinação `agência + cliente`

## Requisitos não funcionais

- fácil para equipe administrativa manter manualmente
- interface clara para não técnicos
- usabilidade suficiente para estagiário operar com apoio textual
- filtros rápidos por competência, site, cliente e agência
- trilha mínima de auditoria
- possibilidade de evolução para produção sem reescrever tudo
- sincronização sem uso de token de IA

## MVPs recomendados

### MVP 1

- importação com preview
- normalização básica
- carga histórica inicial

### MVP 2

- operação diária completa
- atualização de progresso
- registro de evidências
- wizard de cadastro em produção local
- gestão de tabelas mestre
- revisão guiada e onboarding contextual

### MVP 3

- dashboard gerencial com dados reais
- leitura de atrasos e gargalos

## Critério de sucesso

O produto passa a cumprir seu papel quando:

- uma competência inteira pode ser importada e auditada
- a equipe opera o dia a dia sem voltar para a planilha como ferramenta principal
- o gestor consegue acompanhar pendências e atrasos no sistema
