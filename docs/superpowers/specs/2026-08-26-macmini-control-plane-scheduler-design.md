# Especificação canônica — scheduler do control plane no Mac Mini

**Data:** 2026-08-26  
**Base:** release `be813b5` (AdOps), migração operacional de 2026-06-03  
**Status:** design aprovado para implementação por fatias

## 1. Problema atual

O AdOps está em transição. A API/Postgres no Mac Mini já possui `/api/ops/*`, `ops_jobs`, runners e heartbeats. O Worker público Cloudflare ainda contém D1, Queue e cron que criam jobs, fazem claim e executam recuperação. O runner remoto consulta a API configurada e grava progresso. Assim, cron, Worker, API e runner podem tomar decisões parcialmente sobrepostas.

O risco principal é haver dois disparadores para a mesma rotina, um job criado sem consumidor, claim perdido sem watchdog ou estado intermediário que pareça sucesso. `queued`, `ready_for_runner` e `running` são estados observáveis; ausência de job, ausência de heartbeat e contagens ausentes não significam zero nem conclusão.

A migração de 2026-06-03 importou o histórico D1 para Postgres sem conflitos, validou deduplicação e deixou Cloudflare disponível como rollback por 72 horas. O destino desta especificação é concluir a ponte sem criar uma segunda fila, banco, tecnologia ou serviço.

## 2. Decisão canônica

O control plane do Mac Mini é a única fonte de verdade para agendamentos, decisões, jobs e estados operacionais.

| Componente | Responsabilidade | Não pode fazer |
|---|---|---|
| API AdOps + Postgres | Resolver agenda, deduplicar, criar/atualizar job, estado, recuperação e leitura canônica | Delegar decisão a D1/Queue |
| Cron do Mac Mini | Disparar uma chamada autenticada de reconciliação | Executar job ou criar job diretamente |
| Worker Cloudflare | Somente trigger temporário em shadow/cutover, se necessário | Ser control plane, gravar estado paralelo ou executar |
| D1/Queue Cloudflare | Rollback durante janela de migração | Receber tráfego normal após cutover |
| Runner | Claim exclusivo, heartbeat, execução e resultado terminal | Decidir agenda ou criar equivalente |
| Watchdog da API | Detectar claim/heartbeat expirado e aplicar política de recuperação | Reprocessar cegamente |
| Relatório | Consumir estado canônico e expor incidente | Inferir sucesso por horário |
| Telegram | Alertar transições deduplicadas | Ser fonte de estado |

Não existe segundo scheduler autônomo. A ponte é uma extensão das rotas e tabelas existentes; `ops_jobs` permanece o registro operacional.

## 3. Fluxo alvo

```text
configuração canônica
  -> cron Mac Mini (ou Worker em shadow/cutover)
  -> POST de reconciliação na API
  -> decisão idempotente por rotina/data/janela
  -> ops_jobs (job criado ou duplicate)
  -> ready_for_runner
  -> claim exclusivo pelo runner
  -> heartbeat periódico
  -> execução (runner principal/print)
  -> resultado terminal
  -> auditoria e evidências
  -> watchdog/recovery, se necessário
  -> alerta deduplicado
  -> relatório público
```

O cron chama uma única operação autenticada de reconciliação, sem escolher rotina nem enviar payload executável. Em produção, a API usa seu próprio relógio, consulta um registro de rotinas versionado no código da API e resolve data/janela em `America/Cuiaba`. Um instante explícito só é aceito em dry-run/teste autenticado. A resposta por ocorrência é `created`, `duplicate`, `not_due`, `blocked` ou `failed`, sempre com `jobId` quando houver job.

## 4. Contrato de dados

Usar `ops_jobs` e seu `payload_json`, `result_json`, `error_text`, `runner_id`, `created_at` e `updated_at`. Não criar tabela de agenda. Se uma coluna já existente não comportar o valor, o campo fica no JSON; migração de coluna só é permitida após prova de consulta frequente e necessidade de índice.

Payload mínimo canônico:

```json
{
  "scheduleId": "daily-print:2026-08-26:18:00",
  "routineKind": "daily-print",
  "targetDate": "2026-08-26",
  "timezone": "America/Cuiaba",
  "scheduledFor": "2026-08-26T22:00:00.000Z",
  "dispatchWindow": "18:00",
  "idempotencyKey": "daily-print:2026-08-26:18:00",
  "rootIdempotencyKey": "daily-print:2026-08-26:18:00",
  "parentJobId": null,
  "attempt": 1,
  "maxAttempts": 8,
  "nextRecoveryAt": null,
  "incidentLayer": null,
  "errorCode": null
}
```

O resultado deve conter `startedAt`, `completedAt`/`failedAt`, `durationMs`, `queueWaitMs`, `captureMs`, `auditMs`, `uploadMs`, `reportMs` quando aplicáveis, `failedInsertionIds`, contagens reais e IDs de evidências correlacionadas. Valores não medidos são `null`.

Campos de estado derivados ou já presentes devem ser lidos sem renomear o contrato público: `status`, `claimedAt` (ou equivalente no payload/result), `heartbeatAt`, `runnerId`, `completedAt`, `failedAt`, `attempt`, `maxAttempts`, `incidentLayer`, `errorCode`, `nextRecoveryAt` e `jobId`.

## 5. Máquina de estados

Estados de decisão da agenda: `not_scheduled`, `due`, `awaiting_recovery` e `blocked`. Estados persistidos de job permanecem compatíveis: `queued`, `ready_for_runner`, `running`, `completed` e `failed`. `cancelled` e `expired` são razões terminais estruturadas em `result_json`/`errorCode`, persistidas com `status=failed`, evitando ampliar o contrato público antes de todos os consumidores aceitarem novos valores.

Transições permitidas:

```text
not_scheduled -> due                  (scheduledFor atingido)
due -> ready_for_runner               (criação atômica)
due -> blocked                        (contrato, segurança ou dependência)
ready_for_runner -> running           (claim exclusivo)
running -> completed                  (resultado válido)
running -> failed                     (erro terminal ou limite atingido)
running -> failed/errorCode=expired   (claim/heartbeat expirado)
failed -> awaiting_recovery           (retry permitido e ainda não devido)
awaiting_recovery -> ready_for_runner (novo job-filho de tentativa autorizada)
qualquer não-terminal -> failed/errorCode=cancelled (cancelamento autenticado)
```

`skipped_existing` é resultado de uma decisão idempotente, não um estado de execução. `audited`, `failed` e `blocked_reconstruction` são resultados por inserção dentro do job de lote. Um job pai só é `completed` quando sua auditoria requerida está completa; caso contrário é `failed` ou `blocked` com resultados parciais preservados.

## 6. Idempotência e concorrência

- A chave-base canônica é `routineKind + targetDate + dispatchWindow`; o valor exato fica em `rootIdempotencyKey`. A tentativa inicial usa a mesma chave em `idempotencyKey`; retries usam `rootIdempotencyKey + ":attempt:" + attempt`.
- A API deve fazer criação atômica, usando a proteção de unicidade/deduplicação já existente em `ops_jobs`; a resposta de replay retorna o mesmo `jobId` e não reescreve evidência auditada.
- Cron Mac Mini, Worker em shadow e reexecução manual podem chamar a API, mas somente a primeira chamada cria o job.
- Claim usa atualização condicional de `ready_for_runner`; exatamente um runner recebe `running`.
- O runner envia heartbeat dentro do intervalo configurado. O watchdog considera expirado somente após a tolerância documentada maior que um intervalo de heartbeat e consulta o último estado antes de recuperar.
- Um job expirado ou falho permanece terminal e imutável. O retry autorizado cria um job-filho com novo `jobId`, `parentJobId`, tentativa incrementada e chave idempotente estável. O filho só pode nascer quando não existe outro job ativo com a mesma `rootIdempotencyKey`; assim, histórico e resultados prévios são preservados.
- Retry é limitado por `maxAttempts`, classificado por `incidentLayer/errorCode` e nunca automático para bloqueio de segurança, contrato inválido ou evidência já auditada.
- Um retry manual deve informar motivo e usar a mesma chave-base com sufixo de tentativa operacional, nunca criar rotina equivalente concorrente.

## 7. Fuso e calendário

`America/Cuiaba` é obrigatório para decidir data, janela, virada de dia e recuperação do dia anterior. Instantes persistidos e enviados entre serviços são ISO-8601 UTC. A API converte UTC para Cuiabá antes de comparar `scheduledFor`, `dispatchWindow` ou `targetDate`.

As janelas editoriais são interpretadas no relógio de Cuiabá: lote normal às 18:00; recuperações no mesmo dia às 18:30, 19:00, 19:30, 20:00, 20:30, 21:00 e 21:30; relatório às 22:15; recuperação do dia anterior às 08:00; escalonamento às 08:30. O trigger pode ocorrer em qualquer minuto, mas a API é a autoridade sobre a janela. Testes devem cobrir UTC próximo da meia-noite e mudança de ano/mês.

## 8. Falhas e recuperação

Cada falha registra camada, código estável, mensagem sanitizada, `scheduleId`, `jobId`, `runnerId`, `attempt` e próximo passo. Camadas: `scheduler`, `api`, `postgres`, `queue_legacy`, `runner`, `browser`, `capture`, `audit`, `upload`, `report` e `external`.

Falha de uma inserção não aborta as demais; lote conserva resultado parcial e IDs acionáveis. Recuperação diária consulta a auditoria canônica, seleciona somente faltantes/invalidas e não cria job quando a data já está completa. Recuperação matinal usa `candidate=true`, `promote=true` e `reconstructionReason=late_publication_recovery`; promoção exige regra publicada autorizando reconstrução e checklist final aprovado. Sem autorização, fica `blocked` e gera incidente, nunca print fabricado.

## 9. Migração e cutover

1. Snapshot e reconciliação de D1, Postgres, `ops_jobs`, eventos, documentos, evidências e estado do monitor.
2. Ativar `ADOPS_CONTROL_PLANE_PROVIDER=macmini` na API/runner e manter Worker/D1/Queue somente como rollback.
3. Em shadow, Worker pode chamar a API, mas a chamada é marcada como observação e não cria job; comparar decisões, chaves e horários por pelo menos um ciclo completo.
4. Canário: uma rotina diária e uma recuperação, confirmando criação única, claim, heartbeat, estado terminal e consumidor real.
5. Cutover: cron Mac Mini é o único trigger com mutação; Worker deixa de criar jobs. Confirmar ausência de jobs Cloudflare novos e presença dos equivalentes no Postgres.
6. Monitorar por 72 horas. Remover compute/D1/Queue somente após reconciliação de contagens, nenhum job ativo legado e rollback testado/documentado.

Rollback: congelar o disparador Mac Mini, preservar jobs e evidências já auditados, apontar provider para `cloudflare` e habilitar o caminho antigo somente se o snapshot e a janela operacional permitirem. Não executar os dois providers em modo de escrita. Após rollback, investigar o erro e reconciliar por `idempotencyKey` antes de novo cutover.

## 10. Segurança

Mutação exige a autenticação existente e autorização por rota. O trigger de produção não escolhe `routineKind`, data, janela ou payload: esses valores vêm do registro versionado na API. A API não aceita comando shell, URL arbitrária, imagem arbitrária ou credencial. Tokens ficam em secret store/env com permissões restritas, nunca em Git, logs, payloads de relatório ou respostas.

Runner tem menor privilégio, permite apenas os `kind`s configurados e não pode alterar outro `jobId`. Webhook/trigger Cloudflare em shadow é autenticado e não grava D1. Logs removem Authorization, cookies, tokens, QR e conteúdo sensível.

## 11. Observabilidade e operação

Expor na API de fila, sem fabricar zeros:

- rotina esperada e última decisão;
- jobs criados, duplicados evitados e bloqueados;
- latência de agendamento, tempo em fila, duração e heartbeat;
- sucesso, falha, retry, recuperação e resolução;
- último heartbeat por runner, versão, capacidades e erro;
- `nextRecoveryAt`, `failedInsertionIds`, `incidentLayer` e `errorCode`.

Ausência de runner ou métrica é `null`/`unknown`. Logs correlacionam `scheduleId`, `idempotencyKey`, `jobId`, `runnerId`, data e tentativa. Telegram envia uma mensagem na primeira falha, atualiza apenas quando a lista de pendências muda, informa fechamento e escala às 08:30 quando ainda bloqueado. O relatório lê a API Mac Mini e diferencia não publicado, obrigatório faltante, inválido, recuperação em andamento e bloqueio de segurança.

## 12. Critérios objetivos de aceite

1. Uma chamada repetida para a mesma rotina/data/janela retorna o mesmo `jobId` ou `duplicate=true`, sem job concorrente.
2. Worker shadow não altera estado; cron Mac Mini altera uma única vez.
3. API resolve corretamente todas as janelas em `America/Cuiaba`, inclusive virada UTC/data.
4. Dois runners concorrentes resultam em um único claim `running`.
5. Claim sem heartbeat termina com `errorCode=expired`; a recuperação limitada cria um único job-filho e preserva o histórico do job anterior.
6. Falha de uma inserção deixa as demais processáveis e registra resultado por inserção.
7. Job concluído ou falho e decisão bloqueada têm readback verificável; cancelamento e expiração aparecem como `status=failed` com código estruturado.
8. Auditoria completa é requisito para `completed`; ausência é `null/unknown`, nunca sucesso ou zero.
9. Recuperação matinal promove somente reconstrução explicitamente autorizada e aprovada.
10. API, runner, watchdog, relatório e Telegram exibem os IDs/códigos correlacionados sem segredo.
11. Canário real valida job, claim, heartbeat, artefato, auditoria e consumidor público.
12. Rollback alterna provider sem dupla escrita; após 72 horas, a decisão de remoção do caminho antigo é sustentada por contagens e jobs terminais.

## Limites deliberados

Não há novo scheduler, fila, banco, container, dashboard ou dependência. A agenda não ganha tabela própria: a API reconcilia janelas determinísticas e `ops_jobs` registra o trabalho. Se a consulta por agenda futura exigir indexação que o JSON não suporte, primeiro medir no Postgres e só então propor uma migração reversível; até lá, o limite é aceito e observado.
