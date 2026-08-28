# Design — progresso vivo no relatório de evidências AdOps

> Estado: proposta aprovada para especificação; implementação ainda não iniciada
> Data: 2026-08-27
> Fuso operacional: `America/Cuiaba`

## 1. Problema confirmado

O relatório mensal é publicado como HTML, JSON e assets estáticos. A página pública possui filtros, modal, downloads e contadores, mas não consulta a API durante a execução dos prints.

O runtime já expõe:

- `GET /api/ops/daily-print-status`;
- `GET /api/ops/queue/overview`;
- `GET /api/ops/jobs/{jobId}/progress`;
- `GET /api/ops/jobs/{jobId}`;
- `GET /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD`.

A rotina diária também já informa progresso parcial ao job pai. Porém, o resumo em andamento não preserva todos os IDs concluídos, falhos e ainda não iniciados. O relatório só mostra o novo estado depois de uma nova publicação completa ou incremental.

Em 27/08/2026, a atualização incremental disparada após uma aprovação falhou porque o modo sem exportação não conseguiu reutilizar os ZIPs existentes. A falha preservou corretamente a página pública anterior, mas comprovou que reconstruir todo o artefato não deve ser o mecanismo de acompanhamento ao vivo.

## 2. Objetivo

Permitir que a mesma página pública mostre, durante a rotina:

- percentual total;
- inserções concluídas;
- inserção em execução;
- inserções ainda não iniciadas;
- falhas ou bloqueios;
- próxima tentativa automática;
- evidência do dia assim que a auditoria aprovar.

O acompanhamento deve funcionar sem WebSocket, serviço, fila, banco ou endpoint novo.

## 3. Decisão

Manter o relatório como artefato estático e adicionar uma camada viva no navegador.

Essa camada consulta somente endpoints públicos de leitura. O HTML e o `data.json` publicados continuam sendo o último snapshot mensal íntegro. Se a API estiver indisponível, o snapshot permanece utilizável e a interface mostra que os dados vivos estão temporariamente indisponíveis.

Não usar a reconstrução mensal para desenhar progresso. A reconstrução incremental permanece responsável por consolidar o snapshot depois das aprovações, mas não bloqueia a visualização viva.

## 4. Arquitetura mínima

```text
relatório estático publicado
        |
        +-- carrega cards, filtros, modal e ZIPs do snapshot
        |
        +-- consulta queue/overview
        +-- consulta daily-print-status
        +-- consulta progress do job ativo ou mais recente
        +-- consulta capture-proof/status apenas para IDs alterados
        |
        +-- atualiza header e células do dia somente no DOM
```

Nenhuma atualização viva grava no AdOps, no relatório ou no storage.

## 5. Contrato do progresso do lote

O `print-batch` continuará usando `GET /api/ops/jobs/{jobId}/progress`. O payload de progresso passará a carregar um resumo acumulado dentro do resultado já aceito pelo contrato:

```json
{
  "jobId": "uuid",
  "kind": "print-batch",
  "status": "running",
  "stageKey": "capture_async_wait",
  "percentTotal": 67,
  "itemsDone": 2,
  "itemsTotal": 3,
  "insertionId": 2278,
  "targetDate": "2026-08-27",
  "liveProgress": {
    "completedInsertionIds": [2693, 2650],
    "runningInsertionId": 2278,
    "pendingInsertionIds": [],
    "failedInsertionIds": [],
    "blockedInsertionIds": []
  }
}
```

Regras:

- `completedInsertionIds`: evidência auditada ou `skipped_existing` com auditoria confirmada;
- `runningInsertionId`: no máximo um, pois captura continua serial;
- `pendingInsertionIds`: elegíveis ainda não iniciadas;
- `failedInsertionIds`: tentativa terminal falhou;
- `blockedInsertionIds`: publicação ou reconstrução bloqueada por regra;
- IDs não podem aparecer em mais de um estado terminal;
- campos ausentes permanecem compatíveis com o fallback atual;
- percentuais são calculados por `itemsDone / itemsTotal`, nunca por tempo estimado;
- `itemsTotal=0` só é permitido quando não houver inserção elegível.

O runner enviará o resumo depois de cada mudança de inserção. A API continuará apenas armazenando e descrevendo o resultado recebido.

## 6. Comportamento da página

### 6.1 Header vivo

O header terá uma faixa chamada `Prints de hoje` com:

- barra de 0 a 100%;
- texto `X de Y concluídos`;
- inserção atual, quando existir;
- quantidade aguardando;
- quantidade com falha ou bloqueio;
- próxima tentativa automática;
- horário da última atualização viva.

Estados da faixa:

- `Aguardando início`;
- `Em andamento`;
- `Concluído`;
- `Concluído parcialmente`;
- `Bloqueado`;
- `Dados vivos indisponíveis`.

A barra usa `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` e texto equivalente para leitores de tela.

### 6.2 Detalhe por inserção

Abaixo da barra haverá uma lista expansível. Cada linha usa os dados já presentes no snapshot para mostrar:

- campanha;
- PI;
- portal;
- inserção;
- data-alvo;
- estado operacional;
- causa resumida, quando houver.

Estados visuais:

- `Concluído`;
- `Em andamento`;
- `Não iniciado`;
- `Falhou`;
- `Bloqueado`.

Detalhes técnicos ficam recolhidos. A mensagem principal permanece simples.

### 6.3 Atualização das evidências

Quando um ID muda para concluído, a página consulta uma única vez:

```text
GET /api/insertions/{id}/capture-proof/status?date={targetDate}
```

Somente `status=audited` ou o estado aprovado previsto pelo contrato pode alterar a célula do dia para concluída e exibir miniatura/link. Arquivo existente ou HTTP 200 não basta.

O DOM pode mostrar a nova evidência antes da próxima publicação mensal. Essa alteração é temporária e desaparece ao recarregar caso ainda não tenha sido consolidada no snapshot. O selo `Atualização ao vivo` diferencia esse estado do snapshot publicado.

ZIPs, totais mensais e histórico completo não são recalculados no navegador.

## 7. Polling finito

- job ativo: consultar a cada 15 segundos;
- aguardando próxima recuperação no mesmo dia: consultar a cada 60 segundos;
- job terminal e sem próxima recuperação: interromper;
- página em segundo plano: não consultar com frequência maior que 60 segundos;
- requisições sobrepostas são proibidas;
- erro usa espera progressiva de 30, 60 e 120 segundos;
- após três erros consecutivos, manter o snapshot e oferecer botão `Tentar atualizar`;
- voltar à página força uma leitura imediata, sem criar job.

Esse polling consome chamadas HTTP comuns. Não inicia automação, captura ou uso de modelo.

## 8. Segurança e falha fechada

- somente endpoints GET públicos;
- nenhum token, cookie administrativo ou header privado no HTML;
- texto de erro é sanitizado antes de entrar no DOM;
- URLs de evidência precisam ser HTTPS e pertencer aos hosts aceitos pelo contrato atual;
- API indisponível não apaga cards, filtros, modal ou downloads do snapshot;
- estado vivo nunca reclassifica auditoria;
- estado vivo nunca altera ZIP;
- atualização mensal continua usando staging e troca atômica;
- regressão de uma evidência antes auditada bloqueia a publicação mensal, como hoje.

## 9. Atualização incremental mensal

O defeito observado no modo incremental também será corrigido, sem mudar a responsabilidade do mecanismo:

- reutilizar os URLs de ZIP do snapshot público anterior quando os fingerprints forem compatíveis;
- não exigir nova exportação em `ADOPS_REPORT_SKIP_EXPORTS=1`;
- falhar se um ZIP necessário não existir ou não corresponder à campanha;
- nunca publicar URLs vazias;
- manter o snapshot anterior em qualquer falha.

Essa correção reduz o intervalo entre a aprovação e a consolidação, mas não é necessária para o header vivo funcionar.

## 10. Documentação canônica

Serão atualizados:

- índice inicial e estado vigente;
- runbook do relatório mensal;
- spec e harness de fila/progresso;
- harness do relatório mensal;
- OpenAPI, descrevendo explicitamente o campo `liveProgress`;
- mapa de responsabilidades entre Worker/D1 e Mac Mini/PostgreSQL.

A documentação deve separar claramente:

- snapshot mensal estático;
- acompanhamento vivo no navegador;
- atualização incremental do snapshot;
- geração de evidência;
- geração de ZIP.

## 11. Harness rígido

O harness deve falhar quando:

- o header vivo ou a barra desaparecerem;
- faltar qualquer um dos cinco estados;
- percentual sair de `0..100`;
- um ID aparecer simultaneamente como concluído, pendente, falho ou bloqueado;
- a página fizer POST, PUT, PATCH ou DELETE;
- houver token ou host interno no HTML;
- polling continuar depois do estado terminal sem recuperação;
- API indisponível remover o snapshot;
- miniatura for promovida sem auditoria aprovada;
- atualização incremental apagar URLs de ZIP existentes;
- publicação mensal reduzir evidências auditadas sem bloqueio;
- modal, filtros ou os dois downloads ZIP regredirem.

Casos determinísticos mínimos:

1. nenhum job ativo;
2. lote com 0%, 50% e 100%;
3. uma inserção falha e as demais continuam;
4. recuperação automática agendada;
5. API fica indisponível após a página carregar;
6. evidência aprova durante a execução;
7. atualização incremental reutiliza ZIP compatível;
8. ZIP incompatível bloqueia a troca atômica.

## 12. Arquivos previstos

- `ops/cloudflare-remote-runner/src/runner.mjs`;
- `scripts/src/build-current-month-evidence-report.mjs`;
- `scripts/src/monthly-evidence-contract.mjs`;
- testes mensais e de progresso em `scripts/src/`;
- `lib/api-spec/openapi.yaml`;
- `docs/START_HERE_ADOPS.md`;
- `docs/status-do-projeto.md`;
- `docs/spec-adops-fila-progresso-v1.md`;
- `docs/harness-adops-ux-fila-progresso-v1.md`;
- `docs/adops/evidence-monthly-report/runbook.md`;
- `docs/adops/evidence-monthly-report/harness.md`.

Nenhuma dependência nova está prevista.

## 13. Quality gates

```bash
node --check scripts/src/build-current-month-evidence-report.mjs
node --check ops/cloudflare-remote-runner/src/runner.mjs
node scripts/src/test-monthly-evidence-contract.mjs
node scripts/src/test-monthly-report-mobile-ui.mjs
node scripts/src/test-monthly-report-incremental-refresh.mjs
pnpm --dir scripts run harness:adops-ux-fila-progresso-v1
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

Depois do deploy autorizado:

- confirmar release ativa;
- abrir o relatório em desktop e celular;
- observar um job real do início ao estado terminal;
- comparar IDs do header com o job canônico;
- validar miniatura, modal e downloads;
- desligar a API em teste controlado ou simular falha para confirmar o fallback;
- confirmar que nenhum polling cria job.

## 14. Critérios de aceite

- o header mostra percentual e contagens reais durante o lote;
- campanha e inserção corrente são identificáveis;
- concluídas, em andamento, não iniciadas, falhas e bloqueadas ficam separadas;
- evidência aprovada aparece sem esperar o relatório completo;
- o snapshot continua navegável quando a API falha;
- nenhuma mutação parte da página pública;
- atualização incremental preserva ZIPs válidos;
- relatório completo mantém troca atômica e gates atuais;
- documentação e harness impedem remoção silenciosa do recurso;
- zero endpoint, fila, serviço ou dependência nova.

## 15. Fora do escopo

- WebSocket ou SSE;
- painel administrativo novo;
- mudança na janela das rotinas;
- paralelizar capturas;
- recalcular ZIP no navegador;
- transformar o relatório público em aplicação autenticada.
