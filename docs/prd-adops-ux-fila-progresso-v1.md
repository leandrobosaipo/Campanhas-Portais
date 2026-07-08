# PRD AdOps UX Fila + Progresso v1

## 1) Problema

A operação de AdOps precisa entender rapidamente:

- o que está rodando agora,
- o que está na fila,
- quanto falta para terminar,
- quando acionar fallback manual.

Sem isso, o time perde tempo em polling manual, abre incidentes falsos e atrasa entrega.

## 2) Objetivo

Padronizar a experiência de fila operacional e progresso de jobs no painel AdOps, com linguagem única e fallback explícito quando a API não entrega todos os campos.

## 3) Escopo v1

Incluído:

- Contratos de leitura para `QueueOverview` e `JobProgress`.
- Regras de labels por `kind` e status.
- Regras de fallback para campos nulos, ausentes ou inválidos.
- Harness de validação técnica com gates críticos (typecheck, build, testes locais relevantes).

Fora do escopo:

- Mudança visual ampla de layout.
- Novo tipo de job além dos já suportados.
- Mudanças em infraestrutura (VPS, filas externas, WebSocket).

## 4) Jornadas operacionais

### Jornada A: Operador de plantão

1. Abre a fila operacional.
2. Vê job atual (`now`) com status e progresso.
3. Confirma próximos jobs da fila.
4. Se progresso incompleto, usa fallback textual.
5. Decide aguardar ou escalar.

Resultado esperado:
- decisão em menos de 60s sem consultar logs brutos.

### Jornada B: Líder operacional

1. Acompanha totais (`running`, `queued`, `failedToday`).
2. Detecta gargalo por acúmulo em fila.
3. Prioriza ações do turno.

Resultado esperado:
- triagem da fila em menos de 3 minutos.

### Jornada C: Falha parcial de dados

1. API retorna campos nulos/parciais.
2. UI mantém contexto mínimo (status + label + fallback).
3. Operação não para por ausência de `%` ou ETA.

Resultado esperado:
- zero bloqueio de operação por dados incompletos.

## 5) Critérios de sucesso

### Sucesso funcional

- Contratos `QueueOverview` e `JobProgress` documentados e rastreáveis.
- Labels de `kind` e status padronizados.
- Fallback definido para todos os campos críticos de progresso.

### Sucesso operacional

- Harness gera relatório versionado por timestamp.
- Harness retorna `exit code != 0` em falha de gate crítico.
- Relatório contém JSON estruturado + resumo legível.

### Sucesso de manutenção

- Sem dependência nova obrigatória.
- Sem scripts destrutivos.
- Execução local via `pnpm --dir scripts run harness:adops-ux-fila-progresso-v1`.

## 6) Riscos e mitigação

- Risco: build quebrar por regressão em pacote não relacionado.
  Mitigação: separar gate por fase e registrar falha com contexto de comando.

- Risco: testes que dependem ambiente externo gerar falso negativo.
  Mitigação: usar apenas testes locais determinísticos como gates críticos nesta v1.

- Risco: inconsistência de label por `kind`.
  Mitigação: usar tabela única de mapeamento no SPEC.

## 7) Entregáveis v1

- `docs/prd-adops-ux-fila-progresso-v1.md`
- `docs/spec-adops-fila-progresso-v1.md`
- `docs/harness-adops-ux-fila-progresso-v1.md`
- `scripts/src/harness-adops-ux-fila-progresso.mjs`
- `scripts/package.json` com script de execução do harness
