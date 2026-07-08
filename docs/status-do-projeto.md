# Status do Projeto

## Resumo executivo

O projeto está em fase de base funcional local, com interface usável e dados reais importados no ambiente local. O fluxo de importação ainda não está pronto para uso operacional por usuário final.

## Atualizacao operacional - 2026-05-29

Foi separado o fluxo de relatorio mensal de Analytics pela pagina oficial do Google Analytics:

- pacote de docs: `docs/adops/ga4-monthly-report-ui/`
- simulacao local: `docs/reports/adops-ga4-maio-2026-simulacao/`

Decisao:

- para o fechamento de maio/2026 dos 6 portais, a fonte primaria sera a UI do Google Analytics;
- o fluxo antigo de Analytics por API/runner continua como historico e nao deve ser usado quando o pedido exigir a pagina do GA;
- numero sem CSV ou print do GA fica como lacuna, nao como zero.

## Atualizacao operacional - 2026-05-23

Foi consolidado um runbook curto para onboarding de nova PI e evidencias:

- `docs/runbook-nova-pi-evidencias.md`

Ganhos de conhecimento incorporados:

- uma evidencia com HTTP `200` pode estar ruim se o banner nao carregou visualmente ou se o GIF parou em frame sem mensagem legivel;
- para GIFs com muitos frames, a auditoria agora pode usar `gifAllowedFrameRanges`;
- o capturador deve mesclar `site.auditConfig + mapping.auditOverrides + runtimeRule.auditConfig`, porque a regra runtime publicada pode nao carregar todos os overrides locais;
- a auditoria deve reprovar frame fora da faixa aprovada com `gif_frame_not_approved`;
- retroativos ou correcoes de datas especificas devem ser regenerados em serie para evitar corrida de jobs;
- hotfix por `docker cp` em servico Swarm nao e persistente se o container for recriado; quando for inevitavel, atualizar tambem a imagem do servico e registrar risco de rollback por redeploy.

Caso validado:

- `PI 490711 / Energisa / PERRENGUE G06`
- `12/12` evidencias auditadas, HTTP `200`, `gif_source` e frame aprovado
- relatorio enviado no Telegram: `message_id=611`
- pacote local salvo em `/Users/leandrobosaipo/Downloads/PI_490711_Energisa_Evidencias_AdOps_2026-05-23`

Status recomendado:

- `Produto`: em validação
- `Base de dados`: real no ambiente local
- `Pronto para produção`: não

## Etapas do plano

### Etapa 0 — Descoberta e validação da operação

Status: `concluída`

Feito:

- leitura e análise da planilha histórica
- confirmação dos conceitos de status e fluxo operacional
- exportação das abas da planilha para Markdown
- validação dos principais sites e competências
- consolidação das regras operacionais aprendidas nas PIs em perfis parametrizados por agência/cliente

Base de apoio:

- [/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard](/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard)

### Etapa 1 — Setup local e usabilidade inicial

Status: `concluída`

Feito:

- clone local do projeto
- banco local criado
- schema aplicado
- frontend e API rodando localmente
- ajustes de proxy local
- melhorias de UX em dashboard, campanhas e inserções

### Etapa 2 — Validação da aderência aos dados reais

Status: `concluída localmente`

Feito:

- comparação entre competência da planilha e competência no banco demo
- validação de que abril no sistema estava incompleto
- criação e execução do importador real
- abril validado com `14 inserções` no sistema local
- remoção dos dados de modelo da base local

Pendente:

- transformar a importação em fluxo com preview para usuário final
- validar com operação em uso contínuo

### Etapa 3 — Importação e normalização

Status: `parcial avançada`

Feito:

- parser de todas as abas exportadas em Markdown
- carga local de `207 inserções`
- recriação completa da base sem dados demo
- sincronização incremental do `.xlsx` mais recente da planilha
- correção de erros históricos reais de parse de data
- separação entre:
  - erro técnico de data
  - divergência de competência
- endpoint técnico de sincronização:
  - `POST /api/sync/planilha/latest`
- endpoint técnico de diagnóstico:
  - `GET /api/sync/planilha/diagnostics`
- correção do caso `ATUALIZAÇÃO SUS`:
  - `1068` em `ABRIL/2026`
  - `1069` em `MAIO/2026`

Pendente:

- preview
- commit de lote com histórico
- aliases persistidos em banco
- deduplicação auditável
- política final para casos de competência que cruzam meses

### Etapa 4 — Operação diária completa

Status: `substancialmente concluída em ambiente local`

Feito:

- cadastro manual de campanhas
- novo cadastro guiado por PI com wizard em 4 etapas
- cabeçalho da campanha ampliado para refletir regras vistas nas PIs reais:
  - projeto
  - plano
  - planilha de referência
  - produto
  - praça
  - condição de pagamento
  - tipo de faturamento
- modos de entrada:
  - nova PI
  - duplicar PI anterior
  - usar preset
  - continuar rascunho local
- grade de inserções com:
  - seleção múltipla
  - duplicação de linhas
  - ações em lote
  - reordenação por arraste e por setas
  - revisão inteligente antes de salvar
- ajuda contextual forte para iniciantes com exemplos e explicações por etapa
- perfil operacional global refletido no wizard de campanha para orientar prazo, docs e faturamento
- presets locais salvos no navegador para acelerar recorrência mensal
- fila operacional básica
- detalhe da inserção com linha do tempo operacional
- SLA visível por etapa
- linha do tempo e checklist puxando regras do perfil operacional, em vez de regras fixas por tela
- checklist de evidências por dia do período
- suporte a link de evidência no Google Drive com preview
- persistência validada dos botões de status na API
- cores e rótulos padronizados em configuração global
- dashboard e lista de inserções mostrando o perfil operacional ativo no recorte atual
- gestão de tabelas mestre com tela de configurações para:
  - clientes
  - agências
  - sites
  - edição de grafia
  - ativação/inativação
  - consolidação de cadastros duplicados
- tabela de agências ampliada com:
  - dados fiscais
  - contatos
  - regras de faturamento
  - exigências documentais

Pendente:

- aliases persistidos em banco
- presets persistidos por usuário/equipe no backend
- modelar perfis com sobrescrita por `agência + cliente`
- telas móveis mais especializadas para edição de linhas em cards
- validação assistida com PIs reais do cliente para refinamento das regras

### Etapa 5 — Produção e implantação assistida

Status: `em preparação técnica`

Pendente:

- ambiente de produção
- autenticação e perfis
- backup
- observabilidade
- rotina de manutenção
- sincronização automática planilha -> webhook -> banco
- tela operacional de importação com preview e lote auditável

Feito nesta frente:

- arquitetura definida para rodar frontend em Cloudflare Pages na Fase 2
- uso de DigitalOcean Spaces validado para prints e evidências
- credencial validada nos buckets `cod5` e `perrenguematogrosso`
- rotina semi-automática de print implementada e testada sem IA
- rotina em lote para `prints do dia` implementada
- rotina de auditoria de prints implementada
- conciliação inicial AdOps x AdRotate executada para anúncios confirmados
- central de sincronização criada no frontend
- preview da sincronização da planilha implementado
- correção segura de competência implementada
- leitura pública de grupos/anúncios do site implementada para conciliação
- rotina de reconciliação `Planilha + AdRotate` criada e executada
- atualização segura de mídia aplicada por leitura administrativa do AdRotate
- grupos internos confirmados por portal:
  - `OMT` -> `9`
  - `AFL` -> `14`
  - `PNMT` -> `14`
  - `PPMT` -> `14`
  - `ROO` -> `8`
  - `PERRENGUE` -> `11`
- caso `AFL / FTD` resolvido com sync administrativo do grupo interno
- validação de `ABRIL/2026` concluída:
  - nenhuma correção segura de período pendente
  - banners com match seguro no AdRotate estão com mídia preenchida
  - pendências restantes de abril são apenas inserções `Instagram`
- preview retroativo validado no site público do `OMT`
- blindagem de cache editorial replicada para os portais `tailpress`:
  - `AFL`
  - `PNMT`
  - `PPMT`
  - `ROO`
- detalhe de auditoria exposto na página da inserção por evidência
- detalhe rápido de auditoria exposto na lista de inserções
- fila dedicada `Falhas de Prints` criada para revisar `invalid_audit` e `invalid_url`
- plugin multisite de fallback/WEBP para destaque estabilizado e documentado
- troca segura do `_thumbnail_id` para attachment `image/webp` validada no Perrengue
- box do editor do post agora mostra:
  - destaque atual
  - imagem-fonte
  - attachment WEBP vinculado
  - log das URLs WEBP geradas
- correção da URL pública do attachment em storage/CDN externo:
  - no Perrengue, attachments `webp` e log agora usam o host real do CDN
- revisão visual/operacional das telas com base nas PIs:
  - campanhas
  - detalhe da campanha
  - inserções
  - detalhe da inserção
  - dashboard
  - wizard de nova campanha
- a leitura dessas telas agora prioriza:
  - prazo principal da PI
  - risco principal
  - recomendação operacional
- ambiente local revalidado em `2026-04-13`:
  - frontend ok em `localhost:4175`
  - API ok em `127.0.0.1:4011`
- projeto de Cloudflare Pages criado para o frontend:
  - `adops-campanhas-portais`
  - `https://adops-campanhas-portais.pages.dev`

Bloqueios atuais desta frente:

- o backend do AdOps ainda não está em arquitetura compatível com Pages puro
- a API segue em `Express + PostgreSQL + rotinas Node/Playwright/SSH`
- o Direct Upload do Pages falhou nesta sessão no endpoint:
  - `POST /pages/assets/upload`
  - retorno: `500 Worker threw exception`
- não existe ainda uma `VITE_API_BASE_URL` pública e funcional para o frontend hospedado
- por isso, o sistema ainda não pode ser considerado migrado para rodar inteiramente sem a máquina local

Próximo passo correto para produção:

- publicar a API em serviço separado
- ligar o frontend de Pages a essa API pública
- manter banco e storage externos
- separar a geração de prints em worker/runner próprio
- persistência da última busca/filtro implementada em:
  - dashboard
  - campanhas
  - inserções
- configuração global de consentimento de cookies adicionada ao mapa por portal
- relação da inserção com o AdRotate passou a mostrar também anúncio histórico no admin para casos expirados
- vínculos históricos corrigidos no AdRotate para retroativos de abril:
  - `OMT / 857 / ad 77`
  - `AFL / 863 / ad 20`
- moldura do print refinada para parecer mais próxima de um navegador real
- regra global de consentimento endurecida para não clicar em links normais como `continuar` fora de overlays de cookie
- captura passou a distinguir placeholder do AdRotate (`ANUNCIE AQUI`) de falha real de criativo
- em páginas internas, a moldura do navegador passou a refletir a URL real da matéria capturada
- gerador de páginas internas passou a testar mais de uma matéria candidata quando o primeiro link da home não contém o slot/criativo correto
- varredura do recorte `ABRIL/2026` confirmou que o problema histórico de placeholder em `INTERNO DE NOTICIAS` está isolado em `AFL / 863`
- `PERRENGUE / 869` e `PERRENGUE / 1181` validaram normalmente no mesmo formato
- patch global no `adrotate-output.php` aplicado para:
  - permitir `expired` em modo retroativo
  - excluir `fallback_model` da seleção principal
- no caso `AFL / 863`, mesmo após esse patch, as matérias retroativas testadas não renderizaram o grupo `.g.g-14` no HTML

## 2026-04-13 — correção final do AFL 863 no retroativo

- a investigação final do `863` mostrou que:
  - o widget `single-post-banner` da AFL estava ativo
  - o grupo interno `14` estava configurado no bloco do tema
  - o anúncio histórico `20` e o `schedule 34` estavam corretos
- a falha residual estava no `adrotate-output.php`:
  - a customização anterior usava `function_exists('cod5_adops_preview_active')` dentro da string SQL
  - isso fazia o grupo interno parecer “sem anúncios qualificados”
- a correção aplicada:
  - moveu a lógica de preview para variáveis PHP (`$group_type_condition` e `$single_type_condition`)
  - interpolou essas variáveis na SQL do AdRotate
  - manteve `fallback_model != 1` fora da seleção principal
- após a correção e limpeza de cache:
  - o HTML retroativo da AFL voltou a renderizar `.g.g-14`
  - o `ad 20` voltou a aparecer como criativo válido
  - a captura técnica do `863` passou novamente
- sincronização do arquivo corrigido:
  - `AFL`
  - `OMT`
  - `PNMT`
  - `PPMT`
  - `ROO`
  - `PERRENGUE`
- hash final alinhado do `adrotate-output.php`:
  - `a2e15bb13f70a0289f69217a48f7dad5`
- pendência pequena restante do `863`:
  - a AFL ainda ficou com `4/5` imagens da viewport na auditoria visual
  - isso agora é ruído de carregamento tardio de thumb, não mais problema do banner interno
  - tom de risco por perfil

## Atualização de 2026-04-11

Resumo:

- o bloco do plugin WordPress foi fechado de forma segura para esta fase
- o fallback de mídia deixou de ser só AVIF no conteúdo e passou a cobrir o fluxo completo do destaque
- o caso crítico validado foi o post `333155` do Perrengue:
  - fonte `333156` em `image/avif`
  - destaque convertido `333320` em `image/webp`
- a UI do AdOps foi revisada com base no que as PIs já ensinaram, em vez de seguir apenas o fluxo genérico inicial
- campanha, inserção e dashboard agora falam mais claramente sobre:
  - tipo de prazo
  - risco documental
  - necessidade de desdobrar linhas da PI
  - próxima ação recomendada

Próximas frentes já definidas:

1. integração para solicitar/exportar relatórios de Analytics por PI, dimensão e período
2. geração de documentos finais a partir do manual, exemplo real e modelo homologado

## Testes executados nesta rodada

### Fase A e B — Wizard de cadastro

Status: `validado`

Executado:

- build do frontend concluído com sucesso
- abertura da rota `/campanhas/nova` validada por screenshot automatizado
- renderização do wizard confirmada em ambiente local

### Fase C — Configurações e correção de tabelas mestre

Status: `validado`

Executado:

- build do frontend concluído com sucesso após integração da nova rota
- abertura da rota `/configuracoes` validada por screenshot automatizado
- API local saudável durante os testes

### Fase D — Ajuda contextual e revisão assistida

Status: `validado`

Executado:

- revisão da tela final de checagem
- validação estrutural do fluxo com build e smoke tests por rota

Artefatos de teste desta rodada:

- `/tmp/campanhas-nova.png`
- `/tmp/configuracoes.png`

## Próximo bloco obrigatório

O próximo passo que destrava o projeto de verdade é:

1. transformar a importação técnica em fluxo operacional com preview
2. validar com PIs reais do cliente as regras finas do cadastro
3. automatizar sincronização de implantação
4. só depois fechar produção

## Atualização de 2026-04-07

## Atualização de 2026-04-09

Resumo:

- o exemplo `FEMINICIDIO 03/04 a 24/04` foi validado como caso do site `ROO`
- a divergência aparente entre sites não era bug; o período muda por portal
- `FTD` em `AFL` estava com período correto no sistema e no AdRotate
- o erro real de `FTD / AFL` era falta de sync da mídia do grupo interno
- a rotina nova de reconciliação aplicou `13` mídias de forma segura

Artefatos:

- [reconcile-planilha-adrotate-2026-04-09.md](/Users/leandrobosaipo/Projetos/AdOps/docs/reconcile-planilha-adrotate-2026-04-09.md)

Próximo bloco recomendado:

1. criar preview UI para as pendências manuais do AdRotate
2. separar em tela os casos `sem PI` e `mais de um anúncio possível`
3. depois automatizar rename/sufixo nos demais portais com confirmação

Feito nesta rodada:

- leitura de duas PIs modelo reais em `/Users/leandrobosaipo/Downloads/PI-modelo`
- confirmação visual das grades de exibição diária e dos totais de inserções
- refatoração da tabela `agencies` com novos campos operacionais e fiscais
- preenchimento inicial das agências `DMD` e `Renca` com base nos documentos
- documentação das regras que mudam por agência e potencialmente por `agência + cliente`
- ampliação do formulário de campanha para capturar metadados reais da PI
- verificação de duplicidade antes do cadastro das PIs reais
- enriquecimento das campanhas `623` e `626` já existentes em vez de criar campanhas duplicadas
- desdobramento da PI `14028` em 3 inserções operacionais conforme a grade do documento

Teste executado:

- validação estrutural do banco após `ALTER TABLE campaigns`
- validação da API de agências com os novos campos
- build do frontend e smoke final do fluxo de campanha após a atualização

## Atualização de 2026-04-08

Feito nesta rodada:

- revisão da planilha mais recente em `.xlsx`
- criação da rotina incremental de sincronização da planilha
- identificação de que o problema de `1068` e `1069` não era só sincronização, mas também regra de competência por linha
- correção de `1069` para `MAIO/2026`
- correção de erros históricos de parse com:
  - ano abreviado
  - hora embutida
  - datas antigas inconsistentes
- criação do diagnóstico técnico para separar:
  - `invalidDates`
  - `competenciaMismatch`
- implementação do botão de `Prints do dia` na lista operacional
- implementação da auditoria de prints:
  - verifica evidência do dia
  - valida URL
  - verifica resposta HTTP da imagem
- ampliação da conciliação AdOps x AdRotate com rename de sufixos aprovado

Estado validado ao final da rodada:

- `invalidDates = 0`
- `competenciaMismatch = 5`

Leitura correta desse resultado:

- não restaram erros técnicos de data
- restam 5 casos de regra de negócio sobre qual competência usar quando o período cruza meses

## Atualização de 2026-04-08 — rodada 2

Feito nesta rodada:

- criação da página `Sincronização`
- inclusão de preview da planilha antes de aplicar
- inclusão da ação `Aplicar sync`
- inclusão da revisão de competência por campanha com ação sugerida:
  - `safe_update_campaign`
  - `review_split_campaign`
  - `review_multiple_period_rules`
- aplicação das correções seguras de competência
- redução do diagnóstico para:
  - `invalidDates = 0`
  - `competenciaMismatch = 2`
- leitura pública da exibição do Perrengue com:
  - `groupId`
  - `adId`
  - `mediaBasename`
  - `pageUrl`
- validação da leitura pública do grupo `11` em página interna
- bloco de relação com AdRotate adicionado na tela da inserção
- sincronização segura de `mediaUrl` para inserções equivalentes já conciliadas
- casos validados:
  - `1180` -> mídia de `FILA ZERO` / `Ad 116`
  - `1181` -> mídia de `FTD` / `Ad 118`

Estado validado ao final:

- sincronização da planilha pronta para rodar em paralelo na implantação
- conciliação `Planilha -> AdOps -> Site` operacionalmente utilizável
- dois casos ainda pendentes de decisão manual por provável necessidade de desdobramento de campanha:
  - `VACINA - PREF CUIABÁ`
  - `LINGUAGEM ALMT`

## Atualização 2026-04-08 — Multisite

### Concluído
- confirmação documental de que o fluxo `Perrengue + AdRotate` estava registrado no projeto e no workspace WordPress
- inventário remoto dos sites do servidor `facilnam`
- confirmação de `AdRotate 5.17.2-c5.7` ativo em todos os portais do Fácil na Mão
- criação do catálogo multisite em `config/adrotate-sites.json`
- refatoração da API para `planned`, `live-preview`, `relation` e `media sync` por site
- refatoração da rotina de captura para ler configuração por site
- central de sincronização atualizada com seletor de site
- runbook multisite documentado

### Em aberto
- validar grupo administrativo e nomes oficiais de grupos por domínio no banco do AdRotate
- expandir o rename com sufixo AdOps para os demais sites
- validar quais posições já podem gerar print com 100% de confiança fora do Perrengue

## Atualização de 2026-04-10

Resumo:

- o problema dos destaques repetidos no `OMT` foi isolado como cache editorial da homepage
- a data/hora retroativa já estava correta; o defeito restante era reaproveitar IDs atuais de posts
- a blindagem de cache foi aplicada no `OMT` público e generalizada para os portais `tailpress`
- a rotina de captura passou a auditar de forma mais rica:
  - hora da moldura
  - hora do site
  - imagens da primeira dobra
  - imagens do anúncio
  - backgrounds
  - vídeos/posters
- a lista de inserções agora mostra o detalhe rápido da falha por linha
- foi criada a fila `Falhas de Prints` para revisar o período sem abrir inserção por inserção

Portais validados nesta rodada:

- `OMT`
- `AFL`
- `PNMT`
- `PPMT`
- `ROO`

Aprendizado operacional consolidado:

- portais com homepage cacheada precisam desligar transient no preview retroativo
- regenerar a mesma data precisa versionar a URL para evitar falso positivo de cache visual
- auditoria simples não basta; a operação precisa ver qual regra falhou e em qual camada

Artefatos:

- [omt-retro-homepage-cache-fix.md](/Users/leandrobosaipo/Projetos/AdOps/docs/omt-retro-homepage-cache-fix.md)
- [plugin-retroativo-multisite.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plugin-retroativo-multisite.md)
- [prints-retroativos.md](/Users/leandrobosaipo/Projetos/AdOps/docs/prints-retroativos.md)


## Atualização de 2026-04-09 — operação e infraestrutura
- `COMPETENCIAS` agora cobre meses futuros para permitir cadastro de maio, junho e competências seguintes sem novo deploy.
- Frontend preparado para build em Cloudflare Pages.
- `vite.config.ts` deixou de exigir `PORT` e `BASE_PATH` no build.
- SPA fallback adicionado em `artifacts/adops/public/_redirects`.
- Dashboard ganhou ação em lote para `Prints do dia` e `Auditar`.
- Configuração operacional dos seis sites foi centralizada no banco do AdOps.
- Script criado para reaplicar essa carga de configuração:
  - `pnpm --filter @workspace/scripts run sync:sites`

- rotina de captura melhorada para esperar carregamento visual da primeira dobra, além do slot do anúncio
- caso real validado novamente: `ROO / inserção 858 / 2026-04-09`
- `Sincronização` recebeu explicação por etapa para uso operacional por pessoas não técnicas
- `Configurações > Sites` recebeu labels e legendas por campo para explicar o uso operacional de cada informação
- status de captura agora diferencia `Print auditado` de `Print apenas salvo`
- dashboard agora lê quantos prints do recorte atual já estão auditados no dia
- a tela da inserção ganhou ação manual para `Substituir print de hoje` com confirmação explícita
- criação de usuário validada via WP-CLI para:
  - `OMT`
  - `Portal Pantanal MT`

## 2026-04-10 — retroativo multisite e operacao assistida

### Feito
- rollout do preview retroativo nos portais `OMT`, `AFL`, `PNMT`, `PPMT` e `ROO`
- correcao definitiva do `OMT` publico para respeitar data retroativa
- validacao visual portal a portal
- documentacao tecnica do plugin retroativo multisite
- endpoint de pre-visualizacao dos retroativos vencidos
- filtro de insercoes com dias faltando de print
- relatorio visual de dias faltando no dashboard e na fila operacional

### Pendente
- estrategia especifica de captura para posicoes abaixo da primeira dobra em temas como `PPMT` e `ROO`
- transformar a pre-visualizacao dos retroativos em modal de confirmacao antes do lote
- manter a validacao visual retroativa como checklist recorrente quando tema/plugin forem atualizados
- Refatoração concluída na página de inserção para exibir:
  - posição operacional do portal (`HOME 1`, `MEGABANNER TOPO`, `INTERNO DE NOTICIAS`, etc.)
  - página de exibição (`Home` ou `Página interna`)
  - link do anúncio no admin do AdRotate por portal
- `config/adrotate-sites.json` ampliado com configuração por portal para print/auditoria:
  - `adminBaseUrl`
  - `auditConfig`
  - `auditOverrides` por posição
- Gerador de prints passou a respeitar:
  - espera extra para GIF/banner animado
  - trim inferior da viewport por portal
  - `proofStyle` com inset do banner validado para posições como `HOME 1`
- Auditoria de versionamento dos portais confirmou:
  - `Perrengue` com `AdRotate 5.17.2-c5.8`
  - demais portais com `AdRotate 5.17.2-c5.7`
- Documentação de versionamento criada:
  - [versionamento-plugins-portais.md](/Users/leandrobosaipo/Projetos/AdOps/docs/versionamento-plugins-portais.md)

## Atualização de 2026-04-12 — sincronização final de abril e paridade multisite

### Concluído
- revisão prévia da documentação operacional antes de executar nova sincronização
- rollout do `AdRotate 5.17.2-c5.8` para todos os portais
- atualização do `adrotateVersao` na configuração operacional dos sites para `5.17.2-c5.8`
- criação da auditoria de plugins gerenciados:
  - `pnpm --filter @workspace/scripts run audit:wordpress-managed-versions`
- padronização do MU-plugin `cod5-adops-retro-preview.php` nos 6 portais com `Version: 1.0.1`
- validação do recorte `ABRIL/2026` com:
  - `20` inserções planejadas
  - `20/20` com mídia
  - `20/20` com grupo AdRotate
  - `20/20` com `plannedSelf` no endpoint de relação
- relatório operacional desta rodada criado:
  - [sincronizacao-abril-2026-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/sincronizacao-abril-2026-2026-04-12.md)
- auditoria de versionamento criada:
  - [auditoria-versionamento-wordpress-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/auditoria-versionamento-wordpress-2026-04-12.md)

### Estado atual
- `AdRotate`: alinhado nos 6 portais em `5.17.2-c5.8`
- `cod5-avif-fallback.php`: alinhado nos 6 portais em `1.0.0`
- `cod5-adops-retro-preview.php`: alinhado nos 6 portais em `1.0.1`
- a base ficou pronta para a próxima rodada de:
  - `Prints do dia`
  - `Retroativos vencidos`

### Observação operacional
- o diagnóstico amplo de reconciliação ainda pode mostrar ruído de meses antigos e casos históricos
- o recorte certo para operação desta fase é `ABRIL/2026`, onde o estado já ficou limpo e pronto para captura

## Atualização de 2026-04-13 — auditoria consolidada e pacote de evidências

### Concluído
- unificação visual do período entre lista e detalhe com helper compartilhado
- inclusão de `auditSummary` por inserção na API
- indicador resumido de auditoria na lista:
  - aprovadas
  - reprovadas
- destaque das datas com falha diretamente na lista
- nova ação por inserção para:
  - apagar só evidências inválidas
  - regerar automaticamente as datas problemáticas
- nova exportação por inserção em `.zip` com:
  - evidências baixadas
  - `relatorio-auditoria.txt`

### Estado atual
- a lista já consegue mostrar quais inserções têm falha histórica de auditoria sem abrir uma a uma
- a página da inserção já consegue gerar um pacote documental mais completo para salvar no processo
- a rotina de correção trabalha por data problemática, e não por exclusão cega da inserção inteira

## Atualização de 2026-04-13 — Fase 1 da refatoração para Cloudflare

### Concluído
- início da separação entre lógica pura e runtime local da API
- criação de `capture-audit.ts` para centralizar regras reutilizáveis de:
  - datas
  - `captureAt`
  - avaliação de metadata
  - comparação de data/hora do print
- criação de `local-capture-runtime.ts` para concentrar o que ainda depende de:
  - Node local
  - `.env` do Spaces
  - execução do script de print
  - leitura do metadata em disco
- criação de `print-runner-contract.ts` para definir o contrato futuro de jobs de print entre API e runner
- `routes/insertions.ts` refatorado para usar esses módulos extraídos
- build do `@workspace/api-server` validado após a extração

### Estado atual
- a API continua funcional localmente
- a dependência da máquina local ficou mais explícita e menos espalhada
- a próxima etapa segura é introduzir uma porta de runner que permita trocar:
  - runtime local
  por
  - queue/worker/runner remoto

### Próximo passo recomendado
- adaptar as rotas de captura para dependerem de uma porta `PrintRunnerPort`
- manter uma implementação local para compatibilidade imediata
- preparar uma implementação remota para Cloudflare na fase seguinte

### Atualização complementar de 2026-04-13 — runner local desacoplado
- criação de `local-print-runner.ts` como implementação local do contrato de execução de prints
- `PrintRunnerPort` ampliado com `runNow(...)` para suportar rotas síncronas sem perder o mesmo contrato dos jobs
- as rotas de captura da API deixaram de chamar diretamente `runLocalCaptureProof(...)`
- jobs de retroativo em segundo plano já usam o runner para enfileirar/consultar status

### Atualização complementar de 2026-04-13 — jobs persistidos e frontend público
- criada a tabela `print_jobs` no banco do projeto
- os jobs de print deixaram de depender só da memória do processo
- criado `remote-print-runner.ts` para preparar a troca futura por executor remoto
- criado `print-runner.ts` como chave de seleção por ambiente
- o frontend foi publicado em:
  - `https://adops-campanhas-portais.pages.dev`
- deployment validado:
  - `https://e5337cff.adops-campanhas-portais.pages.dev`
- o frontend também passou a usar helper centralizado de API base para não depender de `fetch("/api")` puro


## 2026-04-13 22:55 - API publica expandida
- Worker publico `adops-api-public` agora atende leitura de auditoria de prints, fila de falhas, relacao com AdRotate, status por evidencia e conciliacao do Sync Center.
- Pages publico passou a renderizar com dados reais nas paginas `Dashboard`, `Insercoes`, `Insercao #857`, `Sincronizacao` e `Falhas de Prints`.
- O frontend continua em modo publico de leitura; as acoes de sync, print e retroativos ainda respondem como `not_supported_in_cloudflare_readonly` na camada publica.

## 2026-04-13 23:15 - Pages com UX publica readonly consistente
- Build publica corrigida com `VITE_API_BASE_URL` explicita apontando para o Worker publico.
- URL validada: `https://bea14115.adops-campanhas-portais.pages.dev`
- Dashboard, Insercoes, Insercao e Sincronizacao agora mostram banner de modo publico e desabilitam as acoes de escrita.
- Validacao Playwright efemera:
  - Dashboard: ok
  - Insercoes: ok
  - Sincronizacao: ok
  - Insercao 857: ok funcionalmente; falha restante foi apenas seletor ambiguo de teste.

## 2026-04-13 23:45 - Pages com campanhas/configuracoes readonly e detalhe corrigido
- `Campaigns`, `CampaignDetail`, `NewCampaign` e `Settings` agora mostram o estado publico readonly no Pages.
- `CampaignDetail` foi corrigida no ambiente publico apos erro de runtime `cn is not defined`.
- Deployment validado: `https://11fd5ae0.adops-campanhas-portais.pages.dev`
- Validacao Playwright efemera: 7/7 rotas publicas principais aprovadas.

## 2026-04-14 00:45 - Jobs protegidos publicados no Cloudflare
- Criados `adops-ops` (D1) e `adops-ops-queue` (Queue) para a camada operacional do AdOps.
- Worker publico passou a expor status publico de jobs e endpoints protegidos para disparo de `print-batch`, `print-backfill` e `sync-planilha`.
- Tambem entrou a primeira API de runner remoto: `claim-next`, `complete` e `fail`.
- `SyncCenter` publico passou a listar os jobs operacionais do Cloudflare.
- Deployment validado do Pages: `https://51def3b2.adops-campanhas-portais.pages.dev`


## 2026-04-14 01:15 - Pages com token de operador e runner remoto inicial

- `Dashboard` e `SyncCenter` passaram a aceitar token de operador salvo no navegador para criar jobs protegidos direto do Pages.
- Foi criado o pacote `ops/cloudflare-remote-runner` para consumir `claim-next`, executar jobs e devolver `complete` ou `fail`.
- O fluxo `sync-planilha` ja foi validado de ponta a ponta com um job real concluido no Worker.
- A dependencia local caiu mais um degrau: a interface publica ja dispara jobs reais, mas o host permanente do runner ainda precisa ser publicado.


## 2026-04-14 01:35 - Gap analysis consolidado da migracao Cloudflare
- Foi consolidado um documento de gap analysis da migracao para Cloudflare.
- O estado atual ficou dividido em tres blocos:
  - o que ja funciona no ar
  - o que ainda depende do local
  - o que falta para declarar o sistema 100% fora da maquina
- Conclusao tecnica desta revisao:
  - Pages publico: sim
  - API publica de leitura: sim
  - jobs protegidos: sim
  - runner remoto inicial: sim
  - runner permanente hospedado: nao
  - API principal fora do localhost: nao


## 2026-04-14 02:05 - Plano de execucao tecnico da migracao
- O gap analysis foi transformado em plano de execucao tecnico por fases.
- O documento novo define:
  - tarefas implementaveis
  - testes por fase
  - criterio de pronto
  - riscos por etapa
- Referencia principal desta etapa:
  - `docs/cloudflare-execution-plan-2026-04-14.md`


## 2026-04-14 09:05 - VPS Contabo em operacao para API principal e runner
- A API principal do AdOps foi publicada no VPS Contabo dentro do Easypanel/Swarm:
  - `codigo5_adops-api`
  - `codigo5_adops-runner`
- Foi criado banco dedicado:
  - `adops_campanhas_portais`
- O job real de `sync-planilha` ja concluiu via Worker -> Queue -> Runner -> API privada no VPS.
- O batch de print no VPS deixou de falhar por:
  - ausencia de candidatos
  - ausencia do pacote Node `playwright`
- A reconciliacao de abril no VPS mostrou estado real do Perrengue:
  - 11 insercoes no portal
  - 8 com `mediaUrl`
  - 3 pendencias residuais de `INSTAGRAM`
- Foi criado script focado para reparar `mediaUrl` faltante do Perrengue no VPS:
  - `scripts/src/fix-perrengue-media.ts`
- O ultimo gargalo operacional desta rodada passou a ser:
  - alinhar runtime final de print no container com imagem/base Playwright correta e acompanhar a execucao longa do batch no VPS


## 2026-04-14 09:45 — Worker publico ligado ao VPS e base remota alinhada
- A base `adops_campanhas_portais` da Contabo foi restaurada a partir do banco local real, alinhando IDs como `857`, `863`, `869` e `1181`.
- A API principal passou a exigir `ADOPS_INTERNAL_API_TOKEN` quando exposta publicamente na porta `4011`, e o runner remoto passou a enviar `PRIVATE_ADOPS_API_TOKEN`.
- O Worker `adops-api-public` saiu do snapshot para `live proxy`, consumindo a API do VPS via `sslip.io` com token interno.
- O frontend no Pages continuou em `https://adops-campanhas-portais.pages.dev`, agora lendo dados vivos do VPS pelo Worker.
- O token de operador salvo no navegador passou a ser reaproveitado automaticamente nas mutações via `apiFetch`, então as telas de inserção podem operar pela borda sem remendo botão a botão.
- Os erros residuais desta rodada ficaram localizados em dois pontos do executor hospedado: uso de `python` em vez de `python3` no gerador de prova, e ausência de `zip` na imagem do VPS; ambos foram corrigidos no código e enviados para novo deploy.
- O ZIP também revelou um bug próprio da API (`execFileAsync is not defined`) na rota `/api/insertions/:id/evidences/export.zip`; o patch já entrou no código e estava sendo propagado para o VPS ao fim desta rodada.

## 2026-04-14 10:05 - Suite publica Pages+VPS validada e residuos locais mapeados
- Foi criada e rodada a suite `scripts/src/test-pages-vps.mjs`, agora gravando relatorios em `docs/testes-pages-vps-2026-04-14.{json,md}`.
- Resultado homologado desta rodada: 21/21 verificacoes aprovadas no ambiente publico.
- Cobertura validada:
  - dashboard
  - campanhas
  - detalhe da campanha 840
  - fila operacional de insercoes
  - detalhe da insercao 857
  - sincronizacao
  - fila de falhas
  - configuracoes
  - nova campanha
  - criacao protegida de jobs `sync-planilha`, `print-batch` e retroativo por insercao
  - status publico de print
  - exportacao publica de ZIP da insercao 857
- A suite foi dividida em dois niveis para reduzir falso negativo:
  - estrutura visual e filtros da UI
  - dados e operacoes reais via API publica no VPS/Worker
- A analise de residuos locais mostrou que ainda existem referencias locais em tooling e fallbacks, mas nao no fluxo principal homologado do Pages:
  - scripts de auditoria/deploy com caminhos absolutos do workspace local
  - defaults de `localhost` e `campanhas_portais_local` em rotas/scripts para fallback de desenvolvimento
  - snapshot do Worker ainda mantido como fallback readonly
- O principal gap restante da operacao publica nao e mais "rodar local", e sim um fluxo sincrono especifico:
  - `POST /api/insertions/:id/capture-proof` ainda precisa migrar para job assíncrono ou timeout mais robusto na borda publica antes de ser considerado homologado no Pages.

## 2026-04-14 12:30 - Detalhes publicos corrigidos e suite Pages+VPS 22/22
- As paginas publicas de detalhe de campanha e insercao estavam abrindo no Pages, mas ainda consultavam `/api/...` no proprio host do Pages em vez da API publica viva, o que fazia o frontend cair em `Campanha nao encontrada` e `Insercao nao encontrada` apesar de a API publica responder corretamente.
- Correcao aplicada: a resolucao da base da API passou a ser centralizada em runtime e reutilizada tanto por `apiFetch` quanto pelo client gerado (`@workspace/api-client-react`). Em hosts `adops-campanhas-portais.pages.dev`, quando `VITE_API_BASE_URL` nao estiver presente, o frontend passa a usar automaticamente `https://adops-api-public.leandro471.workers.dev`.
- O bootstrap do app tambem passou a registrar o token de operador do navegador no client gerado, preparando o uso seguro de mutacoes protegidas em ambiente publico.
- A acao de `Gerar print` no detalhe da insercao ja opera como job remoto `print-single` no trilho Worker -> Queue -> runner -> API privada no VPS.
- Suite publica rerodada apos os ajustes: `22/22` aprovados, incluindo dashboard, campanhas, detalhe da campanha `840`, insercoes, detalhe da insercao `857`, sincronizacao, auditoria, configuracoes, nova campanha, `sync-planilha`, `print-batch`, retroativo por insercao, `print-single`, status publico da insercao e exportacao ZIP.
- Leitura honesta do estado: o fluxo principal publico homologado (UI + leitura + jobs protegidos + ZIP) ja nao depende mais da maquina local. O que segue local esta concentrado em tooling de deploy/auditoria, fallbacks de desenvolvimento e contingencia readonly por snapshot.
- Foi criado um runbook operacional especifico do ambiente hospedado (`Pages + VPS`) com rotina de gestor, rotina de administrador, sinais de sucesso, tratamento de incidentes e comando padrao para rodar a suite publica de validacao.
- Foi gerado um pedido tecnico especifico para a frente `Cloudflare + Analytics por API`, pronto para repasse ao agente da plataforma local, cobrindo consolidacao da publicacao, contrato de endpoints, jobs e artefatos por PI.

## 2026-05-02 - Moldura Windows/Chrome v4 documentada e publicada
- A moldura oficial dos prints passou para `windows11-chrome-light-similar-v4`.
- O topo do Chrome agora e claro e nao carrega mais icone/titulo fixo de Wikipedia.
- A aba ativa e renderizada por campos dinamicos:
  - `tabSurface`
  - `tabIcon`
  - `tabTitle`
- O rodape com data/hora e a barra de rolagem real foram preservados.
- Foram criados documentos tecnicos:
  - `docs/spec-prints-moldura-windows-v4.md`
  - `docs/harness-prints-moldura-windows-v4.md`
- Foi criado harness executavel:
  - `pnpm --dir scripts run harness:prints-windows-frame-v4`
- Gate importante: a mudanca da moldura nao altera auditoria de slot, preview retroativo, selecao de frame ou regras por site.

## 2026-05-28 - PIs novas OMT sincronizadas, publicadas e evidenciadas
- PIs processadas:
  - `PI 14414- PREF CBA` / campanha `889` / insercao `1390` / OMT HOME 1.
  - `PI 16436- TCE` / campanha `890` / insercoes `1391` OMT topo e `1392` OMT interno de noticia.
  - `PI 14415- PREF CBA` / campanha `893` / insercao `1396` / OMT HOME 1 / inicio em `2026-06-01`.
- O monitor Drive e o `sync-planilha` cadastraram as campanhas/insercoes, mas as insercoes chegaram sem `mediaUrl` porque o AdRotate ainda nao estava vinculado.
- Correcao operacional aplicada:
  - reaproveitado o anuncio AdRotate `86` para `1390`;
  - criados os anuncios AdRotate `87`, `88` e `89` para `1391`, `1392` e `1396`;
  - importadas as midias `pi-16436-radar-825x120-1.gif` e `pi-16436-radar-728x90-1.gif` para o Spaces do OMT;
  - atualizadas as insercoes no AdOps para `publicado_no_site` com `bannerPublicadoNoSite=true`;
  - adicionado alias singular `INTERNO DE NOTICIA` para `OMT / groupId 9`.
- Evidencias geradas e auditadas:
  - `1390`: `2026-05-25`, `2026-05-26`, `2026-05-27`, `2026-05-28`.
  - `1391`: `2026-05-27`, `2026-05-28`.
  - `1392`: `2026-05-27`, `2026-05-28`.
  - `1396`: `2026-06-01`.
- Todas foram reenviadas ao Telegram via `/ops/resend-print`.
- Pasta local de entrega: `/Users/leandrobosaipo/Downloads/adops-novas-pis-2026-05-28`.

## 2026-05-28 - PI 16098 AFL Governo sincronizada e retroativos completos
- Campanha existente localizada no AdOps:
  - campanha `866`;
  - `PI 16098- GOV`;
  - cliente `GOVERNO`;
  - portal `AFL`.
- Insercoes corrigidas e vinculadas ao AdRotate:
  - `1269`: `MEGABANNER HOME 1`, periodo `2026-05-08` a `2026-05-20`, anuncio AdRotate `24`;
  - `1270`: `MEGABANNER TOPO`, periodo `2026-05-21` a `2026-05-28`, anuncio AdRotate `25`.
- O Drive foi consultado por `16098` e nao retornou nova pasta/arquivo; a PI ja existia no AdOps, mas estava sem `bannerPublicadoNoSite` e sem todos os retroativos.
- Corrigido o vinculo operacional AdOps x AdRotate e marcadas as insercoes como publicadas no site.
- Evidencias retroativas conferidas:
  - `1269`: 13/13 datas validas;
  - `1270`: 8/8 datas validas;
  - total: 21/21 PNGs com `hasEvidenceForDate=true`, `hasValidUrl=true`, `isReachable=true` e `audit.ok=true`.
- Pasta local de entrega: `/Users/leandrobosaipo/Downloads/PI_16098_AFL_GOVERNO_evidencias_2026-05-28`.
- Ajuste tecnico no capturador: quando o AdRotate troca o no temporario marcado com `data-adops-capture-slot`, a auditoria agora mede o seletor operacional original como fallback antes de acusar `slot_position_mismatch`. A regra de slot visivel continua obrigatoria.

## 2026-05-28 - PIs 16431 e 16434 Perrengue publicadas e evidenciadas
- PIs processadas a partir do Drive:
  - `PI 16431` / arquivo `mesastecnicas_hospital_825x120.gif` / PDF `PI_16431_SITE_PERRENGUE_MATO_GROSSO_-_CUIAB_.pdf`;
  - `PI 16434` / arquivo `825x120.gif` normalizado localmente como `PI_16434_radar_825x120.gif` / PDF `PI_16434_SITE_PERRENGUE_MATO_GROSSO_-_CUIAB_.pdf`.
- Insercoes canonicas usadas para evidencia:
  - `1413` / campanha `899` / `PI 16431- TCE` / campanha `MESAS` / `PERRENGUE` / `MEGABANNER TOPO`;
  - `1414` / campanha `900` / `PI 16434- TCE` / campanha `RADAR` / `PERRENGUE` / `MEGABANNER TOPO`.
- Foram encontrados cadastros brutos duplicados/incompletos (`1403`, `1404`, `1405`, `1406`) sem midia. Eles nao foram usados para evidencia para evitar duplicidade operacional.
- Correcao operacional aplicada:
  - midias importadas no WordPress do Perrengue e copiadas manualmente para `/home/perrengu/public_html/app/uploads/2026/05/`;
  - criados os anuncios AdRotate `139` e `140` no grupo `1`;
  - insercoes `1413` e `1414` atualizadas no AdOps com `bannerPublicadoNoSite=true` e `statusNormalizado=publicado_no_site`;
  - URLs de midia foram salvas com cache buster `?v=1780001408` porque o Cloudflare havia cacheado 404 nas URLs sem query string antes da copia fisica.
- Evidencias geradas e auditadas:
  - `1413`: `2026-05-27`, `2026-05-28`, `2026-05-29`, `2026-05-30`, `2026-05-31`;
  - `1414`: `2026-05-27`, `2026-05-28`, `2026-05-29`, `2026-05-30`, `2026-05-31`;
  - total: 10/10 PNGs com `hasEvidenceForDate=true`, `hasValidUrl=true`, `isReachable=true` e `audit.ok=true`.
- Pasta local de entrega: `/Users/leandrobosaipo/Downloads/PI_16431_16434_PERRENGUE_evidencias_2026-05-28`.
