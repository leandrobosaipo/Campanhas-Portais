# Fila de campanhas da planilha aguardando mídia

## Objetivo

Cadastrar as novas campanhas da planilha imediatamente e deixá-las aguardando a mídia da agência. Quando o arquivo aparecer no Drive, o sistema vincula a mídia e cria o job de publicação sem usar LLM e sem escrita direta no banco pelo runner.

## Fluxo

```text
planilha -> sync-planilha -> inserção sem mídia
Drive -> inventário -> media-monitor -> validação exata
       -> mídia canônica -> PATCH da inserção pela API
       -> adrotate-publish -> portal/cache/evidência
```

O serviço `adops-drive-pi-monitor` executa a verificação a cada 15 minutos. O intervalo é configurado por `ADOPS_MEDIA_MONITOR_INTERVAL_MS` e o padrão é `900000`.

O scan do Drive acontece antes da fila. O job de mídia reutiliza o snapshot persistido e não repete a leitura dos arquivos. Se o snapshot estiver ausente ou antigo, ele agenda `drive-inventory-refresh` e aguarda o próximo ciclo.

## Endpoints

Sincronizar novas entradas da planilha:

```http
POST /api/ops/jobs/sync-planilha
Idempotency-Key: sheet-sync:AAAA-MM-DD

{"mode":"latest"}
```

Executar a fila manualmente:

```http
POST /api/ops/jobs/media-monitor
Idempotency-Key: media-monitor:AAAA-MM-DDTHH:MM

{}
```

Consultar o job:

```http
GET /api/ops/jobs/{jobId}
```

## Gates de aplicação automática

A mídia só é aplicada quando todos os itens abaixo forem verdadeiros:

- inserção já existe no AdOps;
- PI e pasta do Drive correspondem sem conflito;
- portal e posição da planilha estão resolvidos;
- o Drive marcou a correspondência como segura;
- existe exatamente um arquivo do tipo esperado: imagem ou vídeo;
- não há `blockingIssues`.

Zero arquivo mantém `media_not_arrived`. Mais de um arquivo mantém `multiple_media_candidates`. A fila não escolhe por aproximação.

## Publicação

Após publicar a mídia em URL canônica, o monitor atualiza a inserção por `PATCH /api/insertions/{id}` e enfileira `POST /api/ops/jobs/adrotate-publish` com chave idempotente. O runner geral publica no AdRotate, limpa o cache e gera evidência para campanhas já ativas.

Campanhas futuras podem ser programadas no AdRotate, mas a evidência só é gerada quando o período estiver ativo.

## Segurança e custo

- Nenhum modelo de IA participa deste fluxo.
- O monitor não acessa tabelas do banco diretamente.
- Tokens e credenciais ficam apenas nos serviços do Mac Mini.
- Repetições no mesmo intervalo usam `Idempotency-Key` e não duplicam jobs.
- A imagem original do Drive é preservada; a cópia operacional vai ao CDN ou ao WordPress do portal.
