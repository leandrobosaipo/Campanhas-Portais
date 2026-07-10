# Relatório de testes do Pages + VPS (2026-04-14)

- Base pública: https://adops-campanhas-portais.pages.dev
- API pública: https://adops-api-public.leandro471.workers.dev
- Total: 18
- Aprovados: 6
- Falhos: 12

## Resultados

- ✅ **Health da API pública**: cloudflare-public-live-proxy
- ❌ **Dashboard carrega métricas**: locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByText('Resumo operacional') to be visible[22m

- ❌ **Dashboard mostra token de operador**: locator.waitFor: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for getByPlaceholder('Cole o token de operador') to be visible[22m

- ❌ **Campanhas carrega listagem**: locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByText('DENGUE') to be visible[22m

- ❌ **Filtro de campanhas funciona**: DENGUE não ficou visível após filtro
- ❌ **Detalhe da campanha 840 carrega**: locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByText('Campanha #840') to be visible[22m

- ✅ **Inserções carrega listagem**: inserções ok
- ✅ **Filtro de inserções funciona**: filtro ok
- ✅ **Detalhe da inserção 857 carrega**: inserção 857 ok
- ✅ **Sincronização carrega jobs operacionais**: sync center ok
- ✅ **Fila de falhas carrega**: auditoria acessível
- ❌ **Configurações carrega**: locator.waitFor: Error: strict mode violation: getByText('Configurações') resolved to 2 elements:
    1) <a href="/configuracoes" class="flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors bg-sidebar-primary text-sidebar-primary-foreground font-semibold">…</a> aka getByRole('link', { name: 'Configurações' })
    2) <h1 class="text-lg font-bold text-foreground tracking-tight">Configurações</h1> aka getByRole('heading', { name: 'Configurações' })

Call log:
[2m  - waiting for getByText('Configurações') to be visible[22m

- ❌ **Nova campanha carrega**: locator.waitFor: Error: strict mode violation: getByText('Nova campanha') resolved to 2 elements:
    1) <a href="/campanhas/nova" class="flex items-center gap-2 px-2.5 py-2 text-sm text-primary hover:bg-sidebar-accent rounded transition-colors font-medium">…</a> aka getByRole('link', { name: 'Nova Campanha' })
    2) <h1 class="text-lg font-bold text-foreground tracking-tight">Nova Campanha</h1> aka getByRole('heading', { name: 'Nova Campanha' })

Call log:
[2m  - waiting for getByText('Nova campanha') to be visible[22m

- ❌ **Dashboard > Prints do dia chama endpoint protegido**: page.waitForTimeout: Target page, context or browser has been closed
- ❌ **Dashboard > Retroativos vencidos chama endpoint protegido**: page.goto: Target page, context or browser has been closed
- ❌ **Sincronização > Aplicar sync chama endpoint protegido**: page.goto: Target page, context or browser has been closed
- ❌ **Inserção > Retroativos vencidos chama preview e job**: page.goto: Target page, context or browser has been closed
- ❌ **Inserção > ZIP acessível pela API pública**: apiRequestContext.get: Target page, context or browser has been closed