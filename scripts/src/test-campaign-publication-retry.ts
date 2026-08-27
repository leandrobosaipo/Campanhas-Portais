import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetryCompletedCampaignPublication } from "../../ops/cloudflare-public-api/src/campaign-publication-retry";

test("reabre reconciliação concluída apenas no invólucro com needs_review", () => {
  assert.equal(shouldRetryCompletedCampaignPublication(JSON.stringify({
    ok: true,
    execution: {
      stage: "completed",
      actionsPlanned: 1,
      actionsCompleted: 1,
      results: [{ result: { stage: "needs_review" } }],
    },
  })), true);
});

test("reabre waiting_sources e execução parcial", () => {
  assert.equal(shouldRetryCompletedCampaignPublication({ ok: true, execution: { stage: "waiting_sources" } }), true);
  assert.equal(shouldRetryCompletedCampaignPublication({ ok: true, execution: { stage: "completed", actionsPlanned: 2, actionsCompleted: 1 } }), true);
});

test("preserva idempotência de publicação realmente concluída", () => {
  assert.equal(shouldRetryCompletedCampaignPublication({
    ok: true,
    execution: {
      stage: "completed",
      actionsPlanned: 1,
      actionsCompleted: 1,
      results: [{ result: { stage: "applied" } }],
    },
  }), false);
  assert.equal(shouldRetryCompletedCampaignPublication("invalid-json"), false);
  assert.equal(shouldRetryCompletedCampaignPublication({
    ok: true,
    execution: {
      stage: "completed",
      actionsPlanned: 1,
      actionsCompleted: 1,
      results: [{ result: { stage: "needs_review", applied: { campaignCreated: false, skippedInsertions: [{ id: 2187 }] } } }],
    },
  }), false, "não repete uma mutação já aplicada apenas porque a evidência ficou pendente");
});
