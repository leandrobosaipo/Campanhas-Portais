# Restauração de evidência

## Antes de substituir uma data

Guarde em um diretório privado (`chmod 700`, arquivos `chmod 600`) uma cópia da imagem original e um snapshot por data com:

- `insertionId`, data, `evidenceId`, título e `arquivoUrl` canônicos;
- a resposta de `GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD`;
- `GET /api/insertions/{id}/capture-proof/logs?date=YYYY-MM-DD`, incluindo a metadata da captura anterior cujo `uploadedUrl` corresponda à URL canônica;
- SHA-256 e tamanho da imagem local.

Confirme que a cópia privada no Spaces tem o mesmo SHA-256 e tamanho da origem antes da captura promovida. A rota de candidato deve usar `candidate=true`, `promote=false`; esse modo conserva o estado canônico e retorna o checklist vinculado ao artefato candidato.

## Restaurar os bytes arquivados

O `replacementArchive` da metadata da captura aprovada registra `sourceKey`, `archiveKey`, `sha256` e `bytes`. Use os valores daquele registro e confirme a chave canônica duas vezes:

```bash
pnpm --dir scripts run evidence:restore-archived -- \
  --env-file /Users/leandrobosaipo/Projetos/macmini/deploys/adops/adops.env \
  --bucket <bucket-confirmado> \
  --source-key <replacementArchive.sourceKey> \
  --archive-key <replacementArchive.archiveKey> \
  --sha256 <replacementArchive.sha256> \
  --bytes <replacementArchive.bytes> \
  --confirm-target-key <replacementArchive.sourceKey> \
  --public-url <URL-HTTPS-original-sem-query>
```

O comando confere o arquivo privado, preserva em temporário os bytes atuais do alvo, restaura o original, valida SHA-256 e tamanho por leitura do Spaces e por GET público com cache buster. Se qualquer verificação falhar após a escrita, restaura os bytes anteriores e verifica esse retorno. Se o rollback falhar, para com `evidence_restore_rollback_failed`; não repita às cegas.

## Restaurar URL e metadata canônicas

Se a substituição já alterou o registro AdOps, use o snapshot pré-captura salvo para a mesma data. Primeiro restaure a URL no registro de evidência existente (não crie outra linha):

```bash
curl -fsS -X PATCH \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  "https://adops-api.codigo5.com.br/api/evidences/<evidenceId>" \
  --data-binary @<payload-evidencia-original.json>
```

`payload-evidencia-original.json` contém os valores anteriores `tipo`, `titulo` e `arquivoUrl`. Depois reponha a metadata canônica completa salva antes da mutação:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $OPS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  "https://adops-api.codigo5.com.br/api/insertions/<insertionId>/capture-proof/metadata" \
  --data-binary @<payload-metadata-original.json>
```

O payload de metadata tem `{ "date": "YYYY-MM-DD", "metadata": <objeto metadata original> }`. Não use metadata do próprio candidato como snapshot anterior. Faça readback de `/api/insertions/{id}/capture-proof/status?date=...`; aceite a restauração somente quando `arquivoUrl`, `status`, `audit` e `checklistValidation` coincidirem com o snapshot, e a URL pública responder com os bytes originais.

Uma cópia privada sem restore/readback não é rollback provado. O backup de banco do deploy protege o estado integral pré-release; não restaure o banco inteiro para reverter uma única data.

## Ensaio isolado realizado em 2026-09-29

Usei a cópia local original de #3032/14-09 como fonte. Copiei seus 3.085.865 bytes para uma chave temporária, arquivei essa chave, escrevi bytes substitutos, restaurei pelo comando acima e comparei SHA-256/tamanho por readback do Spaces e GET público. SHA antes/depois: `dfb0723af990ae801d0905430cdc6bb3debff899d873e47fd625174994679e65`. Os dois prefixos de teste foram lidos vazios após limpeza. A evidência canônica e a metadata não foram tocadas.
