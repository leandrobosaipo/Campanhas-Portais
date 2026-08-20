# PRD - Relatorio mensal de evidencias AdOps

## Objetivo

Entregar um painel HTML mensal, público em `sites.codigo5.com.br`, com todas as inserções canônicas da competência. A visão abre em `Ativas`, mas conserva `Encerradas` para consulta e entrega.

## Usuario

- Operador AdOps que precisa saber se as evidencias estao em dia.
- Gestor comercial que precisa ver volume por portal e campanha.
- Analista que precisa abrir thumbs, conferir detalhes e acessar portal, AdRotate, midia e painel.

## Requisitos

- Agrupar por portal, campanha e insercao.
- Persistir inserções ativas, agendadas e encerradas do mês; excluir apenas canceladas ou excluídas.
- Separar evidencias em dia, pendentes, invalidas, agendadas e sem publicacao.
- Usar thumb de toda evidencia auditada do periodo exigido.
- Exibir dias sem evidencia como celulas de data, para nao parecer que sumiram thumbs.
- Abrir modal com detalhes da insercao, timeline de dias, datas pendentes e datas invalidas.
- Publicar sempre no slug estavel `/reports/adops-evidencias-maio-2026/`.
- Salvar snapshot local datado por execucao.

## Nao objetivos

- Nao gerar evidencia nova.
- Nao alterar campanha, insercao, AdRotate ou planilha.
- Nao substituir a auditoria `capture-proof`.
- Nao publicar em Cloudflare Pages ou Worker.

## Criterio de aceite

- URL publica retorna HTTP 200.
- Total de ativas/agendadas bate com a API de insercoes da competencia.
- Agendada futura nao aparece como erro.
- Insercao sem publicacao no site nao aparece como pendencia de evidencia.
- Evidencia aprovada exige `capture-proof/status` com status `audited` e URL.
- Nenhum segredo aparece no HTML, docs ou stdout.
