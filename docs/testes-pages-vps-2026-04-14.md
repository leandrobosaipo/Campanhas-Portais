# Relatório de testes do Pages + VPS (2026-04-14)

- Base pública: https://adops-campanhas-portais.pages.dev
- API pública: https://adops-api-public.leandro471.workers.dev
- Total: 22
- Aprovados: 22
- Falhos: 0

## Resultados

- ✅ **Health da API pública**: cloudflare-public-live-proxy
- ✅ **Dashboard carrega estrutura principal**: dashboard ok
- ✅ **API pública entrega resumo do dashboard**: 24 inserções
- ✅ **Dashboard mostra ações principais**: ações visíveis
- ✅ **Campanhas carrega estrutura da listagem**: campanhas ok
- ✅ **Filtro de campanhas recebe entrada**: filtro ok
- ✅ **API pública entrega campanha 840**: HANSENIASE
- ✅ **Detalhe da campanha 840 carrega estrutura**: detalhe ok
- ✅ **Inserções carrega estrutura da fila operacional**: inserções ok
- ✅ **Filtro de inserções recebe entrada**: filtro ok
- ✅ **API pública entrega inserção 857**: DENGUE / OMT
- ✅ **Detalhe da inserção 857 carrega estrutura**: inserção 857 ok
- ✅ **Sincronização carrega jobs operacionais**: sync center ok
- ✅ **Fila de falhas carrega**: auditoria acessível
- ✅ **Configurações carrega**: config ok
- ✅ **Nova campanha carrega**: nova campanha ok
- ✅ **API protegida cria job de sync**: 4678e80a-5a54-4c22-9996-d9fcd8e5cd2f
- ✅ **API protegida cria job de prints do dia**: d4e143b9-8fce-4bd7-b4ce-1cd3760a5f00
- ✅ **API protegida cria retroativo por inserção**: 1776184151552-6vkxmk
- ✅ **API protegida cria job de print individual**: 5701b46e-fbba-470e-aaf2-c32e00807690
- ✅ **API pública responde status da inserção 857**: invalid_audit
- ✅ **API pública exporta ZIP da inserção 857**: application/zip