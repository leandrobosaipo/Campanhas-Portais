# Corrigir evidencias de 22/08 e 23/08 e automatizar a recuperacao

## Global constraints

- Operacoes de campanha e evidencia usam somente a API AdOps.
- Preservar evidencias aprovadas e arquivos originais; nao sobrescrever nem duplicar.
- Trabalhar e publicar somente este release isolado.
- Acompanhar cada job ate estado terminal e validar API, arquivo, relatorio e navegador.
- Captura regular de 24/08 so pode ocorrer a partir das 18h de Cuiaba.

## Task 1: Tornar a classificacao da captura imutavel

- Criar testes que reproduzam uma captura feita no proprio dia que muda de data e nao pode virar retroativa.
- Persistir e avaliar `captureClass`, `targetDate`, `capturedAt`, `sourceJobId` e `auditPolicyVersion`.
- Exigir prova editorial retroativa somente para `historical_recovery`.
- Manter os gates de midia, slot, frame, data e horario.

## Task 2: Reconciliar evidencias e status diario pela API

- Criar operacao protegida e auditavel que correlacione evidencia, horario, URL, insercao e job original.
- Restaurar como `scheduled` somente evidencias legadas comprovadamente produzidas no proprio dia.
- Fazer `GET /api/ops/daily-print-status?date=YYYY-MM-DD` respeitar a data pedida.
- Atualizar OpenAPI e clientes gerados sem quebrar respostas existentes.

## Task 3: Recuperacao automatica deterministica

- Apos o lote, comparar elegiveis com aprovadas.
- Agendar `print-single` idempotente para faltantes/invalidas em 5, 10 e 15 minutos.
- Parar ao aprovar, nunca tocar em evidencia aprovada e bloquear depois da terceira falha.
- Persistir causa humana/tecnica, job, tentativa, proxima execucao e resultado por insercao/data.
- Uma falha individual nao pode interromper o lote.
- Produzir JSON compacto para avaliacao final Terra/low; automacao normal nao usa IA.

## Task 4: Documentacao, testes e release

- Atualizar AGENTS, OpenAPI, runbook da API, relatorio e incidente.
- Rodar auditoria de regras, testes, typecheck e builds de API, Worker, runner e relatorio.
- Publicar API/Worker/runner pelo fluxo oficial e provar `cod5-release.json` e health.

## Task 5: Recuperacao operacional e aceite publico

- Pela API, reconciliar 18/18 evidencias originais de 22/08 sem recaptura quando a correlacao for comprovada.
- Pela API, revalidar e recuperar 23/08 de #2643, #1940 e #2641 sem sobrescrever validas.
- Acompanhar os mesmos jobs ate terminal e disparar atualizacao incremental apos cada aprovacao.
- Aceite: 22/08 = 18/18, 23/08 = 15/15, relatorio sem missing/invalid elegiveis, JPEG/thumbnail/modal validos e QA visual com screenshot.
