# Recuperação AdOps — validação e correções de 18/11/2026

Horários deste documento em America/Cuiaba, salvo indicação UTC. Trabalho executado sobre os registros de 16–17/11. Evidências técnicas privadas: `outputs/fechamento-recuperacao-2026-11-18/`. Não publicar essa pasta: contém snapshots operacionais e configurações privadas.

## Resultado e alcance

- Relatório publicado corrigido: OMT #3123 está `ok`, sem datas inválidas ou faltantes; 13 dias auditados. Total do relatório: 17 itens válidos, zero inválidos/faltantes, 134 dias auditados.
- Preparação de campanhas agora encerra também pedidos e retentativas que ultrapassem 30 minutos. A correção foi testada, compilada sobre a fonte ativa, implantada e conferida por hash e API.
- Monitor independente do n8n implantado na Sonda existente, com aviso de indisponibilidade/atraso, deduplicação, recuperação e telemetria do host/banco. Teste real de falha e retorno chegou à caixa de entrada sem parar o n8n.
- Portal163: HTTP 400 corrigido; ciclo natural das 09h processou 11 fontes, isolou dois itens inválidos e criou nove pendentes com capa, mantendo o gate editorial.
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

Cinco testes adicionais cobrem prazo, espera, retentativas, isolamento e chegada documental simulada. API compilada sobre a fonte viva; três arquivos implantados (fonte, bundle e mapa), com 143 guardas de hash e ausência de job ativo na intervenção. Reinício da API às 09:10:53; a primeira consulta durante a subida retornou 502, a consulta posterior confirmou `available=true` e `authorizationEnabled=true`, e os três hashes foram conferidos. O n8n não foi reiniciado nesta etapa.

Backup: `/app/ops-backups/preparation-deadline-20261118`. Manifesto: `deadline-build-manifest.json`. SHA da fonte nova: `478b276df36c20448b6a2c2ea6f61439c6efb6ce21f530f17e4396caaee06e7b`.

## Monitor independente e telemetria

Infraestrutura reutilizada: `/Users/leandrobosaipo/Projetos/cod5-sonda-uptimerobot`. Gatus/relay na VM8 e coletor Linux no Mac Mini. Não depende do tratador de erros do n8n nem do Codex como relógio.

- Prontidão HTTP do n8n: `/healthz/readiness`, consulta externa a cada cinco minutos.
- Atualidade do coletor: monitor na VM8 a cada dois minutos.
- Coleta independente a cada três minutos: Docker n8n/PostgreSQL, conclusões naturais e atraso das agendas. Execuções manuais são excluídas; atraso usa tolerância de 12 minutos e duas amostras consecutivas ruins.
- Alerta e recuperação dos quatro fluxos críticos AdOps, processo/banco, memória e capacidade de disco. Outros projetos preservam a política anterior de histórico.
- Canal existente: Gmail do Financeiro → suporte@codigo5.com.br. Nenhum WhatsApp alternativo foi utilizado.
- Deduplicação por incidente aberto e transição de estado; resultados antigos `sending` permanecem incertos, sem reenvio.

Teste real, sem interromper produção: endpoint temporário respondeu 503 e voltou automaticamente. Falha observada 09:00:49, recuperação 09:01:34. Um alerta e uma recuperação foram encontrados com rótulo INBOX: Gmail `1a1eebf8789ed037` (09:01:31) e `1a1eebfc40c9d587` (09:01:47). Endpoint temporário removido. Quatro testes isolados cobriram indisponibilidade, atraso, deduplicação e recuperação.

A Sonda tinha dois problemas próprios:

1. API do histórico retornava `SQLITE_IOERR_GETTEMPPATH`. O container só de leitura não tinha pasta temporária gravável. Corrigido com `/data/tmp` no volume e `TMPDIR=/data/tmp`; API voltou a HTTP 200 com 138 endpoints.
2. Eventos Docker comprovavam OOM/reinícios do relay de 42 MiB. Reutilização do contexto TLS reduziu alocações repetidas; o pico registrado durante os envios de teste foi 39.420 KiB. Gatus usava `GOMEMLIMIT=80MiB` sob teto de 43 MiB; ajustado para 28 MiB. Não houve novo restart/OOM no intervalo observado após a implantação. Essa observação não garante ausência futura nem identifica sozinha a alocação inicial.

Reserva total preservada: 0,25 vCPU e 128 MiB. Amostra pós-correção: Gatus 32.923.648 bytes; relay 34.385.920 bytes. Reinícios desde a implantação: zero em ambos na amostra. O painel local concorrente não foi alterado.

Telemetria privada: `/opt/cod5-sonda-collector/adops-telemetry.jsonl`, rotacionada em dois arquivos de até 4 MiB. Registra RAM disponível, swap, espaço, pressão de I/O, memória/eventos do cgroup, reinícios, tamanho do log e conexões/bloqueios/fila PostgreSQL. Limites de consulta e execução preservados; nenhuma mensagem ou credencial é gravada pelo módulo.

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
- Passivo histórico `new`: 152.324 registros, desde 26/10. Um registro transitório adicional às 09h desapareceu na amostra seguinte. Contagens `running` de 150–312 incluem registros e admissões; não devem ser interpretadas como igual número de jobs usando CPU simultaneamente.
- Guarda de boot atual impede replay quando o passivo supera 1.000. Validada por leitura da versão montada; registros preservados e nenhum replay em massa.

O histórico disponível não identifica a consulta, processo ou alocação responsável pelo primeiro timeout/OOM. Não há prova de reboot, disco cheio ou uma exceção única que tenha parado tudo. Pressão de I/O, competição por recursos e custo de recuperação do passivo permanecem hipóteses. Telemetria, logs, guarda de replay e monitor externo permitem correlacionar uma próxima ocorrência; não foi aumentado pool/heap nem apagada a fila com base em suposição.

## PI LEI/ALMT e WhatsApp

Identidade `PERRENGUE:25208280`, campanha 1099, pasta `1Adw9IJ0tT0YRLtsDfTbWcCP1LINfHhOV`.

Inventário natural `8e3a41bd-8679-4f6a-8cb2-126220d3155e`, 09:14:27, 499 itens; conciliado pelo job `0fde9232-a664-4b2a-90fb-feb6d939c256` às 09:15:31. Consulta direta à mesma pasta às 09:16:11 confirmou dois GIFs, um MP4 e um Google Docs; nenhum PDF. Uma consulta direta anterior retornou 403; nova leitura autorizada e inventário independente confirmaram o acesso e o conteúdo, sem alteração de credenciais/permissões.

Pendência documental continua `searching`, sem SHA de PDF. Teste isolado demonstrou ausência → aviso deduplicado; chegada simulada → `found_requires_reconciliation`; repetição → nenhum novo aviso/cadastro. A conferência real de identidade, cliente, período, posições e valores depende do PDF real. Não foi criada outra campanha nem alterado valor.

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

## Consolidação, validação e rollback

Checkout principal preservado. Consolidação isolada em `/Users/leandrobosaipo/Projetos/AdOps-worktrees/recovery-20261118`, branch `codex/adops-recovery-20261118`, base `eaa5ae11`.

Foram comparados 419 arquivos ativos: API, scripts, runner, módulos compartilhados, esquema DB e três configurações. Todos os hashes coincidem com a fonte ativa após as correções. O grande diff contra a base antiga representa a fonte já implantada, não centenas de novas mudanças em produção. Os 28 workflows AdOps foram exportados com versões, referências de credenciais e manifesto; valores de credenciais não integram os exports. A cópia principal concorrente não foi substituída nem mesclada à força. Lockfile atualizado somente para dependências já existentes na fonte de produção.

Validações: build API local e sobre a fonte remota; cinco testes de preparação/documento; 23 checks de política/autorização; oito cenários OMT; quatro testes do monitor; compilação Python; comparação de hashes; `audit:capture-rules-integrity` com 41 regras publicadas, zero erros e dois avisos sobre regras não publicadas preexistentes. Nenhuma regra de captura foi alterada. Varredura de segredos realizada; ocorrências em fixtures de identidade comercial foram revisadas como falsos positivos.

Arquivos novos/corrigidos nesta etapa: builder do relatório; store de preparação; teste de preparação/documento e teste do resumo; Sonda `relay.py`, `recuperacao.py`, `snapshot_health.py`, `collector.py`, `adops_telemetry.py`, testes e documentação/baseline; guard n8n Portal163 e registros nos documentos do projeto. O painel concorrente da Sonda foi preservado.

Rollback exige conferir a versão/hash corrente e ausência de job próprio ativo. Restaurar apenas os arquivos do manifesto do componente, nunca banco inteiro ou configuração antiga por cima de alteração concorrente. API: restaurar fonte/bundle/mapa do backup `preparation-deadline-20261118` e reiniciar somente a API, depois conferir saúde e hashes. Relatório: restaurar apenas o builder se necessário; não modificar evidências. Portal163: restaurar o workflow anterior somente se a versão atual ainda for a implantada nesta intervenção. Sonda: procedimento descrito acima e no README do projeto.

## Pendências reais

1. Captura inédita integral pelo próximo gatilho natural das 18h, seguida dos marcos noturnos. Não provocar captura duplicada para fabricar essa comprovação.
2. Confirmação de recebimento das mesmas mensagens WhatsApp; não reenviar itens aceitos/incertos.
3. Chegada do PDF da PI LEI e conciliação documental com a campanha 1099.
4. Capacidade do volume de dados: alerta ativo; limpeza/expansão exige inventário e escopo próprios, sem apagar dados para reduzir o alerta.
5. Causa inicial de 16/11 não determinável pelos registros existentes. Não atribuir certeza a hipótese de I/O ou heap sem evidência daquele instante.

Os itens acima não foram apresentados como concluídos. Não houve replay em massa, publicação editorial forçada, redução de gates ou envio por rota alternativa de WhatsApp.
