#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORTAINER_ENV="/Users/leandrobosaipo/Projetos/macmini/.env.portainer"

load_portainer_env() {
  local env_file="${PORTAINER_ENV_FILE:-$DEFAULT_PORTAINER_ENV}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  : "${PORTAINER_URL:?PORTAINER_URL is required}"
  : "${PORTAINER_API_KEY:?PORTAINER_API_KEY is required}"
  PORTAINER_URL="${PORTAINER_URL%/}"
  PORTAINER_API="${PORTAINER_URL}/api"
}

portainer_endpoint_id() {
  if [[ -n "${PORTAINER_ENDPOINT_ID:-}" ]]; then
    printf '%s\n' "$PORTAINER_ENDPOINT_ID"
    return
  fi

  portainer_get_json "${PORTAINER_API}/endpoints" \
    | jq -r '[.[] | select(.Status == 1)] | sort_by(.Id) | .[0].Id'
}

portainer_curl() {
  curl -fsS --connect-timeout "${PORTAINER_CONNECT_TIMEOUT_SECONDS:-12}" \
    --max-time "${PORTAINER_REQUEST_TIMEOUT_SECONDS:-90}" \
    -H "X-API-Key: ${PORTAINER_API_KEY}" "$@"
}

portainer_get_json() {
  local url="$1"
  local attempt body code
  body="$(mktemp)"
  for attempt in 1 2 3 4; do
    code="$(curl -sS -o "$body" -w '%{http_code}' \
      --connect-timeout "${PORTAINER_CONNECT_TIMEOUT_SECONDS:-12}" \
      --max-time "${PORTAINER_REQUEST_TIMEOUT_SECONDS:-90}" \
      -H "X-API-Key: ${PORTAINER_API_KEY}" "$url" || true)"
    if [[ "$code" =~ ^2 ]] && jq -e . "$body" >/dev/null 2>&1; then
      cat "$body"
      rm -f "$body"
      return 0
    fi
    sleep "$attempt"
  done
  printf 'Portainer GET did not return valid JSON: HTTP=%s url=%s\n' "$code" "$url" >&2
  sed -n '1,20p' "$body" >&2
  rm -f "$body"
  return 1
}
