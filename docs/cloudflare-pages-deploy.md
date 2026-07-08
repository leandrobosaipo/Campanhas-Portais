# Deploy do AdOps no Cloudflare Pages

## Objetivo
Subir o frontend do AdOps em Cloudflare Pages, mantendo a API separada nesta fase e sem mascarar as dependências reais do backend.

## Arquitetura adotada nesta fase
- Frontend: Cloudflare Pages
- API: serviço separado do Pages
- Banco: PostgreSQL
- Evidências: DigitalOcean Spaces

## Motivo da arquitetura
O frontend já compila como SPA estática.
A API ainda executa rotinas Node/Playwright/SSH e não deve ser movida inteira para Pages neste momento.

## Ajustes já feitos no projeto
- `vite.config.ts` agora aceita build sem exigir `PORT` e `BASE_PATH`
- `BASE_PATH` padrão: `/`
- `PORT` padrão local: `4175`
- `_redirects` adicionado para SPA fallback
- `VITE_API_BASE_URL` já é respeitado em runtime pelo frontend

## Variáveis esperadas no Pages
- `VITE_API_BASE_URL`
  - URL pública da API do AdOps
  - exemplo: `https://adops-api.codigo5.com.br`

## Build do frontend
Diretório do app:
- `/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops`

Comando de build:
```bash
pnpm --filter @workspace/adops run build
```

Saída estática:
- `artifacts/adops/dist/public`

## Configuração sugerida no Cloudflare Pages
- Project name canônico do plano: `adops-codigo5`
- Project name criado na conta Código5 para homologação direta: `adops-campanhas-portais`
- Production branch: a branch dedicada de release
- Build command: `pnpm --filter @workspace/adops run build`
- Build output directory: `artifacts/adops/dist/public`
- Root directory: `/Users/leandrobosaipo/Projetos/AdOps`

## Domínio customizado
Objetivo final:
- `adops.codigo5.com.br`

## Observações de implantação
- O Pages entrega só o frontend
- As chamadas `/api` em produção devem ir para `VITE_API_BASE_URL`
- As rotinas de print e conciliação continuam no backend do AdOps
- O `_redirects` garante abertura correta das rotas internas da SPA

## Estado validado em 2026-04-13
- O frontend local voltou a responder em `http://localhost:4175/`
- A API local voltou a responder em `http://127.0.0.1:4011/api/healthz`
- O build estático do frontend foi gerado com sucesso em:
  - `artifacts/adops/dist/public`
- O projeto de Pages foi criado na conta Cloudflare Código5:
  - `adops-campanhas-portais`
  - URL base reservada: `https://adops-campanhas-portais.pages.dev`

## Bloqueio encontrado nesta sessão
- O Direct Upload de assets do Pages não concluiu pelo fluxo automatizado desta sessão.
- O token temporário de upload foi emitido corretamente por:
  - `GET /accounts/{account_id}/pages/projects/{project_name}/upload-token`
- Os endpoints de suporte também responderam parcialmente:
  - `POST /pages/assets/check-missing` -> ok
  - `POST /pages/assets/upsert-hashes` -> ok
- Mas o endpoint central do upload retornou erro do lado da Cloudflare:
  - `POST /pages/assets/upload` -> `500 Worker threw exception`

## Consequência prática
- O frontend pode ir para Pages.
- O backend completo ainda nao pode ser considerado migrado para Pages.
- Hoje ainda nao existe uma `VITE_API_BASE_URL` pública operante do AdOps.
- Mesmo com o frontend publicado, o painel nao ficaria funcional fora da sua máquina sem:
  - API Node publicada
  - PostgreSQL acessível pela API
  - segredos do Spaces
  - rotinas de print fora do runtime local

## Caminho correto para produção sem depender da máquina local
1. publicar a API em serviço separado
2. apontar `VITE_API_BASE_URL` do Pages para essa API
3. manter PostgreSQL gerenciado fora do Pages
4. manter a geração de prints em job worker/runner separado do Pages
5. só depois revisar o que faz sentido migrar para Workers/Hyperdrive/R2

## Checklist antes do deploy
- build do frontend ok
- API pública definida
- CORS/API base revisados
- banco e Spaces acessíveis pela API
- botões de sync e print testados no ambiente de homologação
- subdomínio `adops.codigo5.com.br` criado no Cloudflare

## Próxima fase opcional
Quando o backend estiver mais estabilizado, podemos avaliar:
- Cloudflare Workers para parte HTTP da API
- manter jobs pesados e Playwright fora do Workers
- ou separar API leve e worker de jobs
