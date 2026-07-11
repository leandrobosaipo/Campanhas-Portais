#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"

load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"
KEEP_RELEASES="${ADOPS_VOLUME_RETENTION_KEEP:-3}"
APPLY="${ADOPS_VOLUME_RETENTION_APPLY:-false}"
[[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || { printf 'ADOPS_VOLUME_RETENTION_KEEP inválido.\n' >&2; exit 1; }

payload="$(portainer_curl "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/volumes")"
releases="$(jq -c '
  [.Volumes[]
   | select(.Name | test("^adops_(app_source|web_public)_[A-Za-z0-9]{12}$"))
   | {name:.Name,suffix:(.Name|capture("_(?<suffix>[A-Za-z0-9]{12})$").suffix),createdAt:(.CreatedAt // ""),refCount:(.UsageData.RefCount // 0)}]
  | group_by(.suffix)
  | map({suffix:.[0].suffix,createdAt:(map(.createdAt)|max),volumes:map({name,refCount})})
  | sort_by(.createdAt) | reverse' <<<"$payload")"

plan="$(jq -c --argjson keep "$KEEP_RELEASES" '
  {keep:.[0:$keep], retire:.[ $keep: ]}
' <<<"$releases")"
jq --argjson apply "$( [[ "$APPLY" == "true" ]] && printf true || printf false )" '. + {apply:$apply}' <<<"$plan"

[[ "$APPLY" == "true" ]] || exit 0
while IFS= read -r volume; do
  name="$(jq -r '.name' <<<"$volume")"
  ref_count="$(jq -r '.refCount' <<<"$volume")"
  if [[ "$ref_count" != "0" ]]; then
    printf 'Preservando volume em uso: %s refCount=%s\n' "$name" "$ref_count" >&2
    continue
  fi
  portainer_curl -X DELETE "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/volumes/${name}" >/dev/null
  printf 'Volume removido: %s\n' "$name"
done < <(jq -c '.retire[].volumes[]' <<<"$plan")
