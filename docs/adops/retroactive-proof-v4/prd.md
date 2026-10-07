# PRD — Reconstrução retroativa v4

## Problema e decisão

O usuário confirmou em 06/10/2026 que os dois relógios visíveis de uma nova reconstrução devem representar a data e hora contratadas. O PNG não deve ter carimbo, faixa ou rodapé de reconstrução. A origem reconstruída e o instante real de criação continuam acessíveis nos dados e no relatório; não há declaração de que uma reconstrução prove veiculação passada.

A v3 legada mostra a referência histórica na página e o instante real na moldura. A v4 introduz o novo comportamento sem reinterpretar arquivos v2/v3, capturas agendadas ou retries do próprio dia. Outra falha confirmada ocorre quando a fonte mensal usa metadata preliminar mesmo após auditoria final aprovada do mesmo artefato, como em #3047 em 01/10/2026.

## Resultados e critérios de aceite

- Nova reconstrução: ambos os relógios representam requestedCaptureAt em America/Cuiaba; capturedAt e reconstruction.reconstructedAt representam o instante real e correlacionam com o job.
- Nenhum carimbo adicional no PNG. Origem reconstruída e data real ficam no relatório e na API.
- Auditoria, corte editorial, criativo esperado, checklist, hashes e aprovação persistida permanecem obrigatórios.
- Página interna AFL mantém URL, título da aba, headline, imagem e corpo da mesma matéria. Um post histórico diferente não pode substituir parcialmente a matéria aberta; identidade ausente ou títulos incompatíveis bloqueiam a reconstrução.
- Nos perfis PERR9/pop-up inferior e PPMT1/topo desktop, slot ausente exige candidato histórico v4, período expirado e original correlacionado com provas válidas de mídia, posição, pixels e conteúdo. Aceitar original aprovado ou exclusivamente rejeitado pelo relógio antigo não transforma o original rejeitado em aprovado.
- ROO/home/grupo1: original legado totalmente aprovado, com prova editorial ausente e empty_samples/zero amostras, comprova somente posição e criativo. O candidato novo exige três posts esperados, três amostras e três matches válidos, zero conteúdo futuro, hash editorial de 64 hexadecimais e prova editorial aprovada antes do upload. Não atribuir conteúdo comprovado ao original nem ampliar os perfis PERR/PPMT. Âncora sem elementos pode conservar espaços e um único comentário literal conhecido do AdRotate.
- Mensal e status utilizam a mesma evidência final correlacionada; uma auditoria preliminar não suplanta a final. Ausência ou identidade divergente continua bloqueada.
- Moldura legível, proporcional e neutra, com URL/título reais e relógio em duas linhas à direita; sem clima, perfil ou abas inventados. Assets têm licença registrada.
- Inventário por API identifica o conjunto retroativo completo, inclusive aprovados, com paginação limitada e sem retornar DOM/base64 ou secrets.
- Correção de arquivos existentes usa candidato, auditoria e promoção persistida, com backup, hash e readback. Evidências antigas não são alteradas apenas pela mudança de política.
- Vídeo v4 mostra uma única barra nativa do player. Auditoria exige timeline nativa visível, desobstruída e preservada nos pixels finais; `controls=true` ou barra artificial não comprovam esse resultado. Revisão visual individual continua obrigatória.
- Main e release publicada correspondem ao SHA validado; relatório canônico mantém contagens, campanhas encerradas, filtros e download.

## Checkpoint

Em 07/10/2026 às 07:54 UTC: **24/263 correções confirmadas; 239 restantes**. Main d1e1974c5583573e5cd38f3e6d9ecc4b4c52dc35 publicada; CI 37582190457 aprovada, dump novo/restauração completa/quatro serviços/fonte/JavaScript público/OpenAPI conferidos (`release-final-roo-afl-maintenance.json` privado). Os três canários d1 falharam e não foram promovidos: AFL #2692/21Aug perdeu ID no fetch; ROO #2641/23Aug encontrou comentário AdRotate na âncora; VIDEO #3064/01Oct recebeu atributo ativo vazio. Correções dessas causas seguem em branch local, com regressões e revisão independente. Não contar testes locais como entrega de evidências.

## Fora do escopo

Não sincronizar planilha, alterar PI/AdRotate, desativar rotação, enviar Telegram ou mudar autenticação. Não instalar bibliotecas nem copiar fontes proprietárias sem licença. O usuário confirmou ícones abertos oficiais, medidas fiéis e Selawik existente; não se afirma que esses assets sejam Windows/Segoe UI originais.
