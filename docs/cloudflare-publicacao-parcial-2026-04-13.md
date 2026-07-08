# Publicação Parcial no Cloudflare — 2026-04-13

## Objetivo
Avançar a publicação do AdOps para Cloudflare sem fingir que o sistema completo já pode operar fora da máquina local.

## O que foi publicado
- Frontend estático do AdOps publicado com sucesso em Cloudflare Pages.
- URL canônica do projeto:
  - `https://adops-campanhas-portais.pages.dev`
- Deployment validado nesta sessão:
  - `https://e5337cff.adops-campanhas-portais.pages.dev`

## Testes executados
### Frontend público
- `GET /` em `adops-campanhas-portais.pages.dev` -> `200`
- `GET /` em `e5337cff.adops-campanhas-portais.pages.dev` -> `200`
- HTML principal entregue corretamente com assets do build novo.

### API no Pages
- `GET /api/healthz` no Pages ainda cai no fallback da SPA.
- Resultado prático:
  - o frontend já está público
  - a API pública ainda não existe nesse host

## Ajustes técnicos aplicados nesta etapa
### 1. Persistência dos jobs de print
- criada a tabela `print_jobs`
- `LocalPrintRunner` deixou de depender só de `Map` em memória
- metadados do backfill passaram a ser persistidos no banco

### 2. Runner por contrato e por ambiente
- mantido `local-print-runner.ts`
- criado `remote-print-runner.ts`
- criado `print-runner.ts` como seletor por ambiente:
  - `PRINT_RUNNER_MODE=local`
  - `PRINT_RUNNER_MODE=remote`

### 3. Frontend preparado para API pública separada
- criado `artifacts/adops/src/lib/api-base.ts`
- telas com `fetch("/api/...")` passaram a usar helper centralizado
- isso destrava o uso de `VITE_API_BASE_URL` em Pages sem depender do proxy local do Vite

## Testes locais de regressão
### API local
- `GET http://127.0.0.1:4011/api/healthz` -> `ok`
- `GET /api/insertions?competencia=ABRIL/2026` -> respondeu normalmente

### Persistência de jobs
- criado job real por `POST /api/insertions/capture-proof/backfill-overdue/jobs`
- status consultado via rota de job
- registro persistido na tabela `print_jobs`

## Bloqueio atual
O sistema completo ainda não opera fora da máquina local porque continuam faltando estes itens:

1. API pública do AdOps
2. banco acessível pela API fora do ambiente local
3. runner de prints executando fora da máquina local

## Conclusão honesta
Nesta sessão, o Cloudflare deixou de ser só “projeto criado” e passou a ter:
- frontend público real
- build nova publicada
- frontend preparado para API pública separada

Mas o backend completo ainda não foi publicado.

## Próximo corte técnico recomendado
1. publicar a API pública do AdOps
2. apontar o Pages para `VITE_API_BASE_URL`
3. mover o executor de prints para runner remoto permanente

## Correção complementar — crash do frontend público
- O primeiro deployment público ainda quebrava a dashboard com erro de `.map is not a function`.
- Causa real:
  - o Pages respondia `index.html` também em `/api/...`
  - o `customFetch` aceitava `text/html` como sucesso em modo `auto`
  - alguns hooks recebiam dado fora do formato esperado e a UI quebrava ao iterar
- Correção aplicada:
  - `customFetch` passou a tratar URLs `/api/...` como chamadas que exigem JSON
  - quando o host público devolve HTML em vez de JSON, o fetch agora falha de forma tratável, sem derrubar a aplicação inteira
- Deployment com a correção:
  - `https://f74452f2.adops-campanhas-portais.pages.dev`


## 2026-04-13 22:55 - Expansao da API publica de leitura

### Novas rotas publicas no Worker
- `GET /api/insertions/capture-proof/audit`
- `GET /api/insertions/capture-proof/audit/failures`
- `GET /api/insertions/capture-proof/backfill-overdue/preview`
- `GET /api/integrations/adrotate/insertions/:id/relation`
- `GET /api/insertions/:id/capture-proof/status`
- `GET /api/sync/planilha/diagnostics`
- `GET /api/integrations/adrotate/planned`
- `GET /api/integrations/adrotate/live-preview`

### Validacoes publicas
- `https://adops-api-public.leandro471.workers.dev/api/insertions/capture-proof/audit?competencia=ABRIL/2026` retornou `15/15 ok`.
- `https://adops-api-public.leandro471.workers.dev/api/integrations/adrotate/insertions/857/relation` retornou a relacao correta da insercao.
- `https://adops-api-public.leandro471.workers.dev/api/insertions/857/capture-proof/status?date=2026-04-10` retornou auditoria aprovada com metadados reais.
- `https://adops-api-public.leandro471.workers.dev/api/integrations/adrotate/planned?competencia=ABRIL/2026&siteSigla=PERRENGUE` retornou a lista planejada do portal.
- `https://adops-campanhas-portais.pages.dev/sincronizacao` passou a renderizar dados reais de conciliacao.
- `https://adops-campanhas-portais.pages.dev/insercoes` passou a renderizar a fila com resumo `🟢/🔴`.
- `https://adops-campanhas-portais.pages.dev/insercoes/857` passou a renderizar relacao com AdRotate e evidencias com auditoria.
- `https://adops-campanhas-portais.pages.dev/auditoria-prints` passou a renderizar a fila publica de falhas.

### Aprendizado novo
- O exportador de snapshot nao pode disparar centenas de chamadas em paralelo sem limite, porque parte das rotas volta `null` e gera snapshot incompleto.
- A solucao correta foi limitar concorrencia no export e republicar o Worker.
- O `SyncCenter` ainda tinha um `fetch` direto sem `VITE_API_BASE_URL`; a base da API precisou ser centralizada tambem nessa tela.

### Estado honesto
- A leitura publica do painel ficou muito mais completa.
- As mutacoes e jobs ainda continuam na camada privada/local enquanto a migracao operacional nao fecha.

## 2026-04-13 23:15 - UX publica readonly validada e build corrigida

### Resumo
- A build `c09cf460` subiu sem `VITE_API_BASE_URL`, o que fez o frontend publico voltar a apontar para `/api` local do Pages.
- Sintoma observado: listas vazias, dashboard sem numeros, detalhe de insercao como `Inserção não encontrada` e banner de modo publico ausente.
- Correcao aplicada: rebuild do frontend com `VITE_API_BASE_URL=https://adops-api-public.leandro471.workers.dev` e novo deploy publico.
- URL validada da rodada: `https://bea14115.adops-campanhas-portais.pages.dev`

### Ajustes de UX publicados
- `useApiMode()` passou a ser usado nas telas principais para identificar `cloudflare-public-readonly`.
- `Dashboard`, `Insertions`, `InsertionDetail`, `SyncCenter` agora:
  - mostram banner `Modo público no Cloudflare`
  - bloqueiam botoes operacionais de escrita
  - exibem mensagem clara quando a acao ainda depende da camada privada
- `CaptureProofButton` tambem ficou protegido contra disparo em modo publico.

### Validacao tecnica
- Build do frontend: OK
- Deploy no Pages: OK
- Worker publico: mantido em `https://adops-api-public.leandro471.workers.dev`

### Validacao funcional no Pages
Usando Playwright efemero contra `https://bea14115.adops-campanhas-portais.pages.dev`:
- Dashboard: PASSOU
  - carrega dados
  - mostra banner de modo publico
  - `Prints do dia` fica desabilitado
- Insercoes: PASSOU
  - carrega lista real
  - mostra banner de modo publico
  - resumo de auditoria aparece na tabela
- Sincronizacao: PASSOU
  - carrega diagnosticos publicos
  - mostra banner de modo publico
  - `Aplicar sync` fica desabilitado
- Insercao 857: funcionalmente VALIDADA
  - carrega dados reais
  - relacao com AdRotate aparece
  - botoes de export/correcao aparecem desabilitados
  - o teste automatizado falhou apenas por ambiguidade de seletor, pois havia dois botoes com texto semelhante (`Baixar ZIP + TXT` no cabecalho e `Baixar ZIP + TXT da inserção` no bloco final)

### Ganho de conhecimento
- O Pages precisa sempre ser buildado com `VITE_API_BASE_URL` explicita; sem isso a SPA publica parece abrir, mas perde a ligacao com a API publica.
- Em validacao Playwright, seletores por texto amplo ficaram ambiguos em paginas ricas; para o AdOps publico, preferir `getByRole('heading', ...)` e nomes exatos de botoes quando houver variantes.

### Proximo passo recomendado
- continuar a migracao das rotas mutaveis para fora da maquina local
- prioridade:
  1. status de jobs publico
  2. fila remota para retroativos/prints
  3. API de escrita protegida para sync e correcao operacional

## 2026-04-13 23:45 - Rotas publicas restantes cobertas e CampaignDetail corrigido

### O que entrou
- As telas `Campanhas`, `Detalhe da campanha`, `Nova campanha` e `Configuracoes` agora tambem reconhecem o modo `cloudflare-public-readonly`.
- Essas telas passaram a:
  - mostrar banner explicando que o ambiente publico e somente leitura
  - desabilitar acoes de escrita ainda nao publicadas
  - manter navegacao e leitura funcionando sem sugerir que a pessoa pode salvar algo no Pages
- `CampaignDetail` tinha um bug real de runtime no frontend publico: a tela usava `cn(...)` sem importar `cn`.

### Correcao critica
- Bug encontrado via Playwright no deployment publico:
  - `pageerror: cn is not defined`
- Impacto:
  - a rota `/campanhas/840` abria em branco no Pages apesar da API publica responder corretamente.
- Correcao:
  - import de `cn` restaurado em `CampaignDetail.tsx`

### Deployment validado
- Novo deployment funcional:
  - `https://11fd5ae0.adops-campanhas-portais.pages.dev`

### Validacao funcional no Pages
Usando Playwright efemero contra `https://11fd5ae0.adops-campanhas-portais.pages.dev`:
- Dashboard: PASSOU
- Campanhas: PASSOU
- Campanha 840: PASSOU
- Nova campanha: PASSOU
- Configuracoes: PASSOU
- Insercao 857: PASSOU
- Sincronizacao: PASSOU

### Ganho de conhecimento
- Na migracao para Pages, paginas que parecem "so de leitura" tambem precisam de tratamento explicito de modo publico. Caso contrario o sistema abre, mas passa a impressao errada de que salvar/corrigir/exportar ja esta disponivel no Cloudflare.
- Em rotas detalhadas do frontend publico, qualquer helper visual (`cn`, `utils`) faltando no bundle pode gerar tela completamente branca mesmo com a API publica funcionando. Validacao de runtime com Playwright continua sendo obrigatoria depois de cada deploy publico.

## 2026-04-14 00:45 - Camada protegida de jobs operacionais no ar

### Infraestrutura publicada
- criado D1 remoto do AdOps operacional:
  - `adops-ops`
- criada Queue remota do AdOps operacional:
  - `adops-ops-queue`
- o Worker `adops-api-public` agora publica:
  - leitura publica do painel
  - status publico dos jobs em D1
  - camada protegida por Bearer token para disparo de jobs
  - endpoints de runner para claim/conclusao/falha

### Endpoints novos no ar
- `GET /api/ops/jobs`
- `GET /api/ops/jobs/:id`
- `POST /api/ops/jobs/print-batch` (protegido)
- `POST /api/ops/jobs/print-backfill` (protegido)
- `POST /api/ops/jobs/sync-planilha` (protegido)
- `POST /api/ops/runner/claim-next` (protegido)
- `POST /api/ops/runner/jobs/:id/complete` (protegido)
- `POST /api/ops/runner/jobs/:id/fail` (protegido)

### Fluxo validado
- `print-backfill` protegido:
  - job criado com `status=queued`
  - job consultado publicamente por `GET /api/ops/jobs/:id`
  - job finalizado por endpoint protegido de runner
- `sync-planilha` protegido:
  - job criado
  - Queue mudou o status para `ready_for_runner`
  - runner fez `claim-next`
  - runner concluiu com `complete`
- `print-batch` protegido:
  - job criado
  - Queue mudou para `ready_for_runner`
  - `claim-next` devolveu o job em `running`
- `SyncCenter` no Pages agora mostra a lista de jobs operacionais publicados no Cloudflare.

### URL validada do Pages nesta rodada
- `https://51def3b2.adops-campanhas-portais.pages.dev`

### Ganho de conhecimento
- A camada certa para sair do local nao e publicar diretamente o print. Primeiro vem o trilho operacional: D1 para estado, Queue para pipeline, API protegida para disparo e endpoint de runner para claim/completion.
- O runner remoto ainda nao gera o print final sozinho, mas o contrato operacional de ponta a ponta ja esta no ar e validado no Cloudflare.


## 2026-04-14 01:15 - UI publica ligada aos jobs protegidos e runner remoto inicial

### O que entrou
- O `Dashboard` e o `SyncCenter` passaram a aceitar um token de operador salvo apenas no `localStorage` do navegador.
- No modo publico do Cloudflare, os botoes deixam de bloquear completamente e passam a criar jobs protegidos quando o token esta presente.
- Acoes religadas nesta etapa:
  - `sync-planilha` pelo `SyncCenter`
  - `print-batch` pelo `Dashboard`
  - `print-backfill` pelo `Dashboard`
- O texto de modo publico foi atualizado para refletir que a operacao protegida ja pode ser disparada do Pages com token.

### Runner remoto por contrato
- Foi criado o pacote `ops/cloudflare-remote-runner`.
- Esse runner consome os endpoints protegidos do Worker:
  - `POST /api/ops/runner/claim-next`
  - `POST /api/ops/runner/jobs/:id/complete`
  - `POST /api/ops/runner/jobs/:id/fail`
- Jobs suportados no runner inicial:
  - `sync-planilha`
  - `print-batch`
  - `print-backfill`

### Validacao real
- Um job real de `sync-planilha` foi criado no Worker e concluido pelo novo runner remoto.
- O `GET /api/ops/jobs?limit=5` passou a mostrar esse job como `completed`, com `stdout` real do comando executado.
- O primeiro teste do runner falhou por falta de `DATABASE_URL`, e isso ficou documentado como requisito de ambiente do host remoto.

### Build publica desta rodada
- Pages publicado em:
  - `https://cd221030.adops-campanhas-portais.pages.dev`
- Dominio principal continua:
  - `https://adops-campanhas-portais.pages.dev`

### O que ainda falta
- Ligar as acoes por insercao individual no mesmo modelo protegido.
- Hospedar o runner remoto em ambiente permanente, para ele executar sozinho sem nenhum processo local.
- Tirar a geracao final de prints do runtime local e fechar o executor definitivo.
