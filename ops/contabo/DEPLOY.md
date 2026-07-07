# Deploy Contabo + Easypanel — AdOps

## Objetivo
Publicar a API principal e o runner remoto do AdOps no mesmo VPS Contabo já usado por outros projetos da Código5.

## Topologia recomendada
- Cloudflare Pages: painel público
- Cloudflare Worker: leitura pública + jobs protegidos
- Contabo VPS / Easypanel Swarm:
  - `codigo5_adops-api`
  - `codigo5_adops-runner`
- PostgreSQL no Swarm: banco isolado do AdOps
- DigitalOcean Spaces: evidências e prints

## Variáveis do serviço `codigo5_adops-api`
- `PORT=4011`
- `NODE_ENV=production`
- `TZ=America/Cuiaba`
- `DATABASE_URL=postgresql://...`
- `ADOPS_PROJECT_ROOT=/app`
- `ADOPS_TSX_BIN=/app/node_modules/.bin/tsx`
- `ADOPS_GENERATED_PRINTS_ROOT=/app/tmp/generated-prints`
- `DO_SPACES_ACCESS_KEY_ID=...`
- `DO_SPACES_SECRET_ACCESS_KEY=...`
- `DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com`
- `DO_SPACES_REGION=nyc3`
- `ADOPS_SPACES_BUCKET=cod5`
- `ADOPS_SPACES_BASE_PATH=adops-prints`
- `ADOPS_INTERNAL_API_TOKEN=<token-interno-para-worker-e-runner>`
- `ADOPS_PERRENGUE_SSH_HOST=186.209.113.107`
- `ADOPS_PERRENGUE_SSH_PORT=1157`
- `ADOPS_PERRENGUE_SSH_USER=perrengu`
- `ADOPS_PERRENGUE_WP_PATH=/home/perrengu/public_html/wp`
- `ADOPS_PERRENGUE_SSH_KEY_PATH=/root/.ssh/id_rsa_perrengue_adops`
- `ADOPS_MULTISITE_SSH_KEY_PATH=/root/.ssh/id_rsa_facilnam_adops`

## Variáveis do serviço `codigo5_adops-runner`
- `TZ=America/Cuiaba`
- `DATABASE_URL=postgresql://...`
- `OPS_API_BASE_URL=https://adops-api-public.leandro471.workers.dev`
- `OPS_API_TOKEN=...`
- `PRIVATE_ADOPS_API_BASE_URL=http://codigo5_adops-api:4011`
- `PRIVATE_ADOPS_API_TOKEN=<mesmo-token-interno-da-api>`
- `CAMPANHAS_PORTAIS_ROOT=/app`
- `OPS_POLL_INTERVAL_MS=5000`
- `OPS_JOB_KINDS=sync-planilha,print-batch,print-backfill`

## Chaves SSH operacionais
- Copiar para o host:
  - `/root/.ssh/id_rsa_facilnam_adops`
  - `/root/.ssh/id_rsa_perrengue_adops`
- Garantir `chmod 600` nas chaves e no `/root/.ssh/config`.
- O runner não usa as chaves diretamente hoje, mas a reconciliação/manual fix de mídia no VPS precisa delas.

## Ordem de execução
1. Criar banco e usuário do AdOps no PostgreSQL do VPS.
2. Escrever `adops-api.env` e `adops-runner.env` em `/etc/easypanel/projects/codigo5/adops-campanhas-portais/`.
3. Rodar `ops/contabo/deploy_vps_easypanel.sh`.
4. Validar `docker service ls` e logs.
5. Executar `drizzle push` no banco remoto.
6. Validar `sync-planilha` e jobs do runner.

## Validações mínimas
- `docker service ls | grep adops`
- `docker service logs codigo5_adops-api --tail 100`
- `docker service logs codigo5_adops-runner --tail 100`
- job `sync-planilha` concluindo via Worker
- job `print-batch` saindo de `queued` para `running`

## Observações
- A API do AdOps não precisa ficar exposta publicamente para o painel funcionar nesta fase; o Pages segue falando com o Worker, e o runner fala com a API interna no Swarm.
- Se depois quisermos expor a API para manutenção, podemos adicionar proxy/roteamento no Easypanel ou um domínio próprio.
- O runtime de print precisa manter a versão do pacote `playwright` alinhada com a imagem base `mcr.microsoft.com/playwright`. Quando o pacote subiu para `1.59.1`, a imagem também precisou subir para `v1.59.1-noble`.
- Para o Perrengue, o WordPress válido para WP-CLI no servidor é `/home/perrengu/public_html/wp`. O caminho antigo com `/web/wp` não funciona para query administrativa.
