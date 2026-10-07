import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const productionPath = new URL('../../ops/portainer/adops-stack/scripts/deploy-production.sh', import.meta.url);
const portainerPath = new URL('../../ops/portainer/adops-stack/scripts/lib-portainer.sh', import.meta.url);
const production = readFileSync(productionPath, 'utf8');
const portainer = readFileSync(portainerPath, 'utf8');
const marker = 'CONTAINERS="$(portainer_get_json "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true")"';
const start = production.indexOf(marker);
assert.notEqual(start, -1, 'post-switch container read must use retrying JSON GET');
const end = production.indexOf('\nstable_checks=0', start);
assert.notEqual(end, -1, 'post-switch start block boundary exists');
const block = production.slice(start, end);
assert.match(block, /for container_name in adops-postgres adops-api adops-web adops-runner adops-runner-print-single adops-drive-pi-monitor-stack/);
assert.doesNotMatch(block, /deploy-stack\.sh|curl -fsS/, 'readback block must not redeploy or start smoke checks');

const functionStart = portainer.indexOf('portainer_get_json() {');
const functionEnd = portainer.indexOf('\nportainer_get_json_once() {', functionStart);
assert.notEqual(functionStart, -1);
assert.notEqual(functionEnd, -1);
const getJsonFunction = portainer.slice(functionStart, functionEnd);

const containers = [
  'adops-postgres', 'adops-api', 'adops-web', 'adops-runner',
  'adops-runner-print-single', 'adops-drive-pi-monitor-stack',
].map((name) => ({ Id: `id-${name}`, Names: [`/${name}`], State: name.includes('runner') ? 'created' : 'running' }));

function run(mode) {
  const tempDir = mkdtempSync(join(tmpdir(), 'adops-post-switch-readback-'));
  const counterPath = join(tempDir, 'attempts');
  const script = `set -euo pipefail
PORTAINER_API=http://portainer ENDPOINT_ID=3
MODE='${mode}'
started_ids=()
${getJsonFunction}
portainer_curl() {
  local body='' arg attempts=0
  while (($#)); do
    arg="$1"; shift
    if [[ "$arg" == '-o' ]]; then body="$1"; shift
    elif [[ "$arg" == '-w' ]]; then shift
    else LAST_URL="$arg"
    fi
  done
  [[ ! -f '${counterPath}' ]] || attempts="$(cat '${counterPath}')"
  attempts=$((attempts + 1)); printf '%s' "$attempts" > '${counterPath}'
  if [[ "$MODE" == 'transient' && "$attempts" == '1' ]]; then printf '000'; return 7; fi
  if [[ "$MODE" == 'failed' ]]; then printf '503'; printf 'unavailable' > "$body"; return 0; fi
  printf '200'; printf '%s' '${JSON.stringify(containers)}' > "$body"
}
jq() { command jq "$@"; }
sleep() { :; }
portainer_start_container() { started_ids+=("$1"); }
${block}
printf 'RESULT attempts=%s starts=%s ids=%s\\n' "$(cat '${counterPath}')" "\${#started_ids[@]}" "\${started_ids[*]}"
`;
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  rmSync(tempDir, { recursive: true, force: true });
  return result;
}

const transient = run('transient');
assert.equal(transient.status, 0, transient.stderr);
assert.match(transient.stdout, /RESULT attempts=2 starts=2 ids=id-adops-runner id-adops-runner-print-single/);

const failed = run('failed');
assert.notEqual(failed.status, 0, 'definitive readback failure must stop before start/smoke');
assert.doesNotMatch(failed.stdout, /RESULT/, 'start/readiness block must not run after GET failure');
assert.match(failed.stderr, /Portainer GET did not return valid JSON/);

console.log('post-switch readback: retry recovers transient GET without redeploy; definitive failure stops before starts or smoke');
