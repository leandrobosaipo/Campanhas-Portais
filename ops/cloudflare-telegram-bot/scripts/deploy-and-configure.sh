#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/leandrobosaipo/Projetos/AdOps"
BOT_DIR="$ROOT/ops/cloudflare-telegram-bot"
BOT_ENV="$ROOT/ops/telegram-bot/.env"
OPS_ENV="$ROOT/ops/cloudflare-public-api/.env.ops.local"

if [[ ! -f "$BOT_ENV" ]]; then
  echo "Arquivo .env do bot não encontrado: $BOT_ENV" >&2
  exit 1
fi

eval "$(
python3 - "$BOT_ENV" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    print(f"export {key}={shlex.quote(value)}")
PY
)"

if [[ -z "${OPS_API_TOKEN:-}" && -f "$OPS_ENV" ]]; then
  eval "$(
  python3 - "$OPS_ENV" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    print(f"export {key}={shlex.quote(value)}")
PY
  )"
fi

required=(
  TELEGRAM_BOT_TOKEN
  TELEGRAM_WEBHOOK_SECRET
  TELEGRAM_ALLOWED_USER_ID
  TELEGRAM_DEFAULT_GROUP_ID
)

for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Variável obrigatória ausente: $key" >&2
    exit 1
  fi
done

if [[ -z "${OPS_API_TOKEN:-}" ]]; then
  echo "OPS_API_TOKEN ausente. Preencha no .env do bot ou mantenha .env.ops.local acessível." >&2
  exit 1
fi

cd "$BOT_DIR"

put_secret() {
  local key="$1"
  local value="$2"
  printf '%s' "$value" | npx wrangler secret put "$key"
}

put_secret TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
put_secret TELEGRAM_WEBHOOK_SECRET "$TELEGRAM_WEBHOOK_SECRET"
put_secret TELEGRAM_ALLOWED_USER_ID "$TELEGRAM_ALLOWED_USER_ID"
put_secret TELEGRAM_DEFAULT_GROUP_ID "$TELEGRAM_DEFAULT_GROUP_ID"
put_secret OPS_API_TOKEN "$OPS_API_TOKEN"

if [[ -n "${TELEGRAM_MINI_APP_URL:-}" ]]; then
  put_secret TELEGRAM_MINI_APP_URL "$TELEGRAM_MINI_APP_URL"
fi

npx wrangler deploy \
  --keep-vars

WEBHOOK_URL="${TELEGRAM_WEBHOOK_BASE_URL%/}/webhook"
set +e
set_webhook_response="$(
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"
)"
set_webhook_status=$?
set -e

echo "$set_webhook_response"

if [[ $set_webhook_status -ne 0 || "$set_webhook_response" != *'"ok":true'* ]]; then
  echo "Falha ao registrar webhook em ${WEBHOOK_URL}. Atualize TELEGRAM_WEBHOOK_BASE_URL para a URL publica real do worker e rode novamente." >&2
  exit 1
fi

commands_payload='[
  {"command":"start","description":"Mostra como usar o bot"},
  {"command":"help","description":"Lista os comandos disponíveis"},
  {"command":"pi","description":"Consulta uma PI ou inserção"},
  {"command":"zip","description":"Baixa o ZIP por PI/site ou inserção"},
  {"command":"lista_pi","description":"Lista PIs por site e mês"},
  {"command":"print","description":"Solicita o print de hoje"},
  {"command":"retro","description":"Solicita print retroativo por data"},
  {"command":"enviado","description":"Marca como enviado para agência"},
  {"command":"docs","description":"Marca docs enviados"},
  {"command":"concluir","description":"Conclui a inserção"}
]'

set_commands_response="$(
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands" \
  -H "content-type: application/json; charset=utf-8" \
  --data-binary "{\"commands\":${commands_payload}}"
)"

echo "$set_commands_response"

if [[ "$set_commands_response" != *'"ok":true'* ]]; then
  echo "Falha ao registrar lista de comandos do bot no Telegram." >&2
  exit 1
fi

health_response=""
for _ in 1 2 3 4 5; do
  health_response="$(curl -sS "${TELEGRAM_WEBHOOK_BASE_URL%/}/healthz" || true)"
  echo "$health_response"
  if [[ "$health_response" == *'"usernameConfigured":true'* && "$health_response" == *'"webhookBaseConfigured":true'* ]]; then
    break
  fi
  sleep 2
done
if [[ "$health_response" != *'"usernameConfigured":true'* || "$health_response" != *'"webhookBaseConfigured":true'* ]]; then
  echo "Healthz não confirmou usernameConfigured/webhookBaseConfigured=true." >&2
  exit 1
fi

webhook_info="$(curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")"
echo "$webhook_info"
if [[ "$webhook_info" != *"\"url\":\"${WEBHOOK_URL}\""* ]]; then
  echo "Webhook ativo não aponta para ${WEBHOOK_URL}." >&2
  exit 1
fi

commands_info="$(curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMyCommands")"
echo "$commands_info"
if [[ "$commands_info" != *'"command":"lista_pi"'* ]]; then
  echo "getMyCommands não retornou /lista_pi." >&2
  exit 1
fi
