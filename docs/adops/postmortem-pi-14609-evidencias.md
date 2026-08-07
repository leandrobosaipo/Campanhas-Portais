# Post-mortem — PI 14609 e evidências retroativas

## Resumo

A campanha retornou várias vezes porque cada rodada corrigia uma representação
parcial da data, mas não comprovava o arquivo final visto pela agência. A API
aceitava metadados/DOM corretos enquanto o PNG ainda podia conter texto relativo,
data editorial diferente ou uma composição posterior incorreta.

## O que a auditoria da agência percebeu

- o cartão dizia “há 4 dias” ou “há 5 dias”, embora o print representasse uma data específica;
- a matéria mencionava o próprio dia do print, incompatível com a alegação de publicação anterior;
- a mesma reportagem apareceu com datas de postagem diferentes;
- houve datas truncadas ou malformadas em composições intermediárias;
- posições diferentes foram reunidas em um único pacote, dificultando a conferência por peça.

## Causas técnicas

1. A validação terminava no DOM/metadado e não relia os pixels após a composição.
2. Mutações tardias do portal podiam substituir a data depois da primeira correção.
3. Defaults compartilhados permitiam que uma regra de portal contaminasse outra.
4. Uma inserção duplicada permanecia elegível ao lado da canônica.
5. Mais de uma mídia do Drive podia exigir decisão humana não persistida.
6. O exportador consolidava as posições no mesmo ZIP.
7. O backfill definitivo encontrou outras identidades repetidas no legado; linhas sem PI não recebem chave, e colisões com PI são reconciliadas de forma determinística, arquivadas e vinculadas sem exclusão.

## Controles definitivos

- OCR local do PNG final e quatro códigos de bloqueio `pixel_*`;
- aprovação humana ligada ao SHA-256 exato;
- configuração imutável por portal/posição e testes de isolamento;
- identidade canônica com índice único parcial e vínculo `supersededByInsertionId`;
- seleção de mídia auditada e snapshot histórico do AdRotate;
- um ZIP + um PDF por posição, enviados somente pela API assíncrona;
- deploy do mesmo SHA para API, painel, runners, documentação e conhecimento do agente.

## Critério de encerramento

A PI só está corrigida quando todas as datas canônicas têm
`status=audited`, `pixelDateProof.ok=true`, revisão aprovada para o hash atual,
artefatos separados por posição e recibos únicos do Telegram.
