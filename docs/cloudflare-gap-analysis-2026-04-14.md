# Gap analysis - Migracao do AdOps para Cloudflare

Data: 2026-04-14  
Escopo: revisar o que ja saiu do local, o que ainda depende da maquina e qual a ordem correta para deixar o sistema inteiro operando no ar.

## 1. O que ja funciona no Cloudflare

### 1.1 Frontend publico
- O painel esta publicado no Cloudflare Pages.
- URL principal:
  - `https://adops-campanhas-portais.pages.dev`
- Build validada nesta rodada:
  - `https://cd221030.adops-campanhas-portais.pages.dev`

### 1.2 API publica de leitura
- O Worker `adops-api-public` atende leitura real do painel.
- Ja responde:
  - `dashboard`
  - `campaigns`
  - `insertions`
  - `insertion detail`
  - `capture audit`
  - `capture failures`
  - `sync diagnostics`
  - `relation com AdRotate`
  - `planned/live preview`
- Healthcheck:
  - `https://adops-api-public.leandro471.workers.dev/api/healthz`

### 1.3 Trilha operacional protegida
- D1 remoto publicado:
  - `adops-ops`
- Queue remota publicada:
  - `adops-ops-queue`
- Endpoints protegidos no Worker:
  - `POST /api/ops/jobs/print-batch`
  - `POST /api/ops/jobs/print-backfill`
  - `POST /api/ops/jobs/sync-planilha`
  - `POST /api/ops/runner/claim-next`
  - `POST /api/ops/runner/jobs/:id/complete`
  - `POST /api/ops/runner/jobs/:id/fail`
- Status publico:
  - `GET /api/ops/jobs`
  - `GET /api/ops/jobs/:id`

### 1.4 UI publica com operacao protegida
- `Dashboard` ja aceita token de operador no navegador.
- `SyncCenter` ja aceita token de operador no navegador.
- Acoes religadas no Pages:
  - `sync-planilha`
  - `print-batch`
  - `print-backfill`

### 1.5 Runner remoto inicial
- Existe pacote de runner:
  - `ops/cloudflare-remote-runner`
- Esse runner ja provou o fluxo:
  - `claim-next`
  - executar `sync-planilha`
  - devolver `complete`
- Validacao real ja feita:
  - job de `sync-planilha` apareceu como `completed` em `GET /api/ops/jobs`

## 2. O que ainda depende do local

### 2.1 Execucao final dos prints
- O runner remoto atual chama a API privada local para:
  - `POST /api/insertions/capture-proof/batch`
  - `POST /api/insertions/capture-proof/backfill-overdue`
- Isso significa que o executor final de print ainda depende de:
  - runtime Node local
  - Playwright local
  - acesso local a scripts
  - acesso local a segredos do projeto

### 2.2 API privada de escrita
- Ainda estao so na API local:
  - gerar print individual
  - corrigir evidencias invalidas
  - adicionar/apagar evidencias
  - exportar ZIP de evidencias
  - salvar observacoes
  - criar campanha
  - editar configuracoes
  - merges/manutencoes administrativas

### 2.3 Runner permanente
- O runner remoto por contrato existe, mas ainda nao esta hospedado em ambiente permanente.
- Hoje ele foi validado em execucao manual.
- Falta:
  - host sempre ligado
  - secrets no host
  - `DATABASE_URL`
  - segredos de Spaces
  - conectividade com a API privada ou com a futura API publica de escrita

### 2.4 Banco principal e escritas do sistema
- O painel publico de leitura usa snapshot.
- O trilho de jobs usa D1.
- Mas a escrita principal do AdOps continua no banco do sistema atual, acessado pela API privada.
- Isso ainda precisa de uma decisao definitiva:
  - manter banco principal fora do Cloudflare e expor API privada publica
  - ou migrar o backend principal inteiro para outro host publico/Hyperdrive

## 3. O que falta para tudo estar funcionando no ar

### Etapa A - hospedar o runner remoto
Falta publicar o `ops/cloudflare-remote-runner` em host permanente.

Requisitos minimos:
- Node ativo 24/7
- `OPS_API_BASE_URL`
- `OPS_API_TOKEN`
- `DATABASE_URL`
- `PRIVATE_ADOPS_API_BASE_URL` enquanto a API privada nao sair do local
- acesso aos scripts do projeto
- acesso aos segredos de print/Spaces

### Etapa B - tirar a API privada do localhost
Enquanto `PRIVATE_ADOPS_API_BASE_URL` apontar para `http://127.0.0.1:4011`, a operacao nao fica 100% fora da maquina.

Falta publicar fora do local:
- API principal do AdOps
- rotas de escrita
- rotas de captura
- exportacoes

### Etapa C - religar acoes por insercao individual no Pages
Ainda faltam no modo publico:
- gerar print individual
- corrigir evidencias invalidas
- regerar retroativos de uma unica insercao
- exportar ZIP + TXT
- salvar URLs e observacoes

### Etapa D - publicar o executor final de print
Depois de hospedar a API privada e o runner permanente, falta mover a geracao real para ambiente sempre ativo.

O gargalo real hoje e:
- Playwright
- scripts de captura
- upload de evidencias
- segredos operacionais

## 4. Riscos reais da migracao

### 4.1 Risco de achar que Pages = sistema completo
Nao e.
Hoje:
- Pages = UI publica
- Worker = leitura + orquestracao inicial
- runner = existe, mas ainda nao esta hospedado
- API principal = ainda nao saiu completamente do local

### 4.2 Risco de segredo no frontend
Foi evitado.
O token de operador fica:
- digitado pelo usuario
- salvo apenas no `localStorage`
- nunca embedado no bundle

### 4.3 Risco de runner incompleto
Ja apareceu um caso real:
- `DATABASE_URL` faltando no primeiro teste
Isso foi util porque confirmou que o host do runner precisa do mesmo contexto operacional do projeto.

## 5. Ordem correta para concluir

1. Publicar o host permanente do `cloudflare-remote-runner`
2. Publicar a API principal do AdOps fora do localhost
3. Apontar `PRIVATE_ADOPS_API_BASE_URL` do runner para essa API publica/privada hospedada
4. Revalidar:
   - `sync-planilha`
   - `print-batch`
   - `print-backfill`
5. Religiar as acoes por insercao individual no Pages
6. Validar exportacoes, evidencias e correcoes
7. So depois declarar o sistema 100% fora do local

## 6. Conclusao honesta

O projeto ja deu um salto importante:
- UI publica no ar
- leitura publica no ar
- jobs protegidos no ar
- token de operador no Pages
- runner remoto por contrato pronto
- job real de `sync-planilha` concluido via Worker

Mas ainda nao esta tudo fora da maquina porque faltam duas pecas:
- host permanente do runner
- API principal do AdOps fora do localhost

Essas duas pecas sao o fechamento real da migracao.
