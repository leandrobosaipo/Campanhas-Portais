# Manual operacional v1 — Configuração de Captura/Auditoria

## Objetivo
Este manual explica como usar o novo recurso de configuração de captura e auditoria sem mexer direto no JSON de produção.

O fluxo correto é:

`draft -> validar -> publicar -> capturar -> auditar -> rollback se precisar`

## Antes de usar
Confirme estes pontos:

- API privada publicada com as rotas `/api/capture-rules`.
- Worker público atualizado para proxyar essas rotas.
- Banco com as tabelas `capture_rules`, `capture_rule_versions`, `capture_rule_validations`, `capture_rule_publish_events` e `capture_rule_runtime_cache`.
- Token operacional ativo no navegador.
- Harness verde no ambiente:

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
set -a && source ./.env.adops-operator.local && set +a
node ./scripts/src/harness-capture-config-v1.mjs
```

Se `/api/capture-rules/perf/health` retornar `404`, pare aqui. Isso significa que o deploy da API ainda não recebeu o recurso.

## Perfis de acesso
- `viewer`: consulta regras, histórico, validações e métricas.
- `operator`: cria/edita draft e executa validação.
- `admin`: publica e faz rollback.

Publicação e rollback devem ficar restritos. São ações que alteram o comportamento real da captura.

## Conceitos básicos
- `siteSigla`: site do portal, como `OMT`, `PERRENGUE`, `PPMT`, `PNMT`, `AFL`, `ROO`.
- `groupId`: grupo/posição do AdRotate usado pelo banner.
- `aliases`: nomes operacionais aceitos para localizar o formato.
- `page`: `home` ou `article`.
- `slotSelector`: seletor CSS do anúncio.
- `contextSelector`: seletor CSS da área visual usada para contexto/auditoria.
- `scrollMode`: como a captura enquadra a página.
- `proofStyle`: estilo final da evidência.
- `auditConfig`: thresholds e regras específicas de auditoria.

## Fluxo normal: criar regra nova
1. Abra o painel de configuração:
   - `/captura-config`
2. Filtre pelo site.
3. Crie uma regra em modo `draft`.
4. Preencha:
   - `siteSigla`
   - `groupId`
   - `aliases`
   - `page`
   - `slotSelector`
   - `contextSelector`
   - `scrollMode`
   - `proofStyle`
   - `auditConfig`
5. Salve o draft.
6. Clique em validar.
7. Se a validação passar, publique com perfil `admin`.
8. Gere um print de teste.
9. Confira a auditoria e o log da captura.

## Fluxo: alterar layout de um site
Use este fluxo quando o tema mudou, o banner mudou de posição ou o seletor parou de funcionar.

1. Localize a regra publicada do `siteSigla + groupId`.
2. Crie ou edite um draft equivalente.
3. Atualize apenas o que mudou:
   - seletor do slot,
   - seletor de contexto,
   - modo de scroll,
   - threshold de auditoria específico.
4. Execute validação individual.
5. Se houver várias posições do mesmo site, use validação em lote:

```http
POST /api/capture-rules/validate-batch
```

6. Publique primeiro em um site/posição canário.
7. Rode captura real em uma inserção de teste.
8. Só expanda depois de auditoria passar.

## Fluxo: validação falhou
Leia o resumo da validação antes de mexer no seletor.

Principais causas:

- `contextSelector ausente`: informe a área visual de contexto.
- `slotSelector ausente`: informe o seletor do anúncio.
- `articleFallbackUrl` inválido: página interna precisa de URL exemplo do mesmo domínio.
- `scrollMode inválido`: use `top` ou `slot`.
- `proofStyle inválido`: use `viewport_only` ou `viewport_with_slot_inset`.

Depois de corrigir:

1. Salve o draft.
2. Rode validação novamente.
3. Publique somente se o status for `passed`.

## Fluxo: print começou a falhar após publicar
1. Abra o detalhe da regra.
2. Verifique a versão publicada.
3. Consulte validações recentes.
4. Consulte `/api/capture-rules/perf/health` para descartar erro de cache/API.
5. Faça rollback para uma versão anterior:

```http
POST /api/capture-rules/:ruleId/rollback
```

6. Gere novo print de teste.
7. Registre a causa no `decision-log.md`.

## Fluxo: usar fallback JSON
O fallback JSON é contingência. Ele não deve ser o caminho normal.

Use fallback quando:

- API de configuração estiver indisponível.
- Banco estiver fora.
- A leitura runtime por DB causar regressão durante canário.

Depois que a API voltar:

1. Rode harness.
2. Reative dual-read.
3. Monitore cache hit e p95.

## Fluxo: conferir performance
Use:

```http
GET /api/capture-rules/perf/health
```

Campos importantes:

- `cacheHitRate`: precisa subir depois das primeiras leituras.
- `avgQueriesPerRuntimeCall`: deve ficar baixo; alvo do harness é `<= 1.5`.
- `routeP95Ms`: precisa ficar dentro do budget do harness.
- `validationsInFlight`: mostra validações em execução.
- `maxConcurrentValidations`: limite do circuit breaker.

Se `routeP95Ms` subir:

1. Confira se o L1/L2 está batendo cache.
2. Evite listagens sem filtro.
3. Use paginação.
4. Use validação em lote, não muitas validações individuais.
5. Não rode análise pesada de GIF em massa durante horário crítico.

## Fluxo: publicar com segurança
Checklist antes de publicar:

- Validação `passed`.
- Site e `groupId` conferidos.
- Selector testado na página real.
- Regra aplicada primeiro em canário quando houver mudança de layout.
- Rollback conhecido.
- Harness executado depois da publicação.

## Comandos úteis
Health/performance:

```bash
curl -s "https://adops-api-public.leandro471.workers.dev/api/capture-rules/perf/health"
```

Listar regras:

```bash
curl -s "https://adops-api-public.leandro471.workers.dev/api/capture-rules?siteSigla=OMT&limit=25"
```

Resolver runtime:

```bash
curl -s "https://adops-api-public.leandro471.workers.dev/api/capture-rules/runtime?siteSigla=OMT&groupId=2"
```

Rodar harness:

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
set -a && source ./.env.adops-operator.local && set +a
node ./scripts/src/harness-capture-config-v1.mjs
```

## Critério para considerar pronto
- Harness passa.
- `runtime` retorna `source=db_published` para regra publicada.
- Print real usa a regra publicada.
- Auditoria passa.
- Rollback foi testado.
- Métricas continuam dentro do budget.
