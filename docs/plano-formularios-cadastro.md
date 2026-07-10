# Plano de UX para Cadastro de Campanhas e Inserções

## Objetivo

Transformar o cadastro atual em um fluxo muito rápido, intuitivo e tolerante a erro, pensado para:

- PI recorrente mês a mês
- múltiplas inserções por PI
- variação de períodos por site e formato
- operação feita por pessoas sem conhecimento prévio da regra completa
- correção contínua de clientes, agências, sites e formatos sem depender de código

## Estado atual do formulário

Arquivo atual analisado:

- [/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/src/pages/NewCampaign.tsx](/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/src/pages/NewCampaign.tsx)

### Pontos positivos

- já separa campanha e inserções
- já permite múltiplas inserções
- já permite duplicar linha
- já usa listas mestre de cliente, agência e site

### Gargalos atuais

- ordem dos campos ainda não acompanha o raciocínio real da operação
- o usuário precisa decidir muita coisa cedo demais
- não existe conceito de PI-modelo ou preset
- não existe preenchimento em lote de períodos, formatos e status
- não existe agrupamento por PI ou por pacote de inserções
- não existe ajuda contextual forte para iniciantes
- não existe saneamento operacional embutido para grafias erradas
- não existe leitura assistida de padrões recorrentes do histórico
- a tela ainda parece um formulário genérico, não um fluxo de ad ops

## O que o histórico mostra sobre o fluxo real

Base observada nas abas históricas, com ênfase em [MARCO26.md](/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/abas-markdown/MARCO26.md) e [ABRIL_2026.md](/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/abas-markdown/ABRIL_2026.md).

### Padrões recorrentes

- a unidade operacional mais natural não é a campanha isolada; muitas vezes é a PI
- uma PI frequentemente gera mais de uma inserção
- uma mesma campanha pode aparecer em mais de um site
- uma mesma campanha pode aparecer com mais de um formato
- uma mesma PI pode ter períodos diferentes por formato
- Instagram e banner frequentemente convivem dentro da mesma lógica de campanha
- cliente e agência vêm de forma repetitiva e, às vezes, com grafia inconsistente
- o operador tende a repetir combinações de:
  - cliente
  - agência
  - campanha
  - PI
  - site
  - formato
  - janela de datas parecida

### Implicação de produto

O fluxo ideal deve ser orientado por:

1. `Origem da demanda / PI`
2. `Cabeçalho da PI`
3. `Pacote de inserções`
4. `Ajustes finos por linha`
5. `Validação e confirmação`

Não deve ser orientado por um formulário linear simples.

## Proposta de novo fluxo de cadastro

## Status de implementação local

### Fase A

Status: `implementada`

Entregue:

- wizard por PI em 4 etapas
- seleção de modo de entrada
- cabeçalho orientado pela operação
- grade de inserções com edição inline

### Fase B

Status: `implementada`

Entregue:

- duplicar PI anterior
- presets locais
- rascunhos locais
- seleção múltipla
- ações em lote
- reordenação de linhas

### Fase C

Status: `implementada parcialmente`

Entregue:

- tela de configurações
- gestão de clientes, agências e sites
- edição de grafia
- ativação/inativação
- consolidação de duplicados com migração de vínculos

Pendente:

- aliases persistidos em banco
- histórico formal de merge

### Fase D

Status: `implementada`

Entregue:

- tooltips e ajuda contextual
- exemplos operacionais na tela
- revisão inteligente antes de salvar
- explicações orientadas para usuário iniciante

### Etapa 1: Escolher modo de entrada

Na primeira tela, o usuário escolhe um destes modos:

- `Nova PI do zero`
- `Duplicar PI anterior`
- `Usar preset`
- `Continuar rascunho`

### Etapa 2: Cabeçalho da PI

Ordem ideal dos campos:

1. `Competência`
2. `Cliente`
3. `Agência`
4. `Código PI`
5. `Projeto`
6. `Plano`
7. `Planilha / referência`
8. `Nome da campanha`
9. `Produto`
10. `Praça`
11. `Condição de pagamento`
12. `Faturamento`
13. `Valor líquido total`
14. `Observações gerais`

Campos confirmados pelas PIs modelo:

- `projeto`
- `plano`
- `planilha`
- `produto`
- `praça`
- `condição de pagamento`
- `faturamento`

Implicação:

- o wizard precisa tratar `campanha` como um cabeçalho comercial/operacional real da PI, não só como um nome com valor

### Etapa 3: Bloco “Inserções da PI”

O formulário precisa abrir já com conceito de grade editável.

Cada linha representa uma inserção.

Campos por linha:

- site
- formato/local
- período início
- período fim
- status inicial
- mídia opcional
- observações

### Etapa 4: Ações em lote

Acima da grade, precisam existir ações rápidas:

- aplicar mesmo período para várias linhas
- aplicar mesmo formato para várias linhas
- aplicar mesmo status para várias linhas
- duplicar seleção
- arrastar para reordenar
- selecionar múltiplas linhas
- remover múltiplas linhas
- gerar linhas a partir de preset

### Etapa 5: Revisão inteligente

Antes de salvar, mostrar uma caixa de revisão com:

- total de inserções
- total por site
- total por formato
- conflito de datas
- campos faltando
- grafia suspeita de agência/cliente
- formatos fora do padrão

## Como esse fluxo deve ficar absurdamente fácil

### 1. Presets

Criar presets reutilizáveis de:

- PI recorrente
- pacote por cliente
- pacote por agência
- pacote por campanha recorrente
- pacote por site + formato

Exemplos:

- `Perrengue + Mega Banner Topo`
- `Campanha GOV padrão com 3 sites`
- `Banner + Instagram para campanha institucional`
- `FTD interior` 

### 2. Duplicação inteligente

Ao digitar uma PI já usada antes, o sistema deve sugerir:

- copiar cliente/agência anteriores
- copiar sites e formatos anteriores
- copiar estrutura do mês anterior
- ajustar apenas o novo período

### 3. Grade com edição rápida

A área de inserções deve parecer mais uma planilha assistida do que um formulário vertical.

Recursos importantes:

- seleção múltipla
- copiar e colar entre linhas
- arrastar para duplicar padrões
- arrastar para reordenar
- criar várias linhas com um clique
- editar inline

### 3.1. Regras carregadas automaticamente

Quando `cliente` e `agência` forem escolhidos, o sistema deve futuramente:

- sugerir tipo de faturamento
- avisar se `aceite formal` é obrigatório
- avisar se `print diário` é obrigatório
- avisar prazo de envio documental
- avisar se existe bonificação em linha separada

### 4. Assistência textual para iniciantes

Cada bloco deve ter:

- tooltip curta
- exemplo real
- dica de preenchimento
- alerta do que acontece se mudar o campo

Exemplos:

- `PI`: código enviado pela agência. Se repetir uma PI antiga, o sistema pode sugerir reaproveitamento.
- `Formato`: define o tipo e o local de publicação. Isso impacta o cadastro do banner e o tipo de print esperado.
- `Período`: define quantos prints diários serão esperados quando o formato exigir comprovação diária.

### 5. Explicação orientada por contexto

Ao lado da grade, uma coluna de ajuda dinâmica:

- se escolher `Instagram`, explicar diferença de evidência e mídia
- se escolher `banner`, explicar posição e print esperado
- se escolher vários sites, explicar que a PI pode gerar várias inserções
- se o período for longo, informar automaticamente o número previsto de prints
- se a agência tiver regra especial, mostrar box com o que muda naquele cadastro

## Gestão das tabelas mestre

O histórico já mostra necessidade clara de administração de tabelas mestre.

### Problema

Há grafias inconsistentes de:

- agência
- cliente
- formato/local
- eventualmente PI ou nome de campanha em padrões semelhantes

### Solução recomendada

Criar área administrativa para:

- `Agências`
- `Clientes`
- `Sites`
- `Formatos / Locais`
- `Presets`
- `Aliases e correções`

### Recursos da área administrativa

- editar nome exibido
- definir ativo/inativo
- fundir registros duplicados
- cadastrar aliases
- mostrar onde cada item está sendo usado
- corrigir em lote dados históricos

### Exemplo de regra

Se aparecer `RENCA`, `Renca`, `RENCA `, o sistema deve sugerir unificação.

## Navegação e responsividade do formulário

### Desktop

- cabeçalho fixo com resumo da PI
- grade de inserções com edição inline
- barra lateral de ajuda
- ações em lote sempre visíveis

### Mobile / telas menores

- fluxo em etapas
- cards por inserção em vez de tabela larga
- edição por drawer ou modal lateral
- botões grandes de duplicar, adicionar e selecionar múltiplos

### Controles desejados

- multi-select
- drag and drop de linhas
- chips clicáveis
- calendário com faixa de período
- presets clicáveis
- preenchimento rápido por teclado

## Skills e referências úteis encontrados em skills.sh

Pesquisei skills públicos que combinam com a necessidade de reformular esses formulários.

### 1. `form-validation-architect`

Fonte:

- [skills.sh/erichowens/some_claude_skills/form-validation-architect](https://skills.sh/erichowens/some_claude_skills/form-validation-architect)

Por que é útil:

- formulários complexos
- multi-step wizard
- arrays dinâmicos
- persistência de estado
- validação dependente entre campos
- excelente encaixe para campanha + múltiplas inserções

### 2. `bencium-controlled-ux-designer`

Fonte:

- [skills.sh/bencium/bencium-claude-code-design-skill/bencium-controlled-ux-designer](https://skills.sh/bencium/bencium-claude-code-design-skill/bencium-controlled-ux-designer)

Por que é útil:

- foco em UX intencional
- interação consistente
- feedback imediato
- drag and drop
- inline editing
- preservação de input com erro

### 3. `browser-testing`

Fonte:

- [skills.sh/serkan-ozal/browser-devtools-skills/browser-testing](https://skills.sh/serkan-ozal/browser-devtools-skills/browser-testing)

Por que é útil:

- testar multi-step forms
- selects
- drag and drop
- validação de UX real
- ótimo para homologação do fluxo antes de produção

### 4. `design-led-development`

Fonte:

- [skills.sh/jakenuts/agent-skills/design-led-development](https://skills.sh/jakenuts/agent-skills/design-led-development)

Por que é útil:

- empty states úteis
- onboarding contextual
- autosave para formulários longos
- foco em clareza visual e onboarding

### Relação com skills já disponíveis no ambiente atual

Além das referências externas, as skills já disponíveis que melhor combinam com essa frente são:

- `frontend-design`
- `browser-automation`
- `playwright-cli`

## Proposta de evolução em fases

### Fase A: Estruturar o cadastro certo

- reordenar formulário conforme o fluxo real da PI
- separar `cabeçalho da PI` de `linhas de inserção`
- adicionar ajuda contextual
- melhorar responsividade

### Fase B: Acelerar repetição

- duplicar PI anterior
- presets
- aplicar valores em lote
- seleção múltipla
- drag and drop

### Fase C: Higiene operacional

- CRUD de tabelas mestre
- alias de agência/cliente/formato
- fusão de registros duplicados
- correção em lote

### Fase D: Onboarding de estagiário

- tooltips
- exemplos reais
- hints por campo
- caixa “o que acontece se mudar isso?”
- checklist final de revisão

## Regras que precisam ser confirmadas com o cliente nas PIs modelo

Quando você trouxer as PIs de modelo, precisamos validar:

- o que define o nome oficial da campanha
- como diferenciar PI nova de PI recorrente
- quando a mesma PI deve virar mais de uma campanha ou só mais inserções
- quando mídia é por campanha ou por inserção
- quando print é diário, por período ou por publicação
- quais formatos sempre exigem mídia
- quais formatos usam evidência diferente
- como tratar Instagram versus banner no mesmo pacote
- se o valor líquido pertence à PI inteira ou pode ser quebrado por inserção

## Recomendação prática

O próximo desenvolvimento não deve ser “mais um formulário”.

Deve ser um `wizard operacional de PI` com:

- cabeçalho da PI
- grade inteligente de inserções
- presets
- duplicação do mês anterior
- validação assistida
- gestão de tabelas mestre

Esse é o caminho com maior impacto de produtividade e menor chance de erro.
