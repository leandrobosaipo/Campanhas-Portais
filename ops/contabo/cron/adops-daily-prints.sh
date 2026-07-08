#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/etc/easypanel/projects/codigo5/adops-campanhas-portais/code}"
RUNNER_ENV_FILE="${RUNNER_ENV_FILE:-/etc/easypanel/projects/codigo5/adops-campanhas-portais/adops-runner.env}"
API_ENV_FILE="${API_ENV_FILE:-/etc/easypanel/projects/codigo5/adops-campanhas-portais/adops-api.env}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-https://adops-api-public.leandro471.workers.dev}"
PRIVATE_API_BASE_URL="${PRIVATE_API_BASE_URL:-http://127.0.0.1:4011}"
WATCHDOG_LIMIT="${WATCHDOG_LIMIT:-200}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-2700}"
SLEEP_SECONDS="${SLEEP_SECONDS:-20}"

if [[ -f "$RUNNER_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$RUNNER_ENV_FILE"
  set +a
fi

if [[ -f "$API_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
fi

if [[ -z "${OPS_API_TOKEN:-}" ]]; then
  echo "[adops-daily-prints] OPS_API_TOKEN ausente." >&2
  exit 1
fi

if [[ -z "${ADOPS_INTERNAL_API_TOKEN:-}" ]]; then
  echo "[adops-daily-prints] ADOPS_INTERNAL_API_TOKEN ausente." >&2
  exit 1
fi

DATE_CUIABA="$(TZ=America/Cuiaba date +%F)"

python3 - "$PUBLIC_API_BASE_URL" "$PRIVATE_API_BASE_URL" "$OPS_API_TOKEN" "$ADOPS_INTERNAL_API_TOKEN" "$DATE_CUIABA" "$WATCHDOG_LIMIT" "$MAX_WAIT_SECONDS" "$SLEEP_SECONDS" <<'PY'
import json
import sys
import time
import urllib.request

base_url, private_base_url, ops_token, private_token, target_date, watchdog_limit, max_wait_seconds, sleep_seconds = sys.argv[1:]
watchdog_limit = int(watchdog_limit)
max_wait_seconds = int(max_wait_seconds)
sleep_seconds = int(sleep_seconds)

headers = {
    "User-Agent": "Mozilla/5.0",
    "Authorization": f"Bearer {ops_token}",
    "Content-Type": "application/json; charset=utf-8",
}

def request(path, method="GET", payload=None, protected=False):
    req_headers = {"User-Agent": "Mozilla/5.0"}
    if protected:
      req_headers.update({
          "Authorization": f"Bearer {ops_token}",
          "Content-Type": "application/json; charset=utf-8",
      })
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

def private_request(path, payload):
    req = urllib.request.Request(
        f"{private_base_url}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/json; charset=utf-8",
            "x-adops-api-token": private_token,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.load(response)

def run_watchdog():
    return request("/api/ops/jobs/watchdog", method="POST", payload={"dryRun": False, "limit": watchdog_limit}, protected=True)

def get_audit():
    return request(f"/api/insertions/capture-proof/audit?date={target_date}")

watchdog = run_watchdog()
print(json.dumps({"stage": "watchdog", "result": watchdog}, ensure_ascii=False))

audit = get_audit()
pending_items = [item for item in audit.get("items", []) if item.get("status") != "ok"]
print(json.dumps({
    "stage": "initial_audit",
    "date": target_date,
    "totalEligible": audit.get("totalEligible"),
    "ok": audit.get("ok"),
    "missing": audit.get("missing"),
    "invalid": audit.get("invalid"),
    "pendingIds": [item.get("insertionId") for item in pending_items],
}, ensure_ascii=False))

for item in pending_items:
    insertion_id = item.get("insertionId")
    if not insertion_id:
        continue
    result = private_request(
        f"/api/insertions/{int(insertion_id)}/capture-proof",
        {
            "date": target_date,
            "force": True,
            "replace": True,
        },
    )
    print(json.dumps({
        "stage": "captured_print",
        "insertionId": insertion_id,
        "status": result.get("status"),
        "uploadedUrl": ((result.get("capture") or {}).get("uploadedUrl") if isinstance(result, dict) else None),
    }, ensure_ascii=False))

deadline = time.time() + max_wait_seconds
while True:
    audit = get_audit()
    print(json.dumps({
        "stage": "poll",
        "date": target_date,
        "ok": audit.get("ok"),
        "missing": audit.get("missing"),
        "invalid": audit.get("invalid"),
    }, ensure_ascii=False))
    if audit.get("missing", 0) == 0 and audit.get("invalid", 0) == 0:
        print(json.dumps({"stage": "completed", "audit": audit}, ensure_ascii=False))
        break
    if time.time() >= deadline:
        print(json.dumps({"stage": "timeout", "audit": audit}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2)
    run_watchdog()
    time.sleep(sleep_seconds)
PY
