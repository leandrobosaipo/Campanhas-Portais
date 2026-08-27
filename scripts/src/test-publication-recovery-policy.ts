import assert from "node:assert/strict";
import test from "node:test";
import { buildPendingPublicationView, resolveCompositePublicationTarget } from "../../artifacts/api-server/src/lib/campaign-evidence-export";
import { extractDrivePiCandidates } from "../../artifacts/api-server/src/lib/drive-campaign-media";

function pendingItem(overrides: Record<string, unknown> = {}) {
  return {
    campaignName: "RADAR",
    piCodigo: "PI - TCE",
    siteSigla: "PERRENGUE",
    period: { start: "2026-08-12", end: "2026-08-25", original: "12 A 25/08" },
    format: { sheet: "HOME 1", adops: "HOME 1", normalized: "HOME 1" },
    sourceIdentity: {
      decision: "insufficient_data",
      reason: "Nenhuma fonte contém um número de PI reconhecível.",
      canonicalPi: null,
    },
    drive: {
      status: "matched",
      folderId: "folder-radar-perrengue",
      folderPath: "/PERRENGUE/AGOSTO/PI - TCE - RADAR",
      mediaStatus: "candidate_found",
      documentStatus: "missing",
      mediaMatchesFormat: true,
      mediaFiles: [{ id: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:34:08.000Z", size: "65191", md5Checksum: "0123456789abcdef0123456789abcdef" }],
      textFiles: [{ id: "doc-radar", name: "Documento sem título", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-08-12T00:35:15.232Z" }],
      inventoryScanId: "scan-1",
    },
    adops: {
      status: "matched",
      operationalMatchCount: 1,
      campaignId: 989,
      insertionId: 1944,
      mediaUrl: null,
      bannerPublicadoNoSite: false,
      statusNormalizado: "rascunho",
    },
    evidence: { status: "missing", missingDates: ["2026-08-12", "2026-08-13"] },
    requiredActions: ["locate_or_upload_media", "publish_on_site", "generate_evidence"],
    blockingIssues: [],
    ...overrides,
  };
}

test("identidade operacional única libera publicação sem liberar identidade comercial", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem()],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.identityMode, "operational_identity");
  assert.equal(view.items[0]?.commercialIdentityStatus, "awaiting_authoritative_pi");
  assert.equal(view.items[0]?.publicationStatus, "ready_for_publication");
  assert.equal(view.items[0]?.resolutionStatus, "ready_for_publication");
  assert.equal(view.items[0]?.operationalIdentity.gates.sheetUnique, true);
  assert.equal(view.items[0]?.operationalIdentity.gates.mediaUnique, true);
  assert.equal(view.items[0]?.operationalIdentity.gates.destinationCandidateUnique, true);
  assert.equal(view.items[0]?.operationalIdentity.gates.approvedOperationalTarget, true);
  assert.match(view.items[0]?.operationalIdentity.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(view.items[0]?.operationalIdentity.source.media[0].md5Checksum, "0123456789abcdef0123456789abcdef");
  assert.equal(view.items[0]?.lastCheckedAt, "2026-08-13T16:30:00.000Z");
  assert.match(String(view.items[0]?.nextCheckAt), /^2026-08-14T/);
  assert.equal(view.items[0]?.resumeAction, "run_operational_preflight_and_publish");
  assert.equal(view.items[0]?.adops.insertionId, 1944);
});

test("formato VIDEO seleciona o MP4 quando a pasta também contém GIF", () => {
  const item = pendingItem({
    piCodigo: "3172",
    siteSigla: "AFL",
    campaignName: "ESTIAGEM",
    period: { start: "2026-08-24", end: "2026-08-26", original: "24/08-26/08" },
    format: { sheet: "VIDEO", adops: "Video", normalized: "VIDEO" },
    sourceIdentity: {
      decision: "confirmed",
      canonicalPi: "3172",
      sources: { sheetPi: "3172", adopsPi: "3172", driveFolderPiCandidates: ["3172"], drivePdfPiCandidates: ["3172"] },
    },
    drive: {
      status: "matched",
      folderId: "sanear-folder",
      folderPath: "/AFL/AGOSTO/PI 3172",
      mediaStatus: "candidate_found",
      documentStatus: "candidate_found",
      mediaMatchesFormat: true,
      mediaFiles: [
        { id: "sanear-mp4", name: "SANEAR ESTIAGEM_V03.mp4", mimeType: "video/mp4", size: "135285635", md5Checksum: "9cf0b171a16f614acfec65201ab8002b" },
        { id: "sanear-gif", name: "estiagem_825x120.gif", mimeType: "image/gif", size: "116645", md5Checksum: "b173753773409c92657320b7e4439d5f" },
      ],
      pdfFiles: [{ id: "pi-3172", name: "PI 3172.pdf", mimeType: "application/pdf", size: "224927", md5Checksum: "d52a0d9f1ad9f8b526bf46814455cc06" }],
      textFiles: [],
    },
    adops: { status: "matched", operationalMatchCount: 1, campaignId: 1005, insertionId: 2645, mediaUrl: null, bannerPublicadoNoSite: false, statusNormalizado: "rascunho" },
  });
  const view = buildPendingPublicationView({ date: "2026-08-26", generatedAt: "2026-08-27T06:00:00.000Z", summary: { needsPublication: 1, needsEvidence: 1 }, items: [item], upcomingItems: [] });
  assert.equal(view.items[0]?.resolutionStatus, "ready_for_publication");
  assert.equal(view.items[0]?.identityMode, "sheet_drive_composite");
  assert.deepEqual(view.items[0]?.operationalIdentity.source.media.map((file: { id: string }) => file.id), ["sanear-mp4"]);
});

test("VIDEO usa o fluxo operacional MP4 nativo nos portais sem perfil explícito", () => {
  for (const siteSigla of ["PERRENGUE", "ROO"]) {
    const target = resolveCompositePublicationTarget(siteSigla, "VIDEO");
    assert.equal(target?.groupId, 6);
    assert.deepEqual(target?.formats, ["MP4"]);
    assert.deepEqual(target?.deliveryTransforms, { MP4: { mode: "passthrough" } });
  }
});

test("nova varredura do mesmo arquivo preserva o fingerprint", () => {
  const source = pendingItem();
  const build = (inventoryScanId: string) => buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [{ ...source, drive: { ...source.drive, inventoryScanId } }],
    upcomingItems: [],
  }).items[0]?.operationalIdentity.fingerprint;
  assert.equal(build("scan-1"), build("scan-2"));
});

test("campanha publicada continua publicada quando falta somente evidência", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 0, needsEvidence: 1 },
    items: [pendingItem({
      piCodigo: "9749",
      sourceIdentity: { decision: "confirmed", reason: "Fontes concordam.", canonicalPi: "9749", sources: { drivePdfPiCandidates: ["9749"] } },
      adops: { campaignId: 1, insertionId: 1853, mediaUrl: "https://cdn.example/banner.gif", bannerPublicadoNoSite: true, statusNormalizado: "publicado" },
      drive: { mediaStatus: "candidate_found", documentStatus: "candidate_found", mediaMatchesFormat: true },
      requiredActions: ["generate_evidence"],
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "published");
  assert.equal(view.items[0]?.resumeAction, "generate_evidence");
});

test("HTML público confirmado evita republicação quando o booleano do AdOps está defasado", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 0, needsEvidence: 1 },
    items: [pendingItem({
      adops: {
        campaignId: 989,
        insertionId: 1944,
        mediaUrl: "https://cdn.example/banner.gif",
        bannerPublicadoNoSite: false,
        publicConfirmation: "confirmed",
        statusNormalizado: "rascunho",
      },
      requiredActions: ["generate_evidence"],
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.publicationStatus, "published");
  assert.equal(view.items[0]?.resumeAction, "generate_evidence");
});

test("identidade operacional ambígua não libera publicação", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({
      drive: {
        status: "matched",
        folderId: "folder-radar-perrengue",
        folderPath: "/PERRENGUE/AGOSTO/PI - TCE - RADAR",
        mediaStatus: "candidate_found",
        documentStatus: "missing",
        mediaMatchesFormat: true,
        mediaFiles: [
          { id: "gif-a", name: "670x90-a.gif", mimeType: "image/gif" },
          { id: "gif-b", name: "670x90-b.gif", mimeType: "image/gif" },
        ],
        textFiles: [{ id: "doc-radar", name: "Destino" }],
      },
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "failed_retryable");
  assert.equal(view.items[0]?.resumeAction, "retry_reconcile");
});

test("identidade operacional sem PDF usa qualquer alvo canônico único suportado, sem IDs fixos", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({ adops: { status: "matched", operationalMatchCount: 1, campaignId: 990, insertionId: 1945, mediaUrl: null, bannerPublicadoNoSite: false } })],
    upcomingItems: [],
  });
  assert.equal(view.items[0]?.publicationStatus, "ready_for_publication");
  assert.equal(view.items[0]?.operationalIdentity.gates.approvedOperationalTarget, true);
  assert.equal(view.items[0]?.adops.campaignId, 990);
  assert.equal(view.items[0]?.adops.insertionId, 1945);
});

test("PI de outro portal não é aceita como identidade comercial ou operacional", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({
      piCodigo: "17190",
      sourceIdentity: { decision: "needs_confirmation", reason: "PI pertence a outro portal.", canonicalPi: null },
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "failed_retryable");
  assert.equal(view.items[0]?.resumeAction, "retry_reconcile");
});

test("PDF cujo nome confirma a PI libera a publicação da inserção existente", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({
      piCodigo: "017191",
      sourceIdentity: { decision: "confirmed", reason: "PDF e fontes concordam.", canonicalPi: "17191", sources: { drivePdfPiCandidates: ["017191"] } },
      drive: { mediaStatus: "candidate_found", documentStatus: "candidate_found", mediaMatchesFormat: true },
      adops: { campaignId: 989, insertionId: 1944, mediaUrl: "https://cdn.example/radar.gif", bannerPublicadoNoSite: false, statusNormalizado: "rascunho" },
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "ready_for_publication");
  assert.equal(view.items[0]?.identityMode, "authoritative_pi");
  assert.equal(view.items[0]?.commercialIdentityStatus, "confirmed");
  assert.equal(view.items[0]?.resumeAction, "publish_existing_insertion");
});

test("#2693 bloqueada upstream permanece recuperável para publicar a inserção existente", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-26",
    generatedAt: "2026-08-26T16:30:00.000Z",
    summary: { needsPublication: 0, needsEvidence: 0 },
    items: [pendingItem({
      piCodigo: "17191",
      sourceIdentity: {
        decision: "confirmed",
        reason: "PDF e fontes concordam.",
        canonicalPi: "17191",
        sources: {
          drivePdfPiCandidates: ["17191"],
        },
      },
      drive: {
        status: "matched",
        folderId: "folder-2693",
        folderPath: "/PERRENGUE/AGOSTO/PI 17191",
        mediaStatus: "candidate_found",
        documentStatus: "candidate_found",
        mediaMatchesFormat: true,
        mediaFiles: [{ id: "media-2693", name: "670x90.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:00:00.000Z", size: "65191", md5Checksum: "0123456789abcdef0123456789abcdef" }],
        pdfFiles: [{ id: "pdf-2693", name: "PI 17191.pdf", mimeType: "application/pdf", size: "1000", md5Checksum: "0123456789abcdef0123456789abcdef" }],
        textFiles: [],
      },
      adops: { status: "matched", operationalMatchCount: 1, campaignId: 999, insertionId: 2693, mediaUrl: "https://cdn.example/2693.gif", bannerPublicadoNoSite: true },
      publicationHealth: { status: "blocked_upstream", reason: "expected_media_not_observed", expectedGroupId: 14 },
      evidence: { status: "complete", auditedDates: ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"], missingDates: [] },
      requiredActions: [],
    })],
    upcomingItems: [],
  });

  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.adops.insertionId, 2693);
  assert.equal(view.items[0]?.resolutionStatus, "ready_for_publication");
  assert.equal(view.items[0]?.resumeAction, "publish_existing_insertion");
  assert.deepEqual(view.items[0]?.evidence.auditedDates, ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"]);
  assert.equal(view.items[0]?.requiredActions?.includes("generate_evidence"), false);
});

test("PI numérica no Drive ignora zeros à esquerda sem alterar o valor exibido", () => {
  assert.deepEqual(extractDrivePiCandidates("/ROO/AGOSTO/PI 009749 - QUEIMADAS"), ["9749"]);
  assert.deepEqual(extractDrivePiCandidates("PI 000 - inválida"), []);
  assert.deepEqual(extractDrivePiCandidates("PI 009749 e PI 009750"), ["9749", "9750"]);
});
