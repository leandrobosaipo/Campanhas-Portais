# Fulfillment completo de campanha

## Objetivo

Este é o contrato canônico para concluir uma campanha por PI e portal sem o
operador ou o agente encadear endpoints. O fluxo reutiliza a fila `ops_jobs` e
o runner existente; não adiciona banco, fila ou orquestrador externo.

## Criar o job

```http
POST /api/campaign-fulfillments/jobs
Authorization: Bearer <OPS_API_TOKEN>
Idempotency-Key: fulfillment:90729:PERRENGUE:v1
Content-Type: application/json

{
  "piCodigo": "90729",
  "siteSigla": "PERRENGUE",
  "sendTelegram": true
}
```

`placement` é opcional. Quando omitido, todas as posições da PI no portal são
processadas. Para corrigir uma campanha de aba mensal anterior, informe também
`campaignDate` com uma data dentro do período (por exemplo, `2026-07-15`). A
mesma chave retorna o job existente e impede duplicidade.

## Etapas

1. `source_verified`: valida PI e portal.
2. `refreshing_drive`: atualiza o snapshot quando necessário.
3. `syncing_sheet`: sincroniza a planilha pelo script oficial.
4. `deduplicating`: resolve inserções canônicas por PI, portal, período e posição.
5. `linking_media`: aplica apenas uma mídia exata e segura do Drive.
6. `publishing`: publica pelo adaptador AdRotate do portal e limpa cache.
7. `capturing_and_auditing`: gera datas faltantes/invalidas e valida checklist.
8. `materializing_source_proofs`: gera recorte da linha e prévia do PDF da agência.
9. `completed`: entrega ZIP, PDFs por posição, dossiê e Telegram.

Erros transitórios das atividades externas têm tentativas limitadas. Conflitos
de fonte, mídia ambígua ou checklist reprovado encerram o job como falha visível;
nada é escolhido por aproximação.

## Consultar

```http
GET /api/campaign-fulfillments/jobs/{jobId}
GET /api/campaign-fulfillments/jobs/{jobId}/report
GET /api/campaign-fulfillments/jobs/{jobId}/report.pdf
```

O status JSON inclui `stage`, `result.execution.checklist`, operações por
posição, publicações, evidências, artefatos, fontes e divergências. O relatório
HTML é responsivo e o PDF usa o mesmo conteúdo.

O container oficial já inclui Chromium. Em execução local fora do container,
`ADOPS_CHROMIUM_EXECUTABLE_PATH` pode apontar para um Chrome/Chromium existente.

## Contrato dos arquivos

- ZIP: somente JPEGs progressivos, organizados por posição.
- PDF: um arquivo independente por posição, fora do ZIP.
- nomes externos: `PI-<codigo>-<portal>` e posição; sem qualificadores de estado.
- fontes: recorte da planilha e primeira página do PDF da agência publicados no dossiê.
- Telegram: ZIP e PDFs enviados quando `sendTelegram=true`.

## Compatibilidade

`POST /api/pi-site-exports/jobs` continua disponível para regenerar somente a
entrega quando cadastro, mídia e publicação já estão corretos. Para uma nova
campanha ou correção completa, use o fulfillment.

## Testes obrigatórios

```bash
pnpm --dir scripts run test:ops-openapi-contract
ADOPS_RUNNER_TEST_MODE=1 node --test scripts/src/test-campaign-fulfillment-runner.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
uv run --with-requirements ops/fastapi-docs/requirements.txt -- python ops/fastapi-docs/test_openapi.py
```
