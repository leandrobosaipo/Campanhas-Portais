# Task 10 report — contratos OpenAPI e gates locais

## Resultado

- O OpenAPI estático e o catálogo FastAPI agora publicam `PublicationHealth`, `EvidenceHealth`, `RetroactiveBackfillItem`, `PrintBackfillRequest` e `PrintBackfillJobAccepted`.
- `POST /api/ops/jobs/print-backfill` documenta os filtros limitadores existentes, replay com `duplicate`, `late_publication_recovery`, tentativa inicial 1 e limite 3; o resultado por item usa os cinco estados canônicos.
- `GET /api/ops/daily-print-alerts/evaluate` acrescenta os IDs em `blocked_upstream` e o claim incorpora a lista ordenada ao fingerprint. O Telegram reutiliza evaluate/claim e mostra `Publicação bloqueada:` apenas quando há IDs.
- Os runbooks registram o fluxo obrigatório: preflight Drive -> publicação AdRotate -> confirmação viva -> print-backfill -> auditoria -> relatório. `#2693` permanece fora de captura; `#2645` exige publicação e confirmação antes do backfill.

## TDD

- RED OpenAPI: `uv run --with-requirements ops/fastapi-docs/requirements.txt python ops/fastapi-docs/test_openapi.py` falhou como esperado porque `PublicationHealth` ainda não existia.
- GREEN OpenAPI: o mesmo comando passou após os schemas e a rota documentada.
- RED alerta: `node --test scripts/src/test-daily-print-recovery-contract.mjs` falhou como esperado sem `publicationBlockedIds` no control plane.
- GREEN alerta: o mesmo comando passou com os quatro asserts do contrato.

## Quality gates

- `node --check scripts/src/capture-insertion-proof.cjs` — PASS.
- `pnpm --dir scripts run audit:capture-rules-integrity` — PASS; 0 erros e 36 warnings preexistentes de regras não publicadas na mesma posição.
- `pnpm --dir scripts run test:runner-async-capture-contract` — PASS.
- `pnpm --dir scripts run test:ops-scheduler` — PASS (33 testes TypeScript e 16 contratos auxiliares).
- `node --test scripts/src/test-publication-reconcile-policy.mjs` — PASS (8 testes).
- `node --test scripts/src/test-cross-portal-retro-reconstruction.mjs` — PASS.
- `node --test scripts/src/test-daily-print-recovery-contract.mjs` — PASS (5 testes).
- `node --test scripts/src/test-monthly-report-incremental-refresh.mjs` — PASS (14 checks).
- `node --test scripts/src/test-retroactive-recovery-contract.mjs scripts/src/test-harness-retroactive-recovery.mjs` — PASS (15 testes).
- `pnpm run typecheck` — PASS.
- `pnpm --filter @workspace/api-server run build` — PASS.
- `pnpm --filter @workspace/adops run build` — PASS; warnings conhecidos de sourcemap e chunk grande, sem falha.
- `uv run --with-requirements ops/fastapi-docs/requirements.txt python ops/fastapi-docs/test_openapi.py` — PASS.
- `git diff --check` — PASS.

## Limites

Não houve deploy, job real, alteração de dependência nem alteração do arquivo alheio `task-7-rereview.md`.
