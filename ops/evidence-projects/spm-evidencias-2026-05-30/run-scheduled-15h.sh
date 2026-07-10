#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/leandrobosaipo/Projetos/AdOps"
PROJECT="$ROOT/ops/evidence-projects/spm-evidencias-2026-05-30"
LOG_DIR="$PROJECT/logs"
LOG_FILE="$LOG_DIR/scheduled-15h-launchd-$(date +%Y%m%d-%H%M%S).log"
PLIST="$HOME/Library/LaunchAgents/com.codigo5.adops.spm-evidencias-2026-05-30-1500.plist"

mkdir -p "$LOG_DIR"

{
  echo "[spm-evidencias] started_at=$(date -Is)"
  cd "$ROOT"
  /opt/homebrew/opt/node@22/bin/node "$PROJECT/run.mjs" scheduled-15h --telegram --telegram-evidences
  echo "[spm-evidencias] completed_at=$(date -Is)"
} >> "$LOG_FILE" 2>&1

if command -v launchctl >/dev/null 2>&1 && [[ -f "$PLIST" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
fi

