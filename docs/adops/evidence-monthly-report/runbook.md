# How-to — Relatório mensal de evidências

> Estado: vigente
> Público: equipe operacional e agentes
> Última validação: 2026-08-21
> Release anterior: b00779340442; confirmar a correção mensal pelo readback
> Fonte autoritativa: job `evidence-monthly-report`, fonte mensal agregada e relatório público

## Finalidade

Gerar e publicar o relatório navegável sem substituir a última versão válida quando alguma evidência, ZIP ou validação falhar.

## Fluxo atual

```text
fonte mensal agregada
→ gate de auditoria
→ plano de cache por fingerprint
→ até 3 ZIPs simultâneos
→ HTML/JSON/assets em staging
→ validação
→ troca atômica
→ leitura pública
```

O empacotamento nunca captura, repara ou reaudita. Correções pertencem a `print-single` e `print-backfill`.

## Atualização incremental

Quando uma evidência termina aprovada, o runner registra a competência como “suja”. O Worker aguarda 60 segundos desde a última aprovação próxima e executa uma revisão incremental única por competência. Ela reconsulta a fonte mensal e auditorias, atualiza HTML, `data.json`, miniaturas, contadores e modais, mas não solicita print, JPEG, ZIP nem pacote novo.

Se outra aprovação ocorrer enquanto a página está sendo atualizada, ela fica registrada como uma nova revisão e é publicada depois do job em curso. Falha do relatório não invalida o print aprovado: a revisão permanece pendente para retry e a página continua exibindo o último estado público válido.

O relatório abre visualmente em `Ativas`, mas o artefato mensal sempre contém também `Encerradas`. Antes das 18h de Cuiabá ou durante fila/execução do lote diário, o corte termina no dia anterior. A restauração de encerradas reutiliza evidências existentes e nunca cria captura.

## Execução

Antes de qualquer geração:

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
pnpm --dir scripts run audit:capture-rules-integrity
```

Dry-run local, sem publicar:

```bash
ADOPS_REPORT_SKIP_PUBLISH=1 \
pnpm --filter @workspace/scripts run report:evidences-current-month
```

Execução operacional rastreável: crie o job `evidence-monthly-report` pela API e acompanhe exclusivamente em `/api/ops/jobs/{id}/progress` até o estado terminal.

## Configuração de competência

Use as variáveis já reconhecidas pelo gerador, sem inventar novas:

```bash
ADOPS_REPORT_MONTH=2026-08 \
ADOPS_REPORT_COMPETENCIA='AGOSTO/2026' \
ADOPS_REPORT_SLUG=adops-evidencias-agosto-2026 \
ADOPS_REPORT_SKIP_PUBLISH=1 \
pnpm --filter @workspace/scripts run report:evidences-current-month
```

## Gates de publicação

- somente inserções canônicas da fonte agregada;
- todas as linhas da competência cujo período toca o mês, inclusive campanhas encerradas antes da data-alvo;
- todas as datas obrigatórias presentes na resposta canônica;
- evidências `audited` ou `audited_best_effort`, acessíveis e sem blockers;
- ZIPs completos ou cache hits com fingerprint vigente;
- HTML, JSON, assets e downloads válidos;
- `report.json` com `visibility: "unlisted"`;
- `noindex,nofollow` no HTML;
- zero credencial, token ou header real.

Se qualquer gate falhar, o staging é rejeitado.

## Recursos do relatório

- busca por campanha, PI, portal, campaign ID e insertion ID;
- filtro dedicado de portal combinado com estados;
- calendário das datas contratadas;
- JPEG individual;
- ZIP por PI + portal;
- ZIP completo por campanha;
- entradas e vencimentos em sete dias;
- filtro de publicação “Encerradas”, independente do estado das evidências;
- layout mobile e navegação por teclado.

## Cache e desempenho

O hash ordenado inclui as evidências aprovadas. Hash igual produz cache hit; somente campanhas alteradas geram novo ZIP. Exportações executam com concorrência máxima três, enquanto captura continua com concorrência um.

Na validação de 2026-08-12, o ciclo da release 47e0dab terminou em aproximadamente 3min48s com 163 datas auditadas. Esses números são um retrato datado, não uma garantia permanente.

As durações relevantes são `sourceFetch`, `audit`, `cachePlan`, `exports`, `validation` e `publish`.

## Validação

```bash
curl -fsSI https://sites.codigo5.com.br/reports/adops-evidencias-agosto-2026/
curl -fsSL https://sites.codigo5.com.br/reports/adops-evidencias-agosto-2026/report.json
```

Além do HTTP 200, valide busca, filtros, três JPEGs, um ZIP completo, checksums e amostra visual em desktop e celular.

## Rollback

A publicação cria backup e realiza troca atômica. Em falha:

1. não mova o staging para o destino;
2. preserve o relatório público atual;
3. identifique o último backup válido;
4. restaure o diretório versionado pelo mesmo mecanismo do publicador;
5. confirme HTML, JSON, downloads e consumidor real.

Não copie um `index.html` isolado sobre dados de outra versão.

## Regras aprendidas

- Recalcular status por centenas de chamadas aumentava tempo e tokens; a fonte agregada é canônica.
- Recuperar o job completo em todo polling é desperdício; `/progress` é a visão padrão.
- O deadlock entre relatório e exportação desapareceu ao separar o runner mensal do claim dedicado.
- Falha de staging nunca pode apagar a última entrega válida.
- `campaign-operations/active` é uma visão diária e exclui corretamente períodos encerrados. O relatório mensal deve usar exclusivamente `campaign-operations/evidence-monthly-source`.
- `competencia` e `date` precisam pertencer ao mesmo mês; divergência é erro de contrato, não fallback silencioso.
- Uma falha de rebuild do PERRENGUE bloqueia apenas a inserção afetada. Não marque o banner como publicado nem gere evidência até haver confirmação do AdRotate, do rebuild e do HTML público.
