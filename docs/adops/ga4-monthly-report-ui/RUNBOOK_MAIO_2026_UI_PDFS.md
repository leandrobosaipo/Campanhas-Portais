# Runbook — GA4 UI PDFs de Cidade — Maio 2026

Atualizado em: 2026-05-29

## Objetivo

Gerar os PDFs oficiais do Google Analytics pela interface do GA4.

Nao usar:

- API personalizada;
- Google Analytics Data API;
- template local;
- PDF gerado por script.

Usar:

- Chrome autenticado;
- tela do Google Analytics;
- relatorio `Detalhes demograficos: Cidade`;
- export nativo: `Compartilhar este relatorio` -> `Baixar o arquivo` -> `Baixar o PDF`.

## Data da rodada real

Executar em 2026-06-01, depois da virada do mes.

Periodo real:

```text
2026-05-01 -> 2026-05-31
```

Horario recomendado:

```text
2026-06-01 00:05 America/Cuiaba
```

Motivo: reduz risco de o GA4 ainda nao ter fechado o dia 31 na UI.

## Pasta final obrigatoria

Para a rodada real de maio:

```text
~/Downloads/GA4-Analytics-Maio-26-Google-Analytics-UI-PDFs/
```

Para a simulacao de 2026-05-29:

```text
~/Downloads/GA4-Analytics-Maio-26-Google-Analytics-UI-PDFs/
```

Nao usar pasta final com `AMOSTRA` no nome.

`AMOSTRA` pode existir como rastro de teste, mas nao como entrega final.

## Nomes obrigatorios dos arquivos

```text
A Folha Livre Cidade Maio 26 - Analytics.pdf
O Matogrossense Cidade Maio 26 - Analytics.pdf
Portal Norte MT Cidade Maio 26 - Analytics.pdf
Portal Pantanal MT Cidade Maio 26 - Analytics.pdf
Roo Notícias Cidade Maio 26 - Analytics.pdf
Perrengue Cidade Maio 26 - Analytics.pdf
```

Observacao: usar o nome configurado no projeto. Hoje o esperado validado e `Roo Notícias Cidade Maio 26 - Analytics.pdf`.

## Fonte dos 6 portais

Fonte operacional:

```text
/Users/leandrobosaipo/Projetos/Codex/ga4-relatorios-portais/configs/sites.csv
```

Portais:

- A Folha Livre
- O Matogrossense
- Portal Norte MT
- Portal Pantanal MT
- Roo Notícias
- Perrengue

## Fluxo correto por portal

1. Abrir a home da propriedade no GA4.
2. Confirmar o portal no seletor superior.
3. Clicar em `Detalhes demograficos: Cidade`.
4. Capturar o `r=` real da URL.
5. Aplicar o periodo correto na URL ou no seletor de datas.
6. Confirmar na tela:
   - portal correto;
   - `Detalhes demograficos: Cidade`;
   - periodo correto;
   - dimensao `Cidade`;
   - metrica `Usuarios ativos`.
7. Antes de exportar, garantir que o relatorio esta no topo.
8. Clicar em `Compartilhar este relatorio`.
9. Clicar em `Baixar o arquivo`.
10. Clicar em `Baixar o PDF`.
11. Mover para a pasta final com o nome padrao.
12. Validar com `pdftotext` e com o organizador do projeto.

## Regra critica sobre `r=`

Nao assumir que o `r=` e igual para todos os portais.

Se abrir direto e cair na home, nao insistir.

Fluxo correto:

```text
home da propriedade -> clicar Cidade -> capturar r= -> aplicar data -> exportar
```

## Validacao obrigatoria

Rodar:

```bash
cd /Users/leandrobosaipo/Projetos/Codex/ga4-relatorios-portais

python scripts/organize_ga4_ui_exports.py \
  --start-date 2026-05-01 \
  --end-date 2026-05-31 \
  --source-dir ~/Downloads \
  --output-dir ~/Downloads/GA4-Analytics-Maio-26-Google-Analytics-UI-PDFs
```

Esperado:

```text
PASS: 6/6 PDFs validados
```

Se der `FAIL`, nao enviar.

## Stop rules

Parar e corrigir se ocorrer qualquer item:

- arquivo saiu com nome `Detalhes_demograficos_Cidade*.pdf` na entrega final;
- pasta final contem `AMOSTRA`;
- periodo nao mostra `1 de mai. – 31 de mai. de 2026`;
- titulo nao contem `Detalhes demograficos: Cidade`;
- PDF nao contem `Cidade`;
- PDF nao contem `Usuarios ativos`;
- validador nao retornou `PASS: 6/6`.

## Resultado da simulacao em 2026-05-29

Pasta corrigida:

```text
/Users/leandrobosaipo/Downloads/GA4-Analytics-Maio-26-Google-Analytics-UI-PDFs/
```

Problema encontrado no teste:

```text
5 PDFs passaram em portal/data/tabela, mas falharam no validador estrito porque nao trouxeram o bloco de grafico "Usuarios ativos por Cidade ao longo do tempo".
```

Consequencia:

```text
Para segunda-feira, o criterio final continua sendo PASS 6/6 no organizador.
Se algum PDF sair sem grafico, reexportar antes de considerar pronto.
```

## Checklist curto para segunda

```text
[ ] abrir Chrome autenticado
[ ] usar somente UI do GA4
[ ] gerar 6 PDFs de Cidade
[ ] usar periodo 2026-05-01 a 2026-05-31
[ ] salvar em GA4-Analytics-Maio-26-Google-Analytics-UI-PDFs
[ ] nomes no padrao "<Portal> Cidade Maio 26 - Analytics.pdf"
[ ] rodar organizador
[ ] exigir PASS 6/6
[ ] so depois avisar como pronto
```
