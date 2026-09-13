import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignGuidance, campaignChecklistDefaults, isIncompleteCampaign } from "./dynamic-report-checklist.mjs";

const base = {
  status: "needs_media",
  campaignName: "CAMPANHA TESTE",
  piCodigo: "PI 123 - GOV",
  siteSigla: "OMT",
  period: { start: "2026-09-01", end: "2026-09-15" },
  format: { normalized: "MEGABANNER TOPO" },
  sourceIdentity: { decision: "confirmed" },
  canonicalSelection: { decision: "confirmed" },
  drive: { status: "not_found", mediaFiles: [], mediaMatchesFormat: false },
  adops: { status: "matched", mediaUrl: null },
  publicationHealth: { status: "blocked_upstream", expectedGroupId: 1 },
  evidenceHealth: { status: "blocked_upstream" },
  requiredActions: ["locate_or_upload_media", "publish_on_site"],
  blockingIssues: [],
};

test("identifica campanha incompleta e nao marca candidato ambiguo como confirmado", () => {
  assert.equal(isIncompleteCampaign(base), true);
  const selected = campaignChecklistDefaults({ ...base, drive: { status: "ambiguous", mediaFiles: [{ id: 1 }], mediaMatchesFormat: true } });
  assert.equal(selected.mediaReceived, false);
  assert.equal(selected.driveFileCorrect, false);
  assert.equal(selected.readyToPublish, false);
});

test("aceita arquivo unico do Drive quando identidade e formato estao confirmados", () => {
  const selected = campaignChecklistDefaults({ ...base, drive: { status: "matched", mediaFiles: [{ id: 1 }], mediaMatchesFormat: true } });
  assert.equal(selected.mediaReceived, true);
  assert.equal(selected.driveFileCorrect, true);
  assert.equal(selected.readyToPublish, true);
});

test("gera orientacao para midia ausente sem afirmar que corrigiu", () => {
  const text = buildCampaignGuidance(base, campaignChecklistDefaults(base));
  assert.match(text, /Confirmar a mídia correta e vinculá-la/);
  assert.match(text, /Orientação gerada sem alterar planilha/);
  assert.doesNotMatch(text, /foi corrigid[ao]/i);
});

test("mantem bloqueio quando pronta para publicar contradiz o checklist", () => {
  const selected = { ...campaignChecklistDefaults(base), readyToPublish: true };
  const text = buildCampaignGuidance(base, selected);
  assert.match(text, /contradiz os dados ainda não confirmados/);
  assert.match(text, /permanece bloqueada/);
});

test("orienta criacao quando campanha ainda nao existe no AdOps", () => {
  const item = { ...base, adops: { status: "missing", mediaUrl: null }, canonicalSelection: { decision: "missing" }, requiredActions: ["create_campaign_or_insertion"] };
  assert.match(buildCampaignGuidance(item, campaignChecklistDefaults(item)), /Criar ou corrigir a campanha e a inserção no AdOps/);
});

test("fonte indisponivel nao vira confirmacao de ausencia", () => {
  const selected = campaignChecklistDefaults({ ...base, drive: { status: "unavailable", mediaFiles: [], mediaMatchesFormat: false } });
  assert.equal(selected.driveFileCorrect, false);
  assert.equal(selected.mediaReceived, false);
});

test("nao lista campanha inteiramente concluida", () => {
  assert.equal(isIncompleteCampaign({ status: "ok", requiredActions: [], blockingIssues: [], publicationHealth: { status: "ok" }, evidenceHealth: { status: "complete" } }), false);
});

test("divergencias de periodo e formato nao sao pre-confirmadas", () => {
  const selected = campaignChecklistDefaults({ ...base, requiredActions: ["review_period_divergence", "review_format_divergence"] });
  assert.equal(selected.periodCorrect, false);
  assert.equal(selected.formatCorrect, false);
  assert.equal(selected.readyToPublish, false);
});
