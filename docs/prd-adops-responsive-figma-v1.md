# PRD AdOps Responsive + Figma Implement v1

## 1) Objetivo

Redesenhar e implementar a experiência responsiva do AdOps (Dashboard, Inserções, Evidências e Campanhas) com fidelidade visual ao Figma e validação operacional por harness.

## 2) Problema atual

- Barra fixa no desktop reduz área útil e piora navegação.
- Em mobile, partes do painel não aparecem de forma confiável.
- Falta um fluxo único para transformar design Figma em código com critérios de aceite mensuráveis.

## 3) Resultado esperado

- Layout desktop sem atrito de rolagem e com hierarquia clara.
- Layout mobile/tablet utilizável sem overflow horizontal.
- Implementação orientada por nó do Figma com paridade visual consistente.
- Regressão controlada por harness + smoke responsivo.

## 4) Escopo v1

Incluído:

- Fluxo operacional por etapas para implementação via Figma.
- Regras de implementação por tela crítica:
  - `Dashboard`
  - `Inserções`
  - `InsertionDetail` (evidências/logs)
  - `Campanhas/CampaignDetail`
- Harness com relatório versionado por execução.
- Smoke responsivo automatizado em `360px`, `768px`, `1280px`.

Fora do escopo:

- Replataform completa do frontend.
- Refatoração profunda de dados/queries.
- Reescrita de design system do projeto.

## 5) Etapas de implementação (faseado)

1. **Fase 0 — Entrada Figma e baseline**
- Confirmar URL Figma com `fileKey + node-id` (ou seleção ativa no Figma desktop).
- Gerar contexto e screenshot de referência.
- Fixar baseline visual das telas atuais.

2. **Fase 1 — Core layout responsivo**
- Ajustar `Layout` e `PageHeader` para desktop/mobile.
- Resolver comportamento de barra fixa para não comprometer usabilidade.
- Garantir navegação mobile consistente.

3. **Fase 2 — Dashboard + Inserções**
- Aplicar padrão responsivo por blocos/cartões no mobile.
- Evitar tabela rígida abaixo de 768px.
- Preservar ações operacionais principais.

4. **Fase 3 — Evidências e Campanhas**
- Ajustar lista de evidências/logs e ações sem overflow.
- Reorganizar cards/ações de campanha para leitura rápida.
- Manter semântica operacional e status.

5. **Fase 4 — Hardening e validação**
- Rodar harness completo.
- Corrigir regressões de responsividade e paridade visual.
- Publicar com checklist de aceite.

## 6) Critérios de sucesso

- Usuário entende “onde clicar” em menos de 10 segundos em desktop e mobile.
- Sem scroll horizontal nas telas alvo.
- Controles críticos visíveis e acionáveis em 360px.
- Harness gera relatório com status de gates e artefatos.

## 7) Riscos

- Divergência entre Figma e componentes já existentes.
- Regressão de usabilidade por sticky headers.
- Dependência de dados reais em páginas específicas.

## 8) Mitigações

- Reuso prioritário de componentes existentes.
- Rollout faseado por tela.
- Smoke responsivo automatizado por viewport e rota.
