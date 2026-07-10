# Análise do Gap: Planilha x Base Local

## Conclusão

O filtro por competência na tela de `Inserções` não estava falhando por bug de interface. O problema principal era que o banco local ainda não continha os dados reais da planilha.

Esse gap foi resolvido no ambiente local com a importação real.

## Evidência validada

### Planilha

Fonte usada:

- [ABRIL_2026.md](/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/abas-markdown/ABRIL_2026.md)

Contagem identificada na aba `ABRIL 2026`:

- `14 inserções`

Distribuição observada na extração:

- `OMT`: 2
- `ROO`: 1
- `PERRENGUE`: 8
- `AFL`: 2
- `PNMT`: 1
- `PPMT`: 0

### Sistema local antes da importação real

Consulta validada:

- `GET /api/insertions?competencia=ABRIL/2026`

Resultado anterior no banco local:

- `5 inserções`

Campanhas presentes na demo:

- `OBRAS - GOV MT`
- `VACINAÇÃO - SAÚDE`

## O que isso significava

O comportamento anterior era esperado para uma base demo:

- a competência filtrava corretamente o que existia no banco
- o banco não refletia o histórico real da planilha
- por isso abril aparecia incompleto na UI

## Situação depois da correção

Após rodar o importador real:

- `GET /api/insertions?competencia=ABRIL/2026` retorna `14`
- campanhas de modelo como `VACINAÇÃO - SAÚDE`, `OBRAS - GOV MT` e `FILA ZERO - Q1 2026` não estão mais na base
- o banco local passou a refletir a planilha histórica extraída

## Impacto no projeto

Sem a importação real:

- dashboard executivo fica parcial
- fila operacional por competência fica incompleta
- gestor pode tomar decisão com base errada
- validação de SLA e pendências perde confiabilidade

Com a importação local concluída:

- já é possível validar dashboard e filtros em cima de dados reais
- o próximo gargalo deixa de ser dado e passa a ser experiência operacional de importação

## Decisão recomendada

Tratar a importação operacional com preview como próximo bloco obrigatório do produto.

Ordem sugerida:

1. transformar o importador técnico em fluxo com preview
2. registrar lotes e auditoria
3. adicionar sincronização de implantação
4. manter o dashboard sempre alinhado com os dados reais
