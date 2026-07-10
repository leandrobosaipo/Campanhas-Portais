# Release 2026-07-10 - Drive PI Publish e auditoria operacional

## Resumo

Esta release consolida o fluxo reutilizavel para cadastrar, publicar e auditar
campanhas vindas da planilha e de pastas do Google Drive.

## Recursos

- `POST /api/ops/jobs/drive-pi-preflight` para diagnostico sem mutacao.
- `POST /api/ops/jobs/drive-pi-folder` para intake/cadastro controlado.
- `POST /api/ops/jobs/drive-pi-publish` para orquestrar cadastro, mídia,
  AdRotate, cache/rebuild e evidencia.
- `GET /api/campaign-operations/active` para separar campanhas ativas e
  futuras e cruzar planilha, AdOps, Drive e evidencias.
- `POST /api/ops/jobs/adrotate-publish` com preview obrigatorio, atualizacao
  idempotente e validacao publica.
- Publicacao PMT via Portainer/WordPress VM8, seguida de rebuild headless.
- Resolucao de imagem, GIF, video e links encontrados em TXT ou Google Docs.
- Exclusao de Instagram, Stories, Reels, Social e bonificacoes do inventario
  de site quando `parsedPi.insertions` define o escopo.
- Evidencias aceitas apenas com checklist aprovado e sem bloqueios.

## Ganhos de conhecimento incorporados

1. Arquivo `.xlsx` armazenado como Office no Drive nao funciona na API nativa
   do Google Sheets. O parser canonico deve baixar o arquivo bruto.
2. Um Google Doc sem titulo pode conter a unica URL de destino ou download do
   video e precisa entrar na resolucao de mídia.
3. Campanhas futuras devem ser verificadas pelo anuncio administrativo,
   `adId`, `groupId` e periodo. Ausencia no HTML antes do inicio e correta.
4. Em grupo com rotacao, uma unica resposta da home nao comprova ausencia.
   Use a URL de verificacao do job e a captura individual. Evidencia aprovada
   prevalece sobre uma amostra aleatoria do grupo no diagnostico consolidado.
5. No PMT, publicar no WordPress nao basta: o rebuild headless precisa terminar
   com `lastStatus=ok` antes de gerar evidencia.
6. O runner sincroniza o helper AdRotate canonico antes de publicar para evitar
   comportamento diferente entre portais.

## Fluxo recomendado

```text
planilha + Drive/PDF/TXT
  -> drive-pi-preflight
  -> drive-pi-publish
  -> adId/groupId/periodo
  -> cache ou rebuild PMT
  -> HTML publico
  -> print-single/backfill
  -> validate-proof
```

## Criterios de aceite

Campanha ativa:

- encontrada na planilha e no AdOps;
- mídia publica acessivel;
- anuncio AdRotate no grupo correto;
- HTML de verificacao encontra mídia e anuncio;
- evidencia `audited` e checklist aprovado.

Campanha futura:

- encontrada em `upcomingItems`;
- AdOps com mídia e periodo corretos;
- preview/aplicacao retorna anuncio e grupo;
- nao aparece antes da data em portal dinamico;
- evidencia passa a ser obrigatoria no primeiro dia de veiculacao.

## Documentacao viva

- Quickstart: `GET /api/ops/quickstart.html`
- Catalogo: `GET /api/ops/api-catalog.html`
- Swagger: `GET /api/ops/docs`
- OpenAPI: `GET /api/ops/openapi.json`
- Runbook: `docs/adops/ops-api-runbook.md`

## Relatorio operacional desta release

- Auditoria publicada: `https://sites.codigo5.com.br/reports/adops-campanhas-ativas-2026-07-10/`
- Resultado: 14/14 campanhas ativas confirmadas e 3/3 proximas entradas
  programadas no AdRotate.
