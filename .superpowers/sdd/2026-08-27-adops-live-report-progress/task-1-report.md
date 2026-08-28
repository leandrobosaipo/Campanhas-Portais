# Task 1 — Contrato canônico `liveProgress`

## Escopo executado

- `ops/shared/daily-print-status.mjs`: adicionados `normalizeDailyPrintLiveProgress` e `buildDailyPrintLiveProgress`.
- `artifacts/api-server/src/routes/ops.ts`: `GET /ops/jobs/{id}/progress` agora projeta `liveProgress` normalizado.
- `ops/cloudflare-public-api/src/index.ts`: mesma projeção e tipagem pública `JobProgress`.
- `lib/api-spec/openapi.yaml`: `DailyPrintLiveProgress` e referência no endpoint de progresso, preservando `additionalProperties: true`.
- `scripts/src/test-daily-print-live-progress.mjs`: teste de contrato do builder e normalizador.
- `scripts/package.json`: comando `test:daily-print-live-progress`.

## Decisões

- IDs só são aceitos quando inteiros positivos e são deduplicados preservando a primeira ocorrência.
- Estados bloqueado, falho e concluído são mutuamente exclusivos; bloqueado tem precedência sobre falho, e ambos sobre concluído.
- Uma inserção terminal não pode ficar em execução nem pendente.
- A API retorna `liveProgress: null` quando o job ainda não possui o progresso acumulado.

## TDD e validação

1. O teste novo falhou inicialmente como esperado: `buildDailyPrintLiveProgress` não era exportada.
2. `pnpm --dir scripts run test:daily-print-live-progress` — passou: `daily print live progress: passed`.
3. `pnpm --filter @workspace/api-server run build` — passou.
4. `node scripts/src/test-daily-print-status.mjs` — 8 testes passaram.
5. `ruby -e 'require "yaml"; YAML.load_file("lib/api-spec/openapi.yaml")'` — passou.
6. `git diff --check` — sem erros de whitespace.

## Self-review e concerns

- A projeção OpenAPI foi revisada para o endpoint correto (`/ops/jobs/{id}/progress`); nenhum outro path foi alterado.
- Não houve deploy nem validação em runtime: esta task só estabelece o contrato e a projeção; a persistência do progresso é de tarefa posterior.
- Uma tentativa adicional de `pnpm --dir ops/cloudflare-public-api exec tsc --noEmit` falhou por conflitos preexistentes entre `lib.dom.d.ts` e `worker-configuration.d.ts`, além de dois erros já existentes em `src/index.ts`. O novo import inicialmente também não tinha declaração; foi alinhado ao padrão do API server com `@ts-expect-error`. O comando oficial de build do Worker não está definido no `package.json` local.
