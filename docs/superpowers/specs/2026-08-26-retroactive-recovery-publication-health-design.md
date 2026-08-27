# Recuperação retroativa finita e saúde de publicação — design

**Data:** 2026-08-26  
**Status:** spec aprovada no brainstorm; implementação aguardando portão HITL  
**Escopo:** API AdOps, runner, publicação AdRotate, auditoria, relatório, alertas e harness operacional  
**Fora do escopo:** endpoint, fila, banco, container, serviço ou dependência nova

## 1. Problema

O AdOps possui o endpoint assíncrono `POST /api/ops/jobs/print-backfill`, mas a recuperação recente não resolveu as pendências históricas. Casos sem prova editorial foram bloqueados corretamente para evitar fabricação de evidência, porém o processo desviou para monitoramento de janelas futuras em vez de produzir um resultado operacional finito.

Há também uma mistura indevida entre dois estados independentes:

1. saúde de publicação: mídia correta vinculada no AdOps, publicada no grupo AdRotate esperado e observada no HTML público;
2. saúde de evidências: prints exigíveis auditados, ausentes ou inválidos.

Uma campanha pode possuir prints antigos auditados e, mesmo assim, estar com a publicação atual quebrada. Também pode ter mídia disponível no Drive, mas ainda não vinculada nem publicada. Esses estados não podem se ocultar mutuamente.

## 2. Decisões aprovadas

- `print-backfill` continua sendo o único caminho para geração retroativa.
- A reconstrução usa `candidate=true`, `promote=true` e `reconstructionReason=late_publication_recovery`.
- A promoção exige `allowAuditedReconstruction=true` na regra publicada e checklist final aprovado.
- Falha temporária recebe no máximo três tentativas dentro do mesmo job.
- Bloqueio de contrato, publicação, mídia, auditoria ou segurança não recebe retry cego.
- Toda execução termina em `completed` ou `failed`; o resultado por item explica sucesso, falha ou bloqueio.
- O agente acompanha o mesmo `jobId` até estado terminal. Não cria automação recorrente para aguardar horário futuro.
- A primeira recuperação após o deploy considera todas as pendências canônicas atuais, não somente as inserções conhecidas.
- Evidência já auditada nunca é regenerada nem sobrescrita.
- O monitor conversacional de 72 horas deve ser removido após o próximo portão HITL, antes da implementação.

## 3. Fontes de verdade

Ordem operacional:

1. PI e arquivo de mídia no Google Drive;
2. campanha e inserção canônicas no AdOps;
3. relação administrativa e leitura viva do AdRotate;
4. mídia observada no HTML público;
5. auditoria canônica por inserção e data;
6. relatório público como consumidor, nunca como fonte de aprovação.

`bannerPublicadoNoSite=true` é uma declaração persistida, não confirmação viva suficiente. A confirmação de publicação exige relação canônica, grupo esperado, mídia esperada observada e HTML público coerente.

## 4. Identidade comercial e prevenção de duplicidade

### 4.1 PI normalizada

A identidade canônica da PI é composta somente pelos dígitos, sem zeros não significativos à esquerda quando aplicável ao contrato já existente.

Exemplos equivalentes:

```text
91159
PI 91159
PI 91159 - PREF PVA
```

Antes de localizar ou criar campanha, todos os produtores e consumidores do fluxo devem reutilizar a normalização canônica existente. Não deve existir uma segunda função de normalização específica para esta correção.

### 4.2 Chave de duplicidade

Uma nova campanha ou inserção deve ser bloqueada quando já existir identidade operacional compatível:

```text
PI normalizada + portal + formato normalizado + período
```

O bloqueio retorna as campanhas e inserções candidatas para reconciliação. Ele não escolhe automaticamente entre registros divergentes e não apaga dados.

### 4.3 Reconciliação

Quando houver duplicidade:

- preservar a campanha e inserção confirmadas como canônicas;
- vincular publicação e mídia somente à inserção canônica;
- não copiar evidências entre inserções;
- não excluir duplicatas automaticamente;
- marcar registros duplicados sem mídia para revisão/inativação pelo fluxo existente;
- registrar IDs canônico e duplicados no resultado operacional.

## 5. Saúde operacional

### 5.1 Estados independentes

Cada inserção expõe dois blocos independentes:

```text
publicationHealth
evidenceHealth
```

`publicationHealth` considera:

- mídia canônica presente;
- formato compatível;
- relação AdRotate resolvida;
- grupo esperado;
- mídia esperada observada ao vivo;
- confirmação no HTML público;
- período e status operacional.

`evidenceHealth` considera:

- datas exigíveis;
- datas auditadas;
- datas ausentes;
- datas inválidas;
- datas bloqueadas por publicação ou reconstrução.

Print antigo aprovado não transforma `publicationHealth` em saudável. Falha atual de publicação não invalida retroativamente um print auditado.

### 5.2 Estado `blocked_upstream`

Inserção dentro do período, mas ainda não publicada de forma confirmada, permanece visível na lista de evidências com:

```json
{
  "status": "blocked_upstream",
  "reason": "media_missing | adrotate_relation_missing | expected_media_not_observed | public_html_not_confirmed | duplicate_identity",
  "requiredAction": "resolve_media | reconcile_duplicate | publish_adrotate | verify_publication"
}
```

`blocked_upstream` não conta como print faltante capturável. O scheduler não cria captura antes da publicação. Depois da confirmação viva, a auditoria recalcula datas faltantes e `print-backfill` processa somente essas datas.

### 5.3 Detecção preventiva

Antes do início do período:

- reutilizar `drive-pi-preflight` para localizar mídia compatível no Drive;
- comparar Drive, `mediaUrl`, formato e relação AdRotate;
- abrir pendência preventiva quando a mídia existe no Drive, mas está ausente no AdOps ou AdRotate;
- não publicar nem gerar evidência no preflight.

No início do período:

- se a publicação viva ainda não estiver confirmada, registrar incidente `blocked_upstream`;
- informar motivo, inserção, PI, portal, grupo esperado e ação necessária;
- impedir o scheduler de criar print;
- manter o item visível no relatório e no alerta.

## 6. Recuperação retroativa finita

### 6.1 Entrada

O fluxo consulta a auditoria canônica e monta pares únicos:

```text
insertionId + targetDate
```

Somente entram pares:

- dentro do período contratado;
- com publicação viva confirmada;
- ausentes ou inválidos;
- sem evidência final auditada.

### 6.2 Idempotência

Cada par usa chave estável:

```text
print-backfill:{insertionId}:{targetDate}:late_publication_recovery
```

Repetir a mesma solicitação retorna o trabalho existente ou `skipped_existing`. Não cria job concorrente e não altera URL auditada.

### 6.3 Resultado por item

```json
{
  "insertionId": 2645,
  "date": "2026-08-24",
  "status": "audited | failed | skipped_existing | blocked_reconstruction | blocked_upstream",
  "attempts": 1,
  "evidenceUrl": null,
  "errorCode": null,
  "error": null,
  "checklistStatus": null
}
```

O job pai preserva os estados públicos existentes:

- `completed`: todos os itens são `audited` ou `skipped_existing`;
- `failed`: existe `failed`, `blocked_reconstruction` ou `blocked_upstream`.

O resultado agrega contagens, IDs afetados, início, fim, duração e todos os itens. Resultado reprovado nunca pode ter erro e lista de problemas simultaneamente vazios.

### 6.4 Tentativas

Repetir até três vezes somente:

- timeout de rede;
- HTTP `429`, `502`, `503` ou `504`;
- interrupção transitória do runner;
- falha temporária de upload ou leitura da API.

Intervalos: 2 segundos antes da segunda tentativa e 5 segundos antes da terceira.

Não repetir:

- reconstrução não autorizada;
- checklist final reprovado;
- mídia divergente;
- anúncio não publicado;
- data fora do período;
- metadata inválida;
- autenticação ou contrato inválido.

A falha de um item não interrompe os demais.

## 7. Caso confirmado: PI 91159 — Vira Saúde — AFL

### Estado conhecido

- inserção canônica: `#2693`;
- período: 21/08/2026 a 31/08/2026;
- evidências de 21/08 a 26/08 auditadas;
- grupo AdRotate esperado: `14`;
- `exactLiveMatches=[]`;
- `expectedMediaObserved=false`;
- `publicConfirmation=reported_only`;
- campanha `#1008` / inserção `#2693`: canônica;
- inserção `#2714`: duplicada, sem mídia;
- campanha `#1014` / inserção `#2779`: duplicada, sem mídia.

### Tratamento

1. Não regenerar nem substituir evidências de 21/08 a 26/08.
2. Normalizar a PI e localizar todas as identidades `91159` no AFL.
3. Preservar `#1008/#2693` como relação canônica.
4. Reconciliar `#2714` e `#1014/#2779` como duplicidades operacionais sem mídia, sem exclusão automática.
5. Resolver a relação AdRotate da inserção canônica com o grupo `14`.
6. Confirmar a mídia esperada na leitura viva do AdRotate.
7. Confirmar a mesma mídia no HTML público.
8. Atualizar saúde de publicação sem alterar a saúde das evidências auditadas.

Critério de aceite específico: `#2693` mantém as mesmas URLs auditadas; relação canônica única; mídia esperada observada no grupo `14`; HTML público coerente; duplicidades registradas e impedidas de receber nova publicação.

## 8. Caso confirmado: PI 3172 — Sanear — AFL — Vídeo

### Estado conhecido

- inserção: `#2645`;
- período: 24/08/2026 a 26/08/2026;
- datas faltantes: 24/08, 25/08 e 26/08;
- Drive contém `SANEAR ESTIAGEM_V03.mp4`;
- API confirma compatibilidade com formato `VIDEO`;
- inserção em rascunho;
- `mediaUrl` ausente;
- `bannerPublicadoNoSite=false`;
- grupo AdRotate esperado: `6`.

### Ordem obrigatória

1. Executar `drive-pi-preflight` para confirmar pasta, arquivo, PI, formato e alvo sem mutação.
2. Vincular/publicar o MP4 pelo fluxo existente `drive-pi-publish`/`adrotate-publish`, sem criar campanha ou inserção nova.
3. Confirmar vídeo no grupo `6`, relação canônica e HTML público.
4. Somente após confirmação viva, criar `print-backfill` para 24/08 a 26/08.
5. Acompanhar o mesmo `jobId` até `completed` ou `failed`.
6. Validar auditoria, data, slot, frame representativo do vídeo, URL, miniatura, modal e download.

Antes da etapa 3, as três datas aparecem como `blocked_upstream`, não como captura executável. Depois da publicação, o backfill recebe somente as datas ainda ausentes.

Critério de aceite específico: mídia canônica corresponde a `SANEAR ESTIAGEM_V03.mp4`; grupo `6` e HTML público confirmados; três datas chegam a `audited` ou permanecem bloqueadas com causa técnica explícita; nenhum job paralelo.

## 9. Relatório e alertas

O relatório apresenta saúde de publicação e evidências separadamente.

Estados visíveis:

- publicação saudável;
- `blocked_upstream`;
- evidência auditada;
- print obrigatório faltante;
- print inválido;
- reconstrução bloqueada;
- recuperação em andamento.

Uma evidência antiga auditada não oculta `expected_media_not_observed`. Uma inserção não publicada não desaparece da lista: fica bloqueada com motivo e ação.

Alertas são orientados a transição, não a janela de monitoramento:

- primeiro bloqueio;
- mudança na lista de itens afetados;
- resolução;
- falha terminal do job.

Nenhum alerta cria job ou decide aprovação.

## 10. Harness finito anti-loop

Criar um único harness com modos `check`, `execute` e `verify`, reutilizando os clientes e contratos existentes.

### `check`

Somente leitura:

- integridade das regras;
- identidade e duplicidades;
- Drive preflight;
- saúde de publicação;
- auditoria canônica;
- pares pendentes;
- fila, runners e release ativo.

### `execute`

Mutação explícita:

- usa somente jobs existentes;
- cria um único `print-backfill` idempotente para o recorte aprovado;
- acompanha o mesmo `jobId`;
- termina em estado terminal ou timeout de 45 minutos;
- nunca cria automação, job concorrente ou retry externo.

### `verify`

- valida `capture-proof/status` por par;
- exige checklist final aprovado;
- testa URL de evidência;
- regenera o relatório com um job `evidence-monthly-report` após o backfill terminal;
- acompanha o job do relatório até estado terminal;
- valida HTML, miniatura, modal, download e filtro `evidence=missing`.

Saída:

```text
docs/harness-reports/retroactive-recovery/<timestamp>/summary.md
docs/harness-reports/retroactive-recovery/<timestamp>/results.json
```

Timeout encerra o harness com código diferente de zero e registra `jobId`, estágio, heartbeat e causa. Não agenda continuação.

Regra documental obrigatória:

> Pedido operacional finito não pode virar monitoramento temporal aberto. O agente acompanha o mesmo job até estado terminal. Dependência de horário futuro vira teste, validação manual documentada ou pendência explícita; nunca automação recorrente criada apenas para manter a conversa ativa.

## 11. Testes obrigatórios

### Identidade e duplicidade

- `91159` e `PI 91159 - PREF PVA` resolvem a mesma identidade.
- A chave PI normalizada + portal + formato + período bloqueia duplicidade.
- Reconciliação preserva a inserção canônica e não copia evidência.

### Saúde operacional

- campanha com evidência antiga aprovada, mas mídia atual não observada, não retorna estado operacional `ok`;
- vídeo presente no Drive e sem `mediaUrl` gera pendência antes do período;
- `bannerPublicadoNoSite=true` sem mídia viva confirmada não aprova publicação;
- inserção iniciada e não publicada aparece como `blocked_upstream`;
- scheduler não gera print antes da publicação.

### Recuperação

- após publicação, backfill recebe somente datas faltantes;
- evidência auditada resulta em `skipped_existing` e mantém a URL;
- repetição retorna o mesmo trabalho ou deduplica o par;
- falha temporária recebe no máximo três tentativas;
- bloqueio de reconstrução não recebe retry;
- falha de um item não interrompe os demais;
- job parcial termina `failed` com resultados preservados;
- `approved=false` nunca retorna problemas vazios.

### Casos sentinela

- `#2693`: 21/08 a 26/08 permanecem auditadas e sem regeneração; falha viva do grupo `14` continua visível.
- `#2645`: antes da publicação, 24/08 a 26/08 ficam `blocked_upstream`; depois, somente essas datas entram no backfill.

### Consumidor

- relatório separa publicação e evidência;
- item bloqueado não desaparece;
- miniatura, modal e download são validados separadamente;
- filtro `evidence=missing` reflete o estado canônico.

## 12. Quality gates

Antes do deploy:

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --dir scripts run test:runner-async-capture-contract
pnpm --dir scripts run test:ops-scheduler
node scripts/src/test-publication-reconcile-policy.mjs
node scripts/src/test-cross-portal-retro-reconstruction.mjs
node scripts/src/test-daily-print-recovery-contract.mjs
node scripts/src/test-monthly-report-incremental-refresh.mjs
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

O novo harness deve provar seus modos `check`, `execute` e `verify` com API simulada antes do uso real. Build local, HTTP 200, job criado ou estado intermediário não encerram a entrega.

Após o deploy:

- confirmar SHA público;
- confirmar API, web, banco e runners saudáveis;
- executar `check` sem mutação;
- corrigir publicação de `#2693` sem regenerar evidência;
- publicar `#2645` antes do backfill;
- executar recuperação de todas as pendências atuais elegíveis;
- acompanhar cada job original até estado terminal;
- validar auditoria e consumidor público;
- registrar separadamente tudo que permanecer bloqueado.

## 13. Ondas de execução

Máximo de dois executores simultâneos. Nenhum executor altera arquivo pertencente a outra fatia na mesma onda.

### Onda 1 — contratos e testes

- Fatia A: identidade de PI, duplicidade e testes associados.
- Fatia B: saúde de publicação/evidência, estados e testes associados.

Gate: testes vermelhos reproduzem os cinco defeitos preventivos; contratos e arquivos de propriedade estão definidos antes de implementação.

### Onda 2 — sincronização e prevenção

- Fatia A: sincronização de PI e bloqueio de duplicidade.
- Fatia B: Drive preflight, detecção preventiva e bloqueio do scheduler antes da publicação.

Gate: preflight permanece read-only; nenhuma captura ocorre para `blocked_upstream`; testes da onda 1 passam.

### Onda 3 — relatório, alertas e harness

- Fatia A: relatório e alertas por transição.
- Fatia B: idempotência/retry do backfill e harness finito.

Integração serial após as duas fatias. Gate: suite completa, typecheck, builds, revisão de diff e harness simulado.

### Onda 4 — operação real

Serial:

1. remover monitor conversacional de 72 horas;
2. deploy isolado e readback do SHA;
3. reconciliar PI 91159 / `#2693`;
4. publicar PI 3172 / `#2645`;
5. rodar backfill das datas faltantes;
6. rodar recuperação das demais pendências elegíveis;
7. regenerar relatório;
8. validar consumidor real e registrar resultados.

Sem paralelismo em deploy, AdRotate, jobs reais, auditoria final ou publicação do relatório.

## 14. Rollback e segurança

- Trabalhar em worktree limpa baseada no release ativo.
- Não publicar alterações alheias.
- Fazer backup pelos scripts existentes antes do deploy.
- Não apagar campanha, inserção, evidência ou mídia automaticamente.
- Em falha de deploy, restaurar release anterior sem reverter dados auditados.
- Em falha operacional, preservar job, resultado parcial, URLs existentes e relações observadas.
- Nunca expor tokens, headers, caminhos de credenciais ou conteúdo privado do Drive.

## 15. Critérios finais de aceite

1. `print-backfill` é idempotente por inserção e data.
2. Falha temporária recebe no máximo três tentativas dentro do mesmo job.
3. Nenhuma execução depende de monitoramento conversacional por horário.
4. `#2693` mantém todas as evidências auditadas e volta a ter publicação viva canônica no grupo `14`.
5. `#2714` e `#2779` ficam reconciliadas como duplicidades, sem nova publicação ou cópia de evidência.
6. `#2645` recebe o MP4 canônico, publicação viva no grupo `6` e backfill somente de 24/08 a 26/08.
7. PI normalizada impede nova duplicidade equivalente.
8. Saúde de publicação e saúde de evidências permanecem independentes.
9. `blocked_upstream` fica visível, explica motivo e bloqueia captura prematura.
10. Todas as pendências atuais elegíveis chegam a `audited` ou estado terminal com causa explícita.
11. Relatório público valida card, miniatura, modal e download sem ocultar falha de publicação.
12. OpenAPI, runbook e harness descrevem exatamente o comportamento publicado.

## 16. Portão HITL

Esta spec autoriza somente planejamento. Nenhum código, dado, job, automação, publicação AdRotate, deploy ou recuperação deve começar antes de aprovação humana explícita do plano de implementação derivado desta spec.
