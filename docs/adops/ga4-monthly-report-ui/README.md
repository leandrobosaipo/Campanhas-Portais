# GA4 Monthly Report UI - AdOps

Atualizado em: 2026-05-29

Este pacote documenta o fluxo de fechamento mensal do Google Analytics para os 6 portais da Codigo5 usando a pagina oficial do Google Analytics.

Este fluxo nao usa:

- API personalizada do AdOps.
- Worker `analytics-report`.
- Runner remoto GA4.
- PDFs antigos gerados por automacao.

Use este pacote quando o pedido for:

- relatorio mensal de Analytics;
- fechamento de mes;
- relatorio de maio dos 6 portais;
- coleta pela pagina do Google Analytics.

## Ordem de leitura

1. `prd.md`
2. `spec.md`
3. `playbook.md`
4. `runbook.md`
5. `harness.md`
6. `agents.md`

## Portais do fechamento

| Sigla | Portal | Dominio |
|---|---|---|
| PERRENGUE | Perrengue | perrenguematogrosso.com |
| OMT | O Matogrossense | omatogrossense.com |
| AFL | A Folha Livre | afolhalivre.com |
| PNMT | Portal Norte MT | portalnortemt.com |
| PPMT | Portal Pantanal MT | portalpantanalmt.com |
| ROO | Roo Noticias | roonoticias.com |

## Artefato de simulacao

- HTML local: `docs/reports/adops-ga4-maio-2026-simulacao/index.html`
- Dados simulados: `docs/reports/adops-ga4-maio-2026-simulacao/data.json`
- Metadados: `docs/reports/adops-ga4-maio-2026-simulacao/report.json`

## Regra critica

O numero final deve vir da interface do Google Analytics.

Se algum dado vier de CSV exportado pelo GA, o arquivo bruto deve ficar salvo junto do bundle final. Se vier de print manual, o print precisa mostrar propriedade, periodo e metrica.

