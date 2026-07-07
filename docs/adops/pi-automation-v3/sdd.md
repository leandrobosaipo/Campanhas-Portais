# SDD - Spec Driven Development PI v3

## Decisoes confirmadas

- A pasta atual do projeto e `/Users/leandrobosaipo/Projetos/AdOps`.
- Docs v1/v2 sao historicas.
- A automacao nova deve ser idempotente.
- GIF usa estrategia `capture-only`.
- IA e etapa assistida de analise; nunca muta sozinha.
- Auto-apply so ocorre depois de validacao deterministica e flags explicitas.

## Requisitos funcionais

- RF1: monitorar Drive e registrar eventos deduplicados.
- RF2: permitir intake manual de WhatsApp/e-mail com trilha de fonte.
- RF3: reconciliar PI com planilha, AdOps e AdRotate.
- RF4: gerar evidencias retroativas com data e faixa de horario.
- RF5: normalizar GIF de muitos frames curtos somente no DOM da captura.
- RF6: enviar evidencias no Telegram com identificacao.

## Requisitos nao funcionais

- Idempotencia obrigatoria.
- Logs claros por `piCodigo`, `source`, `sha256` e `insertionId`.
- Timeout e retry em chamadas externas.
- Mutacao bloqueada por padrao em harness.
- Nenhum token ou segredo nos relatorios.

## Guardrails

- Campo vindo de IA recebe confianca e citacao.
- Conflito sempre vai para `needs_review`.
- Planilha nunca sobrescreve PDF/e-mail da PI.
- WhatsApp nao substitui Drive; ele documenta excecao operacional.
- AdRotate nao cria duplicata se ja houver anuncio vinculado.
