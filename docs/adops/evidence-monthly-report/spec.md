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

- `GET /api/insertions?competencia=<competencia>&limit=500`
- `GET /api/campaigns?competencia=<competencia>&limit=500`
- `GET /api/insertions/capture-proof/audit?date=<date>&competencia=<competencia>`
- `GET /api/insertions/:id/capture-proof/status?date=<date>`
- `GET /api/integrations/adrotate/insertions/:id/relation`
- `config/adrotate-sites.json`

## Regras de negocio

- Excluir `cancelado`, `concluido`, `finalizado` e `finalizada`.
- Incluir insercao se cruza o mes e esta ativa, publicada, em veiculacao, print gerado ou futura.
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

- O badge `pendente` significa evidencia retroativa ou do dia ainda nao gerada/aprovada.
- O badge `erro` significa evidencia existente, mas reprovada pela auditoria.
- O badge `sem publicação` significa que a insercao ainda nao deve ser cobrada por evidencia.
- O modal exibe datas pendentes e invalidas para deixar claro o que deve ser corrigido.

## Publicacao

O script usa Portainer API para localizar o container `sites-index`, confirmar o bind mount `/app` e copiar um tar para `/app/reports`.

Nao usa SSH, SCP, Cloudflare Pages ou Worker.
