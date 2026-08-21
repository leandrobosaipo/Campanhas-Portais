# Runbook - PI Automation v3

## Diagnostico rapido

```bash
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
pnpm --dir scripts run harness:pi-automation-v3
pnpm --dir scripts run audit:capture-rules-integrity
```

## Monitor-first v4

O contrato atual para nova pasta/arquivo no Drive fica em:

```text
docs/adops/pi-automation-v4-monitor-first-ai-gate.md
```

Fluxo esperado:

```text
received -> intake_locked -> packaging -> agent_analysis -> validated/applying -> applied|needs_review
```

`intake_locked` deve disparar Telegram logo no início:

```text
Processo automatico iniciado; nao cadastre manualmente ainda.
```

O classificador do runner deve registrar:

```text
folder_empty
missing_pi_pdf
missing_media
pi_and_media_present
missing_pi_pdf_and_media
```

A IA/OpenAI ajuda a compatibilizar PI com layout ruim, nomes de pasta, nomes de mídia e campos difíceis. Mesmo assim, ela não faz mutação. A decisão de criar/atualizar campanha, inserção, planilha e AdRotate continua determinística.

O auto-apply so pode continuar quando `packageReadiness`, validacao, rollout, sync da planilha e dedupe estiverem todos `ok=true`. Se faltar PDF, midia ou houver conflito de duplicidade, o job termina em `needs_review` com `reviewReasons` acionavel.

## Publicação automática por reconciliação

Este fluxo não usa IA para decidir cadastro ou publicação. O monitor do Drive atualiza o snapshot; a API AdOps cruza esse snapshot com a planilha e o AdRotate. O cron das 17h30 e alterações do Drive criam `campaign-publication-reconcile` com `mode=apply`; o runner converte-o em preflight enquanto `ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED=false`.

Quando o gate estiver ativo, a ordem é fixa:

```text
sync-planilha -> dedupe -> preflight de PI/mídia/HTTPS/slot -> criar somente ausência canônica -> publicar sem substituir relação existente -> confirmar HTML -> aguardar captura das 18h
```

O monitor de inventário é best-effort e roda em loop separado do consumidor de jobs: uma indisponibilidade temporária do Google Drive fica auditada, mas não pode deixar reconciliações/preflights autorizados em `ready_for_runner`.

A publicação automática sempre envia `generateEvidence=false`: ela não pode antecipar o print do dia. A rotina diária é a única dona da primeira evidência, depois que a relação pública foi confirmada.

Quando a fonte mensal já definiu uma inserção canônica, ela também fixa portal, formato e intervalo contratado. O PDF é mantido como evidência de PI/mídia/destino; um período mensal genérico do documento não pode substituir, ampliar nem invalidar a linha específica da planilha.

Da mesma forma, cliente e agência de uma campanha já canônica vêm do cadastro/planilha. Metadados comerciais do PDF são preservados para auditoria, mas não trocam nem impedem a publicação de uma inserção cuja identidade operacional já foi confirmada.

O resultado contém `actionsPlanned`, `actionsCompleted`, `blockers`, `mode` e `automationEnabled`. Em conflito ou mídia existente, o resultado é `needs_review`; não sobrescreva a mídia para tentar concluir.

Antes de qualquer mutacao:

```text
syncPlanilha(mode=pre-apply-latest) -> preApplyDedupe -> applying
```

A planilha oficial ganha quando houver divergencia entre nome de campanha extraido do PDF e campanha ja sincronizada para a mesma PI+competencia.

## Agente IA no Drive PI

O agente IA roda dentro do runner apenas para analisar a PI e preencher `parsedPi`.
Ele nao publica, nao altera planilha, nao altera AdRotate e nao gera evidencia.

Variaveis esperadas no ambiente do runner:

```text
OPENAI_API_KEY
ADOPS_PI_AGENT_ENABLED=true
ADOPS_PI_AGENT_AUTO_APPLY=true
ADOPS_PI_AGENT_MODEL=gpt-4.1-mini
ADOPS_PI_AGENT_MIN_CONFIDENCE=0.85
ADOPS_PI_AGENT_KNOWLEDGE_FILE=docs/adops/pi-automation-v3/spm-agent-knowledge.md
```

Nao registrar o valor de `OPENAI_API_KEY` em log, Telegram, relatorio ou issue.

Stages esperados no job:

```text
received -> intake_locked -> packaging -> agent_analysis -> validated/applying -> applied|needs_review
```

Se a IA falhar, faltar citacao/confianca ou houver conflito, o job termina em `needs_review`.

## WhatsApp como intake complementar

Use WhatsApp apenas para criar rastreabilidade quando a operadora envia print, link de destino ou aviso de campanha antes da PI completa chegar no Drive.

Comando protegido por flag:

```bash
ADOPS_CREATE_SPM_PRINT_INTAKE=true \
OPS_API_TOKEN=presente \
pnpm --dir scripts run intake:spm-whatsapp-print-2026-06-03
```

Resultado esperado:

- `POST /api/ops/drive-pi-events` retorna `202` ou `duplicate=true`;
- job `drive-pi-ingest` passa por `intake_locked`;
- stage final fica `needs_review`;
- `reviewReasons` deve incluir campos faltantes, `missing_pi_pdf` ou `missing_media`;
- nenhuma campanha/insercao/evidencia deve ser criada sem PI completa.

Regras:

- nao usar WhatsApp como fonte principal quando PDF/Drive/planilha divergirem;
- nao preencher `piCodigo` por inferencia do print;
- separar banner e video quando os periodos forem diferentes;
- depois que a PI real chegar, completar pelo fluxo normal Drive/planilha/AdOps/AdRotate.

## Dependencias do runner

O fluxo de planilha usa `agent-xlsx` via `uvx`. No runner, chamar sempre com a dependencia explicita:

```bash
uvx --with click agent-xlsx ...
```

Sem `--with click`, o job `sync-planilha` pode falhar antes da regra de negocio com:

```text
ModuleNotFoundError: No module named 'click'
```

Essa falha bloqueia a sincronizacao/cadastro, mas nao indica erro na planilha, na IA ou no AdRotate.

Antes de publicar o runner com novos stages (`intake_locked`, `packaging`, `agent_analysis`, `validated`, `applying`), publique o Worker publico. O Worker antigo rejeita status desconhecido.

Ordem de deploy para v4:

1. `ops/cloudflare-public-api`: publicar Worker para aceitar `intake_locked`.
2. `ops/cloudflare-telegram-bot`: publicar bot para texto inicial correto.
3. `ops/cloudflare-remote-runner`: atualizar imagem/stack no Portainer.
4. Rodar smoke vivo com evento sintético.

Simulação segura:

```bash
pnpm --dir scripts run harness:drive-pi-monitor-first-v4
pnpm --dir scripts run test:drive-pi-event-flow
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
```

Critério de sucesso da simulação:

- harness v4 retorna `ok: true`;
- evento sintético novo retorna `202`;
- replay do mesmo evento retorna `duplicate=true`;
- progresso final fica `completed` com `stageKey=needs_review` para pasta sintética sem PI real;
- Telegram inicial chega sem token, chat ID ou segredo exposto.

## Onboarding operacional

Para cadastrar PI nova ou revisar PI ja publicada, comece pelo runbook curto:

```text
docs/runbook-nova-pi-evidencias.md
```

Ele consolida:

- fontes de verdade;
- caminhos do projeto;
- fluxo planilha -> AdOps -> AdRotate -> evidencia;
- retroativos;
- auditoria visual;
- entrega de relatorio/Telegram.

## Quando o Drive nao processa

1. Conferir se o monitor esta ativo no ambiente correto.
2. Verificar logs do runner/monitor.
3. Confirmar se a pasta tem PDF e midia.
4. Verificar dedupe de evento por `fileId` e `modifiedTime`.
5. Se a PI chegou fora do Drive, registrar intake manual.

## Quando o monitor enfileira evidencias como PI

1. Identificar se o path contem `evidencia`, `evidencias` ou pacote de provas ja geradas.
2. Se for PNG/JPG/WEBP/GIF/MP4/ZIP de evidencia, nao processar como PI.
3. Marcar o job operacionalmente como falha ignorada, sem apagar arquivo do Drive.
4. Confirmar que o monitor registra `evidence_asset_not_pi_intake`.
5. Reprocessar apenas a pasta/PDF real da PI.

Esse caso ocorreu em 2026-06-12 com evidencias retroativas do PERRENGUE competindo com OMT PI 14589 na fila `drive-pi-ingest`.

## Quando a planilha cria/revela duplicidade

1. Conferir a PI e competencia na planilha oficial.
2. Conferir campanhas e insercoes no AdOps pela mesma PI+competencia.
3. A insercao sincronizada da planilha e canônica quando os dados baterem com a PI.
4. Cancelar a insercao criada pelo agente com observacao apontando a canônica.
5. Nao apagar campanha/insercao automaticamente.
6. Rodar reconcile antes de publicar no AdRotate.

Caso real:

```text
OMT PI 14589
insercao agente: #1616 -> cancelada
insercao canônica planilha: #1622
campanha canônica: #929
```

Nao enviar "tudo certo" enquanto a canônica estiver sem `mediaUrl`, sem publicacao no AdRotate ou sem evidencia auditada.

## Quando a evidencia nao aparece

1. Consultar status de captura por data.
2. Confirmar `insertionId`.
3. Conferir AdRotate e slot.
4. Confirmar que a URL da midia bate com o basename esperado.
5. Rodar captura local com `--upload false --saveEvidence false`.

## Quando o formato existe, mas o capturador diz "sem mapping"

1. Conferir o `localFormatoNormalizado` da insercao no AdOps.
2. Conferir o grupo esperado em `config/adrotate-sites.json`.
3. Adicionar alias operacional sem mudar `slotSelector`, `scrollMode` ou `proofStyle`.
4. Atualizar a regra publicada na API de capture-rules com o mesmo alias.
5. Rodar `pnpm --dir scripts run audit:capture-rules-integrity`.
6. Limpar cache runtime da regra quando a mudanca for feita diretamente na base.
7. Regenerar a evidencia que falhou.

Exemplo real: `OMT / groupId 9` precisa aceitar tanto `INTERNO DE NOTICIAS` quanto `INTERNO DE NOTICIA`, porque a planilha pode normalizar o singular.

## Quando o AdRotate ja existe, mas a midia nao sincroniza

1. Reconciliar primeiro; se houver um unico anuncio correspondente, vincular o AdRotate ao `insertionId`.
2. Nao recriar anuncio ja publicado.
3. Se o anuncio existe sem sufixo AdOps, preencher:
   - `adops_insertion_id`;
   - `adops_campaign_id`;
   - `adops_pi_code`;
   - `adops_external_key`;
   - `adops_media_basename`.
4. Atualizar a insercao no AdOps somente depois de validar `HEAD 200` da midia canonica.
5. Para GIF importado no WordPress, usar a URL canonica do Spaces/CDN retornada por `wp_get_attachment_url`.

## Quando o GIF fica sempre no mesmo frame

1. Verificar metadata `gifFrameCandidates`.
2. Confirmar `captureOnly=true` quando os frames forem curtos.
3. Conferir `gifUsefulFrameCount`.
4. Comparar `gifChosenFrameIndex` entre datas.
5. Se todos os frames forem iguais, a variacao nao deve ser inventada.

## Quando o GIF tem frames ruins

1. Gerar uma folha visual de contato das evidencias.
2. Identificar frames com loader, branco, transicao parcial ou sem mensagem legivel.
3. Definir `gifAllowedFrameRanges` no `auditOverrides` da posicao em `config/adrotate-sites.json`.
4. Conferir que o capturador mescla override local mesmo quando existe regra runtime publicada.
5. Regenerar as datas ruins em serie.
6. Confirmar `gifChosenFrameAllowed=true` na auditoria.

Referencia: `PI 490711 / Energisa / PERRENGUE G06`, corrigida em `2026-05-23`.

## Quando houver conflito

Pare em `needs_review` se houver:

- duas PIs com mesmo codigo;
- periodo diferente entre PDF e planilha;
- AdRotate com dois anuncios no mesmo grupo;
- midia recebida por WhatsApp sem pasta Drive;
- IA sem citacao/confianca suficiente para campo critico.
