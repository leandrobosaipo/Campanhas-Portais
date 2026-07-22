import assert from "node:assert/strict";
import test from "node:test";
import { getAdRotateGroupId, getSiteFormatMapping } from "../../artifacts/api-server/src/lib/adrotate-sites";

test("INTERNO resolves to the canonical internal-news group", () => {
  assert.equal(getAdRotateGroupId("AFL", "INTERNO"), 14);
  assert.equal(getAdRotateGroupId("PNMT", "INTERNO NOTICIAS"), 14);
  assert.equal(getSiteFormatMapping("AFL", "BANNER INTERNO NOTICIA")?.page, "article");
});
