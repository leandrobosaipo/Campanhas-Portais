# Runbook - Atualizar relatorio mensal de evidencias

## Atualizacao padrao

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
node --check scripts/src/build-current-month-evidence-report.mjs
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/scripts run report:evidences-current-month
curl -I --max-time 20 https://sites.codigo5.com.br/reports/adops-evidencias-maio-2026/
```

## Atualizacao sem publicar

```bash
ADOPS_REPORT_SKIP_PUBLISH=1 pnpm --filter @workspace/scripts run report:evidences-current-month
```

## Mes especifico

```bash
ADOPS_REPORT_MONTH=2026-05 \
ADOPS_REPORT_COMPETENCIA='MAIO/2026' \
ADOPS_REPORT_SLUG=adops-evidencias-maio-2026 \
pnpm --filter @workspace/scripts run report:evidences-current-month
```

## Artefatos

- Latest: `docs/reports/adops-evidencias-maio-2026/index.html`
- Dados latest: `docs/reports/adops-evidencias-maio-2026/data.json`
- Snapshots: `docs/reports/adops-evidencias-maio-2026/<timestamp>/`
- Publico: `https://sites.codigo5.com.br/reports/adops-evidencias-maio-2026/`

## Rollback

1. Escolher snapshot anterior em `docs/reports/adops-evidencias-maio-2026/<timestamp>/`.
2. Copiar o HTML desejado para `docs/reports/adops-evidencias-maio-2026/index.html`.
3. Rodar novamente o publicador com o script normal.

## Falhas comuns

- `OPS_API_TOKEN ausente`: conferir `.env.adops-operator.local` sem imprimir o valor.
- `PORTAINER_API_KEY ausente`: conferir `/Users/leandrobosaipo/Projetos/macmini/.env.portainer`.
- `sites-index nao encontrado`: validar Portainer endpoint `3 local`.
- HTTP publico diferente de 200: verificar container `sites-index` e rota `/reports/<slug>/`.
- Insercao aparece como `sem publicação`, mas o banner esta visivel no portal:
  1. Conferir a home/slot do portal e identificar imagem, link, grupo AdRotate e seletor.
  2. Corrigir no AdOps apenas se houver prova publica: `bannerPublicadoNoSite=true`, `statusNormalizado=em_veiculacao` e `mediaUrl`.
  3. Conferir se o alias da posicao existe em `config/adrotate-sites.json`.
  4. Se a regra publicada de captura divergir do JSON, criar nova draft, validar e publicar a regra.
  5. Rodar `pnpm --dir scripts run audit:capture-rules-integrity`.
  6. Gerar evidencias retroativas das datas exigidas.
  7. Regenerar e publicar o relatorio.

## Interpretacao dos estados

- `em dia`: todos os dias exigidos ate a data alvo tem evidencia `audited` com URL.
- `pendente`: banner publicado no site, mas existe dia exigido sem evidencia auditada.
- `erro`: banner publicado no site, mas existe evidencia reprovada pela auditoria.
- `sem publicação`: a insercao aparece no mes, mas o AdOps ainda nao marca o banner como publicado no site. Nao conta como pendencia ate ser confirmado no portal/AdRotate.
- `agendada`: periodo ainda nao iniciou.

Para corrigir `pendente` ou `erro`, gere print individual das datas listadas no modal ou use o fluxo de retroativo por insercao quando aplicavel.

## Caso auditado - PPMT #1252

Em 2026-05-12, a insercao `#1252` estava aparecendo como `sem publicação`, mas a home do `portalpantanalmt.com` exibia o banner `pi-8227-calcada-viva-825x120-1.gif` no grupo AdRotate `2`.

Correcoes aplicadas:

- AdOps atualizado com `mediaUrl`, `bannerPublicadoNoSite=true` e `statusNormalizado=em_veiculacao`.
- `PPMT:2` passou a aceitar aliases `FULLBANNER` e `FULL BANNER`.
- Regra publicada de captura recriada como `ruleId=41`.
- Evidencias retroativas de `2026-05-01` a `2026-05-12` geradas e auditadas.

Resultado esperado no relatorio: insercao `#1252` como `em dia`, com `12/12` evidencias.
