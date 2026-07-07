# Organograma e fluxos v1 — Configuração de Captura/Auditoria

## Organograma do recurso

```mermaid
flowchart TB
  A["Painel /captura-config"] --> B["Regras de captura"]
  A --> C["Validacoes"]
  A --> D["Historico de versoes"]
  A --> E["Metricas de performance"]

  B --> B1["Draft"]
  B --> B2["Publicado"]

  C --> C1["Validacao individual"]
  C --> C2["Validacao em lote"]

  D --> D1["Publish"]
  D --> D2["Rollback"]

  E --> E1["Cache L1"]
  E --> E2["Cache L2"]
  E --> E3["p95 e query count"]

  B2 --> F["Runtime de captura"]
  F --> G["Print"]
  G --> H["Auditoria"]
  H --> I["Evidencia aprovada"]
  H --> J["Falha operacional"]
```

## Fluxo principal

```mermaid
sequenceDiagram
  participant Operador
  participant Painel
  participant API
  participant Banco
  participant Runtime
  participant Auditoria

  Operador->>Painel: cria ou edita draft
  Painel->>API: POST/PATCH /api/capture-rules
  API->>Banco: grava capture_rules e capture_rule_versions
  Operador->>Painel: valida regra
  Painel->>API: POST /api/capture-rules/:id/validate
  API->>Banco: grava capture_rule_validations
  Operador->>Painel: publica regra
  Painel->>API: POST /api/capture-rules/:id/publish
  API->>Banco: marca versao publicada
  API->>Banco: limpa cache L2
  Runtime->>API: GET /api/capture-rules/runtime
  API->>Banco: resolve regra publicada
  Runtime->>Auditoria: captura e audita evidencia
```

## Arvore de decisao operacional

```mermaid
flowchart TD
  A["Preciso mexer em captura/auditoria"] --> B{"Existe regra publicada?"}
  B -->|Nao| C["Criar draft novo"]
  B -->|Sim| D["Editar draft da regra existente"]

  C --> E["Validar"]
  D --> E

  E --> F{"Validacao passou?"}
  F -->|Sim| G{"Mudanca afeta layout real?"}
  F -->|Nao| H["Corrigir selector, contexto, URL ou auditConfig"]
  H --> E

  G -->|Sim| I["Publicar em canario"]
  G -->|Nao| J["Publicar direto com admin"]

  I --> K["Gerar print teste"]
  J --> K

  K --> L{"Auditoria passou?"}
  L -->|Sim| M["Expandir ou manter publicado"]
  L -->|Nao| N["Rollback e abrir diagnostico"]

  N --> O["Consultar log da captura"]
  O --> P["Ajustar draft"]
  P --> E
```

## Situacoes previstas

| Situacao | Ação correta | Risco se ignorar |
|---|---|---|
| Novo slot no AdRotate | Criar draft por `siteSigla + groupId` | Captura cair no fallback errado |
| Tema mudou layout | Editar draft e validar em canário | Quebrar prints retroativos de outras inserções |
| Banner moveu para área com scroll | Ajustar `scrollMode` e `contextSelector` | Print sem banner visível |
| Página interna precisa de prova | Usar `page=article` e `articleFallbackUrl` | Validação falhar ou usar home por engano |
| Muitos slots de um site | Usar `validate-batch` | Muitas requests e mais latência |
| Publicação causou erro | Rollback por `versionId` | Continuar gerando evidências inválidas |
| API de configuração caiu | Usar fallback JSON temporário | Operação parar por dependência nova |
| p95 subiu | Conferir cache, paginação e batch | Banco receber carga desnecessária |

## Fluxo de cache e performance

```mermaid
flowchart LR
  A["Runtime pede regra"] --> B{"L1 memoria tem cache valido?"}
  B -->|Sim| C["Retorna regra: 0 query"]
  B -->|Nao| D{"L2 cache table tem cache valido?"}
  D -->|Sim| E["Retorna regra: 1 query"]
  D -->|Nao| F["Busca capture_rules publicada"]
  F --> G["Materializa payload"]
  G --> H["Atualiza L1 e L2"]
  H --> I["Retorna regra"]

  J["Publish/Rollback"] --> K["Limpa L1"]
  J --> L["Limpa L2"]
```

## Fluxo de rollback

```mermaid
flowchart TD
  A["Falha depois do publish"] --> B["Abrir regra"]
  B --> C["Ver historico de versoes"]
  C --> D["Escolher versionId anterior"]
  D --> E["POST rollback"]
  E --> F["Cache invalidado"]
  F --> G["Gerar print teste"]
  G --> H{"Passou auditoria?"}
  H -->|Sim| I["Operacao estabilizada"]
  H -->|Nao| J["Manter fallback JSON e diagnosticar"]
```

## Responsabilidades por papel

```mermaid
flowchart TB
  Viewer["viewer"] --> V1["Listar regras"]
  Viewer --> V2["Consultar historico"]
  Viewer --> V3["Ver performance"]

  Operator["operator"] --> O1["Criar draft"]
  Operator --> O2["Editar draft"]
  Operator --> O3["Validar"]
  Operator --> O4["Validar em lote"]

  Admin["admin"] --> A1["Publicar"]
  Admin --> A2["Rollback"]
  Admin --> A3["Liberar canario"]
```
