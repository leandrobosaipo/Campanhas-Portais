# Entrega de evidências para jornalista

Este guia descreve o contrato público da API AdOps para gerar a entrega de uma
PI por portal. Ele é destinado a integrações, agentes e operadores.

## Resultado esperado

Uma solicitação produz dois artefatos independentes:

- `PI-<codigo>-<portal>.zip`: somente imagens JPEG progressivas, organizadas por posição;
- `PI-<codigo>-<portal>.pdf`: uma evidência por página.

O ZIP não contém PDF, PNG, JSON, CSV, README, manifesto, auditoria ou contact
sheet. Esses dados permanecem internos ao AdOps.

Os nomes externos não usam palavras de estado como `final`, `revisada` ou
`auditada`.

## Criar a entrega

Use o endpoint assíncrono autenticado:

```http
POST /api/pi-site-exports/jobs
Idempotency-Key: <chave-estável>
Content-Type: application/json

{
  "piCodigo": "14609",
  "siteSigla": "AFL",
  "mode": "delivery",
  "variant": "web",
  "sendTelegram": true
}
```

`mode=delivery` é o padrão. A `Idempotency-Key` deve permanecer igual em uma
repetição da mesma solicitação para evitar jobs duplicados.

## Consultar e baixar

Consulte o job até `status=completed`:

```http
GET /api/pi-site-exports/jobs/{jobId}
```

Depois use:

```http
GET /api/pi-site-exports/jobs/{jobId}/download
GET /api/pi-site-exports/jobs/{jobId}/pdf
```

`/download` redireciona para o ZIP. `/pdf` redireciona para o PDF separado.
Quando `sendTelegram=true`, os dois arquivos são enviados no mesmo grupo de
mídia.

## Resposta concluída

O job concluído expõe:

- `downloadUrl`: URL do ZIP;
- `pdfUrl`: URL do PDF;
- `artifacts.zip` e `artifacts.pdf`: nome, tipo, tamanho e SHA-256;
- `telegram.ok`: resultado do envio;
- `telegram.messageIds`: mensagens criadas quando o envio é bem-sucedido.

Se o Telegram estiver indisponível, os artefatos continuam publicados e o job
retorna `telegram.ok=false`. A falha de notificação não destrói a entrega.

## Gate antes de encaminhar

Confirme:

1. `status=completed`;
2. ZIP somente com JPEGs;
3. quantidade de JPEGs igual à quantidade de páginas do PDF;
4. nomes sem palavras de estado;
5. topbar, domínio, data, hora e banner visíveis nas amostras;
6. `telegram.ok=true` quando o envio foi solicitado.

Não monte ou altere o pacote manualmente quando a API estiver disponível.

## Contrato navegável

- Swagger: <https://adops-api.codigo5.com.br/api/docs>
- ReDoc: <https://adops-api.codigo5.com.br/api/redoc>
- OpenAPI: <https://adops-api.codigo5.com.br/api/openapi.json>
