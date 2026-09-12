# Fechamento da migração AdOps D1 — plano de implementação

> **Para agentes:** execute uma tarefa por vez e marque seus passos. Luna pode fazer somente leitura, registro e validação; Terra pode alterar código, testes e Git na branch. A integração na `main`, o deploy de produção, qualquer escrita no banco e qualquer alteração na Cloudflare são exclusivos do agente principal, após os gates descritos.

**Objetivo:** encerrar a migração do AdOps do D1 com o repositório publicado na `main`, rastreabilidade de release correta, revisão humana segura dos 44 jobs retidos e duas verificações pós-corte comprovadas.

**Arquitetura:** o runtime permanece no PostgreSQL do Mac Mini. A API e os runners usam a rede interna `adops_internal`; a ponte Cloudflare continua apenas como compatibilidade pública, sem binding D1, cron ou consumidor de Queue. O D1 e o release anterior permanecem preservados durante a retenção.

**Stack:** TypeScript, Express, PostgreSQL 16, Docker/Portainer, Cloudflare Tunnel/Worker, GitHub e Navegador interno.

**Referências:**
- `docs/adops/d1-retirement-20260911.md`
- `ops/portainer/adops-stack/docker-compose.volume.yml`
- `reports/d1-migracao-20260911/RESULTADO.md` no projeto Mac Mini

## Restrições globais

- Não apagar o D1 `adops-ops`, Queue, release anterior, backups ou volume anterior durante este plano.
- Não expor tokens, `.env`, headers de autenticação, payloads de jobs, dados pessoais ou URLs assinadas nas evidências.
- Não reexecutar os 44 jobs `awaiting_human_review` por lote. Cada nova execução exige aprovação explícita por job.
- Não enviar Telegram, publicar inserção, gerar print novo ou escrever no PostgreSQL durante os testes de leitura.
- Evidência visual é obrigatória para cada tarefa que alterar estado: screenshot desktop e, quando houver tela responsiva, mobile; salvar em diretório privado com data e sem segredos.
- O deploy só usa `ops/portainer/adops-stack/docker-compose.volume.yml`; o compose base não pode manter uma topologia contraditória.

## Mapa de atividades e limite de modelo

| Bloco | Entregável | Modelo máximo | Pode alterar produção? |
|---|---|---|---|
| A | inventário e pacote de evidências | Luna | não |
| B | correção de rastreabilidade e paridade do compose | Terra | não |
| C | branch remota, PR e revisão | Terra | não, exceto criar branch/PR |
| D | merge, release e validação externa | principal | sim, depois dos gates |
| E | registro dos 44 jobs para decisão | Luna | não |
| F | revisão individual dos jobs | principal | somente por job aprovado |
| G | duas verificações pós-corte e backup | Luna | não |

---

### Tarefa A1: Criar o inventário de fechamento e a estrutura de evidências

**Modelo máximo:** Luna.
**Arquivos:**
- Criar: `reports/d1-migracao-20260911/fechamento/manifesto-evidencias.json` no projeto Mac Mini.
- Criar: `reports/d1-migracao-20260911/fechamento/LEIA-ME.md` no projeto Mac Mini.

- [ ] Ler, sem modificar, `RESULTADO.md`, `progresso.md`, `bindings-pos-corte.json`, `cf-desativacao-confirmada.json` e `api-pos-corte.json`.
- [ ] Registrar no manifesto apenas: data, SHA implantado, URLs públicas, contagem de 44 jobs, caminhos de evidências e checksums já existentes. Não copiar dumps nem IDs sensíveis.
- [ ] Criar os diretórios privados `capturas/desktop`, `capturas/mobile`, `capturas/portainer` e `capturas/github` com permissão restrita.
- [ ] Tirar screenshot do painel `https://adops.codigo5.com.br` em desktop e mobile; incluir URL, data e estado carregado no nome do arquivo.
- [ ] Tirar screenshot da resposta pública `https://adops-api.codigo5.com.br/api/healthz`, sem cookies ou cabeçalhos de autenticação.
- [ ] Validar que o manifesto referencia arquivos existentes e não contém padrões de segredo (`token`, `password`, `authorization`, `secret`).
- [ ] Commit somente dos documentos de evidência em uma branch de documentação, se o diretório fizer parte do repositório; backups privados não entram no Git.

**Aceite:** manifesto legível, duas capturas do painel e uma da API, todos os caminhos existentes e sem segredo visível.

### Tarefa B1: Fazer a API identificar o release efetivamente implantado

**Modelo máximo:** Terra.
**Arquivos:**
- Modificar: `artifacts/api-server/src/routes/health.ts`.
- Criar: `scripts/src/test-adops-release-routing-contract.mjs`.
- Modificar: `ops/portainer/adops-stack/docker-compose.volume.yml`.

- [ ] Escrever verificação de contrato que exige a prioridade `ADOPS_RELEASE_SHA`, `ADOPS_IMAGE_TAG`, `development` em `health.ts` e a variável no serviço `adops-api` dos dois compose files.
- [ ] Executar a verificação e registrar a falha antes da configuração ser adicionada.
- [ ] Manter a prioridade já existente em `health.ts`: `ADOPS_RELEASE_SHA`, depois `ADOPS_IMAGE_TAG`, depois `development`.
- [ ] No serviço `adops-api` do compose de volume, declarar `ADOPS_RELEASE_SHA` com o mesmo SHA usado no release. Não alterar tokens, portas ou demais variáveis.
- [ ] Rodar a verificação de contrato e o build da API; em homologação, confirmar que a resposta com a variável retorna o SHA recebido.
- [ ] Capturar a página de health local em navegador ou preview HTML, mostrando apenas `status` e SHA de teste.
- [ ] Fazer commit: `fix(adops): expose deployed release in healthcheck`.

**Aceite:** teste verde e mudança limitada a healthcheck/configuração de release; nenhuma publicação ou reinício nesta tarefa.

### Tarefa B2: Eliminar a divergência entre os composes de runners

**Modelo máximo:** Terra.
**Arquivos:**
- Modificar: `ops/portainer/adops-stack/docker-compose.yml`.
- Validar: `ops/portainer/adops-stack/docker-compose.volume.yml`.
- Testar: script de validação temporário fora do repositório, removido ao final.

- [ ] Localizar todos os valores de `OPS_API_BASE_URL` e `PRIVATE_ADOPS_API_BASE_URL` nos dois compose files; a inspeção de 12/09 já confirmou que o compose de volume está correto.
- [ ] Escrever uma verificação que falha se qualquer serviço com nome `adops-runner` usar `adops-api-public.leandro471.workers.dev` como `OPS_API_BASE_URL`.
- [ ] Se houver valor divergente, alterá-lo para `http://adops-api:4011`; se não houver, registrar a paridade e não criar diff artificial.
- [ ] Rodar `docker compose -f ops/portainer/adops-stack/docker-compose.yml config` sem carregar nem imprimir `.env`; a configuração deve ser sintaticamente válida.
- [ ] Rodar novamente a verificação de URLs e confirmar que todos os runners usam a rede interna ou estão explicitamente desabilitados.
- [ ] Confirmar que os dois compose files entregam `OPS_API_TOKEN` ao serviço `adops-api`; essa variável mantém as mutações e leituras operacionais protegidas.
- [ ] Capturar uma tabela sanitizada, gerada a partir do compose, com serviço → URL base, sem outras variáveis de ambiente.
- [ ] Fazer commit: `fix(adops): keep runner API routing internal`.

**Aceite:** nenhum compose versionado reintroduz o Worker público como destino de polling. Não fazer redeploy nesta tarefa.

### Tarefa C1: Preparar a branch para revisão remota

**Modelo máximo:** Terra.
**Arquivos:** nenhum arquivo de produto novo; somente commits B1/B2 e o plano.

- [ ] Em worktree isolado, confirmar `git status --short` vazio ou listar apenas arquivos deliberados deste plano.
- [ ] Rodar o conjunto de testes da migração registrado em `reports/d1-migracao-20260911/testes-locais.log` e o build da API.
- [ ] Comparar `HEAD` com `origin/main`; listar commits da migração, sem misturar os arquivos sujos do checkout canônico.
- [ ] Gerar uma descrição de PR com escopo, dados preservados, D1 desativado, 44 jobs retidos, testes, limitações e rollback.
- [ ] Fazer push da branch `codex/adops-d1-retirement-20260911` e abrir PR para `main`; não fazer merge.
- [ ] Capturar a página do PR no GitHub: título, base `main`, checks e arquivos alterados. Ocultar qualquer informação de sessão.

**Aceite:** PR remoto existe, aponta para `main`, contém apenas a migração e apresenta checks verdes. A branch local deixa de ser a única cópia do código implantado.

### Tarefa C2: Revisão independente da PR

**Modelo máximo:** Luna para leitura; Terra para corrigir observações pequenas.
**Arquivos:** os mesmos alterados na PR.

- [ ] Luna revisa apenas o diff da PR contra `main` e responde a estas perguntas: há D1/Queue/Cron ativo; há URL externa de runner; o healthcheck pode vazar dados; há mudança fora do escopo; os 44 jobs podem ser reivindicados automaticamente?
- [ ] Registrar achados em comentário da PR ou em `docs/adops/d1-retirement-20260911.md` sem incluir credenciais.
- [ ] Se houver achado simples, Terra corrige na mesma branch, roda o teste afetado e atualiza a PR.
- [ ] Capturar a seção de revisão/conversas resolvidas e o estado verde dos checks.

**Aceite:** nenhum achado crítico aberto. Qualquer mudança que atinja dados, credenciais, deploy ou semântica de jobs sobe ao agente principal.

### Tarefa D1: Integrar na main e preparar release controlado

**Responsável:** agente principal.
**Pré-condições:** C1 e C2 aprovadas; backup diário recente confirmado; nenhum job `queued`, `ready_for_runner` ou `running`; D1 e release anterior preservados.

- [ ] Conferir no GitHub que a PR aponta para `main`, que os checks são os mesmos revisados e que o diff não mudou após a revisão.
- [ ] Fazer merge da PR em `main` pelo método definido no repositório e registrar o SHA de `main` resultante.
- [ ] Criar tag anotada `adops-d1-retirement-20260911` somente depois do merge e apontando para o SHA de `main` que será implantado.
- [ ] Capturar o grafo GitHub mostrando `main`, merge da PR e tag.
- [ ] Construir o pacote de release a partir do SHA de `main`, nunca do worktree canônico sujo, e conferir seu SHA-256 contra o manifesto gerado.
- [ ] Parar antes do deploy se o SHA do pacote, o SHA da tag e o SHA da `main` divergir.

**Aceite:** a `main` remota contém a migração, com tag rastreável e pacote reconstruível.

### Tarefa D2: Aplicar o release da main no Mac Mini e validar no consumidor

**Responsável:** agente principal.
**Arquivos:** `ops/portainer/adops-stack/docker-compose.volume.yml` e scripts de release existentes.

- [ ] Usar Portainer em leitura para registrar endpoint, stack, containers, volumes ativos e health antes da mudança.
- [ ] Atualizar somente a stack `adops` para o pacote construído da `main`, preservando variáveis existentes e a URL interna do runner dedicado.
- [ ] Esperar os healthchecks de API, PostgreSQL, web e monitor; abortar se algum ficar unhealthy.
- [ ] Confirmar `GET /api/healthz` com SHA da `main` e `GET /cod5-release.json` pelo caminho público correto do frontend.
- [ ] Abrir o painel no Navegador interno em desktop e mobile; validar dashboard, campanhas e fila operacional carregados.
- [ ] Abrir um relatório com sessão normal e confirmar que acesso anônimo continua negado antes do login. Não criar exportação, publicação ou envio de mensagem.
- [ ] Capturar: Portainer com serviços saudáveis, healthcheck com SHA da `main`, dashboard desktop, dashboard mobile e relatório autenticado. Salvar no manifesto A1.
- [ ] Se qualquer gate falhar, restaurar a versão anterior da stack e preservar journal/artefatos para diagnóstico; não reativar D1 automaticamente.

**Aceite:** `main`, tag, pacote e healthcheck exibem o mesmo SHA; todos os fluxos visuais acima carregam no ambiente real.

### Tarefa E1: Produzir o dossiê somente leitura dos 44 jobs retidos

**Modelo máximo:** Luna.
**Arquivos:**
- Criar privado: `reports/d1-migracao-20260911/fechamento/jobs-retidos-YYYY-MM-DD.json`.
- Criar privado: `reports/d1-migracao-20260911/fechamento/jobs-retidos-YYYY-MM-DD.html`.

- [ ] Consultar `GET /api/ops/jobs?status=awaiting_human_review&limit=100` com autenticação de operador carregada de forma privada; não imprimir a credencial.
- [ ] Confirmar que existem 45 itens no estado, separar o único job que já existia no PostgreSQL dos 44 migrados pela origem arquivada.
- [ ] Para cada job migrado, registrar ID, tipo, data, status anterior, dependência, motivo de retenção e recomendação `descartar`, `reexecutar_manual` ou `investigar`; não incluir payload, resultado, URL assinada ou dados de cliente.
- [ ] Gerar HTML local de leitura com filtros por tipo e recomendação, contadores e aviso fixo “nenhuma ação executada”.
- [ ] Abrir o HTML em desktop e mobile, capturar as duas telas e revisar que IDs sensíveis e dados pessoais estejam reduzidos ao mínimo necessário.
- [ ] Conferir novamente a API: todos os 44 permanecem `awaiting_human_review`.

**Aceite:** dossiê visual privado, completo e auditável; nenhuma alteração de status ou criação de job.

### Tarefa F1: Decidir e executar cada job retido com trilha individual

**Responsável:** agente principal, com decisão explícita do usuário por job ou grupo homogêneo.
**Arquivos:**
- Criar privado por ação: `reports/d1-migracao-20260911/fechamento/jobs/<id>.json` e `<id>-antes-depois.png`.

- [ ] Apresentar ao usuário apenas os jobs classificados como `reexecutar_manual` ou `investigar`, com impacto, dependências e efeito esperado.
- [ ] Antes de cada ação autorizada, confirmar que o job ainda está retido e que não existe operação equivalente ativa.
- [ ] Executar uma única ação: descartar com justificativa, ou criar novo job idempotente com uma chave específica. Nunca alterar o job histórico para `ready_for_runner`.
- [ ] Acompanhar o novo job até `completed` ou `failed`; se falhar, não repetir sem causa observada.
- [ ] Capturar antes/depois na interface de jobs e evidência visual do resultado consumidor quando existir.
- [ ] Registrar vínculo entre job histórico, nova ação, operador, data e resultado no dossiê privado.

**Aceite:** cada job tratado tem decisão explícita e trilha; os não aprovados seguem retidos.

### Tarefa G1: Executar a primeira verificação pós-corte e confirmar backup posterior

**Modelo máximo:** Luna, somente leitura.
**Arquivos:**
- Criar: `reports/d1-migracao-20260911/fechamento/verificacao-1-YYYY-MM-DD.json`.

- [ ] Depois do primeiro ciclo de prints agendado, verificar API, dashboard, runners, fila, erros, espaço em disco, journal `cod5_d1_archive_20260911.alteracoes` e bindings Cloudflare.
- [ ] Verificar no Mac Mini o estado e a última execução do `cod5-maintenance-backup.timer`; confirmar a presença do backup pós-corte local e no destino configurado, sem exibir nomes privados ou URLs assinadas.
- [ ] Confirmar novamente: Worker sem binding D1/Queue, cron vazio, Queue sem produtores/consumidores/backlog e D1 preservado.
- [ ] Capturar dashboard, API healthcheck e Portainer com containers saudáveis. Para backup, capturar apenas timestamp, resultado e tamanho, sem caminho que revele credenciais.
- [ ] Registrar divergências como `falha` ou `lacuna`; não reiniciar nem corrigir serviços.

**Aceite:** verificações somente leitura armazenadas, backup posterior comprovado e nenhuma dependência D1 reativada.

### Tarefa G2: Executar a segunda verificação pós-corte e encerrar tecnicamente

**Modelo máximo:** Luna, somente leitura; agente principal só consolida o resultado.
**Arquivos:**
- Criar: `reports/d1-migracao-20260911/fechamento/verificacao-2-YYYY-MM-DD.json`.
- Modificar: `reports/d1-migracao-20260911/RESULTADO.md`.

- [ ] Repetir integralmente G1 no dia seguinte, comparando métricas de erro, journal, recursos e backup com G1.
- [ ] Confirmar que `main` remota e o release ativo permanecem no mesmo SHA ou justificar qualquer release posterior.
- [ ] Capturar dashboard e Portainer novamente; montar uma comparação visual antes/depois usando apenas status, datas e contagens não sensíveis.
- [ ] Atualizar `RESULTADO.md` com o resultado factual das duas verificações, pendências dos 44 jobs e data mínima de retenção do D1.
- [ ] Declarar fechamento técnico somente se não houver erro crítico, a `main` estiver publicada, o backup posterior estiver confirmado e os jobs não autorizados permanecerem retidos.

**Aceite:** relatório de fechamento contém evidência de duas janelas reais, backup pós-corte, estado da `main`, estado do D1 e destino dos jobs que foram aprovados.

## Sequência e gates

`A1 → B1 + B2 → C1 → C2 → D1 → D2 → E1 → G1 → G2`.

F1 é independente após E1, mas só pode executar itens aprovados pelo usuário. B1 e B2 podem ocorrer em paralelo porque alteram arquivos distintos; todos os demais passos são sequenciais. Se D2 falhar, restaura-se apenas o release anterior do Mac Mini e o plano volta a D1; D1 não é reativado como atalho.

## Critério objetivo de encerramento

- `origin/main`, tag, pacote implantado e `/api/healthz` exibem o mesmo SHA.
- Painel e relatório autenticado passam em desktop e mobile; acesso anônimo ao relatório é negado.
- API, PostgreSQL, web e runners estão saudáveis; não há erros D1/Queue nos logs verificados.
- Duas verificações pós-corte e um backup posterior ao corte foram comprovados.
- D1, Queue e release anterior continuam preservados; não há consumidor ativo do AdOps.
- Os 44 jobs têm dossiê e nenhum foi reexecutado sem decisão explícita.
