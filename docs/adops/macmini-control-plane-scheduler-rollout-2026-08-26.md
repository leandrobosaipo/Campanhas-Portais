# Rollout do scheduler canônico do Mac Mini — 2026-08-26

## Estado

Rollout ativo e em monitoramento. Este documento registra somente evidências confirmadas no runtime. Gates futuros permanecem pendentes até ocorrerem.

## Release ativo

- SHA: `02093aadb0eb672aecc97fa5e47f77fc571ba54e`
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
10. A telemetria do `print-batch` passou a separar fila, captura, upload e auditoria sem converter tempos ausentes em zero (`18ece9a28ebbfb4c0afb00559b08f7b34936f3bd`).
11. O corte revelou que `campaign-evidence-export` já estava no compose, runner e Worker, mas faltava no allowlist da API canônica. O release `02093aadb0eb672aecc97fa5e47f77fc571ba54e` alinhou tipo, allowlist, labels e timeout longo; o claim permaneceu fechado para tipos desconhecidos.
12. O alerta das 18h45 consultou a auditoria genérica e reivindicou um falso incidente para `#1860` (`9` elegíveis), enquanto o lote canônico estava completo em `8/8`. O Worker do Telegram passou a consumir `/api/ops/daily-print-status`, já encaminhado ao Mac Mini pelo roteamento global quando provider=`macmini`; o fallback D1 continua disponível no rollback `cloudflare`.

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
- O canário natural das 19h30 também retornou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null`; nenhum registro com `scheduleId=daily-print-recovery:2026-08-26:19:30` foi persistido.
- Após a janela natural das 20h, o reconcile idempotente confirmou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null` e `nextRecoveryAt=null` para `daily-print-recovery:2026-08-26:20:00`. A consulta ao histórico retornou zero jobs desse `scheduleId`.
- Após a janela natural das 20h30, o mesmo gate confirmou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null` e zero jobs persistidos para `daily-print-recovery:2026-08-26:20:30`.
- Após a janela natural das 21h, o gate confirmou `auditGateEvaluated=true`, `outcome=not_due`, `jobId=null` e zero jobs persistidos para `daily-print-recovery:2026-08-26:21:00`.
- A fila permaneceu vazia e os três runners mantiveram heartbeat recente.

## Observabilidade de estágios e correção do runner de exportação

- Release de timings: `18ece9a28ebbfb4c0afb00559b08f7b34936f3bd`.
- Backup: `adops-before-18ece9a28ebb-20260826T233120Z.sql.gz`.
- Os estágios públicos persistem somente `stage`, `status`, `startedAt`, `finishedAt` e `durationMs`; ausências permanecem `null`.
- Após esse deploy, o log do runner individual mostrou a rejeição repetida do pool `campaign-evidence-export` pela API canônica. A causa foi localizada no allowlist, não no transporte nem na fila.
- Release corretivo: `02093aadb0eb672aecc97fa5e47f77fc571ba54e`.
- Backup: `adops-before-02093aadb0eb-20260826T234314Z.sql.gz`.
- O timeout preserva o contrato anterior: `30` minutos enquanto aguarda e `120` minutos em execução.
- Readback após o deploy: API, PostgreSQL e web saudáveis; runners principal e individual ativos. O runner individual passou a registrar `nenhum job pronto` para o pool de exportação, sem o erro de tipo inválido.
- Revisão independente encontrou o drift de timeout antes do deploy; após a correção, não restou P0/P1.

## Correção do universo do alerta Telegram

- Commit: `28dc8cae342a21985ec9295f071e999e1b26d757`.
- Worker: `adops-telegram-bot`, versão `247dc403-4b44-41e5-8ea4-8c846587e23f`.
- O teste vermelho reproduziu a consulta indevida a `capture-proof/audit`; o contrato passou a exigir `daily-print-status` e `failedInsertionIds` canônicos.
- Testes: scheduler `33/33`, contratos/observabilidade `16/16` e typecheck oficial do Telegram aprovados.
- Revisão independente bloqueou um primeiro proxy redundante que quebraria o rollback; a versão publicada usa somente o roteamento global por provider.
- Readback público após o deploy: `expected=8`, `approved=8`, `missing=0`, `invalid=0`, `status=completed`.
- O cron natural das 20h15 reivindicou `resolved` com `pending_ids=[]`; o falso claim anterior `recovery_in_progress:[1860]` foi preservado como trilha de auditoria.
- Os crons posteriores não criaram outro fingerprint: a tabela permaneceu com exatamente uma reivindicação de incidente e uma de resolução, comprovando deduplicação sem spam enquanto a lista não mudou.
- Health do bot confirmou username, webhook base e notificações configurados. A tabela comprova deduplicação/disparo; a confirmação visual no grupo do Telegram não é observável pela API do bot e permanece como limite explícito da evidência.

## Readback incremental do relatório público

- Às `18:24:12 America/Cuiaba`, o relatório público já refletia o lote natural `742044b2-cfcc-4ac2-8d6a-3fe0294bd08d`.
- A rotina diária passou a mostrar `8 de 8` aprovadas, `0` ausentes e `0` inválidas.
- O resumo passou a mostrar `0` campanhas com prints atuais pendentes.
- As pendências históricas de 24/08 e 25/08 continuaram separadas como retroativas; nenhuma foi convertida silenciosamente em sucesso.
- O consumidor respondeu HTTP 200 com `cache-control: no-store`. O readback definitivo de miniaturas, modal, downloads e filtro permanece reservado ao job natural das 22h15.

## Readback das evidências e da interface

- O job natural das 22h15 foi criado com a chave idempotente `evidence-monthly-report:2026-08-26:22:15`, `jobId=0b3d5407-261e-4dcb-b7ba-345f1e4bf376`, e terminou `completed` às 22h23 sem repetição concorrente.
- A execução completa levou `469278 ms`: planilha `42171 ms`, regras `2671 ms`, geração do relatório `424372 ms` e publicação `9169 ms`.
- O snapshot público foi atualizado às `22:16:12 America/Cuiaba`, em modo completo, com `383` prints e `publicationGate.missing=0`.
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

### Isolamento do relatório mensal e dos pacotes opcionais

- O relatório natural das 22h15 revelou que a versão anterior enfileirava `pi-site-export` opcionais e que esses pacotes podiam tentar reconstruir provas já auditadas.
- O release `8d28b18615f84b210c4e92d3308ffa6b630f8f47` impede o relatório agendado de criar esses pacotes; a execução manual continua disponível.
- `pi-site-export` passou a reutilizar somente evidência final auditada, com URL alcançável e checklist final aprovado. O pacote falha fechado e não chama captura ou correção de evidência.
- Testes do contrato mensal: `32/32`; revisão independente: nenhum bloqueio P0/P1.
- Deploy concluído em volumes `adops_app_source_8d28b18615f8` e `adops_web_public_8d28b18615f8`, após backup `adops-before-8d28b18615f8-20260827T023952Z.sql.gz`.
- O Portainer expirou a resposta da atualização, mas o readback confirmou a stack persistida, três leituras estáveis, API e painel saudáveis e SHA público correto.
- Os jobs herdados chegaram a estado terminal: dois pacotes concluíram reutilizando artefatos sem `regeneratedDates` ou `invalidatedEvidenceIds`; os demais falharam fechados por checklist, timeout da fila ou interrupção controlada do runner.
- O job interrompido pela troca de volume foi encerrado como `runner_interrupted`, preservando o resultado parcial e sem criar retry concorrente.
- Fila final: `running=0`, `queued=0`, `readyForRunner=0`; três runners com heartbeat recente.
- O print `#2713` de 26/08 manteve a URL anterior, respondeu HTTP 200 e continuou `audited`, com checklist final aprovado e zero bloqueios. A data permaneceu `8/8` aprovada.

### Contrato OpenAPI publicado

- A auditoria do OpenAPI vivo encontrou as rotas operacionais publicadas, porém com request/response genéricos, sem os campos verificáveis do scheduler.
- O release `988c92cda6d957311775d6208de6c9cec5fee613` publicou schemas para reconcile, overview, status diário, heartbeat e jobs do runner, preservando o gerador FastAPI existente.
- `OpsJob` agora documenta claim, heartbeat, tentativa, camada/código do incidente, IDs pendentes, próxima recuperação e timings de fila, captura, auditoria, upload e relatório; valor ausente continua anulável.
- Os parâmetros `id` das rotas de progresso, conclusão e falha do runner foram corrigidos no contrato para UUID, sem alterar o runtime Express.
- Teste do gerador e compilação Python passaram; o readback de `https://adops-api.codigo5.com.br/api/openapi.json` confirmou todos os `$ref` e propriedades no consumidor público.
- Deploy por volumes `adops_app_source_988c92cda6d9` e `adops_web_public_988c92cda6d9`, após backup `adops-before-988c92cda6d9-20260827T025739Z.sql.gz`.
- Após o corte, API, web, Postgres, runners e monitor do Drive ficaram saudáveis; fila zerada e três runners com heartbeat recente.
- O domínio público do Worker e a API privada retornaram simultaneamente `provider=macmini`, as mesmas contagens e o mesmo `lastHeartbeatAt`; isso comprova que o deployment público está em proxy e não mantém um segundo writer.
- Quatro `drive-pi-ingest` criados pelo monitor do Google Drive durante o readback (`424aef3d`, `d9565a6a`, `f16ff02d`, `386e31ef`) foram acompanhados até `completed`; nenhum era rotina de print e a fila voltou a zero.
- O readback pós-deploy confirmou `#2713` no mesmo artefato, `audited`, HTTP 200, checklist final aprovado e zero bloqueios; o filtro público de faltantes continuou renderizando `Nenhuma campanha encontrada` e a data permaneceu `8/8`.
- O typecheck completo deixou de depender de supressões para os módulos compartilhados de candidatos e decisão de alerta: declarações locais foram adicionadas, `pnpm run typecheck` passou nos quatro projetos e os testes do scheduler permaneceram `33/33` mais `16/16` contratos.

## Preflight de integração

- A branch do scheduler parte exatamente do commit terminal da rotina autocorretiva de prints: `be813b54147df8d75ac98c69d6ad91ae4ea623b9`.
- As duas worktrees dedicadas estão limpas; nenhum job em andamento depende do checkout principal.
- O checkout principal contém muitas mudanças alheias e não será usado para merge, rebase ou deploy desta entrega.
- `origin/main` não contém o release ativo e diverge significativamente da branch local (`85` commits somente no remoto e `195` somente nesta linha no preflight de 26/08). Rebase ou merge automático seria inseguro e poderia misturar frentes não autorizadas.
- A integração final deve ocorrer somente após os 72h, em worktree limpa e com alvo explicitamente reconciliado; até lá, esta branch é o artefato isolado e reversível do release.

## Gates pendentes

O refresh incremental e o job natural das 22h15 atualizaram o consumidor para `8/8`, sem pendências atuais. O próximo gate independente é a recuperação/escalonamento da manhã seguinte.

- As sete janelas naturais de recuperação, de 18h30 a 21h30, consultaram a auditoria canônica sem criar jobs concorrentes quando a data já estava completa.
- No fechamento das 21h30, a decisão foi `not_due`, `jobId=null`, a fila estava vazia e os três runners tinham heartbeat recente (`2026-08-26 21:32:19-04`).

- [x] Reconciliação natural das 17h30 chega a estado terminal.
- [x] Lote natural das 18h chega a estado terminal.
- [x] Recuperações de 18h30 a 21h30 não criam jobs equivalentes concorrentes.
- [x] Relatório das 22h15 chega a estado terminal e o consumidor público reflete o estado canônico.
- [ ] Recuperação/escalonamento de 08h00/08h30 é validada no próximo dia.
- [ ] Três ciclos, totalizando 72 horas, permanecem sem regressão.
- [x] URLs, miniaturas, modal, downloads e filtro `evidence=missing` são validados no relatório público após o refresh incremental.
- [ ] Branch é integrada por worktree limpa sem tocar no checkout principal sujo.
- [ ] Monitor recorrente é desativado e o handoff final é publicado.

## Regra de encerramento

Não concluir por build, HTTP 200, job criado ou job em execução. Encerrar somente após estados terminais, auditoria, consumidor real, 72 horas e integração documentada.
