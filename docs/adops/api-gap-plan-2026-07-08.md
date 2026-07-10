# Plano de Fechamento - Lacunas API AdOps 2026-07-08

## Diagnostico

- `POST /api/ops/jobs/sync-planilha` esta documentado, mas a API viva responde `404`.
- `GET /api/sync/planilha/preview` existe, mas falha no container com `spawnSync uvx ENOENT`.
- `GET /api/ops/jobs?kind=drive-pi-preflight` e `kind=drive-pi-folder` retornaram itens de outros tipos, indicando filtro inconsistente.
- `POST /api/ops/jobs/telegram-send-evidence` criou job, validou checklist, mas falhou no reenvio por bridge com `Telegram resend-print falhou: 500`.
- O envio direto via Telegram funcionou para a evidencia Iguá depois da checklist aprovada.

## Acao Recomendada

1. Publicar `sync-planilha` como job operacional real em `/api/ops/jobs/sync-planilha`.
2. Instalar `uvx` ou remover a dependencia de `uvx` do fluxo `sync-planilha-latest.ts` no runtime Docker.
3. Corrigir o filtro `kind` em `GET /api/ops/jobs`.
4. Adicionar `GET /api/campaign-intake/status` consolidando:
   - pastas Drive recentes;
   - planilha sincronizada;
   - campanhas/insercoes AdOps;
   - status de publicacao;
   - cobertura de evidencia por periodo.
5. Corrigir `telegram-send-evidence` para:
   - usar envio direto quando `TELEGRAM_BOT_TOKEN` e `TELEGRAM_DEFAULT_GROUP_ID` estiverem presentes;
   - ou corrigir o bridge `/ops/resend-print`;
   - registrar `message_id` no resultado do job.
6. Adicionar endpoint de auditoria operacional:
   - `GET /api/audit-checklists/coverage?date=YYYY-MM-DD`
   - retorna campanhas ativas, datas faltantes, bloqueios e regra resolvida.

## Como Testar

1. `POST /api/ops/jobs/sync-planilha` deve criar job e terminar `completed`.
2. `GET /api/ops/jobs?kind=drive-pi-ingest` deve retornar somente `drive-pi-ingest`.
3. `GET /api/audit-checklists/coverage?date=2026-07-08` deve listar apenas insercoes com periodo ativo na data.
4. `POST /api/ops/jobs/telegram-send-evidence` deve concluir `completed` com `message_id`.

## Impacto

- Reduz dependencia de Codex/manual para comparar planilha, Drive e AdOps.
- Impede campanha ativa sem evidencia auditada.
- Fecha o ciclo: Drive/planilha -> cadastro -> publicacao -> checklist -> evidencia -> Telegram.
