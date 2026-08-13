# Estado confirmado do projeto AdOps

> Estado: vigente
> Público: equipe operacional, mantenedores e agentes
> Última validação: 2026-08-13
> Release-base: 47e0dab
> Fonte autoritativa: runtime público, Portainer, API AdOps e consumidores reais

## Resumo executivo

O AdOps está em produção. A API, o painel, os runners, o monitor do Drive, o relatório mensal e os downloads de evidências operam na release 47e0dab.

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
| Worker público | ativo | deployment `a6784158-c39c-4fe5-9222-ded850daadb6` |
| Telegram | sob demanda | somente quando solicitado |

## Relatório de agosto

O ciclo validado terminou em aproximadamente 3min48s e materializou 163 datas auditadas. O portal oferece filtro por portal, busca, estados, previsão de sete dias, JPEG individual, ZIP por portal e ZIP completo por campanha.

Esses números são uma fotografia datada. A fonte mensal agregada e o relatório público devem ser reconsultados para totais atuais.

## Pendência operacional conhecida

RADAR/PERRENGUE, inserção `#1944`, está em `awaiting_authoritative_pi` até existir PI/PDF autoritativa. O Drive contém mídia candidata e documento de destino, mas campanha homônima não pode ser associada à PI 17190 por inferência.

Enquanto o bloqueio existir:

- não criar campanha ou inserção duplicada;
- não publicar anúncio;
- não gerar evidência como se a campanha estivesse ativa;
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

- recuperar a PI/PDF de `#1944` antes de publicar;
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
