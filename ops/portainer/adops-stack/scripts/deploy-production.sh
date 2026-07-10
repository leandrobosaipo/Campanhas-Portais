#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

: "${ADOPS_IMAGE_TAG:?ADOPS_IMAGE_TAG must be the commit SHA}"

load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"
DISCOVERED_ENV=""
DEPLOY_ENV=""
LEGACY_MONITOR_ID=""
LEGACY_MONITOR_STOPPED="false"
DEPLOY_COMPLETE="false"
cleanup() {
  if [[ "$LEGACY_MONITOR_STOPPED" == "true" && "$DEPLOY_COMPLETE" != "true" ]]; then
    portainer_curl -X POST "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${LEGACY_MONITOR_ID}/start" >/dev/null || true
  fi
  [[ -z "$DISCOVERED_ENV" ]] || rm -f "$DISCOVERED_ENV"
  [[ -z "$DEPLOY_ENV" ]] || rm -f "$DEPLOY_ENV"
}
trap cleanup EXIT

STACK_ENV_FILE="${ADOPS_STACK_ENV_FILE:-}"
if [[ -z "$STACK_ENV_FILE" || ! -f "$STACK_ENV_FILE" ]]; then
  STACK_ID="$(portainer_curl "${PORTAINER_API}/stacks" | jq -r '.[] | select(.Name == "adops") | .Id' | head -n 1)"
  [[ -n "$STACK_ID" ]] || { printf 'AdOps stack not found in Portainer.\n' >&2; exit 1; }
  DISCOVERED_ENV="$(mktemp)"
  portainer_curl "${PORTAINER_API}/stacks/${STACK_ID}" \
    | jq -r '.Env[] | select(.name | test("^[A-Z0-9_]+$")) | "\(.name)=\(.value)"' \
    > "$DISCOVERED_ENV"
  chmod 600 "$DISCOVERED_ENV"
  [[ -s "$DISCOVERED_ENV" ]] || { printf 'Portainer stack environment is empty.\n' >&2; exit 1; }
  STACK_ENV_FILE="$DISCOVERED_ENV"
fi

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
POSTGRES_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-postgres") | .Id' | head -n 1)"
[[ -n "$POSTGRES_ID" ]] || { printf 'adops-postgres container not found.\n' >&2; exit 1; }

BACKUP_NAME="adops-before-${ADOPS_IMAGE_TAG:0:12}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
EXEC_PAYLOAD="$(jq -n --arg file "/var/lib/postgresql/data/${BACKUP_NAME}" '{
  AttachStdout:true, AttachStderr:true, Tty:false,
  Cmd:["sh","-lc",("pg_dump -U \"$POSTGRES_USER\" \"$POSTGRES_DB\" | gzip -c > " + $file)]
}')"
EXEC_ID="$(portainer_curl -X POST -H 'Content-Type: application/json' -d "$EXEC_PAYLOAD" "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${POSTGRES_ID}/exec" | jq -r '.Id')"
portainer_curl -X POST -H 'Content-Type: application/json' -d '{"Detach":false,"Tty":false}' "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${EXEC_ID}/start" >/dev/null
EXIT_CODE="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${EXEC_ID}/json" | jq -r '.ExitCode')"
[[ "$EXIT_CODE" == "0" ]] || { printf 'PostgreSQL backup failed.\n' >&2; exit 1; }

export ADOPS_IMAGE_TAG="${ADOPS_IMAGE_TAG:0:12}"
export ADOPS_RELEASE_SHA="${ADOPS_RELEASE_SHA:-$ADOPS_IMAGE_TAG}"

# Docker's synchronous build stream exceeds Cloudflare's request timeout for
# this Playwright image. The volume runtime is the production path already
# validated for this stack and keeps the release traceable through its SHA.
VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://adops-api.codigo5.com.br}" \
  bash "$SCRIPT_DIR/upload-runtime-volumes.sh"

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
LEGACY_MONITOR_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-drive-pi-monitor") | .Id' | head -n 1)"
if [[ -n "$LEGACY_MONITOR_ID" ]]; then
  LEGACY_MONITOR_RUNNING="$(printf '%s' "$CONTAINERS" | jq -r --arg id "$LEGACY_MONITOR_ID" '.[] | select(.Id == $id) | .State == "running"')"
  if [[ "$LEGACY_MONITOR_RUNNING" == "true" ]]; then
    portainer_curl -X POST "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${LEGACY_MONITOR_ID}/stop?t=20" >/dev/null
    LEGACY_MONITOR_STOPPED="true"
  fi
fi

DEPLOY_ENV="$(mktemp)"
grep -vE '^(ADOPS_IMAGE_TAG|DRIVE_INTEGRATION_MODE)=' "$STACK_ENV_FILE" > "$DEPLOY_ENV"
printf 'ADOPS_IMAGE_TAG=%s\nDRIVE_INTEGRATION_MODE=%s\n' "$ADOPS_IMAGE_TAG" "${DRIVE_INTEGRATION_MODE:-legacy}" >> "$DEPLOY_ENV"
COMPOSE_FILE="$STACK_DIR/docker-compose.volume.yml" \
  bash "$SCRIPT_DIR/deploy-stack.sh" "$DEPLOY_ENV"

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 https://adops-api.codigo5.com.br/api/healthz >/dev/null && \
     curl -fsS --max-time 10 https://adops.codigo5.com.br/ >/dev/null; then
    break
  fi
  [[ "$attempt" == "30" ]] && { printf 'Production smoke timed out.\n' >&2; exit 1; }
  sleep 5
done

curl -fsS --max-time 15 https://adops-api.codigo5.com.br/api/ops/drive-inventory/status >/dev/null

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
RUNNER_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-runner") | .Id' | head -n 1)"
MONITOR_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-drive-pi-monitor-stack") | .Id' | head -n 1)"
[[ -n "$RUNNER_ID" && -n "$MONITOR_ID" ]] || { printf 'Dedicated Drive monitor containers not found.\n' >&2; exit 1; }

RUNNER_INSPECT="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${RUNNER_ID}/json")"
MONITOR_INSPECT="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${MONITOR_ID}/json")"
printf '%s' "$RUNNER_INSPECT" | jq -e '.State.Running == true and ([.Config.Env[] | split("=")[0] | select(startswith("GOOGLE_DRIVE_"))] | length == 0)' >/dev/null
printf '%s' "$MONITOR_INSPECT" | jq -e '.State.Running == true and ([.Config.Env[] | split("=")[0]] | index("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE") != null) and (.HostConfig.PortBindings | length == 0)' >/dev/null

DEPLOY_COMPLETE="true"
printf 'AdOps deployed release=%s backup=%s runtime=volume\n' "$ADOPS_RELEASE_SHA" "$BACKUP_NAME"
