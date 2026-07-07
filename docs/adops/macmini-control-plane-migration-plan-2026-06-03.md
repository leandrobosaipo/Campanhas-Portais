# Plano detalhado - migrar AdOps control plane para Mac Mini

Atualizado em: 2026-06-03

## Status de execucao em 2026-06-03

Executado:

- Snapshot remoto D1 `adops-ops` exportado.
- Historico importado no Postgres do Mac Mini.
- Contagens importadas:
  - `ops_jobs`: 999
  - `cod5_drive_events`: 124
  - `cod5_inbound_documents`: 124
  - `cod5_document_parse_runs`: 484
- Conflitos de importacao: 0.
- API local `adops-api` atualizada com rotas `/api/ops/*`.
- `https://adops-api.codigo5.com.br/api/healthz` validado com HTTP 200.
- `/api/ops/jobs` e `/api/ops/queue/overview` validados no dominio publico do Mac Mini.
- Dedupe validado com evento sintetico importado: `duplicate=true`, sem criar novo historico.
- `adops-drive-pi-monitor` recriado apontando para `https://adops-api.codigo5.com.br`.
- State do monitor preservado; primeiro ciclo apos corte conferiu 83 itens e enviou 0 eventos.
- `adops-runner` criado e ativo no Mac Mini, com `drivePiMonitor=disabled` e polling da API local.
- Smoke completo contra `https://adops-api.codigo5.com.br` passou:
  - eventId `drive:cod5synthetic1780486916331:2026-06-03T11:41:56.329Z`
  - jobId `ab3e7d1e-dedc-409e-9384-b45987f3ad04`
  - duplicate `true`
  - progress `completed`
  - stageKey `needs_review`
  - runnerId `runner-1`

Artefatos locais:

- Snapshot D1: `tmp/adops_ops_d1_snapshot_20260603T112647Z.sql`
- SQL de import Postgres: `tmp/adops_ops_d1_import_postgres_20260603T112647Z.sql`
- Migration Postgres: `ops/portainer/adops-stack/migrations/2026-06-03-macmini-control-plane.sql`
- Importer idempotente: `scripts/src/import-d1-control-plane-to-postgres.mjs`
- Bundle aplicado no container `adops-api` a partir de `artifacts/api-server/dist`.

Rollback preservado:

- Worker/D1/Queue Cloudflare ainda nao foram removidos.
- Backup do dist antigo da API no servidor: `/tmp/adops-api-dist-before-macmini-control-plane-20260603T113602Z.tgz`
- Backup do state do monitor no servidor: `/tmp/adops-drive-pi-monitor-state-before-api-cut-20260603T113825Z.json`

Pendencia antes de desligar Cloudflare compute:

- Migrar ou substituir o Worker Telegram por adapter Node local, ou confirmar que o Telegram legado nao recebe mais webhook ativo.
- Observar por 72h antes de remover Worker/D1/Queue.

## Objetivo

Migrar o AdOps para o servidor pessoal Mac Mini via Portainer, usando Cloudflare apenas como DNS/Tunnel/Access.

Escopo deste plano:

- API operacional.
- Fila de jobs.
- Historico de jobs.
- Eventos do Drive PI.
- Documentos inbound.
- Runs de parse/IA.
- Runner.
- Monitor de Drive.
- Telegram.
- Painel.
- Banco.

Regra principal:

```text
Nao omitir historico.
Nao duplicar evento, job, campanha, insercao, anuncio ou evidencia.
Nao cortar Worker/D1/Queue antes de snapshot + import + reconciliacao.
```

## Diagnostico

O estado atual e hibrido.

Ja roda no Mac Mini/Portainer:

- `adops-postgres`
- `adops-api`
- `adops-web`
- `adops-drive-pi-monitor`

Ainda depende de Cloudflare compute:

- `ops/cloudflare-public-api`
- D1 `adops_ops`
- Queue `adops-ops-queue`
- `ops/cloudflare-telegram-bot`

O smoke vivo atual provou que o fluxo legado ainda responde:

- evento sintetico novo entra;
- replay retorna `duplicate=true`;
- job fecha `completed` com `stageKey=needs_review`;
- runner observado: `runner-vps-1`.

Conclusao: a migracao precisa mover o control plane, nao apenas subir containers.

## Arquitetura alvo

```text
Cloudflare DNS/Tunnel
  -> adops-api.codigo5.com.br
  -> Mac Mini / Portainer / adops-api
       -> Postgres
       -> ops_jobs
       -> cod5_drive_events
       -> cod5_inbound_documents
       -> cod5_document_parse_runs
       -> runner local
       -> Telegram adapter local
       -> Drive monitor local
```

Cloudflare permitido:

- DNS.
- Tunnel.
- Access, se necessario.

Cloudflare removido como compute:

- Worker publico de fila.
- Worker Telegram.
- D1.
- Queue.

## Inventario de historico a migrar

### 1. Control plane Cloudflare D1

Tabelas:

- `ops_jobs`
- `cod5_drive_events`
- `cod5_inbound_documents`
- `cod5_document_parse_runs`

Chaves de dedupe:

- `ops_jobs.id`
- `cod5_drive_events.event_id`
- `cod5_inbound_documents.id`
- `cod5_document_parse_runs.id`

Indices equivalentes no Postgres:

- `ops_jobs(status, created_at)`
- `ops_jobs(kind, created_at)`
- `cod5_drive_events(drive_file_id, modified_time)`
- `cod5_drive_events(status, updated_at)`
- `cod5_inbound_documents(event_id)`
- `cod5_inbound_documents(status, updated_at)`
- `cod5_document_parse_runs(document_id, created_at)`

### 2. Banco canônico AdOps

Fonte atual:

- API privada/Portainer Postgres para dados ja migrados.
- Qualquer base legada ainda ativa precisa ser snapshotada antes do corte.

Tabelas criticas:

- campaigns
- insertions
- clients
- agencies
- sites
- capture rules
- capture proof logs
- operational document states
- print jobs

Regra:

- nao recriar campanha por PI se ja existe;
- nao recriar insercao por `campanha + site + formato + periodo`;
- nao recriar AdRotate se anuncio vivo ja existe.

### 3. Estado do monitor Drive

Fonte atual:

- container `adops-drive-pi-monitor`.
- state persistido no volume do container.

Migrar:

- `drive-pi-monitor-state.json`
- lista `items`
- `rootFolderId`
- `checkedAt`

Regra:

- preservar baseline para nao reenviar 83 itens antigos;
- no primeiro boot novo, fazer dry-run/check e exigir `0 evento(s) reenviado(s)` ou justificar cada evento.

### 4. Arquivos de evidencia e artefatos

Fontes:

- DigitalOcean Spaces `adops-prints`.
- logs locais/DB.
- relatorios em `docs/harness-reports/`.

Regra:

- nao baixar/reupar todos os prints sem necessidade;
- preservar URLs historicas;
- migrar metadata/logs, nao duplicar arquivo remoto.

## Plano por fases

## Fase 0 - Congelar contrato e preparar rollback

Objetivo:

Evitar que duas camadas escrevam ao mesmo tempo.

Acoes:

1. Documentar endpoints atuais.
2. Definir janela de corte curta.
3. Manter Worker/D1/Queue como rollback por 72h.
4. Nao ativar runner novo enquanto Worker antigo recebe eventos.
5. Criar flag:

```text
ADOPS_CONTROL_PLANE_PROVIDER=cloudflare|macmini
```

Aceite:

- rollback documentado;
- ninguem executa dois runners gravando a mesma fila.

## Fase 1 - Snapshot completo sem mutacao

Objetivo:

Capturar todo historico antes do corte.

Snapshots obrigatorios:

1. D1:
   - `ops_jobs`
   - `cod5_drive_events`
   - `cod5_inbound_documents`
   - `cod5_document_parse_runs`

2. Postgres AdOps:
   - schema;
   - contagens;
   - checksums por tabela critica;
   - ultimos 100 registros por tabela operacional.

3. Monitor Drive:
   - inspect do container;
   - state file;
   - logs recentes.

4. Telegram:
   - webhook atual;
   - rotas;
   - env names presentes/ausentes.

Comando esperado para D1, quando credencial Cloudflare estiver valida:

```bash
cd ops/cloudflare-public-api
npx wrangler d1 execute adops-ops --remote --command "SELECT COUNT(*) AS count FROM ops_jobs"
npx wrangler d1 export adops-ops --remote --output /tmp/adops_ops_d1_snapshot.sql
```

Se Wrangler continuar bloqueado:

- nao seguir para corte;
- usar Cloudflare dashboard/API com token valido;
- registrar bloqueio como credencial, nao como falha tecnica do Mac Mini.

Aceite:

- snapshot salvo em pasta timestampada;
- contagens registradas;
- nenhum segredo impresso.

## Fase 2 - Criar schema Postgres do control plane

Objetivo:

Ter equivalentes Postgres das tabelas D1.

Criar migration local:

```text
ops_jobs
cod5_drive_events
cod5_inbound_documents
cod5_document_parse_runs
```

Regras:

- mesmos IDs;
- JSON em `jsonb`, ou `text` se for manter compatibilidade simples;
- timestamps preservados;
- `ON CONFLICT DO NOTHING` para import idempotente;
- indices equivalentes.

Aceite:

- migration aplicada no Postgres Mac Mini;
- `SELECT COUNT(*)` retorna 0 antes do import;
- rollback: drop das tabelas novas sem tocar campanhas/insercoes.

## Fase 3 - Importar historico idempotente

Objetivo:

Migrar tudo sem duplicar.

Metodo:

1. Importar D1 snapshot para staging tables.
2. Validar campos obrigatorios.
3. Inserir em tabelas finais com:

```sql
ON CONFLICT (id) DO NOTHING
ON CONFLICT (event_id) DO NOTHING
```

4. Gerar relatorio:
   - total origem;
   - total staging;
   - inseridos;
   - ignorados por conflito;
   - divergencias.

Regra critica:

- conflito com conteudo diferente nao e "ok";
- deve ir para tabela/arquivo `migration_conflicts`.

Aceite:

- contagem destino == origem;
- conflitos com mesmo ID e payload diferente = 0;
- eventos Drive antigos nao reenfileirados.

## Fase 4 - Implementar API local de ops

Objetivo:

Mover rotas do Worker para `artifacts/api-server`.

Rotas a portar:

```text
POST /api/ops/drive-pi-events
POST /api/ops/drive-pi-events/status
GET  /api/ops/jobs
GET  /api/ops/jobs/:id/progress
GET  /api/ops/queue/overview
POST /api/ops/jobs/watchdog
POST /api/ops/runner/claim-next
POST /api/ops/runner/jobs/:id/progress
POST /api/ops/runner/jobs/:id/complete
POST /api/ops/runner/jobs/:id/fail
POST /api/ops/jobs/print-single
POST /api/ops/jobs/print-batch
POST /api/ops/jobs/print-backfill
POST /api/ops/jobs/sync-planilha
```

Mudanca principal:

- sem Cloudflare Queue;
- job novo entra direto como `ready_for_runner`;
- runner local faz polling no Postgres.

Regra:

- manter shape de resposta igual ao Worker enquanto o frontend/runner nao for refatorado.

Aceite:

- testes de contrato passam contra API local;
- replay de evento Drive retorna `duplicate=true`;
- job sintetico termina `needs_review`.

## Fase 5 - Migrar Telegram para Node no Mac Mini

Objetivo:

Tirar `ops/cloudflare-telegram-bot` do compute Cloudflare.

Opcoes:

1. Integrar rotas Telegram dentro de `adops-api`.
2. Criar `adops-telegram` Node pequeno no stack.

Recomendacao:

```text
Criar adops-telegram separado, mas usando a mesma API interna.
```

Motivo:

- reduz risco de derrubar API principal por webhook;
- permite rollback isolado.

Rotas:

```text
POST /telegram/webhook
POST /ops/drive-pi-event
```

Seguranca:

- token em env privado;
- webhook com secret path;
- nao expor chat ID em log.

Aceite:

- mensagem teste entregue;
- mensagem `intake_locked` entregue;
- sem Worker Telegram ativo recebendo o mesmo webhook.

## Fase 6 - Migrar runner e Drive monitor

Objetivo:

Runner e monitor usando somente API/Postgres do Mac Mini.

Passos:

1. Parar/pausar monitor standalone antigo.
2. Copiar `drive-pi-monitor-state.json`.
3. Ativar serviço do stack com o estado migrado.
4. Configurar:

```text
OPS_API_BASE_URL=https://adops-api.codigo5.com.br
PRIVATE_ADOPS_API_BASE_URL=http://adops-api:4011
DRIVE_PI_MONITOR_ENABLED=true
ADOPS_PI_AGENT_ENABLED=true
ADOPS_PI_AGENT_AUTO_APPLY=false inicialmente
ADOPS_DRIVE_PI_ALLOW_MUTATION=false inicialmente
```

5. Rodar monitor em modo observacao.
6. Depois habilitar auto-apply por site permitido.

Aceite:

- primeiro ciclo nao reenvia historico;
- logs mostram contagem estavel;
- evento sintetico passa por `intake_locked`.

## Fase 7 - Trocar DNS/Tunnel

Objetivo:

Cloudflare apenas roteia para Mac Mini.

Hostnames:

```text
adops-api.codigo5.com.br -> tunnel -> localhost:<porta api>
adops.codigo5.com.br -> tunnel -> localhost:<porta web>
adops-telegram.codigo5.com.br -> tunnel -> localhost:<porta telegram>
```

Regra:

- nao usar Worker route;
- nao usar Pages para painel novo;
- DNS/Tunnel pode ficar Cloudflare.

Aceite:

- `curl -I https://adops-api.codigo5.com.br/api/healthz` retorna 200;
- painel abre;
- webhook Telegram aponta para Mac Mini;
- Worker antigo nao recebe eventos novos.

## Fase 8 - Observacao 72h e desligamento gradual

Objetivo:

Confirmar que nada foi omitido e nada duplicou.

Monitorar:

- jobs por status;
- eventos Drive novos;
- duplicatas;
- Telegram enviado;
- evidencias geradas;
- erros de runner;
- comparativo D1 antigo x Postgres novo.

Desligar somente depois de 72h:

- Worker publico de ops;
- Worker Telegram;
- Queue;
- D1 como escrita.

Preservar:

- snapshot D1;
- logs de corte;
- docs de rollback;
- backup de volume Postgres.

## Regras anti-duplicidade

## Jobs

Chave:

```text
ops_jobs.id
```

Regra:

- nunca gerar novo job para evento importado;
- import preserva `id`;
- se payload divergir para mesmo `id`, bloquear corte.

## Drive events

Chave:

```text
event_id = drive:<fileId>:<modifiedTime>
```

Regra:

- replay retorna `duplicate=true`;
- nao cria job novo;
- nao envia Telegram inicial de novo.

## Inbound documents

Chaves:

```text
id
event_id
content_sha256
```

Regra:

- mesmo documento com mesmo hash nao duplica;
- hash diferente no mesmo evento vira conflito.

## Campanhas/insercoes

Chaves logicas:

```text
campaign: piCodigo + cliente + agencia + competencia
insertion: campanha + site + localFormato + periodo
```

Regra:

- vincular existente antes de criar;
- divergencia entra em `needs_review`.

## AdRotate

Chaves:

```text
adops_insertion_id
adops_external_key
adops_media_basename
site + groupId
```

Regra:

- anuncio vivo e correto deve ser vinculado;
- nao criar outro anuncio no mesmo slot.

## Harnesses obrigatorios

Antes do corte:

```bash
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
pnpm --dir scripts run harness:pi-automation-v3
pnpm --dir scripts run harness:drive-pi-monitor-v1
pnpm --dir scripts run test:drive-pi-event-flow
pnpm --dir scripts run audit:capture-rules-integrity
```

Depois da API local:

```bash
ADOPS_OPS_API_BASE_URL=https://adops-api.codigo5.com.br \
pnpm --dir scripts run test:drive-pi-event-flow
```

Novo harness a criar:

```bash
pnpm --dir scripts run harness:macmini-control-plane-migration
```

Esse harness deve validar:

- schema Postgres de ops existe;
- contagem D1 exportada == contagem Postgres importada;
- replay de evento antigo retorna duplicate;
- evento sintetico novo cria job;
- runner local processa;
- Telegram local entrega;
- Worker/D1 nao recebem escrita nova durante modo Mac Mini.

## Plano de rollback

Rollback durante 72h:

1. Pausar monitor/runner Mac Mini.
2. Restaurar webhook Telegram para Worker antigo.
3. Restaurar DNS/route para Worker antigo, se ainda necessario.
4. Reativar escrita no Worker/D1.
5. Importar para D1 apenas eventos criados no Mac Mini durante a janela, se houver.

Regra:

- rollback tambem precisa anti-duplicidade;
- nao apagar tabelas Postgres novas;
- marcar estado como `rollback_active`.

## Critérios de aceite final

Aceite tecnico:

- todos os snapshots existem;
- todas as contagens batem;
- conflitos = 0 ou revisados;
- API local responde;
- runner local processa;
- Drive monitor nao reenfileira historico;
- Telegram local entrega;
- evidencias continuam funcionando;
- painel abre.

Aceite operacional:

- nova pasta Drive gera Telegram inicial;
- operador ve que nao deve cadastrar manualmente;
- PI completa chega em `agent_analysis`;
- auto-apply so acontece quando flags e dedupe permitem;
- PI incompleta vira `needs_review` acionavel;
- nenhuma campanha/insercao/anuncio duplicado.

Aceite financeiro/infra:

- Cloudflare sem compute AdOps;
- Cloudflare apenas DNS/Tunnel/Access;
- Portainer mostra containers `running`;
- Uptime/monitoramento configurado ou pendencia explicita.

## Ordem recomendada de execucao

1. Criar migration Postgres do control plane.
2. Criar exporter D1 e importer Postgres.
3. Portar rotas ops do Worker para API Node.
4. Criar Telegram Node adapter.
5. Criar harness `macmini-control-plane-migration`.
6. Rodar snapshot e import em staging.
7. Fazer dry-run com evento sintetico.
8. Fazer corte curto.
9. Observar 72h.
10. Desativar Cloudflare compute.

## Decisao critica

Nao iniciar o corte se qualquer item abaixo estiver pendente:

- snapshot D1 indisponivel;
- credencial Cloudflare ausente para exportar historico;
- estado do monitor Drive nao copiado;
- webhook Telegram sem rollback;
- API local sem rotas equivalentes;
- import com conflito nao resolvido.

## Simulacao de nova PI em producao Mac Mini

Executado em 2026-06-03, apos migracao do control plane para Mac Mini.

Evento sintetico:

- `eventId`: `drive:cod5-simulacao-nova-pi-telegram-1780487739343:2026-06-03T11:55:39.342Z`
- `jobId`: `e1c262bb-02d9-4fbe-b451-e9de8cef07a8`
- `name`: `COD5 SIMULACAO NOVA PI TELEGRAM - sem PDF e sem midia`
- `mimeType`: `application/vnd.google-apps.folder`

Resultado:

- API publica Mac Mini aceitou o evento novo.
- Reenvio do mesmo `eventId` retornou `duplicate: true`.
- Runner `runner-1` processou o job.
- Status final: `completed`.
- Stage final: `needs_review`.
- Classificacao do pacote: `folder_empty`.
- Pendencias do pacote: `pi_pdf`, `media`.
- Validacao bloqueou mutacao por ausencia de `piCodigo`, campanha, competencia, cliente, agencia e insercoes.
- `syncPlanilha` e `reconcile` foram pulados corretamente porque nenhuma alteracao nova foi aplicada no AdOps.

Telegram:

- Adaptador Mac Mini `adops-telegram` foi criado para `/ops/drive-pi-event`.
- `adops-runner` alcança `http://adops-telegram:4022/healthz` pela rede Docker interna.
- Mensagem inicial enviada: `messageId=1005`.
- Mensagem final enviada: `messageId=1006`.

Flags observadas:

- `ADOPS_PI_AGENT_ENABLED=false`.
- `ADOPS_PI_AGENT_AUTO_APPLY=false`.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=false`.

Interpretação:

- O fluxo ja evita cadastro manual duplicado com Telegram inicial.
- O fluxo ja deduplica eventos repetidos.
- O fluxo ja identifica pasta sem PI e sem midia como revisao, sem travar a fila.
- A IA ainda nao executa em producao porque a flag esta desligada.
- Auto-apply segue bloqueado, como esperado para simulacao segura.

## Simulacao do gargalo IA/OpenAI

Executado em 2026-06-03, apos ligar o gate de IA no runner.

Evento sintetico:

- `eventId`: `drive:cod5-simulacao-ia-sem-chave-1780489603220:2026-06-03T12:26:43.216Z`
- `jobId`: `1af68f15-7c76-40a2-86d2-4137604f6083`
- `name`: `COD5 SIMULACAO IA SEM CHAVE - PI grafia ruim sem arquivos`

Resultado:

- API publica Mac Mini aceitou o evento novo.
- Reenvio do mesmo `eventId` retornou `duplicate: true`.
- Runner `runner-1` processou o job.
- Status final: `completed`.
- Stage final: `needs_review`.
- Classificacao do pacote: `folder_empty`.
- `agentAnalysis.skipped`: `OPENAI_API_KEY ausente`.
- Telegram inicial enviado: `messageId=1007`.
- Telegram final enviado: `messageId=1008`.
- Mutacao continuou bloqueada.

Flags observadas:

- `ADOPS_PI_AGENT_ENABLED=true`.
- `ADOPS_PI_AGENT_AUTO_APPLY=false`.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=false`.
- `OPENAI_API_KEY` ausente.

Interpretação:

- O gate de IA esta ligado.
- A fila nao trava quando a chave OpenAI esta ausente.
- A pendencia real para executar IA e configurar `OPENAI_API_KEY` no env privado do stack/runner.
- Auto-apply deve continuar `false` ate validar uma PI real com PDF ruim e conferencia humana.

Procedimento seguro para destravar:

1. Adicionar `OPENAI_API_KEY` no env privado do stack no Mac Mini.
2. Manter `ADOPS_PI_AGENT_ENABLED=true`.
3. Manter `ADOPS_PI_AGENT_AUTO_APPLY=false`.
4. Manter `ADOPS_DRIVE_PI_ALLOW_MUTATION=false`.
5. Reiniciar `adops-runner`.
6. Repetir simulacao com uma pasta real contendo PDF de PI ruim e midia.
7. So habilitar auto-apply depois de revisar `agentQuality`, citacoes e dedupe.

## OpenAI no Mac Mini

Atualizado em 2026-06-03.

Credencial:

- `OPENAI_API_KEY` copiada de projeto local existente para o env privado do deploy AdOps no Mac Mini.
- Caminho persistente local: `/Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env`.
- Valor nao deve ser impresso em log, chat, commit ou relatorio.

Estado do runner:

- `OPENAI_API_KEY=presente`.
- `ADOPS_PI_AGENT_ENABLED=true`.
- `ADOPS_PI_AGENT_AUTO_APPLY=false`.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=false`.
- `ADOPS_PI_AGENT_MODEL=gpt-4.1-mini`.

Simulacao validada:

- `eventId`: `drive:cod5-simulacao-openai-1780490335865:2026-06-03T12:38:55.864Z`
- `jobId`: `e50be402-542f-44fd-ba83-0cc74c3d327d`
- `agentAnalysis.ok=true`.
- `agentAnalysis.provider=openai`.
- `agentAnalysis.model=gpt-4.1-mini`.
- Telegram inicial enviado: `messageId=1009`.
- Telegram final enviado: `messageId=1010`.
- Mutacao automatica continuou bloqueada.

Interpretacao:

- OpenAI esta operacional no Mac Mini.
- IA ja responde de forma estruturada no fluxo Drive PI.
- A simulacao sem arquivos retornou campos nulos e `missingFields`, que e o comportamento correto.
- Proximo teste de qualidade precisa usar uma pasta real com PDF de PI ruim e midia, nao uma pasta vazia.

## Simulacao historica de falhas de cadastro

Atualizado em 2026-06-03.

Base analisada:

- Historico de `ops_jobs` do tipo `drive-pi-ingest`.
- Foco em jobs que terminaram em `needs_review` ou `failed`.
- Cenarios recorrentes: pasta vazia, midia sem PI, PI e midia em eventos separados, grafia divergente de portal/cliente/agencia e falha depois do cadastro.

Correcoes aplicadas no fluxo:

- API Mac Mini passou a aceitar `simulation.packageContext` em `/api/ops/drive-pi-events`.
- Runner passou a usar `simulation.packageContext` para simular pacotes Drive sem depender de arquivos reais.
- Runner ganhou alias operacionais para sites, clientes e agencias:
  - `SECOM`, `Governo`, `Gov MT` -> `Governo do Estado`.
  - `Município de Cuiabá`, `Prefeitura de Cuiabá`, `Pref CBA` -> `Prefeitura de Cuiabá`.
  - `TCE`, `TCE-MT`, `Tribunal de Contas` -> `TCE-MT`.
  - `SPM` -> `DMD`.
  - `Renca` -> `Renca`.
  - `Genius` -> `Genius`.

Resultados simulados com mutacao desligada:

| Cenario | Job | Resultado |
| --- | --- | --- |
| Pasta vazia historica | `0dac25dd-ccc6-4cc8-b93c-0b5017733be5` | `needs_review`, `folder_empty`, IA executou e nao travou |
| Apenas midia, sem PI | `32a5c145-5610-49e0-8c7d-5e88fa19bd7f` | `needs_review`, `missing_pi_pdf`, IA executou e nao travou |
| PI OMT 14414 com grafia divergente | `d945b5bc-744b-4f63-b131-5d6e6de67a1b` | IA leu PI, periodo e formato; validacao ficou `ok` |
| PI PNMT 25206091 com cliente/periodo historicamente problematicos | `04eef49d-9b56-4f93-be79-be46fcdaaa76` | IA leu PI, periodo e formato; alias resolveu cliente; validacao ficou `ok` |

Interpretacao:

- A IA esta preparada para os erros historicos de leitura/grafia que antes impediam cadastro.
- Pastas incompletas continuam bloqueadas corretamente em `needs_review`; isso e intencional.
- O fluxo nao deve cadastrar automaticamente quando nao houver PI ou midia suficiente.
- Com PI e midia presentes, a validacao agora passa nos casos historicos testados.

## Simulacao completa com cadastro e remocao

Atualizado em 2026-06-03.

Flags temporarias usadas apenas no canario:

- `ADOPS_PI_AGENT_AUTO_APPLY=true`.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`.

Evento canario:

- PI: `909990`.
- Campanha: `COD5 CANARIO AUTOAPPLY REMOVER`.
- Site: `A Folha Livre`.
- Formato: `MEGABANNER HOME 1 - 670x90px DIARIA`.
- Periodo: `2026-07-01` ate `2026-07-02`.
- Midia simulada: `cod5-canario-670x90.gif`.
- Job: `be534373-3b8b-4e9c-9e29-d404ecab9c6a`.

Resultado:

- IA leu os dados.
- Validacao passou.
- Cadastro foi iniciado com mutacao real.
- Campanha criada: `id=881`.
- Insercao criada: `id=1355`.
- Depois do cadastro, o job falhou no pos-processamento com `spawn pnpm ENOENT`.

Limpeza:

- Insercao canario `1355` removida.
- Campanha canario `881` removida.
- Conferencia posterior retornou zero registros para `pi_codigo=909990`.
- Flags seguras restauradas:
  - `ADOPS_PI_AGENT_AUTO_APPLY=false`.
  - `ADOPS_DRIVE_PI_ALLOW_MUTATION=false`.

Gargalo real encontrado:

- O problema nao e a IA.
- O problema nao e a criacao de campanha/insercao.
- O gargalo esta no runner do Mac Mini depois do cadastro.
- O runner chama `pnpm` para sincronizacao/reconcile, mas o container atual nao possui `pnpm` no `PATH`.

Proxima correcao obrigatoria antes de ligar auto-apply em producao:

1. Ajustar o runner para resolver `pnpm` com fallback via `corepack pnpm`.
2. Recriar `adops-runner`.
3. Repetir o canario completo.
4. Remover novamente os registros canario.
5. So entao avaliar ligar `ADOPS_PI_AGENT_AUTO_APPLY=true` em producao.

## Auto-apply ativo em producao

Atualizado em 2026-06-03.

Estado atual no Mac Mini:

- `adops-runner` recriado com rollback preservado: `adops-runner-backup-20260603T130911Z`.
- `adops-runner` esta rodando no Mac Mini.
- `adops-telegram` esta rodando no Mac Mini.
- `adops-drive-pi-monitor` esta rodando e verifica a pasta do Drive a cada 5 minutos.
- API publica `https://adops-api.codigo5.com.br/api/healthz` respondeu `{"status":"ok"}`.

Flags ativas no runner:

- `ADOPS_PI_AGENT_ENABLED=true`.
- `OPENAI_API_KEY=presente`.
- `ADOPS_PI_AGENT_AUTO_APPLY=true`.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`.
- `ADOPS_TELEGRAM_BOT_URL=http://adops-telegram:4022`.

Correcoes aplicadas:

- Runner agora resolve `pnpm` com fallback para `corepack pnpm`.
- Runner executa `pnpm` com `CI=true`, `npm_config_confirm_modules_purge=false` e `POLARS_SKIP_CPU_CHECK=1`.
- `uv`/`uvx` instalado no container `adops-runner`.
- Scripts de planilha passaram a chamar `agent-xlsx` com `click` e `polars[rtcompat]`.
- Telegram ganhou mensagens intermediarias para:
  - pacote identificado;
  - IA analisando;
  - IA concluida;
  - PI validada;
  - cadastrando campanha/insercao;
  - registros cadastrados;
  - evidencias conferidas;
  - sincronizando;
  - sincronizacao concluida;
  - reconcile falhou com cadastro preservado.
- Reconcile planilha/AdRotate deixou de derrubar o cadastro de nova PI quando falha por pendencia operacional externa.

Canario final:

- Job: `b6b47ece-d4e6-4063-88ae-72775a233cd1`.
- PI: `909993`.
- Campanha criada: `901`.
- Insercao criada: `1406`.
- `sync:planilha` executou com sucesso.
- Job finalizou como `needs_review`, nao como `failed`.
- Motivo do `needs_review`: evidencia nao foi gerada porque a insercao ficou sem midia publica valida apos sync.
- Telegram inicial confirmado: `messageId=1045`.
- Telegram final confirmado: `messageId=1054`.

Limpeza do canario:

- Insercao `1406` removida.
- Campanha `901` removida.
- Conferencia posterior retornou zero registros para `pi_codigo=909993`.

Pendencias reais restantes:

- A geracao de evidencia depende da midia publica real estar resolvida no cadastro/insercao.
- O reconcile planilha/AdRotate ainda depende de credenciais/rota SSH do Perrengue dentro do runner.
- `uv` instalado manualmente no container deve virar dependencia da imagem Docker do AdOps para sobreviver a recriacao completa de imagem.
