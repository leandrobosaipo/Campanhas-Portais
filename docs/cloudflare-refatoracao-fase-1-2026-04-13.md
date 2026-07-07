# Cloudflare: Refatoração Fase 1 em 2026-04-13

## Objetivo da fase

Iniciar a migração para Cloudflare sem fingir que o backend atual já é compatível com Pages/Workers.
A meta desta fase foi separar:

- lógica pura de auditoria e datas
- runtime local de captura
- contrato futuro do runner de prints

## O que foi implementado

### 1. Extração da lógica pura de captura/auditoria

Foi criado o módulo:

- `artifacts/api-server/src/lib/capture-audit.ts`

Ele concentra helpers que antes estavam misturados dentro de `routes/insertions.ts`, incluindo:

- parse e iteração de datas
- montagem de `captureAt` retroativo
- comparação semântica de data/hora de página
- avaliação do metadata da captura
- resolução do `captureAt` para regeneração
- nomes seguros para arquivos

### 2. Extração explícita do runtime local

Foi criado o módulo:

- `artifacts/api-server/src/lib/local-capture-runtime.ts`

Esse arquivo deixa explícito o que ainda prende a API ao ambiente local:

- caminho do projeto
- `.env` do Spaces
- bucket/base path
- pasta local de metadata gerada
- execução do script Node de print

### 3. Contrato do runner de prints

Foi criado o módulo:

- `artifacts/api-server/src/lib/print-runner-contract.ts`

Esse contrato define a forma futura de comunicação entre API e executor de jobs, com:

- tipos de job
- payload padronizado
- resultado por item
- interface `PrintRunnerPort`

A intenção é permitir trocar o runtime local atual por:

- Queue + Worker/Workflow
- Worker chamando Browser Rendering
- ou runner dedicado fora da API HTTP

sem reescrever a semântica dos jobs.

### 4. Rota de inserções desacoplada do runtime local inline

`routes/insertions.ts` deixou de manter internamente:

- helpers de data/auditoria duplicados
- paths locais hardcoded de captura
- execução inline do script como parte da própria rota

Agora a rota consome:

- `capture-audit.ts`
- `local-capture-runtime.ts`

## Resultado técnico da fase

### O que melhorou

- a dependência local ficou explícita e isolada
- a lógica pura já pode ser reaproveitada em Worker/runner futuro
- a rota principal ficou menos monolítica
- o próximo passo da migração ficou mais seguro

### O que ainda continua local

- execução do script `capture-insertion-proof.cjs`
- leitura dos metadados em `tmp/generated-prints`
- acesso direto ao `.env.digitalocean-spaces`
- dependência de Node/child_process

## Validação

- build do `@workspace/api-server`: `ok`
- ambiente local restaurado:
  - frontend `http://localhost:4175/`
  - API `http://127.0.0.1:4011/api/healthz`

## Próximo passo da Fase 2

1. introduzir uma porta de runner na API em vez de chamar diretamente o runtime local
2. criar uma implementação local dessa porta para manter compatibilidade
3. preparar uma implementação remota para Cloudflare Queue/Worker
4. só depois mover o frontend de vez para Pages com API pública real

## Ganho de conhecimento

A migração para Cloudflare não deve começar pelo Pages como se ele resolvesse o sistema inteiro.
A ordem segura deste projeto é:

1. extrair lógica pura
2. encapsular dependências locais
3. padronizar contratos de job
4. publicar API
5. publicar frontend
6. mover runner

## Atualização da fase — runner local por contrato

### O que entrou nesta etapa
- criação de `artifacts/api-server/src/lib/local-print-runner.ts`
- ampliação de `PrintRunnerPort` com `runNow(...)`
- as rotas principais de captura passaram a depender de `printRunner` em vez de chamar diretamente o script local

### Rotas já adaptadas
- captura individual
- correção de evidências inválidas
- captura em lote do dia
- retroativos vencidos síncronos
- retroativos vencidos em job assíncrono

### O que isso muda
- a API agora fala com uma porta de execução de print
- a implementação local continua existindo por compatibilidade
- a próxima fase pode trocar essa implementação por runner remoto sem reescrever todas as rotas

## Atualização da fase — persistência dos jobs e runner remoto preparado

### Entregas novas
- criação da tabela `print_jobs` no PostgreSQL local do projeto
- `LocalPrintRunner` refatorado para persistir:
  - status
  - itens
  - metadados do job
- criação do arquivo:
  - `artifacts/api-server/src/lib/remote-print-runner.ts`
- criação do seletor:
  - `artifacts/api-server/src/lib/print-runner.ts`

### Ganho arquitetural
Agora a API já não depende mais de:
- `Map` em memória para status do job
- acoplamento direto ao executor local em todas as rotas

### Validação desta etapa
- tabela `print_jobs` criada via `drizzle-kit push`
- build da API passou
- job de retroativo criado e lido com sucesso a partir da tabela persistida

### Limite atual
O runner remoto ainda é apenas um adaptador HTTP pronto para uso.
Ainda falta publicar o serviço remoto que vai responder esse contrato.
