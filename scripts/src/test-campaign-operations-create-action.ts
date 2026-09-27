import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://localhost/adops_campaign_action_test";

const { campaignCreationRequiredAction } = await import("../../artifacts/api-server/src/lib/campaign-operations");

test("não sugere criar inserção quando há múltiplos candidatos compatíveis", () => {
  assert.equal(campaignCreationRequiredAction(false, 2), null);
});

test("sugere criar somente quando nenhum candidato compatível existe", () => {
  assert.equal(campaignCreationRequiredAction(false, 0), "create_campaign_or_insertion");
});
