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

  curl -sS -H "X-API-Key: ${PORTAINER_API_KEY}" "${PORTAINER_API}/endpoints" \
    | jq -r '[.[] | select(.Status == 1)] | sort_by(.Id) | .[0].Id'
}

portainer_curl() {
  curl -sS -H "X-API-Key: ${PORTAINER_API_KEY}" "$@"
}
