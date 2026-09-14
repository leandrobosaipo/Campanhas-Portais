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
mock_timeouts_file="$(mktemp)"
trap 'rm -f "$mock_calls_file" "$mock_timeouts_file"' EXIT

portainer_get_json() {
  local url="$1"
  local mock_calls
  mock_calls="$(<"$mock_calls_file")"
  mock_calls=$((mock_calls + 1))
  printf '%s' "$mock_calls" > "$mock_calls_file"
  case "$mock_mode" in
    success)
      [[ "$mock_calls" == "1" ]] && printf '%s\n' '{"Running":true}' || printf '%s\n' '{"Running":false,"ExitCode":0}'
      ;;
    deadline_success)
      [[ "$mock_calls" == "1" ]] && printf '%s\n' '{"Running":true}' || printf '%s\n' '{"Running":false,"ExitCode":0}'
      ;;
    failed) printf '%s\n' '{"Running":false,"ExitCode":7}' ;;
    state_failed) return 97 ;;
    timeout) printf '%s\n' '{"Running":true}' ;;
    budget) printf '%s\n' '{"Running":true}' ;;
    rollback_success|rollback_failure|rollback_mount_failure|rollback_env_failure)
      case "$url" in
        */stacks) printf '%s\n' '[{"Name":"adops","Id":7}]' ;;
        */stacks/7)
          if [[ "$mock_mode" == "rollback_env_failure" ]]; then
            printf '%s\n' '{"Env":[{"name":"ADOPS_IMAGE_TAG","value":"wrong-image"},{"name":"ADOPS_RELEASE_SHA","value":"old-release"},{"name":"ADOPS_APP_SOURCE_VOLUME","value":"old-app"},{"name":"ADOPS_WEB_PUBLIC_VOLUME","value":"old-web"}]}'
          else
            printf '%s\n' '{"Env":[{"name":"ADOPS_IMAGE_TAG","value":"old-image"},{"name":"ADOPS_RELEASE_SHA","value":"old-release"},{"name":"ADOPS_APP_SOURCE_VOLUME","value":"old-app"},{"name":"ADOPS_WEB_PUBLIC_VOLUME","value":"old-web"}]}'
          fi
          ;;
        */containers/json?all=true)
          if [[ "$mock_mode" == "rollback_mount_failure" ]]; then
            printf '%s\n' '[{"Names":["/adops-api"],"Mounts":[{"Name":"wrong-app","Destination":"/app"}]},{"Names":["/adops-runner"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-runner-print-single"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-drive-pi-monitor-stack"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-web"],"Mounts":[{"Name":"old-web","Destination":"/usr/share/nginx/html"}]}]'
          else
            printf '%s\n' '[{"Names":["/adops-api"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-runner"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-runner-print-single"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-drive-pi-monitor-stack"],"Mounts":[{"Name":"old-app","Destination":"/app"}]},{"Names":["/adops-web"],"Mounts":[{"Name":"old-web","Destination":"/usr/share/nginx/html"}]}]'
          fi
          ;;
        *) return 98 ;;
      esac
      ;;
    *) return 99 ;;
  esac
}

portainer_get_json_once() {
  local url="$1"
  local max_time_seconds="$2"
  printf '%s\n' "$max_time_seconds" >> "$mock_timeouts_file"
  portainer_get_json "$url"
}

portainer_get_public_json() {
  if [[ "$mock_mode" == "rollback_success" || "$mock_mode" == "rollback_mount_failure" || "$mock_mode" == "rollback_env_failure" ]]; then
    printf '%s\n' '{"sha":"old-release","volumes":{"app":"old-app","web":"old-web"}}'
  else
    printf '%s\n' '{"sha":"old-release","volumes":{"app":"old-app","web":"wrong-web"}}'
  fi
}

portainer_curl() {
  local url="${*: -1}"
  if [[ "$mock_mode" == "exec_create_failed" && "$url" == */containers/*/exec ]]; then
    return 1
  fi
  if [[ "$mock_mode" == "exec_start_failed" && "$url" == */exec/*/start ]]; then
    return 1
  fi
  if [[ "$url" == */containers/*/exec ]]; then
    printf '%s\n' '{"Id":"mock-exec"}'
  fi
}

sleep() { SECONDS=$((SECONDS + 1)); }

mock_mode=success
printf '0' > "$mock_calls_file"
portainer_wait_for_exec exec-success 'success test' 3

mock_mode=deadline_success
printf '0' > "$mock_calls_file"
portainer_wait_for_exec exec-deadline-success 'deadline success test' 1

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

mock_mode=state_failed
printf '0' > "$mock_calls_file"
if portainer_wait_for_exec exec-state-failed 'state failure test' 2; then
  printf 'Expected unreadable exec state to be rejected.\n' >&2
  exit 1
fi

mock_mode=budget
printf '0' > "$mock_calls_file"
: > "$mock_timeouts_file"
PORTAINER_EXEC_POLL_SECONDS=1
PORTAINER_EXEC_POLL_REQUEST_TIMEOUT_SECONDS=5
PORTAINER_EXEC_FINAL_READ_TIMEOUT_SECONDS=2
if portainer_wait_for_exec exec-budget 'budget test' 3; then
  printf 'Expected budget test to time out.\n' >&2
  exit 1
fi
[[ "$(<"$mock_timeouts_file")" == $'3\n2\n1\n2' ]] || {
  printf 'Exec polling exceeded its request budget: %s\n' "$(tr '\n' ',' < "$mock_timeouts_file")" >&2
  exit 1
}
PORTAINER_EXEC_POLL_SECONDS=0
unset PORTAINER_EXEC_POLL_REQUEST_TIMEOUT_SECONDS PORTAINER_EXEC_FINAL_READ_TIMEOUT_SECONDS

mock_mode=failed
printf '0' > "$mock_calls_file"
if captured="$(portainer_run_detached_exec container-id '{}' 'command substitution failure test' 3)"; then
  printf 'Expected detached exec failure to survive command substitution.\n' >&2
  exit 1
fi
[[ -z "$captured" ]]

mock_mode=exec_create_failed
if portainer_run_detached_exec container-id '{}' 'create failure test' 3 >/dev/null; then
  printf 'Expected exec creation failure to be rejected.\n' >&2
  exit 1
fi

mock_mode=exec_start_failed
if portainer_run_detached_exec container-id '{}' 'start failure test' 3 >/dev/null; then
  printf 'Expected exec start failure to be rejected.\n' >&2
  exit 1
fi

mock_mode=rollback_success
portainer_wait_for_stack_release adops old-image old-app old-web old-release https://release.test 1

mock_mode=rollback_failure
if portainer_wait_for_stack_release adops old-image old-app old-web old-release https://release.test 1; then
  printf 'Expected mismatched rollback readback to be rejected.\n' >&2
  exit 1
fi

mock_mode=rollback_mount_failure
if portainer_wait_for_stack_release adops old-image old-app old-web old-release https://release.test 1; then
  printf 'Expected mismatched rollback mount to be rejected.\n' >&2
  exit 1
fi

mock_mode=rollback_env_failure
if portainer_wait_for_stack_release adops old-image old-app old-web old-release https://release.test 1; then
  printf 'Expected mismatched rollback environment to be rejected.\n' >&2
  exit 1
fi

rg -q -- '--format=custom' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'PostgreSQL backup restore verification' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'BACKUP_FILE.verify.log' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'Rollback confirmado por stack, volumes e release público' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'Production stack environment, mounts, or release did not match' "$SCRIPT_DIR/deploy-production.sh"
rg -q -- 'portainer_run_detached_exec' "$SCRIPT_DIR/upload-runtime-volumes.sh"
rg -q -- 'PORTAINER_UPLOAD_EXEC_DEADLINE_SECONDS' "$SCRIPT_DIR/upload-runtime-volumes.sh"
rg -Fq -- 'keeper_seconds=$((180 + exec_deadline + final_read_timeout + 120))' "$SCRIPT_DIR/upload-runtime-volumes.sh"
rg -q -- '.runtime-install.log' "$SCRIPT_DIR/upload-runtime-volumes.sh"
printf 'portainer exec checks passed\n'
