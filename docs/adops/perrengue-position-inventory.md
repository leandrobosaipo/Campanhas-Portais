# Inventário canônico de posições - Perrengue

Fonte técnica: `config/adrotate-sites.json`. O AdOps, o runner, as regras de captura, a planilha e o AdRotate devem usar os mesmos `groupId`, nomes e dimensões.

| Grupo | Posição técnica | Dimensão | Página |
| --- | --- | --- | --- |
| G01 | Topo - Header | 825x120 | Home |
| G02 | Home 01 | 728x90 | Home |
| G03 | Home 02 | 728x90 | Home |
| G04 | Home 03 | 728x90 | Home |
| G05 | Home 04 | 728x90 | Home |
| G06 | Lateral 01 - Sidebar posição 1 | 300x250 | Home |
| G07 | Lateral 02 - Sidebar posição 2 | 300x250 | Home |
| G08 | Lateral 03 - Sidebar sticky | 300x250 | Home |
| G09 | Popup | 970x90 | Sitewide |
| G10 | Topo lateral - Header | 380x120 | Home |
| G11 | Interno - Matéria | 728x90 | Artigo |
| G12 | Home 05 | 728x90 | Home |
| G13 | Home 06 | 728x90 | Home |
| G14 | Home 07 | 728x90 | Home |

## Nome comercial x posição técnica

O texto da PI é preservado em `contractedPosition`. A posição técnica fica separada em `canonicalPosition`, `localFormatoNormalizado` e `adrotateGroupId`.

- `PUBLI VÍDEO 60s`, `VÍDEO` -> G06.
- `BANNER LATERAL SEGUNDA DOBRA`, `LATERAL 02`, `SEGUNDA DOBRA SIDEBAR` -> G07.
- `TOPO LATERAL` -> exclusivamente G10.

Nunca usar `TOPO LATERAL` como alias do G07. A palavra `segunda dobra` sem `lateral/sidebar` continua podendo representar uma dobra horizontal da home; o contexto completo da PI é obrigatório.

## Gate de publicação

Antes de publicar uma PI, o preflight precisa mostrar, por inserção:

```text
texto da PI -> posição canônica -> groupId -> dimensão/tipo -> arquivo Drive -> destino -> citação
```

A publicação é bloqueada se a posição não existir, a dimensão divergir, duas mídias empatarem, o mesmo arquivo for escolhido para inserções diferentes ou a contagem contratada não corresponder ao pacote de mídia.

Links descritos como direcionamento de banner só são herdados por imagens. Vídeo exige destino explícito próprio.

## Evidência retroativa

Uma reconstrução retroativa válida deve usar preview assinado, prova editorial da data e status `audited_reconstruction`. Ela nunca deve ser descrita como captura histórica ao vivo.
