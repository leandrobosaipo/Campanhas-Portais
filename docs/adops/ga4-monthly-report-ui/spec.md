# Spec - Relatorio mensal GA4 pela UI

Atualizado em: 2026-05-29

## Entrada

Variaveis operacionais:

- `COD5_GA4_MONTH`: padrao `2026-05`.
- `COD5_GA4_PERIOD_START`: padrao `2026-05-01`.
- `COD5_GA4_PERIOD_END`: padrao `2026-05-31`.
- `COD5_GA4_OUTPUT_SLUG`: padrao `adops-ga4-maio-2026`.

Estas variaveis sao nomes de controle local. Elas nao sao credenciais.

## Fonte de dados

Fonte primaria:

```text
Pagina oficial do Google Analytics
```

Fonte permitida:

- Exportacao CSV baixada pela propria UI do GA.
- Print da tela do GA mostrando propriedade, periodo e metricas.

Fonte proibida para este fechamento:

- `POST /api/analytics/jobs/request-report`
- `GET /api/analytics/insertions/:id/requirements`
- PDF antigo do runner GA4 sem reconferencia pela UI.
- Dados digitados sem evidencia.

## Estrutura de saida final

```text
docs/reports/adops-ga4-maio-2026/
  index.html
  data.json
  report.json
  evidencias/
    PERRENGUE-ga4-maio-2026.csv
    PERRENGUE-ga4-maio-2026.png
    OMT-ga4-maio-2026.csv
    OMT-ga4-maio-2026.png
    AFL-ga4-maio-2026.csv
    AFL-ga4-maio-2026.png
    PNMT-ga4-maio-2026.csv
    PNMT-ga4-maio-2026.png
    PPMT-ga4-maio-2026.csv
    PPMT-ga4-maio-2026.png
    ROO-ga4-maio-2026.csv
    ROO-ga4-maio-2026.png
```

## Estrutura de simulacao

```text
docs/reports/adops-ga4-maio-2026-simulacao/
  index.html
  data.json
  report.json
  assets/
    logo.svg
    thumb.svg
```

## Modelo de dados

```json
{
  "period": {
    "start": "2026-05-01",
    "end": "2026-05-31",
    "label": "Maio/2026"
  },
  "source": "Google Analytics UI",
  "status": "simulation",
  "portals": [
    {
      "sigla": "PERRENGUE",
      "name": "Perrengue",
      "domain": "perrenguematogrosso.com",
      "ga4Property": "a confirmar na UI",
      "collectionStatus": "pending",
      "metrics": null,
      "evidence": []
    }
  ]
}
```

## Regras de validacao

- O periodo precisa ser `2026-05-01` a `2026-05-31`.
- A propriedade GA4 precisa bater com o dominio do portal.
- CSV e print precisam ser salvos antes de preencher numero final.
- Campo sem evidencia fica `null`, nao `0`.
- `0` so e permitido quando a UI do GA mostrar zero explicitamente.

