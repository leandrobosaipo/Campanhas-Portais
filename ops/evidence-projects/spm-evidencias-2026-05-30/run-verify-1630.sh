#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/leandrobosaipo/Projetos/AdOps"
PROJECT="$ROOT/ops/evidence-projects/spm-evidencias-2026-05-30"
LOG_DIR="$PROJECT/logs"
LOG_FILE="$LOG_DIR/verify-1630-$(date +%Y%m%d-%H%M%S).log"
PLIST="$HOME/Library/LaunchAgents/com.codigo5.adops.spm-evidencias-2026-05-30-1630.plist"

mkdir -p "$LOG_DIR"

{
  echo "[spm-evidencias-verify] started_at=$(date -Is)"
  cd "$ROOT"

  if /opt/homebrew/opt/node@22/bin/node "$PROJECT/verify-scheduled-15h.mjs"; then
    echo "[spm-evidencias-verify] already_complete=true"
  else
    echo "[spm-evidencias-verify] incomplete=true rerun=scheduled-15h"
    /opt/homebrew/opt/node@22/bin/node "$PROJECT/run.mjs" scheduled-15h --telegram --telegram-evidences
    /opt/homebrew/opt/node@22/bin/node "$PROJECT/verify-scheduled-15h.mjs"
  fi

  echo "[spm-evidencias-verify] completed_at=$(date -Is)"
} >> "$LOG_FILE" 2>&1

if command -v launchctl >/dev/null 2>&1 && [[ -f "$PLIST" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
fi

