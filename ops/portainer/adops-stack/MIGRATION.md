# Migração AdOps para Mac Mini Portainer

## Ordem de corte

1. Subir `adops-postgres` vazio.
2. Migrar dump do banco legado.
3. Subir `adops-api` e validar `/api/healthz`.
4. Subir `adops-runner` com mutações controladas.
5. Subir `adops-web` apontando para `adops-api.codigo5.com.br`.
6. Migrar `adops-drive-pi-monitor` apenas depois de copiar estado e pausar o container standalone.
7. Manter Worker/Pages/EasyPanel como rollback por 72h.
8. Só então planejar remoção de compute legado.

## Proibido nesta migração

- Desligar Worker/Pages/EasyPanel antes da janela de observação.
- Copiar secrets para Git.
- Usar Cloudflare Worker ou Pages como novo destino final.
- Promover Telegram container antes do adaptador Node.
- Ativar `phase2-drive-monitor` enquanto o `adops-drive-pi-monitor` standalone ainda estiver rodando.

## Gate de go/no-go

Go:

- Portainer endpoint `3 local` online.
- Stack `adops` com API/Web/Runner healthy ou running.
- Banco restaurado com contagens iguais.
- Painel abre em navegador real.
- Runner processa job controlado.
- Telegram legado continua funcionando ou substituto validado.

No-go:

- Divergência de contagem em tabelas críticas.
- `capture-rules-integrity` com erro.
- `adops-api` sem health.
- Logs com falha de banco, storage ou token ausente.
- Telegram sem prova de entrega humana visível.
