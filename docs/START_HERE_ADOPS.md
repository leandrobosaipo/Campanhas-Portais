# AdOps — Comece Aqui

## Objetivo

Este projeto administra campanhas, inserções, mídias, AdRotate, prints, auditoria de evidências, fila operacional, Telegram e relatórios relacionados aos portais da Código5.

Raiz atual:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

A pasta antiga do OpenClaw é apenas origem histórica:

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

## O que existe

- Frontend do painel AdOps.
- API e runners no Mac Mini, implantados pelo Portainer endpoint 3.
- Cloudflare apenas como DNS, Tunnel, Access e cache seletivo.
- Monitor interno como único dono das credenciais do Google Drive.
- Runner remoto de jobs.
- Integração com planilha.
- Integração com AdRotate nos portais.
- Geração de prints e retroativos.
- Auditoria de evidências.
- Notificações Telegram.
- Documentação de PRD, SPEC, HARNESS e runbooks.

## Fluxo diário

```text
PI/email/PDF/Drive
  -> intake rastreável
  -> se veio do Drive: intake_locked + Telegram inicial
  -> deduplicação AdOps/AdRotate
  -> revisão se houver conflito
  -> publicar/vincular mídia sem duplicar
  -> limpar cache
  -> gerar print retroativo
  -> auditar evidência
  -> enviar Telegram
```

## Para cadastrar nova PI

Use primeiro o runbook operacional:

- `docs/runbook-nova-pi-evidencias.md`

Para PI nova no Drive, use também o contrato v4:

- `docs/adops/pi-automation-v4-monitor-first-ai-gate.md`
- `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md`
- `docs/adops/containerized-runner-runtime-fix-plan-2026-06-03.md`

Regra atual:

```text
nova pasta/arquivo no Drive
  -> Worker registra drive-pi-ingest
  -> runner marca intake_locked
  -> Telegram avisa "processo automatico iniciado; nao cadastre manualmente"
  -> classificador separa PDF/midia faltante
  -> IA/OpenAI identifica campos quando houver contexto
  -> runner deterministico decide applied ou needs_review
```

A IA não publica, não altera planilha e não altera AdRotate. Ela só melhora a identificação de PI, campanha, veículo, formato, período e mídia.

Resumo do fluxo:

```text
PI/PDF/Drive
  -> extrair numero, periodo, veiculo, formato, midia e destino
  -> sincronizar planilha
  -> conferir campanha/insercao canonica no AdOps
  -> conferir AdRotate/portal sem duplicar anuncio
  -> sincronizar mediaUrl e link de destino
  -> limpar cache
  -> gerar evidencia atual
  -> gerar retroativos se houver dias passados
  -> auditar status + visual do banner
  -> gerar relatorio e enviar Telegram quando solicitado
```

## Fontes de verdade

1. PDF/email da PI para identidade comercial.
2. Planilha operacional para período, portal e posição.
3. AdOps.
4. AdRotate/portal como estado de publicação.
5. Pasta e mídia do Drive como localização, sujeitas a erro de nome.
6. WhatsApp como confirmação operacional quando houver conflito ou mídia fora do Drive.

Se houver divergência, não escolher no chute. Registrar o conflito e corrigir com base na PI.

## Primeiros comandos

Entrar no projeto:

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
```

Instalar dependências quando necessário:

```bash
pnpm install
```

Auditar regras de captura:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Validar compositor de print:

```bash
node --check scripts/src/capture-insertion-proof.cjs
```

## Docs essenciais

- `docs/README.md`
- `docs/PROJECT_MAP_ADOPS.md`
- `docs/runbook-nova-pi-evidencias.md`
- `docs/CREDENTIALS_AND_ENV_ADOPS.md`
- `docs/adops/runtime-topology-and-permissions.md`
- `docs/base-de-conhecimento-do-projeto.md`
- `docs/status-do-projeto.md`
- `docs/prints-retroativos.md`
- `docs/adops/evidence-web-print-export.md`
- `docs/adops/pi-automation-v3/prd.md`
- `docs/adops/pi-automation-v3/blueprint.md`
- `docs/adops/pi-automation-v3/sdd.md`
- `docs/adops/pi-automation-v3/spec.md`
- `docs/adops/pi-automation-v3/harness.md`
- `docs/adops/pi-automation-v3/tests.md`
- `docs/adops/pi-automation-v3/playbook.md`
- `docs/adops/pi-automation-v3/runbook.md`
- `docs/adops/pi-automation-v3/prompts.md`
- `docs/adops/pi-automation-v4-monitor-first-ai-gate.md`
- `docs/adops/macmini-control-plane-migration-plan-2026-06-03.md`
- `scripts/src/harness-drive-pi-monitor-first-v4.mjs`
- `docs/adops/capture-config/README.md`
- `docs/adops/ga4-monthly-report-ui/README.md`
- `docs/adops/ga4-monthly-report-ui/RUNBOOK_MAIO_2026_UI_PDFS.md`
- `docs/reports/adops-ga4-ui-rotina-maio-2026/index.html`
- `docs/spec-sync-planilha-v1.md`
- `docs/spec-reconcile-planilha-adrotate-v1.md`
- `docs/fluxos-telegram-bot-adops.md`
- `docs/operacao-pages-vps-2026-04-14.md`

`docs/adops/roo-layout-drive-pi-v2/` continua como referência histórica. Para decisões novas de automação de PI, usar `docs/adops/pi-automation-v3/` e o contrato v4 de monitor-first em `docs/adops/pi-automation-v4-monitor-first-ai-gate.md`.

## Regra de segurança

Não expor tokens ou credenciais em respostas. Quando precisar relatar `.env`, usar apenas `presente/ausente`.
