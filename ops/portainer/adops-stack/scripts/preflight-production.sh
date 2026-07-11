#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"
STACK_NAME="${STACK_NAME:-adops}"
API_BASE_URL="${ADOPS_PUBLIC_API_BASE_URL:-https://adops-api.codigo5.com.br}"
WEB_BASE_URL="${ADOPS_PUBLIC_WEB_BASE_URL:-https://adops.codigo5.com.br}"

STACK="$(portainer_curl "${PORTAINER_API}/stacks" | jq -c --arg name "$STACK_NAME" '.[] | select(.Name == $name)' | head -n 1)"
[[ -n "$STACK" ]] || { printf 'Stack %s não encontrada.\n' "$STACK_NAME" >&2; exit 1; }

CONTAINERS="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"
required=(adops-postgres adops-api adops-runner adops-drive-pi-monitor-stack adops-web)
container_json='[]'
for name in "${required[@]}"; do
  item="$(printf '%s' "$CONTAINERS" | jq -c --arg name "/$name" '.[] | select(.Names[]? == $name) | {name:$name,state:.State,status:.Status,image:.Image}' | head -n 1)"
  [[ -n "$item" ]] || { printf 'Container obrigatório ausente: %s\n' "$name" >&2; exit 1; }
  [[ "$(jq -r '.state' <<<"$item")" == "running" ]] || { printf 'Container não está running: %s\n' "$name" >&2; exit 1; }
  container_json="$(jq -c --argjson item "$item" '. + [$item]' <<<"$container_json")"
done

POSTGRES_ID="$(printf '%s' "$CONTAINERS" | jq -r '.[] | select(.Names[]? == "/adops-postgres") | .Id' | head -n 1)"
POSTGRES_INSPECT="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${POSTGRES_ID}/json")"
BACKUP_VOLUME_RW="$(jq -r '[.Mounts[] | select(.Destination == "/var/lib/postgresql/data" and .RW == true)] | length > 0' <<<"$POSTGRES_INSPECT")"
[[ "$BACKUP_VOLUME_RW" == "true" ]] || { printf 'Volume do PostgreSQL não está gravável.\n' >&2; exit 1; }

health="$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/healthz")"
release="$(curl -fsS --max-time 15 "${WEB_BASE_URL%/}/cod5-release.json")"
inventory="$(curl -fsS --max-time 15 "${API_BASE_URL%/}/api/ops/drive-inventory/status")"

jq -n \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg stackId "$(jq -r '.Id' <<<"$STACK")" \
  --arg endpointId "$ENDPOINT_ID" \
  --argjson containers "$container_json" \
  --argjson health "$health" \
  --argjson release "$release" \
  --argjson inventory "$inventory" \
  '{ok:true,mutated:false,generatedAt:$generatedAt,stackId:$stackId,endpointId:$endpointId,backupWritable:true,containers:$containers,health:$health,release:$release,inventory:{snapshotStatus:$inventory.snapshotStatus,snapshotAt:$inventory.snapshotAt,stale:$inventory.stale,itemCount:$inventory.itemCount}}'
