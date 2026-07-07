#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-173.212.225.231}"
USER="${USER_NAME:-root}"
REMOTE_ROOT="${REMOTE_ROOT:-/etc/easypanel/projects/codigo5/adops-campanhas-portais}"
REMOTE_CODE_DIR="$REMOTE_ROOT/code"
IMAGE_NAME="${IMAGE_NAME:-easypanel/codigo5/adops-campanhas-portais:latest}"
API_SERVICE_NAME="${API_SERVICE_NAME:-codigo5_adops-api}"
RUNNER_SERVICE_NAME="${RUNNER_SERVICE_NAME:-codigo5_adops-runner}"
API_ENV_FILE="${API_ENV_FILE:-$REMOTE_ROOT/adops-api.env}"
RUNNER_ENV_FILE="${RUNNER_ENV_FILE:-$REMOTE_ROOT/adops-runner.env}"

if [[ ! -f /Users/leandrobosaipo/Projetos/AdOps/ops/contabo/Dockerfile.runtime ]]; then
  echo "Dockerfile.runtime não encontrado" >&2
  exit 1
fi

ssh "$USER@$HOST" "mkdir -p '$REMOTE_CODE_DIR'"
ssh "$USER@$HOST" "mkdir -p '$REMOTE_ROOT/state'"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.wrangler' \
  --exclude 'tmp' \
  --exclude 'tmp-playwright' \
  --exclude 'test-results' \
  --exclude 'artifacts/adops/dist' \
  /Users/leandrobosaipo/Projetos/AdOps/ "$USER@$HOST:$REMOTE_CODE_DIR/"

ssh "$USER@$HOST" "cd '$REMOTE_CODE_DIR' && docker build -t '$IMAGE_NAME' -f ops/contabo/Dockerfile.runtime ."

ssh "$USER@$HOST" "if docker service inspect '$API_SERVICE_NAME' >/dev/null 2>&1; then \
  docker service rm '$API_SERVICE_NAME'; \
fi"

ssh "$USER@$HOST" "docker service create \
  --name '$API_SERVICE_NAME' \
  --network easypanel \
  --network easypanel-codigo5 \
  --env-file '$API_ENV_FILE' \
  --mount type=bind,src=/root/.ssh,dst=/root/.ssh,readonly \
  --publish published=4011,target=4011 \
  --restart-condition any \
  --replicas 1 \
  '$IMAGE_NAME' \
  node artifacts/api-server/dist/index.mjs"

ssh "$USER@$HOST" "if docker service inspect '$RUNNER_SERVICE_NAME' >/dev/null 2>&1; then \
  docker service rm '$RUNNER_SERVICE_NAME'; \
fi"

ssh "$USER@$HOST" "docker service create \
  --name '$RUNNER_SERVICE_NAME' \
  --network easypanel \
  --network easypanel-codigo5 \
  --env-file '$RUNNER_ENV_FILE' \
  --mount type=bind,src=/root/.ssh,dst=/root/.ssh,readonly \
  --mount type=bind,src='$REMOTE_ROOT/state',dst=/var/lib/adops \
  --restart-condition any \
  --replicas 1 \
  '$IMAGE_NAME' \
  node ops/cloudflare-remote-runner/src/runner.mjs"

ssh "$USER@$HOST" "docker service ls | egrep 'adops-api|adops-runner'"
