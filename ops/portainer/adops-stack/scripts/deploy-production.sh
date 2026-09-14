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
  local original_status="$?"
  if [[ "$STACK_SWITCHED" == "true" && "$DEPLOY_COMPLETE" != "true" && -n "$ROLLBACK_ENV" ]]; then
    printf 'Deploy incompleto; iniciando rollback para os volumes anteriores.\n' >&2
    perform_verified_rollback || true
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
  return "$original_status"
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
ROLLBACK_RELEASE_URL="https://adops.codigo5.com.br/cod5-release.json"
if ! PREVIOUS_RELEASE_JSON="$(portainer_get_public_json "$ROLLBACK_RELEASE_URL")"; then
  printf 'Current production release manifest is unavailable; refusing deploy without rollback identity.\n' >&2
  exit 1
fi
PREVIOUS_RELEASE_SHA="$(jq -r '.sha // empty' <<<"$PREVIOUS_RELEASE_JSON")"
if [[ -z "$PREVIOUS_RELEASE_SHA" ]] || ! jq -e \
  --arg app "$PREVIOUS_APP_VOLUME" \
  --arg web "$PREVIOUS_WEB_VOLUME" \
  '.volumes.app == $app and .volumes.web == $web' <<<"$PREVIOUS_RELEASE_JSON" >/dev/null; then
  printf 'Current production release manifest does not match the rollback volumes; refusing deploy.\n' >&2
  exit 1
fi

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
POSTGRES_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-postgres") | .Id' | head -n 1)"
[[ -n "$POSTGRES_ID" ]] || { printf 'adops-postgres container not found.\n' >&2; exit 1; }

BACKUP_NAME="adops-before-${ADOPS_IMAGE_TAG:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump"
BACKUP_PATH="/var/lib/postgresql/data/adops-backups/${BACKUP_NAME}"
VERIFY_DB="adops_backup_verify_${ADOPS_IMAGE_TAG:0:12}_$(date -u +%s)"

start_postgres_exec() {
  local payload="$1"
  local description="$2"
  local deadline_seconds="${3:-120}"
  local exec_id

  if ! exec_id="$(portainer_run_detached_exec "$POSTGRES_ID" "$payload" "$description" "$deadline_seconds")"; then
    return 1
  fi
  printf '%s\n' "$exec_id"
}

BACKUP_PAYLOAD="$(jq -n --arg file "$BACKUP_PATH" '{
  AttachStdout:true, AttachStderr:true, Tty:false,
  Env:["BACKUP_FILE=" + $file],
  Cmd:["sh","-lc","set -eu; umask 077; mkdir -p \"$(dirname \"$BACKUP_FILE\")\"; log=\"$BACKUP_FILE.log\"; printf \"event=backup_started\\n\" > \"$log\"; if pg_dump --format=custom --file \"$BACKUP_FILE\" -U \"$POSTGRES_USER\" \"$POSTGRES_DB\" >>\"$log\" 2>&1; then printf \"event=backup_completed\\n\" >> \"$log\"; else printf \"event=backup_failed\\n\" >> \"$log\"; exit 1; fi"]
}')"
if ! BACKUP_EXEC_ID="$(start_postgres_exec "$BACKUP_PAYLOAD" 'PostgreSQL custom backup' 300)"; then
  exit 1
fi

VERIFY_PAYLOAD="$(jq -n --arg file "$BACKUP_PATH" --arg db "$VERIFY_DB" '{
  AttachStdout:true, AttachStderr:true, Tty:false,
  Env:["BACKUP_FILE=" + $file, "VERIFY_DB=" + $db],
  Cmd:["sh","-lc","set -eu; umask 077; log=\"$BACKUP_FILE.verify.log\"; printf \"event=restore_verify_started\\n\" > \"$log\"; cleanup() { psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d postgres -c \"DROP DATABASE IF EXISTS \\\"$VERIFY_DB\\\"\" >>\"$log\" 2>&1 || true; }; trap cleanup EXIT; if psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d postgres -c \"CREATE DATABASE \\\"$VERIFY_DB\\\"\" >>\"$log\" 2>&1 && pg_restore --exit-on-error --no-owner --no-privileges -U \"$POSTGRES_USER\" --dbname \"$VERIFY_DB\" \"$BACKUP_FILE\" >>\"$log\" 2>&1 && psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$VERIFY_DB\" -c \"SELECT 1\" >>\"$log\" 2>&1; then printf \"event=restore_verify_completed\\n\" >> \"$log\"; else printf \"event=restore_verify_failed\\n\" >> \"$log\"; exit 1; fi"]
}')"
if ! VERIFY_EXEC_ID="$(start_postgres_exec "$VERIFY_PAYLOAD" 'PostgreSQL backup restore verification' 300)"; then
  exit 1
fi

METADATA_PAYLOAD="$(jq -n --arg file "$BACKUP_PATH" --arg release "$ADOPS_IMAGE_TAG" --arg backup_exec "$BACKUP_EXEC_ID" --arg verify_exec "$VERIFY_EXEC_ID" --arg previous_image "$PREVIOUS_IMAGE_TAG" --arg previous_release "$PREVIOUS_RELEASE_SHA" --arg previous_drive "$PREVIOUS_DRIVE_MODE" --arg previous_app "$PREVIOUS_APP_VOLUME" --arg previous_web "$PREVIOUS_WEB_VOLUME" '{
  AttachStdout:true, AttachStderr:true, Tty:false,
  Env:["BACKUP_FILE=" + $file, "BACKUP_RELEASE=" + $release, "BACKUP_EXEC_ID=" + $backup_exec, "VERIFY_EXEC_ID=" + $verify_exec, "PREVIOUS_IMAGE=" + $previous_image, "PREVIOUS_RELEASE=" + $previous_release, "PREVIOUS_DRIVE=" + $previous_drive, "PREVIOUS_APP=" + $previous_app, "PREVIOUS_WEB=" + $previous_web],
  Cmd:["sh","-lc","set -eu; umask 077; metadata=\"$BACKUP_FILE.metadata\"; { printf \"backup_file=%s\\n\" \"$BACKUP_FILE\"; printf \"backup_format=custom\\n\"; printf \"release=%s\\n\" \"$BACKUP_RELEASE\"; printf \"backup_exec_id=%s\\n\" \"$BACKUP_EXEC_ID\"; printf \"restore_verify_exec_id=%s\\n\" \"$VERIFY_EXEC_ID\"; printf \"restore_verified=true\\n\"; printf \"previous_image_tag=%s\\n\" \"$PREVIOUS_IMAGE\"; printf \"previous_release_sha=%s\\n\" \"$PREVIOUS_RELEASE\"; printf \"previous_drive_mode=%s\\n\" \"$PREVIOUS_DRIVE\"; printf \"previous_app_volume=%s\\n\" \"$PREVIOUS_APP\"; printf \"previous_web_volume=%s\\n\" \"$PREVIOUS_WEB\"; printf \"created_at=%s\\n\" \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"; } > \"$metadata\""]
}')"
if ! start_postgres_exec "$METADATA_PAYLOAD" 'PostgreSQL backup metadata' >/dev/null; then
  exit 1
fi

persist_rollback_result() {
  local status="$1"
  local containers postgres_id payload
  case "$status" in
    completed|deploy_failed|readback_failed) ;;
    *) return 1 ;;
  esac

  containers="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")" || return 1
  postgres_id="$(jq -r '.[] | select(.Names[]? == "/adops-postgres") | .Id' <<<"$containers" | head -n 1)"
  [[ -n "$postgres_id" ]] || return 1
  payload="$(jq -n --arg file "$BACKUP_PATH" --arg status "$status" --arg release "$PREVIOUS_RELEASE_SHA" '{
    AttachStdout:true, AttachStderr:true, Tty:false,
    Env:["BACKUP_FILE=" + $file, "ROLLBACK_STATUS=" + $status, "ROLLBACK_RELEASE=" + $release],
    Cmd:["sh","-lc","set -eu; umask 077; created_at=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"; { printf \"event=rollback_result\\n\"; printf \"status=%s\\n\" \"$ROLLBACK_STATUS\"; printf \"release_sha=%s\\n\" \"$ROLLBACK_RELEASE\"; printf \"created_at=%s\\n\" \"$created_at\"; } > \"$BACKUP_FILE.rollback.log\"; { printf \"rollback_status=%s\\n\" \"$ROLLBACK_STATUS\"; printf \"rollback_checked_at=%s\\n\" \"$created_at\"; } >> \"$BACKUP_FILE.metadata\""]
  }')" || return 1
  POSTGRES_ID="$postgres_id" start_postgres_exec "$payload" 'PostgreSQL rollback metadata' 60 >/dev/null
}

perform_verified_rollback() {
  local output status="deploy_failed"
  local deploy_returned="false"
  output="$(mktemp)"
  chmod 600 "$output"

  if COMPOSE_FILE="$STACK_DIR/docker-compose.volume.yml" \
    bash "$SCRIPT_DIR/deploy-stack.sh" "$ROLLBACK_ENV" >"$output" 2>&1; then
    deploy_returned="true"
  fi
  if portainer_wait_for_stack_release adops "$PREVIOUS_IMAGE_TAG" \
    "$PREVIOUS_APP_VOLUME" "$PREVIOUS_WEB_VOLUME" "$PREVIOUS_RELEASE_SHA" "$ROLLBACK_RELEASE_URL"; then
    status="completed"
  elif [[ "$deploy_returned" == "true" ]]; then
    status="readback_failed"
  fi
  rm -f "$output"

  if ! persist_rollback_result "$status"; then
    printf 'Rollback status=%s, but its durable metadata could not be persisted.\n' "$status" >&2
    return 1
  fi
  if [[ "$status" == "completed" ]]; then
    printf 'Rollback confirmado por stack, volumes e release público; metadata persistida.\n' >&2
    return 0
  fi
  printf 'Rollback não confirmado; status=%s foi persistido para auditoria.\n' "$status" >&2
  return 1
}

for MIGRATION_FILE in \
  "$STACK_DIR/migrations/2026-08-26-daily-print-alerts.sql" \
  "$STACK_DIR/migrations/2026-09-01-evidence-report-read-indexes.sql"; do
  [[ -f "$MIGRATION_FILE" ]] || { printf 'Migration ausente: %s\n' "$MIGRATION_FILE" >&2; exit 1; }
  MIGRATION_B64="$(base64 < "$MIGRATION_FILE" | tr -d '\n')"
  MIGRATION_PAYLOAD="$(jq -n --arg sql "$MIGRATION_B64" '{
    AttachStdout:true, AttachStderr:true, Tty:false,
    Cmd:["sh","-lc",("printf %s " + ($sql|@sh) + " | base64 -d | psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" \"$POSTGRES_DB\"")]
  }')"
  if ! start_postgres_exec "$MIGRATION_PAYLOAD" "PostgreSQL migration ${MIGRATION_FILE}" 300 >/dev/null; then
    printf 'PostgreSQL migration failed: %s\n' "$MIGRATION_FILE" >&2
    exit 1
  fi
done

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
grep -vE '^(ADOPS_IMAGE_TAG|ADOPS_RELEASE_SHA|DRIVE_INTEGRATION_MODE|ADOPS_APP_SOURCE_VOLUME|ADOPS_WEB_PUBLIC_VOLUME)=' "$STACK_ENV_FILE" > "$DEPLOY_ENV"
printf 'ADOPS_IMAGE_TAG=%s\nADOPS_RELEASE_SHA=%s\nDRIVE_INTEGRATION_MODE=%s\nADOPS_APP_SOURCE_VOLUME=%s\nADOPS_WEB_PUBLIC_VOLUME=%s\n' \
  "$ADOPS_IMAGE_TAG" "$ADOPS_RELEASE_SHA" "${DRIVE_INTEGRATION_MODE:-$PREVIOUS_DRIVE_MODE}" "$ADOPS_APP_SOURCE_VOLUME" "$ADOPS_WEB_PUBLIC_VOLUME" >> "$DEPLOY_ENV"
chmod 600 "$DEPLOY_ENV"

ROLLBACK_ENV="$(mktemp)"
grep -vE '^(ADOPS_IMAGE_TAG|ADOPS_RELEASE_SHA|DRIVE_INTEGRATION_MODE|ADOPS_APP_SOURCE_VOLUME|ADOPS_WEB_PUBLIC_VOLUME)=' "$STACK_ENV_FILE" > "$ROLLBACK_ENV"
printf 'ADOPS_IMAGE_TAG=%s\nADOPS_RELEASE_SHA=%s\nDRIVE_INTEGRATION_MODE=%s\nADOPS_APP_SOURCE_VOLUME=%s\nADOPS_WEB_PUBLIC_VOLUME=%s\n' \
  "$PREVIOUS_IMAGE_TAG" "$PREVIOUS_RELEASE_SHA" "$PREVIOUS_DRIVE_MODE" "$PREVIOUS_APP_VOLUME" "$PREVIOUS_WEB_VOLUME" >> "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"
STACK_SWITCHED="true"
COMPOSE_FILE="$STACK_DIR/docker-compose.volume.yml" \
  bash "$SCRIPT_DIR/deploy-stack.sh" "$DEPLOY_ENV"

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
for container_name in adops-postgres adops-api adops-web adops-runner adops-runner-print-single adops-drive-pi-monitor-stack; do
  CONTAINER_ID="$(printf '%s' "$CONTAINERS" | jq -r --arg name "/$container_name" '.[]? | select(.Names[]? == $name) | .Id' | head -n 1)"
  CONTAINER_STATE="$(printf '%s' "$CONTAINERS" | jq -r --arg name "/$container_name" '.[]? | select(.Names[]? == $name) | .State' | head -n 1)"
  if [[ -n "$CONTAINER_ID" && "$CONTAINER_STATE" != "running" ]]; then
    portainer_start_container "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
done

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
if ! portainer_wait_for_stack_release adops "$ADOPS_IMAGE_TAG" \
  "$ADOPS_APP_SOURCE_VOLUME" "$ADOPS_WEB_PUBLIC_VOLUME" "$ADOPS_RELEASE_SHA" "$ROLLBACK_RELEASE_URL"; then
  printf 'Production stack environment, mounts, or release did not match the requested deployment.\n' >&2
  exit 1
fi

DEPLOY_COMPLETE="true"
printf 'AdOps deployed release=%s backup=%s runtime=volume app=%s web=%s\n' \
  "$ADOPS_RELEASE_SHA" "$BACKUP_NAME" "$ADOPS_APP_SOURCE_VOLUME" "$ADOPS_WEB_PUBLIC_VOLUME"
