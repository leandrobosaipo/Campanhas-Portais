import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://localhost/adops_campaign_action_test";

const { campaignAdOpsSelectionAction } = await import("../../artifacts/api-server/src/lib/campaign-operations");

test("ambiguidade requer revisão e não sugere criar campanha/inserção", () => {
  assert.equal(campaignAdOpsSelectionAction(false, 2), "review_adops_ambiguity");
});

test("sugere criar somente quando nenhum candidato compatível existe", () => {
  assert.equal(campaignAdOpsSelectionAction(false, 0), "create_campaign_or_insertion");
});

test("inserção canônica não exige criar campanha", () => {
  assert.equal(campaignAdOpsSelectionAction(true, 1), null);
});
