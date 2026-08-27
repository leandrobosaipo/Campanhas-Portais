# Harness - Relatorio mensal de evidencias AdOps

## Comandos

Validacao sintatica:

```bash
node --check scripts/src/build-current-month-evidence-report.mjs
```

Contratos do modal e dos downloads:

```bash
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-mobile-ui.mjs
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
- O modal deve abrir com “Detalhes da campanha e evidência” visível.
- “Baixar ZIP da campanha — todos os portais” deve usar `campaign-evidence-exports` e reunir a PI completa.
- “Baixar ZIP da campanha — somente este portal” deve usar `pi-site-exports` e reunir somente a PI no portal do card.
- O HTML público nunca pode conter hostname interno, como `adops-api:4011`; os downloads devem usar `ADOPS_DELIVERY_API_BASE_URL`.
- Se `ADOPS_REPORT_SKIP_PUBLISH=1`, nenhum container auxiliar deve ser criado.
- Em `ADOPS_REPORT_REFRESH_MODE=incremental`, `ADOPS_REPORT_SKIP_EXPORTS=1` é obrigatório: o ciclo só reusa evidências existentes e não pode disparar captura, JPEG, ZIP ou exportação.
- Duas aprovações próximas devem resultar em uma revisão com debounce de 60 segundos; uma aprovação durante a execução deve resultar em uma única revisão seguinte, sem jobs mensais concorrentes.
- Em grupo rotativo, `relation.rotation.mode=rotating` não bloqueia por si só; `canonicalSelection.decision=confirmed`, mídia esperada observada e checklist aprovado são obrigatórios.
- Um retry parcial deve conter somente datas sem aprovação e manter os JPEGs já auditados sem substituição.
- Para incidentes de proveniência, o harness público deve conferir a lista exata de inserções e datas pela auditoria canônica; arquivo existente ou HTTP 200 isolado não basta.
- A página não pode reclassificar evidência. O estado de cada dia deve ser igual ao retornado pela API.
- Antes da publicação, comparar o `data.json` público anterior com o novo por `insertionId + date`. Qualquer transição de `audited`/`audited_best_effort` para outro estado bloqueia a troca atômica.
- Uma correção exclusiva do relatório deve partir do SHA ativo em produção. Não publicar uma `main` adiantada sem revisar todo o intervalo `release_ativo..candidato`.
- Após publicar, comparar `summary.auditedDays`, `summary.invalidDates` e a lista exata de dias. Queda de auditadas ou aumento de inválidas exige rollback imediato.
- Antes de qualquer execução retroativa, seguir: preflight Drive -> publicação AdRotate -> confirmação viva -> `print-backfill` -> auditoria -> relatório.
- O harness deve acompanhar o mesmo `jobId` de `print-backfill` até `completed` ou `failed`; `duplicate=true` não autoriza criar outro job.
- Para cada item, aceitar apenas `audited`, `failed`, `skipped_existing`, `blocked_reconstruction` ou `blocked_upstream`; bloqueios não recebem retry cego.
- `#2693` não deve disparar captura; `#2645` só pode seguir para backfill após publicação e confirmação viva.

Aceite focal de 21/08:

```bash
ADOPS_EVIDENCE_TARGET_DATE=2026-08-21 \
ADOPS_EVIDENCE_TARGET_IDS=2692,2693,2712,2713 \
pnpm --dir scripts run test:monthly-report-target-evidences
```

## Verificacao publica

```bash
curl -I --max-time 20 https://sites.codigo5.com.br/reports/adops-evidencias-maio-2026/
```

Esperado:

- HTTP 200.
- HTML contem `Evidências AdOps`.
- HTML contem a competencia alvo.
- Abrir um print exibe os dados da campanha sem clique adicional.
- JPEG e os dois escopos de ZIP disponíveis respondem pela origem pública; ZIP responde como `application/zip`.

## Incidente de 27/08/2026

- Causa: o release `0887bfc` levou junto regras posteriores ao release ativo `c9b497`; elas foram reaplicadas a provas históricas já auditadas.
- Efeito: 94 dias auditados apareceram como inválidos, principalmente por `relative_content_time_audit_missing` e `visible_page_time_missing`.
- Recuperação: restauração atômica do último relatório válido e hotfix isolado a partir de `c9b497`.
- Prevenção: gate automático de regressão histórica antes da publicação e revisão obrigatória do intervalo entre o SHA ativo e o candidato.
