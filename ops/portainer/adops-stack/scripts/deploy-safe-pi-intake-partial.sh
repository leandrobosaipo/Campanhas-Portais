#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

SAFE_PI_COMMIT="${SAFE_PI_COMMIT:-36fc1da}"
STAMP="${STAMP:-$(date +%Y%m%d-%H%M%S)}"
VOLUME="${VOLUME:-adops_app_source}"
MOUNT_PATH="/app"
TMP_DIR="${TMPDIR:-/tmp}"
PATCH_TAR="${TMP_DIR}/adops-safe-pi-intake-${SAFE_PI_COMMIT}-${STAMP}.tar"
BACKUP_TAR="${TMP_DIR}/adops-safe-pi-intake-backup-${SAFE_PI_COMMIT}-${STAMP}.tar"
CONTAINER_NAME="adops-safe-pi-intake-upload-${STAMP}"

FILES=(
  "ops/cloudflare-remote-runner/src/runner.mjs"
  "ops/telegram-adapter/server.mjs"
  "ops/cloudflare-telegram-bot/src/index.ts"
  "scripts/src/harness-drive-pi-monitor-first-v4.mjs"
  "scripts/src/create-spm-whatsapp-print-intakes-2026-06-03.mjs"
  "scripts/package.json"
  "docs/adops/pi-automation-v4-monitor-first-ai-gate.md"
  "docs/adops/pi-automation-v3/runbook.md"
  "docs/adops/containerized-runner-runtime-fix-plan-2026-06-03.md"
  "docs/harness-reports/drive-pi-monitor-first-v4/2026-06-03T21-33-07-815Z/results.json"
  "docs/harness-reports/drive-pi-monitor-first-v4/2026-06-03T21-33-07-815Z/summary.md"
  "docs/harness-reports/pi-automation-v3/2026-06-03T21-33-18-249Z/results.json"
  "docs/harness-reports/pi-automation-v3/2026-06-03T21-33-18-249Z/summary.md"
)

body=""
container_id=""

cleanup() {
  if [[ -n "$container_id" ]]; then
    curl -sS -X DELETE -H "X-API-Key: ${PORTAINER_API_KEY}" \
      "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}?force=true" >/dev/null || true
  fi
  if [[ -n "$body" && -f "$body" ]]; then
    rm -f "$body"
  fi
  return 0
}
trap cleanup EXIT

require_commit_and_files() {
  git -C "$REPO_ROOT" rev-parse --verify "${SAFE_PI_COMMIT}^{commit}" >/dev/null
  for file in "${FILES[@]}"; do
    git -C "$REPO_ROOT" cat-file -e "${SAFE_PI_COMMIT}:${file}"
  done
}

create_patch_tar_from_commit() {
  COPYFILE_DISABLE=1 git -C "$REPO_ROOT" archive --format=tar --output="$PATCH_TAR" "$SAFE_PI_COMMIT" "${FILES[@]}"
  printf 'Patch tar created from commit %s: %s\n' "$SAFE_PI_COMMIT" "$PATCH_TAR"
}

create_temp_container() {
  body="$(mktemp)"
  local code
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$CONTAINER_NAME" --arg volume "$VOLUME" --arg target "$MOUNT_PATH" '{
      Image: "node:22-alpine",
      Cmd: ["sh", "-lc", "sleep 300"],
      HostConfig: {
        Binds: [($volume + ":" + $target)]
      }
    }')" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/create?name=${CONTAINER_NAME}" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Container create failed HTTP=%s\n' "$code" >&2
    sed -n '1,80p' "$body" >&2
    exit 1
  fi
  container_id="$(jq -r '.Id' "$body")"
  rm -f "$body"
  body=""

  curl -sS --max-time 30 -X POST -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start" >/dev/null
  printf 'Temporary container created: %s\n' "$CONTAINER_NAME"
}

backup_current_volume_paths() {
  local backup_script="${TMP_DIR}/adops-safe-pi-backup-${STAMP}.sh"
  {
    printf 'cd /app\n'
    printf 'mkdir -p /tmp/safe-pi-backup\n'
    printf ': > /tmp/safe-pi-backup/MANIFEST.txt\n'
    for file in "${FILES[@]}"; do
      printf 'if [ -e %q ]; then mkdir -p /tmp/safe-pi-backup/%q; cp -a %q /tmp/safe-pi-backup/%q; printf "present %s\\n" >> /tmp/safe-pi-backup/MANIFEST.txt; else printf "missing %s\\n" >> /tmp/safe-pi-backup/MANIFEST.txt; fi\n' \
        "$file" "$(dirname "$file")" "$file" "$file" "$file" "$file"
    done
    printf 'tar -cf /tmp/safe-pi-backup.tar -C /tmp/safe-pi-backup .\n'
  } > "$backup_script"

  local backup_cmd
  backup_cmd="$(cat "$backup_script")"
  body="$(mktemp)"
  local code exec_id
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg cmd "$backup_cmd" '{AttachStdout:true, AttachStderr:true, Cmd:["sh","-lc",$cmd]}')" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Backup exec create failed HTTP=%s\n' "$code" >&2
    sed -n '1,80p' "$body" >&2
    exit 1
  fi
  exec_id="$(jq -r '.Id' "$body")"
  rm -f "$body"
  body=""

  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 60 \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"Detach":false,"Tty":false}' \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Backup exec start failed HTTP=%s\n' "$code" >&2
    sed -n '1,80p' "$body" >&2
    exit 1
  fi
  rm -f "$body"
  body=""

  code="$(curl -sS -o "$BACKUP_TAR" -w '%{http_code}' --max-time 60 \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/archive?path=/tmp/safe-pi-backup.tar" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Backup archive download failed HTTP=%s\n' "$code" >&2
    sed -n '1,80p' "$BACKUP_TAR" >&2 || true
    exit 1
  fi
  printf 'Backup tar saved: %s\n' "$BACKUP_TAR"
}

upload_patch_tar() {
  body="$(mktemp)"
  local code
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 180 \
    -X PUT \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/x-tar" \
    -H "Expect:" \
    --data-binary "@${PATCH_TAR}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/archive?path=${MOUNT_PATH}" || true)"
  if [[ ! "$code" =~ ^2 ]]; then
    printf 'Patch upload failed HTTP=%s\n' "$code" >&2
    sed -n '1,80p' "$body" >&2
    exit 1
  fi
  rm -f "$body"
  body=""
  printf 'Patch uploaded to volume %s from commit %s\n' "$VOLUME" "$SAFE_PI_COMMIT"
}

main() {
  require_commit_and_files
  create_patch_tar_from_commit
  load_portainer_env
  ENDPOINT_ID="$(portainer_endpoint_id)"
  printf 'Portainer endpoint: %s\n' "$ENDPOINT_ID"
  create_temp_container
  backup_current_volume_paths
  upload_patch_tar
  printf '\nDone. Restart adops-runner and adops-telegram after validating this output.\n'
  printf 'Rollback source: %s\n' "$BACKUP_TAR"
}

main "$@"
