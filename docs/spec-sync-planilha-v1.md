# SPEC - Sincronizacao Planilha v1

## Objetivo

Padronizar a sincronizacao entre a planilha operacional e o AdOps sem duplicar insercoes, campanhas, agencias ou clientes.

## Fontes de verdade

- Prioridade 1: PDF/e-mail da PI.
- Prioridade 2: planilha operacional.
- Prioridade 3: texto recebido por WhatsApp.

Quando houver divergencia, o registro deve ficar marcado para revisao e nao deve sobrescrever dado confiavel da PI.

## Chaves de deduplicacao

- Campanha: `piCodigo + cliente + agencia + campanhaNome + mesReferencia`.
- Insercao: `campanhaId + siteSigla + groupId + localFormato + inicio + fim`.
- Cliente: CNPJ quando disponivel; caso contrario nome normalizado com revisao manual.
- Agencia: CNPJ quando disponivel; caso contrario nome normalizado com revisao manual.

## Regras operacionais

- A rotina deve ser idempotente.
- Nenhum registro ativo pode ser duplicado para a mesma posicao, site e periodo.
- Atualizacao de cliente/agencia deve preservar historico e observacao de origem.
- Falta de CNPJ nao bloqueia cadastro, mas gera alerta de revisao.
- A rotina deve registrar contadores de criados, atualizados, ignorados e divergentes.

## Performance

- Nao fazer query por linha quando for possivel carregar indices em lote.
- Buscar campanhas, clientes, agencias e insercoes por periodo em uma janela unica.
- Evitar `SELECT *` em rotas novas.

## Seguranca

- Nao expor tokens ou URLs privadas em logs.
- Sanitizar nomes vindos de planilha/PI.
- Toda mutacao deve identificar origem e operador.

