# SPEC - ROO layout e Drive PI v2

Data: 2026-05-11

## ROO layout

URL base:

```text
https://rondonopolisnoticias.com.br/
```

Estado observado em desktop:

| Slot | Estado | Selector operacional |
|---|---|---|
| ROO:1 | ativo e visivel | `div.hidden.lg\:block .g.g-1` |
| ROO:2 | ativo e visivel | `.g.g-2` |
| ROO:3 | sem node/criativo atual | `.g.g-3` |
| ROO:6 | sem node/criativo atual | `.g.g-6` |
| ROO:8 | sem node/criativo atual | `.g.g-8` |

Motivo da mudanca:

```text
.g.g-1 puro captura primeiro o node mobile/oculto.
O selector precisa ancorar no bloco desktop visivel.
```

## Drive PI

Evento de entrada:

```json
{
  "eventId": "drive:<fileId>:<modifiedTime>",
  "driveFileId": "...",
  "name": "...",
  "mimeType": "...",
  "path": "/Cliente/Campanha/arquivo.pdf",
  "parentFolderId": "...",
  "modifiedTime": "...",
  "webViewLink": "...",
  "eventType": "created|updated|folder_created|folder_updated",
  "parsedPi": {}
}
```

## Parser deterministico

O runner deve tentar primeiro:

1. Metadados enviados pelo monitor.
2. `parsedPi` quando existir.
3. PDF baixado do Drive e convertido por `pdftotext`.
4. Texto com layout quando houver calendario de veiculacao.

Campos obrigatorios para mutacao:

- `piCodigo`
- `campanhaNome`
- `cliente`
- `agencia` quando existir na PI
- `site`
- `periodoInicio`
- `periodoFim`
- ao menos uma insercao com posicao/slot

Campos importantes:

- `valorLiquido`
- `competencia`
- `mediaUrl`
- `clickUrl`
- `periodoOriginal`

## Link de destino

O link de destino pode vir de:

- `parsedPi.clickUrl`
- `parsedPi.urlDestino`
- `parsedPi.linkDestino`
- `parsedPi.destinationUrl`
- URL encontrada no texto do PDF.

Regra:

```text
Se o link existir, salvar em observacoes da insercao e enviar no Telegram.
Se o link for ambiguuo ou ausente, nao inventar.
```

Formato sugerido em `observacoes`:

```text
Link destino: https://...
```

## Idempotencia

Evento:

```text
eventId = drive:<fileId>:<modifiedTime>
```

Documento:

```text
hash do arquivo original
```

Campanha/insercao:

```text
piCodigo + cliente + agencia + campanhaNome + mesReferencia
```

Insercao:

```text
site + posicao + periodoInicio + periodoFim + campanha
```

## Evidencia

Depois de criar ou encontrar insercao duplicada:

1. Buscar insercao atual no AdOps.
2. Conferir cobertura de evidencia ate a data atual.
3. Regenerar datas ausentes, invalidas ou com captura quebrada.
4. Anexar resumo em Telegram.

## Erro real

Notificar Telegram somente quando houver erro acionavel:

- campo obrigatorio ausente;
- PI divergente;
- cliente/agencia/site sem match confiavel;
- falha de download;
- falha de parse;
- falha de API;
- evidencia obrigatoria nao gerada.

Nao notificar como erro:

- pasta sem PI nova;
- slot sem criativo ativo;
- evento duplicado ja processado.

