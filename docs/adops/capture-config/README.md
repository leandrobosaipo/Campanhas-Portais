# Configuracao de Captura/Auditoria

## Leitura recomendada
- [Manual operacional v1](./manual-operacional-v1.md): passo a passo de uso, pre-checks, publicacao, rollback e performance.
- [Organograma e fluxos v1](./organograma-fluxos-v1.md): organograma do recurso, arvore de decisao e fluxos por situacao.
- [Infografico de opcoes v1](./infografico-opcoes-v1.md): resumo visual das opcoes, campos e decisoes.

## Documentos tecnicos
- [PRD v1](./prd-v1.md)
- [SPEC v1](./spec-v1.md)
- [Security v1](./security-v1.md)
- [Performance v1](./performance-v1.md)
- [Harness v1](./harness-v1.md)
- [Runbook rollout v1](./runbook-rollout-v1.md)
- [Decision log](./decision-log.md)

## Atualizacoes por layout
- [ROO layout e Drive PI v2](../roo-layout-drive-pi-v2/spec.md): selector desktop do ROO, harness dedicado, fluxo Drive PI com evidencia e Telegram.
- [Tailpress layout e evidencias 2026-05-12](../../reports/tailpress-evidencias-2026-05-12/README.md): ROO, PNMT, PPMT e AFL revisados; AFL:1 corrigido; evidencias reenviadas ao Telegram.
- [Nova PI e evidencias](../../runbook-nova-pi-evidencias.md): fluxo curto para cadastrar PI, sincronizar AdOps/AdRotate/planilha, gerar evidencias atuais/retroativas e entregar relatorio.

## Regra operacional
Toda mudanca de captura/auditoria deve seguir:

`draft -> validate -> publish -> capture -> audit -> monitor`

Rollback e fallback JSON existem para contingencia, nao para substituir validacao.

## API de checklist

A fonte operacional para aprovar evidencias e a [API de Checklist de Auditoria](../audit-checklist-api.md).

Fluxo obrigatorio:

```text
capture_rules publicada -> /audit-checklists/resolve -> capturador oficial -> /audit-checklists/validate-proof -> status audited
```

Para adicionar ou melhorar uma regra por site, campanha ou pagina:

1. Resolver a posicao canonica em `capture_rules` por `siteSigla + groupId`.
2. Publicar `slotSelector`, `contextSelector`, `scrollMode`, `proofStyle` e `auditConfig`.
3. Configurar gates explicitos no `auditConfig`, em vez de depender de validacao manual.
4. Gerar um canario antes do lote.
5. Aceitar o lote somente se `validate-proof.approved=true`.

Campos de `auditConfig` usados pelo checklist:

- `requireSlotVisibleInViewport`
- `requireStickyHeaderInViewport`
- `stickyHeaderExpected`
- `requireScrollbar`
- `requireFrameV4`
- `requireIdentityFrame`
- `requireFinalPngSlotAudit`
- `requireNoOverlay`
- `requireNo404`
- `requireVideoControls`
- `gifAllowedFrameRanges`

Regra critica: se o portal tiver mais de um node parecido, o seletor precisa ser especifico. Exemplo: ROO topo deve usar `div.hidden.lg\:block .g.g-1`, nunca `.g.g-1` puro.

## Aprendizado de GIF com muitos frames

Caso de referencia: `PI 490711 / Energisa / PERRENGUE G06`, corrigido em `2026-05-23`.

O `HTTP 200` do print nao prova que a evidencia esta boa. Em GIF animado, revisar se o frame escolhido realmente mostra mensagem legivel da campanha.

Quando houver frames ruins, use `gifAllowedFrameRanges` no `auditOverrides` da posicao em `config/adrotate-sites.json`.

Exemplo:

```json
"gifAllowedFrameRanges": [[99, 195], [206, 285], [318, 389]]
```

A auditoria deve expor `gifChosenFrameAllowed=true`. Se o frame estiver fora da faixa, o status deve falhar com `gif_frame_not_approved`.

## Aprendizado de overlays e contexto lateral

Casos de referencia: `PI 16134 / Obras / PERRENGUE` e `PI 15948 / IPVA 2026 / PERRENGUE`, revisados em `2026-05-26`.

O status tecnico da evidencia (`hasEvidenceForDate`, `hasValidUrl`, `isReachable` e auditoria sem issues) nao substitui a revisao visual quando o pacote sera enviado ao cliente.

Antes de fechar ZIP ou envio:

- abrir pelo menos as evidencias corrigidas/regeradas e validar o PNG final;
- confirmar que nenhum modal, lightbox, popup, dialog, overlay ou backdrop esta cobrindo a pagina;
- em prints de primeira dobra com coluna lateral visivel, conferir se o bloco lateral de publicidade carregou e nao ficou vazio;
- confirmar que a barra de rolagem da moldura continua renderizada quando a pagina tem altura maior que a viewport;
- confirmar que `captureAt` dos retroativos fica em `18:00 <= captureAt < 22:00`, variando por insercao e data;
- para `VIDEO`, confirmar controles aparentes, barra de progresso visivel e pontos diferentes do video ao longo do pacote;
- se a API publica estiver defasada, validar pela API interna viva antes de baixar as imagens.

A rotina `capture-insertion-proof.cjs` deve chamar limpeza de overlays bloqueantes antes da auditoria visual e imediatamente antes do screenshot final.

Se houver `slot_position_mismatch` em GIF mas o criativo estiver legivel e alinhado visualmente, pode ser usado um limiar temporario de similaridade apenas para a captura pontual, registrando que a configuracao foi restaurada em seguida. Nao deixar tolerancia relaxada como default permanente.

## Readiness estrito do frame final

`networkidle` nao comprova que imagens visiveis foram pintadas no PNG. Portais com lazy loading, CDN lenta ou mudanca de layout devem usar:

```json
{
  "readinessMode": "strict-visible",
  "criticalContentSelectors": [
    "[data-cod5-pagespeed-frame=\"home-hero\"] img.wp-post-image"
  ],
  "readinessTimeoutMs": 45000,
  "layoutStableSamples": 3,
  "layoutStableIntervalMs": 350,
  "captureRetryCount": 2,
  "requireCriticalContentPainted": true
}
```

O gate roda depois do scroll definitivo e imediatamente antes do screenshot. Ele aguarda fontes, `img.decode()`, `picture/srcset`, fundos, poster/frame de video, canvas e iframe visiveis; depois valida estabilidade e pixels no PNG candidato e no PNG com moldura.

Recursos fora do viewport, analytics e requisicoes continuas nao bloqueiam. Imagem visivel quebrada, regiao uniforme ou mudanca do viewport bloqueiam a captura antes do upload e da substituicao da evidencia.

Fluxo operacional:

```text
print-single/backfill -> critical_assets -> layout_stability -> visual_preflight
-> capture -> final_png_validation -> validate-proof -> upload -> upsert evidence
```

Consultar o resultado em:

- `GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD`, campo `readinessAudit`;
- `POST /api/audit-checklists/validate-proof`, que exige `readinessAudit.approved=true` para capturas novas em regra estrita;
- `GET /api/ops/jobs/{jobId}/progress`, para o estágio operacional.

Uma evidencia existente so e substituida depois que o candidato local passa no checklist. Falhas de readiness ficam em log diagnostico e preservam o arquivo anterior.
