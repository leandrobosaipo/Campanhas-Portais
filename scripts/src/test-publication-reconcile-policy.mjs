import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { planCampaignPublicationReconciliation } from "../../ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs";

function item(overrides = {}) {
  return {
    resolutionStatus: "awaiting_authoritative_pi",
    resolutionReason: "Aguardando PI/PDF autoritativa antes de publicar a inserção existente.",
    siteSigla: "PERRENGUE",
    piCodigo: "PI - TCE",
    campaignName: "RADAR",
    sourceIdentity: { decision: "insufficient_data", canonicalPi: null },
    drive: {
      folderId: "folder-radar-perrengue",
      folderPath: "/PERRENGUE/AGOSTO/PI - TCE - RADAR",
      mediaStatus: "candidate_found",
      documentStatus: "missing",
      inventoryScanId: "scan-1",
    },
    adops: { campaignId: 989, insertionId: 1944, mediaUrl: null, bannerPublicadoNoSite: false },
    requiredActions: ["publish_on_site", "generate_evidence"],
    ...overrides,
  };
}

test("reconciliador não publica rascunho sem PI/PDF", () => {
  const plan = planCampaignPublicationReconciliation([item()], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.blockers[0]?.insertionId, 1944);
  assert.equal(plan.blockers[0]?.code, "awaiting_authoritative_pi");
});

test("reconciliador retoma a pasta exata quando PI/PDF já foram confirmadas", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_preflight",
    piCodigo: "17420",
    sourceIdentity: { decision: "confirmed", canonicalPi: "17420" },
    drive: {
      folderId: "folder-radar-perrengue",
      folderPath: "/PERRENGUE/AGOSTO/PI 17420 - TCE - RADAR",
      mediaStatus: "candidate_found",
      documentStatus: "candidate_found",
      inventoryScanId: "scan-2",
    },
  })], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.actions[0]?.type, "drive_pi_publish");
  assert.equal(plan.actions[0]?.insertionId, 1944);
  assert.equal(plan.actions[0]?.event.driveFileId, "folder-radar-perrengue");
  assert.equal(plan.actions[0]?.event.expectedCampaignId, 989);
  assert.equal(plan.actions[0]?.event.expectedInsertionId, 1944);
  assert.equal(plan.actions[0]?.event.expectedPiCodigo, "17420");
  assert.equal(plan.actions[0]?.event.publish, true);
  assert.equal(plan.actions[0]?.event.generateEvidence, true);
});

test("reconciliador publica mídia canônica já validada sem recriar campanha", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_publication",
    piCodigo: "17420",
    sourceIdentity: { decision: "confirmed", canonicalPi: "17420" },
    adops: { campaignId: 989, insertionId: 1944, mediaUrl: "https://cdn.perrenguematogrosso.com/radar.gif", bannerPublicadoNoSite: false },
    drive: { folderId: "folder-radar-perrengue", folderPath: "/PERRENGUE/AGOSTO/PI 17420 - TCE - RADAR", mediaStatus: "candidate_found", documentStatus: "candidate_found", inventoryScanId: "scan-2" },
  })], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.actions[0]?.type, "adrotate_publish");
  assert.equal(plan.actions[0]?.insertionId, 1944);
});

test("release mantém API em modo monitor e documenta o job protegido", async () => {
  const deploy = await readFile(new URL("../../ops/portainer/adops-stack/scripts/deploy-production.sh", import.meta.url), "utf8");
  const openapi = await readFile(new URL("../../lib/api-spec/openapi.yaml", import.meta.url), "utf8");
  assert.match(deploy, /\$\{DRIVE_INTEGRATION_MODE:-monitor\}/);
  assert.match(openapi, /\/ops\/jobs\/campaign-publication-reconcile:/);
});
