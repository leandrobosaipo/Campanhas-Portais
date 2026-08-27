# Runbook — scheduler canônico no Mac Mini

> Estado: em rollout controlado de 72 horas
> Timezone editorial: `America/Cuiaba`
> Autoridade: API AdOps + PostgreSQL no Mac Mini
> Evidências do rollout: `docs/adops/macmini-control-plane-scheduler-rollout-2026-08-26.md`

## Contrato

O runner local chama `POST /api/ops/schedules/reconcile`. O caller não escolhe data, rotina ou comando. A API calcula a janela e cria no máximo um job por `routineKind + targetDate + dispatchWindow`.

Janelas: 08h00 recuperação de ontem; 08h30 escalonamento; 17h30 reconciliação de publicação; 18h00 lote diário; 18h30–21h30 recuperações; 22h15 relatório mensal. A última janela operacional continua elegível até a seguinte, evitando perda por reinício ou job longo. Relatório perdido após 22h15 pode ser recuperado até 08h.

Durante as 72 horas de migração, o Worker Telegram continua somente como adaptador de entrega. Ele não decide mais o horário: consulta `GET /api/ops/daily-print-alerts/evaluate` e envia apenas quando a API do Mac Mini responde `due=true`.

`GET /api/ops/queue/overview` mostra `scheduler.provider`, timezone, próxima decisão, todas as decisões do dia, jobs ativos, contagens reais e heartbeat dos runners. Dado ausente aparece como `null`.

## Cutover

1. Confirmar zero job ativo e exportar snapshot do D1/Postgres.
2. Aplicar `ops/portainer/adops-stack/migrations/2026-08-26-daily-print-alerts.sql` no Postgres.
3. Publicar API e runners com `ADOPS_CONTROL_PLANE_PROVIDER=macmini` e `OPS_API_BASE_URL=http://adops-api:4011`.
4. Validar health, overview, heartbeat e reconcile em `dryRun`.
5. Publicar o Worker em modo `macmini`; ele apenas encaminha `/api/ops/*` e executa shadow sem escrita D1.
6. Acompanhar o primeiro job real pelo mesmo `scheduleId` e `jobId` até `completed` ou `failed`.
7. Manter D1/Queue intactos por 72 horas, sem escrita normal.

## Aceite do canário

- um `scheduleId` produz um único `jobId`;
- claim pertence a um runner;
- heartbeat avança durante job longo;
- estado terminal e resultados parciais permanecem no Postgres;
- evidência auditada não muda de URL;
- relatório/Telegram leem o estado canônico;
- Worker shadow não grava D1.
- Telegram recebe data, escalonamento e decisão de envio da API canônica.

## Monitoramento durante as 72 horas

Em cada janela, confirme o SHA público, containers saudáveis, `scheduler.provider=macmini`, timezone, fila e heartbeat antes de avaliar o job. Acompanhe o mesmo `jobId` até `completed` ou `failed`; `queued`, `ready_for_runner` e `running` não encerram a validação.

Para prints, valide também `GET /api/ops/daily-print-status?date=AAAA-MM-DD`, `capture-proof/status` de uma amostra e o relatório público. Ausência de contagem ou heartbeat é `null`/`unknown`, nunca zero. Não crie retry quando a auditoria já estiver completa.

O relatório agendado não cria pacotes opcionais. Um `pi-site-export` solicitado manualmente reutiliza somente evidência final auditada, alcançável e sem bloqueios; ele não corrige nem reconstrói prints.

## Troubleshooting

| Sinal | Verificação | Ação segura |
| --- | --- | --- |
| job sem progresso | heartbeat, dono do lease e timeout do tipo | aguardar watchdog; não criar job concorrente |
| runner interrompido por deploy | heartbeat anterior à troca e release ativo | terminar como `runner_interrupted`, preservando resultado parcial |
| checklist bloqueado | `blockingIssues`, `incidentLayer` e `errorCode` | corrigir a causa observada; não tratar como transporte |
| reconstrução retroativa bloqueada | regra publicada e prova editorial | manter incidente aberto; nunca promover sem autorização e checklist final |
| timeout do Portainer | stack persistida, volumes, containers, health e SHA | aceitar somente após readback; restaurar volumes anteriores se divergente |
| relatório parcial | estado diário canônico, último job e próxima recuperação | publicar o incidente sem apresentar estado parcial como normal |

## Encerramento e handoff

Somente finalize após três ciclos naturais, 08h00/08h30, fila vazia, jobs terminais, SHA ativo, consumidor público e rollback confirmados. Registre IDs, horários, incidentes e resolução no documento de rollout. Integre a branch apenas em worktree limpa e contra um alvo Git explicitamente reconciliado; não use o checkout principal quando contiver alterações alheias.

## Rollback

1. Parar os triggers/runners do Mac Mini antes de habilitar o legado.
2. Definir `ADOPS_CONTROL_PLANE_PROVIDER=cloudflare` na API/Worker e republicar o release anterior.
3. Confirmar que não existe job ativo no Postgres para a mesma rotina/data.
4. Reativar o cron legado somente após essa conferência.

Nunca mantenha os dois providers em escrita ao mesmo tempo. Não apague D1/Queue durante as 72 horas de observação.
