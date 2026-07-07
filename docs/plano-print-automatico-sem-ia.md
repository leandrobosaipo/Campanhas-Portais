# Plano de Print Automático sem IA

## Objetivo

Gerar prints automaticamente para as inserções que exigem comprovação, sem usar IA e sem gastar token.

## 1. Princípio

O sistema não deve tentar “entender visualmente” qual banner está no ar.

Ele deve:

- usar seletor
- usar metadata
- usar URL da mídia
- usar identificador do criativo

## 2. Caso de referência

Inserção de exemplo:

- [inserção 860](/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/src/pages/InsertionDetail.tsx)

Dados observados:

- site: `PERRENGUE`
- formato: `MEGABANNER TOPO`
- mídia esperada:
  - `https://perrenguematogrosso.com/app/uploads/2026/03/825x120-pref-3.gif`

## 3. Problema central

No `MEGABANNER TOPO`, normalmente existe rotação.

Então não basta printar a página.

Precisamos saber se o banner visível é o banner certo.

## 4. Solução recomendada em camadas

### Camada 1 — Captura por seletor do slot

- localizar o container do slot
- capturar só o bloco do banner

### Camada 2 — Validação do criativo

Antes do screenshot:

- ler `img[src]`
- ler `source[srcset]`
- ler `a[href]`
- ler `background-image`
- ler atributos `data-*`

Depois:

- comparar com `mediaUrl` ou `creative_key`

### Camada 3 — Retry controlado

Se o banner do slot não for o esperado:

- esperar
- recarregar
- tentar novamente por poucas vezes

### Camada 4 — Fallback

Se não houver match:

- registrar tentativa sem prova válida
- opcionalmente gerar print interno de conferência

## 5. Estratégias de identificação do banner

### Melhor cenário

O portal expõe no DOM:

- URL do arquivo
- id do criativo
- id da inserção

### Cenário aceitável

O portal expõe:

- URL da imagem ou GIF

### Cenário ruim

O portal não expõe nada confiável

Nesse caso, a solução correta é criar:

- preview técnico
- parâmetro de debug
- página de prova

## 6. Padrão sugerido para cada inserção

Campos futuros:

- `mediaUrl`
- `creativeKey`
- `captureUrl`
- `captureSelector`
- `captureStrategy`

Exemplo:

- `captureUrl`: home do portal ou página da notícia
- `captureSelector`: seletor do `mega banner topo`
- `captureStrategy`: `dom_match_media_url`

## 7. Processo automático diário

1. buscar inserções do dia
2. abrir URL de captura
3. esperar página estabilizar
4. localizar slot
5. validar criativo
6. capturar
7. salvar arquivo no Spaces
8. registrar evidência

## 8. Regras de validação do print

Marcar `print válido` quando:

- dia pertence ao período da inserção
- slot correto foi encontrado
- criativo corresponde à inserção
- upload do print foi concluído

Não marcar automaticamente quando:

- o slot correto não foi encontrado
- o criativo não bate
- houve falha de upload

## 9. Recomendação para implantação

### Primeiro passo

Implementar captura semi-automática:

- botão `Gerar print`
- Playwright captura
- sistema já salva no Spaces e vincula na inserção

### Segundo passo

Agendamento automático diário só para:

- sites com seletor confiável
- formatos com criativo identificável

### Terceiro passo

Adicionar preview técnico nos portais para 100% de precisão

## 10. Benefício

Essa abordagem:

- não usa IA
- não gasta token
- é auditável
- funciona bem com Playwright + metadata

## 11. Protótipo já implementado no projeto

Script criado:

- [capture-insertion-proof.cjs](/Users/leandrobosaipo/Projetos/AdOps/scripts/src/capture-insertion-proof.cjs)

Comando base:

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
pnpm --filter @workspace/scripts run capture:proof -- \
  --insertionId 860 \
  --spacesEnv /Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/.env.digitalocean-spaces \
  --spacesBucket cod5 \
  --spacesBasePath adops-prints
```

O que esse protótipo faz hoje:

- lê a inserção pela API
- identifica o mapping do slot
- abre o site real com Playwright
- procura o criativo pelo `mediaUrl`
- força o `src` real da imagem quando houver lazy-load
- tira screenshot do slot e do contexto
- sobe o PNG para o Spaces
- cria ou atualiza evidência da data atual

Caso validado:

- inserção `860`
- site `PERRENGUE`
- formato `MEGABANNER TOPO`
- bucket `cod5`
