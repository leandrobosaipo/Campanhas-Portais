#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ENV_FILE="${PERRENGUE_VM8_PORTAINER_ENV_FILE:-$REPO_ROOT/ops/portainer/adops-stack/.env.perrengue-vm8-portainer}"
PLUGIN_SOURCE="$REPO_ROOT/ops/wordpress/adrotate-adops.php"

[[ -f "$ENV_FILE" ]] || { printf 'Missing env file: %s\n' "$ENV_FILE" >&2; exit 1; }
[[ -f "$PLUGIN_SOURCE" ]] || { printf 'Missing plugin source: %s\n' "$PLUGIN_SOURCE" >&2; exit 1; }

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
[[ "${ADOPS_PERRENGUE_PORTAINER_TLS_INSECURE:-false}" == "true" ]] && CURL_TLS_ARGS=(-k)

containers_file="$(mktemp)"
exec_file="$(mktemp)"
start_file="$(mktemp)"
trap 'rm -f "$containers_file" "$exec_file" "$start_file"' EXIT

curl "${CURL_TLS_ARGS[@]}" -fsS --max-time 20 \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" > "$containers_file"
container_id="$(jq -r --arg name "/${ADOPS_PERRENGUE_WP_CONTAINER}" '.[] | select(.Names[]? == $name) | .Id' "$containers_file" | head -n1)"
[[ -n "$container_id" ]] || { printf 'Perrengue WordPress container not found.\n' >&2; exit 1; }

payload_base64="$(base64 < "$PLUGIN_SOURCE" | tr -d '\n')"
wp_load="${ADOPS_PERRENGUE_CONTAINER_WP_PATH%/}/wp-load.php"
legacy_target="${ADOPS_PERRENGUE_CONTAINER_WP_PATH%/}/wp-content/plugins/adrotate/adrotate-adops.php"
command="tmp_plugin=\$(mktemp /tmp/adrotate-adops.XXXXXX.php); printf %s '${payload_base64}' | base64 -d > \"\$tmp_plugin\"; php -l \"\$tmp_plugin\" >/dev/null; content_dir=\$(php -r 'require \$argv[1]; echo WP_CONTENT_DIR;' '${wp_load}'); test -n \"\$content_dir\"; target=\"\$content_dir/plugins/adrotate/adrotate-adops.php\"; mkdir -p \"\$(dirname \"\$target\")\"; if [ -f \"\$target\" ]; then cp \"\$target\" \"\$target.bak-\$(date +%Y%m%d-%H%M%S)\"; fi; install -m 0644 \"\$tmp_plugin\" \"\$target\"; rm -f \"\$tmp_plugin\"; if [ '${legacy_target}' != \"\$target\" ]; then rm -f '${legacy_target}'; fi; php -l \"\$target\"; sha256sum \"\$target\" | cut -d' ' -f1"

curl "${CURL_TLS_ARGS[@]}" -fsS --max-time 20 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg cmd "$command" '{AttachStdout:true,AttachStderr:true,Tty:false,Cmd:["sh","-lc",$cmd]}')" \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" > "$exec_file"
exec_id="$(jq -r '.Id // empty' "$exec_file")"
[[ -n "$exec_id" ]] || { printf 'Portainer did not create exec.\n' >&2; exit 1; }

curl "${CURL_TLS_ARGS[@]}" -fsS --max-time 60 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"Detach":false,"Tty":false}' \
  "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" > "$start_file"
exit_code="$(curl "${CURL_TLS_ARGS[@]}" -fsS --max-time 20 -H "X-API-Key: ${PORTAINER_API_KEY}" "${PORTAINER_URL}/api/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" | jq -r '.ExitCode')"
output="$(strings "$start_file" | tail -n 4)"
printf '%s\n' "$output"
[[ "$exit_code" == "0" && "$output" == *"No syntax errors detected"* ]]
