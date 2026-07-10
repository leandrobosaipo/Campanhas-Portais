# Design System: AdOps Evidence Monthly Report

**Project ID:** AdOps local report

## 1. Visual Theme & Atmosphere

Painel operacional denso, sobrio e utilitario. A interface deve parecer uma mesa de controle de midia, nao uma landing page. O foco e reduzir leitura longa e privilegiar status, thumb, simbolo e link direto.

## 2. Color Palette & Roles

- Tinted Operational Paper (`oklch(0.955 0.006 170)`): fundo geral, frio e pouco saturado.
- Quiet Panel (`oklch(0.988 0.004 170)`): superficie dos grupos e cards.
- Deep Ink (`oklch(0.205 0.026 180)`): texto principal e filtros ativos.
- Muted Steel (`oklch(0.485 0.018 180)`): metadados, datas e informacao secundaria.
- Verified Green (`oklch(0.48 0.13 155)`): evidencia em dia.
- Pending Amber (`oklch(0.64 0.14 75)`): pendencia ou falta de evidencia.
- Audit Red (`oklch(0.52 0.16 30)`): erro real de auditoria.

## 3. Typography Rules

Usar sans nativa do sistema para densidade e legibilidade operacional. Titulos curtos, pesos fortes e escala contida. Evitar texto de apoio longo dentro do painel.

## 4. Component Stylings

* **Filtros:** pill compacta, sem gradiente, estado ativo por contraste solido.
* **Portais:** cabecalho com logo real ou fallback por sigla.
* **Campanhas:** bloco compacto com contadores visuais.
* **Insercoes:** grade densa com barra de progresso de dias auditados e motivo textual curto.
* **Thumbs:** carrossel horizontal com todas as evidencias auditadas do periodo exigido.
* **Dias sem evidencia:** celulas compactas com data, estado e tooltip. Nao ocultar datas.
* **Modal:** imagem grande quando houver, detalhes laterais, timeline, datas pendentes, datas invalidas e links diretos.

## 5. Layout Principles

Desktop prioriza duas colunas de insercoes por campanha. Mobile empilha portal, campanha e insercao sem esconder dados criticos. Evitar cards aninhados decorativos; usar bordas discretas apenas para separar unidades operacionais.
