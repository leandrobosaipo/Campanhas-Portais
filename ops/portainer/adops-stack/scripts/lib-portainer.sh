#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORTAINER_ENV="/Users/leandrobosaipo/Projetos/macmini/.env.portainer"

load_portainer_env() {
  local env_file="${PORTAINER_ENV_FILE:-$DEFAULT_PORTAINER_ENV}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  : "${PORTAINER_URL:?PORTAINER_URL is required}"
  : "${PORTAINER_API_KEY:?PORTAINER_API_KEY is required}"
  PORTAINER_URL="${PORTAINER_URL%/}"
  PORTAINER_API="${PORTAINER_URL}/api"
}

portainer_endpoint_id() {
  if [[ -n "${PORTAINER_ENDPOINT_ID:-}" ]]; then
    printf '%s\n' "$PORTAINER_ENDPOINT_ID"
    return
  fi

  portainer_get_json "${PORTAINER_API}/endpoints" \
    | jq -r '[.[] | select(.Status == 1)] | sort_by(.Id) | .[0].Id'
}

portainer_curl() {
  curl -fsS --connect-timeout "${PORTAINER_CONNECT_TIMEOUT_SECONDS:-12}" \
    --max-time "${PORTAINER_REQUEST_TIMEOUT_SECONDS:-90}" \
    -H "X-API-Key: ${PORTAINER_API_KEY}" "$@"
}

portainer_get_json() {
  local url="$1"
  local attempt body code
  body="$(mktemp)"
  for attempt in 1 2 3 4; do
    code="$(curl -sS -o "$body" -w '%{http_code}' \
      --connect-timeout "${PORTAINER_CONNECT_TIMEOUT_SECONDS:-12}" \
      --max-time "${PORTAINER_REQUEST_TIMEOUT_SECONDS:-90}" \
      -H "X-API-Key: ${PORTAINER_API_KEY}" "$url" || true)"
    if [[ "$code" =~ ^2 ]] && jq -e . "$body" >/dev/null 2>&1; then
      cat "$body"
      rm -f "$body"
      return 0
    fi
    sleep "$attempt"
  done
  printf 'Portainer GET did not return valid JSON: HTTP=%s url=%s\n' "$code" "$url" >&2
  sed -n '1,20p' "$body" >&2
  rm -f "$body"
  return 1
}

portainer_get_json_once() {
  local url="$1"
  local max_time_seconds="$2"
  local body code
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' \
    --connect-timeout "${PORTAINER_CONNECT_TIMEOUT_SECONDS:-12}" \
    --max-time "$max_time_seconds" \
    -H "X-API-Key: ${PORTAINER_API_KEY}" "$url" || true)"
  if [[ "$code" =~ ^2 ]] && jq -e . "$body" >/dev/null 2>&1; then
    cat "$body"
    rm -f "$body"
    return 0
  fi
  rm -f "$body"
  return 1
}

portainer_wait_for_exec() {
  local exec_id="$1"
  local description="$2"
  local deadline_seconds="${3:-${PORTAINER_EXEC_DEADLINE_SECONDS:-120}}"
  local poll_seconds="${PORTAINER_EXEC_POLL_SECONDS:-2}"
  local poll_request_timeout="${PORTAINER_EXEC_POLL_REQUEST_TIMEOUT_SECONDS:-5}"
  local final_request_timeout="${PORTAINER_EXEC_FINAL_READ_TIMEOUT_SECONDS:-5}"
  local started_at="$SECONDS"
  local state running exit_code elapsed remaining request_timeout sleep_seconds

  if [[ ! "$deadline_seconds" =~ ^[1-9][0-9]*$ || ! "$poll_seconds" =~ ^[0-9]+$ || \
    ! "$poll_request_timeout" =~ ^[1-9][0-9]*$ || ! "$final_request_timeout" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s exec polling limits must be integer seconds.\n' "$description" >&2
    return 1
  fi

  while (( SECONDS - started_at < deadline_seconds )); do
    elapsed=$((SECONDS - started_at))
    remaining=$((deadline_seconds - elapsed))
    request_timeout="$poll_request_timeout"
    (( request_timeout > remaining )) && request_timeout="$remaining"

    if state="$(portainer_get_json_once "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" "$request_timeout")"; then
      running="$(jq -r 'if has("Running") then .Running else true end' <<<"$state")"
      exit_code="$(jq -r '.ExitCode // empty' <<<"$state")"

      if [[ "$running" == "false" && -n "$exit_code" ]]; then
        [[ "$exit_code" == "0" ]] || {
          printf '%s exec failed with exit code %s.\n' "$description" "$exit_code" >&2
          return 1
        }
        return 0
      fi
    fi
    elapsed=$((SECONDS - started_at))
    remaining=$((deadline_seconds - elapsed))
    (( remaining <= 0 )) && break
    sleep_seconds="$poll_seconds"
    (( sleep_seconds > remaining )) && sleep_seconds="$remaining"
    sleep "$sleep_seconds"
  done

  if state="$(portainer_get_json_once "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" "$final_request_timeout")"; then
    running="$(jq -r 'if has("Running") then .Running else true end' <<<"$state")"
    exit_code="$(jq -r '.ExitCode // empty' <<<"$state")"
    if [[ "$running" == "false" && -n "$exit_code" ]]; then
      [[ "$exit_code" == "0" ]] || {
        printf '%s exec failed with exit code %s.\n' "$description" "$exit_code" >&2
        return 1
      }
      return 0
    fi
  fi
  printf '%s exec exceeded deadline (%ss); last state must be Running=false with ExitCode=0.\n' \
    "$description" "$deadline_seconds" >&2
  return 1
}

portainer_run_detached_exec() {
  local container_id="$1"
  local payload="$2"
  local description="$3"
  local deadline_seconds="${4:-${PORTAINER_EXEC_DEADLINE_SECONDS:-120}}"
  local response exec_id

  if ! response="$(portainer_curl -X POST -H 'Content-Type: application/json' -d "$payload" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec")"; then
    printf '%s exec could not be created.\n' "$description" >&2
    return 1
  fi
  if ! exec_id="$(jq -er '.Id | select(type == "string" and length > 0)' <<<"$response")"; then
    printf '%s exec response did not contain an id.\n' "$description" >&2
    return 1
  fi
  if ! portainer_curl -X POST -H 'Content-Type: application/json' -d '{"Detach":true,"Tty":false}' \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" >/dev/null; then
    printf '%s exec could not be started.\n' "$description" >&2
    return 1
  fi
  if ! portainer_wait_for_exec "$exec_id" "$description" "$deadline_seconds"; then
    return 1
  fi
  printf '%s\n' "$exec_id"
}

portainer_get_public_json() {
  local url="$1"
  curl -fsS --connect-timeout 10 --max-time 20 "$url" | jq -e .
}

portainer_stack_release_matches() {
  local stack_name="$1"
  local expected_image="$2"
  local expected_app_volume="$3"
  local expected_web_volume="$4"
  local expected_release_sha="$5"
  local release_url="$6"
  local stacks stack_id stack release containers

  stacks="$(portainer_get_json "${PORTAINER_API}/stacks")" || return 1
  stack_id="$(jq -r --arg name "$stack_name" '.[] | select(.Name == $name) | .Id' <<<"$stacks" | head -n 1)"
  [[ -n "$stack_id" ]] || return 1
  stack="$(portainer_get_json "${PORTAINER_API}/stacks/${stack_id}")" || return 1
  containers="$(portainer_get_json "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")" || return 1
  release="$(portainer_get_public_json "$release_url")" || return 1

  jq -e \
    --arg image "$expected_image" \
    --arg release "$expected_release_sha" \
    --arg app "$expected_app_volume" \
    --arg web "$expected_web_volume" '
      (.Env // [] | map({key: .name, value: .value}) | from_entries) as $env
      | $env.ADOPS_IMAGE_TAG == $image
      and $env.ADOPS_RELEASE_SHA == $release
      and $env.ADOPS_APP_SOURCE_VOLUME == $app
      and $env.ADOPS_WEB_PUBLIC_VOLUME == $web
    ' <<<"$stack" >/dev/null || return 1
  jq -e \
    --arg app "$expected_app_volume" \
    --arg web "$expected_web_volume" '
      def has_mount($name; $destination; $volume):
        any(.[];
          any(.Names[]?; . == ("/" + $name))
          and any(.Mounts[]?; .Destination == $destination and .Name == $volume)
        );
      has_mount("adops-api"; "/app"; $app)
      and has_mount("adops-runner"; "/app"; $app)
      and has_mount("adops-runner-print-single"; "/app"; $app)
      and has_mount("adops-drive-pi-monitor-stack"; "/app"; $app)
      and has_mount("adops-web"; "/usr/share/nginx/html"; $web)
    ' <<<"$containers" >/dev/null || return 1
  jq -e \
    --arg sha "$expected_release_sha" \
    --arg app "$expected_app_volume" \
    --arg web "$expected_web_volume" '
      .sha == $sha and .volumes.app == $app and .volumes.web == $web
    ' <<<"$release" >/dev/null
}

portainer_wait_for_stack_release() {
  local stack_name="$1"
  local expected_image="$2"
  local expected_app_volume="$3"
  local expected_web_volume="$4"
  local expected_release_sha="$5"
  local release_url="$6"
  local attempts="${7:-${PORTAINER_STACK_READBACK_ATTEMPTS:-60}}"
  local poll_seconds="${PORTAINER_STACK_READBACK_POLL_SECONDS:-5}"
  local attempt

  for attempt in $(seq 1 "$attempts"); do
    if portainer_stack_release_matches "$stack_name" "$expected_image" \
      "$expected_app_volume" "$expected_web_volume" "$expected_release_sha" "$release_url"; then
      return 0
    fi
    [[ "$attempt" == "$attempts" ]] || sleep "$poll_seconds"
  done
  return 1
}
