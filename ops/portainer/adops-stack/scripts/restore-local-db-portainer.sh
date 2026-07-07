#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"
ENV_FILE="${1:-${ADOPS_STACK_ENV_FILE:-}}"
SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-postgresql:///campanhas_portais_local}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_PATH="${TMPDIR:-/tmp}/adops-local-source-${STAMP}.sql"

if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  printf 'Usage: ADOPS_STACK_ENV_FILE=/secure/path/adops.env %s\n' "$0" >&2
  exit 1
fi

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"
load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${ADOPS_POSTGRES_USER:?ADOPS_POSTGRES_USER is required}"
: "${ADOPS_POSTGRES_PASSWORD:?ADOPS_POSTGRES_PASSWORD is required}"
: "${ADOPS_POSTGRES_DB:?ADOPS_POSTGRES_DB is required}"

TARGET_DATABASE_URL="postgresql://${ADOPS_POSTGRES_USER}:${ADOPS_POSTGRES_PASSWORD}@adops-postgres:5432/${ADOPS_POSTGRES_DB}"

printf 'Creating local dump from %s\n' "$SOURCE_DATABASE_URL"
pg_dump --format=plain --clean --if-exists --no-owner --no-privileges --file "$DUMP_PATH" "$SOURCE_DATABASE_URL"
perl -0pi -e 's/^SET transaction_timeout = 0;\n//m' "$DUMP_PATH"

container_name="adops-db-restore-${STAMP}"
body="$(mktemp)"
code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg name "$container_name" '{
    Image: "postgres:16-alpine",
    Cmd: ["sh", "-lc", "sleep 600"],
    HostConfig: { NetworkMode: "adops_internal" }
  }')" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/create?name=${container_name}" || true)"
if [[ ! "$code" =~ ^2 ]]; then
  printf 'Restore helper create failed HTTP=%s\n' "$code" >&2
  sed -n '1,80p' "$body" >&2
  rm -f "$body" "$DUMP_PATH"
  exit 1
fi
container_id="$(jq -r '.Id' "$body")"
rm -f "$body"

cleanup() {
  curl -sS -X DELETE -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}?force=true" >/dev/null || true
  rm -f "$DUMP_PATH"
}
trap cleanup EXIT

curl -sS --max-time 30 -X POST -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start" >/dev/null

code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 180 \
  -X PUT \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/x-tar" \
  -H "Expect:" \
  --data-binary "@$(COPYFILE_DISABLE=1 tar --no-xattrs -C "$(dirname "$DUMP_PATH")" -cf "${DUMP_PATH}.tar" "$(basename "$DUMP_PATH")"; printf '%s.tar' "$DUMP_PATH")" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/archive?path=/tmp" || true)"
rm -f "${DUMP_PATH}.tar"
if [[ ! "$code" =~ ^2 ]]; then
  printf 'Dump upload failed HTTP=%s\n' "$code" >&2
  sed -n '1,80p' "$body" >&2
  rm -f "$body"
  exit 1
fi
rm -f "$body"

exec_payload="$(jq -n --arg db "$TARGET_DATABASE_URL" --arg dump "/tmp/$(basename "$DUMP_PATH")" '{
  AttachStdout: true,
  AttachStderr: true,
  Tty: false,
  Cmd: ["sh", "-lc", "psql -v ON_ERROR_STOP=1 \"$TARGET_DATABASE_URL\" -f \"$DUMP_FILE\""],
  Env: [("TARGET_DATABASE_URL=" + $db), ("DUMP_FILE=" + $dump)]
}')"
exec_id="$(curl -sS --max-time 30 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$exec_payload" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" | jq -r '.Id')"
curl -sS --max-time 300 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"Detach": false, "Tty": false}' \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" | strings
restore_exit_code="$(curl -sS --max-time 30 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" | jq -r '.ExitCode')"
if [[ "$restore_exit_code" != "0" ]]; then
  printf 'Database restore failed with exit code %s\n' "$restore_exit_code" >&2
  exit 1
fi

printf 'Running schema push in adops-api container\n'
api_container_id="$(curl -sS --max-time 20 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
  | jq -r '.[] | select(.Names[]? == "/adops-api") | .Id' | head -n 1)"
api_exec_payload="$(jq -n '{
  AttachStdout: true,
  AttachStderr: true,
  Tty: false,
  Cmd: ["sh", "-lc", "corepack enable >/dev/null 2>&1 || true; corepack prepare pnpm@10.14.0 --activate >/dev/null; pnpm --filter @workspace/db run push-force"]
}')"
api_exec_id="$(curl -sS --max-time 30 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$api_exec_payload" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${api_container_id}/exec" | jq -r '.Id')"
curl -sS --max-time 300 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"Detach": false, "Tty": false}' \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${api_exec_id}/start" | strings
schema_exit_code="$(curl -sS --max-time 30 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${api_exec_id}/json" | jq -r '.ExitCode')"
if [[ "$schema_exit_code" != "0" ]]; then
  printf 'Schema push failed with exit code %s\n' "$schema_exit_code" >&2
  exit 1
fi

printf 'Restore and schema push finished.\n'
