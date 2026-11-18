# Recuperação AdOps — validação e correções de 18/11/2026

Horários deste documento em America/Cuiaba, salvo indicação UTC. Trabalho executado sobre os registros de 16–17/11. Evidências técnicas privadas: `outputs/fechamento-recuperacao-2026-11-18/`. Não publicar essa pasta: contém snapshots operacionais e configurações privadas.

## Resultado e alcance

- Relatório publicado corrigido: OMT #3123 está `ok`, sem datas inválidas ou faltantes; 13 dias auditados. Total do relatório: 17 itens válidos, zero inválidos/faltantes, 134 dias auditados.
- Preparação de campanhas agora encerra também pedidos e retentativas que ultrapassem 30 minutos. A correção foi testada, compilada sobre a fonte ativa, implantada e conferida por hash e API.
- Monitor independente do n8n implantado na Sonda existente, com aviso de indisponibilidade/atraso, deduplicação, recuperação e telemetria do host/banco. Teste real de falha e retorno chegou à caixa de entrada sem parar o n8n.
- Portal163: HTTP 400 e formatos de URL dos ministérios corrigidos. Ciclo natural das 09h criou nove pendentes com capa; o das 10h leu 11 fontes/55 URLs sem erros de lista, preservando bloqueios de data, mídia e crédito. Publicador natural confirmou o post 157181.
- Financeiro e Clique Sim tiveram consumidores reais conferidos. Esportes PMT executa as rotinas e mantém os bloqueios editoriais/de mídia; não houve publicação forçada.
- As campanhas 1098/1099, inserções 3132–3136, dez reconstruções de 16/11 e pacotes aprovados foram preservados. Nenhum anúncio foi recadastrado/republicado e nenhuma evidência aprovada foi regenerada.

Limites: não há recibo de entrega ao aparelho para as mensagens de evidências; a PI da LEI continua ausente. A captura original de 17/11 precisou da recuperação já documentada. Os ciclos automáticos posteriores reutilizaram essas evidências válidas; isso não prova uma nova geração integral sem intervenção. A próxima janela de captura inédita é 18/11 às 18h.

## Ciclos automáticos observados

| Etapa | Evidência | Resultado |
|---|---|---|
| Captura/conferência, 17/11 21h | n8n `1150603`, workflow `C7rpQHqQDD3CuQlp`, `mode=trigger` | Sucesso às 21:00:06; fluxo reutiliza provas válidas |
| Captura/conferência, 17/11 21h30 | n8n `1150924`, mesmo workflow, `mode=trigger` | Sucesso às 21:30:05; nenhuma evidência aprovada regenerada |
| Relatório, 17/11 22h15 | n8n `1151353`, workflow `Cr7a6T27RlnpMJC1`, `mode=trigger` | Terminou 22:21:43; job `b9b69975-8f1f-4307-b466-0bc8cc00cfe9` concluído às 22:21:40 |
| Fechamento, 17/11 22h20 | workflow `gRSMPctoutOPPqix`; cursor independente registra sucesso 22:20:07 | Revisão `8cf0adaf-bb0d-4c97-adee-01dec4aed1ce`, criada 22:20:06 |
| WhatsApp, 17/11 22h20 | registro durável do remetente existente | Resumo aceito `3EB01280C5B3DE06BD52B0`, 22:20:07; não equivale a entrega |
| Recuperação matinal, 18/11 08h | n8n `1156217`, workflow `OfVb0E0Q8Wja3QXt`, `mode=trigger` | Sucesso 08:02:37 |

O fechamento das 22h20 ocorreu antes de terminar o relatório das 22h15. Esses dois jobs são rotinas distintas; não foi alegado que o resumo das 22h20 usou a revisão que só terminou às 22h21. A conclusão da cadeia de geração inédita, auditoria e recebimento no aparelho permanece diferente de “gatilhos executados com sucesso”. As execuções bem-sucedidas de alguns fluxos não ficam retidas no n8n; nesses casos foram usados o cursor externo e os registros duráveis do consumidor.

## OMT #3123 e relatório publicado

Defeito: a restauração de evidência histórica canônica corrigia `evidenceDays`/datas, mas conservava o `state` e `statusDetail` anteriores. Os totais dependiam desse estado antigo.

Correção em `scripts/src/build-current-month-evidence-report.mjs`: recalcular estado, texto, dias auditados, datas faltantes/inválidas e pendência retroativa após a restauração canônica. Evidência não aprovada, erro real, falta, bloqueio de publicação e período futuro continuam respeitados.

- Oito cenários de regressão aprovados.
- Fonte ativa SHA256 `5ecf142df2cb88486a32608e73af4fa6c376022a2d172290d1a6f9b7436f14c6`.
- Backup `/app/ops-backups/report-derived-state-20261118`.
- Atualização assistida específica: job `c9edc4aa-ea37-4d46-8d09-9053a54a7cb9`, concluído 18/11 08:58:31; não foi um gatilho agendado.
- Dados publicados gerados 08:50:06; conferência após conclusão encontrou OMT `state=ok`, `invalidDates=[]`, `missingDates=[]`, `auditedDays=13`.
- Texto: “Todos os dias exigidos até a data alvo têm evidência auditada.”
- Totais: 17/17 válidos, 134 dias auditados, 13 inserções ativas no recorte do relatório e quatro encerradas. A diferença de ativos em relação ao dia anterior decorre da data, não de perda de evidência.

A página pública foi aberta por HTTP e seu JavaScript conferido: ela consulta `/api/reports/evidences/monthly`, não o `data.json`. O mesmo endpoint autenticado, com mês 2026-11 e portal OMT, retornou zero inválidos/pendentes; a consulta completa retornou 12 campanhas e 17 inserções, também sem inválidos/pendentes; 09/11 está `audited`, checklist aprovado e sem issues. O dia 18/11 aparece programado, como esperado antes da janela de captura.

Relatório: https://sites.codigo5.com.br/reports/adops-evidencias-novembro-2026/

## Preparação, confirmação, erro e retentativa

Defeito adicional comprovado por leitura e teste: o limite de 30 minutos só era verificado no ramo de job ainda em fila/processamento. Um pedido antigo ou uma falha técnica em outra consulta podia continuar em retentativa depois do limite.

Correção em `artifacts/api-server/src/lib/campaign-preparation-store.mjs`:

- Expiração verificada antes de iniciar qualquer etapa.
- Solicitações expiradas são selecionadas mesmo se `next_attempt_at` estiver no futuro.
- Falha técnica após a expiração vira bloqueio terminal, sem nova tentativa.
- Mantidos aviso de cinco minutos, consulta do mesmo job, chaves estáveis de deduplicação e retentativas de 2/5/10 minutos.
- Savepoint por item preserva a continuidade dos demais; teste bloqueou o primeiro e processou o segundo.
- Confirmação contextual, autorização, revisão da fonte, mídia exata, PI opcional e proteção de resultado incerto passaram nos 23 checks existentes contra a fonte consolidada.

Cinco testes adicionais cobrem prazo, espera, retentativas, isolamento e chegada documental simulada. API compilada sobre a fonte viva; três arquivos implantados (fonte, bundle e mapa), com 143 guardas de hash e ausência de job ativo na intervenção. Reinício da API às 09:10:53; a primeira consulta durante a subida retornou 502, a consulta posterior confirmou `available=true` e `authorizationEnabled=true`, e os três hashes foram conferidos. O n8n não foi reiniciado nesta etapa. O cursor independente confirmou conclusões naturais posteriores: confirmação de recebimento às 09:20:18 e processamento de confirmações às 09:20:38. Não foi criada uma campanha artificial para testar publicação.

Backup: `/app/ops-backups/preparation-deadline-20261118`. Manifesto: `deadline-build-manifest.json`. SHA da fonte nova: `478b276df36c20448b6a2c2ea6f61439c6efb6ce21f530f17e4396caaee06e7b`.

## Monitor independente e telemetria

Infraestrutura reutilizada: `/Users/leandrobosaipo/Projetos/cod5-sonda-uptimerobot`. Gatus/relay na VM8 e coletor Linux identificado operacionalmente como `macmini`. A consulta Docker atual identifica o host real como `codigo5-cloud`, Ubuntu 24.04.4 LTS, oito CPUs e 9.798.549.504 bytes de RAM. O nome do monitor/DNS não foi usado como prova de hardware físico. Não depende do tratador de erros do n8n nem do Codex como relógio.

- Prontidão HTTP do n8n: `/healthz/readiness`, consulta externa a cada cinco minutos.
- Atualidade do coletor: monitor na VM8 a cada dois minutos.
- Coleta independente a cada três minutos: Docker n8n/PostgreSQL, conclusões naturais e atraso das agendas. Execuções manuais são excluídas; atraso usa tolerância de 12 minutos e duas amostras consecutivas ruins.
- Alerta e recuperação dos quatro fluxos críticos AdOps, processo/banco, memória e capacidade de disco. Outros projetos preservam a política anterior de histórico.
- Canal existente: Gmail do Financeiro → suporte@codigo5.com.br. Nenhum WhatsApp alternativo foi utilizado.
- Deduplicação por incidente aberto e transição de estado; resultados antigos `sending` permanecem incertos, sem reenvio.

Teste real, sem interromper produção: endpoint temporário respondeu 503 e voltou automaticamente. Falha observada 09:00:49, recuperação 09:01:34. Um alerta e uma recuperação foram encontrados com rótulo INBOX: Gmail `1a1eebf8789ed037` (09:01:31) e `1a1eebfc40c9d587` (09:01:47). Endpoint temporário removido. Quatro testes isolados cobriram indisponibilidade, atraso, deduplicação e recuperação; um quinto teste foi acrescentado para fechamento, commit e rollback das conexões SQLite.

A Sonda tinha dois problemas próprios:

1. API do histórico retornava `SQLITE_IOERR_GETTEMPPATH`. O container só de leitura não tinha pasta temporária gravável. Corrigido com `/data/tmp` no volume e `TMPDIR=/data/tmp`; API voltou a HTTP 200 com 138 endpoints.
2. Eventos Docker comprovavam OOM/reinícios do relay de 42 MiB. Reutilização do contexto TLS reduziu alocações repetidas; o pico registrado durante os envios de teste foi 39.420 KiB. Gatus usava `GOMEMLIMIT=80MiB` sob teto de 43 MiB; ajustado para 28 MiB. A primeira amostra não mostrou restart; a conferência posterior detectou nova regressão OOM às 09:22:51. A reutilização TLS sozinha foi insuficiente. Foi encontrado outro defeito: `with sqlite3.connect(...)` confirma/desfaz a transação, mas não fecha a conexão, deixando caches por requisição até a coleta de lixo. `ClosingConnection` agora fecha explicitamente tanto em sucesso quanto em exceção e limita o cache por conexão a 256 KiB. Testes verificaram fechamento, commit, rollback e o uso explícito pela gestão. Implantação separada com hash e backup `relay-before-sqlite-close.py`; validação final abaixo.

Reserva total preservada: 0,25 vCPU e 128 MiB. Amostra pós-correção: Gatus 32.923.648 bytes; relay 34.385.920 bytes. Esses números são da primeira amostra; a regressão posterior e a correção de fechamento de conexões estão registradas acima. O painel local concorrente não foi alterado.

Após o fechamento explícito das conexões, o segundo teste confirmou falha às 09:27:08 e retorno às 09:28:08. Um alerta (`1a1eed7659109281`, 09:27:35) e uma recuperação (`1a1eed816116bafb`, 09:28:21) foram encontrados no INBOX. Não houve repetição do aviso de disco nem dos envios anteriores. O segundo monitor temporário foi retirado. A fonte do relay implantada tem SHA256 `ce548d9684501d6648f927b74a8d0bcc19008a1b1d99cf81ae8e21091d60cc62`.

Estabilidade após a subida às 09:26: sete amostras entre 09:31:18 e 09:36:03, zero reinícios, `OOMKilled=false`, memória entre 19,816 e 19,894 MB. Pico RSS após o segundo envio: 35.708 KiB. Artefato: `sonda-stability-samples.json`. Esta é a janela observada, não uma garantia de estabilidade futura.

Contraprova às 09:44:54: zero eventos Docker `oom`/`die` desde a implantação das 09:26, zero reinícios e 19.922.944 bytes de memória. Artefato `sonda-final-runtime.json`.

Telemetria privada: `/opt/cod5-sonda-collector/adops-telemetry.jsonl`, rotacionada em dois arquivos de até 4 MiB. Registra hostname, contadores de CPU do host/cgroup, carga e pressão de CPU/I/O, duração da coleta, RAM disponível, swap, espaço, memória/eventos do cgroup, reinícios, tamanho do log e conexões/bloqueios/fila PostgreSQL. Os contadores cumulativos permitem calcular uso no intervalo real entre amostras. Complemento de CPU instalado às 09:48:25 por troca atômica, sem reinício, SHA `881e692acf12322735e70c24cfe25d2fe71cd55f7db2115a5f496688345c0552`; backup `adops-telemetry-before-cpu.py`. Limites de consulta e execução preservados; nenhuma mensagem ou credencial é gravada pelo módulo.

Rollback da Sonda: container anterior parado `cod5-sonda-uptimerobot-rollback-20261118`; fontes anteriores em `/private/backup-adops-20261118` e `/opt/cod5-sonda-collector/backup-adops-20261118`. Parar o novo Gatus antes de restaurar o antigo; não executar dois processos no mesmo SQLite.

## Causa comprovada, hipóteses e capacidade

Conforme os logs preservados de 16–17/11:

- 16/11 17:47:48: início do intervalo de execuções não iniciadas encontrado.
- 16/11 17:47:53: timeout de conexão PostgreSQL; depois, tentativas de recuperação após falhas consecutivas.
- 17/11 07:19:50: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
- Bloqueio independente na API AdOps: transação segurava conexão/trava e solicitava outra conexão do mesmo pool; reproduzido e corrigido em 17/11. Não é prova da causa inicial do n8n.

Em 18/11: n8n 2.39.6, iniciado 17/11 13:38:02, sem novo reinício nesta recuperação; limite 2,5 GiB, heap configurado 1.792 MiB, concorrência 20, pool PostgreSQL 5. Amostra natural 09:12:02: memória do cgroup 675.532.800 bytes, zero eventos OOM do cgroup nessa instância; host com 4.084.953.088 bytes disponíveis e cerca de 2,49 GiB de swap ocupado. O RSS do PID init não representa o Node; a telemetria foi corrigida para medir o cgroup completo.

- Raiz: aproximadamente 41,8 GiB livres.
- Volume `/srv/cod5-files`: aproximadamente 25,8 GiB livres, uso exibido em torno de 95%. Alerta de capacidade foi disparado uma vez pelo monitor; não houve limpeza.
- Pressão de I/O elevada, com `full avg60` acima de 20% em amostras. Isso demonstra espera atual, não prova retrospectiva do primeiro timeout.
- Banco n8n: aproximadamente 2,84 GB, três a seis conexões nas amostras, `max_connections=100`, zero bloqueadores.
- Passivo histórico `new`: 152.324 registros, desde 26/10; 122.843 pertencem ao roteador de respostas Financeiro e 6.750 ao receptor JP. Esse volume não representa igual quantidade de respostas de clientes nem prova qual evento causou a parada. Um registro transitório adicional às 09h desapareceu na amostra seguinte. Contagens `running` de 150–312 incluem registros e admissões; não devem ser interpretadas como igual número de jobs usando CPU simultaneamente.
- Guarda de boot atual impede replay quando o passivo supera 1.000. Validada por leitura da versão montada; registros preservados e nenhum replay em massa.

Amostra complementar de 09:49:56: nenhum `new` criado na última hora; 15 triggers em `running`, todos iniciados nos quatro minutos anteriores. Existem ainda 15 registros antigos `running` do roteador Financeiro, iniciados em 17/11 16:48. Leitura individual mostrou que todos são `messages.update` (recibos de status), sem progresso persistido; não foram tratados como 15 respostas novas de clientes ou como 15 trabalhos comprovadamente ativos na CPU. Foram preservados sem cancelamento/replay. A captura atual de respostas tem prova própria no consumidor. Esses registros antigos exigem conciliação histórica antes de qualquer mudança de status ou repetição.

Primeira coleta natural com CPU, 09:51:02: host `codigo5-cloud`, carga 5,08/4,71/5,31 em oito CPUs, pressão CPU `some avg60=13,37%`, I/O `full avg60=15,75%`, coleta em 0,666 s; n8n com 784.789.504 bytes, sem reinício/OOM e cinco conexões de banco, zero bloqueadas. Os contadores de CPU/throttling agora ficam disponíveis para comparação entre amostras; um total acumulado não foi apresentado como uso instantâneo.

Intervalo natural 09:51:02–09:54:01 (179 s): CPU ocupada do host 25,03%, espera de I/O 14,04%; n8n consumiu em média 0,077 núcleo e acumulou 4,553 s de throttling. A última coleta levou 0,599 s, mediu 537.677.824 bytes no n8n, zero conexões bloqueadas e os mesmos 152.324 `new`. Artefato `telemetry-cpu-interval.json`; não extrapolar essa amostra para 16/11 ou para o pico noturno de capturas.

O histórico disponível não identifica a consulta, processo ou alocação responsável pelo primeiro timeout/OOM. Não há prova de reboot, disco cheio ou uma exceção única que tenha parado tudo. Pressão de I/O, competição por recursos e custo de recuperação do passivo permanecem hipóteses. Telemetria, logs, guarda de replay e monitor externo permitem correlacionar uma próxima ocorrência; não foi aumentado pool/heap nem apagada a fila com base em suposição.

## PI LEI/ALMT e WhatsApp

Identidade `PERRENGUE:25208280`, campanha 1099, pasta `1Adw9IJ0tT0YRLtsDfTbWcCP1LINfHhOV`.

Inventário natural `8e3a41bd-8679-4f6a-8cb2-126220d3155e`, 09:14:27, 499 itens; conciliado pelo job `0fde9232-a664-4b2a-90fb-feb6d939c256` às 09:15:31. Consulta direta à mesma pasta às 09:16:11 confirmou dois GIFs, um MP4 e um Google Docs; nenhum PDF. Uma consulta direta anterior retornou 403; nova leitura autorizada e inventário independente confirmaram o acesso e o conteúdo, sem alteração de credenciais/permissões.

Pendência documental continua `searching`, sem SHA de PDF. Teste isolado demonstrou ausência → aviso deduplicado; chegada simulada → `found_requires_reconciliation`; repetição → nenhum novo aviso/cadastro. A conferência real de identidade, cliente, período, posições e valores depende do PDF real. Não foi criada outra campanha nem alterado valor.

Busca complementar no Gmail conectado às 09:47, pelo número exato `25208280`, retornou zero mensagens. Isso cobre a conta consultada e esse identificador; não prova ausência em contas externas ou documentos enviados sem o número.

Recibos consultados para os cinco prints e resumo:

| Inserção | ID aceito |
|---|---|
| 3132 | `3EB026D52A5DBFFBDF0EFC` |
| 3133 | `3EB0CE63675221D07826A4` |
| 3134 | `3EB0B33A8BB74CCCEE4EEE` |
| 3135 | `3EB0FCC92E0707C370D856` |
| 3136 | `3EB0AB5BCEFC8AE6FDA420` |
| Resumo | `3EB01280C5B3DE06BD52B0` |

O AdOps conserva aceite do provedor. Os seis eventos `send.message` têm estado de provedor `PENDING`; não há atualização de entrega/leitura correspondente no armazenamento consultado. A consulta aos mesmos IDs em `Message`/`MessageUpdate` do Evolution não encontrou recibos adicionais. Isso não prova falha e não autoriza repetição. Recebimento no aparelho continua dependendo de confirmação do usuário ou de recibo futuro do mesmo ID.

## Outros projetos

| Projeto | Consumidor e situação |
|---|---|
| Portal163 | Guard implantado em `zhjins4pZqkYRGuj`, versão `460f492a-fdc7-4f01-a8dd-675721c80c97`. Execução natural `1157239`, 09:00:00–09:02:41: 11 fontes, dois itens inválidos isolados, nove pendentes e nove capas confirmadas. Posts 157166, 157169, 157172, 157175, 157178, 157181, 157184, 157187, 157190. Gates preservados. |
| Financeiro | `make doctor` aprovado; dois health endpoints 200. Resposta real id 91 recebida 09:03:39 e gravada 09:03:46, atividade 91 criada 09:03:48 como `needs_review`. Registro 92 também persistido. Nenhuma cobrança, emissão ou comunicação histórica repetida. |
| Clique Sim | Execução natural `1156271`, 08:05:00–08:06:39. Post 22516 publicado; leitura pública 200, título, canonical e imagem conferidos. URL: https://cliquesimnoticias.com.br/assembleia-vota-projeto-fundo-vitimas-crime-organizado/ |
| Esportes PMT | Rodada 9532 concluiu 09:00:56 com zero fontes em falha. Rodada editorial 9531 terminou 09:00:43 sem pauta elegível com fontes independentes. Registro 21 está `blocked_media` por `image_resolution_rejected`, desde 16/11 07:31, anterior à parada das 17h47. Também há bloqueios factuais/editoriais. Mantidos. Registro 20 preserva checkpoint `post_created`, post 393357, contrato `private`; não foi promovido a publicação verificada nesta auditoria. |

Portal163: o parser com `continueErrorOutput` produzia item sem `link`; o loop enviava esse item ao endpoint que exige `url`, causando `rest_missing_callback_param`. Apenas um nó IF e suas conexões foram acrescentados; nenhum nó anterior foi alterado. Backup, versão ativa e prova natural em `/Users/leandrobosaipo/Projetos/portal163/evidence/2026-11-18-coletor-url/`.

Complemento Portal163 às 09:44: os dois itens isolados correspondiam a URLs oficiais com novos segmentos de ano (Agricultura) e ano/mês (MDIC). O HTML real reproduziu os dois erros; padrões corrigidos retornaram cinco notícias por fonte. Foram ajustados os mesmos padrões em dois nós do coletor e 16 do publicador, sem alterar licenciamento, datas, mídia ou gates. 18 checks sintáticos, 144 de política de URL e validação n8n dos 18 nós aprovados. Publicador publicado primeiro, versão `07a90c96-1d6e-47e2-84ab-3ab186ae6ba9`; coletor depois, versão `6e0bb4b0-78d8-4b7d-9e9e-a4280a67d349`. Readback confirmou `activeVersionId=versionId` e coincidência integral com candidatos. A tabela anterior preserva a primeira correção e a prova das 09h; os testes isolados do complemento não equivalem a publicação editorial.

Prova natural do publicador após o complemento: `1158161`, 09:50:00–09:51:00, `mode=trigger`, versão `07a90c96-1d6e-47e2-84ab-3ab186ae6ba9`, código conferido. Post `157181` publicado e lido pelo workflow; contraprova pública HTTP 200 com H1, canonical e imagem. URL: https://portal163.com.br/agencias-bancarias-fecham-atendimento-presencial-sexta-20/. Essa pauta veio da Agência Brasil na rodada das 09h; a coleta dos novos caminhos dos ministérios tem comprovação separada.

Prova natural do coletor após o complemento: `1158281`, 10:00:00–10:02:05, `mode=trigger`, versão `6e0bb4b0-78d8-4b7d-9e9e-a4280a67d349`, códigos e conexões iguais ao candidato; o snapshot de execução expande parâmetros padrão do n8n. Onze fontes e 55 URLs válidas, zero erros de lista/HTTP 400. Quatorze já cadastradas; 41 artigos lidos, dos quais 21 fora de 24 h, 19 sem mídia qualificada e uma galeria MAPA sem créditos, isolada. O HTML dessa galeria tem três imagens e descrições vazias; preservado o gate, sem inventar crédito. Nenhum post novo nessa rodada por ausência de candidato que atendesse todos os critérios. A falha de um item não impediu os demais. Artefato `urlpaths-natural-proof.json` no Portal163.

## Consolidação, validação e rollback

Checkout principal preservado. Consolidação isolada em `/Users/leandrobosaipo/Projetos/AdOps-worktrees/recovery-20261118`, branch `codex/adops-recovery-20261118`, base `eaa5ae11`, consolidação local `665489d8`. Não houve push nem deploy integral dessa branch; o frontend e componentes fora do recorte exigem comparação própria antes de um deploy geral.

Foram comparados 419 arquivos ativos: API, scripts, runner, módulos compartilhados, esquema DB e três configurações. Todos os hashes coincidem com a fonte ativa após as correções. O grande diff contra a base antiga representa a fonte já implantada, não centenas de novas mudanças em produção. Os 28 workflows AdOps foram exportados com versões, referências de credenciais e manifesto; valores de credenciais não integram os exports. A cópia principal concorrente não foi substituída nem mesclada à força. Lockfile atualizado somente para dependências já existentes na fonte de produção.

Validações: build API local e sobre a fonte remota; cinco testes de preparação/documento; 23 checks de política/autorização; oito cenários OMT; cinco testes do monitor; compilação Python; comparação de hashes; `audit:capture-rules-integrity` com 41 regras publicadas, zero erros e dois avisos sobre regras não publicadas preexistentes. Nenhuma regra de captura foi alterada. Varredura de segredos realizada; ocorrências em fixtures de identidade comercial foram revisadas como falsos positivos.

Foram mantidos Node.js/n8n e Python nos componentes existentes. Um componente Rust separado ampliaria interfaces, implantação e risco desta correção; a telemetria integra o coletor Python já instalado, sem nova dependência ou daemon.

Arquivos novos/corrigidos nesta etapa: builder do relatório; store de preparação; teste de preparação/documento e teste do resumo; Sonda `relay.py`, `recuperacao.py`, `snapshot_health.py`, `collector.py`, `adops_telemetry.py`, testes e documentação/baseline; guard e padrões de URL n8n Portal163, preparador `official-url-paths-20261118.py`, dois snapshots datados e registros nos documentos do projeto. O painel concorrente da Sonda foi preservado. `sonda-changes.patch` inclui também os dois novos módulos de teste/telemetria; `sonda-source-manifest.json` registra oito arquivos conferidos. Nenhum checkout de outro projeto foi resetado nem teve alterações concorrentes incluídas em commit.

Rollback exige conferir a versão/hash corrente e ausência de job próprio ativo. Restaurar apenas os arquivos do manifesto do componente, nunca banco inteiro ou configuração antiga por cima de alteração concorrente. API: restaurar fonte/bundle/mapa do backup `preparation-deadline-20261118` e reiniciar somente a API, depois conferir saúde e hashes. Relatório: restaurar apenas o builder se necessário; não modificar evidências. Portal163: restaurar o workflow anterior somente se a versão atual ainda for a implantada nesta intervenção. Sonda: procedimento descrito acima e no README do projeto.

## Pendências reais

1. Captura inédita integral pelo próximo gatilho natural das 18h, seguida dos marcos noturnos. Não provocar captura duplicada para fabricar essa comprovação.
2. Confirmação de recebimento das mesmas mensagens WhatsApp; não reenviar itens aceitos/incertos.
3. Chegada do PDF da PI LEI e conciliação documental com a campanha 1099.
4. Capacidade do volume de dados: alerta ativo; limpeza/expansão exige inventário e escopo próprios, sem apagar dados para reduzir o alerta.
5. Causa inicial de 16/11 não determinável pelos registros existentes. Não atribuir certeza a hipótese de I/O ou heap sem evidência daquele instante.

Os itens acima não foram apresentados como concluídos. Não houve replay em massa, publicação editorial forçada, redução de gates ou envio por rota alternativa de WhatsApp.
