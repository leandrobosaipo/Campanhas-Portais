import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://localhost/adops_publication_health_test";

const { buildSuccessfulPublicationReadbacks, classifyEvidenceHealth, classifyPublicationHealth, publicationReadbackConfirms } = await import("../../artifacts/api-server/src/lib/campaign-operations");

test("job malformado nao elimina readback valido", () => {
  const validResult = {
    execution: {
      wpCliResult: { group_id: 14 },
      expectedMedia: { mediaBasename: "91159-vira-saude.gif" },
      publicHtmlValidation: { ok: true, mediaFound: true, adFound: true },
    },
  };
  const result = buildSuccessfulPublicationReadbacks([
    { payloadJson: { insertionId: "invalido" }, resultJson: validResult },
    { payloadJson: { insertionId: 2693 }, resultJson: validResult },
  ]);
  assert.equal(result.size, 1);
  assert.equal(result.get(2693)?.groupId, 14);
});

test("readback do job confirma mídia rotativa observada no navegador", () => {
  assert.equal(publicationReadbackConfirms({
    insertionId: 2693,
    expectedGroupId: 14,
    expectedMediaBasename: "91159-vira-saude.gif",
    readback: {
      insertionId: 2693,
      groupId: 14,
      mediaBasename: "91159-vira-saude.gif",
      publicHtmlOk: true,
      mediaFound: true,
      adFound: true,
    },
  }), true);
  assert.equal(publicationReadbackConfirms({
    insertionId: 2693,
    expectedGroupId: 14,
    expectedMediaBasename: "91159-vira-saude.gif",
    readback: {
      insertionId: 2693,
      groupId: 14,
      mediaBasename: "outra.gif",
      publicHtmlOk: true,
      mediaFound: true,
      adFound: true,
    },
  }), false);
});

test("evidencia antiga nao oculta midia atual ausente", () => {
  const result = classifyPublicationHealth({
    inPeriod: true,
    mediaUrl: "https://cdn.example/vira-saude.gif",
    bannerPublicadoNoSite: true,
    expectedGroupId: 14,
    expectedMediaObserved: false,
    publicConfirmation: "reported_only",
    duplicateInsertionIds: [2714, 2779],
  });
  assert.equal(result.status, "blocked_upstream");
  assert.equal(result.reason, "expected_media_not_observed");
});

test("video no Drive sem mediaUrl bloqueia antes do periodo", () => {
  const result = classifyPublicationHealth({
    inPeriod: false,
    mediaUrl: null,
    bannerPublicadoNoSite: false,
    expectedGroupId: 6,
    expectedMediaObserved: false,
    publicConfirmation: "not_published",
    driveMediaAvailable: true,
    duplicateInsertionIds: [],
  });
  assert.equal(result.status, "prepublication_pending");
  assert.equal(result.reason, "drive_media_not_linked");
});

test("publicacao bloqueada nao invalida evidencia auditada", () => {
  const publicationHealth = classifyPublicationHealth({
    inPeriod: true,
    mediaUrl: "https://cdn.example/vira-saude.gif",
    bannerPublicadoNoSite: true,
    expectedGroupId: 14,
    expectedMediaObserved: false,
    publicConfirmation: "reported_only",
    duplicateInsertionIds: [],
  });
  const result = classifyEvidenceHealth({
    status: "approved",
    auditedDates: ["2026-08-21"],
    missingDates: [],
    invalidDates: [],
  });

  assert.equal(publicationHealth.status, "blocked_upstream");
  assert.equal(result.status, "complete");
  assert.deepEqual(result.auditedDates, ["2026-08-21"]);
});
