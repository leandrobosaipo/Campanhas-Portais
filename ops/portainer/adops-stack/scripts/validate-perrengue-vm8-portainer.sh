#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${PERRENGUE_VM8_PORTAINER_ENV_FILE:-/Users/leandrobosaipo/Projetos/AdOps/ops/portainer/adops-stack/.env.perrengue-vm8-portainer}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing env file: %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${PORTAINER_URL:?PORTAINER_URL is required}"
: "${PORTAINER_API_KEY:?PORTAINER_API_KEY is required}"
: "${ADOPS_PERRENGUE_WP_CONTAINER:?ADOPS_PERRENGUE_WP_CONTAINER is required}"
: "${ADOPS_PERRENGUE_CONTAINER_WP_PATH:?ADOPS_PERRENGUE_CONTAINER_WP_PATH is required}"

PORTAINER_URL="${PORTAINER_URL%/}"
ENDPOINT_ID="${ADOPS_PERRENGUE_PORTAINER_ENDPOINT_ID:-${PORTAINER_ENDPOINT_ID:-3}}"
CURL_TLS_ARGS=()
if [[ "${ADOPS_PERRENGUE_PORTAINER_TLS_INSECURE:-false}" == "true" ]]; then
  CURL_TLS_ARGS=(-k)
fi

tmp_containers="$(mktemp)"
tmp_clean="$(mktemp)"
cleanup() {
  rm -f "$tmp_containers" "$tmp_clean"
}
trap cleanup EXIT

status_code="$(curl "${CURL_TLS_ARGS[@]}" -sS -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_URL}/api/status" || true)"
printf 'portainer_status_http=%s\n' "$status_code"
if [[ "$status_code" != "200" ]]; then
  exit 1
fi

containers_code="$(curl "${CURL_TLS_ARGS[@]}" -sS -o "$tmp_containers" -w '%{http_code}' --max-time 20 \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" || true)"
perl -pe 's/[\x00-\x08\x0B\x0C\x0E-\x1F]//g' "$tmp_containers" > "$tmp_clean"
printf 'containers_http=%s\n' "$containers_code"
if [[ "$containers_code" != "200" ]]; then
  exit 1
fi

wp_count="$(jq -r --arg name "/${ADOPS_PERRENGUE_WP_CONTAINER}" '[.[]? | select(.Names[]? == $name)] | length' "$tmp_clean")"
static_count="$(jq -r '[.[]? | select(.Names[]? == "/cod5-static-perrenguematogrosso-headless")] | length' "$tmp_clean")"
printf 'perrengue_wp_container_count=%s\n' "$wp_count"
printf 'perrengue_static_container_count=%s\n' "$static_count"
if [[ "$wp_count" != "1" ]]; then
  exit 1
fi

container_id="$(jq -r --arg name "/${ADOPS_PERRENGUE_WP_CONTAINER}" '.[] | select(.Names[]? == $name) | .Id' "$tmp_clean" | head -n1)"
exec_body="$(mktemp)"
exec_start="$(mktemp)"
trap 'cleanup; rm -f "$exec_body" "$exec_start"' EXIT

exec_code="$(curl "${CURL_TLS_ARGS[@]}" -sS -o "$exec_body" -w '%{http_code}' --max-time 20 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg cmd "cd ${ADOPS_PERRENGUE_CONTAINER_WP_PATH} && php -r 'echo is_readable(\"wp-load.php\") ? \"wp-load-ok\\n\" : \"wp-load-missing\\n\";'" '{AttachStdout:true,AttachStderr:true,Tty:false,Cmd:["sh","-lc",$cmd]}')" \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" || true)"
exec_id="$(jq -r '.Id // empty' "$exec_body" 2>/dev/null || true)"
printf 'exec_create_http=%s\n' "$exec_code"
if [[ -z "$exec_id" ]]; then
  exit 1
fi

start_code="$(curl "${CURL_TLS_ARGS[@]}" -sS -o "$exec_start" -w '%{http_code}' --max-time 30 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"Detach":false,"Tty":false}' \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" || true)"
exit_code="$(curl "${CURL_TLS_ARGS[@]}" -sS --max-time 20 \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" | jq -r '.ExitCode')"
exec_output="$(strings "$exec_start" | tail -n 5 | tr '\n' ' ')"
printf 'exec_start_http=%s\n' "$start_code"
printf 'exec_exit_code=%s\n' "$exit_code"
printf 'exec_output=%s\n' "$exec_output"

[[ "$start_code" == "200" && "$exit_code" == "0" && "$exec_output" == *"wp-load-ok"* ]]
