#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [inventory, ops, campaigns, media, runner, compose, worker, migration] = await Promise.all([
  read("artifacts/api-server/src/lib/drive-inventory.ts"),
  read("artifacts/api-server/src/routes/ops.ts"),
  read("artifacts/api-server/src/routes/campaign-operations.ts"),
  read("artifacts/api-server/src/lib/drive-campaign-media.ts"),
  read("ops/cloudflare-remote-runner/src/runner.mjs"),
  read("ops/portainer/adops-stack/docker-compose.yml"),
  read("ops/cloudflare-public-api/src/index.ts"),
  read("ops/portainer/adops-stack/migrations/2026-07-10-drive-inventory.sql"),
]);

for (const marker of [
  "cod5_drive_inventory_scans",
  "cod5_drive_inventory_items",
  "PRIMARY KEY (drive_file_id, modified_time)",
  "UPDATE cod5_drive_inventory_items SET is_current = false",
  "BEGIN",
  "ROLLBACK",
  "COMMIT",
]) {
  assert(inventory.includes(marker) || migration.includes(marker), `inventário sem marcador ${marker}`);
}

for (const marker of [
  'router.get("/ops/drive-inventory/status"',
  'router.post("/ops/jobs/drive-inventory-refresh"',
  'router.post("/ops/drive-inventory/sync"',
  "rawItems.length > 5000",
  "enqueueDriveInventoryRefresh",
]) assert(ops.includes(marker), `API sem marcador ${marker}`);

for (const marker of [
  "drive-inventory-refresh",
  "executeDriveInventoryRefresh",
  "syncDriveInventorySnapshot",
  "files(id,name,mimeType,modifiedTime,webViewLink,parents,size,md5Checksum)",
]) assert(runner.includes(marker), `runner sem marcador ${marker}`);

assert(campaigns.includes("refreshJobId"));
assert(campaigns.includes("snapshotAgeSeconds"));
assert(media.includes('source = "snapshot"'));
assert(media.includes('DRIVE_INTEGRATION_MODE === "monitor"'));
assert(compose.includes("DRIVE_INTEGRATION_MODE: ${DRIVE_INTEGRATION_MODE:-legacy}"));
assert(!compose.match(/adops-api:[\s\S]*?GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE:[\s\S]*?adops-runner:/), "API não pode receber credencial do Drive");
assert(compose.includes("container_name: adops-drive-pi-monitor-stack"));
assert(worker.includes('path === "/api/ops/jobs/drive-inventory-refresh"'));
assert(runner.includes("ADOPS_DRIVE_RETRY_MAX_ATTEMPTS"));
assert(runner.includes("AbortSignal.timeout(ADOPS_DRIVE_REQUEST_TIMEOUT_MS)"));
assert(runner.includes("response.status === 429 || response.status >= 500 || quotaLimited"));
assert(runner.includes('req.url !== "/healthz"'));
assert(worker.includes('path === "/api/ops/drive-inventory/status"'));

console.log("ok: drive inventory snapshot, API, runner and rollout contracts");
