import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
const rules = config.PERRENGUE?.formatMappings || [];
const home1 = rules.find((item) => Number(item.groupId) === 2);
const lateral2 = rules.find((item) => Number(item.groupId) === 7);

assert(home1, "PERRENGUE groupId=2 precisa existir");
assert.equal(home1.auditOverrides?.gifFrameSelection, "source_preferred");
assert.equal(home1.auditOverrides?.forceReferenceFrameOnSlot, true);
assert.equal(home1.auditOverrides?.finalPngCreativeMinSimilarity, undefined);

assert(lateral2, "PERRENGUE groupId=7 precisa existir");
assert(lateral2.aliases.includes("LATERAL 02 — SIDEBAR — 300x250"));
assert.equal(lateral2.auditOverrides?.gifFrameSelection, "source_preferred");
assert.equal(lateral2.auditOverrides?.forceReferenceFrameOnSlot, true);
assert.equal(lateral2.auditOverrides?.finalPngCreativeMinSimilarity, undefined);

console.log("Perrengue August evidence rules: ok");
