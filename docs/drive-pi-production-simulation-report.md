# Relatorio de producao - Monitor Drive PI

Data: 2026-05-08

## Estado real

- Endpoint em producao: `POST /api/ops/drive-pi-events`
- Runner VPS em producao com:
  - job `drive-pi-ingest`
  - monitor Drive PI ativo a cada 5 minutos
  - estado persistido em `/var/lib/adops/drive-pi-monitor-state.json`
- Telegram em producao com notificacao de chegada da PI
- Rollout liberado para: `PERRENGUE`, `OMT`, `AFL`, `PNMT`, `PPMT`, `ROO`
- Fila apos testes: sem jobs `drive-pi-ingest` abertos

## Ponto critico

O Apps Script foi preparado, mas a autorizacao OAuth foi bloqueada pela conta Google:
`Este app está bloqueado`.

Para nao depender desse bloqueio, o v1 de producao foi movido para o runner VPS.
O runner consulta a pasta Drive recursivamente, compara com o estado persistido e envia
evento novo/alterado para o Worker.

## Correcao de diagnostico - 2026-05-09

Houve duas formas diferentes de acesso ao Google Drive durante os testes:

1. `Google Drive` do Codex/conector.
   - Funcionou para listar a pasta raiz `18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6`.
   - Confirmou que a raiz continha as 6 pastas de portais e que as subpastas auditadas nao tinham PI nova naquele momento.
   - Este acesso pertence ao ambiente do Codex, nao ao container do runner VPS.

2. OAuth do runner VPS.
   - E o caminho produtivo do monitor automatico a cada 5 minutos.
   - Falhou na renovacao do token com `invalid_grant` / `invalid_rapt`.
   - Isso nao prova problema de permissao da pasta Drive; prova que o refresh token do runner foi invalidado pela politica de reautenticacao do Google.

Conclusao correta:

- Drive acessivel pelo operador/conector: sim.
- Monitor produtivo do runner: depende de renovar `GOOGLE_DRIVE_REFRESH_TOKEN`.
- Nao confundir o sucesso do conector Codex com credencial produtiva valida no VPS.

## Simulacao executada

### Chegada de PI incompleta

- Job: `0788384c-1831-4fa6-bec8-2701c9d8e75e`
- Resultado: `completed`
- Stage: `needs_review`
- Telegram: enviado
- Sync planilha: pulado corretamente
- Reconcile AdRotate: pulado corretamente
- Motivo: faltavam campos obrigatorios da PI

### Chegada real via monitor Drive na VPS

- Arquivo teste criado na pasta Drive: `PI TESTE PRODUCAO MONITOR ADOPS ... .txt`
- Job: `e5eb9773-f9de-4fe0-b8e6-2e130fc9998f`
- Resultado: `completed`
- Stage: `needs_review`
- Telegram: enviado
- Dedupe do monitor: segunda varredura nao reenviou evento
- Arquivo teste: movido para lixeira apos validacao
- Motivo do `needs_review`: arquivo teste nao continha campos de PI

### PI ja existente, sem duplicar

- Campanha real usada: `#869`
- Insercao real existente: `#1274`
- Job: `036c3c70-28e4-4df1-9a3c-4b30a52537fa`
- Resultado: `completed`
- Stage: `applied`
- Campanha: ja existente
- Insercoes criadas: `0`
- Insercoes ja existentes: `1`
- Sync planilha: pulado corretamente
- Reconcile AdRotate: pulado corretamente
- Telegram: enviado
- Idempotencia do evento: segundo POST retornou o mesmo job com `duplicate=true`

## Como o monitor real esta ativo

1. O runner VPS varre a pasta `18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6`.
2. A varredura e recursiva.
3. O intervalo e de 5 minutos.
4. Primeira execucao cria baseline sem disparar jobs antigos.
5. Arquivo/pasta novo ou alterado gera evento no Worker.
6. Evento duplicado nao cria job novo.
7. O job `drive-pi-ingest` processa o evento.
8. O Telegram informa chegada, aplicacao ou pendencia.

## Resultado esperado quando chegar PI real

- Arquivo novo ou alterado no Drive gera evento.
- Worker grava historico e cria job.
- Runner valida a PI.
- Se a PI estiver completa:
  - cria ou reutiliza campanha;
  - cria insercoes faltantes;
  - nao duplica insercoes existentes;
  - roda sync planilha e reconcile AdRotate quando houver alteracao nova;
  - envia resumo no Telegram.
- Se a PI estiver incompleta ou ambigua:
  - nao cria campanha/insercao;
  - marca `needs_review`;
  - envia pendencia no Telegram.
