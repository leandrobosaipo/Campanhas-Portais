#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"
IMAGE_TAG="${ADOPS_IMAGE_TAG:-$(date +%Y%m%d-%H%M)}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://adops-api.codigo5.com.br}"
CONTEXT_TAR="${TMPDIR:-/tmp}/adops-portainer-build-${IMAGE_TAG}.tar"

printf 'Building AdOps images on Portainer endpoint %s with tag %s\n' "$ENDPOINT_ID" "$IMAGE_TAG"
printf 'VITE_API_BASE_URL=%s\n' "$VITE_API_BASE_URL"

COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.wrangler' \
  --exclude 'tmp' \
  --exclude 'tmp-playwright' \
  --exclude 'test-results' \
  --exclude 'docs/harness-reports' \
  -C "$REPO_ROOT" \
  -cf "$CONTEXT_TAR" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json .npmrc \
  lib artifacts scripts config ops attached_assets

build_target() {
  local target="$1"
  local tag="$2"
  local buildargs
  buildargs="$(jq -cn --arg vite_api_base_url "$VITE_API_BASE_URL" '{VITE_API_BASE_URL:$vite_api_base_url}' | jq -sRr @uri)"
  local url="${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/build?t=${tag}&dockerfile=ops/portainer/adops-stack/Dockerfile.portainer&target=${target}&buildargs=${buildargs}"
  local body
  body="$(mktemp)"
  local code
  code="$(curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/x-tar" \
    --data-binary "@${CONTEXT_TAR}" \
    "$url" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Docker build failed for target=%s tag=%s HTTP=%s\n' "$target" "$tag" "$code" >&2
    sed -n '1,120p' "$body" >&2
    rm -f "$body"
    exit 1
  fi
  tail -n 40 "$body"
  rm -f "$body"
}

build_target runtime "cod5/adops-runtime:${IMAGE_TAG}"
build_target web "cod5/adops-web:${IMAGE_TAG}"

printf '\nBuild complete.\n'
printf 'Use ADOPS_IMAGE_TAG=%s in the private stack env file.\n' "$IMAGE_TAG"
