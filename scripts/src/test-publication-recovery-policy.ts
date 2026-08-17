import assert from "node:assert/strict";
import test from "node:test";
import { buildPendingPublicationView } from "../../artifacts/api-server/src/lib/campaign-evidence-export";
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

test("PI numérica no Drive ignora zeros à esquerda sem alterar o valor exibido", () => {
  assert.deepEqual(extractDrivePiCandidates("/ROO/AGOSTO/PI 009749 - QUEIMADAS"), ["9749"]);
  assert.deepEqual(extractDrivePiCandidates("PI 000 - inválida"), []);
  assert.deepEqual(extractDrivePiCandidates("PI 009749 e PI 009750"), ["9749", "9750"]);
});
