# PRD — Reconstrução retroativa v4

## Problema e decisão

O usuário confirmou em 06/10/2026 que os dois relógios visíveis de uma nova reconstrução devem representar a data e hora contratadas. O PNG não deve ter carimbo, faixa ou rodapé de reconstrução. A origem reconstruída e o instante real de criação continuam acessíveis nos dados e no relatório; não há declaração de que uma reconstrução prove veiculação passada.

A v3 atual mostra a referência histórica na página e o instante real na moldura. A v4 introduz o novo comportamento sem reinterpretar arquivos v2/v3, capturas agendadas ou retries do próprio dia. Outra falha confirmada ocorre quando a fonte mensal usa metadata preliminar mesmo após auditoria final aprovada do mesmo artefato, como em #3047 em 01/10/2026.

## Resultados e critérios de aceite

- Nova reconstrução: ambos os relógios representam requestedCaptureAt em America/Cuiaba; capturedAt e reconstruction.reconstructedAt representam o instante real e correlacionam com o job.
- Nenhum carimbo adicional no PNG. Origem reconstruída e data real ficam no relatório e na API.
- Auditoria, corte editorial, criativo esperado, checklist, hashes e aprovação persistida permanecem obrigatórios.
- Mensal e status utilizam a mesma evidência final correlacionada; uma auditoria preliminar não suplanta a final. Ausência ou identidade divergente continua bloqueada.
- Moldura legível, proporcional e neutra, com URL/título reais e relógio em duas linhas à direita; sem clima, perfil ou abas inventados. Assets têm licença registrada.
- Inventário por API identifica o conjunto retroativo completo, inclusive aprovados, com paginação limitada e sem retornar DOM/base64 ou secrets.
- Correção de arquivos existentes usa candidato, auditoria e promoção persistida, com backup, hash e readback. Evidências antigas não são alteradas apenas pela mudança de política.
- Main e release publicada correspondem ao SHA validado; relatório canônico mantém contagens, campanhas encerradas, filtros e download.

## Fora do escopo

Não sincronizar planilha, alterar PI/AdRotate, desativar rotação, enviar Telegram ou mudar autenticação. Não instalar bibliotecas nem copiar fontes proprietárias sem licença. O usuário confirmou ícones abertos oficiais, medidas fiéis e Selawik existente; não se afirma que esses assets sejam Windows/Segoe UI originais.
