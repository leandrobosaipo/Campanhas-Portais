# Runbook - ROO layout e Drive PI v2

Data: 2026-05-11

## Fluxo operacional

```text
Google Drive
  -> adops-drive-pi-monitor no Mac Mini
  -> Worker /api/ops/drive-pi-events
  -> job drive-pi-ingest
  -> runner AdOps
  -> parse PI
  -> AdOps
  -> planilha
  -> AdRotate
  -> evidencia
  -> Telegram
```

## Quando chegar PI nova

1. Monitor detecta arquivo/pasta nova ou alterada.
2. Worker recebe evento assinado.
3. Worker deduplica `eventId`.
4. Worker cria job `drive-pi-ingest`.
5. Runner baixa metadados/arquivo.
6. Runner salva original e hash.
7. Runner extrai campos da PI.
8. Runner valida campos obrigatorios.
9. Runner cria ou localiza campanha.
10. Runner cria ou localiza insercao.
11. Runner atualiza midia, periodo e link de destino quando existir.
12. Runner sincroniza planilha.
13. Runner reconcilia AdRotate.
14. Runner confere evidencia.
15. Runner envia Telegram.

## Se a PI ja existir

Nao duplicar.

Fazer:

- conferir campanha;
- conferir insercoes;
- atualizar campos ausentes;
- preservar link de destino;
- conferir evidencia por data;
- gerar evidencia ausente;
- notificar Telegram como duplicidade evitada.

## Se faltar link de destino

Registrar como alerta operacional.

Nao inventar URL.

Se a campanha depender do link para publicacao, marcar `needs_review`.

## Se houver erro real

Telegram deve trazer:

- status;
- nome do arquivo;
- caminho no Drive;
- PI quando conhecida;
- campanha quando conhecida;
- campos faltantes;
- mensagem tecnica resumida;
- acao sugerida.

Nunca enviar:

- token;
- header de autorizacao;
- link privado com segredo;
- JSON de conta de servico.

## ROO - regra atual

Para desktop:

```text
ROO:1 -> div.hidden.lg\:block .g.g-1
ROO:2 -> .g.g-2
```

Slots atualmente sem criativo/node:

```text
ROO:3
ROO:6
ROO:8
```

Eles sao warning ate haver criativo ativo.

## Rollback de regra ROO

1. Conferir regra publicada no painel/API.
2. Voltar selector anterior apenas se o layout tambem voltou.
3. Rodar harness ROO.
4. Rodar auditoria de captura.
5. Gerar evidencia de teste.

## Comandos

```bash
pnpm --dir scripts run harness:roo-layout-capture-v1
pnpm --dir scripts run audit:capture-rules-integrity
node --check ops/cloudflare-remote-runner/src/runner.mjs
pnpm --dir ops/cloudflare-telegram-bot run typecheck
```

## Publicacao 2026-05-11

Servicos atualizados:

```text
codigo5_adops-api
  imagem: easypanel/codigo5/adops-campanhas-portais:codex-roo-drivepi-20260511

codigo5_adops-runner
  imagem: easypanel/codigo5/adops-campanhas-portais:codex-roo-drivepi-runner-20260511b
  DRIVE_PI_MONITOR_ENABLED=false
  GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=/run/secrets/google-drive-service-account.json

adops-telegram-bot
  worker version: 156cbeb1-9e9e-40fb-9754-df2ca1db29f9
```

Backup remoto antes da troca:

```text
/etc/easypanel/projects/codigo5/adops-campanhas-portais/backups/codex-roo-drivepi-20260511_190556
```

Validacao de producao:

```text
API: running 1/1
Runner: running 1/1
API local autenticada: OK
Runner: pdftotext instalado
Runner: conta de servico Drive legivel
Runner: sem invalid_grant apos troca
Telegram Worker: deploy OK, healthz OK, webhook OK
```
