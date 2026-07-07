# PRD - Relatorio mensal GA4 pela pagina do Google Analytics

Atualizado em: 2026-05-29

## Objetivo

Gerar o relatorio mensal de maio/2026 dos 6 portais usando a pagina oficial do Google Analytics.

O foco e fechamento comercial simples:

- mostrar audiencia por portal;
- registrar a fonte visual dos dados;
- salvar o pacote em local previsivel;
- reduzir risco de erro na segunda-feira.

## Usuario

- Operador AdOps que fecha o mes.
- Gestor comercial que precisa enviar numeros.
- Cliente que precisa entender resultado sem jargao.

## Escopo

Periodo:

```text
2026-05-01 ate 2026-05-31
```

Portais:

- Perrengue
- O Matogrossense
- A Folha Livre
- Portal Norte MT
- Portal Pantanal MT
- Roo Noticias

## Metricas minimas

Para cada portal:

- usuarios ativos;
- novos usuarios;
- sessoes;
- visualizacoes;
- visualizacoes por usuario;
- tempo medio de engajamento;
- taxa de engajamento;
- principais cidades, quando util.

## Nao objetivos

- Nao gerar relatorio pela API personalizada antiga.
- Nao disparar job `analytics-report`.
- Nao criar endpoint novo.
- Nao alterar AdOps, AdRotate, planilha ou WordPress.
- Nao inventar numero se a propriedade GA4 nao abrir.

## Criterio de aceite

- Cada portal tem dado ou lacuna explicita.
- Cada numero tem fonte: exportacao CSV do GA ou print da tela do GA.
- O bundle final tem `index.html`, `data.json`, `report.json` e pasta `evidencias/`.
- O periodo aparece visivel no relatorio.
- Nenhum cookie, token, email sensivel ou dado de conta aparece no HTML publico.

