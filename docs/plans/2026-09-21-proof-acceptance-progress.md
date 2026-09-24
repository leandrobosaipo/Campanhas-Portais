# Recuperação e aceite das evidências

Escopo: preservar originais e anúncios; não transformar reconstrução em original.

1. [x] Inventariar pela API as 44 datas com relógios divergentes: nenhum original comprovado encontrado.
2. [x] Corrigir a regra compartilhada do cabeçalho Perrengue (grupos 1 e 10), mantendo bloqueios de duplicidade, popup e sobreposição.
   - Baseline PNG passou com Python empacotado; teste DOM novo falhou antes do ajuste e passou depois.
3. [x] Implementar proveniência e pendência documental no relatório, sem confundir auditoria técnica com aceite comercial. Publicação depende do deploy da API.
4. [ ] Testes, revisão independente, integração na main e deploy existente com backup/restauração verificados.
5. [ ] Capturas reais pela API, conferência visual e relatório público. Não regenerar as 44 reconstruções sem causa corrigível: nova captura não cria original histórico.
6. [ ] Mensagem simples à Mariana com pronto, pendente e responsável.

Bloqueios conhecidos: Águas Cuiabá sem confirmação atual do portal/posição/período e pasta acessível; planilha da 3217 ainda usa nome antigo do espaço.

## Verificação e impedimento de produção

- 75 testes de contratos/relatório passaram; teste DOM novo RED antes do ajuste e GREEN depois; teste PNG mantém rejeição de banners empilhados.
- Typecheck da API e builds de API/painel passaram. Revisão independente sem bloqueadores restantes após ajustes.
- 41 regras publicadas conferidas, zero erros; uma advertência preexistente sobre regras inativas.
- Preflight em 22/09/2026 00:55 UTC: API/painel ainda na versão `977f5e9be69d5c5c48425eef71f34a7388a3c531`, serviços saudáveis.
- Disco: 479596200 KiB totais, 63182108 KiB disponíveis, 86% ocupado. Pressão de I/O full avg60=14.55, some avg60=21.08.
- A consulta somente leitura do tamanho do banco excedeu 90 segundos; não foi possível dimensionar com segurança o pico do dump + restauração + upload.
- Nenhum backup, restauração, deploy ou novo job de captura iniciado nesta etapa. Não usar um backup antigo como substituto do gate exigido.
- Retomar após capacidade/I/O verificadas: backup e restauração de teste, deploy do commit aprovado, captura real da 3021, retroativos ausentes identificados e validação visual. Não recriar as 44 imagens para disfarçar ausência de originais.

## Resumo para a operação

A 3217/Perrengue está publicada no topo lateral (17–22/09), mas a correção que libera sua captura ainda não está em produção. O vídeo lateral é outra inserção e não foi alterado.

As 44 datas questionadas não têm original comprovado nos logs consultados. As imagens são reconstruções e dependem de aceite do destinatário; não estão liberadas automaticamente para o processo.

Mensagem sugerida, ainda sem envio:

> Mariana, o banner da Sanear, PI 3217, já está no Perrengue, no topo lateral, de 17 a 22/09. Os prints ainda estão pendentes. O print da PI 41969, ROO Notícias, do dia 18/09, foi reconstruído depois; não encontrei o original daquele dia. Não vou te passar essa imagem como comprovante original. Águas Cuiabá também continua pendente: preciso confirmar o portal, a posição e a data de início. Ainda não está tudo resolvido.
