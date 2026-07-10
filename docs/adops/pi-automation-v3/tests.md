# Tests - PI Automation v3

## Validacao completa

```bash
node --check scripts/src/capture-insertion-proof.cjs
node --check ops/cloudflare-remote-runner/src/runner.mjs
pnpm --dir scripts run test:gif-source-smoke
pnpm --dir scripts run test:gif-capture-only-short-frames
pnpm --dir scripts run harness:drive-pi-monitor-v1
pnpm --dir scripts run harness:pi-import-v1
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --dir scripts run harness:pi-automation-v3
```

## GIF curto

O teste `test:gif-capture-only-short-frames` cria uma fixture local com frames de 30ms e valida:

- mais de uma cena util;
- nenhum frame passa como forte por hold;
- datas diferentes escolhem frames diferentes;
- metadados `captureOnly`;
- midia publicada nao e substituida automaticamente.

## Regressao

`test:gif-source-smoke` continua cobrindo a captura real de GIF com frames fortes, para evitar quebrar o fluxo antigo.

## Agente IA

`harness:pi-automation-v3` cobre em modo read-only:

- configs `OPENAI_API_KEY`, `ADOPS_PI_AGENT_ENABLED`, `ADOPS_PI_AGENT_AUTO_APPLY`, `ADOPS_PI_AGENT_MIN_CONFIDENCE`;
- stage `agent_analysis`;
- schema JSON estrito;
- conhecimento SPM versionado;
- bloqueio quando campo critico nao tem citacao/confianca;
- PI completa em fixture que fica aplicavel sem executar mutacao real.
