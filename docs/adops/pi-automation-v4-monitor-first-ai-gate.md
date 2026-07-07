# Plano - Drive PI monitor-first com agente IA

Atualizado em: 2026-06-12

## Status de rollout em 2026-06-03

Implementado localmente:

- Worker publico reconhece stage `intake_locked`.
- Telegram bot tem texto inicial para orientar o operador a nao cadastrar manualmente.
- Runner marca `intake_locked`, envia Telegram inicial e classifica pacote antes da IA.
- Runner bloqueia auto-apply quando o pacote nao tem PDF e midia suficientes.
- Runner retorna `reviewReasons`, `packageReadiness` e `dedupe` para deixar a revisao acionavel.
- Runner sincroniza a planilha oficial antes de aplicar mutacao automatica, para que a dedupe use a fonte canônica mais recente.
- Monitor ignora assets de evidencias retroativas para nao transformar PNG/ZIP/MP4 em intake de PI.
- Harness read-only `harness:drive-pi-monitor-first-v4` passa.

Validado vivo no fluxo legado:

- `ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow`
- evento sintetico retornou `202`;
- replay retornou `duplicate=true`;
- job fechou `completed` com `stageKey=needs_review` e `runnerId=runner-vps-1`, esperado para pasta sintetica sem PI real.

Bloqueio de deploy:

- `npx wrangler deploy` em `ops/cloudflare-public-api` e `ops/cloudflare-telegram-bot` falhou por autenticação Cloudflare `code: 10000`.
- Nao atualizar o runner/Portainer antes de publicar o Worker publico, porque o Worker antigo rejeita o novo status `intake_locked`.
- Para concluir o rollout, renovar autenticação do Wrangler ou fornecer `CLOUDFLARE_API_TOKEN` com permissão de deploy de Workers.

## Diagnostico

O fluxo atual ja observa o Drive, cria `drive-pi-ingest`, executa `agent_analysis` e termina em `needs_review` quando falta dado.

O problema operacional e o timing:

- o Telegram so avisa no fim do job;
- o operador pode cadastrar manualmente enquanto o runner ainda esta processando;
- pasta nova sem PI ou sem midia vira revisao, mas nao cria uma trava visivel de intake;
- algumas falhas historicas bloquearam o cadastro antes da regra de negocio.

## Erros historicos que impediram auto-cadastro

1. Worker recusou evento do monitor.
   - Sintoma: `Worker recusou evento: 500 erro`.
   - Causa: `drive-pi-ingest` fora da allowlist/filtro e log ruim por item.
   - Correcao ja feita: `OPS_JOB_KINDS`, smoke live e retry por item no monitor.

2. PI incompleta.
   - Sintoma: job terminava em `needs_review`.
   - Campos faltantes observados: `campanhaNome`, `competencia`, `clienteId`, `agenciaId`, `insertions`.
   - Decisao correta: nao criar campanha no chute.

3. Pasta sem PI real ou sem material suficiente.
   - Sintoma: evento processado, mas sem PDF/midia para extrair campos confiaveis.
   - Decisao correta: registrar intake e avisar Telegram, sem mutacao.

4. Ambiente local sem banco.
   - Sintoma: `DATABASE_URL must be set`.
   - Causa: rodar sync/backfill local sem preflight.
   - Decisao correta: tratar `DATABASE_URL` como preflight obrigatorio quando o fluxo precisar do banco local.

5. Sync da planilha falhando antes da regra de negocio.
   - Sintoma: `ModuleNotFoundError: No module named 'click'`.
   - Causa: `agent-xlsx` chamado sem dependencia explicita.
   - Correcao esperada: sempre usar `uvx --with click agent-xlsx ...` no runner.

6. Evidencia/captura bloqueando fechamento.
   - Sintomas: `slot_position_mismatch`, `capture_legibility_failed`, timeout em selector.
   - Decisao correta: cadastro pode ser preservado, mas evidencia fica `needs_review` quando midia/publicacao/capture rule nao convergem.

7. Monitor emitindo evidencias como PI nova.
   - Caso real: 2026-06-12, pasta de evidencias retroativas do PERRENGUE gerou fila de `drive-pi-ingest` e consumo de quota do Drive.
   - Sintoma: dezenas de PNG/ZIP de evidencia ficaram `ready_for_runner` antes da PI real do OMT ser processada.
   - Decisao correta: monitor deve ignorar assets dentro de paths de `evidencias`, exceto PDF ou pasta.

8. Auto-apply antes da planilha oficial.
   - Caso real: 2026-06-12, OMT PI 14589.
   - Sintoma: agente criou insercao #1616, depois a planilha sincronizou a canônica #1622.
   - Decisao correta: antes de mutar, rodar sync da planilha e repetir dedupe. Se a planilha já tiver uma campanha/insercao unica para PI+competencia, ela ganha.

## Acao recomendada

Refatorar para um fluxo em duas fases.

```text
Drive detectou pasta
  -> criar intake lock
  -> Telegram: "processo iniciado, nao cadastre manualmente"
  -> classificar pacote
  -> agente IA extrai campos
  -> validacao deterministica
  -> auto-apply seguro OU needs_review acionavel
  -> Telegram final com status e pendencias
```

## Mudancas propostas

### 1. Intake lock imediato

Criar um estado antes de `packaging`:

```text
observed -> intake_locked -> packaging -> agent_analysis -> validated -> applying -> applied|needs_review
```

Contrato:

- chave: `driveFileId` ou pasta raiz da PI;
- TTL operacional: 24h;
- motivo: evitar cadastro manual duplicado enquanto o runner decide;
- visivel no painel e no Telegram.

### 2. Telegram no inicio

Ao receber `folder_created` ou `created`, enviar:

```text
Nova pasta/arquivo detectado no Drive.
Processo automatico iniciado.
Nao cadastre manualmente ainda.
Status: conferindo PI e midia.
```

Nao esperar parse, PDF ou midia.

### 3. Classificador deterministico antes da IA

Classificar o pacote:

- `folder_empty`
- `missing_pi_pdf`
- `missing_media`
- `pi_and_media_present`
- `media_only`
- `pdf_only`
- `duplicate_event`

So chamar OpenAI quando houver texto/PDF/nome de arquivo suficiente.

### 4. Agente IA como extrator, nao executor

Usar OpenAI Responses API com Structured Outputs.

Entrada:

- texto extraido do PDF;
- nomes de arquivos;
- path da pasta;
- conhecimento versionado `spm-agent-knowledge.md`;
- snapshot resumido de sites/formatos permitidos.

Saida:

- JSON estrito;
- confianca;
- citacao curta;
- `missingFields`;
- `conflicts`;
- sugestao de classificacao, sem mutacao.

### 5. Gate de auto-apply

Auto-cadastro so quando todos passarem:

- PI PDF existe;
- midia existe no pacote ou ja existe anuncio/midia vinculavel no AdRotate;
- `piCodigo`, cliente/agencia/site/formato/periodo com citacao;
- dedupe sem conflito;
- sync da planilha oficial executado antes da mutacao;
- dedupe repetida depois do sync da planilha;
- rollout do site permitido;
- flags `ADOPS_DRIVE_PI_ALLOW_MUTATION=true` e `ADOPS_PI_AGENT_AUTO_APPLY=true`;
- preflight de banco/API/planilha ok.

Contrato atual do runner:

```text
packageReadiness.ok=true
validation.ok=true
rollout.ok=true
dedupe.ok=true
ADOPS_DRIVE_PI_ALLOW_MUTATION=true
ADOPS_PI_AGENT_AUTO_APPLY=true
syncPlanilha(mode=pre-apply-latest) ok
preApplyDedupe.ok=true
  -> applying

qualquer falha
  -> needs_review
```

Motivos padronizados em `reviewReasons`:

- `missing_pi_pdf`
- `missing_media`
- `needs_media`
- `dedupe_conflict`
- `invalid_insertions`
- `agent_quality`
- `rollout_blocked`
- `auto_apply_disabled`

`dedupe_conflict` deve bloquear mutacao quando houver campanhas ou insercoes concorrentes para a mesma PI/competencia/slot. Nao resolver criando nova campanha.

Quando houver uma unica campanha na planilha/AdOps para a mesma PI+competencia, o runner deve reutilizar essa campanha mesmo se o nome da campanha vier diferente no PDF. Nomes comerciais como `FEMINICIDIO` e nomes editoriais completos podem divergir; a fonte canônica continua sendo PI+competencia+planilha.

### 6. Monitor nao e fila de evidencias

O monitor do Drive PI observa a raiz operacional, mas nao deve enfileirar evidencia ja gerada como PI nova.

Regras:

- pasta pode gerar evento;
- PDF pode gerar evento;
- midia de pacote de PI pode gerar evento;
- PNG/JPG/WEBP/GIF/MP4/ZIP dentro de path de `evidencias` deve ser ignorado;
- item ignorado entra no log como `evidence_asset_not_pi_intake`;
- nenhum arquivo ignorado deve abrir `intake_locked`.

### 7. Fallback sem travar

Se faltar PI ou midia:

- manter intake lock;
- status `needs_review`;
- Telegram com pendencia objetiva;
- nao criar campanha;
- nao apagar state do monitor;
- retry quando a pasta mudar.

## Intake complementar por WhatsApp

WhatsApp pode iniciar rastreabilidade quando a operadora envia print/link antes da PI completa, mas nao vira fonte final de cadastro.

Uso permitido:

```bash
ADOPS_CREATE_SPM_PRINT_INTAKE=true \
OPS_API_TOKEN=presente \
pnpm --dir scripts run intake:spm-whatsapp-print-2026-06-03
```

Regras:

- usar somente para registrar fila e travar operacao manual duplicada;
- manter `piCodigo=null` quando o print nao mostra numero da PI;
- manter o job em `needs_review` ate PDF/Drive/planilha confirmarem dados;
- nao gerar campanha, insercao ou evidencia a partir do print sozinho;
- nao recriar os quatro intakes do print de 2026-06-03, pois ja foram criados e encerrados em `needs_review`.

## Riscos

- Auto-publicar sem PI completa duplica campanha e gera retrabalho.
- Auto-publicar antes do sync da planilha duplica campanha/insercao.
- Tratar evidencia retroativa como PI consome quota do Drive e atrasa PI real.
- Telegram cedo demais pode gerar ruido se nao houver dedupe de evento.
- IA sem schema estrito volta a inventar campo.
- Se o lock nao expirar, pode bloquear uma PI legitima.
- Se o fluxo final continuar avisando so `needs_review`, o operador ainda vai cadastrar manualmente por ansiedade.

## Como testar

1. Rodar contrato local:

```bash
pnpm --dir scripts run test:drive-pi-event-flow
pnpm --dir scripts run harness:drive-pi-monitor-v1
pnpm --dir scripts run harness:pi-automation-v3
```

2. Criar smoke novo `harness:drive-pi-monitor-first-v4` cobrindo:

- pasta nova vazia;
- pasta com PDF sem midia;
- pasta com midia sem PDF;
- pasta completa;
- evento duplicado;
- OpenAI ausente;
- OpenAI retorna campo sem citacao;
- auto-apply desligado;
- auto-apply ligado em fixture read-only.
- sync da planilha antes de mutar;
- dedupe repetida depois da planilha;
- monitor ignorando assets de evidencias.

3. Rodar smoke vivo opcional:

```bash
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
```

4. Validar Telegram:

- mensagem inicial entregue;
- mensagem final entregue;
- nenhum token/chat ID exposto;
- evento duplicado nao gera alerta duplicado.

## Impacto

- Custo: baixo a medio. A maior parte do fluxo ja existe.
- Performance: melhor, porque notifica no inicio e evita trabalho manual duplicado.
- Performance operacional: melhor, porque evidencia retroativa deixa de competir com PI real na mesma fila.
- Manutencao: melhora se o classificador for deterministico e pequeno.
- Seguranca: mantem IA sem poder de mutacao.
- ROI: alto. Reduz o principal gargalo humano: o usuario cadastrar manualmente porque nao sabe que o processo automatico ja comecou.

## Incidente OMT PI 14589 - 2026-06-12

Resumo:

- fonte oficial: PDF no Drive `PI 14589`, veiculo `SITE O MATOGROSSENSE`, periodo `13/06/2026` a `27/06/2026`;
- runner processou a PI e enviou Telegram;
- planilha sincronizada criou/revelou a insercao canônica #1622;
- insercao #1616 criada pelo agente antes da planilha foi cancelada como duplicidade;
- evidencia ficou pendente porque a insercao canônica ainda estava sem `mediaUrl` e a data de inicio era futura.

Regra permanente:

```text
Drive PI -> sync planilha -> dedupe com fonte oficial -> aplicar ou needs_review
```

Nao enviar confirmacao de "tudo certo" quando:

- `mediaUrl` estiver ausente;
- AdRotate ainda nao tiver publicacao;
- audit de capture rules estiver divergente;
- periodo ainda nao tiver iniciado;
- evidencia estiver `needs_media` ou `needs_review`.

## Implementacao minima

1. Adicionar estado `intake_locked` no Worker e no read model.
2. Enviar Telegram inicial em `createDrivePiEventJob` ou no inicio de `executeDrivePiIngest`.
3. Persistir `intakeLock` no `result_json`/documento inbound.
4. Adicionar classificador de pacote antes de `agent_analysis`.
5. Adicionar harness v4 read-only.
6. So depois habilitar auto-apply em producao para sites permitidos.
