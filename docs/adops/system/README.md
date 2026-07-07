# AdOps System Hub

Este é o hub canônico do ecossistema AdOps.

Use esta pasta para decisões novas de arquitetura, migração, operação, testes e contratos. Documentos antigos continuam como histórico, mas não devem superar os contratos daqui.

## Ordem de leitura

1. `PRD.md`
2. `SDD.md`
3. `SPEC.md`
4. `CONTRACTS.md`
5. `HARNESS.md`
6. `RUNBOOK.md`
7. `PLAYBOOK.md`
8. `PROMPTS.md`

## Decisão atual

Migrar o runtime do AdOps para o Mac Mini via Portainer em fases:

1. API, runner e banco.
2. Painel estático e domínios via Cloudflare Tunnel.
3. Telegram containerizado, somente após criar adaptador Node.
4. Redução controlada do Worker/Pages/EasyPanel legado.

Cloudflare fica permitido apenas como DNS, Tunnel e Access.

## Fontes históricas

- `docs/adops/pi-automation-v3/`
- `docs/adops/capture-config/`
- `docs/adops/evidence-monthly-report/`
- `docs/operacao-pages-vps-2026-04-14.md`
- `docs/cloudflare-pages-deploy.md`
- `ops/contabo/DEPLOY.md`

## Artefatos de deploy

- `ops/portainer/adops-stack/docker-compose.yml`
- `ops/portainer/adops-stack/Dockerfile.portainer`
- `ops/portainer/adops-stack/scripts/`
