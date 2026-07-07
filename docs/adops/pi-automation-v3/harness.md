# Harness - PI Automation v3

## Script

```bash
pnpm --dir scripts run harness:pi-automation-v3
```

## Natureza

Read-only. O harness nao cria campanha, nao altera AdRotate, nao envia Telegram e nao muda credenciais.

## Cenarios cobertos

- Drive com pasta completa.
- Drive com pasta vazia.
- Drive com PI completa analisada por agente IA em modo fixture.
- Drive com PI incompleta bloqueada por `needs_review`.
- WhatsApp com anexo local.
- E-mail com PDF/anexo simulado.
- Planilha com linha ja existente.
- AdRotate com anuncio ja publicado.
- PI duplicada.
- GIF com muitos frames curtos.

## Evidencia gerada

O script grava JSON e Markdown em:

```bash
docs/harness-reports/pi-automation-v3/
```

## Criterios de aprovado

- Docs v3 existem.
- START_HERE e PROJECT_MAP apontam para o hub v3.
- Capturador possui `captureOnly`, `originalGifUrl`, `frameSelectionReason` e `syntheticHoldMs`.
- Worker/runner mantem rotas e guardrails existentes.
- Runner possui `agent_analysis`, schema JSON, `OPENAI_API_KEY`, `ADOPS_PI_AGENT_AUTO_APPLY` e conhecimento SPM versionado.
- Campo critico sem citacao/confianca nao passa para auto-apply.
- Teste de GIF curto esta registrado no `package.json`.
