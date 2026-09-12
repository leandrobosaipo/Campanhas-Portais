import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cod5_root = new URL("../..", import.meta.url);
const cod5_apiHealth = new URL("../../artifacts/api-server/src/routes/health.ts", import.meta.url);
const cod5_composeFiles = [
  new URL("../../ops/portainer/adops-stack/docker-compose.yml", import.meta.url),
  new URL("../../ops/portainer/adops-stack/docker-compose.volume.yml", import.meta.url),
];

const cod5_healthSource = await readFile(cod5_apiHealth, "utf8");
assert.match(cod5_healthSource, /process\.env\.ADOPS_RELEASE_SHA \|\| process\.env\.ADOPS_IMAGE_TAG \|\| "development"/);

for (const cod5_composeFile of cod5_composeFiles) {
  const cod5_compose = await readFile(cod5_composeFile, "utf8");
  assert.match(cod5_compose, /adops-api:[\s\S]*?ADOPS_RELEASE_SHA: \$\{ADOPS_RELEASE_SHA:-\$\{ADOPS_IMAGE_TAG:-unknown\}\}/);
  assert.doesNotMatch(cod5_compose, /OPS_API_BASE_URL:\s*https:\/\/adops-api-public\.leandro471\.workers\.dev/);
}

console.log("release routing contract: ok");
