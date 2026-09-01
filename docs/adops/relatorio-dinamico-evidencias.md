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

## Leitura e auditoria

- Relações de campanha, portal, cliente e agência são carregadas em lote.
- Evidências da página são carregadas em uma consulta por conjunto de inserções.
- A listagem não faz `HEAD` no storage para cada evidência.
- A validação rigorosa continua na captura, auditoria explícita e exportação final.
- Inserções arquivadas ou substituídas não entram no relatório.

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
