# PRD - Automacao AdOps PI v3

## Objetivo

Automatizar o intake de PI e a geracao de evidencias retroativas sem duplicar campanha, insercao ou anuncio em WordPress/AdRotate.

O fluxo deve aceitar entrada por Drive, WhatsApp, e-mail, planilha e AdRotate, mantendo rastreabilidade por fonte e bloqueando mutacao automatica quando houver conflito.

## Problema

Hoje a PI pode chegar por caminhos diferentes. Quando um anexo nao sincroniza, a operacao fica sujeita a:

- campanha duplicada;
- banner correto fora da pasta da PI;
- evidencia gerada com frame ruim de GIF;
- print retroativo fora da faixa de horario;
- divergencia entre planilha, AdOps e AdRotate.

## Escopo

Inclui:

- monitor automatico de Drive;
- intake manual auditavel para WhatsApp;
- intake rastreavel de e-mail/PDF;
- reconciliacao com planilha;
- deduplicacao com AdOps e AdRotate;
- evidencias retroativas;
- normalizacao de GIF apenas para captura;
- harness read-only.

Nao inclui:

- publicacao automatica de PNG estatico no lugar do GIF;
- alteracao de credenciais;
- mutacao direta feita por IA;
- envio em massa por Telegram/WhatsApp.

## Hierarquia de fonte

1. PDF/e-mail da PI.
2. Pasta Drive da PI.
3. Planilha.
4. AdOps.
5. AdRotate/portal.
6. WhatsApp como evidencia operacional quando a midia chegou fora do Drive.

## Regras de sucesso

- Uma PI completa gera ou atualiza a campanha correta uma unica vez.
- Midia nova nao duplica anuncio ja publicado.
- Evidencia retroativa respeita data e faixa de horario.
- GIF continua publicado como GIF.
- Captura pode usar frame normalizado com `captureOnly=true`.
- Conflito entra em `needs_review`, nao em mutacao automatica.
- Agente IA pode preencher `parsedPi`, mas auto-apply so ocorre quando scripts deterministas validam todos os campos e as flags operacionais estao habilitadas.

## Metricas

- Total de entradas processadas por fonte.
- Total de deduplicacoes positivas.
- Total de conflitos.
- Tempo ate evidencia retroativa.
- Falhas por causa: Drive vazio, midia ausente, periodo conflitante, GIF sem frame util.
