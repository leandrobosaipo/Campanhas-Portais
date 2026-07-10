#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STACK_NAME="${STACK_NAME:-adops}"
COMPOSE_FILE="${COMPOSE_FILE:-$STACK_DIR/docker-compose.yml}"
ENV_FILE="${1:-${ADOPS_STACK_ENV_FILE:-}}"

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  printf 'Usage: ADOPS_STACK_ENV_FILE=/secure/path/adops.env %s\n' "$0" >&2
  printf 'Or pass env file as first argument. Do not use .env.example for production.\n' >&2
  exit 1
fi

if rg -n 'change-me|SOURCE_DATABASE_URL=postgresql://source-user' "$ENV_FILE" >/dev/null; then
  printf 'Env file still contains placeholder values. Refusing deploy.\n' >&2
  exit 1
fi

load_portainer_env
ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-$(portainer_endpoint_id)}"

env_json() {
  jq -Rn '
    [inputs
     | select(test("^[[:space:]]*($|#)"; "n") | not)
     | select(test("="))
     | capture("^(?<name>[^=]+)=(?<value>.*)$")
     | {name: (.name | gsub("^[[:space:]]+|[[:space:]]+$"; "")), value: (.value | gsub("^\"|\"$"; "") | gsub("^'\''|'\''$"; ""))}
    ]' < "$ENV_FILE"
}

STACK_CONTENT="$(cat "$COMPOSE_FILE")"
PAYLOAD="$(jq -n \
  --arg name "$STACK_NAME" \
  --arg stackFileContent "$STACK_CONTENT" \
  --argjson env "$(env_json)" \
  '{Name: $name, StackFileContent: $stackFileContent, Env: $env, FromAppTemplate: false, Prune: false, PullImage: true}')"

EXISTING="$(curl -sS --max-time 20 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/stacks" \
  | jq -r --arg name "$STACK_NAME" '.[] | select(.Name == $name) | [.Id, .EndpointId] | @tsv' \
  | head -n 1)"

BODY="$(mktemp)"
if [[ -n "$EXISTING" ]]; then
  STACK_ID="$(printf '%s' "$EXISTING" | awk -F '\t' '{print $1}')"
  STACK_ENDPOINT_ID="$(printf '%s' "$EXISTING" | awk -F '\t' '{print $2}')"
  printf 'Updating stack %s id=%s endpoint=%s\n' "$STACK_NAME" "$STACK_ID" "$STACK_ENDPOINT_ID"
  CODE="$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 60 \
    -X PUT \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${PORTAINER_API}/stacks/${STACK_ID}?endpointId=${STACK_ENDPOINT_ID}" || true)"
else
  printf 'Creating stack %s endpoint=%s\n' "$STACK_NAME" "$ENDPOINT_ID"
  CODE="$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 60 \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${PORTAINER_API}/stacks/create/standalone/string?endpointId=${ENDPOINT_ID}" || true)"
fi

if [[ ! "$CODE" =~ ^2 ]]; then
  printf 'Portainer stack deploy failed HTTP=%s\n' "$CODE" >&2
  jq -r '.message // .details // .err // .error // .' "$BODY" 2>/dev/null >&2 || sed -n '1,40p' "$BODY" >&2
  rm -f "$BODY"
  exit 1
fi

jq '{Id, Name, Status, EndpointId}' "$BODY"
rm -f "$BODY"

printf '\nContainers matching %s:\n' "$STACK_NAME"
curl -sS --max-time 20 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
  | jq -r --arg stack "$STACK_NAME" '.[] | select((.Names[]? | contains($stack)) or (.Labels["com.docker.compose.project"] == $stack)) | "\(.Names[0] | ltrimstr("/"))\t\(.State)\t\(.Status)"'
