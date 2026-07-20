# API de Checklist de Auditoria

## Objetivo

Centralizar a decisao de evidencia valida no AdOps.

Nenhum print deve ser considerado `audited` apenas porque a imagem existe ou a URL responde `200`.

O checklist tambem e o gate obrigatorio antes de baixar o `arquivoUrl`, montar a
pasta do cliente ou criar `telegram-send-evidence`. Consulte o fluxo completo em
[`evidence-print-delivery-api.md`](./evidence-print-delivery-api.md).

A validacao oficial agora resolve o contrato por:

```text
insertionId + date -> insercao -> campanha/site/formato -> capture_rules -> metadata -> status final
```

## Endpoints

### Resolver checklist

```http
GET /api/audit-checklists/resolve?insertionId=1663&date=2026-07-01
```

Retorna:

- periodo oficial da insercao;
- midia esperada;
- grupo AdRotate;
- seletor do slot;
- seletor de contexto;
- regra publicada ou fallback JSON;
- gates obrigatorios;
- warnings e bloqueios.

Se a posicao nao puder ser resolvida sem ambiguidade, a resposta vem com `ok=false` e `blockingIssues[]`.

### Validar prova

```http
POST /api/audit-checklists/validate-proof
Content-Type: application/json

{
  "insertionId": 1663,
  "date": "2026-07-01"
}
```

Quando `metadata` nao for enviado, a API busca o metadata salvo da captura mais recente.

Tambem aceita validacao direta:

```json
{
  "insertionId": 1663,
  "date": "2026-07-01",
  "metadata": {
    "slotSelector": ".g.g-2"
  }
}
```

Resposta:

```json
{
  "approved": true,
  "version": "audit-checklist-v1",
  "evidenceStatus": "approved",
  "blockingIssues": [],
  "warnings": []
}
```

## Gates obrigatorios

Cada evidencia final precisa passar pelos gates abaixo quando exigidos pelo contrato:

- `inPeriod`: data dentro de `periodoInicio..periodoFim`;
- `mediaPresent`: insercao com `mediaUrl`;
- `captureTimeWindow`: `captureAt` entre `18:00` e `21:59` em `America/Cuiaba`;
- `slotMatchesResolvedRule`: `slotSelector`, `contextSelector` e grupo batem com a regra;
- `requireSlotVisibleInViewport`: slot majoritariamente visivel;
- `requireStickyHeaderInViewport`: header sticky visivel quando o portal/formato exige;
- `stickyHeaderExpected`: tipo esperado de header, por exemplo `logo_menu_datetime`;
- `requireScrollbar`: barra de rolagem renderizada na moldura quando a pagina excede o viewport;
- `requireFrameV4`: moldura `windows11-chrome-light-similar-v4`, tema claro e assets completos;
- `requireIdentityFrame`: frame do banner com identidade suficiente da campanha;
- `requireFinalPngSlotAudit`: auditoria do PNG final precisa confirmar o criativo no slot;
- `requireNoOverlay`: sem modal, popup, lightbox ou overlay cobrindo a pagina;
- `requireNo404`: sem erro 404, `Not Found` ou pagina quebrada;
- `requireVideoControls`: videos com controles/barra de progresso visiveis e tempo avancado;
- `gifAllowedFrameRanges`: GIF precisa usar frame dentro de faixa aprovada quando configurada.

## Politica de bloqueio

- Data fora do periodo sempre bloqueia.
- Regra de posicao nao resolvida sempre bloqueia.
- Seletor divergente sempre bloqueia.
- `viewport_with_slot_inset` nunca aprova evidencia final de cliente.
- Video sem controles/progresso sempre bloqueia.
- `finalPngSlotAudit` ausente ou falso bloqueia quando o contrato exige.
- `stickyHeaderViewportAudit` ausente ou falso bloqueia quando o contrato exige.
- Ausencia de metadados obrigatorios vira falha.

Na versao inicial, `pageStatus/pageLooks404` e `overlayAudit/overlayDetected` sao validados quando o capturador emitir esses campos. Enquanto nao emitir, a API retorna warning para orientar a evolucao do runner.

## Integracao com status existente

O endpoint abaixo usa `validate-proof` internamente:

```http
GET /api/insertions/1663/capture-proof/status?date=2026-07-01
```

`status=audited` so pode aparecer quando:

- evidencia existe;
- URL da imagem responde;
- `validate-proof.approved=true`.

## Como melhorar regra por site/formato

1. Ajuste a regra publicada em `capture_rules`.
2. Configure `auditConfig` com os gates especificos.
3. Rode validacao de integridade.
4. Gere um canario.
5. Consulte `validate-proof`.
6. So gere lote quando `approved=true`.

Exemplo de `auditConfig`:

```json
{
  "requireSlotVisibleInViewport": true,
  "requireStickyHeaderInViewport": true,
  "stickyHeaderExpected": "logo_menu_datetime",
  "requireScrollbar": true,
  "requireFrameV4": true,
  "requireIdentityFrame": true,
  "requireFinalPngSlotAudit": true,
  "requireNoOverlay": true,
  "requireNo404": true,
  "requireVideoControls": false,
  "gifAllowedFrameRanges": [[12, 48], [72, 110]]
}
```

## Comandos de validacao

```bash
node --check scripts/src/capture-insertion-proof.cjs
ADOPS_PUBLIC_API_BASE_URL=https://adops-api.codigo5.com.br/api node scripts/src/audit-capture-rules-integrity.mjs
node artifacts/api-server/build.mjs
```
