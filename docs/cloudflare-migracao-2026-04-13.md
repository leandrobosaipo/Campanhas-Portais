# Cloudflare: estado da migração em 2026-04-13

## Objetivo da sessão
- restaurar o ambiente local
- validar a prontidão do frontend para Cloudflare Pages
- criar o projeto no Cloudflare
- tentar tirar a dependência da máquina local

## O que voltou a funcionar localmente
- frontend:
  - `http://localhost:4175/`
- API:
  - `http://127.0.0.1:4011/api/healthz`

## O que foi confirmado no projeto
- o frontend do AdOps continua compatível com Pages como SPA estática
- a saída do build é:
  - `artifacts/adops/dist/public`
- o backend ainda depende de:
  - `Express`
  - `PostgreSQL`
  - rotinas `Node`
  - Playwright
  - SSH
  - DigitalOcean Spaces

## Projeto criado no Cloudflare
- conta:
  - Código5 Web
- Pages project:
  - `adops-campanhas-portais`
- URL reservada:
  - `https://adops-campanhas-portais.pages.dev`

## Fluxo de Direct Upload testado
- `GET /accounts/{account_id}/pages/projects/{project_name}/upload-token`
  - ok
- `POST /pages/assets/check-missing`
  - ok
- `POST /pages/assets/upsert-hashes`
  - ok
- `POST /pages/assets/upload`
  - falhou com `500 Worker threw exception`

## Conclusão honesta
- o frontend já pode ser hospedado em Pages
- o sistema completo ainda não pode ser considerado migrado para Cloudflare Pages
- hoje ainda falta uma API pública real do AdOps
- sem essa API pública, o frontend no Pages não opera fora da máquina local

## O que precisa existir para a migração real
1. API pública do AdOps
2. PostgreSQL acessível por essa API
3. segredos do Spaces no backend publicado
4. runner dos prints separado do Pages
5. `VITE_API_BASE_URL` apontando para a API de produção

## Próximo passo técnico correto
1. publicar a API em serviço separado
2. reexecutar o deploy do frontend para Pages com a API pública definida
3. mover os jobs de print para um runner sempre ativo

## Atualização da Fase 1

A Fase 1 de refatoração foi iniciada no backend para separar o que ainda depende da máquina local do que já pode migrar para serviços do Cloudflare.

### Entregas da fase
- extração da lógica pura de auditoria e datas para:
  - `artifacts/api-server/src/lib/capture-audit.ts`
- extração do runtime local de captura para:
  - `artifacts/api-server/src/lib/local-capture-runtime.ts`
- definição do contrato futuro do runner de prints em:
  - `artifacts/api-server/src/lib/print-runner-contract.ts`
- `routes/insertions.ts` passou a consumir esses módulos em vez de manter tudo inline

### Conclusão desta etapa
- o backend ainda não está pronto para Cloudflare Worker integral
- mas a camada mais acoplada começou a ser isolada do arquivo monolítico da rota
- isso prepara a próxima etapa, que é trocar a chamada direta do runtime local por uma porta de runner

## Atualização da Fase 1.2

A segunda etapa da Fase 1 substituiu a chamada direta do runtime local nas rotas principais por um `PrintRunnerPort` com implementação local.

### Resultado
- o contrato do runner agora já existe de forma utilizável pela API
- as rotas de captura dependem da porta, e não mais do script local diretamente
- isso reduz o retrabalho da próxima fase, que será trocar a implementação local por uma remota

## Atualização complementar — publicação parcial real no Cloudflare

- o frontend foi publicado com sucesso em Cloudflare Pages
- URL base ativa:
  - `https://adops-campanhas-portais.pages.dev`
- deployment validado nesta sessão:
  - `https://e5337cff.adops-campanhas-portais.pages.dev`

### O que essa publicação já prova
- o build do frontend está saudável
- o projeto Pages está funcional
- a autenticação com Cloudflare via credenciais locais funcionou para deploy com `wrangler`

### O que ainda não está resolvido
- `/api` no Pages ainda cai no fallback da SPA
- a API pública do AdOps ainda não foi publicada
- o sistema completo ainda depende da máquina local por causa do backend e do runner
