import assert from "node:assert/strict";
import {
  isEligibleCampaignInsertionStatus,
  isFormatCompatible,
} from "../../artifacts/api-server/src/lib/campaign-operations-matching";

assert.equal(isFormatCompatible("PERRENGUE", "LATERAL 02 — SIDEBAR — 300x250", "LATERAL 02"), true);
assert.equal(isFormatCompatible("PERRENGUE", "TOPO LATERAL", "LATERAL 02"), false);
assert.equal(isFormatCompatible("PERRENGUE", "TOPO LATERAL", "TOPO LATERAL"), true);
assert.equal(isFormatCompatible("PERRENGUE", "HOME 01 — 728x90", "HOME 1"), true);
assert.equal(isFormatCompatible("PPMT", "TOPO", "MEGABANNER TOPO"), true);
assert.equal(isFormatCompatible("PPMT", "MEGABANNER HOME 1 — 670x90", "HOME 1"), true);
assert.equal(isEligibleCampaignInsertionStatus("rascunho"), true);
assert.equal(isEligibleCampaignInsertionStatus("publicado"), true);
assert.equal(isEligibleCampaignInsertionStatus("cancelado"), false);

console.log("active campaign format contracts: ok");
