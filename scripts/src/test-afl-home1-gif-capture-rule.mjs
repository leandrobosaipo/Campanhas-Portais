import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const configUrl = new URL("../../config/adrotate-sites.json", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));
const mapping = config.AFL?.formatMappings?.find((item) => Number(item.groupId) === 2);

assert(mapping, "AFL groupId=2 (HOME 1) precisa existir");
assert.equal(mapping.auditOverrides?.gifFrameSelection, "source_preferred");
assert.equal(
  mapping.auditOverrides?.forceReferenceFrameOnSlot,
  true,
  "AFL HOME 1 precisa congelar no slot o mesmo frame GIF usado pela auditoria de identidade",
);
assert.equal(
  mapping.auditOverrides?.finalPngCreativeMinSimilarity,
  undefined,
  "A correção não deve enfraquecer o limiar padrão de identidade criativa",
);

console.log("AFL HOME 1 GIF capture rule: ok");
