# SPEC Técnico AdOps Responsive + Figma Implement v1

## 1) Fonte de verdade

- Skill de implementação: `figma:figma-implement-design`
- Nó Figma informado por URL (`fileKey` + `node-id`) ou seleção ativa no Figma desktop.
- Screenshot do nó é referência visual final.

## 2) Contrato de entrada (Figma)

Aceitar uma das formas:

- `FIGMA_URL` no formato `https://figma.com/design/:fileKey/:fileName?node-id=...`
- `FIGMA_FILE_KEY` + `FIGMA_NODE_ID`
- seleção ativa no `figma-desktop` (com evidência exportada no workspace)

Artefatos esperados no workspace para execução do rollout:

- `docs/figma-context/adops-responsive-v1/design-context.json`
- `docs/figma-context/adops-responsive-v1/screenshot.png`

## 3) Contrato de implementação

### 3.1 Layout

- `Layout` deve suportar:
  - navegação desktop lateral
  - navegação mobile acionável
  - área de conteúdo sem bloqueio por header fixo

### 3.2 Header

- `PageHeader` deve ter comportamento responsivo:
  - desktop: não reduzir área útil de forma agressiva
  - mobile: sem colisão com ações

### 3.3 Telas alvo

- `Dashboard`
- `Insertions`
- `InsertionDetail`
- `Campaigns` e `CampaignDetail`

### 3.4 Regras de responsividade

- Breakpoints de validação:
  - `360x800`
  - `768x1024`
  - `1280x800`
- Sem overflow horizontal global:
  - `document.documentElement.scrollWidth <= clientWidth + 1`
- Ações primárias da tela devem permanecer visíveis no viewport inicial ou com rolagem curta.

## 4) Regras de fidelidade Figma (adaptadas ao projeto)

- Estrutura visual e hierarquia devem seguir o screenshot do Figma.
- Tokens e componentes existentes têm prioridade sobre hardcode literal.
- Quando houver conflito design system vs Figma:
  - usar componente do projeto
  - ajustar espaçamento/sizing para manter paridade visual.

## 5) Gates de validação

### Gate A — Build frontend

- `pnpm --dir artifacts/adops run build`
- Criticidade: alta (bloqueante).

### Gate B — Smoke responsivo

- Script: `scripts/src/test-adops-responsive-figma.mjs`
- Verifica rotas e viewports definidos.
- Criticidade: alta (bloqueante).

### Gate C — Entrada Figma/contexto

- Verifica presença de entrada Figma (`FIGMA_URL` ou `FIGMA_FILE_KEY+FIGMA_NODE_ID`) **ou** contexto local salvo em `docs/figma-context/...`.
- Criticidade: média (não bloqueante no v1, mas obrigatória para aceite final de paridade).

## 6) Saídas do harness

- `docs/harness-reports/adops-responsive-figma-v1/<timestamp>/summary.md`
- `docs/harness-reports/adops-responsive-figma-v1/<timestamp>/gate-results.json`
- `docs/harness-reports/adops-responsive-figma-v1/<timestamp>/logs/*.log`
- `docs/harness-reports/adops-responsive-figma-v1/<timestamp>/artifacts/responsive/*.png`

## 7) Critérios de aceite v1

- Build frontend aprovado.
- Smoke responsivo aprovado em todas as rotas e viewports alvo.
- Sem overflow horizontal global nas páginas testadas.
- Relatório do harness gerado com rastreabilidade de comandos e duração.
