# AdOps Ops API Runbook

## Objetivo

Operar o AdOps sem escrita direta no banco.

Este runbook consolida os endpoints que outro agente, terminal, Telegram, WhatsApp ou painel podem usar para:

- cadastrar/intake de nova campanha a partir de pasta do Google Drive;
- gerar print retroativo de uma data;
- gerar retroativos pendentes;
- garantir pacote por PI + site;
- resolver e validar checklist de auditoria;
- acompanhar fila e progresso.

## Glossário rápido

- `PI`: identificação comercial da campanha enviada pela agência ou cliente.
  Exemplo: `4500152231`, `25206089`, `14589`.
- `API`: endpoint HTTP da ferramenta AdOps para operar sem escrita direta no
  banco. Exemplo: `POST /api/ops/jobs/print-backfill`.
- `campanha`: registro do AdOps que agrupa uma ou mais inserções da mesma PI.
- `inserção`: veiculação específica da campanha em portal, posição e período.
- `print/evidência`: imagem auditada gerada pelo runner oficial e validada pelo
  checklist central.

## Variáveis locais

Use sempre variável de ambiente para token. Nunca cole token em comando salvo, Git ou chat.

```bash
export ADOPS_API_BASE_URL="https://adops-api.codigo5.com.br"
export OPS_API_TOKEN="..." # token operacional
```

Comandos `GET` públicos podem funcionar sem token, mas toda mutação exige:

```bash
-H "Authorization: Bearer $OPS_API_TOKEN"
```

## Catálogo vivo da API

A primeira entrada para outro agente ou operador humano é o quickstart:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/quickstart"
```

Ele separa os conceitos:

- `PI`: dado comercial da campanha;
- `API`: endpoint/ferramenta para operar o AdOps.

Também traz os fluxos recomendados para:

- gerar print de uma data;
- gerar retroativos de uma campanha;
- cadastrar campanha a partir do Drive;
- corrigir AdRotate;
- validar checklist antes de entregar.

Para leitura humana:

```text
https://adops-api.codigo5.com.br/api/ops/quickstart.html
```

A própria API expõe o catálogo operacional:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/api-catalog"
```

Esse endpoint é a fonte rápida para outro agente descobrir os comandos principais.

Para uma leitura humana no navegador:

```text
https://adops-api.codigo5.com.br/api/ops/api-catalog.html
```

Para uma leitura visual em padrão Swagger/FastAPI:

```text
https://adops-api.codigo5.com.br/api/ops/docs
```

Para ferramentas que leem padrão OpenAPI/Swagger:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/openapi.json"
```

O JSON mantém duas visões:

- `sections[]`: agrupado por objetivo operacional;
- `endpoints[]`: lista plana para automações e agentes.

Regra de arquitetura: o operador usa estes endpoints. A escrita direta no banco fica restrita ao runtime da API e às migrações controladas.

## Saúde e fila

Conferir API:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/healthz"
```

Conferir fila:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/queue/overview"
```

Conferir prontidão de integrações sem expor segredos:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/runtime-readiness"
```

Esse endpoint responde apenas nomes e presença/ausência de variáveis de
ambiente. Ele serve para saber se o runtime atual consegue operar API, Drive,
Telegram, runner e política de mutação. Ele nunca deve retornar valores de
tokens, chaves, URLs privadas com credenciais ou paths sensíveis além dos nomes
das variáveis.

A resposta também inclui `runnerLiveness`, calculado pelos jobs executados
recentemente. Use estes campos para separar "API online" de "API com runner
ativo":

- `runnerLiveness.hasRecentRunner`;
- `runnerLiveness.lastRunnerId`;
- `runnerLiveness.lastRunnerSeenAt`;
- `runnerLiveness.recentRunnerWindowMinutes`.

Se `hasRecentRunner=false`, ainda pode ser apenas fila ociosa, mas jobs novos
devem ser acompanhados por `/api/ops/jobs/JOB_ID/progress` até aparecer
`runnerId`.

Quando precisar conferir as credenciais/capacidades de dentro do runner, rode o
probe assíncrono:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/runtime-readiness-probe" \
  -d '{}'
```

Depois acompanhe o job:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID"
```

O resultado esperado fica em `result.execution.runnerRuntimeReadiness`. Ele
também só retorna nomes e presença/ausência de variáveis, nunca valores de
segredo.

No deploy por volume do Mac Mini, o runner principal deve montar o volume
externo `adops-drive-pi-monitor-data` em `/data:ro` e usar, por padrão:

```text
GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=/data/secrets/google-drive-service-account.json
```

Se `runnerRuntimeReadiness.capabilities.googleDriveReady=false`, confira esse
mount antes de mexer em código ou banco.

Consultar job:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID"
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
```

## Checklist de auditoria

Resolver regra antes de gerar print:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/audit-checklists/resolve?insertionId=1663&date=2026-07-01"
```

Validar evidência depois do print:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/audit-checklists/validate-proof" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Status final integrado:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/insertions/1663/capture-proof/status?date=2026-07-01"
```

Aceite mínimo:

- `status=audited`;
- `inPeriod=true`;
- `hasEvidence=true`;
- `isReachable=true`;
- `checklistValidation.approved=true` quando presente;
- `blockingIssues=[]`.

## Perrengue / PMT headless

O Perrengue publico nao consome WordPress/AdRotate em runtime. Ele e um
headless estatico reconstruido a partir do WordPress VM8.

Para `siteSigla=PERRENGUE`, a rota operacional canonica e:

```text
AdOps API -> runner -> Portainer VM8 -> cod5-pro119-perrenguematogrosso-app -> /app/web/wp/wp-load.php -> AdRotate -> webhook rebuild -> site estatico
```

Nao trate cPanel/SSH legado como fonte primaria para publicacao do PMT. Ele
pode existir como fallback administrativo, mas nao prova que o site publico foi
atualizado.

Existem dois Portainers envolvidos e eles nao podem ser confundidos:

- Portainer de administracao do stack AdOps: usado por scripts locais como
  `upload-runtime-volumes.sh` e `deploy-stack.sh`.
- Portainer VM8 do Perrengue: usado pelo `adops-runner` em producao para
  executar PHP dentro do container WordPress
  `cod5-pro119-perrenguematogrosso-app`.

Arquivos locais de referencia, todos fora do Git:

```text
ops/portainer/adops-stack/.env.stack-admin-portainer
ops/portainer/adops-stack/.env.perrengue-vm8-portainer
/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env
```

O primeiro administra o proprio AdOps. O segundo e o bloco que precisa estar
mesclado no `adops.env` para permitir publicacao PMT via API.

Antes de gerar evidencia PMT:

1. Validar relacao AdOps x AdRotate:

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/integrations/adrotate/insertions/INSERCAO_ID/relation"
```

2. Publicar via job `adrotate-publish` com `purgeCache=true` quando necessario.
3. Rodar rebuild incremental do headless pelo webhook VM8.
4. Validar a home publica sem query string.
5. Confirmar que o grupo esperado nao contem `data-cod5-ad-placeholder="1"`.
6. So entao gerar `print-single` ou `print-backfill`.

Validacao rapida do acesso VM8 pelo arquivo organizado:

```bash
ops/portainer/adops-stack/scripts/validate-perrengue-vm8-portainer.sh
```

Resultado esperado:

```text
portainer_status_http=200
perrengue_wp_container_count=1
perrengue_static_container_count=1
exec_exit_code=0
exec_output=wp-load-ok
```

Videos PMT precisam ser publicados como `<video><source src="...mp4">`. O runner
de captura deve registrar a URL do `<source>` em `mediaProof.matchedMediaUrl`;
se esse campo vier vazio, a evidencia deve ser recusada mesmo que o PNG pareca
correto.

## Gerar print de uma data

Use para print atual ou retroativo específico.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-single" \
  -d '{
    "insertionId": 1663,
    "date": "2026-07-01",
    "replace": true
  }'
```

Depois, acompanhe:

```bash
curl -fsSL "$ADOPS_API_BASE_URL/api/ops/jobs/JOB_ID/progress"
```

Antes de aceitar a imagem, valide o checklist:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/audit-checklists/validate-proof" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

Aceite apenas `approved=true` e `blockingIssues=[]`.

## Gerar retroativos pendentes

Por inserção:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"insertionId":1663}'
```

Por campanha:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"campaignId":944}'
```

Por PI + site:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"piCodigo":"4500152231","siteSigla":"PERRENGUE","fromDate":"2026-07-01","toDate":"2026-07-07"}'
```

Por site:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
  -d '{"siteId":1}'
```

Por competência:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-backfill" \
-d '{"competencia":"JULHO/2026"}'
```

Comportamento do backfill por `campaignId` ou `piCodigo + siteSigla`:

- resolve automaticamente as inserções da campanha/PI;
- usa o período oficial de cada inserção;
- aceita `fromDate` e `toDate` para limitar a janela;
- se o print já estiver `audited` e aprovado, não sobrescreve;
- se faltar print ou o checklist reprovar, recaptura e revalida;
- `replace=true` força regeração mesmo quando já existe evidência aprovada.

## Gerar lote de uma data

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/print-batch" \
  -d '{"siteId":1,"date":"2026-07-01"}'
```

## Garantir pacote por PI + site

Este é o fluxo canônico de entrega para jornalista. Ele garante cobertura de
evidências e produz dois artefatos simples por PI/site.

Modos de entrega:

- `mode=delivery`: padrão; gera ZIP somente com JPEGs e PDF separado, com nomes neutros, e envia os dois ao Telegram;
- `mode=full`: compatibilidade; inclui cada PNG original e não reduz significativamente o tamanho;
- `mode=prints-only&variant=web`: ZIP somente com JPEGs progressivos comprimidos;
- `mode=pdf`: entrega somente um PDF comprimido, com uma evidência auditada por página;
- `mode=full-pdf`: entrega o pacote operacional com PDF comprimido e uma pasta
  `01-PRINTS-PDF/IMAGENS-INDEPENDENTES/` contendo uma imagem JPEG comprimida
  para cada página.

No PDF, a compressão padrão limita a largura a `1920 px`, usa qualidade JPEG
`68` e resolução lógica de `120 DPI`. Os PNGs auditados originais permanecem
intactos no storage do AdOps.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Idempotency-Key: pi-16628-perrengue-delivery-v1" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/pi-site-exports/jobs" \
  -d '{
    "piCodigo":"16628",
    "siteSigla":"PERRENGUE",
    "mode":"delivery",
    "variant":"web",
    "sendTelegram":true,
    "pdfMaxWidth":1920,
    "pdfQuality":68,
    "pdfResolution":120,
    "imageMaxWidth":1600,
    "imageQuality":72
  }'
```

O retorno `202` contém `jobId`. Consulte
`GET /api/pi-site-exports/jobs/{jobId}` até `status=completed`; então use
`GET /api/pi-site-exports/jobs/{jobId}/download` para o ZIP e
`GET /api/pi-site-exports/jobs/{jobId}/pdf` para o PDF. Uma repetição com a mesma
`Idempotency-Key` retorna o mesmo job e `duplicate=true`. O endpoint legado
`POST /api/ops/jobs/pi-site-export` permanece como alias de compatibilidade,
mas não deve ser usado em novas automações.

O ZIP externo não contém PDF, JSON, CSV, README, auditoria ou contact sheet.
Esses dados continuam preservados internamente. Os nomes externos são
`PI-<codigo>-<portal>.zip` e `PI-<codigo>-<portal>.pdf`, sem palavras de status.
Se o Telegram estiver indisponível, os artefatos continuam publicados e o job
retorna `telegram.ok=false`; a falha de notificação não destrói a entrega.

Download direto, sem criar job (somente diagnóstico ou pacote pequeno):

```bash
curl -fL \
  "$ADOPS_API_BASE_URL/api/pi-site-exports?piCodigo=16628&siteSigla=PERRENGUE&mode=pdf&variant=web&download=1" \
  -o PI-16628-PERRENGUE.pdf
```

O endpoint valida os limites recebidos:

- `pdfMaxWidth`: `800` a `2560`;
- `pdfQuality`: `45` a `85`;
- `pdfResolution`: `72` a `180`.
- `imageMaxWidth`: `800` a `2560`, padrão `1600`;
- `imageQuality`: `45` a `90`, padrão `72`.

O PNG auditado permanece intacto no storage. A variante `web` gera uma cópia
JPEG progressiva; essa distinção evita chamar de "comprimido" um PNG lossless
que continuaria quase do mesmo tamanho. Para pacotes grandes, prefira o job
assíncrono: ele monta o artefato pela rede interna e publica o download final
no Spaces sem depender do timeout HTTP do Cloudflare.

## Swagger completo com FastAPI

A versão pública e os contratos existentes continuam no mesmo domínio. A
aplicação FastAPI documenta todas as rotas Express publicadas sem substituir o
backend operacional:

```text
GET https://adops-api.codigo5.com.br/api/docs
GET https://adops-api.codigo5.com.br/api/redoc
GET https://adops-api.codigo5.com.br/api/openapi.json
```

O Swagger antigo do catálogo operacional permanece compatível em
`/api/ops/docs`. O novo documento informa a mesma versão pública
`adops-ops-api-catalog-v2` e inclui a origem de cada rota e uma impressão
digital SHA-256 do catálogo.

## Reconciliar Planilha + AdRotate

Use para conferir divergências entre a planilha operacional, AdOps e AdRotate
sem abrir painel nem escrever direto no banco.

Auditoria sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":false}'
```

Aplicar correções automáticas suportadas pelo script real:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/reconcile-adrotate" \
  -d '{"apply":true}'
```

Política:

- `apply=false` roda o harness sem mutação e gera diagnóstico.
- `apply=true` roda `scripts/src/reconcile-planilha-adrotate.ts`.
- O operador acompanha por `/api/ops/jobs/JOB_ID` e não acessa banco direto.
- Se o job apontar pendência manual, corrigir origem oficial antes de gerar prints.

## Vincular anúncio AdRotate existente

Use quando a campanha/inserção já existe no AdOps e o anúncio já existe no
WordPress/AdRotate, mas falta alinhar os campos técnicos de vínculo.

Prévia sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":false}'
```

Aplicar vínculo:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-link" \
  -d '{"insertionId":1663,"adId":160,"apply":true}'
```

Política:

- `apply=false` é o padrão e chama o WP-CLI em modo preview.
- `apply=true` chama `wp adrotate adops link ... --apply` no portal correto.
- O job não cria anúncio novo e não escolhe posição sozinho.
- Antes de gerar prints, validar relação AdOps x AdRotate e checklist central.

## Publicar ou atualizar anúncio AdRotate

Use quando a inserção já existe no AdOps, a mídia está resolvida e o portal
precisa criar ou atualizar o anúncio AdRotate no grupo canônico do checklist.

Prévia sem mutação:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-publish" \
  -d '{"insertionId":1666,"apply":false,"replaceExisting":true,"purgeCache":true,"generateEvidence":false}'
```

Aplicar publicação e já pedir evidência:

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/adrotate-publish" \
  -d '{"insertionId":1666,"apply":true,"replaceExisting":true,"purgeCache":true,"generateEvidence":true,"date":"2026-07-08"}'
```

Política:

- `apply=false` é obrigatório como primeira checagem operacional.
- A posição vem de `/api/audit-checklists/resolve`, nunca de escolha manual.
- O runner bloqueia se não houver `mediaUrl`, grupo, site ou WP-CLI.
- O plugin WordPress expõe `wp adops-adrotate-publish` e cria/atualiza por
  `adops_insertion_id`, sem duplicar anúncio.
- Para campanha futura, o HTML público e a relação viva podem não listar o
  anúncio antes do início. Nesse caso, o job só pode marcar como publicado se o
  WP-CLI retornar `ad_id` e `group_id`, e a inserção deve registrar a observação
  de que a validação pública completa depende da data inicial.
- Se o SSH/WP-CLI falhar, o job deve falhar e a inserção fica pendente de
  publicação. Não corrigir por banco direto nem por hardcode no HTML.
- Com `purgeCache=true`, o WordPress limpa cache e reavalia AdRotate.
- Com `generateEvidence=true`, o job agenda `print-single`; a evidência só vale quando `capture-proof/status` voltar auditado.

## Reenviar evidência auditada no Telegram

Use quando o print já existe e precisa ser enviado novamente no grupo.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/telegram-send-evidence" \
  -d '{"insertionId":1663,"date":"2026-07-01"}'
```

O runner faz duas validações antes de enviar:

1. chama `/api/audit-checklists/validate-proof`;
2. só chama o bot Telegram se `approved=true`.

Se o checklist recusar, o job falha com `blockingIssues` no resultado.

## Readiness real de SSH/WP-CLI

Use antes de tentar publicar AdRotate em portal que depende de WP-CLI.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/runtime-readiness-probe" \
  -d '{}'
```

No resultado do job, conferir:

- `capabilities.perrengueSshConfigured=true`
- `capabilities.perrengueSshAuthOk=true`
- categoria `adrotate`, check `PERRENGUE_SSH_AUTH`

Se `PERRENGUE_SSH_AUTH` voltar `permission_denied`, não executar
`adrotate-publish` em lote para Perrengue. Corrigir primeiro a chave autorizada
no servidor ou o usuário SSH do site. A existência da chave no volume não basta.

Credenciais:

- o operador usa apenas `OPS_API_TOKEN`;
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_DEFAULT_GROUP_ID` ficam no ambiente do runner/Portainer;
- se o Worker do bot estiver indisponível, o runner pode enviar direto pela API do Telegram usando essas variáveis.

## Intake de nova PI por pasta do Drive

### 1. Preflight sem mutação

Use primeiro quando a pasta do Drive já contém PI e mídia, mas você ainda quer
conferir período, formato, mídia, planilha, deduplicação e rollout antes de
publicar.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-preflight" \
  -d '{
    "folderUrl": "https://drive.google.com/drive/folders/ID_DA_PASTA"
  }'
```

Esse job usa o mesmo parser, agente e validações do cadastro real, mas envia
`preflightOnly=true` para o runner. Mesmo que o ambiente produtivo tenha flags
de auto-apply ligadas, esse job não cria campanha, não cria inserção e não
publica anúncio.

Aceite do preflight:

- job `completed`;
- `result.execution.preflightOnly=true`;
- campos de PI encontrados em `result.execution.fields`;
- `validation.ok=true`;
- `packageReadiness.ok=true`;
- sem `dedupe_conflict`;
- sem `rollout_blocked`;
- `reviewReasons` contendo `preflight_only` quando tudo está pronto para aplicação.

Pendência comum:

- `drive_folder_empty_or_not_shared`: a API conseguiu receber a pasta, mas o
  runner não listou PDF/mídia. Normalmente a pasta não está compartilhada com a
  credencial Google Drive do runner/monitor. Corrija o compartilhamento da
  pasta e rode o preflight novamente.

### 2. Intake/cadastro operacional

Use quando a pasta do Drive já contém PI e mídia.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-folder" \
  -d '{
    "folderUrl": "https://drive.google.com/drive/folders/ID_DA_PASTA"
  }'
```

Esse job usa o runner oficial.

Regra operacional: só use este endpoint depois do preflight ou quando a PI já
tiver sido conferida por outra fonte oficial.

O comportamento depende das flags do `.env`:

- `DRIVE_PI_MONITOR_ENABLED`;
- `GOOGLE_DRIVE_*`;
- `ADOPS_DRIVE_PI_ALLOW_MUTATION`;
- `ADOPS_PI_AGENT_ENABLED`;
- `ADOPS_PI_AGENT_AUTO_APPLY`;
- `ADOPS_TELEGRAM_BOT_URL`.

Política segura:

- sem PI ou mídia: bloquear em diagnóstico;
- sem confiança suficiente: `needs_review`;
- sem `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`: não aplicar cadastro;
- sem `ADOPS_PI_AGENT_AUTO_APPLY=true`: analisar, mas não publicar automaticamente.

O intake correto precisa registrar no job:

- pasta Drive;
- PDFs e mídias detectadas;
- PI/campanha/cliente/agência/site/período/formato extraídos;
- divergências contra planilha;
- decisão `applied`, `needs_review` ou `failed`.

O job não deve publicar quando faltar dado crítico, mídia pública ou posição resolvida sem ambiguidade.

### 3. Cadastro e publicação completa

Use `drive-pi-publish` quando o escopo da PI já foi conferido e o objetivo é
concluir cadastro, mídia, AdRotate, cache/rebuild e evidência em um único job.

```bash
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ADOPS_API_BASE_URL/api/ops/jobs/drive-pi-publish" \
  -d '{
    "folderUrl": "https://drive.google.com/drive/folders/ID_DA_PASTA",
    "parsedPi": {},
    "resolveMedia": true,
    "strictInsertionScope": true,
    "allowPdfInsertions": false,
    "publish": true,
    "generateEvidence": true,
    "purgeCache": true
  }'
```

Regras:

- `parsedPi.insertions` é canônico quando informado;
- formatos sociais são excluídos das inserções de site;
- `.txt` pode indicar URL de banner ou download de vídeo;
- empate entre mídias candidatas termina em `needs_review`;
- GIF/imagem do Perrengue é importado no WordPress VM8 e usa a URL pública do anexo;
- vídeo passa pelo compressor e pelo Spaces/CDN;
- no Perrengue, a evidência só roda depois do rebuild headless e da validação do HTML público;
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=true` continua obrigatório.

### 4. Como aceitar campanha ativa ou futura

Nao use apenas `bannerPublicadoNoSite=true` como prova. A verificacao correta
tem camadas diferentes para campanha ativa e campanha futura.

Campanha ativa:

1. `campaign-operations/active` deve encontrar planilha + AdOps.
2. `adrotate-publish` em preview deve retornar `existing_ad_id` ou plano de
   criacao, `group_id`, periodo e `bannercode_contains_asset=true`.
3. Depois de `apply=true`, `publicHtmlValidation.mediaFound=true` e
   `publicHtmlValidation.adFound=true` devem confirmar o criativo esperado.
4. Em PMT/Perrengue, `headlessRebuild.completed=true` e
   `headlessRebuild.health.lastStatus=ok` sao obrigatorios.
5. A evidencia final precisa de `status=audited`, `approved=true` e
   `blockingIssues=[]`.

Campanha futura:

1. A insercao deve existir no AdOps com inicio/fim e mídia publica.
2. O preview deve localizar o anuncio administrativo no AdRotate.
3. Reaplicar com `apply=true` e `date` igual ao inicio confirma `ad_id`,
   `group_id`, periodos e vinculo sem antecipar a veiculacao.
4. `exactLiveMatches=[]` e ausencia no HTML antes do inicio sao esperados em
   portais dinamicos. Nao publicar print antecipado para compensar isso.
5. No PMT headless, a mídia futura pode aparecer no bundle/HTML reconstruido
   sem estar visivel. O aceite continua sendo o periodo salvo no AdRotate.

Observacoes importantes:

- `relationOk=false` imediatamente apos uma publicacao nao invalida o job
  quando o proprio job confirma `ad_id/group_id` e o HTML de validacao encontra
  `mediaFound=true` e `adFound=true`; a relacao publica pode ser uma fotografia
  assincrona ou depender da rotacao do grupo.
- Quando mais de uma campanha ativa ocupa o mesmo grupo, uma unica resposta da
  home nao prova conflito. Validar cada anuncio pelo modo de verificacao do job,
  pela relacao administrativa e pela evidencia individual. Se a evidencia
  individual do periodo estiver aprovada, `campaign-operations/active` nao deve
  transformar outra resposta aleatoria da rotacao em bloqueio.
- Arquivo Office `.xlsx` no Drive nao pode ser lido pela Google Sheets API.
  Baixe o arquivo bruto ou use `campaign-operations/active`, que aplica o
  parser canonico da planilha.
- Arquivos `.txt` e Google Docs devem ser lidos porque podem conter URL de
  destino do banner ou link temporario para download do video.
- URL de visualizacao do Google Drive nao deve ser salva como mídia publica.

### 5. Auditoria diaria de todas as campanhas

```bash
curl -fsSL \
  "$ADOPS_API_BASE_URL/api/campaign-operations/active?date=2026-07-10&includeEvidence=true&refreshDrive=false"
```

Para cada item ativo, conferir:

```text
planilha -> adops.matched -> relacao AdRotate -> HTML publico -> evidencia
```

Para cada item em `upcomingItems`, conferir:

```text
planilha -> adops.matched -> mediaUrl -> preview AdRotate -> apply programado
```

O status consolidado so pode ser chamado de pronto quando nao houver campanha
ativa sem mídia publica, sem anuncio administrativo ou sem prova visual.

## Regras de auditoria que a API deve bloquear

O contrato real está em `GET /api/audit-checklists/resolve`.

Resumo dos gates:

- período correto;
- mídia vinculada;
- horário retroativo entre `18:00` e `21:59` em `America/Cuiaba`;
- grupo AdRotate correto;
- seletor do slot correto;
- contexto do slot correto;
- frame `windows11-chrome-light-similar-v4`;
- tema claro;
- URL real do portal;
- scrollbar quando a página excede o viewport;
- banner visível no PNG final;
- header sticky quando o portal/formato exige;
- sem 404;
- sem modal/overlay cobrindo a página;
- vídeo com controles e progresso visíveis;
- GIF em frame permitido quando configurado;
- `finalPngSlotAudit.ok=true` quando exigido.
- `retroContentProof.status=approved` em qualquer evidência retroativa;
- preview assinado ativo ou reconstrução auditada com manifesto;

No `mode=full-pdf`, o ZIP só é considerado completo quando também contém
`04-AUDITORIA/AUDITORIA-RETRO-CONTENT.json`, um manifesto por data,
contact sheet e `SHA256SUMS.txt`. O checksum deve validar todos os arquivos e
o pacote web deve ter zero PNG.
- mínimo de três notícias correspondentes em home e uma em artigo;
- nenhuma data editorial posterior ao `requestedCaptureAt`.

Para capturas demoradas, usar
`POST /api/insertions/{id}/capture-proof/jobs` com `Idempotency-Key` e polling
em `GET /api/insertions/{id}/capture-proof/jobs/{jobId}`. Não repetir uma
chamada síncrona após `524` sem consultar o job ou o status da evidência: o
runner pode ter continuado após o timeout da borda.

Se qualquer item obrigatório falhar, o fluxo deve corrigir a origem antes de gerar lote:

```text
AdOps/planilha/PI -> AdRotate/portal -> HTML público -> captura -> checklist -> entrega
```

Não liberar exceção para slot errado. O caso Iguá provou o comportamento correto: a API recusou enquanto o criativo estava no grupo `3` e só aprovou quando a fonte foi corrigida para grupo `2`.

## Deploy no Mac Mini

O runtime atual é o stack Portainer em:

```text
ops/portainer/adops-stack/
```

Serviços esperados:

- `adops-api`;
- `adops-runner`;
- `adops-runner-print-single`;
- `adops-postgres`;
- `adops-web`;
- `adops-telegram` quando habilitado.

O `.env` privado deve ficar fora do Git. Use:

```text
/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env
```

## Próximos incrementos

1. Criar testes de API para os wrappers `/ops/jobs/*`.
2. Garantir que o deploy público use `OPS_JOB_KINDS` com todos os jobs:
   `sync-planilha,print-batch,print-backfill,print-single,analytics-report,pi-site-export,drive-pi-ingest,reconcile-adrotate,adrotate-link,adrotate-publish,telegram-send-evidence,runtime-readiness-probe`.
3. Criar adaptador Telegram chamando estes endpoints.
4. Criar adaptador WhatsApp chamando estes endpoints.
5. Criar painel autenticado consumindo o catálogo JSON, sem rotas novas fora da API.
6. Evoluir painel com login para usar a mesma API, sem rota paralela.
