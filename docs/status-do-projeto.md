# Estado confirmado do projeto AdOps

> Estado: vigente
> Público: equipe operacional, mantenedores e agentes
> Última validação: 2026-08-17
> Release antes desta correção: b00779340442
> Fonte autoritativa: runtime público, Portainer, API AdOps e consumidores reais

## Resumo executivo

O AdOps está em produção. A versão exata deve ser confirmada no release readback; `c71350e` é a base desta política operacional.

Isto substitui a afirmação histórica de que produção estava “em preparação”. Histórico de implantação continua disponível no Git, mas não descreve o runtime atual.

## Estado por capacidade

| Capacidade | Estado em 2026-08-12 | Evidência autoritativa |
|---|---|---|
| API e painel | ativo | health público e release readback |
| Banco operacional | ativo | API Node/PostgreSQL |
| Runner geral | ativo | runtime readiness e heartbeat |
| Prints e exportações | ativo | runner dedicado e jobs concluídos |
| Inventário do Drive | ativo | monitor e snapshot atual |
| Relatório mensal | ativo | página não listada e downloads |
| Worker público | ativo | deployment anterior `4b059f5a-0857-4e00-9cbc-585e808c83ba`; revalidar após deploy |
| Telegram | sob demanda | somente quando solicitado |

## Relatório de agosto

O ciclo validado terminou em aproximadamente 3min48s e materializou 163 datas auditadas. O portal oferece filtro por portal, busca, estados, previsão de sete dias, JPEG individual, ZIP por portal e ZIP completo por campanha.

Esses números são uma fotografia datada. A fonte mensal agregada e o relatório público devem ser reconsultados para totais atuais.

## Correção mensal de 17/08/2026

PI 14771/OMT e PI 9750/AFL já estavam cadastradas e publicadas, respectivamente como `campaignId=969/insertionId=1841` e `campaignId=981/insertionId=1854`. As mídias públicas responderam HTTP 200 com hash igual ao arquivo do Drive. As evidências estavam aprovadas até 14/08 e faltava somente 15/08.

Elas desapareceram do relatório porque a fonte mensal reutilizava a consulta de campanhas ativas na data-alvo 16/08. Como os dois períodos terminaram em 15/08, foram excluídas. A correção faz a fonte mensal carregar qualquer linha cujo período toque agosto, preservando a fonte `active` apenas para a rotina diária.

As duas pastas do snapshot continham PDF e GIF, mas `textFiles=[]`. Qualquer redirect informado fora desse snapshot precisa ser reconsultado pelo ID exato da pasta; ausência no inventário não autoriza inventar destino.

## Pendência operacional conhecida

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
