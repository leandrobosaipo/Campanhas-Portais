# Fluxos Visuais do Bot Telegram AdOps

Baseado no código atual do worker do Telegram:

- `ops/cloudflare-telegram-bot/src/index.ts`

Objetivo:

- mostrar o que cada comando faz
- mostrar as condições
- mostrar quando o bot só consulta e quando ele altera estado

## Visão geral

```mermaid
flowchart TD
    A["Usuário envia mensagem ou clica botão"] --> B{"Tipo de entrada"}
    B -->|"Mensagem com texto"| C["Parser do bot"]
    B -->|"Botão inline"| D["Callback query"]

    C --> E{"Comando reconhecido?"}
    E -->|"Não começa com /"| F["Trata como /pi <texto>"]
    E -->|"Sim"| G["Extrai comando + argumentos"]

    F --> H["Resolve inserção por PI ou ID"]
    G --> H

    H --> I{"Inserção encontrada?"}
    I -->|"Não"| J["Responde: não encontrei"]
    I -->|"Sim"| K{"Tipo de ação"}

    K -->|"Consulta"| L["Busca dados na API pública"]
    K -->|"Atualização"| M["Valida permissão do usuário"]

    M --> N{"Usuário autorizado?"}
    N -->|"Não"| O["Responde: sem permissão"]
    N -->|"Sim"| P["PATCH/POST na API AdOps"]

    L --> Q["Envia resposta no Telegram"]
    P --> Q
    D --> R{"Ação do botão"}
    R -->|"print"| S["Solicita print"]
    R -->|"concluir"| T["Conclui inserção"]
    S --> Q
    T --> Q
```

## Regras base

- Mensagem sem `/` vira consulta automática:
  - `14011`
  - `pi14011`
  - `PI 14011`
- O bot tenta resolver por:
  - ID da inserção
  - PI
  - nome da campanha
- Comandos de update exigem que o usuário seja o `TELEGRAM_ALLOWED_USER_ID`.
- O bot usa:
  - API pública para leitura
  - rota protegida para atualização de status

## Fluxo `/start` e `/help`

Função:

- mostrar como usar
- listar os comandos
- opcionalmente exibir botão do Mini App

```mermaid
flowchart TD
    A["/start ou /help"] --> B["Monta texto de ajuda"]
    B --> C{"TELEGRAM_MINI_APP_URL existe?"}
    C -->|"Sim"| D["Inclui botão Abrir Mini App"]
    C -->|"Não"| E["Sem botão extra"]
    D --> F["Envia mensagem de ajuda"]
    E --> F
```

## Fluxo de consulta `/pi`

Função:

- localizar inserção
- mostrar resumo operacional
- mostrar botões de ação

```mermaid
flowchart TD
    A["/pi <pi-ou-insercao>"] --> B{"Argumento foi informado?"}
    B -->|"Não"| C["Responde: Informe o número da inserção ou a PI"]
    B -->|"Sim"| D["resolveInsertion()"]
    D --> E{"Encontrou?"}
    E -->|"Não"| F["Responde: Não encontrei inserção"]
    E -->|"Sim"| G["fetchInsertionBundle()"]
    G --> H["Busca detalhe + docs + analytics + requirements"]
    H --> I["Calcula 'Pronta para envio'"]
    I --> J["Envia resumo + botões"]
```

### Condições do resumo

O resumo exibe:

- PI
- inserção
- campanha
- site
- formato
- período
- status
- print
- docs
- analytics
- evidências auditadas
- pronta para envio

### Como o bot define `Pronta para envio`

```mermaid
flowchart TD
    A["Bundle da inserção"] --> B{"Existe ao menos 1 documento?"}
    B -->|"Não"| X["Pronta para envio = NÃO"]
    B -->|"Sim"| C{"Existe auditSummary?"}
    C -->|"Não"| X
    C -->|"Sim"| D{"printGerado = true?"}
    D -->|"Não"| X
    D -->|"Sim"| E{"invalidAuditCount = 0?"}
    E -->|"Não"| X
    E -->|"Sim"| F{"invalidUrlCount = 0?"}
    F -->|"Não"| X
    F -->|"Sim"| G{"missingCount = 0?"}
    G -->|"Não"| X
    G -->|"Sim"| H{"totalEvidenceDates > 0?"}
    H -->|"Não"| X
    H -->|"Sim"| I{"Analytics é obrigatório?"}
    I -->|"Não"| Y["Pronta para envio = SIM"]
    I -->|"Sim"| J{"Existe relatório completed?"}
    J -->|"Não"| X
    J -->|"Sim"| Y
```

## Fluxo de consulta sem comando

Função:

- reduzir fricção
- permitir usar só o número da PI ou da inserção

```mermaid
flowchart TD
    A["Mensagem: 14011 ou pi14011"] --> B["Parser detecta ausência de /"]
    B --> C["Converte internamente para /pi <texto>"]
    C --> D["Segue o fluxo normal de /pi"]
```

## Fluxo `/zip`

Função:

- gerar link do ZIP consolidado da inserção

```mermaid
flowchart TD
    A["/zip <pi-ou-insercao>"] --> B{"Argumento existe?"}
    B -->|"Não"| C["Pede PI ou inserção"]
    B -->|"Sim"| D["resolveInsertion()"]
    D --> E{"Encontrou?"}
    E -->|"Não"| F["Não encontrei inserção"]
    E -->|"Sim"| G["Monta URL /api/insertions/{id}/evidences/export.zip"]
    G --> H["Envia link + botão Abrir ZIP"]
```

## Fluxo `/print`

Função:

- solicitar o print de hoje para a inserção

```mermaid
flowchart TD
    A["/print <pi-ou-insercao>"] --> B{"Argumento existe?"}
    B -->|"Não"| C["Pede PI ou inserção"]
    B -->|"Sim"| D["resolveInsertion()"]
    D --> E{"Encontrou?"}
    E -->|"Não"| F["Não encontrei inserção"]
    E -->|"Sim"| G["POST /api/insertions/{id}/capture-proof"]
    G --> H["API responde jobId + status queued"]
    H --> I["Bot responde confirmação no chat"]
```

### Condições

- não exige permissão especial
- não conclui nada
- só enfileira a captura

## Fluxo `/retro`

Função:

- solicitar print retroativo para uma data específica

```mermaid
flowchart TD
    A["/retro <pi-ou-insercao> <aaaa-mm-dd>"] --> B{"PI/inserção foi informada?"}
    B -->|"Não"| C["Pede PI ou inserção"]
    B -->|"Sim"| D{"Data válida?"}
    D -->|"Não"| E["Responde: Informe a data no formato aaaa-mm-dd"]
    D -->|"Sim"| F["resolveInsertion()"]
    F --> G{"Encontrou?"}
    G -->|"Não"| H["Não encontrei inserção"]
    G -->|"Sim"| I["POST capture-proof com date + captureAt"]
    I --> J["Responde confirmação do retroativo"]
```

### Condições

- data obrigatória
- formato obrigatório: `aaaa-mm-dd`

## Fluxo `/concluir`

Função:

- concluir operacionalmente a inserção

```mermaid
flowchart TD
    A["/concluir <pi-ou-insercao>"] --> B{"Argumento existe?"}
    B -->|"Não"| C["Pede PI ou inserção"]
    B -->|"Sim"| D["resolveInsertion()"]
    D --> E{"Encontrou?"}
    E -->|"Não"| F["Não encontrei inserção"]
    E -->|"Sim"| G{"Usuário é permitido?"}
    G -->|"Não"| H["Sem permissão"]
    G -->|"Sim"| I["PATCH /api/insertions/{id}"]
    I --> J["statusNormalizado = concluido"]
    J --> K["Busca bundle atualizado"]
    K --> L["Envia confirmação + resumo novo"]
```

### Condições

- exige permissão
- altera estado

## Fluxo `/enviado`

Função:

- marcar que o processo foi enviado para a agência

```mermaid
flowchart TD
    A["/enviado <pi-ou-insercao>"] --> B["resolveInsertion()"]
    B --> C{"Encontrou?"}
    C -->|"Não"| D["Não encontrei inserção"]
    C -->|"Sim"| E{"Usuário é permitido?"}
    E -->|"Não"| F["Sem permissão"]
    E -->|"Sim"| G["PATCH /api/insertions/{id}"]
    G --> H["statusNormalizado = enviado_para_agencia"]
    H --> I["processoEnviadoAgencia = true"]
    I --> J["dataEnvioAgencia = data atual"]
    J --> K["Envia confirmação + resumo novo"]
```

## Fluxo `/docs`

Função:

- marcar que os documentos foram enviados

```mermaid
flowchart TD
    A["/docs <pi-ou-insercao>"] --> B["resolveInsertion()"]
    B --> C{"Encontrou?"}
    C -->|"Não"| D["Não encontrei inserção"]
    C -->|"Sim"| E{"Usuário é permitido?"}
    E -->|"Não"| F["Sem permissão"]
    E -->|"Sim"| G["PATCH /api/insertions/{id}"]
    G --> H["statusNormalizado = docs_enviados"]
    H --> I["processoEnviadoAgencia = true"]
    I --> J["docsEnviados = true"]
    J --> K["dataEnvioAgencia = data atual"]
    K --> L["Envia confirmação + resumo novo"]
```

## Fluxo dos botões inline

Botões atuais:

- `Abrir inserção`
- `Abrir ZIP`
- `Print hoje`
- `Concluir`

```mermaid
flowchart TD
    A["Usuário toca no botão"] --> B{"Tipo de botão"}
    B -->|"Abrir inserção"| C["Abre URL pública da inserção"]
    B -->|"Abrir ZIP"| D["Abre URL do ZIP"]
    B -->|"Print hoje"| E["callback_data = print:{id}"]
    B -->|"Concluir"| F["callback_data = concluir:{id}"]

    E --> G["POST capture-proof"]
    G --> H["answerCallbackQuery"]
    H --> I["Envia mensagem de confirmação no chat"]

    F --> J{"Usuário permitido?"}
    J -->|"Não"| K["Toast: sem permissão"]
    J -->|"Sim"| L["PATCH status = concluido"]
    L --> M["answerCallbackQuery"]
    M --> N["Envia resumo atualizado no chat"]
```

## Estados e efeitos no bot

```mermaid
flowchart LR
    A["rascunho"] --> B["aguardando_publicacao"]
    B --> C["publicado_no_site"]
    C --> D["print_gerado"]
    D --> E["enviado_para_agencia"]
    E --> F["docs_enviados"]
    F --> G["concluido"]
```

Observação:

- o bot hoje não aplica todas as transições intermediárias
- ele atua diretamente nestes estados:
  - `enviado_para_agencia`
  - `docs_enviados`
  - `concluido`

## Motivo do erro visto no print

Erro mostrado:

- `Telegram API answerCallbackQuery falhou: 400`
- `query is too old and response timeout expired or query ID is invalid`

Isso acontece quando:

- o callback do botão já expirou
- ou o Telegram já considera aquele `query_id` velho

Na prática:

- não é erro de parser
- não é erro da API AdOps
- é erro de resposta tardia ao callback do Telegram

Fluxo:

```mermaid
flowchart TD
    A["Usuário toca botão"] --> B["Telegram gera callback_query_id"]
    B --> C["Worker processa ação"]
    C --> D{"Resposta ao callback chegou a tempo?"}
    D -->|"Sim"| E["Toast normal"]
    D -->|"Não"| F["Telegram retorna query is too old"]
    F --> G["A ação principal pode já ter acontecido mesmo assim"]
```

## Resumo operacional

### Comandos só de consulta

- `/start`
- `/help`
- `/pi`
- `/zip`

### Comandos que geram trabalho

- `/print`
- `/retro`

### Comandos que alteram estado

- `/enviado`
- `/docs`
- `/concluir`

### Entradas simplificadas

- `14011`
- `pi14011`
- `PI 14011`

## Melhorias futuras recomendadas

- editar a própria mensagem após `Concluir`, em vez de mandar nova mensagem
- adicionar botão `Enviado`
- adicionar botão `Docs enviados`
- adicionar botão `Gerar retroativo`
- trocar retorno cru do JSON do job por mensagem mais legível
- registrar status do job depois:
  - `queued`
  - `running`
  - `completed`
  - `failed`
