import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ops = await readFile(new URL("../../artifacts/api-server/src/routes/ops.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../../artifacts/api-server/src/app.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
const compose = await readFile(new URL("../../ops/portainer/adops-stack/docker-compose.yml", import.meta.url), "utf8");

test("reconcile é protegido e a criação idempotente é atômica", () => {
  assert.match(app, /app\.use\("\/api", internalApiGuard, router\)/);
  assert.match(ops, /router\.post\("\/ops\/schedules\/reconcile"/);
  assert.match(ops, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(ops, /payload_json::jsonb ->> 'idempotencyKey'/);
});

test("Mac Mini é a autoridade e o Worker fica proxy shadow", () => {
  assert.match(compose, /ADOPS_CONTROL_PLANE_PROVIDER: \$\{ADOPS_CONTROL_PLANE_PROVIDER:-macmini\}/);
  assert.match(compose, /OPS_API_BASE_URL: http:\/\/adops-api:4011/);
  assert.match(worker, /shouldProxyOpsToMacMini\(env\.ADOPS_CONTROL_PLANE_PROVIDER, path\)/);
  assert.match(worker, /canonical_scheduler_shadow/);
});
