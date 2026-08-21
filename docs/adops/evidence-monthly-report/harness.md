# Harness - Relatorio mensal de evidencias AdOps

## Comandos

Validacao sintatica:

```bash
node --check scripts/src/build-current-month-evidence-report.mjs
```

Auditoria de regras:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Geracao local sem publicar:

```bash
ADOPS_REPORT_SKIP_PUBLISH=1 pnpm --filter @workspace/scripts run report:evidences-current-month
```

Geracao e publicacao:

```bash
pnpm --filter @workspace/scripts run report:evidences-current-month
```

## Gates

- O script deve terminar com JSON `{ "ok": true }`.
- O HTML local deve existir.
- O `data.json` local deve conter `summary.total`, `summary.active`, `summary.scheduled`, `summary.pending`.
- `capture-proof/status` e a fonte da verdade de evidencia diaria.
- `summary.pending` deve contar apenas insercoes publicadas no site.
- `evidenceCutoffDate` deve ser o dia anterior antes das 18h ou enquanto o job diário estiver em fila/execução.
- A fonte deve conter campanhas encerradas; PNMT/DENGUE `#1839` deve manter suas 15 evidências existentes.
- O HTML deve abrir em `publication=active`, permitir `ended` e fazer “Limpar filtros” voltar para `active`.
- A geração/restauração não pode emitir qualquer requisição POST de captura.
- `summary.notPublished` deve contar insercoes sem `bannerPublicadoNoSite=true`.
- A quantidade de `.thumb` deve representar todos os dias auditados, nao apenas uma amostra.
- O modal deve abrir tanto em thumb auditada quanto em celula `missing` ou `invalid`.
- Se `ADOPS_REPORT_SKIP_PUBLISH=1`, nenhum container auxiliar deve ser criado.
- Em `ADOPS_REPORT_REFRESH_MODE=incremental`, `ADOPS_REPORT_SKIP_EXPORTS=1` é obrigatório: o ciclo só reusa evidências existentes e não pode disparar captura, JPEG, ZIP ou exportação.
- Duas aprovações próximas devem resultar em uma revisão com debounce de 60 segundos; uma aprovação durante a execução deve resultar em uma única revisão seguinte, sem jobs mensais concorrentes.

## Verificacao publica

```bash
curl -I --max-time 20 https://sites.codigo5.com.br/reports/adops-evidencias-maio-2026/
```

Esperado:

- HTTP 200.
- HTML contem `Evidências AdOps`.
- HTML contem a competencia alvo.
