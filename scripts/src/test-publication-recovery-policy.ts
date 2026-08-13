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
      mediaStatus: "candidate_found",
      documentStatus: "missing",
      mediaMatchesFormat: true,
    },
    adops: {
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

test("campanha com mídia candidata e sem PI/PDF aguarda identidade autoritativa", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem()],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "awaiting_authoritative_pi");
  assert.equal(view.items[0]?.resolutionReason, "Aguardando PI/PDF autoritativa antes de publicar a inserção existente.");
  assert.equal(view.items[0]?.lastCheckedAt, "2026-08-13T16:30:00.000Z");
  assert.match(String(view.items[0]?.nextCheckAt), /^2026-08-14T/);
  assert.equal(view.items[0]?.resumeAction, "await_authoritative_pi_pdf");
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

test("PI numérica sem PDF autoritativo não libera o preflight", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({
      piCodigo: "17191",
      sourceIdentity: { decision: "confirmed", reason: "Número localizado somente em fonte auxiliar.", canonicalPi: "17191" },
      drive: { mediaStatus: "candidate_found", documentStatus: "missing", mediaMatchesFormat: true },
    })],
    upcomingItems: [],
  });

  assert.equal(view.items[0]?.resolutionStatus, "failed_retryable");
  assert.equal(view.items[0]?.resumeAction, "retry_reconcile");
});

test("mídia canônica sem PDF autoritativo não libera a publicação", () => {
  const view = buildPendingPublicationView({
    date: "2026-08-13",
    generatedAt: "2026-08-13T16:30:00.000Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [pendingItem({
      piCodigo: "17191",
      sourceIdentity: { decision: "confirmed", reason: "Número localizado somente em fonte auxiliar.", canonicalPi: "17191" },
      drive: { mediaStatus: "candidate_found", documentStatus: "missing", mediaMatchesFormat: true },
      adops: { campaignId: 989, insertionId: 1944, mediaUrl: "https://cdn.example/radar.gif", bannerPublicadoNoSite: false, statusNormalizado: "rascunho" },
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
  assert.equal(view.items[0]?.resumeAction, "publish_existing_insertion");
});

test("PI numérica no Drive ignora zeros à esquerda sem alterar o valor exibido", () => {
  assert.deepEqual(extractDrivePiCandidates("/ROO/AGOSTO/PI 009749 - QUEIMADAS"), ["9749"]);
  assert.deepEqual(extractDrivePiCandidates("PI 000 - inválida"), []);
  assert.deepEqual(extractDrivePiCandidates("PI 009749 e PI 009750"), ["9749", "9750"]);
});
