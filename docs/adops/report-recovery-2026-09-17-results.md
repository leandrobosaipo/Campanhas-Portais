# Recuperação do relatório mensal — 2026-09-17

## Escopo

- Removido o filtro que excluía inserções sem `mediaUrl`; rascunhos sem mídia permanecem visíveis com a razão operacional existente.
- Deduplicação preservada para equivalentes reais, mas campanhas nomeadas distintas com a mesma PI/portal/formato coexistem (`3022 C DISPLAY` e `3024 PRESTAÇÃO DE CONTAS`, PI 91381).
- Antes das 18h em Cuiabá, ausência de evidência do dia recebe `scheduled` junto de `missing`, renderizada como “Aguardando horário”; não é considerada completa.

## Validação

- `pnpm --dir scripts exec tsx src/test-monthly-report-query.ts` — 15/15 testes passaram.
- `node --check scripts/src/build-dynamic-evidence-report.mjs` — passou.
- `git diff --check` — passou.

## Limites

- Não houve deploy, mutação de dados ou validação no ambiente público neste turno.
- A contagem global/paginação da API permanece dependente do consumidor atual; não foi feito overhaul do relatório.
