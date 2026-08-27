# API de Campanhas Ativas

Endpoint read-only `campaign-operations-v2` para cruzar planilha do mês corrente, índice do Google Drive, cadastro AdOps e evidências sem escolher silenciosamente uma posição ou pasta ambígua.

## Endpoint

```bash
GET /api/campaign-operations/active
```

Parâmetros:

- `date=YYYY-MM-DD`: data de referência. Se omitido, usa a data atual em `America/Cuiaba`.
- `siteSigla=PERRENGUE|OMT|ROO|AFL|PNMT|PPMT`: filtro opcional por portal.
  - aliases aceitos pela API: `PMT` e `PMMT` são normalizados para `PPMT`.
  - isso evita falso negativo operacional quando a planilha/equipe chama o portal de
    `PMMT`, mas as regras de captura usam `PPMT`.
- `refreshDrive=true|false`: no modo `monitor`, retorna o snapshot atual e enfileira um refresh idempotente quando solicitado. A API não recebe credenciais do Drive. Padrão: `false`.
- `includeEvidence=true|false`: quando `false`, não valida evidências por data. Padrão: `true`.

A resposta sempre separa:

- `items`: campanhas ativas na data consultada;
- `upcomingItems`: campanhas da mesma aba que ainda vão entrar no ar, com início posterior à data consultada e horizonte padrão de 45 dias.
- `snapshotStatus`, `snapshotAt`, `snapshotAgeSeconds`, `stale` e `refreshJobId`: saúde e atualização do inventário do Drive.

Cada item preserva o valor original da planilha em `format.sheet` e detalha a decisão em `format.resolution`. A resposta v2 mantém os campos da v1 e adiciona diagnóstico.

```json
{
  "format": {
    "sheet": "TOPO",
    "normalized": "MEGABANNER TOPO",
    "resolution": {
      "status": "resolved",
      "method": "exact_alias",
      "rawFormat": "TOPO",
      "canonicalFormat": "MEGABANNER TOPO",
      "groupId": 1,
      "safeToApply": true,
      "candidates": [
        {
          "groupId": 1,
          "canonicalFormat": "MEGABANNER TOPO",
          "page": "home"
        }
      ]
    }
  }
}
```

Exemplos:

```bash
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08"
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08&siteSigla=PERRENGUE"
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08&refreshDrive=true"
```

## Regra de leitura da planilha

- A API lê somente a aba do mês corrente da data informada.
- Exemplo: `2026-07-08` usa `JULHO 2026`.
- Abas antigas sem ano, como `JULHO`, são ignoradas.
- Cada aba pode ter vários blocos de portal.
- Cada bloco começa no cabeçalho `PEÇA: (PI + CLIENTE)`.
- O nome do portal pode estar acima do cabeçalho, na mesma coluna ou deslocado.
- A linha entra no resultado quando o período contém a data consultada.
- Linhas futuras entram em `upcomingItems` quando o início está dentro do horizonte da consulta.

## Regra de Drive

O modo canônico é `DRIVE_INTEGRATION_MODE=monitor`:

```text
Google Drive -> adops-drive-pi-monitor -> snapshot PostgreSQL -> API/runner
```

O rollout começa em `legacy`, compara os dois inventários e só muda para `monitor` depois do smoke. Se o monitor falhar, a API mantém o último snapshot e informa `stale=true`; isso não deve ser interpretado como campanha inexistente.

Endpoints:

```bash
GET  /api/ops/drive-inventory/status
POST /api/ops/jobs/drive-inventory-refresh
```

Raiz canônica:

```text
18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6
```

Mapeamento:

- `AFL` -> `/AFL`
- `OMT` -> `/O MATOGROSSENSE`
- `ROO` -> `/ROO NOTICIAS`
- `PERRENGUE` -> `/PERRENGUE`
- `PNMT` -> `/PNMT`
- `PPMT` -> `/PMMT` ou `/PPMT`

O match da campanha usa uma única pasta exata. Ele não agrega todos os arquivos
do mês. A ordem é:

1. número da PI no nome da pasta da campanha;
2. número da PI no nome do PDF ou mídia dentro dessa pasta;
3. tokens do nome da campanha dentro do portal, somente como sugestão bloqueada.

Empate entre pastas retorna `ambiguous`. Arquivos de outra PI do mesmo mês não
entram no resultado.

`drive.candidates` mostra até dez pastas consideradas, com pontuação e método. `safeToApply=true` exige uma única identidade exata por pasta ou arquivo e ausência de conflito entre PIs. Um match somente por tokens da campanha permanece `ambiguous`.

Cada item retorna `sourceIdentity`:

```json
{
  "sources": {
    "sheetPi": "90718",
    "driveFolderPiCandidates": ["90708"],
    "drivePdfPiCandidates": ["90718"],
    "adopsPi": "90718"
  },
  "observedPiCandidates": ["90718", "90708"],
  "canonicalPi": "90718",
  "decision": "needs_confirmation",
  "reason": "Planilha e PDF concordam, mas o nome da pasta ou da mídia no Drive usa outra PI. Confirme antes de alterar ou publicar."
}
```

`canonicalPi` é uma recomendação de leitura, não autorização para mutar. Quando
`decision=needs_confirmation`, a API adiciona
`requiredActions[]=confirm_source_identity`.

Cada linha mensal também retorna `canonicalSelection`: inserção escolhida,
candidatas compatíveis e a evidência de PI, portal, formato, período e mídia
usada na decisão. A seleção só é `confirmed` quando há uma vencedora
determinística; `ambiguous` bloqueia publicação e captura.

Arquivos classificados:

- imagem: `gif`, `png`, `jpg`, `jpeg`, `webp`;
- vídeo: `mp4`, `mov`, `webm`;
- PDF;
- texto: `txt`, `docx`, Google Docs.

## Estados

- `ok`: campanha ativa está coerente.
- `needs_create_in_adops`: existe na planilha, mas não há inserção AdOps para PI + portal.
- `needs_media`: falta `mediaUrl` ou a mídia encontrada não bate com o formato.
- `needs_publication`: precisa estar publicada no site ou não há inserção para publicar.
- `needs_evidence`: falta print auditado para uma ou mais datas obrigatórias.
- `divergent_period`: período da planilha diverge do AdOps.
- `divergent_format`: formato da planilha diverge do AdOps.
- `drive_missing`: pasta/mídia não localizada no índice do Drive.
- `ambiguous_drive_match`: mais de uma pasta candidata no Drive.
- `source_conflict`: planilha, pasta, PDF ou AdOps usam números de PI diferentes.
- `blocked`: há problema objetivo que impede automação segura.

Detalhes e exemplos de variações ficam em [`campaign-input-resolution.md`](./campaign-input-resolution.md).

## Regras de aceite visual e publicação

- A posição retornada pela planilha/checklist é obrigatória. Uma evidência de `HOME 1`
  nunca aprova uma inserção `HOME 2`, mesmo que a mídia seja a mesma.
- Antes de marcar `bannerPublicadoNoSite=true`, validar HTML público ou relação
  AdOps x AdRotate para o grupo resolvido em `/api/audit-checklists/resolve`.
- Quando o WordPress copiar um GIF para o Spaces do próprio portal, atualizar
  `mediaUrl` no AdOps para a URL real publicada no HTML. Isso evita falha de
  `finalPngSlotAudit` por comparação contra URL opaca do Google Drive.
- `printGerado` e evidência auditada só são aceitos quando
  `/api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD` retornar
  `status=audited` e `checklistValidation.approved=true`.
- Se `adrotate-publish` falhar por SSH/WP-CLI, manter a campanha como
  `needs_publication`; não marcar como publicada por inferência.
- Antes de publicar em Perrengue, rodar `runtime-readiness-probe` e exigir
  `capabilities.perrengueSshAuthOk=true`. Se o check
  `PERRENGUE_SSH_AUTH` retornar `permission_denied`, a campanha fica pendente
  de rota/admin SSH, mesmo que a chave exista no volume do runner.
- Para campanhas futuras, a relação pública pode ficar vazia até a data de
  início. Nesse caso, `adrotate-publish` só pode marcar como publicado quando o
  WP-CLI retornar `ad_id` e `group_id` do anúncio criado/atualizado; registrar
  essa decisão em `observacoes`.
- Se o HTML público mostrar um anúncio legado no mesmo slot, mas a relação
  `/api/integrations/adrotate/insertions/{id}/relation` não tiver
  `exactLiveMatches`, manter como pendente. Não reaproveitar visualmente um
  anúncio sem vínculo canônico com a inserção.
- `relation.rotation.mode=rotating` é permitido: o AdRotate pode entregar mais
  de uma mídia no mesmo grupo. A aprovação continua exigindo que a evidência
  contenha a mídia esperada da inserção; uma mídia rotativa diferente não pode
  ser creditada e deve repetir apenas aquela data.

## Ações sugeridas

O endpoint não executa mutação. Ele retorna payloads prontos para endpoints existentes.

Exemplo:

```json
{
  "type": "print_backfill",
  "method": "POST",
  "endpoint": "/api/ops/jobs/print-backfill",
  "payload": {
    "piCodigo": "4500152231",
    "siteSigla": "PERRENGUE",
    "fromDate": "2026-07-01",
    "toDate": "2026-07-08"
  }
}
```

Use a ação sugerida somente depois de revisar `blockingIssues`.

Para conflitos de fonte ou mídia:

```bash
GET  /api/insertions/{id}/media-consistency
POST /api/ops/jobs/drive-pi-reconcile
```

O segundo endpoint usa `preview` por padrão. `apply=true` exige confirmação
humana registrada, PI e/ou URL canônica explícita e chave idempotente. Consulte
[`runtime-topology-and-permissions.md`](./runtime-topology-and-permissions.md).

## Campanhas futuras

`upcomingItems` usa a mesma base de dados da planilha e também cruza Drive e AdOps, mas não valida evidência, porque print só é exigível quando a campanha entra no período.

Campos principais:

```json
{
  "siteSigla": "PERRENGUE",
  "piCodigo": "PI 000000",
  "campaignName": "CAMPANHA",
  "period": {
    "start": "2026-07-20",
    "end": "2026-07-30",
    "original": "20/07-30/07"
  },
  "format": {
    "sheet": "TOPO",
    "adops": null,
    "normalized": "TOPO"
  },
  "drive": {
    "status": "found",
    "mediaFiles": []
  },
  "adops": {
    "status": "missing"
  },
  "requiredActions": [
    "create_campaign_or_insertion",
    "publish_on_site"
  ]
}
```

## Caso de aceite: 08/07/2026

Resultado esperado para a planilha `JULHO 2026`, após sincronização:

- `PI 90519 - GOV / DENGUE / OMT`: deve estar publicada no TOPO, com mídia real
  do HTML público e evidência auditada para `2026-07-08`.
- `PI 003124 - SANEAR / ROO / TOPO`: deve estar publicada e auditada.
- `PI 492306 - ENERGISA / PERRENGUE / LATERAL`: deve estar publicada e auditada.
- `PI 003123 - SANEAR / AFL / TOPO`: deve estar publicada e auditada, com
  período alinhado à planilha.
- `PI 4500152231 - ÁGUAS CUIABÁ / PERRENGUE / HOME 2`: se o HTML público
  mostrar apenas `HOME 1`, deve permanecer como `needs_publication`.
- `PI 003121 - SANEAR / PERRENGUE / VIDEO`: se o endpoint `adrotate-publish`
  falhar por SSH, deve permanecer como `needs_publication`.
- `PI 003124 - SANEAR / ROO / VIDEO`: quando futura, pode ficar sem evidência
  até `2026-07-10`, mas deve estar com mídia e AdRotate agendados.
- `PI 003123 - SANEAR / AFL / VIDEO`: quando futura, pode ficar sem evidência
  até `2026-07-11`, mas deve estar com mídia e AdRotate agendados.

## Segurança

- A rota é read-only.
- Não cria campanha.
- Não publica AdRotate.
- Não gera print.
- Não expõe credenciais do Google Drive.
- Quando o Drive não está disponível, retorna `drive.status=unavailable` em vez de inventar mídia.
