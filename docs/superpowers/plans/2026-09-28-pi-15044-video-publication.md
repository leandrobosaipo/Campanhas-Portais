# PI 15044 — publicar o vídeo no Perrengue

Data: 2026-09-28  
Estado: implementação local verificada; publicação do runner e da mídia ainda pendentes.

## Objetivo

Publicar o vídeo correto da PI 15044 no Perrengue, usando a inserção já existente `#3059`, sem criar campanha, inserção ou anúncio duplicado. Depois, gerar e validar uma evidência visual auditada. Publicação atual não prova veiculação em datas passadas.

## Identidade confirmada

- Campanha AdOps `#1054`: PI 15044, PREF CBA, Prefeitura de Cuiabá; agência no AdOps: Ganza.
- Inserção de vídeo `#3059`: PERRENGUE, `Video`, período 23–30/09/2026, rascunho e sem mídia na última leitura.
- Inserção de banner `#3058`: mesma campanha/período, publicada com GIF canônico.
- Pasta Drive: `/PERRENGUE/SETEMBRO/PI 15044 - ATUALIZAÇÃO`.
- MP4 candidato único: `PREF CUIABÁ - VT 30 - Atualizacao do Cadastro SUS - Alta.mp4`, Drive ID `1TVj7GZGp2oUr-ssg5B17foigL3gbd85i`, 79.265.078 bytes.
- PDF da PI lista banner e filme/VT 30 diariamente entre 23 e 30/09. Agência no PDF: RENCA. Divergência comercial fica registrada, sem alterar a mídia nem bloquear a publicação já existente.

## Diagnóstico e alteração mínima

- Preflight oficial anterior `3665805d-8069-4476-a4b3-5628459db5a3` terminou `failed` sem efeitos: `Formato operacional não possui um perfil de mídia único na configuração vigente.`
- O perfil do runner procura o texto operacional literal. O grupo 6 do Perrengue já reconhece `VIDEO`, mas o label do PDF é `PUBLI VIDEO DE 30` com possível aspas de polegadas.
- TDD: `node scripts/src/test-pi15044-video-profile.mjs` falhou antes da correção com o erro acima.
- Correção local mínima: normalizar `PUBLI VIDEO DE <duração>` (com ou sem aspas finais) para o alias canônico `VIDEO`, antes da busca existente. Não muda grupo, seletor, regras publicadas, nem o perfil MP4 passthrough.
- Depois da correção, o teste passa para ambos os rótulos; `test:drive-pi-publish-flow`, `node --check` e `git diff --check` também passam.
- `audit:capture-rules-integrity` termina com uma divergência já existente, não causada por esta alteração: `PERRENGUE:10`, alias `TOPO LATERAL HEADER 380X120` no JSON, ausente da regra publicada `#101`. O grupo 6 não diverge após usar a correção no runner sem editar aliases. Não ampliar esta tarefa para mexer no grupo 10.

## Isolamento e arquivos

- Checkout principal foi preservado sem edição; estava muito sujo.
- Worktree limpo criado sobre release ativa `98ccef810a098ffc4048c9a61cbfb0748df7ef49` em `/Users/leandrobosaipo/.codex/worktrees/pi15044-video-profile/AdOps`.
- Arquivos próprios desta etapa: `ops/cloudflare-remote-runner/src/runner.mjs`, `scripts/src/test-pi15044-video-profile.mjs` e este plano.

## Caminho oficial restante

1. Revalidar campanha, inserções, PDF/Drive, relações, fila e estado dos serviços antes de mutação.
2. Rodar testes/build necessários; commitar apenas os arquivos desta tarefa no branch isolado, sem push para `origin/main`.
3. Usar somente `ops/portainer/adops-stack/scripts/deploy-production.sh`. O script exige release SHA, backup PostgreSQL restaurável, volumes versionados e smoke/readback; registrar o backup e SHA. Se qualquer gate falhar, parar.
4. Confirmar o SHA ativo no manifest e runner/monitor prontos.
5. Enfileirar `campaign-publication-reconcile` para somente a inserção `#3059`, primeiro `mode=preflight`, depois `mode=apply` com chave estável. Aguardar o estado terminal e inspecionar ações/resultado antes de avançar.
6. Confirmar mídia canonical em `#3059`, arquivo público MP4 reproduzível, relação AdOps–AdRotate e HTML público do Perrengue. Não substituir vínculo/anúncio existente sem prova da inserção.
7. Consultar status de evidência de 28/09/2026. Se não estiver aprovada, gerar uma prova só para esse dia pelo fluxo oficial; conferir captura com player e progresso visíveis, mídia certa, auditoria aprovada e URL pública acessível. Datas 23–27 só com prova retroativa legítima.
8. Atualizar este plano com IDs e resultados reais da publicação e da auditoria.

## Provas atuais e bloqueios

- Preflight antigo: falhou antes de mutação (registrado acima).
- MP4 e PDF: IDs e nomes confirmados na leitura anterior desta sessão.
- Evidência auditada do vídeo, publicação AdRotate e playback público: ainda não comprovados.
- Próximo passo: revalidar identidade e runtime; então preparar release oficial isolada.

## 2026-09-28 — revalidação, causa raiz e correção da duplicata cancelada

- Revalidação autenticada pela API: campanha `#1054` continua sendo `PI 15044 - PREF CBA`; inserções `#3058` (banner, publicado) e `#3059` (vídeo, rascunho sem mídia). Período confirmado `2026-09-23` a `2026-09-30`. Para `#3059` em 28/09: `hasMedia=false`, `hasEvidenceForDate=false`, checklist bloqueado por `media_missing`.
- Job de vídeo anterior `3481b18e-43e5-4e3a-8931-b1efc1c846c9` terminou `failed` antes da aplicação. Erro exato: `dedupe_conflict` com campanha concorrente `#1052`. Reconsulta da campanha confirma `#1052` como cancelada, sem mídia, provas ou anúncio AdRotate; a identidade do vídeo permanece no arquivo Drive confirmado acima. Nenhum vídeo foi publicado por esse job.
- Causa: `isDiscardableDraftCampaign` reconhecia apenas estados de rascunho/aguardando, embora o concorrente já cancelado passasse pelos demais gates de origem confiável, sem mídia, sem prova e sem histórico de veiculação.
- TDD na worktree isolada: novo caso para concorrente cancelado sem efeitos e caso negativo para cancelado que tenha mídia AdRotate. Ambos cobrem preservação contra descarte inseguro. Teste falhou inicialmente no caso cancelado; passou após a condição mínima aceitar `cancelado`, sem relaxar os demais bloqueios.
- Testes após a correção: `pnpm --filter @workspace/scripts run test:drive-pi-publish-flow` PASS; `pnpm --filter @workspace/scripts run test:drive-pi-event-flow` PASS (smoke que cria evento sintético ficou ignorado por padrão); `node --check ops/cloudflare-remote-runner/src/runner.mjs` PASS; `bash ops/portainer/adops-stack/scripts/test-lib-portainer.sh` PASS; `git diff --check` PASS.
- Backup e rollback inspecionados antes de nova publicação: preflight oficial somente leitura confirmou release ativa `98ccef810a098ffc4048c9a61cbfb0748df7ef49`, API/web/Postgres/runner/monitor ativos e saudáveis, inventário Drive `fresh` (596 itens). O backup `adops-before-98ccef810a09-20260928T015928Z.dump` existe com 568.695.830 bytes; `pg_restore -l` foi legível; logs mostram `backup_completed` e `restore_verify_completed`; metadados indicam `restore_verified=true` e rollback para release `7d26f99383e25c6c8b2b2adc073882f2222c756d` com os volumes `adops_app_source_7d26f99383e2` e `adops_web_public_7d26f99383e2`. Nenhuma credencial foi mostrada. Nenhum job `pg_dump` ficou ativo.
- Correção isolada commitada em `ee6c0325aa3c7e325a268f80e8124234582beda4`, branch local `codex/pi-15044-cancelled-duplicate-guard-20260928`, worktree `/Users/leandrobosaipo/.codex/worktrees/pi15044-video-profile/AdOps`. Apenas o runner e seu teste foram incluídos. Nenhum push foi feito.
- Preparação de release: `pnpm install --frozen-lockfile` completou. Build API passou; o primeiro typecheck reclamou de tipos de workspace ainda não compilados; após `pnpm run typecheck:libs`, API typecheck passou. Build do relatório web também passou com avisos já conhecidos de sourcemap/chunk grande. Nenhuma fonte do relatório foi alterada.
- Auditoria oficial das regras foi executada antes da captura: um erro não relacionado ao alvo, `json_api_alias_mismatch` em `PERRENGUE:10` (`TOPO LATERAL HEADER 380X120` existe no JSON local mas não no alias da regra publicada #101), além de avisos sobre regras não publicadas em grupos 10 e 7. O grupo de vídeo #6 não aparece entre as divergências. Não alterei configuração compartilhada; vou manter a publicação/captura estritamente no grupo #6 e parar se o preflight específico apontar qualquer conflito.
- `git diff --check`, teste do runner e teste de segurança do helper Portainer passaram. O preflight de produção confirma os serviços ativos e SHA público atual.
- Ainda não publicado nesta etapa. Próximo passo: preparar dependências/build, atualizar este plano com o gate, executar somente `deploy-production.sh` a partir da origem limpa cujo HEAD/SHA seja exato, confirmar o backup novo restaurável/rollback e o readback de release. Só então reexecutar o fluxo oficial de publicação do vídeo `#3059` com a mesma chave idempotente, inspecionar estado terminal, vínculo público/AdRotate, e gerar uma prova de 28/09 após a publicação; datas passadas exigem prova editorial legítima.
