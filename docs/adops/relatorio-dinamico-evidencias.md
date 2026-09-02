# Relatório dinâmico de evidências

URL pública única: `https://sites.codigo5.com.br/reports/adops-evidencias/`.

## Funcionamento

- O HTML é uma casca pequena; campanhas e evidências vêm da API AdOps.
- O mês corrente de `America/Cuiaba` abre automaticamente.
- Meses antigos usam a mesma página pelo seletor ou por `?mes=AAAA-MM`.
- Busca e filtros consultam `GET /api/reports/evidences/monthly`.
- A paginação é por campanha; uma campanha não pode ser dividida entre páginas.
- Miniaturas usam o endpoint de evidência com `preview=1`, disposição inline, ETag e cache público.
- O download explícito de JPEG continua como anexo.
- O ZIP da campanha continua no fluxo assíncrono `/api/pi-site-exports/jobs`.
- O conteúdo mensal exige login Google OAuth pela API AdOps.
- Usuários permitidos: `leandro@codigo5.com.br` e `marianacardozof@gmail.com`.
- A sessão é um cookie HTTP-only assinado; nenhum token operacional fica no HTML ou no navegador.

## Leitura e auditoria

- Relações de campanha, portal, cliente e agência são carregadas em lote.
- Evidências da página são carregadas em uma consulta por conjunto de inserções.
- A listagem não faz `HEAD` no storage para cada evidência.
- A validação rigorosa continua na captura, auditoria explícita e exportação final.
- Inserções arquivadas ou substituídas não entram no relatório.
- Inserções lógicas equivalentes são consolidadas por PI, portal, posição e sobreposição do período; vence a publicada com mídia.
- O modal permite enfileirar uma captura por data e acompanha o mesmo job pelo endpoint da inserção (`GET /api/insertions/:id/capture-proof/jobs/:jobId`). Jobs de captura não devem ser consultados em `/api/ops/jobs/:jobId/progress`, que pertence à fila operacional separada.
- A exclusão de evidência remove o registro ativo; a data volta a aparecer como pendente para o backfill noturno.
- Às 23h, depois do lote diário e do relatório das 22h15, o scheduler procura retroativos faltantes da competência sem competir com a rotina das 18h.

## Interface preservada

- Cabeçalho com período, atualização, inserções, ativas, atenção, prints e números adicionais.
- Modais de Rotina, Fontes e Agenda.
- Logo e indicadores completos por portal.
- Resumo, ZIP e inserções por campanha.
- Mídia, estados, progresso, ações e trilha de evidências por inserção.
- Modal de evidência com navegação por data, detalhes e ações.
- Filtro móvel e controles com altura mínima de 44 px.

## Publicação

```bash
pnpm --dir scripts run report:evidences-dynamic
mkdir -p relatorios/adops-evidencias
cp docs/reports/adops-evidencias/index.html relatorios/adops-evidencias/index.html
node scripts/src/publish-report-to-sites.mjs relatorios/adops-evidencias
```

Testar a URL pública no mês corrente e em agosto de 2026, no desktop e em 390 px.

## Checkout protegido

Worktree: `/Users/leandrobosaipo/Projetos/AdOps-worktrees/codex-dynamic-report-production`.

Branch: `codex/adops-dynamic-report-production-20260901`.

Não copiar o checkout principal sobre este diretório nem executar limpeza destrutiva nele. Integrar por commit/merge depois da validação, preservando as alterações existentes no checkout principal.
