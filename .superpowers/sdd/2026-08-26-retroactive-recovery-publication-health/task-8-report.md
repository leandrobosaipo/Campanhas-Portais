# Task 8 — bloqueio upstream no relatório mensal

## Resultado

- O relatório preserva `evidenceHealth` e os seis prints auditados quando `publicationHealth.status` é `blocked_upstream`.
- A inserção recebe estado visual e filtro de publicação bloqueada, com motivo e próxima ação.
- `publicationFingerprint` é determinístico (`publication-health:{insertionId}:{reason}:{expectedGroupId}`) e apenas é exposto no dado do relatório; esta renderização não envia alerta.

## RED

`node --test scripts/src/test-monthly-evidence-contract.mjs scripts/src/test-monthly-report-target-evidences.mjs` falhou como esperado: o metadado não incluía `blocked_upstream` e o relatório público ainda não expunha `publicationHealth` para #2693.

## GREEN

- `node --test scripts/src/test-monthly-evidence-contract.mjs` — 33 testes aprovados.
- `node --test scripts/src/test-monthly-report-incremental-refresh.mjs` — aprovado.
- `node --check scripts/src/monthly-evidence-contract.mjs`
- `node --check scripts/src/build-current-month-evidence-report.mjs`
- `git diff --check` — aprovado.

## Pendência externa

O teste de alvo público continuará vermelho até que a integração publique um relatório regenerado: a URL atual ainda não contém `publicationHealth` para #2693. Nenhum deploy, alerta ou job foi acionado nesta Task.

## Apêndice de revisão

- `publicationGuidance` agora recebe o `publicationHealth` já resolvido da inserção e o usa como fallback quando a operação canônica não estiver disponível. Motivo e `requiredAction` específicos permanecem no dado e orientam a ação exibida.
- Foi adicionada uma fixture local #2693 com seis evidências auditadas, zero faltantes e bloqueio `expected_media_not_observed` no grupo 14. Ela prova, sem rede, `evidence=complete` e `publication=blocked_upstream` simultaneamente.
- O teste público foi mantido como validação de runtime e continua pendente de regeneração/publicação do relatório.
