# Task 5 — prevenção de publicação e captura

## Status

DONE_WITH_CONCERNS

## RED

`node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs` falhou como esperado para a PI 3172: a ação `drive_pi_publish` ainda não era criada.

O cenário de `blocked_upstream` foi tornado efetivo com uma inserção que já passava os gates de mídia e publicação; antes da implementação, ela seria selecionada.

## GREEN

`node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs` — 15 testes aprovados.

`git diff --check` — aprovado.

O comando obrigatório completo foi executado:

`node --test scripts/src/test-publication-reconcile-policy.mjs scripts/src/test-daily-print-status.mjs scripts/src/test-async-daily-print-batch-contract.mjs`

Ele falha apenas no teste de contrato fora desta fatia: `test-async-daily-print-batch-contract.mjs` ainda procura a expressão antiga `item?.adops?.competencia` no `runner.mjs`. O runtime já delega o filtro para `selectDailyPrintCandidates(..., { competencia })`; os testes reais da seleção desta Task passam. A decisão de atualizar esse source-grep fica para integração.

## Mudança

- Mídia disponível no Drive, mas desvinculada antes do período, planeja `drive_pi_publish` com `generateEvidence: false`.
- O scheduler exclui explicitamente `publicationHealth.status === "blocked_upstream"`, mesmo quando mídia e confirmação pública aparentam estar válidas.
- O preflight existente também mantém `generateEvidence: false`; a expectativa anterior conflitava com este contrato e foi corrigida.

## Commit

20bdc9a5a4ceb2baf1369ebe372774c444552e39

## Riscos

- Ação preventiva é produzida pelo reconciliador; execução operacional, deploy e qualquer job real não foram acionados.
- O teste amplo permanece vermelho por um source-grep defasado fora do ownership desta Task.
