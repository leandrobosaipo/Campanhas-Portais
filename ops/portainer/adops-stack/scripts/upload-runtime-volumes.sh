#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"
STAMP="$(date +%Y%m%d-%H%M%S)"
APP_TAR="${TMPDIR:-/tmp}/adops-app-source-${STAMP}.tar"
WEB_TAR="${TMPDIR:-/tmp}/adops-web-public-${STAMP}.tar"
RELEASE_DIR="$(mktemp -d)"
RELEASE_FILE="$RELEASE_DIR/cod5-release.json"
RELEASE_SUFFIX="$(printf '%s' "${ADOPS_RELEASE_SHA:-unknown}" | tr -cd 'a-zA-Z0-9' | cut -c1-12)"
APP_VOLUME="${ADOPS_APP_SOURCE_VOLUME:-adops_app_source_${RELEASE_SUFFIX:-unknown}}"
WEB_VOLUME="${ADOPS_WEB_PUBLIC_VOLUME:-adops_web_public_${RELEASE_SUFFIX:-unknown}}"

cleanup() {
  rm -f "$APP_TAR" "$WEB_TAR"
  rm -rf "$RELEASE_DIR"
}
trap cleanup EXIT

jq -n \
  --arg sha "${ADOPS_RELEASE_SHA:-unknown}" \
  --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg appVolume "$APP_VOLUME" \
  --arg webVolume "$WEB_VOLUME" \
  '{sha:$sha,builtAt:$builtAt,runtime:"portainer-volume",volumes:{app:$appVolume,web:$webVolume}}' > "$RELEASE_FILE"

upload_to_volume() {
  local volume="$1"
  local image="$2"
  local mount_path="$3"
  local tar_path="$4"
  local prepare_command="${5:-}"
  local verify_command="${6:-}"
  local container_name="adops-volume-upload-${volume}"
  local body code container_id
  body="$(mktemp)"
  container_id="$(portainer_get_json "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
    | jq -r --arg name "/${container_name}" '.[] | select(.Names[]? == $name) | .Id' | head -n 1)"
  if [[ -z "$container_id" ]]; then
    code="$(curl -sS -o "$body" -w '%{http_code}' --connect-timeout 12 --max-time 90 \
      -X POST \
      -H "X-API-Key: ${PORTAINER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg image "$image" --arg volume "$volume" --arg target "$mount_path" '{
        Image: $image,
        Cmd: ["sh", "-lc", "sleep 900"],
        HostConfig: { Binds: [($volume + ":" + $target)] }
      }')" \
      "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/create?name=${container_name}" || true)"
    if [[ "$code" =~ ^2 ]] && jq -e '.Id | strings | length > 0' "$body" >/dev/null 2>&1; then
      container_id="$(jq -r '.Id' "$body")"
    else
      printf 'Container create returned HTTP=%s; reconciling by deterministic name.\n' "$code" >&2
      container_id="$(portainer_get_json "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true" \
        | jq -r --arg name "/${container_name}" '.[] | select(.Names[]? == $name) | .Id' | head -n 1)"
    fi
  fi
  if [[ -z "$container_id" ]]; then
    printf 'Container create failed for volume=%s HTTP=%s\n' "$volume" "$code" >&2
    sed -n '1,60p' "$body" >&2
    rm -f "$body"
    exit 1
  fi
  rm -f "$body"

  curl -sS --connect-timeout 12 --max-time 90 -X POST -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start" >/dev/null || true

  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 180 \
    -X PUT \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/x-tar" \
    -H "Expect:" \
    --data-binary "@${tar_path}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/archive?path=${mount_path}" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Archive upload failed for volume=%s HTTP=%s\n' "$volume" "$code" >&2
    sed -n '1,60p' "$body" >&2
    curl -sS -X DELETE -H "X-API-Key: ${PORTAINER_API_KEY}" "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}?force=true" >/dev/null || true
    rm -f "$body"
    exit 1
  fi
  rm -f "$body"

  run_in_upload_container() {
    local command="$1"
    local exec_id exit_code
    exec_id="$(curl -fsS --max-time 30 \
      -X POST \
      -H "X-API-Key: ${PORTAINER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg command "$command" --arg workingDir "$mount_path" '{AttachStdout:true,AttachStderr:true,Tty:false,WorkingDir:$workingDir,Cmd:["sh","-lc",$command]}')" \
      "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" | jq -r '.Id')"
    curl -fsS --max-time 300 \
      -X POST \
      -H "X-API-Key: ${PORTAINER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"Detach":false,"Tty":false}' \
      "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" >/dev/null
    exit_code="$(curl -fsS --max-time 30 -H "X-API-Key: ${PORTAINER_API_KEY}" \
      "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" | jq -r '.ExitCode')"
    [[ "$exit_code" == "0" ]] || { printf 'Upload container command failed for volume=%s.\n' "$volume" >&2; return 1; }
  }

  if [[ -n "$prepare_command" ]]; then
    run_in_upload_container "$prepare_command"
  fi
  if [[ -n "$verify_command" ]]; then
    run_in_upload_container "$verify_command"
  fi

  curl -sS -X DELETE -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}?force=true" >/dev/null || true
  printf 'Uploaded %s into volume %s\n' "$tar_path" "$volume"
}

if [[ "${ADOPS_SKIP_LOCAL_BUILD:-false}" == "true" ]]; then
  printf 'Skipping local build because ADOPS_SKIP_LOCAL_BUILD=true\n'
  test -f "$REPO_ROOT/artifacts/api-server/dist/index.mjs" || {
    printf 'Missing artifacts/api-server/dist/index.mjs. Run API build before skipping.\n' >&2
    exit 1
  }
  test -d "$REPO_ROOT/artifacts/adops/dist/public" || {
    printf 'Missing artifacts/adops/dist/public. Run web build before skipping.\n' >&2
    exit 1
  }
else
  printf 'Building API and web bundles locally for volume upload\n'
  pnpm --filter @workspace/api-server run build >/dev/null
  VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://adops-api.codigo5.com.br}" pnpm --filter @workspace/adops run build >/dev/null
fi

printf 'Creating clean app source tar\n'
COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.wrangler' \
  --exclude 'tmp' \
  --exclude 'tmp-playwright' \
  --exclude 'test-results' \
  --exclude 'docs/harness-reports' \
  -C "$REPO_ROOT" \
  -cf "$APP_TAR" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json .npmrc \
  lib artifacts scripts config ops attached_assets
tar --no-xattrs -C "$RELEASE_DIR" -rf "$APP_TAR" cod5-release.json

printf 'Creating clean web dist tar\n'
COPYFILE_DISABLE=1 tar --no-xattrs -C "$REPO_ROOT/artifacts/adops/dist/public" -cf "$WEB_TAR" .
tar --no-xattrs -C "$RELEASE_DIR" -rf "$WEB_TAR" cod5-release.json

upload_to_volume "$APP_VOLUME" mcr.microsoft.com/playwright:v1.59.1-noble /app "$APP_TAR" \
  'corepack enable && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile' \
  'test -s /app/cod5-release.json && test -s /app/artifacts/api-server/dist/index.mjs && test -d /app/node_modules'
upload_to_volume "$WEB_VOLUME" nginx:1.27-alpine /usr/share/nginx/html "$WEB_TAR" "" \
  'test -s /usr/share/nginx/html/cod5-release.json && test -s /usr/share/nginx/html/index.html'

printf 'Runtime volumes are ready on endpoint %s app=%s web=%s\n' "$ENDPOINT_ID" "$APP_VOLUME" "$WEB_VOLUME"
