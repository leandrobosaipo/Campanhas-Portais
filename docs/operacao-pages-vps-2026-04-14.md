# Operação Pages + VPS (2026-04-14)

## URLs principais
- Painel público: `https://adops-campanhas-portais.pages.dev`
- API pública: `https://adops-api-public.leandro471.workers.dev/api/healthz`

## Perfis de uso

### Rotina do gestor
Objetivo: acompanhar o estado da operação e disparar rotinas protegidas quando necessário.

#### Início do dia
1. Abrir o painel público.
2. Verificar o `Dashboard`.
3. Confirmar:
   - total de inserções
   - itens críticos
   - fila de pendências
4. Abrir `Sincronização`.
5. Conferir se a lista `Jobs operacionais no Cloudflare` não tem jobs antigos presos em `queued`, `ready_for_runner` ou `running`.

#### Quando for operar
1. Colar o token de operador no navegador.
2. No `Dashboard` ou `Sincronização`, disparar:
   - `Aplicar sync`
   - `Prints do dia`
   - `Retroativos vencidos`
3. Acompanhar os jobs no `SyncCenter`.

#### Quando for conferir execução
1. Abrir `Inserções`.
2. Filtrar por:
   - cliente
   - site
   - termo da campanha
3. Entrar na inserção.
4. Conferir:
   - relação com AdRotate
   - status do print
   - auditoria
   - exportação ZIP + TXT

#### Estrutura esperada do ZIP operacional
O pacote final de evidências deve sair com a organização abaixo:

- `00-LEIA-ME.txt`
- `01-PRINTS/<FORMATO-OU-LOCAL>/...`
- `02-ANALYTICS/...pdf` quando houver relatório concluído
- `03-DOCUMENTOS-OPERACIONAIS/...docx|pdf`

Notas:
- o nome da pasta em `01-PRINTS` segue o `localFormatoNormalizado` da inserção
- o `00-LEIA-ME.txt` resume campanha, PI, período, auditoria e origem dos arquivos
- `03-DOCUMENTOS-OPERACIONAIS` inclui, por enquanto:
  - `DEC-EXECUCAO-<SITE>.docx/.pdf`
  - `ANEXO V - PREENCHER-NUMERO - <CLIENTE> <DD.MM>.docx/.pdf`
- a geração do ZIP pode levar cerca de 20 a 30 segundos quando houver várias evidências e PDF de Analytics

#### Endpoints de documentos operacionais
- `GET /api/insertions/:id/operational-documents`
- `GET /api/insertions/:id/operational-documents/declaracao-execucao/docx`
- `GET /api/insertions/:id/operational-documents/declaracao-execucao/pdf`
- `GET /api/insertions/:id/operational-documents/anexo-v/docx`
- `GET /api/insertions/:id/operational-documents/anexo-v/pdf`
- `POST /api/insertions/:id/operational-documents/regenerate`

Uso:
- downloads `GET` podem sair pela API pública viva
- `POST .../regenerate` continua no fluxo operacional protegido
- os modelos saem preenchidos com dados da PI e deixam em destaque os campos que ainda exigem complemento manual

### Rotina do administrador
Objetivo: manter infraestrutura, runner e API hospedada saudáveis.

#### Verificação diária
1. Confirmar o health público da API.
2. Confirmar que o runner está processando jobs.
3. Verificar se a VPS responde:
   - API principal
   - runner
4. Verificar logs recentes de:
   - `codigo5_adops-api`
   - `codigo5_adops-runner`
5. Verificar os logs do Telegram diário:
   - `/var/log/adops/daily-prints.log`
   - `/var/log/adops/daily-telegram-summary.log`

#### Fluxo diário no VPS
Objetivo: gerar os prints do dia, auditar, autocorrigir pendências e só então enviar o resumo e as imagens no Telegram.

Fluxo:
`20h Cuiabá` → `gerar prints do dia no VPS` → `auditar` → `corrigir faltantes/inválidos` → `22h Cuiabá` → `preflight Telegram` → `resumo` → `envio das imagens`

Regras:
- o resumo das `22h` não deve confiar apenas em `arquivoUrl`
- antes de enviar no Telegram, o worker deve confirmar no status individual:
  - `status = audited`
  - `audit.ok = true`
  - contadores visuais completos
- se um item falhar no preflight:
  - o worker tenta regenerar o print do dia
  - reconsulta o status
  - só envia a foto quando o status estiver pronto
- se ainda assim falhar:
  - o resumo informa a falha remanescente
  - o item não deve ser enviado como se estivesse válido

#### Quando publicar mudança
1. Buildar frontend.
2. Publicar no Pages.
3. Fazer deploy na VPS para `api` e `runner`.
4. Rodar a suíte pública:
   - `pnpm --filter @workspace/scripts run test:pages-vps`
5. Confirmar relatório `22/22` ou revisar as falhas antes de considerar a publicação concluída.

## Se tudo der certo
### Sinais esperados
- o painel abre com dados reais
- campanhas e inserções carregam detalhes reais
- `SyncCenter` mostra jobs atuais
- jobs protegidos são criados
- `print-single` conclui
- ZIP exporta com `application/zip`
- relatório da suíte fica sem falhas

### O que fazer
1. Registrar a rodada como homologada.
2. Salvar o relatório técnico do dia.
3. Seguir a operação normal:
   - sync
   - prints do dia
   - retroativos
   - acompanhamento das inserções

## Se algo der errado

### Caso 1 - painel abre, mas sem dados
Verificar:
1. `GET /api/healthz` da API pública
2. se o Pages está apontando para a API pública
3. se detalhes de campanha/inserção estão abrindo do host correto

### Caso 2 - job fica preso
Verificar:
1. `SyncCenter` no painel
2. status do job na API pública
3. logs do runner no VPS
4. se o runner está com `OPS_JOB_KINDS` correto
5. se o `ANALYTICS_REPORT_HOOK_URL` responde dentro da rede do Swarm quando o job for `analytics-report`

### Caso 2b - analytics-report fica em `ready_for_runner`
Verificar:
1. `docker service logs codigo5_adops-runner`
2. se o runner anuncia `analytics-report` na linha `kinds=...`
3. se o serviço `codigo5_perrengue-ga4-relatorio-analytics` está `1/1`
4. se o hook interno `http://codigo5_perrengue-ga4-relatorio-analytics:8080/api/run-report` está respondendo

### Caso 3 - print falha
Verificar:
1. logs do `codigo5_adops-runner`
2. logs da API principal
3. dependências do runtime:
   - `python3`
   - `python3-pil`
   - `zip`
   - `awscli`
4. se a inserção tem `mediaUrl`
5. se a auditoria retornou `invalid_audit` ou `invalid_url`

### Caso 3b - Telegram enviou print visualmente ruim
Verificar:
1. `/var/log/adops/daily-telegram-summary.log`
2. status individual da inserção em `/capture-proof/status?date=...`
3. se o item estava `audited` de verdade ou só tinha `arquivoUrl`
4. se o portal precisa de mais `postVisualWaitMs` no `config/adrotate-sites.json`
5. regenerar o item pontualmente e reenviar:
   - `POST /ops/resend-print`

### Caso 4 - ZIP falha
Verificar:
1. logs da API principal
2. se a evidência existe
3. se a rota pública está respondendo com `application/zip`
4. se o ZIP final contém `00-LEIA-ME`, `01-PRINTS`, `02-ANALYTICS` e `03-DOCUMENTOS-OPERACIONAIS` quando houver relatório/documentos disponíveis

### Caso 5 - página específica falha
Verificar:
1. console do navegador
2. resposta da rota pública equivalente
3. se a página usa `apiFetch` ou client gerado
4. se a base da API foi aplicada em runtime

## Comando de validação recomendado
```bash
cd /Users/leandrobosaipo/Projetos/AdOps
export OPS_API_TOKEN="$(grep '^OPS_API_TOKEN=' ops/cloudflare-public-api/.env.ops.local | cut -d= -f2-)"
pnpm --filter @workspace/scripts run test:pages-vps
```

## Critério operacional de pronto
Considerar o sistema operacionalmente saudável quando:
- painel público abre
- API pública responde
- suite `Pages + VPS` aprova
- jobs protegidos criam e avançam
- detalhe de campanha e inserção carregam dados reais
- ZIP exporta
