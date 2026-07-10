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

cleanup() {
  rm -f "$APP_TAR" "$WEB_TAR"
  rm -rf "$RELEASE_DIR"
}
trap cleanup EXIT

jq -n \
  --arg sha "${ADOPS_RELEASE_SHA:-unknown}" \
  --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{sha:$sha,builtAt:$builtAt,runtime:"portainer-volume"}' > "$RELEASE_FILE"

upload_to_volume() {
  local volume="$1"
  local image="$2"
  local mount_path="$3"
  local tar_path="$4"
  local container_name="adops-volume-upload-${volume}-${STAMP}"
  local body code container_id
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$container_name" --arg image "$image" --arg volume "$volume" --arg target "$mount_path" '{
      Image: $image,
      Cmd: ["sh", "-lc", "sleep 300"],
      HostConfig: {
        Binds: [($volume + ":" + $target)]
      }
    }')" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/create?name=${container_name}" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Container create failed for volume=%s HTTP=%s\n' "$volume" "$code" >&2
    sed -n '1,60p' "$body" >&2
    rm -f "$body"
    exit 1
  fi
  container_id="$(jq -r '.Id' "$body")"
  rm -f "$body"

  curl -sS --max-time 30 -X POST -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start" >/dev/null

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

upload_to_volume adops_app_source node:22-alpine /app "$APP_TAR"
upload_to_volume adops_web_public nginx:1.27-alpine /usr/share/nginx/html "$WEB_TAR"

printf 'Runtime volumes are ready on endpoint %s\n' "$ENDPOINT_ID"
