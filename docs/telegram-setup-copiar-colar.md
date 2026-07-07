# Telegram setup simples

## Objetivo

Gerar:

- token do bot
- id do usuário
- id do grupo

Sem depender de conhecimento prévio.

## Parte 1. Criar o bot

1. Abra o Telegram.
2. Na busca, procure `BotFather`.
3. Abra a conversa oficial com selo de verificação.
4. Envie:

```text
/start
```

5. Depois envie:

```text
/newbot
```

6. Escolha um nome qualquer para o bot.

Exemplo:

```text
AdOps Código5
```

7. Escolha um username terminando com `bot`.

Exemplo:

```text
adops_codigo5_bot
```

8. O BotFather vai devolver um token.

Copie esse token e cole em:

`/Users/leandrobosaipo/Projetos/AdOps/ops/telegram-bot/.env`

Na linha:

```text
TELEGRAM_BOT_TOKEN=
```

## Parte 2. Descobrir o seu ID de usuário

1. Procure o bot que você acabou de criar.
2. Abra a conversa com ele.
3. Clique em `Start` ou envie:

```text
/start
```

4. No navegador, cole esta URL, trocando `SEU_TOKEN` pelo token copiado:

```text
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

5. Procure por:

```json
"from":{"id":123456789
```

6. Copie esse número.

7. Cole no `.env`:

```text
TELEGRAM_ALLOWED_USER_ID=123456789
```

## Parte 3. Criar o grupo e descobrir o ID do grupo

1. No Telegram, crie um grupo novo.
2. Adicione:
   - você
   - o bot criado

3. No grupo, envie qualquer mensagem.

Exemplo:

```text
teste grupo adops
```

4. Abra de novo no navegador:

```text
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

5. Procure por:

```json
"chat":{"id":-1001234567890
```

6. Copie esse número negativo.

7. Cole no `.env`:

```text
TELEGRAM_DEFAULT_GROUP_ID=-1001234567890
```

## Parte 4. Criar o secret do webhook

Pode usar qualquer valor longo e difícil de adivinhar.

Exemplo:

```text
adops-telegram-secret-2026-codigo5
```

Cole no `.env`:

```text
TELEGRAM_WEBHOOK_SECRET=adops-telegram-secret-2026-codigo5
```

## Parte 5. Preencher a URL base do webhook

Quando o worker do bot existir, preencha a URL pública dele.

Exemplo:

```text
TELEGRAM_WEBHOOK_BASE_URL=https://adops-telegram-bot.seudominio.workers.dev
```

## Parte 6. Username do bot

Cole também o username criado:

```text
TELEGRAM_BOT_USERNAME=adops_codigo5_bot
```

## Exemplo final do `.env`

```text
TELEGRAM_BOT_TOKEN=123456789:ABCDEF_EXEMPLO
TELEGRAM_BOT_USERNAME=adops_codigo5_bot
TELEGRAM_WEBHOOK_BASE_URL=https://adops-telegram-bot.seudominio.workers.dev
TELEGRAM_WEBHOOK_SECRET=adops-telegram-secret-2026-codigo5
TELEGRAM_ALLOWED_USER_ID=123456789
TELEGRAM_DEFAULT_GROUP_ID=-1001234567890
TELEGRAM_MINI_APP_URL=https://adops-campanhas-portais.pages.dev/telegram
ADOPS_PUBLIC_API_BASE_URL=https://adops-api-public.leandro471.workers.dev
ADOPS_PRIVATE_API_BASE_URL=
ADOPS_PRIVATE_API_TOKEN=
ADOPS_EXPORT_BASE_URL=https://adops-campanhas-portais.pages.dev
ADOPS_SPACES_PUBLIC_BASE_URL=https://cod5.nyc3.digitaloceanspaces.com
TELEGRAM_NOTIFICATIONS_ENABLED=true
TELEGRAM_DAILY_REPORT_CRON=0 20 * * *
TELEGRAM_TIMEZONE=America/Cuiaba
```

## Se `getUpdates` vier vazio

Faça isto:

1. envie `/start` para o bot
2. mande uma mensagem no grupo
3. atualize a mesma URL no navegador

Se mesmo assim vier vazio, o bot ainda não recebeu nenhuma interação nova.
