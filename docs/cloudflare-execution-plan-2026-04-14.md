# Plano de execucao tecnico - Migracao do AdOps para Cloudflare

Data: 2026-04-14  
Objetivo: transformar o gap analysis em um plano pratico, implementavel e testavel fase por fase.

---

## 🎯 Objetivo final

Deixar o AdOps operando sem depender da maquina local para:

- abrir o painel
- ler dados
- disparar jobs operacionais
- executar sync
- gerar prints
- rodar retroativos
- corrigir evidencias
- exportar ZIP + TXT
- manter logs e status operacionais no ar

---

## 🧱 Fase 0 - Linha de base e inventario

### Objetivo
Congelar o estado atual da migracao e evitar retrabalho.

### Tarefas
- confirmar URLs publicas vigentes:
  - Pages
  - Worker publico
- confirmar quais telas estao em leitura publica
- confirmar quais acoes ja criam jobs protegidos
- confirmar variaveis obrigatorias do runner:
  - `OPS_API_BASE_URL`
  - `OPS_API_TOKEN`
  - `DATABASE_URL`
  - `PRIVATE_ADOPS_API_BASE_URL`
  - segredos de Spaces
- listar rotas ainda locais:
  - print individual
  - fix-invalid
  - evidencias
  - ZIP
  - observacoes
  - configuracoes

### Entregas
- documento de inventario validado
- checklist de ambiente do runner
- checklist de ambiente da API principal

### Testes
- `GET /api/healthz` publico
- `GET /api/ops/jobs`
- abrir Pages nas rotas:
  - `/`
  - `/campanhas`
  - `/insercoes`
  - `/sincronizacao`

### Criterio de pronto
- estado atual mapeado sem lacunas
- nenhuma dependencia local oculta fora da lista

---

## ☁️ Fase 1 - Host permanente do runner remoto

### Objetivo
Hospedar o `cloudflare-remote-runner` em ambiente 24/7.

### Tarefas
- escolher host permanente do runner
- provisionar runtime Node
- configurar secrets:
  - `OPS_API_BASE_URL`
  - `OPS_API_TOKEN`
  - `DATABASE_URL`
  - `PRIVATE_ADOPS_API_BASE_URL`
  - segredos de upload/evidencia
- publicar o pacote `ops/cloudflare-remote-runner`
- configurar processo continuo:
  - `start`
  - reinicio automatico
  - logs
- registrar `RUNNER_ID` fixo por ambiente

### Entregas
- host do runner publicado
- processo do runner rodando continuamente
- logs minimos de claim/complete/fail

### Testes
- criar job `sync-planilha`
- confirmar:
  - `queued`
  - `ready_for_runner`
  - `running`
  - `completed`
- criar job `print-batch`
- confirmar:
  - `claim-next`
  - transicao de status
- desligar e religar o runner
- confirmar retomada sem corromper jobs

### Criterio de pronto
- runner operando sem processo manual local
- pelo menos 1 job real concluido no host permanente

### Riscos
- host sem `DATABASE_URL`
- host sem acesso a segredos de Spaces
- processo cair silenciosamente

---

## 🌐 Fase 2 - Publicar a API principal do AdOps

### Objetivo
Tirar o backend principal do `localhost`.

### Tarefas
- escolher host da API principal
- provisionar ambiente da API:
  - Node
  - banco
  - secrets
  - storage
- publicar API principal
- expor healthcheck publico ou privado acessivel ao runner
- validar rotas de escrita
- validar rotas de captura
- validar rotas de exportacao

### Entregas
- `ADOPS_API_BASE_URL` publica ou privada hospedada
- healthcheck operacional
- rotas de escrita acessiveis ao runner

### Testes
- `GET /api/healthz`
- `POST /api/sync/planilha/latest`
- `POST /api/insertions/capture-proof/batch`
- `POST /api/insertions/capture-proof/backfill-overdue`
- `GET /api/insertions/:id/evidences/export.zip`

### Criterio de pronto
- nenhuma rota principal de escrita depende mais de `127.0.0.1`

### Riscos
- credenciais de banco
- rotas de upload
- paths temporarios de ZIP
- runtime de Playwright no host

---

## 🔁 Fase 3 - Apontar o runner para a API hospedada

### Objetivo
Fazer o runner permanente usar a API nova, não o local.

### Tarefas
- trocar `PRIVATE_ADOPS_API_BASE_URL`
- reiniciar runner com o novo destino
- validar conectividade
- validar timeouts e limites de payload
- validar logs de erro

### Entregas
- runner apontando para API hospedada
- jobs reais consumindo a API fora do local

### Testes
- `sync-planilha`
- `print-batch`
- `print-backfill`
- simular falha e validar `fail`
- simular sucesso e validar `complete`

### Criterio de pronto
- trilho Worker -> Queue -> Runner -> API principal funcionando sem localhost

### Riscos
- divergencia entre ambiente do runner e da API
- timeouts em jobs grandes

---

## 🖨️ Fase 4 - Executor final de print fora do local

### Objetivo
Fechar a parte mais pesada da migracao.

### Tarefas
- validar Playwright no host definitivo
- validar dependencias do script de captura
- validar acesso aos sites/preview
- validar upload de evidencias
- validar paths temporarios
- tratar logs estruturados do processo de captura
- padronizar retry e status de erro

### Entregas
- `print-batch` funcionando no host
- `print-backfill` funcionando no host
- evidencias publicadas sem depender do local

### Testes
- gerar print do dia para uma insercao simples
- gerar retroativo de uma insercao com varias datas
- validar auditoria final
- validar upload de imagem
- validar caso com video
- validar caso com GIF

### Criterio de pronto
- prints e retroativos executam end-to-end no host remoto

### Riscos
- limitacoes de browser/headless
- seletor por portal
- segredos de preview
- tempo de execucao alto

---

## 🧩 Fase 5 - Religar acoes por insercao no Pages

### Objetivo
Trazer a operacao detalhada para a UI publica com token.

### Tarefas
- religar `CaptureProofButton`
- religar `fix-invalid`
- religar retroativo por insercao
- religar `ZIP + TXT`
- religar salvar URL
- religar salvar observacoes
- criar feedback claro de job:
  - criado
  - rodando
  - concluido
  - falhou

### Entregas
- operacao por insercao disponivel no Pages
- feedback operacional visivel na UI

### Testes
- abrir uma insercao real
- gerar print individual
- corrigir evidencia invalida
- baixar ZIP
- salvar observacao
- salvar evidencia manual

### Criterio de pronto
- pagina de insercao completa sem dependencia do local

### Riscos
- UX inconsistente entre leitura e operacao
- downloads longos
- rotas antigas da API local ainda hardcoded

---

## 📦 Fase 6 - Exportacoes e pacotes finais

### Objetivo
Fechar os artefatos operacionais.

### Tarefas
- publicar exportacao ZIP no backend hospedado
- validar TXT de auditoria
- validar arquivo temporario e limpeza
- confirmar download pelo Pages

### Entregas
- ZIP + TXT funcionando fora do local

### Testes
- exportar ZIP de uma insercao com varias evidencias
- abrir TXT e validar conteudo
- baixar duas vezes seguidas

### Criterio de pronto
- exportacoes sem dependencia do local

---

## 🔍 Fase 7 - Revalidacao funcional completa

### Objetivo
Fazer homologacao de ponta a ponta.

### Tarefas
- testar todas as paginas principais
- testar todas as acoes principais
- registrar evidencias tecnicas por fluxo
- abrir bugs restantes
- priorizar correcoes finais

### Páginas a validar
- `/`
- `/campanhas`
- `/campanhas/:id`
- `/campanhas/nova`
- `/insercoes`
- `/insercoes/:id`
- `/sincronizacao`
- `/auditoria-prints`
- `/configuracoes`

### Fluxos a validar
- leitura de dashboard
- leitura de insercoes
- sync protegido
- print-batch
- print-backfill
- print individual
- fix-invalid
- export ZIP
- salvar observacoes

### Entregas
- relatorio tecnico de validacao
- lista final de bugs residuais
- plano curto de melhorias

### Criterio de pronto
- sistema operacionalmente utilizavel no ar

---

## ✅ Definicao de “migracao concluida”

So considerar encerrada quando:

- o runner estiver hospedado permanentemente
- a API principal nao estiver mais no localhost
- prints funcionarem fora do local
- retroativos funcionarem fora do local
- acoes por insercao funcionarem no Pages
- ZIP + TXT funcionarem no Pages
- os testes de paginas e acoes estiverem documentados

---

## 🧭 Ordem recomendada de execucao

1. Fase 1 - host permanente do runner
2. Fase 2 - API principal hospedada
3. Fase 3 - runner apontando para API hospedada
4. Fase 4 - executor final de print no host
5. Fase 5 - acoes por insercao no Pages
6. Fase 6 - exportacoes
7. Fase 7 - revalidacao funcional completa

---

## 🧠 Ganho de conhecimento desta rodada

- O projeto ja passou da etapa “Pages so para leitura”.
- Agora a migracao entrou na etapa de “operacao protegida no Pages”.
- O fechamento real nao depende mais do frontend.
- O fechamento real depende de:
  - host permanente do runner
  - API principal fora do localhost
  - executor final de print fora do local
