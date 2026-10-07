# Reconstrução histórica — aceitação técnica do relatório

Política technical-audit-v1: reconstrução com auditoria canônica aprovada e proveniência correlacionada pode completar o relatório sem aceite documental separado. Isso não declara aceite externo nem comprova sozinho veiculação passada.

## Compatibilidade

Rotas e nomes dos estados existentes permanecem. Dias reconstruídos preservam status=reconstruction e captureClass=historical_recovery. Os campos aditivos acceptancePolicy, technicalAccepted, requiresDocumentaryAcceptance=false e provenanceStatus são a fonte de decisão do consumidor atualizado. documentaryStatus é alias legado deprecated; seu valor reconstruction_requires_acceptance identifica historicamente a origem, não estabelece obrigação na política nova. O filtro documentary_pending continua disponível para origem/validação não confiáveis; reconstrução aceita tecnicamente fica complete sem esse bloqueio. Clientes gerados e relatório são publicados juntos.

## Gates preservados

Falhas de auditoria, proveniência desconhecida e correlação canônica ausente não são promovidas. Gates editoriais/corte de notícias/criativo/frame/checklist/hash permanecem. Nenhuma metadata, timestamp, PNG, cadastro ou anúncio é reescrito por esta política. Capturada em é o instante real correlacionado; date é a data representada. Relógio v2 legado e v3 reconstrução real mantêm seus contratos/testes separados.

Teste real:3058 23–24/09/2026 (2 banners),3059 23–27/09/2026 (5vídeos); preserve3050 23–28/09 (6OMT). Vídeo publicado28/09 é informação histórica preservada; imagens anteriores são reconstruções.

## Apresentação v4 — decisão de 06/10/2026

A reconstrução v4 apresenta requestedCaptureAt nos dois relógios do PNG, sem
carimbo adicional. capturedAt e reconstruction.reconstructedAt permanecem reais
e correlacionados com o job. A origem e o instante real continuam na API e no
relatório. Nenhuma interpretação v2/v3 é alterada; a v3 preserva seu relógio real
na moldura. historicalDisplayConfirmed=false não muda: não houve comprovação
independente de veiculação passada. Gates técnicos/editoriais/hash e aprovação
persistida permanecem. Ver [contrato v4](./retroactive-proof-v4/spec.md) e
[harness](./retroactive-proof-v4/harness.md); rollout depende das provas ali descritas.

Nova aprovação de candidato v4 exige o relógio original do site visível no PNG
final quando a regra do servidor o requer. Prova de texto, viewport/oclusão e
pixels deve corresponder ao mesmo artefato. Uma aprovação antiga não dispensa
essa verificação na promoção antes de arquivar o original. Não reinterpretar
canônicos legados nem adicionar carimbo para compensar relógio fora da imagem.

## Base e rollout

origin/main98ccef810a098ffc4048c9a61cbfb0748df7ef49 é ancestral da release operacional a1e66fe007f878a9153a4c82260ca217f6d78e3d, confirmada via HTTPS cod5-release.json e volumes adops_app_source_a1e66fe007f8/adops_web_public_a1e66fe007f8. Branch deriva da árvore Git desse SHA;7commits já publicados são integrados junto, sem copiar patches locais não integrados. Regressores de candidate/restore/read-only/clock cobrem esses commits. Antes de publicar: CI SHA exato, gate regras, builds e revisão. Deploy oficial conserva backup e identidade anterior para rollback; reprovar canário restaura par anterior. Relatório recebe troca atômica própria e backup do HTML anterior. Nenhum consumo external é avisado automaticamente.
