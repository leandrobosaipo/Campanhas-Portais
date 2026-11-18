#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [route, routerIndex, openapi] = await Promise.all([
  readFile(path.join(root, "artifacts/api-server/src/routes/campaign-bundles.ts"), "utf8"),
  readFile(path.join(root, "artifacts/api-server/src/routes/index.ts"), "utf8"),
  readFile(path.join(root, "lib/api-spec/openapi.yaml"), "utf8"),
]);

assert.match(routerIndex, /import campaignBundlesRouter from "\.\/campaign-bundles";/);
assert.match(routerIndex, /router\.use\(campaignBundlesRouter\);/);
assert.match(route, /router\.post\("\/campaign-bundles\/preflight"/);
assert.match(route, /router\.post\("\/campaign-bundles"/);
assert.match(route, /readIdempotencyKey\(req\.header\("idempotency-key"\)\)/);
assert.match(route, /duplicate_insertion_in_request/);
assert.match(route, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
assert.match(route, /campaign-bundle-create-global:v1/);
assert.ok(route.indexOf("campaign-bundle-create-global:v1") < route.indexOf("const preflight = await inspectBundle(client, parsed.data)"),
  "global transaction lock must be acquired before rechecking duplicates and inserting");
assert.match(route, /provisional_identity_incomplete/);
assert.match(route, /campaign_operational_identity_exists/);
assert.match(route, /provisional_identity_ambiguous/);
assert.match(route, /provisional_identity_source_review/);
assert.doesNotMatch(route, /COALESCE\(cliente_id, 0\).*COALESCE\(\$3, 0\)/s);
assert.doesNotMatch(route, /lower\(trim\(nome\)\)/);
assert.match(route, /kind = 'campaign-bundle-create'/);
assert.match(route, /payload_json::jsonb ->> 'idempotencyKey' = \$1/);
assert.match(route, /createHash\("sha256"\)/);
assert.match(route, /storedPayload\?\.requestHash !== requestHash/);
assert.match(route, /idempotency_key_payload_mismatch/);
assert.match(route, /res\.status\(200\)\.json\(\{ \.\.\.result, duplicate: true, idempotencyKey \}\)/);
assert.match(route, /RETURNING id, nome, pi_codigo AS "piCodigo", competencia/);
assert.match(route, /RETURNING id/);
assert.match(route, /provisional_identity_incomplete/);
assert.match(route, /campaign_operational_identity_exists/);
assert.match(route, /provisional_identity_ambiguous/);
assert.doesNotMatch(route, /COALESCE\(cliente_id, 0\).*COALESCE\(\$3, 0\)/s);
assert.match(route, /provisional_identity_incomplete/);
assert.match(route, /campaign_operational_identity_exists/);
assert.doesNotMatch(route, /COALESCE\(cliente_id, 0\).*COALESCE\(\$3, 0\)/s);
assert.match(openapi, /^  \/campaign-bundles\/preflight:\n    post:/m);
assert.match(openapi, /^  \/campaign-bundles:\n    post:/m);
assert.match(openapi, /operationId: preflightCampaignBundle/);
assert.match(openapi, /operationId: createCampaignBundle/);
assert.match(openapi, /name: Idempotency-Key\n          in: header\n          required: true/);
assert.match(openapi, /CampaignBundleBody:/);
assert.match(openapi, /CampaignBundlePreflight:/);
assert.match(openapi, /CampaignBundleResult:/);

console.log("ok: campaign bundle routes are mounted and documented with idempotency contract");
