# Spec - Automacao AdOps PI v3

## Entrada normalizada

```json
{
  "source": "drive|whatsapp|email|sheet|adrotate",
  "piCodigo": "490711",
  "cliente": "ENERGISA MATO GROSSO - DISTRIBUIDORA DE ENERGIA S.A.",
  "campanha": "CONCESSAO - ENERGISA",
  "periodo": { "inicio": "2026-05-12", "fim": "2026-06-11" },
  "site": "PERRENGUE MATO GROSSO",
  "localFormato": "LATERAL 300x250",
  "media": [{ "url": null, "sha256": null, "filename": null }],
  "redirectUrl": null,
  "evidence": { "sourcePath": null, "citation": null },
  "status": "observed"
}
```

## Deduplicacao

1. Procurar campanha pelo `piCodigo`.
2. Se nao houver, procurar por cliente/campanha/competencia.
3. Procurar insercao por site, posicao e periodo.
4. Procurar anuncio AdRotate por grupo, chave externa e arquivo.
5. Se duas entidades vivas competirem pelo mesmo slot, parar em `needs_review`.

## GIF capture-only

Quando a midia publicada e GIF:

- baixar GIF original;
- calcular contraste, area nao-fundo e diferenca visual por frame;
- detectar frames curtos que nao passam em `gifMinHoldMs`;
- deduplicar cenas parecidas;
- escolher frame por seed deterministica: `insertionId + date + mediaSha256`;
- aplicar PNG apenas no DOM da captura;
- manter o GIF original publicado.

Metadados obrigatorios:

```json
{
  "captureOnly": true,
  "originalGifUrl": "https://...",
  "gifChosenFrameIndex": 3,
  "frameSelectionReason": "capture_only_short_frame_sequence",
  "syntheticHoldMs": 1200
}
```

Falha acionavel:

- `no_capture_only_gif_frame`: nenhum frame tem contraste/conteudo suficiente.
- `slot_position_mismatch`: frame escolhido nao convergiu com o DOM real.

## Mutacao

Mutacao automatica so pode ocorrer quando:

- PI esta completa;
- deduplicacao esta sem conflito;
- periodo e formato estao confirmados;
- midia foi localizada;
- AdRotate nao tem duplicata concorrente.
- `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`;
- `ADOPS_PI_AGENT_AUTO_APPLY=true`;
- campos criticos vindos do agente IA tem confianca minima e citacao.

O agente IA nunca executa mutacao. Ele produz `parsedPi` estruturado. A aplicacao continua exclusiva dos scripts deterministas do runner.

## Agente IA

Executor:

```text
OpenAI API no runner drive-pi-ingest
```

Configuracao:

```text
OPENAI_API_KEY
ADOPS_PI_AGENT_ENABLED=true
ADOPS_PI_AGENT_AUTO_APPLY=true
ADOPS_PI_AGENT_MODEL=gpt-4.1-mini
ADOPS_PI_AGENT_MIN_CONFIDENCE=0.85
ADOPS_PI_AGENT_KNOWLEDGE_FILE=docs/adops/pi-automation-v3/spm-agent-knowledge.md
```

Fluxo:

```text
Drive event -> packaging -> agent_analysis -> validacao deterministica -> applying -> sync/reconcile/evidence/telegram
```

Se OpenAI falhar, estiver sem chave, retornar conflito ou perder campo critico, o job fica em `needs_review`.
