import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderDynamicEvidenceReport } from "./build-dynamic-evidence-report.mjs";

test("executa no VM as expressões reais de contagem do HTML gerado", () => {
  const html = renderDynamicEvidenceReport();
  const state = { items: [
    { id: 1, campanhaId: 10, publicationStates: ["active"], evidenceStates: ["complete"] },
    { id: 2, campanhaId: 10, publicationStates: ["active"], evidenceStates: ["scheduled"] },
  ] };
  const campaignExpression = html.match(/new Set\(state\.items\.map\(item=>item\.campanhaId\|\|item\.id\)\)\.size/)?.[0];
  const countExpression = html.match(/const count=(\(stateName\)=>all\.filter\(.*?\)\.length);/)?.[1];
  assert.ok(campaignExpression);
  assert.ok(countExpression);
  const result = vm.runInNewContext(`({campaigns:${campaignExpression}, insertions:state.items.length, scheduled:(${countExpression})("scheduled")})`, {state, all:state.items});
  assert.equal(JSON.stringify(result), JSON.stringify({ campaigns: 1, insertions: 2, scheduled: 0 }));
  assert.match(html, /new Set\(state\.items\.map\(item=>item\.campanhaId\|\|item\.id\)\)/);
});
