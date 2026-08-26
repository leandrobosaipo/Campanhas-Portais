# Rollout do scheduler canônico do Mac Mini — 2026-08-26

## Estado

Rollout ativo e em monitoramento. Este documento registra somente evidências confirmadas no runtime. Gates futuros permanecem pendentes até ocorrerem.

## Release ativo

- SHA: `665450f433571e7aff8c1f7d907a55213602c463`
- Fonte de decisão: API AdOps no Mac Mini (`scheduler.provider=macmini`)
- Worker público: proxy/shadow do control plane
- Telegram Worker: adaptador de entrega
- Timezone operacional: `America/Cuiaba`

## Runtime confirmado

- API, web e PostgreSQL saudáveis após o deploy.
- Três runners ativos: `runner-1`, `runner-print-single` e `drive-pi-monitor`.
- A API diferencia runners ativos (`count`) de registros históricos (`registeredCount`).
- API pública e API do Mac Mini apresentam o mesmo estado da fila.
- Reinícios do stack não recriaram o job matinal já reconciliado.
- OpenAPI de produção expõe status diário, incidentes, reconcile, claim, heartbeat e progresso com lease.
- Consulta remota somente leitura ao D1 confirmou `0` jobs criados após o primeiro cutover (`2026-08-26T19:21:26Z`); o último job legado é anterior ao corte.

## Canário de recuperação matinal

- Data alvo: `2026-08-25`
- `scheduleId`: `daily-print-morning-recovery:2026-08-25:08:00`
- `jobId`: `2b851259-e82c-44dc-b3b5-9a4e4a5302f3`
- Estado terminal: `failed`, com resultado parcial preservado
- Elegíveis: 9
- Auditadas: 4
- Inválidas: 5
- IDs inválidos: `2192`, `1861`, `2296`, `2712`, `2713`
- Código: `daily_print_audit_incomplete`
- Bloqueio observado em `2713`: `metadata_retro_content_unverified`
- Decisão de segurança: nenhuma evidência foi promovida sem comprovação editorial retroativa.

O status histórico de `2026-08-25` informa `nextRecoveryAt=null`; ele não promete uma janela pertencente a `2026-08-26`.

## Correções durante o rollout

1. Claim do runner passou a exigir `runnerId` e ao menos um tipo permitido, com filtro tipado no PostgreSQL.
2. Resultados parciais do `print-batch` são preservados no job que falha, incluindo resultado por inserção.
3. Próxima recuperação é calculada para a data alvo, sem reutilizar a janela do dia atual em consulta histórica.
4. OpenAPI passou a publicar os contratos do control plane.
5. Contagem de runners passou a diferenciar ativos de registros históricos.

## Deploy e rollback

- Deploy por volumes versionados e stack Portainer.
- Backup PostgreSQL criado antes de cada troca.
- Uma tentativa falhou antes da troca de stack por erro transitório de conexão e restaurou os volumes anteriores.
- Após readback saudável e fila vazia, uma única repetição controlada concluiu o deploy.
- Rollback preservado: selecionar os volumes versionados anteriores e `ADOPS_CONTROL_PLANE_PROVIDER=cloudflare` para retornar temporariamente ao caminho legado.

## Gates pendentes

- [ ] Reconciliação natural das 17h30 chega a estado terminal.
- [ ] Lote natural das 18h chega a estado terminal.
- [ ] Recuperações de 18h30 a 21h30 não criam jobs equivalentes concorrentes.
- [ ] Relatório das 22h15 chega a estado terminal e o consumidor público reflete o estado canônico.
- [ ] Recuperação/escalonamento de 08h00/08h30 é validada no próximo dia.
- [ ] Três ciclos, totalizando 72 horas, permanecem sem regressão.
- [ ] URLs, miniaturas, modal, downloads e filtro `evidence=missing` são validados no relatório público.
- [ ] Branch é integrada por worktree limpa sem tocar no checkout principal sujo.
- [ ] Monitor recorrente é desativado e o handoff final é publicado.

## Regra de encerramento

Não concluir por build, HTTP 200, job criado ou job em execução. Encerrar somente após estados terminais, auditoria, consumidor real, 72 horas e integração documentada.
