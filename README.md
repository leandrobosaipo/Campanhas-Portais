# AdOps / Campanhas Portais

Projeto Codex oficial:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

Comece por:

- `AGENTS.md`
- `docs/START_HERE_ADOPS.md`
- `docs/PROJECT_MAP_ADOPS.md`
- `docs/CREDENTIALS_AND_ENV_ADOPS.md`
- `docs/adops/evidence-print-delivery-api.md`
- `docs/adops/runtime-topology-and-permissions.md`

Documentacao operacional publicada pela API:

- [Quickstart](https://adops-api.codigo5.com.br/api/ops/quickstart.html)
- [Catalogo de endpoints](https://adops-api.codigo5.com.br/api/ops/api-catalog.html)
- [Swagger UI](https://adops-api.codigo5.com.br/api/ops/docs)
- [OpenAPI JSON](https://adops-api.codigo5.com.br/api/ops/openapi.json)
- [Campanhas ativas e proximas](https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-10&includeEvidence=true)

## Recursos operacionais atuais

O fluxo hospedado cobre:

- leitura da planilha mensal e separacao entre campanhas ativas e proximas;
- descoberta de PDF, imagem, GIF, video e arquivos de texto em pastas do Google Drive;
- preflight de PI sem mutacao;
- cadastro idempotente de campanha e insercao por `parsedPi` explicito;
- exclusao de formatos sociais (`INSTAGRAM`, `STORIES`, `REELS`, `SOCIAL` e bonificacoes) do inventario de site;
- importacao de imagem/GIF para o WordPress do PMT e upload de video comprimido para CDN/Spaces;
- preview e aplicacao de AdRotate por grupo, periodo e portal;
- rebuild do PMT headless antes de validar HTML e gerar evidencia;
- purge de cache e validacao de HTML publico;
- prints individuais, retroativos e validacao por checklist;
- fila assincrona com progresso e diagnostico de prontidao do runner.
- diagnóstico de divergência de PI por planilha, pasta, PDF e AdOps, com confirmação humana antes de mutação;
- diagnóstico de consistência de mídia entre Drive, AdOps, AdRotate e HTML público;
- inventario persistido e idempotente do Google Drive, sem credencial na API publica;
- CI com codegen, typecheck, builds, testes de Drive/captura e varredura de secrets;
- deploy imutavel por SHA no Portainer, iniciado manualmente no ambiente GitHub `production`.

Fluxo recomendado para uma nova campanha:

```text
Drive/PDF/TXT -> preflight -> AdOps -> midia publica -> AdRotate
-> cache/rebuild -> HTML publico -> evidencia -> checklist
```

Release operacional mais recente:

- [2026-07-10 - Estabilizacao, inventario Drive e CI/CD](docs/releases/2026-07-10-adops-stabilization.md)
- [2026-07-10 - Fluxo reutilizavel de PI, publicacao e auditoria](docs/releases/2026-07-10-drive-pi-publish.md)

Inventario do Drive:

```bash
curl -fsSL https://adops-api.codigo5.com.br/api/ops/drive-inventory/status
curl -fsSL -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H "Content-Type: application/json" \
  https://adops-api.codigo5.com.br/api/ops/jobs/drive-inventory-refresh \
  -d '{}'
```

Observação: este projeto foi migrado de `/Users/leandrobosaipo/Projetos/AdOps`. A pasta antiga deve ser tratada como origem histórica, não como raiz operacional principal.

Dashboard operacional para controle de campanhas e inserções publicitárias em múltiplos portais da agência.

## Estado atual

O projeto já roda localmente e tem:

- dashboard executivo
- listagem de campanhas
- fila operacional de inserções
- cadastro manual de campanhas
- wizard operacional de cadastro por PI
- cabeçalho de PI expandido com `projeto`, `plano`, `planilha`, `produto`, `praça`, `condição de pagamento` e `tipo de faturamento`
- presets locais, duplicação de PI anterior e rascunhos locais
- configuração administrativa para clientes, agências e sites
- cadastro de agência ampliado com dados fiscais, contatos e regras operacionais
- detalhe operacional completo da inserção com linha do tempo, SLA e evidências por dia do período
- perfis operacionais globais por agência/cliente para regras de prazo, docs e checklist
- API local com PostgreSQL
- importador local reexecutável a partir dos arquivos Markdown extraídos da planilha
- sincronização incremental do `.xlsx` mais recente da planilha
- geração de prints do dia em lote
- auditoria de prints para validar cobertura e URLs salvas
- auditoria detalhada por evidência com regras explícitas de falha
- fila dedicada de `Falhas de Prints` para revisar URLs inválidas e divergências visuais
- conciliação inicial com AdRotate
- reconciliação administrativa multisite `Planilha + AdRotate`
- central de sincronização com preview, aplicação e revisão de competência
- preview retroativo validado nos portais públicos com blindagem de cache editorial por domínio

O ambiente local já foi atualizado com os dados reais da planilha.

Validação atual:

- aba `ABRIL 2026` da planilha: `14 inserções` identificadas na extração
- sistema local em `ABRIL/2026`: `14 inserções`
- total importado: `207 inserções`
- campanhas importadas: `151`

Referência dessa análise:

- [docs/analise-gap-planilha-vs-base-local.md](/Users/leandrobosaipo/Projetos/AdOps/docs/analise-gap-planilha-vs-base-local.md)

## Estrutura

- frontend: [`artifacts/adops`](/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops)
- API: [`artifacts/api-server`](/Users/leandrobosaipo/Projetos/AdOps/artifacts/api-server)
- banco e schema: [`lib/db`](/Users/leandrobosaipo/Projetos/AdOps/lib/db)
- cliente gerado da API: [`lib/api-client-react`](/Users/leandrobosaipo/Projetos/AdOps/lib/api-client-react)
- documentação: [`docs`](/Users/leandrobosaipo/Projetos/AdOps/docs)

## Como rodar local

### Pré-requisitos

- `node`
- `pnpm`
- `postgresql`

### Banco local

```bash
createdb campanhas_portais_local
cd /Users/leandrobosaipo/Projetos/AdOps
DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/db run push
DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/scripts run import:real
```

### API

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
PORT=4011 DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/api-server run dev
```

### Frontend

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
PORT=4174 BASE_PATH='/' API_TARGET='http://127.0.0.1:4011' pnpm --filter @workspace/adops run dev
```

### URLs

- frontend: [http://localhost:4174/](http://localhost:4174/)
- health da API: [http://127.0.0.1:4011/api/healthz](http://127.0.0.1:4011/api/healthz)

Estado revalidado em `2026-04-13`:

- frontend local também validado em `http://localhost:4175/`
- projeto de Cloudflare Pages criado:
  - `adops-campanhas-portais`
  - `https://adops-campanhas-portais.pages.dev`
- observação importante:
  - o frontend pode ir para Pages
  - o backend ainda precisa permanecer separado nesta fase

## Comando de carga real

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/scripts run import:real
```

Esse comando:

- apaga a base demo atual
- recria `sites`, `clientes`, `agências`, `campanhas` e `inserções`
- importa os dados históricos reais a partir dos arquivos extraídos da planilha

## Comando de sincronização da planilha

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/scripts run sync:planilha
```

Esse comando:

- baixa a planilha `.xlsx` mais recente
- reprocessa todas as abas operacionais
- atualiza campanhas e inserções existentes
- cria novos registros quando necessário
- emite avisos quando uma linha da aba pertence integralmente a outro mês

Endpoints úteis:

- sincronização: [POST /api/sync/planilha/latest](http://127.0.0.1:4011/api/sync/planilha/latest)
- diagnóstico: [GET /api/sync/planilha/diagnostics](http://127.0.0.1:4011/api/sync/planilha/diagnostics)
- preview: [GET /api/sync/planilha/preview](http://127.0.0.1:4011/api/sync/planilha/preview)
- aplicar correções seguras de competência: `POST /api/sync/competencia/apply-safe`

## Comando de reconciliação Planilha + AdRotate

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
DATABASE_URL='postgresql:///campanhas_portais_local' pnpm --filter @workspace/scripts run reconcile:planilha-adrotate
```

Esse comando:

- baixa a planilha `.xlsx` mais recente
- valida se existem correções seguras de período
- consulta o AdRotate administrativo dos portais no servidor `facilnam`
- preenche `mediaUrl` quando existir match seguro por `site + grupo + PI`
- gera relatório em:
  - [docs/reconcile-planilha-adrotate-2026-04-09.md](/Users/leandrobosaipo/Projetos/AdOps/docs/reconcile-planilha-adrotate-2026-04-09.md)

Aprendizado validado nessa rotina:

- o período pode variar por site mesmo na mesma campanha
- `FEMINICIDIO` não tem período único em abril
- `FTD` da `AFL` estava com período correto; o problema era o vínculo da mídia do grupo interno `14`

## Comando de print semi-automático

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
pnpm --filter @workspace/scripts run capture:proof -- \
  --insertionId 860 \
  --spacesEnv /Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/.env.digitalocean-spaces \
  --spacesBucket cod5 \
  --spacesBasePath adops-prints
```

Referência:

- [docs/plano-print-automatico-sem-ia.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-print-automatico-sem-ia.md)
- [docs/prints-retroativos.md](/Users/leandrobosaipo/Projetos/AdOps/docs/prints-retroativos.md)
- [docs/plugin-retroativo-multisite.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plugin-retroativo-multisite.md)
- [docs/omt-retro-homepage-cache-fix.md](/Users/leandrobosaipo/Projetos/AdOps/docs/omt-retro-homepage-cache-fix.md)
- [docs/base-de-conhecimento-do-projeto.md](/Users/leandrobosaipo/Projetos/AdOps/docs/base-de-conhecimento-do-projeto.md)
- [docs/plano-integracao-email-pi-adrotate.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-integracao-email-pi-adrotate.md)

## Comando de auditoria de grupos duplicados do AdRotate

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
pnpm --filter @workspace/scripts run audit:adrotate-duplicates
```

Essa rotina:

- lê os sites do catálogo multisite
- baixa a home e a URL interna de fallback quando existir
- identifica grupos AdRotate duplicados no HTML público
- salva um relatório em:
  - [docs/adrotate-duplicate-groups-audit-2026-04-10.md](/Users/leandrobosaipo/Projetos/AdOps/docs/adrotate-duplicate-groups-audit-2026-04-10.md)

## Rotinas de print em lote

Já existem duas rotinas técnicas disponíveis na API:

- gerar prints do dia:
  - `POST /api/insertions/capture-proof/batch`
- prévia de retroativos vencidos:
  - `GET /api/insertions/capture-proof/backfill-overdue/preview`
- gerar retroativos vencidos:
  - `POST /api/insertions/capture-proof/backfill-overdue`
- auditar prints do dia:
  - `GET /api/insertions/capture-proof/audit`

Essas rotinas:

- não usam IA
- geram as evidências das inserções elegíveis no dia
- verificam se faltou algum print
- verificam se a evidência do dia tem URL válida e acessível
- verificam se desktop e site mostraram a data/hora esperada
- verificam se primeira dobra, slot do anúncio, backgrounds e vídeos/posters realmente carregaram

Interfaces operacionais já disponíveis:

- fila operacional com detalhe rápido da auditoria por linha
- detalhe da inserção com auditoria por dia/evidência
- fila de prints com falha:
  - rota `/auditoria-prints` no frontend local

## Conciliação com o site

Já existe leitura pública para comparar o planejado no AdOps com o que o site está exibindo agora:

- planejado: [GET /api/integrations/adrotate/planned?competencia=ABRIL%2F2026&siteSigla=PERRENGUE](http://127.0.0.1:4011/api/integrations/adrotate/planned?competencia=ABRIL%2F2026&siteSigla=PERRENGUE)
- público exibido: [GET /api/integrations/adrotate/live-preview?siteSigla=PERRENGUE](http://127.0.0.1:4011/api/integrations/adrotate/live-preview?siteSigla=PERRENGUE)

Essa leitura já retorna:

- `groupId`
- `adId`
- `mediaBasename`
- `pageUrl`

## O que ja foi feito

- clone e setup local do projeto
- compatibilização para rodar localmente no macOS ARM
- ajuste da integração frontend/API local
- melhorias de usabilidade no dashboard, campanhas e inserções
- filtro padrão na competência atual em dashboard, campanhas e inserções
- regra de atraso ajustada:
  - `print` atrasa somente se não for registrado dentro do próprio período
  - `envio para agência` e `docs` atrasam em `D+1` após o fim do período
- cards, badges e cores operacionais centralizados em configuração global
- tela de detalhe com PI, valor, cliente, agência, período com dia da semana e total de inserções no período
- checklist de evidências calculado por dia do período com suporte a URL do Google Drive e thumbnail
- filtros adicionais por cliente e agência
- legenda operacional mais clara
- criação do importador local de dados reais
- substituição da base demo pelos dados reais da planilha no banco local
- validação do gap entre base demo e planilha real
- documentação do plano de importação e sincronização
- sincronização incremental do `.xlsx` mais recente da planilha
- diagnóstico técnico para separar erro de data de divergência de competência
- correção do caso `ATUALIZAÇÃO SUS` com `1068` em abril e `1069` em maio
- novo fluxo de cadastro em etapas com ajuda contextual e revisão inteligente
- ampliação do cabeçalho de campanha para refletir melhor as PIs reais
- refatoração da tabela de agências com regras documentais e de faturamento por cadastro
- gestão de tabelas mestre com correção de grafia e consolidação de duplicados
- smoke tests por rota com captura automatizada das telas principais
- geração e auditoria de prints do dia em lote
- conciliação inicial AdOps x AdRotate com sufixo operacional nos anúncios confirmados
- central de sincronização no frontend para implantação assistida
- preview da planilha antes de aplicar
- revisão de competência com classificação do que é seguro e do que precisa de revisão manual
- leitura pública do site para conciliar grupos e anúncios com o AdOps
- tela da inserção com bloco de relação AdRotate/site
- sincronização segura de mídia para inserções equivalentes já conciliadas
- sincronização administrativa multisite de mídia via AdRotate
- mapeamento confirmado dos grupos internos por portal

## O que falta fazer

- criar tela de importação com `preview`
- persistir presets, aliases e regras de consolidação no backend
- persistir aliases e regras de normalização em banco
- gravar lotes importados com trilha de auditoria
- preparar ambiente de produção
- definir fluxo simples de manutenção para usuários administrativos
- automatizar sincronização de implantação sem custo de token da IA
- validar regra de negócio final para casos em que a inserção cruza meses
- resolver a automação de teste visual com browser profile isolado para regressão de UI

## Documentação principal

- produto e escopo: [docs/PRD-dashboard-operacional.md](/Users/leandrobosaipo/Projetos/AdOps/docs/PRD-dashboard-operacional.md)
- base de conhecimento: [docs/base-de-conhecimento-do-projeto.md](/Users/leandrobosaipo/Projetos/AdOps/docs/base-de-conhecimento-do-projeto.md)
- fluxo completo de importação de PI: [docs/fluxo-completo-importacao-pi.md](/Users/leandrobosaipo/Projetos/AdOps/docs/fluxo-completo-importacao-pi.md)
- status e etapas: [docs/status-do-projeto.md](/Users/leandrobosaipo/Projetos/AdOps/docs/status-do-projeto.md)
- plano de formulários: [docs/plano-formularios-cadastro.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-formularios-cadastro.md)
- plano de importação: [docs/plano-importacao-e-adequacao.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-importacao-e-adequacao.md)
- análise das PIs modelo: [docs/analise-pis-modelo.md](/Users/leandrobosaipo/Projetos/AdOps/docs/analise-pis-modelo.md)
- modelo futuro de regras por agência + cliente: [docs/modelo-perfil-agencia-cliente.md](/Users/leandrobosaipo/Projetos/AdOps/docs/modelo-perfil-agencia-cliente.md)
- automação futura de captura de PI: [docs/automacao-captura-pi.md](/Users/leandrobosaipo/Projetos/AdOps/docs/automacao-captura-pi.md)
- arquitetura Fase 2 com Pages, Spaces e print: [docs/arquitetura-fase-2-cloudflare-spaces-e-print.md](/Users/leandrobosaipo/Projetos/AdOps/docs/arquitetura-fase-2-cloudflare-spaces-e-print.md)
- plano de print automático sem IA: [docs/plano-print-automatico-sem-ia.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-print-automatico-sem-ia.md)
- análise do gap planilha x sistema: [docs/analise-gap-planilha-vs-base-local.md](/Users/leandrobosaipo/Projetos/AdOps/docs/analise-gap-planilha-vs-base-local.md)
- produção e operação: [docs/producao-e-operacao.md](/Users/leandrobosaipo/Projetos/AdOps/docs/producao-e-operacao.md)
- sincronização na implantação: [docs/sincronizacao-implantacao-sem-token.md](/Users/leandrobosaipo/Projetos/AdOps/docs/sincronizacao-implantacao-sem-token.md)
- central de sincronização: [docs/central-de-sincronizacao.md](/Users/leandrobosaipo/Projetos/AdOps/docs/central-de-sincronizacao.md)
- sincronização AdRotate x AdOps: [docs/sincronizacao-adrotate-2026-04-08.md](/Users/leandrobosaipo/Projetos/AdOps/docs/sincronizacao-adrotate-2026-04-08.md)
- integração AdRotate: [docs/integracao-adrotate-adops.md](/Users/leandrobosaipo/Projetos/AdOps/docs/integracao-adrotate-adops.md)
- rollout multisite AdRotate: [docs/rollout-multisite-adrotate.md](/Users/leandrobosaipo/Projetos/AdOps/docs/rollout-multisite-adrotate.md)
- prints retroativos: [docs/prints-retroativos.md](/Users/leandrobosaipo/Projetos/AdOps/docs/prints-retroativos.md)
- auditoria de versionamento dos plugins gerenciados: [docs/auditoria-versionamento-wordpress-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/auditoria-versionamento-wordpress-2026-04-12.md)
- sincronização final de abril/2026: [docs/sincronizacao-abril-2026-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/sincronizacao-abril-2026-2026-04-12.md)

## Riscos atuais

- o build local funciona, mas o monorepo ainda tem dívida técnica de `typecheck`
- cliente e agência ainda dependem de heurística em parte das linhas históricas
- sem tela de preview, a importação ainda é técnica e não operacional

## Estado operacional em 12/04/2026

- plugins gerenciados alinhados nos 6 portais:
  - `AdRotate 5.17.2-c5.8`
  - `cod5-avif-fallback.php 1.0.0`
  - `cod5-adops-retro-preview.php 1.0.1`
- recorte `ABRIL/2026` validado com `20/20` inserções planejadas já preenchidas com grupo e mídia
- próxima etapa operacional preparada:
  - gerar os prints do dia atual
  - rodar os retroativos em atraso


## Operação e infraestrutura
- Prints do dia em lote: disponíveis na dashboard e na lista de inserções.
- Auditoria de prints do dia: valida ausência, URL inválida e prova existente.
- Configuração operacional dos sites: centralizada em `Configurações > Sites` e reaplicável via script.
- Cloudflare Pages: ver `/Users/leandrobosaipo/Projetos/AdOps/docs/cloudflare-pages-deploy.md`
- Recursos necessários para manter o sistema: ver `/Users/leandrobosaipo/Projetos/AdOps/docs/levantamento-recursos-adops.md`

## Atualização de 2026-04-13 — Fase 1 para Cloudflare

Foi iniciada a refatoração do backend para sair do modelo totalmente acoplado à máquina local.

### Entregas desta fase
- extração da lógica pura de captura/auditoria para `artifacts/api-server/src/lib/capture-audit.ts`
- extração do runtime local de captura para `artifacts/api-server/src/lib/local-capture-runtime.ts`
- definição do contrato futuro do runner em `artifacts/api-server/src/lib/print-runner-contract.ts`
- limpeza de `routes/insertions.ts` para usar esses módulos em vez de manter tudo inline

### O que isso significa
- o sistema ainda não roda inteiro no Cloudflare
- mas a camada mais crítica começou a ser separada do ambiente local
- isso prepara a próxima fase: trocar a chamada local de prints por um runner remoto/publicado

### Documento da fase
- [docs/cloudflare-refatoracao-fase-1-2026-04-13.md](/Users/leandrobosaipo/Projetos/AdOps/docs/cloudflare-refatoracao-fase-1-2026-04-13.md)

### Atualização complementar da Fase 1
- o backend já usa um runner local por contrato em vez de chamar o script de print diretamente nas rotas principais
- isso reduz o retrabalho da próxima etapa, que será trocar a implementação local por runner remoto/publicado

### Atualização complementar da Fase 1
- os jobs agora também são persistidos na tabela `print_jobs`, reduzindo a dependência de memória local
- o frontend público foi publicado em:
  - `https://adops-campanhas-portais.pages.dev`
- deployment validado nesta sessão:
  - `https://e5337cff.adops-campanhas-portais.pages.dev`
- as chamadas manuais do frontend para `/api` foram centralizadas em `artifacts/adops/src/lib/api-base.ts`, preparando o uso de `VITE_API_BASE_URL` no Pages


### Cloudflare publico - estado atual
- Frontend publico: `https://adops-campanhas-portais.pages.dev`
- API publica de leitura: `https://adops-api-public.leandro471.workers.dev`
- Ja publicados no Worker: dashboard, campanhas, insercoes, detalhe de insercao, auditoria de prints, fila de falhas, relacao com AdRotate, diagnosticos e conciliacao publica do Sync Center.
- Ainda em transicao: mutacoes (`POST/DELETE`), sync operacional, jobs de retroativo e runner remoto de prints.

### Cloudflare Pages - build publico
- Toda build publica do frontend deve ser gerada com `VITE_API_BASE_URL` apontando para a API publica.
- URL validada nesta rodada: `https://bea14115.adops-campanhas-portais.pages.dev`
- Worker publico atual: `https://adops-api-public.leandro471.workers.dev`

### Cloudflare publico - validacao mais recente
- Deployment validado nesta rodada: `https://11fd5ae0.adops-campanhas-portais.pages.dev`
- Validacao Playwright efemera aprovada para:
  - `/`
  - `/campanhas`
  - `/campanhas/840`
  - `/campanhas/nova`
  - `/configuracoes`
  - `/insercoes/857`
  - `/sincronizacao`

### Cloudflare publico - camada operacional inicial
- Worker publico agora tambem possui camada protegida de jobs operacionais.
- Status publico de jobs:
  - `GET /api/ops/jobs`
  - `GET /api/ops/jobs/:id`
- Disparos protegidos:
  - `POST /api/ops/jobs/print-batch`
  - `POST /api/ops/jobs/print-backfill`
  - `POST /api/ops/jobs/sync-planilha`
- Runner remoto inicial:
  - `POST /api/ops/runner/claim-next`
  - `POST /api/ops/runner/jobs/:id/complete`
  - `POST /api/ops/runner/jobs/:id/fail`
- Deployment validado nesta rodada: `https://51def3b2.adops-campanhas-portais.pages.dev`


## Cloudflare publico - token de operador e runner remoto inicial

- O Pages agora aceita um token de operador digitado no navegador para disparar jobs protegidos sem expor segredo no bundle.
- Rotas operacionais religadas no painel publico nesta etapa:
  - `sync-planilha`
  - `print-batch`
  - `print-backfill`
- Runner remoto inicial criado em:
  - `ops/cloudflare-remote-runner`
- Validacao real ja feita:
  - um job de `sync-planilha` foi criado no Worker e concluido pelo runner.
- URL validada desta rodada:
  - `https://cd221030.adops-campanhas-portais.pages.dev`


## Gap analysis atual da migracao Cloudflare
- Documento consolidado:
  - `docs/cloudflare-gap-analysis-2026-04-14.md`
- Leitura honesta do estado atual:
  - Pages publico: sim
  - API publica de leitura: sim
  - jobs protegidos: sim
  - token de operador no Pages: sim
  - runner remoto inicial: sim
  - host permanente do runner: nao
  - API principal fora do localhost: nao


## Plano tecnico atual da migracao Cloudflare
- Documento principal desta fase:
  - `docs/cloudflare-execution-plan-2026-04-14.md`
- Esse plano organiza a migracao em fases com:
  - tarefas implementaveis
  - testes por fase
  - criterio de pronto
  - riscos


## Atualizacao 2026-04-14 — live proxy do Cloudflare para a VPS
- O Worker publico passou a operar em modo `cloudflare-public-live-proxy`, lendo dados vivos da API principal hospedada na Contabo.
- A base remota foi restaurada a partir do banco local real para alinhar IDs e detalhes das inserções.
- A API principal no VPS agora exige token interno quando exposta publicamente, enquanto o Pages continua usando token de operador para ações protegidas na borda.
- Os gargalos restantes ficaram restritos ao executor hospedado de prints e ao ZIP hospedado, ambos ja com causa identificada e patches aplicados no código.

## 2026-04-14 - Suite publica Pages + VPS
- Foi adicionada a suite `scripts/src/test-pages-vps.mjs` para homologar o painel no Pages usando a API publica no Worker/VPS.
- Relatorios gerados automaticamente:
  - `docs/testes-pages-vps-2026-04-14.json`
  - `docs/testes-pages-vps-2026-04-14.md`
- Estado homologado nesta rodada: 21/21 verificacoes aprovadas para paginas principais, filtros principais, jobs protegidos, status publico e ZIP da insercao 857.
- Gap operacional restante: migrar o print individual sincrono para job assíncrono na camada publica.

## 2026-04-14 - Pages + VPS 22/22 e detalhes publicos corrigidos
- O painel publico em `https://adops-campanhas-portais.pages.dev` foi rerrodado com a suite `Pages + VPS` apos a migracao do `print-single` para job remoto e apos a correção da base de API usada pelos detalhes.
- Resultado homologado: `22/22` testes aprovados.
- Aprendizado principal: nao basta centralizar `apiFetch`; o client gerado (`@workspace/api-client-react`) tambem precisa receber a mesma base viva da API em runtime, senao detalhes de campanha e insercao continuam buscando `/api/...` no host do Pages.
- O fluxo principal publico homologado agora cobre leitura viva, jobs protegidos (`sync-planilha`, `print-batch`, `print-backfill`, `print-single`), status publico e exportacao ZIP.
- Runbook operacional do ambiente hospedado: [docs/operacao-pages-vps-2026-04-14.md](/Users/leandrobosaipo/Projetos/AdOps/docs/operacao-pages-vps-2026-04-14.md)
- Pedido tecnico para a frente `Cloudflare + Analytics por API`: [docs/pedido-agente-analytics-cloudflare-2026-04-14.md](/Users/leandrobosaipo/Projetos/AdOps/docs/pedido-agente-analytics-cloudflare-2026-04-14.md)
