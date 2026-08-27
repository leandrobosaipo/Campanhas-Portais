import assert from "node:assert/strict";
import test from "node:test";
import * as patcher from "./sites-index-unlisted-contract.mjs";

const source = `function staticReports() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(\`${"${REPORTS_DIR}"}/\${entry.name}/index.html\`))
    .map((entry) => ({ name: entry.name }));
}`;

test("filtra report.json unlisted sem alterar o acesso direto", () => {
  const patched = patcher.patchSitesIndexUnlisted(source);
  assert.match(patched, /visibility !== "unlisted"/);
  assert.match(patched, /function staticReports/);
  assert.equal(patcher.patchSitesIndexUnlisted(patched), patched);
});

test("recusa fonte desconhecida em vez de aplicar patch parcial", () => {
  assert.throws(() => patcher.patchSitesIndexUnlisted("function staticReports() { return []; }"), /contrato de staticReports/);
});
