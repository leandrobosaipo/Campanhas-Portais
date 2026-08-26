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

portainer_start_container() {
  local container_id="$1"
  curl -sS --connect-timeout 10 --max-time 30 \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -X POST \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start"
}

DISCOVERED_ENV=""
DEPLOY_ENV=""
ROLLBACK_ENV=""
LEGACY_MONITOR_ID=""
LEGACY_MONITOR_STOPPED="false"
DEPLOY_COMPLETE="false"
STACK_SWITCHED="false"
cleanup() {
  if [[ "$STACK_SWITCHED" == "true" && "$DEPLOY_COMPLETE" != "true" && -n "$ROLLBACK_ENV" ]]; then
    printf 'Deploy incompleto; restaurando volumes anteriores app=%s web=%s\n' "$PREVIOUS_APP_VOLUME" "$PREVIOUS_WEB_VOLUME" >&2
    COMPOSE_FILE="$STACK_DIR/docker-compose.volume.yml" \
      bash "$SCRIPT_DIR/deploy-stack.sh" "$ROLLBACK_ENV" >/dev/null 2>&1 || true
  fi
  if [[ "$LEGACY_MONITOR_STOPPED" == "true" && "$DEPLOY_COMPLETE" != "true" ]]; then
    NEW_MONITOR_HEALTH="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
      | jq -r '.[] | select(.Names[]? == "/adops-drive-pi-monitor-stack") | .Status' | head -n 1 || true)"
    if [[ "$NEW_MONITOR_HEALTH" != *"(healthy)"* ]]; then
      portainer_start_container "$LEGACY_MONITOR_ID" >/dev/null || true
    fi
  fi
  [[ -z "$DISCOVERED_ENV" ]] || rm -f "$DISCOVERED_ENV"
  [[ -z "$DEPLOY_ENV" ]] || rm -f "$DEPLOY_ENV"
  [[ -z "$ROLLBACK_ENV" ]] || rm -f "$ROLLBACK_ENV"
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

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$STACK_ENV_FILE"
}

PREVIOUS_APP_VOLUME="$(env_value ADOPS_APP_SOURCE_VOLUME)"
PREVIOUS_WEB_VOLUME="$(env_value ADOPS_WEB_PUBLIC_VOLUME)"
PREVIOUS_DRIVE_MODE="$(env_value DRIVE_INTEGRATION_MODE)"
PREVIOUS_IMAGE_TAG="$(env_value ADOPS_IMAGE_TAG)"
PREVIOUS_APP_VOLUME="${PREVIOUS_APP_VOLUME:-adops_app_source}"
PREVIOUS_WEB_VOLUME="${PREVIOUS_WEB_VOLUME:-adops_web_public}"
PREVIOUS_DRIVE_MODE="${PREVIOUS_DRIVE_MODE:-monitor}"
PREVIOUS_IMAGE_TAG="${PREVIOUS_IMAGE_TAG:-legacy}"

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

ALERT_MIGRATION="$STACK_DIR/migrations/2026-08-26-daily-print-alerts.sql"
[[ -f "$ALERT_MIGRATION" ]] || { printf 'Migration ausente: %s\n' "$ALERT_MIGRATION" >&2; exit 1; }
ALERT_MIGRATION_B64="$(base64 < "$ALERT_MIGRATION" | tr -d '\n')"
MIGRATION_PAYLOAD="$(jq -n --arg sql "$ALERT_MIGRATION_B64" '{
  AttachStdout:true, AttachStderr:true, Tty:false,
  Cmd:["sh","-lc",("printf %s " + ($sql|@sh) + " | base64 -d | psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" \"$POSTGRES_DB\"")]
}')"
MIGRATION_EXEC_ID="$(portainer_curl -X POST -H 'Content-Type: application/json' -d "$MIGRATION_PAYLOAD" "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${POSTGRES_ID}/exec" | jq -r '.Id')"
portainer_curl -X POST -H 'Content-Type: application/json' -d '{"Detach":false,"Tty":false}' "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${MIGRATION_EXEC_ID}/start" >/dev/null
MIGRATION_EXIT_CODE="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${MIGRATION_EXEC_ID}/json" | jq -r '.ExitCode')"
[[ "$MIGRATION_EXIT_CODE" == "0" ]] || { printf 'PostgreSQL migration failed.\n' >&2; exit 1; }

export ADOPS_IMAGE_TAG="${ADOPS_IMAGE_TAG:0:12}"
export ADOPS_RELEASE_SHA="${ADOPS_RELEASE_SHA:-$ADOPS_IMAGE_TAG}"
export ADOPS_APP_SOURCE_VOLUME="${ADOPS_APP_SOURCE_VOLUME:-adops_app_source_${ADOPS_IMAGE_TAG}}"
export ADOPS_WEB_PUBLIC_VOLUME="${ADOPS_WEB_PUBLIC_VOLUME:-adops_web_public_${ADOPS_IMAGE_TAG}}"

# Docker's synchronous build stream exceeds Cloudflare's request timeout for
# this Playwright image. The volume runtime is the production path already
# validated for this stack and keeps the release traceable through its SHA.
if [[ "${ADOPS_SKIP_RUNTIME_UPLOAD:-false}" == "true" ]]; then
  printf 'Skipping runtime upload because versioned volumes were already validated.\n'
else
  VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://adops-api.codigo5.com.br}" \
    bash "$SCRIPT_DIR/upload-runtime-volumes.sh"
fi

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
grep -vE '^(ADOPS_IMAGE_TAG|DRIVE_INTEGRATION_MODE|ADOPS_APP_SOURCE_VOLUME|ADOPS_WEB_PUBLIC_VOLUME)=' "$STACK_ENV_FILE" > "$DEPLOY_ENV"
printf 'ADOPS_IMAGE_TAG=%s\nDRIVE_INTEGRATION_MODE=%s\nADOPS_APP_SOURCE_VOLUME=%s\nADOPS_WEB_PUBLIC_VOLUME=%s\n' \
  "$ADOPS_IMAGE_TAG" "${DRIVE_INTEGRATION_MODE:-monitor}" "$ADOPS_APP_SOURCE_VOLUME" "$ADOPS_WEB_PUBLIC_VOLUME" >> "$DEPLOY_ENV"
chmod 600 "$DEPLOY_ENV"

ROLLBACK_ENV="$(mktemp)"
grep -vE '^(ADOPS_IMAGE_TAG|DRIVE_INTEGRATION_MODE|ADOPS_APP_SOURCE_VOLUME|ADOPS_WEB_PUBLIC_VOLUME)=' "$STACK_ENV_FILE" > "$ROLLBACK_ENV"
printf 'ADOPS_IMAGE_TAG=%s\nDRIVE_INTEGRATION_MODE=%s\nADOPS_APP_SOURCE_VOLUME=%s\nADOPS_WEB_PUBLIC_VOLUME=%s\n' \
  "$PREVIOUS_IMAGE_TAG" "$PREVIOUS_DRIVE_MODE" "$PREVIOUS_APP_VOLUME" "$PREVIOUS_WEB_VOLUME" >> "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"
STACK_SWITCHED="true"
COMPOSE_FILE="$STACK_DIR/docker-compose.volume.yml" \
  bash "$SCRIPT_DIR/deploy-stack.sh" "$DEPLOY_ENV"

stable_checks=0
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 10 https://adops-api.codigo5.com.br/api/healthz >/dev/null && \
     curl -fsS --max-time 10 https://adops-api.codigo5.com.br/api/ops/drive-inventory/status >/dev/null && \
     curl -fsS --max-time 10 https://adops.codigo5.com.br/ >/dev/null && \
     curl -fsS --max-time 10 https://adops.codigo5.com.br/cod5-release.json \
       | jq -e --arg sha "$ADOPS_RELEASE_SHA" '.sha == $sha' >/dev/null; then
    stable_checks=$((stable_checks + 1))
    [[ "$stable_checks" -ge 3 ]] && break
  else
    stable_checks=0
  fi
  [[ "$attempt" == "60" ]] && { printf 'Production smoke timed out.\n' >&2; exit 1; }
  sleep 5
done

RUNNER_ID=""
MONITOR_ID=""
for attempt in $(seq 1 120); do
  CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" || true)"
  for container_name in adops-runner adops-runner-print-single adops-drive-pi-monitor-stack; do
    CONTAINER_ID="$(printf '%s' "$CONTAINERS" | jq -r --arg name "/$container_name" '.[]? | select(.Names[]? == $name) | .Id' 2>/dev/null | head -n 1)"
    CONTAINER_STATE="$(printf '%s' "$CONTAINERS" | jq -r --arg name "/$container_name" '.[]? | select(.Names[]? == $name) | .State' 2>/dev/null | head -n 1)"
    if [[ -n "$CONTAINER_ID" && "$CONTAINER_STATE" != "running" ]]; then
      portainer_start_container "$CONTAINER_ID" >/dev/null 2>&1 || true
    fi
  done
  RUNNER_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[]? | select(.Names[]? == "/adops-runner" and .State == "running") | .Id' 2>/dev/null | head -n 1)"
  MONITOR_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[]? | select(.Names[]? == "/adops-drive-pi-monitor-stack" and .State == "running") | .Id' 2>/dev/null | head -n 1)"
  [[ -n "$RUNNER_ID" && -n "$MONITOR_ID" ]] && break
  [[ "$attempt" == "120" ]] && { printf 'Runner and Drive monitor did not become ready.\n' >&2; exit 1; }
  sleep 5
done

RUNNER_INSPECT="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${RUNNER_ID}/json")"
MONITOR_INSPECT="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${MONITOR_ID}/json")"
printf '%s' "$RUNNER_INSPECT" | jq -e '.State.Running == true and ([.Config.Env[] | split("=")[0] | select(startswith("GOOGLE_DRIVE_"))] | length == 0)' >/dev/null
printf '%s' "$MONITOR_INSPECT" | jq -e '.State.Running == true and ([.Config.Env[] | split("=")[0]] | index("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE") != null) and (.HostConfig.PortBindings | length == 0)' >/dev/null

DEPLOY_COMPLETE="true"
printf 'AdOps deployed release=%s backup=%s runtime=volume app=%s web=%s\n' \
  "$ADOPS_RELEASE_SHA" "$BACKUP_NAME" "$ADOPS_APP_SOURCE_VOLUME" "$ADOPS_WEB_PUBLIC_VOLUME"
