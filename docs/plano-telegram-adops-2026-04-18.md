# Plano Telegram + AdOps

## Objetivo

Reduzir o fechamento manual do fluxo operacional do AdOps.

Quando uma inserção estiver realmente pronta:

- evidências válidas
- relatórios de Analytics disponíveis quando existirem
- documentos operacionais gerados
- ZIP exportável

o sistema deve enviar o pacote para o usuário responsável no Telegram, para ele só validar e encaminhar à agência.

## Princípios

- não criar uma plataforma paralela ao AdOps
- reaproveitar a API pública, a fila operacional e o ZIP já existente
- usar o bot para ações rápidas
- usar Mini App só para telas mais complexas
- não marcar conclusão automaticamente sem confirmação humana

## Arquitetura recomendada

### Peça 1. Worker do bot

Criar um worker novo em `ops/cloudflare-telegram-bot`.

Motivo:

- isola segredo do bot
- não mistura webhook do Telegram com a API pública do Pages
- reutiliza a mesma filosofia do projeto: Worker na borda + fila + serviço especializado

Responsabilidades:

- receber webhook do Telegram
- validar `secret token`
- responder comandos
- enviar mensagens, ZIPs e resumos
- chamar API pública e privada do AdOps
- disparar jobs quando necessário

### Peça 2. Integração com o fluxo atual

Reaproveitar do projeto já existente:

- `GET /api/insertions/:id`
- `GET /api/insertions/:id/capture-proof/status`
- `GET /api/analytics/insertions/:id/reports`
- `GET /api/insertions/:id/operational-documents`
- `GET /api/insertions/:id/evidences/export.zip`
- update de inserção para:
  - `processoEnviadoAgencia`
  - `docsEnviados`
  - `statusNormalizado`

### Peça 3. Mini App

Mini App só para os fluxos mais densos:

- atualizar PI
- criar PI
- revisar mídia, período e posição
- anexar arquivos e armazenar em Spaces antes do processamento

Sugestão:

- reutilizar o frontend atual do AdOps em rota dedicada, por exemplo `/telegram`
- validar `initData` do Telegram no backend
- não duplicar layout completo do painel

## Fluxo otimizado proposto

### Fase 1. Inserção pronta para envio

Critério de prontidão:

- todas as evidências obrigatórias auditadas
- documentos operacionais gerados
- Analytics disponível quando houver ou quando tiver sido solicitado
- ZIP exportável

Quando esse critério for atingido:

1. bot envia mensagem privada para o usuário responsável
2. bot envia resumo da inserção
3. bot anexa o ZIP completo
4. bot mostra botões:
   - `Abrir inserção`
   - `Abrir ZIP`
   - `Confirmar envio à agência`
   - `Marcar docs enviados`
   - `Concluir inserção`

### Fase 2. Resumo diário

Todo dia, o bot envia:

- total de prints gerados no dia
- total por site
- total por campanha
- quantos auditados
- quantos com falha
- links rápidos para inserções com problema

### Fase 3. Comandos sob demanda

Comandos do bot:

- `/pi 13877`
  - resumo da inserção
  - links de evidência, docs, analytics e ZIP

- `/print 13877`
  - pedir print do dia

- `/retro 13877 2026-04-15`
  - pedir print retroativo

- `/zip 13877`
  - devolver ZIP da inserção

- `/status 13877`
  - responder status operacional atual

### Fase 4. Atualização de PI

Fluxo ideal via Mini App:

- buscar PI
- editar mídia
- editar período
- editar posição
- salvar
- registrar log de alteração

### Fase 5. Criação de PI

Fluxo via bot + Mini App:

1. usuário envia PDF + mídia
2. bot cria intake
3. arquivos são enviados ao Spaces do projeto
4. intake fica pendente de revisão
5. agente operacional executa o fluxo com `adops-pi-sync`

## Mapeamento das ideias iniciais

### 6a. Print diário

Implementar no bot em fase 1.

Saída:

- total de prints do dia
- total por site
- total por campanha
- pendências

### 6b. ZIP quando terminar

Implementar no bot em fase 1.

Regra:

- só notificar quando os artefatos estiverem realmente completos
- não marcar `enviado_para_agencia` automaticamente

### 6c. Solicitar print por PI ou data retroativa

Implementar no bot em fase 1.

Usar:

- fluxo público por inserção para print do dia
- fluxo retroativo controlado para data específica

### 6d. Responder por PI

Implementar no bot em fase 1.

Resposta deve trazer:

- evidências
- documentos
- analytics
- ZIP
- status

### 6e. Atualizar PI

Implementar em fase 2 com Mini App.

Motivo:

- chat puro é ruim para edição estruturada
- Mini App reduz erro de operação

### 6f. Criar PI

Implementar em fase 2.

Fluxo:

- intake por bot
- upload para Spaces
- pendência estruturada
- processamento posterior pelo fluxo operacional

## Modelo de decisão

### O que o bot faz bem

- notificação
- resumo
- botões rápidos
- disparo de print
- entrega de ZIP
- confirmação de status

### O que deve ir para Mini App

- formulários
- update de mídia
- update de período
- criação de PI
- revisão operacional antes de publicar

## Modelo mínimo de estados

Não criar novos estados se não for necessário.

Reaproveitar os já existentes:

- `print_gerado`
- `enviado_para_agencia`
- `docs_enviados`
- `concluido`

O bot só deve ajudar a avançar os estados.

## Checklist de implementação

### Etapa 1. Bot

- criar worker do bot
- criar `.env`
- configurar webhook
- enviar mensagem para usuário e grupo
- comando `/pi`
- comando `/print`
- comando `/retro`
- comando `/zip`

### Etapa 2. Prontidão automática

- função `isReadyForAgencyDispatch(insertion)`
- resumo de artefatos completos
- envio automático do ZIP

### Etapa 3. Resumo diário

- job diário
- agregação por site e campanha
- resumo enviado ao grupo

### Etapa 4. Mini App

- autenticação Telegram WebApp
- tela de consulta por PI
- tela de update
- intake de nova PI

## Regras de segurança

- validar webhook do Telegram com `secret token`
- validar `initData` do Mini App no backend
- não deixar grupo público executar update destrutivo sem permissão
- limitar ações de update por `TELEGRAM_ALLOWED_USER_ID`
- registrar logs de:
  - quem pediu
  - qual PI
  - qual ação
  - resultado
