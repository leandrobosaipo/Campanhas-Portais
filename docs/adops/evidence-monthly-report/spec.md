# Spec - Relatorio mensal de evidencias AdOps

## Entrada

Variaveis opcionais:

- `ADOPS_REPORT_DATE`: data alvo `YYYY-MM-DD`. Padrao: hoje em `America/Cuiaba`.
- `ADOPS_REPORT_MONTH`: mes alvo `YYYY-MM`. Padrao: mes da data alvo.
- `ADOPS_REPORT_COMPETENCIA`: competencia. Padrao calculado, exemplo `MAIO/2026`.
- `ADOPS_REPORT_SLUG`: slug publico. Padrao `adops-evidencias-<mes>-<ano>`.
- `ADOPS_REPORT_SKIP_PUBLISH=1`: gera local sem publicar.
- `OPS_ENV_FILE`: arquivo local com `OPS_API_TOKEN`.
- `PORTAINER_ENV_FILE`: arquivo local com `PORTAINER_URL` e `PORTAINER_API_KEY`.

## Fontes

- `GET /api/campaign-operations/evidence-monthly-source?date=<date>&competencia=<competencia>`: única fonte mensal; inclui ativas, agendadas, concluídas e encerradas que cruzam a competência.
- `GET /api/ops/daily-print-status`: estado real do lote `cloudflare-cron-daily-print`.
- A planilha é consultada somente dentro da API AdOps. O gerador não acessa planilha ou Drive diretamente.
- Falha ou ambiguidade da fonte bloqueia a publicação; não existe fallback para `/campaign-operations/active`.

## Regras de negocio

- Excluir somente `cancelado`, `cancelada`, `excluido` e `excluida`.
- Incluir toda inserção canônica cujo período cruza o mês, inclusive `concluido`, `finalizado` e `finalizada`.
- `reportDate` classifica campanhas; `evidenceCutoffDate` limita os dias já exigíveis.
- Antes das 18h e durante fila/execução, o dia corrente não entra no corte. Após conclusão canônica ou fechamento da janela, passa a ser exigível.
- Insercao futura (`periodoInicio > data alvo`) fica `agendada`.
- Insercao ainda sem `bannerPublicadoNoSite=true` fica `sem publicação`, nao `pendente`.
- Insercao iniciada usa os dias entre inicio, mes e data alvo.
- `em dia`: todos os dias exigidos estao `audited` com URL.
- `pendente`: banner publicado com pelo menos um dia exigido `missing`.
- `erro`: banner publicado com status diferente de `audited` ou `missing`.
- Cada insercao mostra todos os dias exigidos, nao apenas as ultimas thumbs.
- Dias com imagem auditada aparecem como thumb.
- Dias sem evidencia aparecem como celula de data com tooltip e detalhe no modal.
- Dias invalidos aparecem como celula de erro com tooltip e detalhe no modal.

## Saida

- `docs/reports/<slug>/index.html`
- `docs/reports/<slug>/data.json`
- `docs/reports/<slug>/<timestamp>/index.html`
- `docs/reports/<slug>/<timestamp>/data.json`
- Publicacao: `https://sites.codigo5.com.br/reports/<slug>/`

## UX de diagnostico

- O badge `pendente` significa evidência exigível e ainda não gerada/aprovada; o dia corrente antes da janela nunca recebe esse badge.
- O badge `erro` significa evidencia existente, mas reprovada pela auditoria.
- O badge `sem publicação` significa que a insercao ainda nao deve ser cobrada por evidencia.
- O modal exibe datas pendentes e invalidas para deixar claro o que deve ser corrigido.

## Publicacao

O script usa Portainer API para localizar o container `sites-index`, confirmar o bind mount `/app` e copiar um tar para `/app/reports`.

Nao usa SSH, SCP, Cloudflare Pages ou Worker.
