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
  const result = vm.runInNewContext(`(() => {
    const uniqueCampaigns = new Set(state.items.map(item=>item.campanhaId||item.id)).size;
    const count = (name) => state.items.filter(item => (item.publicationStates||[]).includes(name) || (name !== "scheduled" && (item.evidenceStates||[]).includes(name))).length;
    return { campaigns: uniqueCampaigns, insertions: state.items.length, scheduled: count("scheduled") };
  })()`, { state });
  assert.equal(JSON.stringify(result), JSON.stringify({ campaigns: 1, insertions: 2, scheduled: 0 }));
  assert.match(html, /new Set\(state\.items\.map\(item=>item\.campanhaId\|\|item\.id\)\)/);
});
