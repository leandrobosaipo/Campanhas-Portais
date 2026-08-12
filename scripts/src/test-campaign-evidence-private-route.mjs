import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test("materializador completo fica em rota interna e jobs pertencem somente ao Worker", async () => {
  const [routes, worker, runner] = await Promise.all([
    readFile(path.join(repoRoot, "artifacts/api-server/src/routes/insertions.ts"), "utf8"),
    readFile(path.join(repoRoot, "ops/cloudflare-public-api/src/index.ts"), "utf8"),
    readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8"),
  ]);
  assert.match(routes, /router\.get\("\/internal\/campaign-evidence-exports"/);
  assert.doesNotMatch(routes, /router\.post\("\/campaign-evidence-exports\/jobs"/);
  assert.doesNotMatch(routes, /createLocalCampaignEvidenceExportJob/);
  assert.match(worker, /path\.startsWith\("\/api\/internal\/"\)/);
  assert.match(worker, /privateApiGetJson\(env, "\/api\/internal\/campaign-evidence-exports"/);
  assert.match(runner, /`\/api\/internal\/campaign-evidence-exports\?/);
});
