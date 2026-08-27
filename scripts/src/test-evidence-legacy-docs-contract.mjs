import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const activeDocs = [
  "AGENTS.md",
  "docs/adops/ops-api-runbook.md",
  "docs/adops/evidence-monthly-report/spec.md",
  "docs/adops/evidence-monthly-report/harness.md",
  "docs/adops/evidence-monthly-report/runbook.md",
];

for (const file of activeDocs) {
  const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /cd \/Users\/leandrobosaipo\/\.openclaw\/Campanhas-Portais/, `${file} ainda manda executar pela raiz histórica`);
  const positiveRules = source.split("\n").filter((line) => !/\b(?:não|nunca|proibid[oa]|sem)\b/i.test(line)).join("\n");
  assert.doesNotMatch(positiveRules, /(?:usar|use|recua(?:r)?|permit(?:e|ido))[^\n]{0,100}(?:fallback[^\n]{0,60})?campaign-operations\/active/i, `${file} ainda autoriza fallback mensal legado`);
}

const runbook = await readFile(new URL("../../docs/adops/ops-api-runbook.md", import.meta.url), "utf8");
for (const required of ["scheduled", "same_day_retry", "historical_recovery", "same_day_inline", "America/Cuiaba"]) {
  assert.match(runbook, new RegExp(required.replace("/", "\\/")), `runbook não documenta ${required}`);
}

console.log(JSON.stringify({ ok: true, activeDocs: activeDocs.length }));
