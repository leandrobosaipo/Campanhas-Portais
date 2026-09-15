import assert from "node:assert/strict";
import {
  completeCampaignExportGroupKey,
  completeExportGroupKeys,
  portalExportGroupKey,
} from "./monthly-report-export-eligibility.mjs";

const item = (id, { piCodigo = "PI 3218", siteSigla = "ROO", competencia = "SETEMBRO/2026", requiredDays = ["2026-09-12"], evidenceDays = requiredDays.map((date) => ({ date, status: "audited", url: `https://proof.example/${id}/${date}.jpg` })) } = {}) => ({ id, piCodigo, siteSigla, competencia, requiredDays, evidenceDays });
const completeVideo = item(3017);
const incompleteMega = item(3018, {
  requiredDays: ["2026-09-12", "2026-09-13"],
  evidenceDays: [{ date: "2026-09-12", status: "audited", url: "https://proof.example/3018/12.jpg" }],
});

assert.equal(portalExportGroupKey(completeVideo), portalExportGroupKey(incompleteMega));
assert.equal(completeExportGroupKeys([completeVideo, incompleteMega], portalExportGroupKey).size, 0);
assert.equal(completeExportGroupKeys([completeVideo, incompleteMega], completeCampaignExportGroupKey).size, 0);

const completeMega = item(3018, { requiredDays: ["2026-09-12", "2026-09-13"] });
assert.deepEqual([...completeExportGroupKeys([completeVideo, completeMega], portalExportGroupKey)], [portalExportGroupKey(completeVideo)]);
assert.deepEqual([...completeExportGroupKeys([completeVideo, completeMega], completeCampaignExportGroupKey)], [completeCampaignExportGroupKey(completeVideo)]);
console.log("ok: monthly ZIP eligibility is complete only at its export scope");
