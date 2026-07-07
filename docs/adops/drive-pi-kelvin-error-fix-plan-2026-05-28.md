# Plano de correcao - erro Kelvin no Drive PI

Atualizado em: 2026-05-28

## Diagnostico

Erro visto no log do servidor:

```text
[drive-pi-monitor] erro: Worker recusou evento: 500 erro
```

Leitura correta:

- o monitor conseguiu ler a pasta do Google Drive;
- a falha aconteceu ao enviar um evento para o Worker publico;
- o log antigo nao trazia arquivo, caminho nem detalhe suficiente;
- um evento ruim podia abortar a varredura inteira;
- a listagem de jobs do Worker nao aceitava `drive-pi-ingest` no filtro `kind`.

Teste vivo executado:

- `POST /api/ops/drive-pi-events` com pasta sintetica retornou `202`;
- repetir o mesmo evento retornou `duplicate=true`;
- o job `drive-pi-ingest` foi processado pelo runner `runner-vps-1`;
- o stage final foi `needs_review`, como esperado para pasta sem PI real.

## Correcao tecnica

1. Centralizar a allowlist de jobs do Worker em `OPS_JOB_KINDS`.
2. Incluir `drive-pi-ingest` na listagem `/api/ops/jobs?kind=...`.
3. Melhorar o monitor standalone:
   - continuar a varredura quando um evento falhar;
   - registrar `driveFileId`, `path` e erro resumido;
   - nao gravar no state o item que falhou, para tentar de novo no proximo ciclo.
4. Adicionar teste `test:drive-pi-event-flow`:
   - modo contratual local sempre ativo;
   - modo vivo opcional com `ADOPS_DRIVE_PI_LIVE_SMOKE=true`.

## Testes obrigatorios

Rodar antes de pedir novo teste manual:

```bash
pnpm --dir scripts run test:drive-pi-event-flow
ADOPS_DRIVE_PI_LIVE_SMOKE=true pnpm --dir scripts run test:drive-pi-event-flow
pnpm --dir scripts run harness:drive-pi-monitor-v1
pnpm --dir scripts run harness:pi-automation-v3
pnpm --dir scripts run audit:capture-rules-integrity
```

## Plano de rollout

1. Publicar o Worker publico com a correcao de allowlist.
2. Redeployar o container `adops-drive-pi-monitor` pelo script `ops/portainer/deploy-drive-pi-monitor.mjs`.
3. Conferir logs do monitor:
   - esperado: `verificado: X item(s), Y evento(s) enviado(s), 0 falha(s)`;
   - se houver falha, o log precisa mostrar `driveFileId` e `path`.
4. Rodar o teste vivo.
5. Conferir progresso do job sintetico.
6. So depois pedir validacao do Kelvin com uma PI real.

## Criterio de aceite

- nenhum teste manual externo e pedido antes do live smoke passar;
- um evento duplicado retorna `duplicate=true`;
- pasta sem PI real termina em `needs_review`, nao em erro generico;
- falha de um item nao impede envio dos demais;
- logs permitem identificar qual arquivo/pasta falhou.
