# HARNESS - ROO layout e Drive PI v2

Data: 2026-05-11

## Objetivo

Garantir que mudancas de layout, PI e evidencia nao passem sem teste minimo.

## ROO layout

Comando:

```bash
pnpm --dir scripts run harness:roo-layout-capture-v1
```

O harness:

- abre home e materia do ROO;
- tira screenshots desktop;
- le `config/adrotate-sites.json`;
- valida selectors configurados para ROO;
- falha se houver criativo ativo sem node visivel;
- gera warning quando o slot nao existe e nao ha criativo ativo.

Saida:

```text
docs/harness-reports/roo-layout-capture-v1/<timestamp>/
```

## Auditoria obrigatoria

Antes de publicar regra ou rodar lote de captura:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Falhas bloqueiam:

- selector duplicado apontando para grupo diferente;
- alias operacional duplicado;
- divergencia entre JSON e regra publicada;
- campo invalido em regra publicada.

## Runner Drive PI

Validacao de sintaxe:

```bash
node --check ops/cloudflare-remote-runner/src/runner.mjs
```

Smoke do monitor:

```bash
pnpm --dir scripts run harness:drive-pi-monitor-v1
```

## Telegram

Validacao do bot:

```bash
pnpm --dir ops/cloudflare-telegram-bot run typecheck
```

## API privada

Quando alterar contrato de campanha, insercao ou evidencia:

```bash
pnpm --filter @workspace/api-server run build
```

## Gate minimo para concluir

```bash
node --check ops/cloudflare-remote-runner/src/runner.mjs
pnpm --dir ops/cloudflare-telegram-bot run typecheck
pnpm --dir scripts run harness:roo-layout-capture-v1
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
```

