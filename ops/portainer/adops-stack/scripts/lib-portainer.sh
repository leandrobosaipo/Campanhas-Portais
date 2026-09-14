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
  curl -sS --connect-timeout 10 --max-time 60 -H "X-API-Key: ${PORTAINER_API_KEY}" "$@"
}

portainer_wait_for_exec() {
  local exec_id="$1"
  local description="$2"
  local deadline_seconds="${3:-${PORTAINER_EXEC_DEADLINE_SECONDS:-120}}"
  local poll_seconds="${PORTAINER_EXEC_POLL_SECONDS:-2}"
  local started_at="$SECONDS"
  local state running exit_code

  while (( SECONDS - started_at < deadline_seconds )); do
    state="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json")"
    running="$(jq -r 'if has("Running") then .Running else true end' <<<"$state")"
    exit_code="$(jq -r '.ExitCode // empty' <<<"$state")"

    if [[ "$running" == "false" && -n "$exit_code" ]]; then
      [[ "$exit_code" == "0" ]] || {
        printf '%s exec failed with exit code %s.\n' "$description" "$exit_code" >&2
        return 1
      }
      return 0
    fi
    sleep "$poll_seconds"
  done

  printf '%s exec exceeded deadline (%ss); last state must be Running=false with ExitCode=0.\n' \
    "$description" "$deadline_seconds" >&2
  return 1
}
