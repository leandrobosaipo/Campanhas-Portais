import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
const home1 = config.PNMT?.formatMappings?.find((item) => Number(item.groupId) === 2);

assert(home1, "PNMT groupId=2 precisa existir");
assert.equal(home1.auditOverrides?.gifFrameSelection, "source_preferred");
assert.equal(home1.auditOverrides?.forceReferenceFrameOnSlot, true);
assert.equal(home1.auditOverrides?.finalPngCreativeMinSimilarity, undefined);

console.log("PNMT HOME 1 GIF capture rule: ok");
