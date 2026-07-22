# Topologia, permissões e reconciliação de fontes do AdOps

## Objetivo

Este documento define onde cada componente roda, quais credenciais ele pode possuir, quais mutações pode executar e como tratar divergências entre planilha, PDF, pasta do Drive, AdOps, AdRotate e site público.

Contrato vivo, sem valores de segredo:

```bash
GET /api/ops/runtime-topology
GET /api/ops/runtime-readiness
POST /api/ops/jobs/runtime-readiness-probe
```

## Topologia canônica

```text
Google Drive
  -> adops-drive-pi-monitor (rede Docker interna, Mac Mini)
  -> snapshot PostgreSQL + download interno
  -> AdOps API (Mac Mini / Portainer endpoint 3)
  -> ops_jobs
  -> adops-runner / adops-print-single-runner (Mac Mini)
  -> WordPress / AdRotate de cada portal
  -> cache/rebuild
  -> portal público
  -> captura
  -> checklist
  -> evidência / Telegram
```

Cloudflare fornece DNS, Tunnel, Access e purge seletivo. Não é o plano de compute do AdOps e não deve possuir credenciais do Google Drive ou banco do AdRotate.

### PMT / Perrengue

O PMT possui uma segunda infraestrutura:

```text
AdOps API
  -> runner no Mac Mini
  -> Portainer Hostinger VM8
  -> cod5-pro119-perrenguematogrosso-app
  -> /app/web/wp
  -> AdRotate
  -> webhook de rebuild
  -> export estático headless
  -> Cloudflare
```

Publicar em WordPress/cPanel legado não prova atualização do PMT. O aceite exige rebuild concluído e HTML público correto.

## Donos de credenciais e mutações

| Componente | Local | Pode possuir | Pode alterar | Não deve possuir |
|---|---|---|---|---|
| `adops-api` | Mac Mini / Portainer 3 | `OPS_API_TOKEN`, token interno, PostgreSQL | AdOps e fila | credencial Drive, WordPress admin |
| `adops-drive-pi-monitor` | Mac Mini / rede interna | credencial Google Drive | snapshot e eventos da fila | AdRotate, Telegram |
| `adops-runner` | Mac Mini / Portainer 3 | token interno, Portainer/WordPress, Telegram/bridge | AdRotate, mídia, cache, evidência | credencial Drive após migração monitor-first |
| `adops-print-single-runner` | Mac Mini / Portainer 3 | token interno e storage de evidência | captura/evidência | Drive e publicação AdRotate |
| WordPress PMT | Hostinger VM8 | banco/mídia locais | AdRotate e biblioteca de mídia PMT | token operacional público do AdOps |
| Cloudflare | edge | Tunnel/Access/zone token restrito | DNS/cache conforme escopo | Drive, banco AdOps, banco AdRotate |

Nunca documentar valores. Relatórios mostram apenas nome da variável e estado `presente/ausente`.

## Fonte canônica e conflitos

Prioridade de identidade comercial:

1. PDF ou e-mail oficial da PI;
2. planilha operacional;
3. AdOps;
4. AdRotate e site público como estado de publicação.

Nome da pasta e nome da mídia são evidências de localização, não autoridade automática. Uma pasta pode ter erro de digitação.

`GET /api/campaign-operations/active` retorna `sourceIdentity` com:

- `sheetPi`;
- `driveFolderPiCandidates`;
- `drivePdfPiCandidates`;
- `adopsPi`;
- `observedPiCandidates`;
- `canonicalPi`;
- `decision=confirmed|needs_confirmation|insufficient_data`;
- `reason`.

Quando houver `needs_confirmation`, a API inclui `confirm_source_identity` e bloqueia automação segura. A mensagem para a operação deve:

1. separar cada campanha;
2. citar planilha, pasta, PDF, AdOps e site;
3. mostrar valores e nomes de arquivo exatos;
4. explicar a diferença visual sem jargão;
5. terminar com uma pergunta objetiva;
6. anexar comparação visual quando útil.

## Escopo exato do Drive

O resolvedor agrupa itens pela primeira pasta cujo segmento contém `PI <número>`. Depois escolhe uma única pasta de campanha.

Ordem de match:

1. PI exata no nome da pasta;
2. PI exata em arquivo da pasta, inclusive PDF;
3. tokens da campanha dentro do portal;
4. empate resulta em `ambiguous`, nunca na soma de todo o mês.

Arquivos de outra pasta/PI no mesmo mês não entram em `mediaFiles`, `pdfFiles` ou `textFiles`.

## Diagnóstico de mídia

```bash
GET /api/insertions/{id}/media-consistency
```

O endpoint compara:

- PI e formato da inserção;
- pasta exata e arquivos do Drive;
- `mediaUrl` canônica do AdOps;
- grupo resolvido;
- mídia observada no slot público.

Códigos principais:

- `source_pi_conflict`;
- `drive_media_ambiguous`;
- `adops_drive_media_mismatch`;
- `public_media_not_observed_in_single_rotation_sample` (aviso; uma amostra não prova ausência em rotação);
- `format_mapping_unresolved`;
- `adops_media_missing`.

Comparação por nome normaliza acentos, extensão, dimensões e sufixos de cópia,
mas exige igualdade do restante. Por isso `sem_foto` e a versão sem esse sufixo
continuam diferentes. Ainda assim, nome é diagnóstico, não checksum: GIFs
visualmente diferentes devem receber confirmação visual.

## Reconciliação preview/apply

Preview:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reconcile-1809-preview-v1" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-reconcile" \
  -d '{"insertionId":1809,"apply":false}'
```

Apply após confirmação humana:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: reconcile-1809-apply-90718-v1" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-reconcile" \
  -d '{
    "insertionId":1809,
    "apply":true,
    "canonicalPi":"PI 90718 - PREF PVA",
    "confirmationNote":"Mariana confirmou que 90718 é a PI correta; 90708 é erro no nome da pasta."
  }'
```

Para trocar mídia, `mediaUrl` deve ser HTTPS pública e canônica. `drive.google.com` e `docs.google.com` são rejeitados.

Se existe apenas `selectedDriveFileId`, sem URL pública, use `drive-pi-publish` para importar/comprimir e publicar a mídia. `drive-pi-reconcile` não transforma `webViewLink` em mídia.

## Idempotência e auditoria

- `preview` é o padrão;
- `apply=true` exige `canonicalPi` e/ou `mediaUrl`;
- `apply=true` exige `confirmationNote`;
- `Idempotency-Key` repetida retorna o job existente;
- PI em conflito sem `canonicalPi` explícita bloqueia o runner;
- mídia nova é validada por `HEAD` antes do patch;
- o resultado registra `mutated`, `applied`, estado anterior e posterior.

Depois do apply:

```bash
GET /api/ops/jobs/{jobId}
GET /api/campaign-operations/active?date=YYYY-MM-DD
GET /api/insertions/{id}/media-consistency
GET /api/integrations/adrotate/insertions/{id}/relation
```

Reconciliação de cadastro não publica automaticamente no AdRotate. Quando necessário, executar `adrotate-publish` em preview e depois apply.
