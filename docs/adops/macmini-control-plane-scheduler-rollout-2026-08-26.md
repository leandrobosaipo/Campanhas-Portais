# Rollout do scheduler canônico do Mac Mini — 2026-08-26

## Estado

Rollout ativo e em monitoramento. Este documento registra somente evidências confirmadas no runtime. Gates futuros permanecem pendentes até ocorrerem.

## Release ativo

- SHA: `ae62c02e27b1c034f8034099e7ec29f57eb26d44`
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

## Canário natural de reconciliação

- Janela: `2026-08-26 17:30 America/Cuiaba`
- `scheduleId`: `campaign-publication-reconcile:2026-08-26:17:30`
- `jobId`: `1792adab-3891-4f4f-b3e9-7e9eb8609662`
- Runner: `drive-pi-monitor`
- Estado terminal: `completed`
- Ações planejadas/concluídas: `3/3`
- Bloqueios do agendador: `0`
- Resultado operacional: as três PIs foram preservadas em `needs_review` por problemas próprios de processamento de mídia; nenhuma foi publicada automaticamente sem os requisitos necessários.
- Após o término, a fila ficou vazia e a próxima decisão canônica passou para o lote das 18h.

## Correções durante o rollout

1. Claim do runner passou a exigir `runnerId` e ao menos um tipo permitido, com filtro tipado no PostgreSQL.
2. Resultados parciais do `print-batch` são preservados no job que falha, incluindo resultado por inserção.
3. Próxima recuperação é calculada para a data alvo, sem reutilizar a janela do dia atual em consulta histórica.
4. OpenAPI passou a publicar os contratos do control plane.
5. Contagem de runners passou a diferenciar ativos de registros históricos.
6. O refresh incremental do relatório passou a manter uma chave estável por competência: aprovações coalescem em um job ainda aguardando, mas criam um único sucessor quando o relatório anterior já está executando.
7. A primeira recuperação das 18h30 criou o job desnecessário `95a1c303-8927-4126-856f-fa298e39dac1`, que apenas preservou as oito evidências existentes. A decisão passou a consultar a mesma elegibilidade do runner e a auditoria final dos mesmos IDs antes de criar uma recuperação.
8. O gate falha aberto para a recuperação (`due=true`) quando a auditoria está indisponível, exige cardinalidade exata entre candidatos e auditados e limita cada `HEAD` a dez segundos.
9. O resultado do gate é reutilizado por janela; a recuperação matinal reavalia a cada cinco minutos até 08h30 para detectar publicação tardia.

## Lote natural das 18h

- Data alvo: `2026-08-26`
- `scheduleId`: `daily-print:2026-08-26:18:00`
- `jobId`: `742044b2-cfcc-4ac2-8d6a-3fe0294bd08d`
- Runner: `runner-1`
- Estado terminal: `completed`
- Duração real: `448903 ms`
- Elegíveis/aprovadas: `8/8`
- Capturadas: `6`
- Preservadas como `skipped_existing`: `2`
- Ausentes/inválidas/falhas: `0/0/0`
- Auditoria canônica: `expected=8`, `approved=8`, `missing=0`, `invalid=0`
- O status diário removeu corretamente a recuperação: `nextRecoveryAt=null`.

Durante o lote, seis aprovações atravessaram minutos diferentes e criaram seis refreshes incrementais do relatório. Eles foram drenados serialmente e terminaram sem erro. A causa foi a chave de idempotência conter o minuto. O hotfix foi escrito com teste vermelho, passou por revisão independente e coalesce somente jobs ainda aguardando; um job já `running` recebe no máximo um sucessor para não perder evidência aprovada depois do snapshot.

## Hotfix de coalescência do relatório

- Release: `08f453d3c77d634a05642860971c625aefe81cfc`
- Backup: `adops-before-08f453d3c77d-20260826T221434Z.sql.gz`
- API, web, PostgreSQL e monitor do Drive: `running/healthy`
- Runners principal e individual: `running`
- Canário aguardando: duas chamadas retornaram o mesmo job `9c923dce-f6c7-4631-b316-27914a27319c`; a primeira criou e a segunda coalesceu.
- Canário durante execução: duas chamadas criaram/reutilizaram um único sucessor `7af631fd-cd90-4358-b5e3-0bcd4d2247ee` enquanto o primeiro estava `running`.
- Ambos os jobs chegaram a `completed`.
- O `notBefore` persistido foi preservado nas respostas duplicadas.

## Gate de recuperação completa

- Release: `ae62c02e27b1c034f8034099e7ec29f57eb26d44`
- Backup: `adops-before-ae62c02e27b1-20260826T224714Z.sql.gz`
- O readback da janela já vencida de 18h30 retornou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null` e nenhum job criado.
- O canário natural das 19h retornou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null` e nenhum job criado.
- A consulta ao histórico confirmou zero registros com `scheduleId=daily-print-recovery:2026-08-26:19:00`.
- A fila permaneceu vazia e os três runners mantiveram heartbeat recente.

## Readback incremental do relatório público

- Às `18:24:12 America/Cuiaba`, o relatório público já refletia o lote natural `742044b2-cfcc-4ac2-8d6a-3fe0294bd08d`.
- A rotina diária passou a mostrar `8 de 8` aprovadas, `0` ausentes e `0` inválidas.
- O resumo passou a mostrar `0` campanhas com prints atuais pendentes.
- As pendências históricas de 24/08 e 25/08 continuaram separadas como retroativas; nenhuma foi convertida silenciosamente em sucesso.
- O consumidor respondeu HTTP 200 com `cache-control: no-store`. O readback definitivo de miniaturas, modal, downloads e filtro permanece reservado ao job natural das 22h15.

## Readback das evidências e da interface

- As oito inserções elegíveis (`2692`, `2693`, `2192`, `1861`, `2712`, `2713`, `1842`, `2278`) retornaram `status=audited`, `checklistValidation.approved=true`, `evidenceStatus=approved`, zero bloqueios e artefato HTTP 200 para 26/08.
- O filtro público `evidence=missing` com publicações ativas renderizou `Nenhuma campanha encontrada`, sem ocultar as pendências históricas quando o filtro é removido.
- A miniatura de `#2713` para 26/08 foi renderizada e abriu o modal com a imagem, data, navegação e links operacionais.
- O download de `#2713` respondeu HTTP 200 como `image/jpeg`, progressive JPEG de `1600x1337`, com `216974` bytes e nome de arquivo operacional.
- O navegador não registrou erros de console durante o fluxo.
- O relatório continua classificando 24/08 e 25/08 como evidências inválidas; isso é o bloqueio auditado de reconstrução, não uma ausência silenciosa da evidência válida de 26/08.

## Reconciliação explícita de 24/08 e 25/08

- A auditoria atual de cada data encontra `11` elegíveis, `4` aprovadas, `0` ausentes e `7` inválidas.
- A cardinalidade atual é maior que a do job matinal original (`9`) porque a auditoria viva passou a considerar também `1860` e `1944`; o resultado do job original foi preservado e não foi reescrito.
- Em ambas as datas, os IDs bloqueados são `1860`, `1861`, `1944`, `2192`, `2296`, `2712` e `2713`.
- Todos os sete artefatos estão acessíveis, mas o checklist final reprova com `metadata_retro_content_unverified`: não há amostras editoriais retroativas válidas (`empty_samples`, `0/0`).
- A causa é explícita e acionável. Nenhuma dessas reconstruções pode ser promovida sem a prova editorial exigida pela regra publicada.

## Deploy e rollback

- Deploy por volumes versionados e stack Portainer.
- Backup PostgreSQL criado antes de cada troca.
- Uma tentativa falhou antes da troca de stack por erro transitório de conexão e restaurou os volumes anteriores.
- Após readback saudável e fila vazia, uma única repetição controlada concluiu o deploy.
- Rollback preservado: selecionar os volumes versionados anteriores e `ADOPS_CONTROL_PLANE_PROVIDER=cloudflare` para retornar temporariamente ao caminho legado.

## Gates pendentes

Linha de base do consumidor antes do job das 22h15: HTTP 200, `cache-control=no-store`, atualizado em `26/08/2026 12:31:01`. O HTML ainda mostra o job original de 25/08 (`0/9`) e a antiga promessa de recuperação às 18h30; portanto o consumidor permanece explicitamente pendente de regeneração e readback após o job natural.

- [x] Reconciliação natural das 17h30 chega a estado terminal.
- [x] Lote natural das 18h chega a estado terminal.
- [ ] Recuperações de 18h30 a 21h30 não criam jobs equivalentes concorrentes.
- [ ] Relatório das 22h15 chega a estado terminal e o consumidor público reflete o estado canônico.
- [ ] Recuperação/escalonamento de 08h00/08h30 é validada no próximo dia.
- [ ] Três ciclos, totalizando 72 horas, permanecem sem regressão.
- [ ] URLs, miniaturas, modal, downloads e filtro `evidence=missing` são validados no relatório público.
- [ ] Branch é integrada por worktree limpa sem tocar no checkout principal sujo.
- [ ] Monitor recorrente é desativado e o handoff final é publicado.

## Regra de encerramento

Não concluir por build, HTTP 200, job criado ou job em execução. Encerrar somente após estados terminais, auditoria, consumidor real, 72 horas e integração documentada.
