# PRD - ROO layout e Drive PI v2

Data: 2026-05-11

## Problema

O layout do portal ROO mudou e passou a ter mais de um node `.g.g-1`.
O primeiro node e mobile/oculto em desktop; o segundo e o banner desktop real.

Ao mesmo tempo, a entrada automatizada de PI pelo Google Drive precisa fechar o ciclo:

```text
PI nova -> AdOps -> AdRotate -> planilha -> evidencia -> Telegram
```

Sem duplicar campanha, insercao, anuncio ou evidencia.

## Objetivos

- Atualizar regras de captura do ROO para selecionar o banner visivel correto.
- Criar harness que falhe quando houver criativo ativo sem slot visivel.
- Processar PI do Drive de forma idempotente.
- Cadastrar campanha/insercao apenas quando os dados obrigatorios estiverem confiaveis.
- Quando a PI ja existir, conferir se ha evidencia valida e em dia.
- Gerar ou corrigir evidencia quando faltar.
- Notificar Telegram quando houver novidade real.
- Notificar Telegram quando houver erro real, com dados suficientes para correcao.
- Preservar link de destino do banner quando a PI ou observacao do arquivo informar.

## Fora de escopo

- Nao criar outro backend paralelo.
- Nao substituir AdRotate.
- Nao mover arquivos no Drive.
- Nao publicar em portal se houver divergencia critica.
- Nao usar IA no caminho normal da PI.

## Usuarios

- Operador AdOps.
- Analista que confere campanha, insercao e evidencia.
- Suporte tecnico que corrige erro de PI, midia ou portal.

## Criterios de aceite

- ROO grupo 1 usa o selector desktop visivel.
- Harness do ROO passa com zero erro.
- Slots sem criativo ativo geram warning, nao falso erro.
- PI nova cria ou atualiza campanha/insercoes sem duplicidade.
- PI duplicada nao duplica; apenas confere dados e evidencia.
- Insercao existente sem evidencia valida gera captura.
- Telegram informa:
  - PI recebida;
  - campanha/insercoes afetadas;
  - duplicidade evitada;
  - evidencias conferidas/regeneradas;
  - link de destino quando existir;
  - erro real com arquivo, PI e campos faltantes.

## Fontes de verdade

1. PDF/email da PI.
2. Observacoes do arquivo/pasta no Drive.
3. Planilha operacional.
4. AdOps.
5. AdRotate/portal.

Em divergencia critica, o status correto e `needs_review` ou `failed`, nunca publicacao silenciosa.

