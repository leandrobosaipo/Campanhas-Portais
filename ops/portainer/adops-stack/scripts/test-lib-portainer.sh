#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

PORTAINER_API="https://portainer.test/api"
ENDPOINT_ID="1"
PORTAINER_EXEC_POLL_SECONDS=0
mock_mode=""
mock_calls_file="$(mktemp)"
trap 'rm -f "$mock_calls_file"' EXIT

portainer_curl() {
  local mock_calls
  mock_calls="$(<"$mock_calls_file")"
  mock_calls=$((mock_calls + 1))
  printf '%s' "$mock_calls" > "$mock_calls_file"
  case "$mock_mode" in
    success)
      [[ "$mock_calls" == "1" ]] && printf '%s\n' '{"Running":true}' || printf '%s\n' '{"Running":false,"ExitCode":0}'
      ;;
    failed) printf '%s\n' '{"Running":false,"ExitCode":7}' ;;
    timeout) printf '%s\n' '{"Running":true}' ;;
    *) return 99 ;;
  esac
}

sleep() { SECONDS=$((SECONDS + 1)); }

mock_mode=success
printf '0' > "$mock_calls_file"
portainer_wait_for_exec exec-success 'success test' 3

mock_mode=failed
printf '0' > "$mock_calls_file"
if portainer_wait_for_exec exec-failed 'failure test' 3; then
  printf 'Expected failed exec to be rejected.\n' >&2
  exit 1
fi

mock_mode=timeout
printf '0' > "$mock_calls_file"
if portainer_wait_for_exec exec-timeout 'timeout test' 2; then
  printf 'Expected running exec past its deadline to be rejected.\n' >&2
  exit 1
fi

rg -q -- '--format=custom' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'PostgreSQL backup restore verification' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- '"Detach":true' "$SCRIPT_DIR/upload-runtime-volumes.sh"
rg -q -- 'PORTAINER_UPLOAD_EXEC_DEADLINE_SECONDS' "$SCRIPT_DIR/upload-runtime-volumes.sh"
printf 'portainer exec checks passed\n'
