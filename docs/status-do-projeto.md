# Estado confirmado do projeto AdOps

> Estado: vigente
> Público: equipe operacional, mantenedores e agentes
> Última validação operacional completa: 2026-08-24 (correção em release isolado em andamento)
> Última observação de disponibilidade: 2026-08-18 06:18 America/Cuiaba
> Release ativa validada: b78ddf4e07dacdb819e7cc6c71fd971ab31e6b59
> Fonte autoritativa: runtime público, Portainer, API AdOps e consumidores reais

## Resumo executivo

### Progresso vivo do relatório — 27/08/2026

- O runtime é híbrido: Worker/D1 controla os jobs que nele nascem; Mac Mini/PostgreSQL controla os jobs canônicos privados. Um control plane não é prova do outro.
- O relatório público preserva o snapshot estático e acrescenta uma camada GET viva para `liveProgress`: concluídos, em execução, pendentes, falharam e bloqueados. Falha dessa leitura mantém o snapshot e oferece retry, sem expor segredo.
- A atualização incremental consolida o snapshot após auditoria e só reutiliza ZIP com fingerprint idêntico. Captura, auditoria e ZIP continuam rotinas separadas; ZIP incompatível bloqueia a publicação.

### Reconciliação das quatro capturas inline de 21/08 — 24/08/2026

- `#2692`, `#2693`, `#2712` e `#2713` possuíam evidência e log `inline-*` correlacionados, mas sem proveniência imutável. A rota interna agora oferece `dryRun|apply` para `same_day_inline`, exige coincidência de arquivo, mídia, período, auditoria visual e data em Cuiabá, e registra `same_day_retry` sem trocar a evidência.
- OpenAPI, cliente gerado, harness mensal, contrato documental, runbooks e a skill `adops-pi-sync` foram alinhados. A raiz antiga do OpenClaw deixou de ser orientação operacional e o relatório permanece consumidor, nunca aprovador de evidências.

### Recuperação de evidências de 22 e 23/08 — 24/08/2026

- O diagnóstico confirmou 18 capturas geradas em 22/08 que foram reclassificadas indevidamente como retroativas quando o calendário avançou, e três ausências em 23/08. A correção grava `captureClass`, `targetDate`, `capturedAt`, `sourceJobId` e `auditPolicyVersion` de forma imutável.
- A reconciliação dos 18 arquivos de 22/08 reutiliza artefatos existentes e só restaura a aprovação quando banco, job e URL do arquivo comprovam a mesma inserção/data. Nenhum print é recapturado ou sobrescrito.
- #2643/AFL, #1940/OMT e #2641/ROO seguem recuperação individual pela API; a causa confirmada de #2643 é `creative_not_found`. As outras duas só podem ser classificadas depois da revalidação de mídia, relação pública e HTML.
- O ciclo automático persiste tentativas em +5, +10 e +15 minutos para cada data ausente ou inválida. Após três falhas iguais, abre bloqueio e interrompe novos retries. A falha de uma inserção não interrompe as demais.
- O relatório mensal é atualizado incrementalmente após cada aprovação, com debounce de 60 segundos. Antes das 18h de Cuiabá, 24/08 permanece `aguardando captura`.
- O fluxo normal é determinístico e não usa IA. O avaliador recebe somente JSON compacto `complete`, `retryable` ou `blocked`; intervenção de modelo ocorre apenas quando um incidente exige diagnóstico.

### Automação determinística de cadastro e publicação — 21/08/2026

- A reconciliação de publicação passa a sincronizar a planilha canônica antes da decisão e expõe `mode=preflight|apply` no contrato operacional.
- O gate independente `ADOPS_CAMPAIGN_AUTO_PUBLISH_ENABLED` separa essa automação do intake por IA: Drive/IA continuam no modo seguro já configurado.
- A automação não substitui `mediaUrl` existente, não remove anúncio de outra inserção e bloqueia mídia, URL, PI, período, formato, slot ou rotação ambíguos em `needs_review`.
- A validação de produção deve confirmar o gate no runtime, um job automático terminal e a publicação/relatório no consumidor real antes de considerar o fluxo ativo.

### Regularização PERRENGUE — 21/08/2026

- As PIs `17046`, `14807` e `14879` possuem, respectivamente, as inserções canônicas `#2186`, `#2187` e `#2192`. Planilha, Drive/PDF, AdOps e relação pública confirmaram PI, período, Header 825x120 e mídia esperada.
- O grupo 1 do AdRotate opera em rotação. As inserções históricas `#1827`, `#1829` e `#1860` foram preservadas; elas não são usadas para creditar evidências às canônicas.
- Fatores observados no atraso: a seleção mensal anterior não expunha a decisão canônica entre variantes e a rotina diária de 20/08 terminou parcial. Os dias 18–20 não tinham evidências auditadas nessas três inserções.
- Correção ativa: `canonicalSelection` expõe a vencedora e candidatas; `relation.rotation` descreve rotação e exige a mídia esperada no print. Rascunho detalhado não ultrapassa anúncio publicado apenas pelo nome do formato.
- Backfills oficiais concluídos: `690700ce-754b-4c6a-9e6b-e6151110b91e` (#2186), `6db1f370-c6c6-42e3-a243-9f66407f07a3` (#2187) e `c981de9b-9e50-4d16-a537-5832cc5b855e` (#2192), todos com 3/3 dias aprovados para 18–20/08.
- A revisão incremental `526067df-6f05-4df9-962d-3526ae15767f` publicou a revisão 10 do relatório de agosto: 30 inserções conformes, zero pendentes/invalidas e 315 dias auditados no corte de 20/08.

O código da recuperação inicial corresponde ao commit `a499a399b822412cbd05d229003f857f9069d64a`. Em 18/08, depois da recuperação das evidências, o servidor ficou indisponível e os domínios privados responderam Cloudflare HTTP 530; o Worker público continuou acessível. O servidor voltou às 05:21 de Cuiabá. Às 06:18, API, Portainer, relatório, PostgreSQL e três runners estavam saudáveis na release `b78ddf4e07dacdb819e7cc6c71fd971ab31e6b59`; os runners informaram a mesma versão operacional curta `b78ddf4e07da`.

O endereço `100.126.99.28` foi confirmado por SSH como o host `codigo5-cloud`, com Docker e o container `codigo5-cloud-tunnel` ativos. Esse é o IP administrativo vigente; não deve ser confundido com uma URL pública do relatório.

Isto substitui a afirmação histórica de que produção estava “em preparação”. Histórico de implantação continua disponível no Git, mas não descreve o runtime atual.

## Estado por capacidade no último readback completo

| Capacidade | Estado em 2026-08-17 | Evidência autoritativa |
|---|---|---|
| API e painel | ativo | health público e release readback |
| Banco operacional | ativo | API Node/PostgreSQL |
| Runner geral | ativo | runtime readiness e heartbeat |
| Prints e exportações | ativo | runner dedicado e jobs concluídos |
| Inventário do Drive | ativo | monitor e snapshot atual |
| Relatório mensal | ativo | página não listada e downloads |
| Worker público | ativo | deployment `4b369cca-564a-4465-b787-b17f55aab383` e três crons ativos |
| Telegram | sob demanda | somente quando solicitado |

## Relatório de agosto

O ciclo validado terminou em aproximadamente 3min48s e materializou 163 datas auditadas. O portal oferece filtro por portal, busca, estados, previsão de sete dias, JPEG individual, ZIP por portal e ZIP completo por campanha.

Esses números são uma fotografia datada. A fonte mensal agregada e o relatório público devem ser reconsultados para totais atuais.

## Correção mensal de 17/08/2026

PI 14771/OMT e PI 9750/AFL já estavam cadastradas e publicadas, respectivamente como `campaignId=969/insertionId=1841` e `campaignId=981/insertionId=1854`. As mídias públicas responderam HTTP 200 com hash igual ao arquivo do Drive. As evidências estavam aprovadas até 14/08 e faltava somente 15/08.

A primeira tentativa real de 17/08 chegou ao runner D1 correto, mas falhou de forma segura porque os slots expirados `.g.g-1` do OMT e `.g.g-2` do AFL não estavam mais no HTML histórico. Nenhuma evidência foi fabricada. O capturador passou a permitir reconstrução auditada nesses dois portais somente em âncoras conhecidas, usando notícias do WordPress REST até o corte e a mídia canônica do AdOps.

Após o deploy, os dois dias foram recuperados pela API AdOps:

- OMT, PI 14771, campanha `969`, inserção `1841`, data `15/08`: job `a5b415ed-37f4-4a9d-8b1f-33dea67372c9`, estado `audited`, checklist aprovado, zero bloqueios e URL pública acessível;
- AFL, PI 9750, campanha `981`, inserção `1854`, data `15/08`: job `007046c0-6581-42c3-ac21-09b2d462ca6d`, estado `audited`, checklist aprovado, zero bloqueios e URL pública acessível.

Os JPEGs individuais foram lidos no consumidor real com HTTP 200: OMT com 169.025 bytes e AFL com 144.808 bytes. Os PNGs canônicos permaneceram intactos.

O gate do relatório revelou ainda a última data ausente da PI 009749/ROO: campanha `980`, inserção `1853`, data `15/08`. O job `aedd8714-9f3d-4c95-be23-e40a117156e3` gerou essa evidência pela API e terminou `audited`, com checklist aprovado, zero bloqueios, data/hora de 15/08 às 18:12 e URL pública HTTP 200.

Elas desapareceram do relatório porque a fonte mensal reutilizava a consulta de campanhas ativas na data-alvo 16/08. Como os dois períodos terminaram em 15/08, foram excluídas. A correção faz a fonte mensal carregar qualquer linha cujo período toque agosto, preservando a fonte `active` apenas para a rotina diária.

Uma tentativa manual com corte em 17/08 foi bloqueada antes da publicação porque os 17 prints do próprio dia ainda não eram exigíveis antes do cron das 18h de Cuiabá. O relatório deve usar o último dia cuja captura diária já encerrou, ou aguardar a janela normal das 22h15.

O job mensal `783f85a5-d34f-4d04-8878-7c01f281f795`, com corte seguro em 16/08, concluiu e publicou atomicamente às 18:09 UTC. O consumidor público retornou HTTP 200 e passou a mostrar 25 inserções do mês, sendo 16 ativas e 9 encerradas, 199 datas auditadas, zero pendência no gate de campanhas publicadas e as três PIs 14771, 009750 e 009749 completas até 15/08. As 45 datas ainda visíveis como ausentes pertencem às quatro inserções não publicadas e permanecem informativas, sem serem confundidas com falha de campanha ativa.

Os ZIPs completos de PI 14771 e PI 9750 foram baixados e verificados: respectivamente 15 e 12 JPEGs, zero PNG, um `SHA256SUMS.txt` e todos os checksums válidos.

As duas pastas do snapshot continham PDF e GIF, mas `textFiles=[]`. Qualquer redirect informado fora desse snapshot precisa ser reconsultado pelo ID exato da pasta; ausência no inventário não autoriza inventar destino.

## Pendência operacional conhecida

### Conferência de PIs em 17/08/2026

- `PI 90892 - PREF VG` já possui três inserções publicadas e auditadas em todo o período de 01 a 12/08: `#1843` (Megabanner), `#1855/#1941` (Lateral 02, duplicidade operacional existente) e `#1844` (Vídeo). O relatório escolhia rascunhos detalhados `#2188/#2190` por não reconhecer aliases exatos de formato; a seleção canônica foi corrigida sem criar ou recapturar evidências.
- `PI 742 - PREF VG` já está publicada no OMT como campanha `#976`, inserção `#1840`, com dez evidências auditadas entre 31/07 e 09/08. O rascunho `#1852` não deve ser recriado nem usado no relatório.
- `PI 57687 - ALMT`, AFL, campanha `#1000`, inserção `#2413`, possui PDF e GIF 825x120. A pasta não possui redirect; pela política vigente isso significa banner informativo sem clique, não bloqueio.
- `PI 009746 - PREF ROO`, Perrengue, campanha `#985`, inserção canônica `#2370`, possui PDF e MP4 H.264 824x120. O perfil HOME 1 aceita MP4 e normaliza a cópia para 670x90, sem corte; as inserções antigas `#1859/#1942` não devem ser recriadas nem selecionadas.

### Recuperação validada em 17/08/2026

- `PI 57687 - ALMT`, AFL, campanha `#1000`, inserção `#2413`: publicada sem link, anúncio `42` no grupo `1`. O GIF público 825x120 respondeu HTTP 200. As datas 14, 15, 16 e 17/08 terminaram `audited`, com checklist aprovado, zero bloqueios e URL acessível.
- `PI 009746 - PREF ROO`, Perrengue, campanha `#985`, inserção `#2370`: publicada sem link como campanha encerrada, anúncio `190`, grupo `2`, agenda `199`. O MP4 original 824x120 foi preservado; a cópia H.264/yuv420p 670x90 respondeu HTTP 200 e manteve hash de entrega verificado. As 12 datas de 04 a 15/08 terminaram `audited`, com checklist aprovado, zero bloqueios e URL acessível.
- O gate mensal encontrou e recuperou uma pendência fora dessas duas campanhas: `PI 25207030 - GOV`, PNMT, campanha `#973`, inserção `#1839`, data 17/08. O HTML público continha o anúncio correto no grupo `2`, mas o preview histórico removia o slot. A release `a499a399b822412cbd05d229003f857f9069d64a` restringiu a reconstrução a PNMT/home/grupo 2, dentro do período e com motivo explícito `late_publication_recovery`; captura normal continua sem injeção. Antes da indisponibilidade, o job de backfill `00a89d80-08f9-4b52-8af0-b2d7fc0fe190` terminou e a evidência de 17/08 foi lida como `audited`, com checklist aprovado, zero bloqueios e URL pública acessível. Esse fato é histórico confirmado; a leitura não pôde ser repetida durante o HTTP 530 de 18/08.

O relatório mensal só pode substituir a versão pública depois de confirmar novamente zero datas ausentes ou inválidas entre as inserções publicadas canônicas. Em indisponibilidade do servidor ou falha desse gate, a versão pública anterior permanece intacta.

Após o retorno do servidor, o job mensal `fac6a39f-c3ab-4312-b5dd-f9a3b0573ba2` foi executado uma única vez e terminou `completed` às 05:57 de Cuiabá. O relatório público passou a usar corte em 17/08, com 24 inserções canônicas, 219 datas auditadas e gate das campanhas publicadas em zero ausências e zero inválidas. A única data ainda ausente pertence à campanha não publicada `PI 57732 - ALMT`, PNMT, inserção `#2423`, bloqueada porque o Drive encontrou mais de uma pasta candidata.

Depois do deploy `b78ddf4e07da`, o job mensal `d7a2855f-9425-43e6-8d3a-b0e83f81c7b9` terminou `completed` às 06:18 de Cuiabá. A página manteve o corte em 17/08 e os mesmos totais de campanha/evidência, mas passou a mostrar corretamente o inventário do Drive como `fresh`, com 470 itens. A API mensal publica apenas estado, horário, idade, vencimento e quantidade; IDs internos de varredura, pasta-raiz e erros brutos não são expostos.

Regra aprendida: nomes detalhados de posição só podem ser equivalentes por pares exatos aprovados. Nunca usar `includes("TOPO")` ou `includes("VIDEO")`, pois isso pode selecionar outra posição. Redirect é opcional; quando ausente, o banner deve ser publicado sem link. Quando fornecido, continua obrigatório validar um único HTTPS público.

RADAR/PERRENGUE, inserção `#1944`, pode usar identidade operacional única para veiculação sem PDF, preservando `commercialIdentityStatus=awaiting_authoritative_pi`. O Drive contém mídia candidata e documento de destino. A publicação depende do preflight vivo e nunca associa a campanha à PI 17190. Faturamento e ZIP por PI aguardam a fonte autoritativa.

Enquanto a PI/PDF continuar ausente:

- não criar campanha ou inserção duplicada;
- publicar apenas se o preflight operacional único passar; falha em qualquer gate mantém o rascunho;
- gerar evidência somente depois de AdRotate, cache e HTML público confirmarem a veiculação;
- manter mídia como `candidate_found` e identidade como `insufficient_data`.

## Ganhos consolidados

### Correção do relatório mensal em 20/08/2026

- Causa: a produção não expunha `evidence-monthly-source` nem `daily-print-status`; o gerador publicado recuou para a visão ativa e cobrou o dia 20 às 14h56, antes do lote das 18h.
- Correção: fonte mensal completa e estado diário publicados pela API/Worker, sem fallback; filtro inicial `Ativas` passou a ser apenas visual.
- PNMT/DENGUE, PI 25207030, inserção `#1839`, é o caso sentinela: campanha encerrada de 03 a 17/08, restaurada com as 15 evidências existentes, sem geração retroativa.
- O artefato registra separadamente `targetDate` e `evidenceCutoffDate`; o dia corrente só vira pendência depois da conclusão canônica ou do fechamento da janela.

- seleção canônica exclui rascunhos duplicados como `#1826`;
- auditoria exige checklist, acessibilidade da URL e ausência de blockers;
- GIF exige frame visualmente válido;
- captura e empacotamento são rotinas separadas;
- ZIP usa fingerprint assinado e cache incremental;
- polling compacto e fonte mensal agregada reduziram tempo, tráfego e tokens;
- staging e troca atômica preservam a última versão válida;
- o deadlock relatório/exportação foi removido pelo claim dedicado.
- jobs novos do runner nascem `ready_for_runner`; a Queue é compatibilidade para legados;
- atualizações do Drive e o cron das 17h30 reavaliam campanhas bloqueadas sem criar duplicatas;
- comparação numérica de PI ignora zeros à esquerda e preserva o valor original.

## Próximos cuidados

- a rotina de 17h30 sincroniza a planilha antes de reconciliar publicação; PI 9750/AFL e PI 14771/OMT não são ausentes e não podem ser recriadas;
- o lote diário de print não deve depender de uma resposta HTTP síncrona longa: cada captura é acompanhada por job assíncrono, e auditoria incompleta abre incidente estruturado;
- jobs devem ser lidos no control plane que os originou: Worker/D1 para jobs nascidos no Worker e Mac Mini/PostgreSQL para jobs canônicos privados; um não substitui a evidência do outro;
- recuperar a PI/PDF de `#1944` para concluir identidade comercial, faturamento e ZIP por PI; a veiculação pode ser retomada antes apenas pelo preflight operacional único;
- manter documentação e release datadas;
- monitorar duração, cache hits, blockers e heartbeat;
- validar sempre o consumidor real após deploy;
- não tratar acesso não listado como autenticação.

## Leitura recomendada

1. `docs/START_HERE_ADOPS.md`
2. `docs/runbook-nova-pi-evidencias.md`
3. `docs/adops/ops-api-runbook.md`
4. `docs/adops/evidence-monthly-report/runbook.md`
5. `docs/adops/system/RUNBOOK.md`
