import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const route = fs.readFileSync(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
const source = route.slice(route.indexOf("function parseAdRotateSlotsFromHtml("), route.indexOf("function computeAtrasado("));
const parse = vm.runInNewContext(`${stripTypeScriptTypes(source)}; parseAdRotateSlotsFromHtml`, {
  normalizeSiteMediaUrl: value => value,
});
for (const type of ["single", "dyn"]) {
  const html = `<div class="g g-14"><div class="g-${type} a-33"><a><img src="https://media.test/correct.gif"></a></div></div><div class="g g-11"><div class="g-${type} a-99"><img src="https://media.test/other.gif"></div></div>`;
  const rows = parse(html, "https://portal.test/article/", [14]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adId, 33);
  assert.equal(rows[0].groupId, 14);
  assert.equal(rows[0].mediaUrl, "https://media.test/correct.gif");
  assert.equal(parse(html, "https://portal.test/article/", [6]).length, 0);
}
console.log("ok: g-single and g-dyn preserve group, ad and media identity");
