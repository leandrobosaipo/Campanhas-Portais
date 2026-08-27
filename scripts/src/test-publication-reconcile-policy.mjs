import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { filterOperationalMediaCandidates, planCampaignPublicationReconciliation } from "../../ops/cloudflare-remote-runner/src/publication-reconcile-policy.mjs";

function item(overrides = {}) {
  return {
    resolutionStatus: "ready_for_publication",
    publicationStatus: "ready_for_publication",
    identityMode: "operational_identity",
    commercialIdentityStatus: "awaiting_authoritative_pi",
    resolutionReason: "Identidade operacional única; publicação depende do preflight vivo.",
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
    sheetSource: { sheetName: "AGOSTO 2026", rowNumber: 19 },
    operationalIdentity: {
      fingerprint: "a".repeat(64),
      source: {
        folderId: "folder-radar-perrengue",
        folderPath: "/PERRENGUE/AGOSTO/PI - TCE - RADAR",
        operationalMediaProfile: { groupId: 2, width: 670, height: 90, formats: ["GIF"] },
        media: [{ id: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif" }],
        destinationDocuments: [{ id: "doc-radar", name: "Destino", mimeType: "application/vnd.google-apps.document" }],
      },
    },
    adops: { campaignId: 989, insertionId: 1944, mediaUrl: null, bannerPublicadoNoSite: false },
    requiredActions: ["publish_on_site", "generate_evidence"],
    ...overrides,
  };
}

test("reconciliador cria preflight operacional para rascunho sem PI/PDF", () => {
  const plan = planCampaignPublicationReconciliation([item()], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.actions[0]?.type, "operational_media_publish");
  assert.equal(plan.actions[0]?.payload.expectedCampaignId, 989);
  assert.equal(plan.actions[0]?.payload.expectedInsertionId, 1944);
  assert.equal(plan.actions[0]?.payload.expectedPiCodigo, undefined);
  assert.deepEqual(plan.actions[0]?.payload.mediaProfile, { groupId: 2, width: 670, height: 90, formats: ["GIF"] });
});

test("Sanear video no Drive sem mediaUrl exige preflight e publicacao", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_preflight",
    publicationStatus: "ready_for_preflight",
    identityMode: null,
    siteSigla: "AFL",
    piCodigo: "3172",
    sourceIdentity: { decision: "confirmed", canonicalPi: "3172" },
    format: { normalized: "VIDEO" },
    period: { start: "2026-08-24", end: "2026-08-26" },
    drive: {
      folderId: "sanear-folder",
      folderPath: "/AFL/AGOSTO/PI 3172 - SANEAR",
      mediaStatus: "candidate_found",
      documentStatus: "candidate_found",
      mediaFiles: [{ id: "sanear-mp4", name: "SANEAR ESTIAGEM_V03.mp4", mimeType: "video/mp4", kind: "video" }],
    },
    adops: { campaignId: 1042, insertionId: 2645, mediaUrl: null, bannerPublicadoNoSite: false },
    publicationHealth: { status: "prepublication_pending", reason: "drive_media_not_linked" },
  })], "2026-08-23T12:00:00.000Z");
  assert.equal(plan.actions[0]?.type, "drive_pi_publish");
  assert.equal(plan.actions[0]?.insertionId, 2645);
  assert.equal(plan.actions[0]?.event?.driveFileId, "sanear-folder");
  assert.equal(plan.actions[0]?.event?.strictInsertionScope, true);
  assert.equal(plan.actions[0]?.event?.expectedCampaignId, 1042);
  assert.equal(plan.actions[0]?.event?.expectedInsertionId, 2645);
  assert.equal(plan.actions[0]?.event?.expectedPiCodigo, "3172");
  assert.equal(plan.actions[0]?.event?.generateEvidence, false);
});

test("Sanear video sem campanha canônica bloqueia publicação preventiva", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_preflight",
    publicationStatus: "ready_for_preflight",
    identityMode: null,
    piCodigo: "3172",
    sourceIdentity: { decision: "confirmed", canonicalPi: "3172" },
    drive: { folderId: "sanear-folder", mediaStatus: "candidate_found" },
    adops: { campaignId: 0, insertionId: 2645, mediaUrl: null, bannerPublicadoNoSite: false },
    publicationHealth: { status: "prepublication_pending", reason: "drive_media_not_linked" },
  })], "2026-08-23T12:00:00.000Z");
  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.blockers, [{
    insertionId: 2645,
    code: "prepublication_missing_canonical_campaign",
    reason: "A publicação preventiva requer campanha canônica.",
  }]);
});

test("reconciliador retoma a pasta exata quando PI/PDF já foram confirmadas", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_preflight",
    publicationStatus: "ready_for_preflight",
    identityMode: "authoritative_pi",
    piCodigo: "17420",
    sourceIdentity: { decision: "confirmed", canonicalPi: "17420" },
    drive: {
      folderId: "folder-radar-perrengue",
      folderPath: "/PERRENGUE/AGOSTO/PI 17420 - TCE - RADAR",
      mediaStatus: "candidate_found",
      documentStatus: "candidate_found",
      inventoryScanId: "scan-2",
    },
    publicationHealth: { status: "blocked_upstream", reason: "drive_media_not_linked" },
  })], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.actions[0]?.type, "drive_pi_publish");
  assert.equal(plan.actions[0]?.insertionId, 1944);
  assert.equal(plan.actions[0]?.event.driveFileId, "folder-radar-perrengue");
  assert.equal(plan.actions[0]?.event.expectedCampaignId, 989);
  assert.equal(plan.actions[0]?.event.expectedInsertionId, 1944);
  assert.equal(plan.actions[0]?.event.expectedPiCodigo, "17420");
  assert.equal(plan.actions[0]?.event.publish, true);
  assert.equal(plan.actions[0]?.event.generateEvidence, false);
  assert.equal(plan.actions[0]?.event.allowPdfInsertions, false);
  assert.equal(plan.actions[0]?.event.parsedPi.piCodigo, "17420");
  assert.equal(plan.actions[0]?.event.parsedPi.insertions[0].siteSigla, "PERRENGUE");
});

test("reconciliador publica mídia canônica já validada sem recriar campanha", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_publication",
    publicationStatus: "ready_for_publication",
    publicationHealth: { status: "blocked_upstream", reason: "drive_media_not_linked" },
    identityMode: "authoritative_pi",
    piCodigo: "17420",
    sourceIdentity: { decision: "confirmed", canonicalPi: "17420" },
    adops: { campaignId: 989, insertionId: 1944, mediaUrl: "https://cdn.perrenguematogrosso.com/radar.gif", bannerPublicadoNoSite: false },
    drive: { folderId: "folder-radar-perrengue", folderPath: "/PERRENGUE/AGOSTO/PI 17420 - TCE - RADAR", mediaStatus: "candidate_found", documentStatus: "candidate_found", inventoryScanId: "scan-2" },
  })], "2026-08-13T21:30:00.000Z");
  assert.equal(plan.actions[0]?.type, "adrotate_publish");
  assert.equal(plan.actions[0]?.insertionId, 1944);
});

test("reconciliador cria preflight composto para a inserção canônica sem exigir PI no texto do PDF", () => {
  const plan = planCampaignPublicationReconciliation([item({
    resolutionStatus: "ready_for_publication",
    publicationStatus: "ready_for_publication",
    identityMode: "sheet_drive_composite",
    piCodigo: "PI 17046 - GOV",
    sourceIdentity: { decision: "confirmed", canonicalPi: "17046" },
    adops: { campaignId: 970, insertionId: 2186, mediaUrl: null, bannerPublicadoNoSite: false },
    operationalIdentity: {
      fingerprint: "c".repeat(64),
      source: {
        expectedPiCodigo: "17046",
        folderId: "folder-17046",
        folderPath: "/PERRENGUE/AGOSTO/PI 17046 - CRIME AMBIENTAL",
        operationalMediaProfile: { groupId: 1, width: 825, height: 120, formats: ["GIF"] },
        media: [{ id: "gif-17046" }],
        pdfDocuments: [{ id: "pdf-17046" }],
        destinationDocuments: [{ id: "redirect-17046" }],
      },
    },
  })], "2026-08-14T13:40:00.000Z");
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.actions[0]?.type, "operational_media_publish");
  assert.equal(plan.actions[0]?.payload.identityMode, "sheet_drive_composite");
  assert.equal(plan.actions[0]?.payload.expectedPiCodigo, "17046");
  assert.equal(plan.actions[0]?.payload.pdfDocument.id, "pdf-17046");
});

test("reconciliador preserva destino nulo para banner informativo", () => {
  const base = item({
    identityMode: "sheet_drive_composite",
    commercialIdentityStatus: "confirmed",
    piCodigo: "PI 57687 - AFL",
    siteSigla: "AFL",
    campaignName: "FAKE NEWS",
    sourceIdentity: { decision: "confirmed", canonicalPi: "57687" },
    adops: { campaignId: 1000, insertionId: 2413, mediaUrl: null, bannerPublicadoNoSite: false },
    operationalIdentity: {
      fingerprint: "d".repeat(64),
      source: {
        expectedPiCodigo: "57687",
        folderId: "folder-57687",
        folderPath: "/AFL/AGOSTO/PI 57687 - FAKE NEWS",
        operationalMediaProfile: { groupId: 1, width: 825, height: 120, formats: ["GIF"] },
        media: [{ id: "gif-57687" }],
        pdfDocuments: [{ id: "pdf-57687" }],
        destinationDocuments: [],
      },
    },
  });
  const plan = planCampaignPublicationReconciliation([base], "2026-08-17T21:30:00.000Z");
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.actions[0].type, "operational_media_publish");
  assert.equal(plan.actions[0].payload.destinationMode, "none");
  assert.equal(plan.actions[0].payload.destinationDocument, null);
});

test("release mantém API em modo monitor e documenta o job protegido", async () => {
  const deploy = await readFile(new URL("../../ops/portainer/adops-stack/scripts/deploy-production.sh", import.meta.url), "utf8");
  const openapi = await readFile(new URL("../../lib/api-spec/openapi.yaml", import.meta.url), "utf8");
  assert.match(deploy, /\$\{DRIVE_INTEGRATION_MODE:-monitor\}/);
  assert.match(deploy, /portainer_start_container\(\)/);
  const startBeforeSmoke = deploy.indexOf("for container_name in adops-postgres adops-api adops-web");
  assert.ok(
    startBeforeSmoke >= 0 && startBeforeSmoke < deploy.indexOf("stable_checks=0"),
    "containers do stack devem iniciar antes do smoke público",
  );
  assert.match(deploy, /--connect-timeout 10 --max-time 30/);
  assert.doesNotMatch(deploy, /portainer_curl -X POST "\$\{PORTAINER_API\}\/endpoints\/\$\{ENDPOINT_ID\}\/docker\/containers\/\$\{CONTAINER_ID\}\/start"/);
  assert.match(openapi, /\/ops\/jobs\/campaign-publication-reconcile:/);
});

test("ZIP por portal respeita as datas exatas do relatório", async () => {
  const insertionRoutes = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
  const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
  assert.match(insertionRoutes, /requiredDatesByInsertion/);
  assert.match(insertionRoutes, /asOfDate/);
  assert.match(runner, /payload\.requiredDatesByInsertion/);
  assert.match(runner, /ensureInsertionCaptureCoverage\(insertion, requiredDates/);
  assert.match(runner, /operationalInsertionIds\.filter\(\(id\) => requestedInsertionIds\.includes\(Number\(id\)\)\)/);
});

test("AFL VIDEO usa MP4 validado sem compressor externo", async () => {
  const config = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
  const mapping = config.AFL.formatMappings.find((item) => item.groupId === 6);
  assert.deepEqual(mapping.operationalMediaProfile.formats, ["MP4"]);
  assert.equal(mapping.operationalMediaProfile.deliveryTransforms.MP4.mode, "passthrough");
  const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
  assert.match(runner, /transform\?\.mode === "passthrough"/);
  assert.deepEqual(filterOperationalMediaCandidates([
    { name: "SANEAR ESTIAGEM_V03.mp4", mimeType: "video/mp4" },
    { name: "estiagem_825x120.gif", mimeType: "image/gif" },
  ], ["MP4"]).map((item) => item.name), ["SANEAR ESTIAGEM_V03.mp4"]);
});

test("LATERAL operacional mantém somente a dimensão contratada", () => {
  assert.deepEqual(filterOperationalMediaCandidates([
    { name: "estiagem_380x120.gif", mimeType: "image/gif" },
    { name: "estiagem_825x120.gif", mimeType: "image/gif" },
  ], ["GIF"], { width: 380, height: 120 }).map((item) => item.name), ["estiagem_380x120.gif"]);
});
