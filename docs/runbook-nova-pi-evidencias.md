# Runbook - Nova PI, AdOps, AdRotate e evidencias

Atualizado em: 2026-05-23

Este e o guia de entrada para um projeto/agente novo entender onde esta cada coisa e o que fazer para cadastrar uma PI, sincronizar midia, gerar evidencias atuais e retroativas, auditar e entregar relatorio.

## Caminhos principais

Raiz oficial do projeto:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

Arquivos mais usados:

```text
docs/START_HERE_ADOPS.md                         leitura inicial
docs/PROJECT_MAP_ADOPS.md                        mapa tecnico
docs/runbook-nova-pi-evidencias.md               este runbook
docs/prints-retroativos.md                       regras de retroativos
docs/adops/capture-config/README.md              regras de captura/auditoria
docs/adops/pi-automation-v3/runbook.md           automacao de intake de PI
config/adrotate-sites.json                       mapa portal/posicao/slot
scripts/src/capture-insertion-proof.cjs          capturador de evidencias
artifacts/api-server/src/lib/capture-audit.ts    auditoria da evidencia
ops/cloudflare-remote-runner/src/runner.mjs      runner de jobs
ops/cloudflare-public-api/src/index.ts           API publica/Worker
ops/cloudflare-telegram-bot/src/index.ts         Telegram operacional
```

Servicos vivos:

```text
Painel publico: https://adops-campanhas-portais.pages.dev
API publica:    https://adops-api-public.leandro471.workers.dev
VPS/Swarm:      codigo5_adops-api, codigo5_adops-runner
```

Nao usar a pasta antiga como fonte principal:

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

Ela e historico.

## Fontes de verdade

Ordem de prioridade quando houver divergencia:

1. PDF/e-mail da PI.
2. Pasta da PI no Google Drive.
3. Planilha operacional.
4. AdOps.
5. AdRotate/portal.
6. WhatsApp apenas como evidencia operacional complementar.

Regra pratica:

- nao inventar PI, periodo, formato, midia ou URL;
- nao criar duplicidade para "resolver rapido";
- se a PI ja existe, completar vinculo e corrigir a insercao canonica;
- se a planilha tem duplicidade textual, manter uma insercao canonica e registrar a outra como conflito/duplicata.

## Fluxo para cadastrar ou revisar nova PI

### 1. Fazer intake da PI

Extrair do PDF/e-mail/Drive:

- numero da PI;
- cliente;
- agencia;
- site/veiculo;
- periodo;
- formato/posicao;
- midia;
- link de redirecionamento;
- exigencias documentais;
- pasta Drive.

Se houver pasta local de PI, rodar:

```bash
scripts/pi-folder-audit.sh <caminho-da-pasta>
```

Se houver risco de duplicidade/correcao:

```bash
scripts/pi-sync-report.sh <pi-codigo-ou-caminho-da-pasta>
```

### 2. Sincronizar planilha

```bash
pnpm --filter @workspace/scripts run sync:planilha
```

Depois conferir se a PI apareceu na competencia correta.

### 3. Conferir AdOps

Validar:

- campanha existente;
- insercao existente;
- periodo;
- site;
- formato normalizado;
- `mediaUrl`;
- status operacional;
- documentos operacionais;
- evidencias ja anexadas.

Se ja houver insercao canonica, atualizar essa. Nao criar outra.

### 4. Conferir AdRotate e portal

Validar no portal:

- anuncio AdRotate;
- grupo/posicao;
- codigo HTML real;
- URL real da midia;
- URL de destino;
- schedule ativo;
- cache limpo.

Quando o anuncio tem arquivo selecionado no AdRotate:

- o `bannercode` precisa conter `%asset%`;
- se o `image` estiver preenchido e o `bannercode` estiver vazio ou com URL absoluta da midia, corrigir antes de gerar evidencia;
- nao sincronizar `mediaUrl` para o AdOps a partir de anuncio nessa condicao;
- se o anuncio for orfao antigo, expirar/corrigir sem reativar campanha inexistente.

O mapa local de portal/slot fica em:

```bash
config/adrotate-sites.json
```

Chave operacional:

```text
siteSigla + groupId
```

Nao publicar duas regras ativas para a mesma chave.

### 5. Sincronizar midia

Validar a URL real com `HEAD`/HTML publico.

Regra para portais com DigitalOcean Spaces/CDN:

- preferir a URL canonica do bucket/CDN quando o site serve a midia por esse host;
- nao usar URL local quebrada do WordPress se o portal offloada midia;
- conferir o `mediaUrl` no AdOps e o `bannercode` no AdRotate.

### 6. Limpar cache

Quando mexer em midia, AdRotate ou schedule:

- limpar cache WordPress/plugin;
- purgar Cloudflare quando aplicavel;
- reabrir o HTML publico para confirmar o banner renderizado.

### 7. Gerar evidencia atual

Pelo painel, usar o botao de print da insercao.

Pela API privada/runner, usar o fluxo de `capture-proof` da insercao. Para operacao manual, prefira o painel ou a fila, porque ela injeta credenciais e contexto de forma correta.

Validar no final:

- `status = audited`;
- `urlStatus = 200`;
- `frameSelectionMode = gif_source` quando for GIF;
- `uploadedUrl` presente;
- `audit.visualAudit.ok = true`;
- banner visivel e legivel no print.

### 8. Gerar evidencias retroativas

Para datas passadas, usar `captureAt`.

Regras:

- horario preferencial: janela operacional `18:00 <= captureAt < 20:00`;
- se a evidencia do dia ja existe e esta valida, nao sobrescrever sem motivo;
- para refazer uma data ruim, usar `replace=true`/botao de apagar+gerar;
- processar datas criticas em serie, nao em paralelo, para evitar corrida de jobs.

No painel:

1. abrir a insercao;
2. escolher data/hora retroativa;
3. gerar print;
4. revisar status/auditoria do card do dia.

Para lote:

1. abrir dashboard/lista;
2. selecionar competencia;
3. usar `Retroativos vencidos`;
4. conferir preview antes de disparar;
5. revisar falhas em `Falhas de Prints`.

## Auditoria visual obrigatoria

Nao basta a URL do print responder `200`.

Conferir:

- banner realmente carregado;
- banner dentro do slot correto;
- frame do criativo legivel;
- sem placeholder `ANUNCIE AQUI`;
- sem loader/spinner;
- sem frame branco;
- sem frame de transicao parcial;
- data/hora coerente com `captureAt`;
- conteudo do site coerente com a data simulada.

Para GIF:

- a midia publicada continua sendo GIF;
- a captura pode escolher um frame especifico para a prova;
- o metadata deve registrar `gifChosenFrameIndex`;
- quando a campanha exigir frames aprovados, configurar `gifAllowedFrameRanges` em `config/adrotate-sites.json`;
- a auditoria deve reprovar com `gif_frame_not_approved` quando o frame escolhido estiver fora dos intervalos aceitos.

## Aprendizado do caso PI 490711 - Energisa

Problema encontrado:

- algumas evidencias estavam `audited` e HTTP `200`, mas visualmente ruins;
- havia banner sem carregar, loader/spinner, frame sem mensagem de campanha e transicao parcial;
- a regra runtime publicada nao carregava o override local de frame aprovado.

Correcao aplicada:

- `PERRENGUE / groupId 6 / LATERAL PRIMEIRA DOBRA` recebeu:

```json
"gifAllowedFrameRanges": [[99, 195], [206, 285], [318, 389]]
```

- `scripts/src/capture-insertion-proof.cjs` passou a mesclar:

```text
site.auditConfig + mapping.auditOverrides + runtimeRule.auditConfig
```

- `artifacts/api-server/src/lib/capture-audit.ts` passou a validar `gifChosenFrameAllowed`;
- nova falha de auditoria: `gif_frame_not_approved`;
- evidencias ruins foram refeitas em serie;
- relatorio e pacote local foram salvos em:

```bash
/Users/leandrobosaipo/Downloads/PI_490711_Energisa_Evidencias_AdOps_2026-05-23
```

Resultado validado:

- `12/12` evidencias com `audited`;
- `12/12` URLs com HTTP `200`;
- `12/12` com `gif_source`;
- `12/12` com frame dentro dos intervalos aprovados;
- relatorio enviado no Telegram, `message_id=611`.

## Comandos de validacao antes de concluir

Escolha conforme a mudanca feita:

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run test:gif-capture-only-short-frames
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

Validacao viva obrigatoria em tarefa operacional:

- status da insercao;
- relacao AdOps x AdRotate;
- evidencia por data;
- URL publica do print;
- auditoria sem issues;
- folha visual/contato quando for GIF ou campanha com muitos frames;
- Telegram enviado, se solicitado.

## Entrega final recomendada

Ao fechar uma PI:

1. gerar relatorio visual em `docs/reports/<slug>/`;
2. salvar `index.html`, `data.json`, `report.json` e folha visual;
3. se solicitado, criar pacote em `Downloads`;
4. enviar no Telegram;
5. registrar pendencias reais:
   - Analytics completo se o fim da PI ainda for futuro;
   - deploy definitivo se algum hotfix tiver sido aplicado direto em container;
   - divergencia de planilha/AdOps/AdRotate que nao tenha sido resolvida.

## Riscos conhecidos

- `docker restart` em servico Swarm pode recriar container a partir da imagem antiga e perder hotfix por `docker cp`.
- Para hotfix de auditoria/captura, atualizar API e runner e confirmar que os dois carregaram a mesma versao.
- Se a imagem hotfix for local e nao estiver em registry, um redeploy pelo EasyPanel pode voltar para imagem antiga.
- Nunca rodar varios `runner --once` em paralelo para a mesma fila/tipo de job sem lock atomico validado.
- API publica pode exigir token de operador para mutacoes; nao imprimir tokens no chat/log.

## Nota AFL / AdRotate dinamico

Em `AFL / MEGABANNER TOPO`, o AdRotate pode trocar o no DOM marcado temporariamente pelo capturador depois que o criativo foi localizado. Se isso acontecer, a auditoria pode acusar falso `slot_position_mismatch` mesmo com o banner visivel na imagem.

Regra operacional:

- nao relaxar `requireSlotVisibleInViewport`;
- medir primeiro o seletor resolvido pelo capturador;
- se ele sumir ou ficar invisivel, medir o seletor operacional publicado (`slotSelector`) antes de reprovar;
- so aceitar a evidencia quando o status final continuar com `audit.ok=true`.

Esse comportamento foi observado na PI `16098`, insercao `1270`, data `2026-05-22`.
