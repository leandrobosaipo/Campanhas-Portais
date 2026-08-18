# Estado confirmado do projeto AdOps

> Estado: vigente
> Público: equipe operacional, mantenedores e agentes
> Última validação: 2026-08-17
> Release validada: 72c1cb9fbc8df38ef032de310b3e9b40f9029c3d
> Fonte autoritativa: runtime público, Portainer, API AdOps e consumidores reais

## Resumo executivo

O AdOps está em produção na release `72c1cb9fbc8df38ef032de310b3e9b40f9029c3d`, confirmada pelo release readback, health público e pelos três runners.

Isto substitui a afirmação histórica de que produção estava “em preparação”. Histórico de implantação continua disponível no Git, mas não descreve o runtime atual.

## Estado por capacidade

| Capacidade | Estado em 2026-08-17 | Evidência autoritativa |
|---|---|---|
| API e painel | ativo | health público e release readback |
| Banco operacional | ativo | API Node/PostgreSQL |
| Runner geral | ativo | runtime readiness e heartbeat |
| Prints e exportações | ativo | runner dedicado e jobs concluídos |
| Inventário do Drive | ativo | monitor e snapshot atual |
| Relatório mensal | ativo | página não listada e downloads |
| Worker público | ativo | deployment `d436a6f9-1622-4ed2-979c-1b0eceb674cc` e três crons ativos |
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

Regra aprendida: nomes detalhados de posição só podem ser equivalentes por pares exatos aprovados. Nunca usar `includes("TOPO")` ou `includes("VIDEO")`, pois isso pode selecionar outra posição. Redirect é opcional; quando ausente, o banner deve ser publicado sem link. Quando fornecido, continua obrigatório validar um único HTTPS público.

RADAR/PERRENGUE, inserção `#1944`, pode usar identidade operacional única para veiculação sem PDF, preservando `commercialIdentityStatus=awaiting_authoritative_pi`. O Drive contém mídia candidata e documento de destino. A publicação depende do preflight vivo e nunca associa a campanha à PI 17190. Faturamento e ZIP por PI aguardam a fonte autoritativa.

Enquanto a PI/PDF continuar ausente:

- não criar campanha ou inserção duplicada;
- publicar apenas se o preflight operacional único passar; falha em qualquer gate mantém o rascunho;
- gerar evidência somente depois de AdRotate, cache e HTML público confirmarem a veiculação;
- manter mídia como `candidate_found` e identidade como `insufficient_data`.

## Ganhos consolidados

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
- criação e leitura de jobs pela API canônica devem convergir no D1 consumido pelos runners; a fila PostgreSQL permanece somente como legado e não comprova execução;
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
