#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [gitlab, preflight, compose, upload, deploy, retire, ignore, heartbeat] = await Promise.all([
  read(".gitlab-ci.yml"),
  read("ops/portainer/adops-stack/scripts/preflight-production.sh"),
  read("ops/portainer/adops-stack/docker-compose.volume.yml"),
  read("ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh"),
  read("ops/portainer/adops-stack/scripts/deploy-production.sh"),
  read("ops/portainer/adops-stack/scripts/retire-release-volumes.sh"),
  read(".gitignore"),
  read("artifacts/api-server/src/lib/runner-heartbeats.ts"),
]);

for (const marker of [
  "pnpm install --frozen-lockfile",
  "git diff --exit-code",
  "pnpm run typecheck",
  "test:drive-pi-event-flow",
  "test:drive-pi-publish-flow",
  "test:drive-inventory-flow",
  "harness:drive-pi-monitor-first-v4",
  "audit:capture-rules-integrity",
  "gitleaks dir . --redact",
  "when: manual",
  "resource_group: adops-production",
]) assert(gitlab.includes(marker), `GitLab CI sem marcador ${marker}`);

assert(!gitlab.includes("deploy-production.sh"), "piloto não pode executar deploy de produção");
assert(preflight.includes("mutated:false"), "preflight precisa declarar ausência de mutação");
assert(preflight.includes("backupWritable:true"), "preflight precisa validar backup possível");

for (const marker of ["ADOPS_APP_SOURCE_VOLUME", "ADOPS_WEB_PUBLIC_VOLUME"]) {
  assert(compose.includes(marker), `compose sem volume configurável ${marker}`);
  assert(upload.includes(marker), `upload sem volume versionado ${marker}`);
  assert(deploy.includes(marker), `deploy sem volume versionado ${marker}`);
}

assert(upload.includes('cut -c1-12'), "volume precisa usar SHA curto");
assert(upload.includes("adops_app_source_${RELEASE_SUFFIX:-unknown}"));
const switchedAt = deploy.indexOf('STACK_SWITCHED="true"');
const deployStackAt = deploy.indexOf('bash "$SCRIPT_DIR/deploy-stack.sh" "$DEPLOY_ENV"');
assert(switchedAt >= 0 && deployStackAt >= 0 && switchedAt < deployStackAt, "rollback precisa ser armado antes de atualizar o stack");
assert(deploy.includes("restaurando volumes anteriores"), "deploy precisa de rollback automático");
assert(retire.includes('KEEP_RELEASES="${ADOPS_VOLUME_RETENTION_KEEP:-3}"'));
assert(retire.includes('APPLY="${ADOPS_VOLUME_RETENTION_APPLY:-false}"'));
assert(ignore.includes("/.playwright-cli/"));
assert(ignore.includes("/reports/"));
assert(heartbeat.includes("cod5_runner_heartbeats"));

console.log("ok: GitLab shadow CI, read-only preflight, SHA volumes, rollback and heartbeat contracts");
