# Infografico v1 — Opcoes da Configuracao de Captura/Auditoria

## Visao rapida

```mermaid
flowchart LR
  A["Configurar"] --> B["Validar"]
  B --> C["Publicar"]
  C --> D["Capturar"]
  D --> E["Auditar"]
  E --> F["Aprovar"]
  E --> G["Corrigir"]
  G --> B
  C --> H["Rollback"]
```

## Opcoes principais

| Opcao | Quando usar | Resultado esperado |
|---|---|---|
| Criar draft | Novo site, novo slot ou nova posicao | Regra editavel sem afetar capturas reais |
| Editar draft | Ajuste de selector, pagina, scroll ou auditoria | Mudanca isolada ate passar validacao |
| Validar individual | Uma regra especifica | Resultado `passed` ou `failed` |
| Validar em lote | Varias regras de um site | Menos requests e melhor controle de carga |
| Publicar | Regra validada e pronta | Runtime passa a consumir a nova versao |
| Rollback | Captura ou auditoria regrediu | Volta para versao anterior publicada |
| Consultar performance | Antes/depois de publicar | Ver cache, p95 e query count |
| Fallback JSON | Falha de API/DB ou canario ruim | Mantem operacao funcionando |

## Configuracoes de captura

| Campo | Opcoes | Uso pratico |
|---|---|---|
| `page` | `home`, `article` | Define se o print e da inicial ou pagina interna |
| `scrollMode` | `top`, `slot` | `top` para banner no topo; `slot` quando precisa rolar |
| `proofStyle` | `viewport_only`, `viewport_with_slot_inset` | Prova em posicao real ou com destaque do slot |
| `slotSelector` | seletor CSS | Elemento exato do anuncio |
| `contextSelector` | seletor CSS | Area visual usada para validar contexto |
| `articleFallbackUrl` | URL HTTPS | Pagina interna exemplo para validar/capturar |
| `auditConfig` | JSON controlado | Thresholds por site/slot |

## Escolha por tipo de pagina

```mermaid
flowchart TD
  A["Qual pagina sera capturada?"] --> B{"Pagina inicial?"}
  B -->|Sim| C{"Banner aparece no topo sem rolar?"}
  B -->|Nao| D["Usar page=article"]

  C -->|Sim| E["scrollMode=top"]
  C -->|Nao| F["scrollMode=slot"]

  D --> G["Definir articleFallbackUrl"]
  G --> H["Validar selector em pagina interna"]

  E --> I["Validar slotSelector/contextSelector"]
  F --> I
  H --> I
  I --> J["Publicar somente se passed"]
```

## Escolha por problema encontrado

| Problema | Verificar primeiro | Acao |
|---|---|---|
| Print sem banner | `slotSelector` e `contextSelector` | Ajustar draft e validar |
| Banner fora da posicao | `scrollMode` e prova final | Preferir posicao real quando for requisito |
| Auditoria com divergencia | `auditConfig` por site/slot | Ajustar threshold local, sem relaxar global |
| Pagina interna errada | `page` e `articleFallbackUrl` | Corrigir URL e validar |
| Validacao lenta | `validate-batch`, circuit breaker | Reduzir concorrencia e usar lote |
| Runtime lento | `cacheHitRate`, `avgQueriesPerRuntimeCall` | Conferir cache L1/L2 e filtros |
| Erro apos publish | historico de versoes | Executar rollback |
| API retornou 404 | deploy das rotas | Publicar API/Worker antes de usar |

## Painel ideal para operacao

```mermaid
flowchart TB
  A["Topo do painel"] --> A1["Filtro por site"]
  A --> A2["Status de API/performance"]
  A --> A3["Acoes por papel"]

  B["Lista de regras"] --> B1["Paginada"]
  B --> B2["Sem historico embutido"]
  B --> B3["Status draft/publicado"]

  C["Detalhe da regra"] --> C1["Campos principais"]
  C --> C2["Validacoes recentes"]
  C --> C3["Versoes"]
  C --> C4["Publicar/Rollback"]

  D["Rodape operacional"] --> D1["Ultimo harness"]
  D --> D2["p95"]
  D --> D3["cacheHitRate"]
```

## Checklist visual antes de publicar

| Item | Status esperado |
|---|---|
| Site correto | `siteSigla` confere com o portal |
| Posicao correta | `groupId` confere com AdRotate |
| Pagina correta | `home` ou `article` conforme campanha |
| Selector correto | slot existe no HTML real |
| Contexto correto | area visual mostra o banner no layout certo |
| Validacao | `passed` |
| Performance | p95 e query budget aceitaveis |
| Rollback | versao anterior disponivel |

## Mapa de maturidade

```mermaid
flowchart LR
  A["JSON manual"] --> B["Draft no painel"]
  B --> C["Validacao"]
  C --> D["Publish versionado"]
  D --> E["Runtime com cache"]
  E --> F["Canario por site"]
  F --> G["DB como fonte primaria"]
```

## Regra pratica
Use o painel para mudar comportamento. Use o JSON apenas como contingencia ou export.

Uma regra so deve virar producao quando:

- passou pela validacao,
- foi testada em captura real,
- manteve performance dentro do budget,
- tem rollback conhecido.
