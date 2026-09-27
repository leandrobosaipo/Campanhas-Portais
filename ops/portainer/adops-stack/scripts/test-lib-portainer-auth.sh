#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin"
cat > "$TEST_DIR/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
config=""
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == "--config" ]]; then
    next=$((i + 1))
    config="${!next}"
  fi
done
[[ -n "$config" && -f "$config" ]]
[[ "$(stat -f '%Lp' "$config")" == "600" ]]
grep -q 'X-API-Key: test-only-portainer-key' "$config"
[[ "${PORTAINER_API_KEY+x}" != x ]]
for arg in "$@"; do [[ "$arg" != *test-only-portainer-key* ]]; done
printf '%s\n' "$config" > "$TEST_CONFIG_PATH"
CURL
chmod +x "$TEST_DIR/bin/curl"

export PATH="$TEST_DIR/bin:$PATH"
export TEST_CONFIG_PATH="$TEST_DIR/config-path"
PORTAINER_ENV_FILE=/dev/null
PORTAINER_URL=https://portainer.invalid
PORTAINER_API_KEY=test-only-portainer-key
source "$SCRIPT_DIR/lib-portainer.sh"
load_portainer_env
portainer_curl "${PORTAINER_API}/version" >/dev/null
CONFIG_PATH="$(<"$TEST_CONFIG_PATH")"
[[ ! -e "$CONFIG_PATH" ]]
printf 'Portainer key excluded from curl argv/environment; temporary config was mode 600 and removed.\n'
