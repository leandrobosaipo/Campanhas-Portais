import assert from "node:assert/strict";
import { serializeCampaignEvidenceFingerprint as serialize } from "../../artifacts/api-server/src/lib/campaign-evidence-fingerprint";
const item = { insertionId: 1, evidenceId: 2, portal: "ROO", date: "2026-09-12", url: "https://example.test/proof.png", auditHash: "abc" };
const reordered = Object.fromEntries(Object.entries(item).reverse());
const original = JSON.stringify({ piCodigo: "3218", competencia: "2026-09", evidences: [item] });
assert.equal(serialize("3218", "2026-09", [item]), original);
assert.equal(serialize("3218", "2026-09", [reordered]), original);
for (const key of Object.keys(item)) {
  assert.notEqual(serialize("3218", "2026-09", [{ ...item, [key]: "changed" }]), original);
}
console.log("ok: immutable signature survives JSONB key ordering and binds all descriptor fields");
