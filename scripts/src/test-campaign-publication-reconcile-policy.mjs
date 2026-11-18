#!/usr/bin/env node
import assert from "node:assert/strict";
import { planCampaignPublicationReconciliation } from "../../ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs";

const base = {
  resolutionStatus: "ready_for_publication",
  identityMode: "operational_identity",
  siteSigla: "AFL",
  period: { start: "2026-08-21", end: "2026-08-31" },
  format: { normalized: "INTERNO DE NOTICIAS" },
  adops: { insertionId: 2692, campaignId: 900, mediaUrl: null },
  operationalIdentity: {
    fingerprint: "a".repeat(64),
    source: {
      media: [{ id: "media-1", md5Checksum: "b".repeat(32), size: 123, mimeType: "image/gif" }],
      destinationDocuments: [],
      pdfDocuments: [],
      operationalMediaProfile: { groupId: 1, formats: ["GIF"] },
      folderId: "folder-1",
      folderPath: "/AFL/AGOSTO/PI 91134",
    },
  },
};

const preflight = planCampaignPublicationReconciliation([base], "2026-08-21T20:00:00.000Z", { mode: "preflight" });
assert.equal(preflight.actions.length, 1);
assert.equal(preflight.actions[0].payload.mode, "preflight");

const needsAuthoritativePreflight = planCampaignPublicationReconciliation([{
  resolutionStatus: "ready_for_preflight",
  adops: { insertionId: 11, campaignId: 901, competencia: "AGOSTO/2026" },
  siteSigla: "PERRENGUE",
  period: { start: "2026-08-21", end: "2026-08-31", original: "21/08-31/08" },
  format: { sheet: "INTERNO DE NOTÍCIAS", normalized: "INTERNO DE NOTICIAS" },
  campaignName: "QUEIMADAS",
  drive: { folderId: "folder-2", folderPath: "/PERRENGUE/AGOSTO/PI 91145", documentStatus: "candidate_found" },
  sourceIdentity: { canonicalPi: "91145" },
}], "2026-08-21T20:00:00.000Z", { mode: "apply" });
assert.equal(needsAuthoritativePreflight.actions[0].event.generateEvidence, false);
assert.equal(needsAuthoritativePreflight.actions[0].event.allowPdfInsertions, false);
assert.equal(needsAuthoritativePreflight.actions[0].event.parsedPi.insertions[0].periodoInicio, "2026-08-21");
assert.equal(needsAuthoritativePreflight.actions[0].event.parsedPi.insertions[0].localFormatoNormalizado, "INTERNO DE NOTICIAS");

const withExistingMedia = planCampaignPublicationReconciliation([{ ...base, adops: { ...base.adops, mediaUrl: "https://cdn.example/banner.gif" } }], "2026-08-21T20:00:00.000Z", { mode: "apply" });
assert.equal(withExistingMedia.actions.length, 0);
assert.equal(withExistingMedia.blockers[0].code, "existing_media_requires_review");

const plainPublication = planCampaignPublicationReconciliation([{ resolutionStatus: "ready_for_publication", adops: { insertionId: 10 } }], "2026-08-21T20:00:00.000Z", { mode: "apply" });
assert.equal(plainPublication.actions[0].payload.replaceExisting, false);
assert.equal(plainPublication.actions[0].payload.generateEvidence, false);

console.log("campaign publication reconcile policy: 8/8 checks passed");
