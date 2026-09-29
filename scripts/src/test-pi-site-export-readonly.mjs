import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const runner = await readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8");
const exportFlow = runner.match(/async function executePiSiteExport\(job\) \{[\s\S]*?(?=\nfunction |\nasync function )/)?.[0] ?? "";
const coverageFlow = runner.match(/async function ensureInsertionCaptureCoverage\([\s\S]*?(?=\nfunction fulfillmentPlacementKey)/)?.[0] ?? "";

assert.notEqual(exportFlow, "", "executePiSiteExport não encontrado");
assert.notEqual(coverageFlow, "", "ensureInsertionCaptureCoverage não encontrada");

assert.match(
  exportFlow,
  /ensureInsertionCaptureCoverage\(insertion, requiredDates, \{ allowRecovery: false \}\)/,
  "exportação ZIP deve conferir evidências sem iniciar recuperação",
);
assert.match(coverageFlow, /\{ allowRecovery = true \} = \{\}/, "capturas fora do export devem manter recuperação habilitada por padrão");
assert.match(coverageFlow, /if \(hasInvalid && !Array\.isArray\(requiredDatesOverride\)\)[\s\S]*?capture-proof\/fix-invalid/);
assert.match(coverageFlow, /captureProofWithRetry\(insertion\.id, targetDate\)/, "caminho normal de captura deve continuar recuperável");

console.log(JSON.stringify({ ok: true, exportRecovery: false, captureRecoveryDefault: true }));
