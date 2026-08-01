# Resolução de posições da planilha e materiais do Drive

Este documento define como agentes, API e rotinas de sincronização devem interpretar entradas comerciais sem transformar variações de texto em alterações inseguras de produção.

## Explicação: fontes diferentes respondem perguntas diferentes

- A planilha informa portal, posição comercial e período.
- A PI/PDF confirma a identidade e as instruções comerciais.
- O Drive fornece arquivos e pode conter nomes incompletos ou antigos.
- O AdOps registra campanha e inserção.
- O AdRotate define grupo, agenda e anúncio do portal.
- O HTML público comprova o que realmente foi publicado.

Encontrar uma campanha em uma dessas fontes não comprova as demais etapas. A API separa presença no AdOps, publicação no AdRotate e evidência pública.

## Referência: resolução de posição

O resolvedor usa `siteSigla + texto da posição + contexto opcional`.

Ordem de resolução:

1. alias exato do portal;
2. alias normalizado por caixa, acento, pontuação e espaços;
3. seletor, página ou tipo de mídia informado como contexto;
4. dimensão encontrada no texto;
5. `ambiguous` ou `unresolved` quando não existe decisão única.

O primeiro item de `aliases` continua sendo o nome canônico da regra publicada. Variações exclusivas de entrada ficam em `inputAliases`. Adicionar um `inputAlias` não altera `groupId`, página, seletor, `proofStyle` ou auditoria.

Campos retornados por `format.resolution`:

| Campo | Significado |
| --- | --- |
| `status` | `resolved`, `ambiguous` ou `unresolved` |
| `method` | `exact_alias`, `normalized_alias`, `context`, `dimension` ou `none` |
| `rawFormat` | valor original da planilha |
| `lexicalKey` | texto limpo sem decisão semântica |
| `canonicalFormat` | primeiro alias da regra resolvida |
| `groupId` | grupo AdRotate somente quando a resolução é única |
| `candidates` | regras consideradas pelo resolvedor |
| `safeToApply` | `true` somente quando existe uma regra única |

## Referência: estruturas aceitas no Drive

Os aliases das pastas dos portais ficam em `drivePathAliases` dentro de `config/adrotate-sites.json`.

Estruturas reconhecidas incluem:

```text
/PERRENGUE/AGOSTO/PI 17046 CLIENTE/banner.gif
/PERRENGUE/AGOSTO/PI-17046/arte.png
/PERRENGUE/AGOSTO/17046/video.mp4
/PERRENGUE/AGOSTO/CLIENTE/PI 17046 - mídia.gif
```

Prioridade do match:

1. PI exata em uma pasta;
2. PI exata em PDF ou mídia dentro da pasta;
3. tokens do nome da campanha, apenas como sugestão.

Match somente por nome da campanha nunca libera aplicação. Empate, conflito de PI ou múltiplas pastas mantém `safeToApply=false` e expõe `drive.candidates`.

Uma pasta identificada pela PI é a raiz da campanha. Subpastas como `DESKTOP`, `MOBILE`, `VÍDEO` e `APROVADO` são agrupadas nessa mesma raiz e não podem virar candidatas concorrentes. Um empate só é real quando a mesma PI aparece em duas raízes diferentes dentro do portal.

Espaços extras no início ou no fim dos nomes das pastas são ignorados somente durante a comparação. A API preserva nomes, IDs e links originais; essa normalização evita empates invisíveis sem renomear nada no Drive.

Imagens, vídeos, PDFs, documentos e outros arquivos são listados separadamente. Stories, Reels e peças sociais não substituem automaticamente uma mídia de site.

Em produção, `DRIVE_INTEGRATION_MODE=monitor` faz a API ler o snapshot persistido pelo monitor no banco. O modo `legacy` existe apenas para rollback e tenta usar o índice histórico em arquivo; não deve ser mantido como modo normal quando o monitor e o snapshot estiverem saudáveis.

## Como adicionar uma variação de posição

1. Confirme o portal e o grupo que já funciona no site.
2. Localize a regra existente em `config/adrotate-sites.json`.
3. Se for apenas uma nova grafia de entrada, acrescente em `inputAliases`.
4. Não altere `aliases`, `groupId`, página, seletores ou auditoria junto com essa inclusão.
5. Rode os testes de resolução e a auditoria das regras.
6. Consulte `campaign-operations/active` e confirme `resolution.status=resolved` e o grupo esperado.

Quando a nova posição representa outro slot real, ela exige uma regra nova e validação visual própria. Não deve ser cadastrada como alias de uma posição parecida.

## Como adicionar um novo formato de pasta do Drive

1. Se mudou apenas o nome da pasta do portal, acrescente o caminho em `drivePathAliases`.
2. Preserve os aliases antigos enquanto ainda existirem materiais neles.
3. Teste uma pasta com PI no nome e outra com PI apenas no arquivo.
4. Teste também uma PI com subpastas de variações criativas e confirme uma única raiz candidata.
5. Confirme que raízes realmente empatadas retornam `ambiguous`.
6. Não use fuzzy match de campanha para publicar automaticamente.

## Como tratar bloqueios

- `format.resolution.status=ambiguous`: escolher a regra correta e cadastrar um alias específico.
- `format.resolution.status=unresolved`: confirmar se é nova grafia ou novo slot.
- `drive.status=ambiguous`: revisar `candidates`, PI da pasta, PDF e nomes das mídias.
- `drive.matchMethod=campaign_tokens`: confirmar a PI; não aplicar.
- `sourceIdentity.decision=needs_confirmation`: registrar confirmação humana antes de qualquer mutação.
- `blockingIssues` não vazio: nenhuma ação sugerida deve ser executada automaticamente.

## Compatibilidade e proteção

- As rotas existentes permanecem disponíveis.
- A resposta `campaign-operations-v2` apenas adiciona diagnóstico.
- Regras publicadas continuam protegidas por hash/versão e preview.
- Divergência entre JSON e API publicada é reportada; não é reconciliada por sobrescrita automática.
- Divergências históricas excepcionalmente aceitas ficam em `config/capture-rules-known-drift.json`. A baseline exige correspondência exata; qualquer novo valor volta a bloquear a auditoria.
