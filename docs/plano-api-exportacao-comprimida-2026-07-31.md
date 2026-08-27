# Plano executado — exportação auditada e comprimida

Data: 2026-07-31

## Objetivo

Entregar campanhas completas por PI e portal com:

- evidência retroativa auditada por data;
- PDF comprimido, uma evidência por página;
- imagens independentes comprimidas;
- PNG auditado original preservado;
- processamento assíncrono, idempotente e sem timeout público.

## Diagnóstico confirmado

1. `variant=web` ainda gerava PNG lossless. Em páginas fotográficas, o tamanho
   permanecia próximo ao original.
2. O export síncrono de campanhas grandes podia ultrapassar o timeout do
   Cloudflare.
3. O relay legado criava jobs fora da fila operacional consumida pelo runner.
4. Analytics era tratado como obrigatório mesmo sendo um anexo complementar.
5. O runner incluía rascunhos e aliases provisórios sem mídia na captura.
6. Uma falha transitória de rede encerrava o lote inteiro sem retry.
7. GIF em `PERRENGUE:11` usava limiar de pixels incompatível com quadros
   animados, embora o criativo e o slot estivessem corretos.

## Correções

- [x] `variant=web` gera JPEG progressivo, com largura e qualidade limitadas.
- [x] PNG original continua imutável e disponível em `variant=original`.
- [x] `full-pdf` entrega PDF e JPEGs independentes no mesmo ZIP.
- [x] job assíncrono local é consumido pelo runner oficial.
- [x] artefato é montado pela API interna e publicado no storage.
- [x] Analytics ausente não bloqueia evidências auditadas.
- [x] somente inserções publicadas e com mídia são capturadas.
- [x] rascunhos ignorados aparecem em `skippedInsertions`.
- [x] captura tem até três tentativas e consulta o status antes de repetir.
- [x] retries alternam 18:00 e 20:00 na mesma data quando o slot do preview
  não aparece no horário determinístico inicial.
- [x] regra de GIF de `PERRENGUE:11` usa quadro de origem e limiar visual
  compatível, mantendo os demais gates de identidade e conteúdo.

## Gates de produção

- [x] typecheck da API.
- [x] build da API.
- [x] build do painel.
- [x] `node --check` do runner.
- [x] auditoria de integridade das regras sem erros.
- [x] teste real de cinco imagens: 10,67 MB de PNG para 1,02 MB de JPEG
  (90,4% de economia); PDF de cinco páginas com 1,08 MB.
- [x] backup PostgreSQL antes do deploy.
- [x] volumes versionados e rollback preservado.
- [x] health, Swagger, ReDoc e release públicos em HTTP 200.
- [x] concluir os cinco jobs e validar visualmente primeira/última página.

## Resultado do lote

| PI | Portal | Datas/páginas | ZIP |
| --- | --- | ---: | ---: |
| 14609 | AFL | 28 | 10,46 MB |
| 14664 | PERRENGUE | 41 | 15,33 MB |
| 90729 | PERRENGUE | 12 | 6,29 MB |
| 90718 | AFL | 12 | 5,40 MB |
| 25206926 | ROO | 24 | 9,68 MB |

Todos os 117 dias/inserções esperados retornaram `status=audited`. Os cinco
pacotes contêm PDF com uma evidência por página, o mesmo número de JPEGs
progressivos independentes e nenhum PNG no pacote web.

## Contrato recomendado

```http
POST /api/pi-site-exports/jobs
Idempotency-Key: <chave-estavel-por-pi-site-periodo>
Authorization: Bearer <token>
Content-Type: application/json

{
  "piCodigo": "14664",
  "siteSigla": "PERRENGUE",
  "mode": "full-pdf",
  "variant": "web",
  "pdfMaxWidth": 1920,
  "pdfQuality": 68,
  "pdfResolution": 120,
  "imageMaxWidth": 1600,
  "imageQuality": 72
}
```

Consultar `GET /api/pi-site-exports/jobs/{jobId}` até `status=completed` e
baixar por `GET /api/pi-site-exports/jobs/{jobId}/download`.
