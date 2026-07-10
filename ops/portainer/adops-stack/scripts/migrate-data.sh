#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$STACK_DIR/../../.." && pwd)"
ENV_FILE="${1:-${ADOPS_MIGRATION_ENV_FILE:-}}"
STAMP="$(date +%Y%m%dT%H%M%S)"
OUT_DIR="$REPO_ROOT/docs/harness-reports/adops-portainer-migration/${STAMP}"

if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  printf 'Usage: ADOPS_MIGRATION_ENV_FILE=/secure/path/adops-migration.env %s\n' "$0" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

mkdir -p "$OUT_DIR"
DUMP_PATH="$OUT_DIR/source.dump"

printf 'Creating source dump at %s\n' "$DUMP_PATH"
pg_dump --format=custom --no-owner --no-privileges --file "$DUMP_PATH" "$SOURCE_DATABASE_URL"

printf 'Restoring dump into target database\n'
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL" "$DUMP_PATH"

TABLES=(
  clients
  agencies
  sites
  campaigns
  insertions
  evidences
  print_jobs
  capture_rules
  capture_proof_logs
  operational_document_states
)

{
  printf '{\n'
  printf '  "generatedAt": "%s",\n' "$(date -Iseconds)"
  printf '  "source": "redacted",\n'
  printf '  "target": "redacted",\n'
  printf '  "tables": [\n'
  first=1
  for table_name in "${TABLES[@]}"; do
    source_count="$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from ${table_name};" 2>/dev/null || printf 'ERROR')"
    target_count="$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from ${table_name};" 2>/dev/null || printf 'ERROR')"
    [[ "$first" -eq 0 ]] && printf ',\n'
    first=0
    printf '    {"table": "%s", "sourceCount": "%s", "targetCount": "%s", "match": %s}' \
      "$table_name" "$source_count" "$target_count" "$([[ "$source_count" == "$target_count" ]] && printf true || printf false)"
  done
  printf '\n  ]\n'
  printf '}\n'
} > "$OUT_DIR/verification.json"

jq -e '.tables | all(.match == true)' "$OUT_DIR/verification.json" >/dev/null
printf 'Migration verification passed: %s\n' "$OUT_DIR/verification.json"
