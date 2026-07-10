# PRD - Importacao de PI v1

## Problema

PIs chegam por PDF, e-mail, planilha e WhatsApp. Sem um fluxo padronizado, aumenta o risco de cadastro duplicado, agencia/cliente errado, midia sem vinculo e print retroativo inconsistente.

## Objetivo

Permitir cadastrar ou atualizar PI com rastreabilidade, deduplicacao e prioridade clara de fonte.

## Usuarios

- Operador: cadastra PI, sincroniza midia e gera prints.
- Revisor: confere divergencias e aprova correcao.
- Gestor: consulta status por campanha, portal e periodo.

## Jornada principal

1. Receber PI/PDF ou texto.
2. Extrair dados da PI.
3. Comparar com planilha e AdOps.
4. Criar ou atualizar campanha/insercoes.
5. Conferir ou publicar AdRotate.
6. Vincular midia.
7. Gerar prints retroativos.
8. Entregar relatorio com links.

## Criterios de sucesso

- Nenhuma duplicidade no AdOps, planilha ou AdRotate.
- Cliente e agencia atualizados conforme PI.
- Insercoes ativas com midia vinculada.
- Prints auditados com moldura, data e hora corretas.

