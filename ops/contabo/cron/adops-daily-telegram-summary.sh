#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/etc/easypanel/projects/codigo5/adops-campanhas-portais/code}"
RUNNER_ENV_FILE="${RUNNER_ENV_FILE:-/etc/easypanel/projects/codigo5/adops-campanhas-portais/adops-runner.env}"
PRINTS_SCRIPT="${PRINTS_SCRIPT:-$ROOT_DIR/ops/contabo/cron/adops-daily-prints.sh}"
TELEGRAM_REPORT_URL="${TELEGRAM_REPORT_URL:-https://adops-telegram-bot.leandro471.workers.dev/ops/daily-report}"
TELEGRAM_RESEND_URL="${TELEGRAM_RESEND_URL:-https://adops-telegram-bot.leandro471.workers.dev/ops/resend-print}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-https://adops-api-public.leandro471.workers.dev}"

if [[ -f "$RUNNER_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$RUNNER_ENV_FILE"
  set +a
fi

if [[ -z "${OPS_API_TOKEN:-}" ]]; then
  echo "[adops-daily-telegram-summary] OPS_API_TOKEN ausente." >&2
  exit 1
fi

"$PRINTS_SCRIPT"

response="$(
  curl -sS \
    -H "authorization: Bearer ${OPS_API_TOKEN}" \
    -H "x-adops-preflight: done" \
    -X POST \
    "${TELEGRAM_REPORT_URL}?skipDailyPhotos=1"
)"

echo "$response"

if [[ "$response" != *'"ok":true'* ]]; then
  echo "[adops-daily-telegram-summary] Falha no envio do resumo." >&2
  exit 1
fi

DATE_CUIABA="$(TZ=America/Cuiaba date +%F)"

python3 - "$PUBLIC_API_BASE_URL" "$TELEGRAM_RESEND_URL" "$OPS_API_TOKEN" "$DATE_CUIABA" <<'PY'
import json
import sys
import urllib.request

public_api_base_url, resend_url, ops_token, target_date = sys.argv[1:]

def request_json(url, method="GET", payload=None):
    headers = {"User-Agent": "Mozilla/5.0"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
        headers["Authorization"] = f"Bearer {ops_token}"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)

audit = request_json(f"{public_api_base_url}/api/insertions/capture-proof/audit?date={target_date}")
sent = 0
for item in audit.get("items", []):
    if item.get("status") != "ok":
        continue
    payload = {"insertionId": item.get("insertionId"), "date": target_date}
    result = request_json(resend_url, method="POST", payload=payload)
    print(json.dumps({"stage": "telegram_photo", "insertionId": item.get("insertionId"), "result": result}, ensure_ascii=False))
    if result.get("ok") is True:
        sent += 1

print(json.dumps({"stage": "telegram_photo_summary", "date": target_date, "sent": sent}, ensure_ascii=False))
PY
